"use client";

import { useState } from "react";
import type { RiskClassification } from "@/types/risk";
import type { SanitizedDataPacket, SanitizedInsight } from "@/types/financial";

interface AnalysisResult {
  sanitizedStats: SanitizedDataPacket;
  insight: SanitizedInsight;
  risk: RiskClassification;
  sources: { stripe: string; paypal: string };
  aiAvailable: boolean;
}

export default function AnalyzePage() {
  const [query, setQuery] = useState("Analyze last 30 days of transactions and flag anomalies");
  const [sources, setSources] = useState({ stripe: true, paypal: true });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sources: Object.entries(sources)
            .filter(([, v]) => v)
            .map(([k]) => k),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  }

  const riskColor = {
    LOW: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    MEDIUM: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    HIGH: "text-red-400 bg-red-400/10 border-red-400/30",
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Run Analysis</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Data is fetched server-side, sanitized, then analyzed locally via OpenClaw (sovereign AI gateway).
          Only statistical insights reach this page — no raw financial data.
        </p>
      </div>

      {/* Query Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-2">
            Analysis Query
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-emerald-500 transition-colors"
            rows={2}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-2">
            Data Sources
          </label>
          <div className="flex gap-3">
            {(["stripe", "paypal"] as const).map((src) => (
              <label key={src} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sources[src]}
                  onChange={(e) =>
                    setSources((prev) => ({ ...prev, [src]: e.target.checked }))
                  }
                  className="accent-emerald-500"
                />
                <span className="text-sm text-slate-300 capitalize">{src}</span>
                {src === "paypal" && (
                  <span className="text-xs text-slate-500">(demo)</span>
                )}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={runAnalysis}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Analyzing locally...
            </>
          ) : (
            "Run Analysis"
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Risk Classification */}
          <div
            className={`border rounded-xl p-5 space-y-3 ${riskColor[result.risk.level]}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">
                Risk Level: {result.risk.level}
              </h2>
              <span className="text-sm opacity-70">Score: {result.risk.score}/100</span>
            </div>
            {result.risk.reasons.length > 0 && (
              <ul className="space-y-1">
                {result.risk.reasons.map((r, i) => (
                  <li key={i} className="text-sm opacity-80 flex gap-2">
                    <span>⚠</span> {r}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">AI Analysis</h2>
              {!result.aiAvailable && (
                <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded">
                  Local AI offline — rule-based only
                </span>
              )}
            </div>
            <p className="text-slate-300 text-sm">{result.insight.summary}</p>

            {result.insight.anomalies.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Detected Anomalies
                </h3>
                <ul className="space-y-1.5">
                  {result.insight.anomalies.map((a, i) => (
                    <li key={i} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-red-400">●</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.insight.recommendations.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Recommendations
                </h3>
                <ul className="space-y-1.5">
                  {result.insight.recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-emerald-400">✓</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sanitized Stats — shows what AI actually received */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-white text-sm">
              Data Sent to AI (Sanitized — No PII)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Total Transactions", value: result.sanitizedStats.totalTransactions },
                { label: "Date Range", value: `${result.sanitizedStats.dateRange.from} → ${result.sanitizedStats.dateRange.to}` },
                { label: "Small (<$100)", value: result.sanitizedStats.amountBuckets.small },
                { label: "Medium ($100–$500)", value: result.sanitizedStats.amountBuckets.medium },
                { label: "Large (>$500)", value: result.sanitizedStats.amountBuckets.large },
                { label: "Max Tx/Hour", value: result.sanitizedStats.velocityMetrics.maxPerHour },
                { label: "Refund Ratio", value: `${Math.round(result.sanitizedStats.refundRatio * 100)}%` },
                { label: "Failure Rate", value: `${Math.round(result.sanitizedStats.failureRate * 100)}%` },
                { label: "Largest Amount", value: `~$${result.sanitizedStats.largestSingleAmount}` },
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-800/50 rounded-lg px-3 py-2">
                  <div className="text-xs text-slate-500">{stat.label}</div>
                  <div className="text-sm font-medium text-slate-200 mt-0.5">{stat.value}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              No card numbers, names, emails, or exact amounts were sent to the AI model.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
