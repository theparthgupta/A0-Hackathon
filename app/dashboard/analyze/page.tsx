"use client";

import { useState, useEffect } from "react";
import type { RiskClassification } from "@/types/risk";
import type { SanitizedDataPacket, SanitizedInsight } from "@/types/financial";

interface AgentStepData {
  type: "planning" | "tool_call" | "tool_result" | "thinking" | "final_answer";
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  content?: string;
  timestamp: number;
}

interface AnalysisResult {
  sanitizedStats: SanitizedDataPacket;
  insight: SanitizedInsight;
  risk: RiskClassification;
  sources: { stripe: string; paypal: string };
  aiAvailable: boolean;
  stepUpVerified?: boolean;
  agentSteps?: AgentStepData[];
  toolsUsed?: string[];
  iterationCount?: number;
}

interface StepUpRequired {
  stepUpRequired: true;
  risk: { level: string; score: number };
  message: string;
  sanitizedStats: SanitizedDataPacket;
  agentSteps?: AgentStepData[];
  toolsUsed?: string[];
  iterationCount?: number;
}

const TOOL_ICONS: Record<string, string> = {
  fetch_stripe_transactions: "💳",
  fetch_paypal_transactions: "🅿️",
  analyze_velocity: "⚡",
  analyze_refunds: "↩️",
  check_large_transactions: "💰",
  cross_reference_sources: "🔄",
  classify_risk: "🎯",
  get_historical_alerts: "📊",
};

const TOOL_LABELS: Record<string, string> = {
  fetch_stripe_transactions: "Fetching Stripe via Token Vault",
  fetch_paypal_transactions: "Fetching PayPal Transactions",
  analyze_velocity: "Analyzing Transaction Velocity",
  analyze_refunds: "Analyzing Refund Patterns",
  check_large_transactions: "Checking Large Transactions",
  cross_reference_sources: "Cross-Referencing Sources",
  classify_risk: "Running Risk Classification",
  get_historical_alerts: "Checking Historical Alerts",
};

