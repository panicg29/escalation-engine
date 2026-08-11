"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Link from "next/link";

const REQUIRED_HEADERS = ["message", "suggested_action"];
const MODEL_OPTIONS = [
  { key: "gpt4oMini", label: "OpenAI GPT-4o Mini" },
  { key: "gemini15Flash", label: "Google Gemini 2.5 Flash Lite" },
  { key: "deepseekChat", label: "DeepSeek Chat" },
  { key: "claude35Haiku", label: "Anthropic Claude 3.5 Haiku" },
];

function getFieldValue(row, fieldName) {
  if (!row || typeof row !== "object") return "";
  const match = Object.keys(row).find(
    (key) => key.trim().toLowerCase() === fieldName
  );
  if (!match) return "";
  return row[match];
}

function hasRequiredHeaders(fields = []) {
  const normalized = new Set(
    fields.map((field) => String(field || "").trim().toLowerCase())
  );
  return REQUIRED_HEADERS.every((header) => normalized.has(header));
}

function accuracyTone(accuracy) {
  if (accuracy === null || accuracy === undefined) return "text-slate-500";
  if (accuracy > 80) return "text-emerald-700";
  if (accuracy < 50) return "text-rose-700";
  return "text-amber-700";
}

function ringColor(accuracy) {
  if (accuracy === null || accuracy === undefined) return "#94a3b8";
  if (accuracy > 80) return "#059669";
  if (accuracy < 50) return "#dc2626";
  return "#d97706";
}

function DonutChart({ percentage, valueLabel, color = "#475569" }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Number(percentage || 0)));
  const strokeDasharray = `${(normalized / 100) * circumference} ${circumference}`;

  return (
    <div className="relative h-28 w-28">
      <svg className="h-28 w-28 -rotate-90">
        <circle
          cx="56"
          cy="56"
          r={radius}
          stroke="#e2e8f0"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="56"
          cy="56"
          r={radius}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-700">
        {valueLabel}
      </div>
    </div>
  );
}

