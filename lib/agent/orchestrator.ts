import {
  TOOL_DEFINITIONS,
  executeTool,
  initRunStore,
  getRunStore,
  clearRunStore,
} from "./tools";
import { sanitizeTransactions } from "@/lib/sanitizer";
import { classifyRisk } from "@/lib/risk-engine";
import { auditLogger } from "@/lib/audit-logger";
import type { AgentStep, AgentResult } from "./types";
import type { RiskClassification } from "@/types/risk";
import type { SanitizedDataPacket } from "@/types/financial";
import crypto from "crypto";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const OPENCLAW_BASE_URL =
  process.env.OPENCLAW_BASE_URL || "http://localhost:18789";
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY || "";

const MAX_ITERATIONS = 10;

const AGENT_SYSTEM_PROMPT = `You are an autonomous financial compliance auditor agent. You have access to tools that let you fetch data, analyze patterns, and assess risk.

YOUR WORKFLOW:
1. PLAN: First, think about what the user is asking and decide which tools you need to call and in what order.
2. GATHER: Fetch transaction data from available sources (Stripe via Auth0 Token Vault, PayPal).
3. ANALYZE: Use analysis tools to investigate specific patterns (velocity, refunds, large transactions).
4. CROSS-REFERENCE: If multiple sources are available, compare them for discrepancies.
5. ASSESS: Run risk classification to get a formal score.
6. DECIDE: Based on what you find, decide if you need deeper investigation. For example:
   - If velocity is high, also check refund patterns (fraud often correlates).
   - If large transactions are found, check if they cluster in time.
   - If one source shows anomalies, check if the other does too.
7. REPORT: Provide a final comprehensive analysis.

IMPORTANT RULES:
- Always fetch data BEFORE analyzing it. Call fetch_stripe_transactions and/or fetch_paypal_transactions first.
- Be adaptive: if an early analysis reveals something suspicious, dig deeper with additional tool calls.
- Never fabricate data — only reference numbers from tool results.
- No PII (names, card numbers, emails) will be in the data — it's pre-sanitized.
- When done analyzing, provide your final answer as a JSON object:
  {"summary": "...", "anomalies": ["...", "..."], "recommendations": ["...", "..."]}

You are NOT a fixed pipeline. You DECIDE what to investigate based on what you find.`;

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

// ─── Call Groq with tool-use support ───────────────────────────────

async function callGroqWithTools(
  messages: GroqMessage[]
): Promise<{
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}> {
  // Try OpenClaw first, then Groq direct
  const endpoints = [
    {
      url: `${OPENCLAW_BASE_URL}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_API_KEY}`,
      },
      model: "openclaw",
    },
    {
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      model: GROQ_MODEL,
    },
  ];

  for (const endpoint of endpoints) {
    if (!endpoint.headers.Authorization.replace("Bearer ", "")) continue;

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify({
          model: endpoint.model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn(`[Agent] ${endpoint.url} failed: ${response.status} ${errBody}`);
        continue;
      }

      const result = await response.json();
      const choice = result.choices?.[0]?.message;

      if (!choice) continue;

      // Check for OpenClaw rate limit in content
      if (
        choice.content &&
        (choice.content.includes("rate limit") ||
          choice.content.includes("⚠️"))
      ) {
        console.warn("[Agent] OpenClaw rate limited, trying next endpoint");
        continue;
      }

      return {
        content: choice.content,
        tool_calls: choice.tool_calls,
      };
    } catch (err) {
      console.warn(`[Agent] ${endpoint.url} error:`, err);
      continue;
    }
  }

  throw new Error("No AI endpoint available for agent");
}

// ─── Main Agent Orchestrator ───────────────────────────────────────

