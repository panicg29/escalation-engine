/**
 * Extract all @-mentioned Slack user IDs from message text.
 */
export function extractMentionedUserIds(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const ids = [];
  const pattern = /<@([A-Z0-9]+)(?:\|[^>]+)?>/gi;
  let match = pattern.exec(text);
  while (match) {
    const id = match[1];
    if (id && !ids.includes(id)) ids.push(id);
    match = pattern.exec(text);
  }
  return ids;
}

/** @here, @channel, or @everyone style Slack broadcast mentions */
export function hasBroadcastMention(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  return /<!(?:here|channel|everyone)(?:\|[^>]+)?>/i.test(text);
}

/** @deprecated Use extractMentionedUserIds — returns first mention only */
export function extractTargetUserId(text) {
  return extractMentionedUserIds(text)[0] || null;
}