export default function AnalyzePage() {
  const [query, setQuery] = useState(
    "Analyze last 30 days of transactions and flag anomalies"
  );
  const [sources, setSources] = useState({ stripe: true, paypal: true });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [stepUp, setStepUp] = useState<StepUpRequired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  async function runAnalysis(stepUpConfirmed = false) {
    setLoading(true);
    setError(null);
    setResult(null);
    if (!stepUpConfirmed) setStepUp(null);
    const startTime = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startTime), 100);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sources: Object.entries(sources)
            .filter(([, v]) => v)
            .map(([k]) => k),
          stepUpConfirmed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
      } else if (data.stepUpRequired) {
        setStepUp(data as StepUpRequired);
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  // Auto-retry after step-up return
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const isStepUpReturn = params?.get("stepUp") === "true";

  const [autoRetried, setAutoRetried] = useState(false);
  if (isStepUpReturn && !autoRetried && !loading && !result) {
    setAutoRetried(true);
    runAnalysis(true);
  }

  const riskColor = {
    LOW: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    MEDIUM: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    HIGH: "text-red-400 bg-red-400/10 border-red-400/30",
  };

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          Agent Analysis
          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-normal">
            Autonomous AI Agent
          </span>
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          The agent autonomously plans its investigation, decides which tools to
          call, and adapts based on what it finds. Watch it think in real-time.
        </p>
      </div>

      {/* Query Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-2">
            What should the agent investigate?
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-emerald-500 transition-colors"
            rows={2}
            placeholder="e.g., Check for unusual refund patterns in the last week"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-2">
            Data Sources
          </label>
          <div className="flex gap-3">
            {(["stripe", "paypal"] as const).map((src) => (
              <label
                key={src}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={sources[src]}
                  onChange={(e) =>
                    setSources((prev) => ({
                      ...prev,
                      [src]: e.target.checked,
                    }))
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
          onClick={() => runAnalysis()}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Agent working... ({(elapsedMs / 1000).toFixed(1)}s)
            </>
          ) : (
            "🤖 Launch Agent"
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {/* Step-Up Auth Required */}
      {stepUp && (
        <div className="border-2 border-red-500/50 bg-red-500/5 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-2xl">🔒</span>
            </div>
            <div>
              <h2 className="font-bold text-red-400 text-lg">
                Step-Up Authentication Required
              </h2>
              <p className="text-sm text-slate-400">
                Risk Level: HIGH ({stepUp.risk.score}/100)
              </p>
            </div>
          </div>

          <p className="text-slate-300 text-sm">{stepUp.message}</p>

          {/* Show agent worked even before step-up */}
          {stepUp.toolsUsed && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-2">
                Agent completed {stepUp.iterationCount} iterations using{" "}
                {stepUp.toolsUsed.length} tools — but results are locked until
                you verify your identity:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stepUp.toolsUsed.map((tool) => (
                  <span
                    key={tool}
                    className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded"
                  >
                    {TOOL_ICONS[tool] || "🔧"} {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 text-xs text-slate-500 space-y-1">
            <p>
              <strong className="text-slate-400">Why?</strong> HIGH risk
              findings contain sensitive security insights. To prevent a stolen
              session from accessing these details, we require you to
              re-authenticate.
            </p>
            <p>
              <strong className="text-slate-400">How?</strong> Auth0 will prompt
              you to log in again (password + MFA if enabled). This sets a fresh{" "}
              <code className="text-emerald-400">auth_time</code> claim that
              proves you just verified your identity.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href={`/api/step-up?returnTo=${encodeURIComponent("/dashboard/analyze?stepUp=true")}`}
              className="bg-red-500 hover:bg-red-400 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
            >
              🔐 Verify Identity & View Results
            </a>
            <button
              onClick={() => setStepUp(null)}
              className="border border-slate-700 text-slate-400 hover:text-white px-4 py-2.5 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Agent Reasoning Steps */}
          {result.agentSteps && result.agentSteps.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  🤖 Agent Reasoning
                  <span className="text-xs text-slate-500 font-normal">
                    {result.iterationCount} iterations •{" "}
                    {result.toolsUsed?.length} tools used
                  </span>
                </h2>
              </div>
              <div className="space-y-2">
                {result.agentSteps.map((step, i) => (
                  <AgentStepRow key={i} step={step} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Risk Classification */}
          <div
            className={`border rounded-xl p-5 space-y-3 ${riskColor[result.risk.level as keyof typeof riskColor] || riskColor.LOW}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-lg">
                  Risk Level: {result.risk.level}
                </h2>
                {result.stepUpVerified && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                    🔐 Step-up verified
                  </span>
                )}
              </div>
              <span className="text-sm opacity-70">
                Score: {result.risk.score}/100
              </span>
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
            <h2 className="font-semibold text-white">Agent Findings</h2>
            <p className="text-slate-300 text-sm">{result.insight.summary}</p>

            {result.insight.anomalies.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Detected Anomalies
                </h3>
                <ul className="space-y-1.5">
                  {result.insight.anomalies.map((a, i) => (
                    <li
                      key={i}
                      className="text-sm text-slate-300 flex gap-2"
                    >
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
                    <li
                      key={i}
                      className="text-sm text-slate-300 flex gap-2"
                    >
                      <span className="text-emerald-400">✓</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sanitized Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-white text-sm">
              Data Sent to Agent (Sanitized — No PII)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                {
                  label: "Total Transactions",
                  value: result.sanitizedStats.totalTransactions,
                },
                {
                  label: "Date Range",
                  value: `${result.sanitizedStats.dateRange.from} → ${result.sanitizedStats.dateRange.to}`,
                },
                {
                  label: "Small (<$100)",
                  value: result.sanitizedStats.amountBuckets.small,
                },
                {
                  label: "Medium ($100–$500)",
                  value: result.sanitizedStats.amountBuckets.medium,
                },
                {
                  label: "Large (>$500)",
                  value: result.sanitizedStats.amountBuckets.large,
                },
                {
                  label: "Max Tx/Hour",
                  value: result.sanitizedStats.velocityMetrics.maxPerHour,
                },
                {
                  label: "Refund Ratio",
                  value: `${Math.round(result.sanitizedStats.refundRatio * 100)}%`,
                },
                {
                  label: "Failure Rate",
                  value: `${Math.round(result.sanitizedStats.failureRate * 100)}%`,
                },
                {
                  label: "Largest Amount",
                  value: `~$${result.sanitizedStats.largestSingleAmount}`,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-slate-800/50 rounded-lg px-3 py-2"
                >
                  <div className="text-xs text-slate-500">{stat.label}</div>
                  <div className="text-sm font-medium text-slate-200 mt-0.5">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              No card numbers, names, emails, or exact amounts were sent to the
              AI agent.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Step Row Component ──────────────────────────────────────

function AgentStepRow({
  step,
  index,
}: {
  step: AgentStepData;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === "tool_call") {
    return (
      <div className="flex items-start gap-2 group">
        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs shrink-0 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {TOOL_ICONS[step.tool || ""] || "🔧"}
            </span>
            <span className="text-sm text-blue-300 font-medium">
              {TOOL_LABELS[step.tool || ""] || step.tool}
            </span>
          </div>
          {step.args && Object.keys(step.args).length > 0 && (
            <div className="text-xs text-slate-600 mt-0.5 font-mono">
              {JSON.stringify(step.args)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === "tool_result") {
    return (
      <div className="ml-8 mb-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
        >
          <span>{expanded ? "▼" : "▶"}</span>
          Result from {step.tool}
        </button>
        {expanded && (
          <pre className="text-xs text-slate-600 bg-slate-800/50 rounded p-2 mt-1 overflow-x-auto max-h-40 overflow-y-auto">
            {JSON.stringify(step.result, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  if (step.type === "thinking") {
    return (
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs shrink-0 mt-0.5">
          💭
        </div>
        <p className="text-sm text-purple-300/80 italic">{step.content}</p>
      </div>
    );
  }

  if (step.type === "final_answer") {
    return (
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs shrink-0 mt-0.5">
          ✅
        </div>
        <span className="text-sm text-emerald-400">
          Agent completed analysis
        </span>
      </div>
    );
  }

  return null;
}