export async function runAgent(
  query: string,
  userId: string,
  options: {
    sources?: string[];
    monitoringMode?: boolean;
  } = {}
): Promise<AgentResult> {
  const runId = crypto.randomUUID();
  const steps: AgentStep[] = [];
  const toolsUsed = new Set<string>();

  initRunStore(runId);

  const messages: GroqMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    {
      role: "user",
      content: options.monitoringMode
        ? `[AUTONOMOUS MONITORING MODE] Run a routine risk check. Fetch the latest Stripe transactions, analyze velocity and refund patterns, and classify risk. Report any anomalies found.\n\nUser context: ${query}`
        : `User query: "${query}"\n\nAvailable data sources: ${(options.sources ?? ["stripe", "paypal"]).join(", ")}.\n\nPlan your investigation, then execute it step by step.`,
    },
  ];

  let iterations = 0;
  let finalAnswer = {
    summary: "Agent analysis incomplete.",
    anomalies: [] as string[],
    recommendations: [] as string[],
  };

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await callGroqWithTools(messages);

      // If there's thinking/content before tool calls, capture it
      if (response.content && response.tool_calls?.length) {
        steps.push({
          type: "thinking",
          content: response.content,
          timestamp: Date.now(),
        });
      }

      // No tool calls = agent is done, this is the final answer
      if (!response.tool_calls || response.tool_calls.length === 0) {
        if (response.content) {
          finalAnswer = parseAgentFinalAnswer(response.content);
          steps.push({
            type: "final_answer",
            content: response.content,
            timestamp: Date.now(),
          });
        }
        break;
      }

      // Execute tool calls
      const assistantMsg: GroqMessage = {
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      };
      messages.push(assistantMsg);

      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};

        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        toolsUsed.add(toolName);

        steps.push({
          type: "tool_call",
          tool: toolName,
          args: toolArgs,
          timestamp: Date.now(),
        });

        // Execute the tool
        const result = await executeTool(toolName, toolArgs, runId, userId);

        steps.push({
          type: "tool_result",
          tool: toolName,
          result,
          timestamp: Date.now(),
        });

        // Feed result back to LLM
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
  } catch (err) {
    console.error("[Agent] Orchestrator error:", err);
    steps.push({
      type: "final_answer",
      content: `Agent encountered an error: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: Date.now(),
    });
  }

  // If the agent used tools but never produced a final answer, build one from data
  if (
    finalAnswer.summary === "Agent analysis incomplete." &&
    toolsUsed.size > 0
  ) {
    finalAnswer = buildFallbackAnswer(runId, steps);
    steps.push({
      type: "final_answer",
      content: finalAnswer.summary,
      timestamp: Date.now(),
    });
  }

  // Build final sanitized stats from all collected data
  const store = getRunStore(runId);
  const allTransactions = store
    ? [...store.stripe, ...store.paypal]
    : [];
  const sanitizedStats: SanitizedDataPacket =
    allTransactions.length > 0
      ? sanitizeTransactions(allTransactions, "combined")
      : {
          source: "combined",
          totalTransactions: 0,
          dateRange: { from: "N/A", to: "N/A" },
          amountBuckets: { small: 0, medium: 0, large: 0 },
          velocityMetrics: { maxPerHour: 0, avgPerDay: 0 },
          refundRatio: 0,
          failureRate: 0,
          uniqueCurrencies: [],
          largestSingleAmount: 0,
        };

  // Final risk classification (uses agent's anomalies for scoring)
  const risk: RiskClassification =
    allTransactions.length > 0
      ? classifyRisk(sanitizedStats, finalAnswer.anomalies)
      : { level: "LOW", score: 0, reasons: [], aiAnomalies: [] };

  // Log to audit trail
  auditLogger.log({
    userId,
    action: "AI_ANALYSIS" as const,
    resource: Array.from(toolsUsed).join(","),
    outcome: "SUCCESS",
    query,
    riskLevel: risk.level,
    metadata: {
      totalTransactions: sanitizedStats.totalTransactions,
      riskScore: risk.score,
      toolsUsed: Array.from(toolsUsed),
      iterations,
      agentMode: options.monitoringMode ? "monitoring" : "interactive",
    },
  });

  // Clean up
  const sources: Record<string, string> = {};
  if (store) {
    sources.stripe =
      store.stripe.length > 0 ? "connected" : "not_connected";
    sources.paypal =
      store.paypal.length > 0 ? "demo_mode" : "not_selected";
  }
  clearRunStore(runId);

  return {
    steps,
    finalAnswer,
    risk,
    toolsUsed: Array.from(toolsUsed),
    iterationCount: iterations,
    sanitizedStats,
    sources,
  };
}

// ─── Fallback Answer Builder ───────────────────────────────────────
// If the LLM failed to produce a final answer (rate limit, etc),
// build one from the tool results the agent already collected

function buildFallbackAnswer(
  runId: string,
  steps: AgentStep[]
): { summary: string; anomalies: string[]; recommendations: string[] } {
  const anomalies: string[] = [];
  const recommendations: string[] = [];
  const summaryParts: string[] = [];

  for (const step of steps) {
    if (step.type !== "tool_result" || !step.result) continue;
    const r = step.result as Record<string, unknown>;

    if (step.tool === "analyze_velocity") {
      const assessment = r.velocityAssessment as string;
      summaryParts.push(
        `Velocity: max ${r.maxTransactionsInWindow} tx in ${r.windowHours}h window (${assessment})`
      );
      if (assessment !== "NORMAL") {
        anomalies.push(
          `${assessment}: ${r.maxTransactionsInWindow} transactions in ${r.windowHours}-hour window`
        );
      }
    }

    if (step.tool === "analyze_refunds") {
      const assessment = r.assessment as string;
      summaryParts.push(
        `Refunds: ${r.refundCount} refunds (${Math.round((r.refundRatio as number) * 100)}% ratio, clustering: ${r.refundClustering})`
      );
      if (assessment !== "NORMAL") {
        anomalies.push(`${assessment}`);
      }
      if ((r.maxRefundsIn24Hours as number) >= 3) {
        anomalies.push(
          `${r.maxRefundsIn24Hours} refunds clustered within 24 hours`
        );
      }
    }

    if (step.tool === "check_large_transactions") {
      if ((r.largeTransactionCount as number) > 0) {
        summaryParts.push(
          `Large transactions: ${r.largeTransactionCount} above $${r.thresholdDollars}`
        );
      }
      if (r.roundNumberWarning) {
        anomalies.push(r.roundNumberWarning as string);
      }
    }

    if (step.tool === "cross_reference_sources") {
      const discrepancies = r.discrepancies as string[];
      if (discrepancies?.length > 0) {
        anomalies.push(...discrepancies);
      }
      summaryParts.push(`Cross-reference: ${r.assessment}`);
    }

    if (step.tool === "classify_risk") {
      const signals = r.signals as string[];
      if (signals?.length > 0) {
        anomalies.push(...signals);
      }
    }
  }

  recommendations.push("Review flagged anomalies and verify transaction legitimacy");
  if (anomalies.some((a) => a.includes("velocity") || a.includes("CRITICAL"))) {
    recommendations.push("Investigate high-frequency transaction periods for potential automated abuse");
  }
  if (anomalies.some((a) => a.includes("refund"))) {
    recommendations.push("Audit refund patterns and verify refund legitimacy with customers");
  }

  return {
    summary:
      summaryParts.length > 0
        ? `Agent analyzed data using ${steps.filter((s) => s.type === "tool_call").length} tools. ` +
          summaryParts.join(". ") +
          "."
        : "Agent completed tool-based analysis. See detected anomalies below.",
    anomalies: [...new Set(anomalies)].slice(0, 8),
    recommendations: recommendations.slice(0, 5),
  };
}

// ─── Parse Final Answer ────────────────────────────────────────────

function parseAgentFinalAnswer(content: string): {
  summary: string;
  anomalies: string[];
  recommendations: string[];
} {
  // Try to find JSON in the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: String(parsed.summary ?? ""),
        anomalies: Array.isArray(parsed.anomalies)
          ? parsed.anomalies.map(String)
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.map(String)
          : [],
      };
    } catch {
      // Fall through to plain text handling
    }
  }

  // If no JSON, use the content as summary
  return {
    summary: content.slice(0, 500),
    anomalies: [],
    recommendations: [],
  };
}
