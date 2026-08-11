"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function badgeClass(action) {
  if (action === "Escalate") {
    return "bg-rose-100 text-rose-700 ring-rose-200";
  }
  if (action === "Log") {
    return "bg-amber-100 text-amber-700 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function BenchmarkResultsPage() {
  const [activeTab, setActiveTab] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);

  const loadResults = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/benchmark/results?limit=500");
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to fetch benchmark results.");
      }

      setData(payload);
      const firstDatasetKey = payload?.datasets?.[0]?.key || "";
      setActiveTab((prev) =>
        (payload?.datasets || []).some((dataset) => dataset.key === prev)
          ? prev
          : firstDatasetKey
      );
    } catch (requestError) {
      setError(
        requestError?.message || "Failed to load benchmark results preview."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  const activeDataset = useMemo(() => {
    if (!data) return null;
    return (data.datasets || []).find((dataset) => dataset.key === activeTab);
  }, [activeTab, data]);

  const openModelDeleteModal = (dataset) => {
    setConfirmModal({
      scope: "single",
      modelKey: dataset.key,
      label: dataset.label,
      schemaName: dataset.schemaName,
    });
  };

  const openAllDeleteModal = () => {
    setConfirmModal({
      scope: "all",
      modelKey: "all",
      label: "All Benchmark Schemas",
      schemaName: null,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmModal || deleteLoading) return;

    setDeleteLoading(true);
    setError("");
    setNotice("");

    try {
      const query = new URLSearchParams({
        modelKey: confirmModal.modelKey,
      });

      const response = await fetch(`/api/benchmark/results?${query}`, {
        method: "DELETE",
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to clear schema.");
      }

      setNotice(
        `${payload?.message || "Schema clear completed."} Removed ${
          payload?.totals?.totalRemoved ?? 0
        } documents.`
      );
      setConfirmModal(null);
      await loadResults();
    } catch (requestError) {
      setError(requestError?.message || "Failed to clear schema.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {confirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Confirm Schema Deletion
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {confirmModal.scope === "all"
                ? "This will permanently delete data from all benchmark schemas and related session/evaluation records. This action cannot be undone."
                : `This will permanently delete all rows from ${confirmModal.schemaName}. This action cannot be undone.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={deleteLoading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Benchmark Results
            </h1>
            <p className="text-sm text-slate-600">
              Preview saved benchmark outputs and manage model schemas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/benchmark"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back to Benchmark
            </Link>
            <button
              type="button"
              onClick={loadResults}
              disabled={loading || deleteLoading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {notice ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(data?.datasets || []).map((dataset) => (
              <button
                key={`clear-${dataset.key}`}
                type="button"
                onClick={() => openModelDeleteModal(dataset)}
                disabled={deleteLoading || loading}
                className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                Clear {dataset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={openAllDeleteModal}
              disabled={deleteLoading || loading}
              className="rounded-lg border border-rose-600 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              Clear All Schemas
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(data?.datasets || []).map((tab) => {
              const total = tab?.total ?? 0;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {tab.label} ({total})
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Loading benchmark results...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && activeDataset ? (
            <>
              <div className="mb-3 text-xs text-slate-500">
                Active schema:{" "}
                <span className="font-semibold text-slate-700">
                  {activeDataset.schemaName}
                </span>{" "}
                | Model slug:{" "}
                <span className="font-mono text-slate-700">
                  {activeDataset.modelSlug}
                </span>
              </div>

              {activeDataset.results?.length ? (
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="w-[8%] px-4 py-3">#</th>
                        <th className="w-[72%] px-4 py-3">Question</th>
                        <th className="w-[20%] px-4 py-3">Suggested Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeDataset.results.map((row, index) => (
                        <tr key={row._id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 align-top text-slate-500">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-800">
                            {row.question}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${badgeClass(
                                row.suggestedAction
                              )}`}
                            >
                              {row.suggestedAction}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No results saved yet for this model.
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
