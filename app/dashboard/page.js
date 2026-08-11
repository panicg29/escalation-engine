"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState("");

  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [loadingEvals, setLoadingEvals] = useState(false);
  const [evalError, setEvalError] = useState("");

  useEffect(() => {
    const loadSessions = async () => {
      setLoadingSessions(true);
      setSessionsError("");
      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load sessions");
        setSessions(data.sessions || []);
        if (data.sessions?.length) {
          setSelectedSessionId(data.sessions[0]._id);
        }
      } catch (err) {
        setSessionsError(err.message);
      } finally {
        setLoadingSessions(false);
      }
    };
    loadSessions();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    const loadEvaluations = async () => {
      setLoadingEvals(true);
      setEvalError("");
      try {
        const encoded = encodeURIComponent(selectedSessionId);
        const res = await fetch(`/api/sessions/${encoded}?id=${encoded}&limit=200`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load evaluations");
        setEvaluations(data.evaluations || []);
      } catch (err) {
        setEvalError(err.message);
      } finally {
        setLoadingEvals(false);
      }
    };
    loadEvaluations();
  }, [selectedSessionId]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-slate-600">Bulk runs and saved evaluations.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back to Playground
            </Link>
            <Link
              href="/benchmark"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open Benchmark
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">Sessions</div>
            {loadingSessions && <span className="text-xs text-slate-500">Loading…</span>}
          </div>
          {sessionsError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {sessionsError}
            </div>
          )}
          {!loadingSessions && !sessions.length && (
            <div className="text-sm text-slate-500">No sessions found yet.</div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {sessions.map((session) => (
              <button
                key={session._id}
                onClick={() => setSelectedSessionId(session._id)}
                className={`w-full rounded-lg border p-4 text-left shadow-sm transition hover:shadow ${
                  selectedSessionId === session._id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                  <div className="text-sm font-semibold text-slate-800">
                    {session.sessionName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(session.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {session.datasetSource || "CSV"} • {session.evaluationCount ?? 0} saved
                  </div>
                </button>
              ))}
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">
              Session Detail {selectedSessionId ? "" : "(select a session)"}
            </div>
            {loadingEvals && <span className="text-xs text-slate-500">Loading…</span>}
          </div>
          {evalError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {evalError}
            </div>
          )}
          {!loadingEvals && selectedSessionId && evaluations.length === 0 && (
            <div className="text-sm text-slate-500">No evaluations stored for this session.</div>
          )}

          {evaluations.length > 0 && (
            <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 w-[36%]">Message</th>
                    <th className="px-4 py-3 w-[12%]">Time</th>
                    <th className="px-4 py-3 w-[12%]">Expected</th>
                    <th className="px-4 py-3 w-[32%]">Model outputs</th>
                    <th className="px-4 py-3 w-[8%] text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {evaluations.map((ev) => (
                    <tr key={ev._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 align-top text-slate-800">
                        <div className="line-clamp-2" title={ev.originalMessage}>
                          {ev.originalMessage}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600">
                        {ev.timeContext || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600">
                        {ev.expectedAction || "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          {ev.modelResponses?.map((mr, idx) => (
                            <span
                              key={`${ev._id}-${idx}`}
                              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200"
                              title={`${mr.modelId || mr.modelName || "Model"} • ${mr.actionDecision || "—"} • ${mr.urgencyScore ?? "n/a"}/10`}
                            >
                              <span className="text-indigo-700">
                                {mr.modelId?.slice(0, 22) || mr.modelName?.slice(0, 22) || "Model"}
                              </span>
                              <span>{mr.actionDecision || "—"}</span>
                              <span className="text-slate-500">
                                {mr.urgencyScore !== undefined ? `${mr.urgencyScore}/10` : "n/a"}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-xs text-slate-500 whitespace-nowrap">
                        {new Date(ev.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
