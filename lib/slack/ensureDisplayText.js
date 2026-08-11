import { formatSlackMessageDisplay } from "@/lib/slack/formatMessageDisplay";
import { messageHasRawSlackTokens } from "@/lib/slack/formatMessageDisplayClient";

export async function ensureAlertDisplayText(doc, { teamId, botToken } = {}) {
  const text = doc.text || "";
  const current = doc.displayText || "";

  if (current && !messageHasRawSlackTokens(current)) {
    return current;
  }

  return formatSlackMessageDisplay(text, { teamId, botToken });
}
