"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, UserRound } from "lucide-react";
import { PillBadge } from "@/components/react-bits/PillBadge";

function UserAvatar({ user, size = "sm" }) {
  const cls = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        className={`${cls} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-[var(--sentinel-surface-inset)] font-medium text-[var(--sentinel-text-muted)]`}
    >
      {(user?.name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function WorkspaceUserPicker({
  teamId,
  label,
  description,
  icon: Icon,
  selectedIds = [],
  onChange,
  excludeIds = [],
  excludeBots = false,
  badgeVariant = "info",
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!teamId) {
      setUsers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/workspaces/users?teamId=${encodeURIComponent(teamId)}&includeBots=${excludeBots ? "false" : "true"}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load users.");
        if (!cancelled) setUsers(data.users || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, excludeBots]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const userMap = useMemo(() => {
    const map = new Map();
    for (const user of users) map.set(user.id, user);
    return map;
  }, [users]);

  const selectedUsers = useMemo(
    () =>
      selectedIds.map((id) => userMap.get(id) || { id, name: id, handle: "", isBot: false, avatar: "" }),
    [selectedIds, userMap]
  );

  const availableUsers = useMemo(() => {
    const blocked = new Set([...selectedIds, ...excludeIds]);
    return users
      .filter((user) => !blocked.has(user.id))
      .filter((user) => (excludeBots ? !user.isBot : true))
      .filter((user) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          user.name.toLowerCase().includes(q) ||
          user.handle.toLowerCase().includes(q) ||
          user.id.toLowerCase().includes(q)
        );
      });
  }, [users, selectedIds, excludeIds, excludeBots, query]);

  const addUser = useCallback(
    (userId) => {
      if (!userId || selectedIds.includes(userId)) return;
      onChange([...selectedIds, userId]);
      setQuery("");
      setOpen(false);
    },
    [onChange, selectedIds]
  );

  const removeUser = useCallback(
    (userId) => {
      onChange(selectedIds.filter((id) => id !== userId));
    },
    [onChange, selectedIds]
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="sentinel-text-primary flex items-center gap-1.5 text-sm font-medium">
          {Icon ? <Icon className="h-3.5 w-3.5 text-[var(--sentinel-text-muted)]" /> : null}
          {label}
        </p>
        {description ? (
          <p className="sentinel-text-muted mt-1 text-xs leading-relaxed">{description}</p>
        ) : null}
      </div>

      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!teamId || loading}
          className="sentinel-input flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-50"
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--sentinel-text-muted)]" />
          <span className="sentinel-text-muted flex-1 truncate">
            {loading ? "Loading workspace members…" : "Search and select a member"}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="sentinel-panel absolute z-20 mt-2 w-full overflow-hidden rounded-xl shadow-lg">
            <div className="border-b border-[var(--sentinel-border)] p-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or handle"
                className="sentinel-input w-full rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {loading ? (
                <li className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--sentinel-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading members…
                </li>
              ) : availableUsers.length === 0 ? (
                <li className="px-3 py-3 text-sm text-[var(--sentinel-text-muted)]">
                  {users.length === 0 ? "No members found." : "No matching members."}
                </li>
              ) : (
                availableUsers.slice(0, 50).map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => addUser(user.id)}
                      className="sentinel-hover flex w-full items-center gap-3 px-3 py-2 text-left"
                    >
                      <UserAvatar user={user} />
                      <span className="min-w-0 flex-1">
                        <span className="sentinel-text-primary block truncate text-sm font-medium">
                          {user.name}
                        </span>
                        <span className="sentinel-text-muted block truncate text-[11px]">
                          @{user.handle || user.id}
                          {user.isBot ? " · bot" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {selectedUsers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((user) => (
            <PillBadge
              key={user.id}
              variant={badgeVariant}
              size="sm"
              animated={false}
              showDot={false}
              className="max-w-full"
            >
              <span className="flex items-center gap-1.5">
                <UserRound className="h-3 w-3 shrink-0 opacity-70" />
                <span className="truncate">{user.name}</span>
                <button
                  type="button"
                  onClick={() => removeUser(user.id)}
                  className="opacity-70 hover:opacity-100"
                  aria-label={`Remove ${user.name}`}
                >
                  ×
                </button>
              </span>
            </PillBadge>
          ))}
        </div>
      ) : (
        <p className="sentinel-text-muted text-[11px]">No members selected.</p>
      )}
    </div>
  );
}
