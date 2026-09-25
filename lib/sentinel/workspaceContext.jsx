"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "sentinel.activeTeamId";

const WorkspaceContext = createContext({
  workspaces: [],
  activeTeamId: null,
  activeWorkspace: null,
  loading: true,
  error: null,
  setActiveTeamId: () => {},
  refreshWorkspaces: async () => {},
  connectWorkspace: () => {},
});

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeTeamId, setActiveTeamIdState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshWorkspaces = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/workspaces?activeOnly=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load workspaces.");

      const list = (data.workspaces || []).filter(
        (w) => w.connected !== false && w.status !== "inactive"
      );
      setWorkspaces(list);

      setActiveTeamIdState((prev) => {
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        const preferred = prev || stored;
        if (preferred && list.some((w) => w.teamId === preferred)) {
          return preferred;
        }
        return list[0]?.teamId || null;
      });
    } catch (err) {
      setError(err?.message || "Failed to load workspaces.");
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const setActiveTeamId = useCallback((teamId) => {
    setActiveTeamIdState(teamId);
    if (typeof window !== "undefined") {
      if (teamId) window.localStorage.setItem(STORAGE_KEY, teamId);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const connectWorkspace = useCallback(() => {
    // Stay on the origin the user is already viewing (localhost or ngrok).
    // Sending the browser to a different ngrok host shows the free "Visit Site"
    // interstitial and can drop the Slack OAuth round-trip.
    window.location.assign("/api/slack/auth");
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.teamId === activeTeamId) || null,
    [workspaces, activeTeamId]
  );

  const value = useMemo(
    () => ({
      workspaces,
      activeTeamId,
      activeWorkspace,
      loading,
      error,
      setActiveTeamId,
      refreshWorkspaces,
      connectWorkspace,
    }),
    [
      workspaces,
      activeTeamId,
      activeWorkspace,
      loading,
      error,
      setActiveTeamId,
      refreshWorkspaces,
      connectWorkspace,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
