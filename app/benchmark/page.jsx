"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Link from "next/link";

const CHUNK_SIZE = 5;
const CHUNK_RETRY_LIMIT = 2;
const RETRY_BACKOFF_BASE_MS = 1200;
const INTER_CHUNK_DELAY_MS = 900;
const MESSAGE_HEADERS = ["message", "question"];
const MODEL_OPTIONS = [
  {
    key: "gpt4oMini",
    label: "OpenAI GPT-4o Mini",
    modelSlug: "openai/gpt-4o-mini",
  },
  {
    key: "gemini15Flash",
    label: "Google Gemini 2.5 Flash Lite",
    modelSlug: "google/gemini-2.5-flash-lite",
  },
  {
    key: "deepseekChat",
    label: "DeepSeek Chat",
    modelSlug: "deepseek/deepseek-chat",
  },
  {
    key: "claude35Haiku",
    label: "Anthropic Claude 3.5 Haiku",
    modelSlug: "anthropic/claude-3.5-haiku",
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasSupportedMessageHeader(metaFields = []) {
  const fieldSet = new Set(
    metaFields.map((field) => String(field || "").trim().toLowerCase())
  );
  return MESSAGE_HEADERS.some((header) => fieldSet.has(header));
}

function getFieldValue(row, fieldName) {
  if (!row || typeof row !== "object") return "";
  const matchedKey = Object.keys(row).find(
    (key) => key.trim().toLowerCase() === fieldName
  );
  if (!matchedKey) return "";
  return row[matchedKey];
}

export default function BenchmarkPage() {
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [processedCount, setProcessedCount] = useState(0);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [processingNote, setProcessingNote] = useState("");
  const [resumeState, setResumeState] = useState(null);

  const isFatalCsvError = (parseError) => {
    const type = String(parseError?.type || "").toLowerCase();
    const code = String(parseError?.code || "").toLowerCase();
    if (type === "delimiter" || code === "undetectabledelimiter") {
      return false;
    }
    return true;
  };

  const totalCount = rows.length;
  const canResume =
    status === "error" &&
    processedCount > 0 &&
    processedCount < totalCount &&
    resumeState?.modelKey === selectedModel &&
    resumeState?.totalRows === totalCount;

  const progressPercent = useMemo(() => {
    if (!totalCount) return 0;
    return Math.round((processedCount / totalCount) * 100);
  }, [processedCount, totalCount]);

  const resetState = () => {
    setRows([]);
    setProcessedCount(0);
    setStatus("idle");
    setError("");
    setProcessingNote("");
    setResumeState(null);
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    resetState();
    setFileName(file.name);
    setStatus("parsing");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta, errors }) => {
        if (!hasSupportedMessageHeader(meta?.fields || [])) {
          setStatus("error");
          setError(
            "CSV is missing required headers. Expected at least one of: message, question"
          );
          return;
        }

        const fatalErrors = (errors || []).filter(isFatalCsvError);

        if (fatalErrors.length) {
          setStatus("error");
          setError(fatalErrors[0]?.message || "Failed to parse CSV.");
          return;
        }

        const parsedRows = data
          .map((row) => ({
            message: String(
              getFieldValue(row, "message") || getFieldValue(row, "question") || ""
            ).trim(),
          }))
          .filter((row) => row.message.length > 0);

        if (!parsedRows.length) {
          setStatus("error");
          setError(
            "No valid rows found. Each row must include a non-empty message or question."
          );
          return;
        }

        setRows(parsedRows);
        setStatus("ready");
      },
      error: (parseError) => {
        setStatus("error");
        setError(parseError?.message || "Failed to parse CSV.");
      },
    });
  };

  const processDataset = async ({ resume = false } = {}) => {
    if (!rows.length || status === "processing") return;
    if (!selectedModel) {
      setStatus("error");
      setError("Please select a benchmark model before processing.");
      return;
    }

    if (resume && !canResume) {
      setStatus("error");
      setError(
        "Resume checkpoint is not available for the current file/model selection."
      );
      return;
    }

    const startIndex = resume ? processedCount : 0;

    setStatus("processing");
    setError("");
    setProcessingNote("");
    if (!resume) {
      setProcessedCount(0);
      setResumeState({
        modelKey: selectedModel,
        totalRows: rows.length,
      });
    }

    try {
      let lastProcessedCount = startIndex;

      for (let i = startIndex; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        let chunkSucceeded = false;
        let lastChunkError = null;

        for (let attempt = 0; attempt <= CHUNK_RETRY_LIMIT; attempt += 1) {
          try {
            const response = await fetch("/api/benchmark", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                selectedModel,
                rows: chunk.map((item) => ({
                  message: item.message,
                })),
              }),
            });

            const payload = await response.json();
            if (!response.ok || !payload?.success) {
              const detail = payload?.detail ? ` ${payload.detail}` : "";
              throw new Error(
                `${payload?.error || "Chunk processing failed."}${detail}`
              );
            }

            chunkSucceeded = true;
            setProcessingNote("");
            break;
          } catch (chunkError) {
            lastChunkError = chunkError;
            if (attempt < CHUNK_RETRY_LIMIT) {
              const waitMs = RETRY_BACKOFF_BASE_MS * (attempt + 1);
              setProcessingNote(
                `Retrying chunk ${chunkNumber} (${attempt + 1}/${CHUNK_RETRY_LIMIT}) after transient model/provider limit...`
              );
              await sleep(waitMs);
            }
          }
        }

        if (!chunkSucceeded) {
          throw new Error(
            `Chunk ${chunkNumber} failed after ${CHUNK_RETRY_LIMIT + 1} attempts: ${
              lastChunkError?.message || "Unknown chunk error."
            }`
          );
        }

        lastProcessedCount = Math.min(i + chunk.length, rows.length);
        setProcessedCount(lastProcessedCount);

        if (i + CHUNK_SIZE < rows.length) {
          await sleep(INTER_CHUNK_DELAY_MS);
        }
      }

      setStatus("done");
      setProcessingNote("");
      setResumeState(null);
    } catch (requestError) {
      setStatus("error");
      setProcessingNote("");
      const baseError =
        requestError?.message ||
        "Processing failed before all chunks were submitted.";
      setError(
        Math.max(processedCount, startIndex) > 0
          ? `${baseError} You can resume from the last successful chunk.`
          : baseError
      );
    }
  };

  const clearAll = () => {
    resetState();
    setFileName("");
    setSelectedModel("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      {status === "processing" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/5 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white/85 px-6 py-5 shadow-lg ring-1 ring-slate-200">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-700" />
            <div className="text-sm font-semibold text-slate-800">
              Running benchmark processing...
            </div>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Benchmark Runner
            </h1>
            <p className="text-sm text-slate-600">
              Upload CSV and process it against one selected OpenRouter model.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back to Home
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open Dashboard
            </Link>
            <Link
              href="/benchmark/results"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              View Results
            </Link>
          </div>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              CSV Upload
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleCsvUpload}
              disabled={status === "processing"}
              className="block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-slate-500">
              Required header: message or question
            </p>
            {fileName ? (
              <p className="mt-2 text-xs text-slate-600">Selected: {fileName}</p>
            ) : null}
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Benchmark Model (Required)
            </label>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={status === "processing"}
              className="block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            >
              <option value="">Select one model</option>
              {MODEL_OPTIONS.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Dataset is processed by one selected model at a time.
            </p>
            {selectedModel ? (
              <p className="mt-1 text-xs text-slate-600">
                Active model:{" "}
                {
                  MODEL_OPTIONS.find((model) => model.key === selectedModel)
                    ?.modelSlug
                }
              </p>
            ) : null}
          </div>

          <div className="mb-4 h-2 w-full rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mb-4 text-sm text-slate-700">
            {totalCount > 0
              ? `Processed ${processedCount} / ${totalCount} questions`
              : "Upload a CSV file to begin"}
          </div>

          {processingNote ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {processingNote}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {status === "done" ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Benchmark completed successfully for {totalCount} questions.{" "}
              <Link href="/benchmark/results" className="font-semibold underline">
                Open results preview
              </Link>
              .
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={processDataset}
              disabled={
                status === "processing" || totalCount === 0 || !selectedModel
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {status === "processing" ? "Processing..." : "Process Dataset"}
            </button>
            <button
              type="button"
              onClick={() => processDataset({ resume: true })}
              disabled={status === "processing" || !canResume}
              className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
            >
              Resume from Last Chunk
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={status === "processing"}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </section>
        </div>
      </main>
    </>
  );
}
