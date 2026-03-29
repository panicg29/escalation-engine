"use client";

import { useState } from "react";

const simulatedTimes = ["Working Hours", "After Hours", "Weekend"];

export default function Home() {
  const [message, setMessage] = useState("");
  const [time, setTime] = useState(simulatedTimes[0]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState({});
  const [error, setError] = useState("");
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [errorDetail, setErrorDetail] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResults([]);
    setError("");
    setFallbackUsed(false);
    setErrorDetail("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, time }),
      });
      const data = await res.json();
      setFallbackUsed(Boolean(data.fallback));
      if (data.errorDetail) {
        setErrorDetail(data.errorDetail);
      }

      if (!res.ok || data.error) {
        setError(
          data?.error ||
            "The analyzer returned an error. Please check your API key or try again."
        );
      }

      setResults(data.results || []);
    } catch (error) {
      console.error("Failed to analyze", error);
      setError("Network or server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRating = (model, value) => {
    setRating((prev) => ({ ...prev, [model]: value }));
  };

  const submitRating = (model) => {
    alert(`Recorded "${rating[model] || "none"}" for ${model}`);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Escalation Engine Playground (Phase 1)
          </h1>
          <p className="text-sm text-slate-600">
            Compare prompt variants on a single message and simulated time.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Message
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                rows={8}
                placeholder="Paste a Slack/Email message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <label className="text-sm font-medium text-slate-700">
                    Simulated Time
                  </label>
                  <select
                    className="mt-1 w-52 rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    {simulatedTimes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                >
                  {loading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                  )}
                  Run Analysis
                </button>
              </div>
            </form>

            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-5 text-center text-sm text-slate-500">
              <div className="font-semibold text-slate-600">
                Phase 2: Upload CSV/Excel Dataset (Coming Soon)
              </div>
              <div className="mt-1 text-xs">(Dropzone disabled)</div>
            </div>
          </div>

          {/* Right column */}
          <div className="min-h-[320px] rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">
              Model Responses
            </h2>

            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <div>{error}</div>
                {errorDetail && (
                  <div className="mt-1 text-xs text-rose-700">
                    Detail: {errorDetail}
                  </div>
                )}
              </div>
            )}

            {!error && fallbackUsed && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Live model unavailable; showing fallback sample decisions.
              </div>
            )}

            {loading && (
              <div className="grid gap-3 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 h-4 w-24 rounded bg-slate-200" />
                    <div className="mb-2 h-3 w-32 rounded bg-slate-200" />
                    <div className="mb-2 h-3 w-20 rounded bg-slate-200" />
                    <div className="h-20 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            )}

            {!loading && results.length === 0 && (
              <p className="text-sm text-slate-500">
                Submit a message to see prompt comparisons.
              </p>
            )}

            {!loading && results.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((item) => (
                  <div
                    key={item.modelName}
                    className="flex h-full flex-col rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">
                          {item.modelName}
                        </span>
                        <span className="text-xs font-medium text-indigo-700">
                          {item.urgencyScore}
                        </span>
                      </div>
                      <div className="mb-1 text-sm font-medium text-slate-700">
                        Action: {item.actionDecision}
                      </div>
                      <p className="mb-4 text-sm text-slate-600">
                        {item.reasoning}
                      </p>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRating(item.modelName, "up")}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          rating[item.modelName] === "up"
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRating(item.modelName, "down")}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          rating[item.modelName] === "down"
                            ? "border-rose-500 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        👎
                      </button>
                      <button
                        type="button"
                        onClick={() => submitRating(item.modelName)}
                        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Submit Rating
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
