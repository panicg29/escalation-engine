import {
  finalizeCallEscalation,
  handleCallRinging,
  handleCallRejected,
  markCallAnswered,
} from "@/lib/services/escalationService";
import { isRejectSipCode } from "@/lib/services/twilioService";

export const dynamic = "force-dynamic";

const TERMINAL_CALLBACK_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);

function twimlResponse() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function readFormInt(formData, key) {
  const raw = formData.get(key)?.toString();
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid")?.toString();
    const callStatus = formData.get("CallStatus")?.toString();
    const sipResponseCode =
      formData.get("SipResponseCode")?.toString() ||
      formData.get("sip_response_code")?.toString() ||
      null;
    const callDuration = readFormInt(formData, "CallDuration");

    if (!callSid) {
      return twimlResponse();
    }

    console.log(
      JSON.stringify({
        source: "twilio-call-status",
        action: "callback_received",
        callSid,
        callStatus,
        sipResponseCode,
        callDuration,
      })
    );

    // Reject SIP codes (486 busy, 603 decline, 403 often causes Twilio re-dial).
    if (isRejectSipCode(sipResponseCode)) {
      await handleCallRejected({
        callSid,
        callStatus: callStatus || "busy",
        sipResponseCode,
        source: "sip_reject",
      });
      return twimlResponse();
    }

    if (callStatus === "initiated") {
      return twimlResponse();
    }

    if (callStatus === "ringing") {
      await handleCallRinging(callSid);
      return twimlResponse();
    }

    if (callStatus === "answered" || callStatus === "in-progress") {
      markCallAnswered(callSid);
      return twimlResponse();
    }

    if (callStatus === "busy") {
      await handleCallRejected({
        callSid,
        callStatus: "busy",
        sipResponseCode,
        source: "twilio_busy",
      });
      return twimlResponse();
    }

    if (!callStatus || !TERMINAL_CALLBACK_STATUSES.has(callStatus)) {
      return twimlResponse();
    }

    const doc = await finalizeCallEscalation({
      callSid,
      callStatus,
      sipResponseCode,
      callDuration,
      source: "twilio_webhook",
    });

    if (!doc) {
      console.log(
        JSON.stringify({
          source: "twilio-call-status",
          action: "call_status_ignored",
          callSid,
          callStatus,
          reason: "No matching escalating alert (already closed or poll handled it)",
        })
      );
    }

    return twimlResponse();
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "twilio-call-status",
        action: "webhook_error",
        error: error?.message || "Twilio status webhook failed",
      })
    );
    return twimlResponse();
  }
}
