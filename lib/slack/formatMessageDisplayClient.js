const MENTION_RE = /<@([A-Z0-9]+)(?:\|([^>]+))?>/gi;

export function messageHasRawSlackTokens(text) {
  if (!text) return false;
  return (
    /<@[A-Z0-9]+(?:\|[^>]+)?>/i.test(text) ||
    /<!(?:here|channel|everyone)(?:\|[^>]+)?>/i.test(text)
  );
}

export function prettifySlackMessageText(text, nameById = {}) {
  if (!text) return "";

  const out = text
    .replace(/<!here(?:\|[^>]+)?>/gi, "@here")
    .replace(/<!channel(?:\|[^>]+)?>/gi, "@channel")
    .replace(/<!everyone(?:\|[^>]+)?>/gi, "@everyone");

  return out.replace(MENTION_RE, (_, id, inlineName) => {
    const name = inlineName || nameById[id];
    return name ? `@${name}` : `<@${id}>`;
  });
}

export function buildMentionNameMap(alert) {
  const map = {};
  if (alert?.targetUserId && alert?.targetUserName) {
    map[alert.targetUserId] = alert.targetUserName;
  }
  if (alert?.userId && alert?.userName && alert.userName !== "Team member") {
    map[alert.userId] = alert.userName;
  }
  return map;
}

/** Prefer server-resolved displayText; fall back to client mention/broadcast formatting. */
export function formatAlertMessageText(alert) {
  if (!alert) return "";

  const raw = alert.text || "";
  const stored = alert.displayText || "";

  if (stored && !messageHasRawSlackTokens(stored)) {
    return stored;
  }

  return prettifySlackMessageText(stored || raw, buildMentionNameMap(alert));
}
