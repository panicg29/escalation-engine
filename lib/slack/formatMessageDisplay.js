import { extractMentionedUserIds } from "@/lib/slack/extractTargetUser";
import { resolveSlackUserNames } from "@/lib/slack/resolveUser";

const MENTION_RE = /<@([A-Z0-9]+)(?:\|([^>]+))?>/gi;

/**
 * Replace Slack mention tokens with human-readable @names for UI display.
 */
export async function formatSlackMessageDisplay(text, { teamId = null, botToken = null } = {}) {
  if (typeof text !== "string" || !text.trim()) return text || "";

  let out = text
    .replace(/<!here(?:\|[^>]+)?>/gi, "@here")
    .replace(/<!channel(?:\|[^>]+)?>/gi, "@channel")
    .replace(/<!everyone(?:\|[^>]+)?>/gi, "@everyone");

  const ids = extractMentionedUserIds(text);
  if (!ids.length) return out;

  const nameById = new Map();
  
  // Separate users that have inline names vs those that need API resolution  
  const usersToResolve = [];
  for (const id of ids) {
    const inline = text.match(new RegExp(`<@${id}\\|([^>]+)>`, "i"));
    if (inline?.[1]) {
      nameById.set(id, inline[1]);
    } else {
      usersToResolve.push(id);
    }
  }
  
  // Batch resolve all users that need API calls (major performance improvement)
  if (usersToResolve.length > 0) {
    const resolvedNames = await resolveSlackUserNames(usersToResolve, { teamId, botToken });
    for (const id of usersToResolve) {
      const resolved = resolvedNames[id] || "Team member";
      nameById.set(id, resolved === "Team member" ? id : resolved);
    }
  }

  return out.replace(MENTION_RE, (_, id) => {
    const name = nameById.get(id);
    return name ? `@${name}` : `<@${id}>`;
  });
}