export default function ComparisonPage() {
  const fileInputRef = useRef(null);

  const [selectedModels, setSelectedModels] = useState([]);
  const [fileName, setFileName] = useState("");
  const [surveyData, setSurveyData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const parsedCount = surveyData.length;
  const canAnalyze = selectedModels.length > 0 && parsedCount > 0 && !loading;

  const sortedModelStats = useMemo(() => {
    if (!report?.modelStats?.length) return [];
    return [...report.modelStats].sort((a, b) => {
      const aAcc = a.accuracyPercentage ?? -1;
      const bAcc = b.accuracyPercentage ?? -1;
      return bAcc - aAcc;
    });
  }, [report]);

  const toggleModelSelection = (key) => {
    setReport(null);
    setSelectedModels((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setReport(null);
    setSurveyData([]);
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta, errors }) => {
        if (!hasRequiredHeaders(meta?.fields || [])) {
          setError(
            `CSV is missing required headers. Expected: ${REQUIRED_HEADERS.join(", ")}`
          );
          return;
        }

        if (errors?.length) {
          setError(errors[0]?.message || "Failed to parse CSV.");
          return;
        }

        const parsedRows = data
          .map((row) => ({
            message: String(getFieldValue(row, "message") || "").trim(),
            suggested_action: String(
              getFieldValue(row, "suggested_action") || ""
            ).trim(),
          }))
          .filter(
            (row) => row.message.length > 0 && row.suggested_action.length > 0
          );

        if (!parsedRows.length) {
          setError(
            "No valid rows found. Each row must include message and suggested_action."
          );
          return;
        }

        setSurveyData(parsedRows);
      },
      error: (parseError) => {
        setError(parseError?.message || "Failed to parse CSV.");
      },
    });
  };

  const handleAnalyze = async () => {
    if (!canAnalyze) return;

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedModels,
          surveyData,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const detail = payload?.detail ? ` ${payload.detail}` : "";
        throw new Error(
          `${payload?.error || "Comparison analysis failed."}${detail}`
        );
      }

      setReport(payload);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Comparison analysis failed due to an unexpected error."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedModels([]);
    setFileName("");
    setSurveyData([]);
    setLoading(false);
    setError("");
    setReport(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Accuracy Comparison
            </h1>
            <p className="text-sm text-slate-600">
              Compare multiple model accuracies against human survey labels on common matched questions only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/benchmark"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back to Benchmark
            </Link>
            <Link
              href="/benchmark/results"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              View Stored Results
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Target Models (Select one or more)
              </label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {MODEL_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className="flex cursor-pointer items-center gap-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(option.key)}
                      onChange={() => toggleModelSelection(option.key)}
                      disabled={loading}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Accuracy is computed only on questions found in all selected model schemas.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Human Survey CSV
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                disabled={loading}
                className="block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">
                Required headers: {REQUIRED_HEADERS.join(", ")}
              </p>
              {fileName ? (
                <p className="mt-1 text-xs text-slate-600">
                  File: {fileName} | Parsed rows: {parsedCount}
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Analyzing..." : "Analyze Accuracy"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </section>

        {report ? (
          <>
            {report.stats.compared === 0 ? (
              <section className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                No common questions were found across the uploaded CSV and all selected model result schemas.
                Select different models or run benchmark for the missing questions first.
              </section>
            ) : null}

            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Uploaded Questions
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {report.stats.totalUploaded}
                </p>
              </article>

              <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Common Compared
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {report.stats.compared}
                </p>
              </article>

              <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Skipped (No Common Match)
                </p>
                <p className="mt-2 text-3xl font-semibold text-rose-700">
                  {report.stats.skippedNoCommon}
                </p>
              </article>

              <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Selected Models
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {report.stats.selectedModelCount}
                </p>
              </article>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="mb-4 text-lg font-semibold text-slate-800">
                  Coverage
                </h2>
                <div className="flex items-center gap-4">
                  <DonutChart
                    percentage={
                      report.stats.totalUploaded > 0
                        ? (report.stats.compared / report.stats.totalUploaded) * 100
                        : 0
                    }
                    valueLabel={`${report.stats.compared}/${report.stats.totalUploaded}`}
                    color="#0f172a"
                  />
                  <div className="space-y-1 text-sm text-slate-700">
                    <p>
                      Common matched questions across selected model schemas:
                      <span className="ml-1 font-semibold text-slate-900">
                        {report.stats.compared}
                      </span>
                    </p>
                    <p>
                      Questions excluded from accuracy due to missing model rows:
                      <span className="ml-1 font-semibold text-rose-700">
                        {report.stats.skippedNoCommon}
                      </span>
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="mb-4 text-lg font-semibold text-slate-800">
                  Accuracy Leaderboard
                </h2>
                <div className="space-y-4">
                  {sortedModelStats.map((model) => {
                    const accuracy = model.accuracyPercentage;
                    return (
                      <div key={model.key}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800">{model.label}</span>
                          <span className={`font-semibold ${accuracyTone(accuracy)}`}>
                            {accuracy === null ? "N/A" : `${accuracy}%`}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-200">
                          <div
                            className="h-2 rounded-full bg-slate-900"
                            style={{ width: `${accuracy || 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sortedModelStats.map((model) => (
                <article
                  key={model.key}
                  className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                >
                  <p className="text-sm font-semibold text-slate-800">{model.label}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <DonutChart
                      percentage={model.accuracyPercentage || 0}
                      valueLabel={
                        model.accuracyPercentage === null
                          ? "N/A"
                          : `${model.accuracyPercentage}%`
                      }
                      color={ringColor(model.accuracyPercentage)}
                    />
                    <div className="space-y-1 text-right text-xs text-slate-600">
                      <p>
                        Matches:
                        <span className="ml-1 font-semibold text-emerald-700">
                          {model.matched}
                        </span>
                      </p>
                      <p>
                        Mismatches:
                        <span className="ml-1 font-semibold text-rose-700">
                          {model.mismatched}
                        </span>
                      </p>
                      <p>
                        Common Base:
                        <span className="ml-1 font-semibold text-slate-800">
                          {model.comparedCommon}
                        </span>
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
