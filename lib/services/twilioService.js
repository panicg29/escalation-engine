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

  if (!targetPhone) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_skipped",
        reason: "Missing target phone number",
      })
    );
    return { ok: false, error: "Target phone not configured" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_skipped",
        reason: "Missing NEXT_PUBLIC_APP_URL for statusCallback",
      })
    );
    return { ok: false, error: "App URL not configured for call status webhook" };
  }

  const preview = escapeXml((alertText || "No preview available").slice(0, 300));
  const twiml = `<Response><Say voice="alice">Sentinel Alert. You have an urgent unacknowledged message in Slack. Message preview: ${preview}. Please check your workspace immediately.</Say></Response>`;

  const ringTimeoutSec = Number.parseInt(process.env.CALL_DURATION || "60", 10);
  const timeout = Number.isFinite(ringTimeoutSec) && ringTimeoutSec > 0 ? ringTimeoutSec : 60;

  try {
    const call = await client.calls.create({
      from: fromNumber,
      to: targetPhone,
      twiml,
      timeout,
      statusCallback: `${appUrl}/api/twilio/call-status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    console.log(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_triggered",
        callSid: call.sid,
        to: targetPhone,
        timeout,
      })
    );

    return { ok: true, callSid: call.sid };
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "twilio-service",
        action: "voice_escalation_failed",
        to: targetPhone,
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
 * SIP codes that mean the callee rejected / is busy.
 * 403 often causes Twilio carrier failover (re-ring) — we cancel to stop that.
 */
export function isRejectSipCode(sipResponseCode) {
  const code = Number.parseInt(String(sipResponseCode || ""), 10);
  return code === 403 || code === 486 || code === 600 || code === 603;
}
