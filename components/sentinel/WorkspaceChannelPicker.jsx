"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Hash, Loader2, Lock, Search } from "lucide-react";
import { PillBadge } from "@/components/react-bits/PillBadge";

export function WorkspaceChannelPicker({
  teamId,
  label,
  description,
  icon: Icon,
  selectedIds = [],
  onChange,
  excludeIds = [],
  badgeVariant = "info",
  emptyLabel = "No channels selected.",
}) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!teamId) {
      setChannels([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/workspaces/channels?teamId=${encodeURIComponent(teamId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load channels.");
        if (!cancelled) setChannels(data.channels || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load channels.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const channelMap = useMemo(() => {
    const map = new Map();
    for (const channel of channels) map.set(channel.id, channel);
    return map;
  }, [channels]);

  const selectedChannels = useMemo(
    () =>
      selectedIds.map(
        (id) =>
          channelMap.get(id) || {
            id,
            name: id,
            isPrivate: false,
            numMembers: null,
          }
      ),
    [selectedIds, channelMap]
  );

  const availableChannels = useMemo(() => {
    const blocked = new Set([...selectedIds, ...excludeIds]);
    return channels
      .filter((channel) => !blocked.has(channel.id))
      .filter((channel) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          channel.name.toLowerCase().includes(q) ||
          channel.id.toLowerCase().includes(q)
        );
      });
  }, [channels, selectedIds, excludeIds, query]);

  const addChannel = useCallback(
    (channelId) => {
      if (!channelId || selectedIds.includes(channelId)) return;
      onChange([...selectedIds, channelId]);
      setQuery("");
      setOpen(false);
    },
    [onChange, selectedIds]
  );

  const removeChannel = useCallback(
    (channelId) => {
      onChange(selectedIds.filter((id) => id !== channelId));
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
            {loading ? "Loading workspace channels…" : "Search and select a channel"}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="sentinel-panel absolute z-20 mt-2 w-full overflow-hidden rounded-xl shadow-lg">
            <div className="border-b border-[var(--sentinel-border)] p-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by channel name"
                className="sentinel-input w-full rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {loading ? (
                <li className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--sentinel-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading channels…
                </li>
              ) : availableChannels.length === 0 ? (
                <li className="px-3 py-3 text-sm text-[var(--sentinel-text-muted)]">
                  {channels.length === 0 ? "No channels found." : "No matching channels."}
                </li>
              ) : (
                availableChannels.slice(0, 50).map((channel) => (
                  <li key={channel.id}>
                    <button
                      type="button"
                      onClick={() => addChannel(channel.id)}
                      className="sentinel-hover flex w-full items-center gap-3 px-3 py-2 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--sentinel-surface-inset)] text-[var(--sentinel-text-muted)]">
                        {channel.isPrivate ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : (
                          <Hash className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="sentinel-text-primary block truncate text-sm font-medium">
                          #{channel.name}
                        </span>
                        <span className="sentinel-text-muted block truncate text-[11px]">
                          {channel.isPrivate ? "Private" : "Public"}
                          {channel.numMembers != null ? ` · ${channel.numMembers} members` : ""}
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

      {selectedChannels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedChannels.map((channel) => (
            <PillBadge
              key={channel.id}
              variant={badgeVariant}
              size="sm"
              animated={false}
              showDot={false}
              className="max-w-full"
            >
              <span className="flex items-center gap-1.5">
                {channel.isPrivate ? (
                  <Lock className="h-3 w-3 shrink-0 opacity-70" />
                ) : (
                  <Hash className="h-3 w-3 shrink-0 opacity-70" />
                )}
                <span className="truncate">#{channel.name}</span>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.id)}
                  className="opacity-70 hover:opacity-100"
                  aria-label={`Remove #${channel.name}`}
                >
                  ×
                </button>
              </span>
            </PillBadge>
          ))}
        </div>
      ) : (
        <p className="sentinel-text-muted text-[11px]">{emptyLabel}</p>
      )}
    </div>
  );
}
