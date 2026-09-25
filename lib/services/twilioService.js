import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function maskPhone(phone) {
  const value = String(phone || "");
  if (value.length < 6) return "***";
  return `${value.slice(0, 4)}…${value.slice(-3)}`;
}

/**
 * Twilio requires E.164. Local numbers like 017XXXXXXXX never ring reliably.
 */
export function toE164Phone(raw, defaultCountryCode = process.env.TWILIO_DEFAULT_COUNTRY_CODE || "880") {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (hasPlus) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.replace(/^00/, "")}`;

  const cc = String(defaultCountryCode).replace(/\D/g, "") || "880";
  if (digits.startsWith(cc) && digits.length >= cc.length + 6) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    return `+${cc}${digits.replace(/^0+/, "")}`;
  }
  if (cc === "880" && /^1\d{9}$/.test(digits)) {
    return `+880${digits}`;
  }
  if (digits.length === 10 && cc === "1") {
    return `+1${digits}`;
  }
  return `+${digits}`;
}

/**
 * Place an outbound voice call with inline TwiML text-to-speech.
 */
export async function triggerVoiceEscalation(targetPhone, alertText) {
  if (!client) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_skipped",
        reason: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN",
      })
    );
    return { ok: false, error: "Twilio client not configured" };
  }

  if (!fromNumber) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_skipped",
        reason: "Missing TWILIO_PHONE_NUMBER",
      })
    );
    return { ok: false, error: "Twilio from number not configured" };
  }

  const to = toE164Phone(targetPhone);
  if (!to) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_skipped",
        reason: "Missing or invalid target phone number",
        raw: targetPhone ? "present" : "empty",
      })
    );
    return { ok: false, error: "Target phone not configured" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const webhookReachable =
    Boolean(appUrl) && !/localhost|127\.0\.0\.1/i.test(appUrl);

  const preview = escapeXml((alertText || "No preview available").slice(0, 220));
  const twiml = `<Response><Say voice="woman">Sentinel alert. Check Slack now. ${preview}</Say></Response>`;

  const requestedTimeout = Number.parseInt(
    process.env.TWILIO_RING_TIMEOUT_SEC || "20",
    10
  );
  const timeout = Number.isFinite(requestedTimeout)
    ? Math.min(20, Math.max(15, requestedTimeout))
    : 20;

  const from = toE164Phone(fromNumber) || fromNumber;

  try {
    const params = {
      from,
      to,
      twiml,
      timeout,
    };

    if (webhookReachable) {
      params.statusCallback = `${appUrl}/api/twilio/call-status`;
      params.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
      params.statusCallbackMethod = "POST";
    } else {
      console.warn(
        JSON.stringify({
          source: "twilio-service",
          action: "status_callback_skipped",
          reason: appUrl
            ? "NEXT_PUBLIC_APP_URL is localhost; Twilio cannot reach it"
            : "NEXT_PUBLIC_APP_URL missing; placing call without status webhooks",
        })
      );
    }

    const call = await client.calls.create(params);

    console.log(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_triggered",
        callSid: call.sid,
        to: maskPhone(to),
        timeout,
        statusCallback: Boolean(webhookReachable),
      })
    );

    return { ok: true, callSid: call.sid, to };
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_failed",
        to: maskPhone(to),
        error: error?.message || "Twilio call failed",
      })
    );
    return { ok: false, error: error?.message || "Twilio call failed" };
  }
}

const TERMINAL_CALL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);

/**
 * Fetch live call status (+ duration) from Twilio REST API.
 */
export async function fetchCallStatus(callSid) {
  if (!client || !callSid) return null;
  try {
    const call = await client.calls(callSid).fetch();
    return {
      status: call.status || null,
      duration: Number.parseInt(String(call.duration ?? ""), 10),
      sipResponseCode: call.sipResponseCode || null,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "fetch_call_status_failed",
        callSid,
        error: error?.message || "Failed to fetch call status",
      })
    );
    return null;
  }
}

export function isTerminalCallStatus(status) {
  return TERMINAL_CALL_STATUSES.has(status);
}

/**
 * Force-cancel an in-progress/ringing call via Twilio REST.
 * Used when the carrier signals reject (or retries) so the phone stops re-ringing.
 */
export async function cancelTwilioCall(callSid) {
  if (!client || !callSid) {
    return { ok: false, error: "Twilio client or callSid missing" };
  }

  try {
    const call = await client.calls(callSid).update({ status: "canceled" });
    console.log(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_call_canceled",
        callSid,
        status: call.status,
      })
    );
    return { ok: true, status: call.status };
  } catch (error) {
    // Already finished calls reject cancel — that is fine.
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_call_cancel_failed",
        callSid,
        error: error?.message || "Failed to cancel Twilio call",
      })
    );
    return { ok: false, error: error?.message || "Failed to cancel Twilio call" };
  }
}

/**
 * SIP codes that mean the callee actually rejected / is busy.
 * Do not include 403 — intermediate carriers emit it during routing.
 */
export function isRejectSipCode(sipResponseCode) {
  const code = Number.parseInt(String(sipResponseCode || ""), 10);
  return code === 486 || code === 600 || code === 603;
}
