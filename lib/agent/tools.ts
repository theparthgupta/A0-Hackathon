import { auth0 } from "@/lib/auth0";
import { sanitizeTransactions } from "@/lib/sanitizer";
import { classifyRisk } from "@/lib/risk-engine";
import { auditLogger } from "@/lib/audit-logger";
import { getDb } from "@/lib/db";
import type { RawTransaction, SanitizedDataPacket } from "@/types/financial";
import type { ToolDefinition } from "./types";
import Stripe from "stripe";

// ─── Server-side transaction store (never sent to LLM) ────────────
// Keyed by runId — raw data stays in memory, only sanitized stats go to AI
const transactionStore = new Map<
  string,
  {
    stripe: RawTransaction[];
    paypal: RawTransaction[];
  }
>();

export function initRunStore(runId: string) {
  transactionStore.set(runId, { stripe: [], paypal: [] });
}

export function getRunStore(runId: string) {
  return transactionStore.get(runId);
}

export function clearRunStore(runId: string) {
  transactionStore.delete(runId);
}

// ─── Tool Definitions (sent to Groq for function calling) ──────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "fetch_stripe_transactions",
      description:
        "Fetch recent transactions from the user's connected Stripe account via Auth0 Token Vault. Returns sanitized statistical summary (no PII). Use this when you need Stripe transaction data.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max transactions to fetch (default 50, max 100)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_paypal_transactions",
      description:
        "Fetch recent transactions from the user's PayPal account. Returns sanitized statistical summary. Use this to get PayPal data for analysis.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max transactions to fetch (default 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_velocity",
      description:
        "Analyze transaction velocity patterns for a specific time window. Detects spikes in transaction frequency that may indicate fraud or automated abuse.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["stripe", "paypal", "all"],
            description: "Which data source to analyze",
          },
          window_hours: {
            type: "number",
            description:
              "Time window in hours to check (default 1). Smaller windows detect sharper spikes.",
          },
        },
        required: ["source"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_refunds",
      description:
        "Deep analysis of refund patterns. Checks refund clustering, refund-to-transaction ratio, and refund timing patterns.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["stripe", "paypal", "all"],
            description: "Which data source to analyze",
          },
        },
        required: ["source"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_large_transactions",
      description:
        "Find and analyze transactions above a dollar threshold. Returns count, sanitized summary of amounts (rounded), and timing patterns of large transactions.",
      parameters: {
        type: "object",
        properties: {
          threshold_dollars: {
            type: "number",
            description: "Dollar threshold (e.g. 500 for transactions > $500)",
          },
          source: {
            type: "string",
            enum: ["stripe", "paypal", "all"],
            description: "Which data source to check (default: all)",
          },
        },
        required: ["threshold_dollars"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cross_reference_sources",
      description:
        "Compare transaction patterns across Stripe and PayPal to find discrepancies. Detects if one source has anomalies the other doesn't, suggesting targeted fraud.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "classify_risk",
      description:
        "Run the risk scoring engine on accumulated data. Returns a risk level (LOW/MEDIUM/HIGH), numerical score 0-100, and specific risk signals. Call this after gathering data to get a final risk assessment.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["stripe", "paypal", "all"],
            description: "Which data to score (default: all)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_historical_alerts",
      description:
        "Query past agent monitoring runs and their risk levels from the audit trail. Useful to compare current findings with historical patterns.",
      parameters: {
        type: "object",
        properties: {
          days_back: {
            type: "number",
            description: "How many days of history to check (default 7)",
          },
        },
        required: [],
      },
    },
  },
];

// ─── Tool Implementations ──────────────────────────────────────────

function getTransactions(
  runId: string,
  source: "stripe" | "paypal" | "all"
): RawTransaction[] {
  const store = transactionStore.get(runId);
  if (!store) return [];
  if (source === "all") return [...store.stripe, ...store.paypal];
  return store[source];
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  runId: string,
  userId: string
): Promise<unknown> {
  const store = transactionStore.get(runId);
  if (!store) return { error: "No active analysis run" };

  switch (toolName) {
    case "fetch_stripe_transactions":
      return fetchStripeTransactions(store, args, userId);

    case "fetch_paypal_transactions":
      return fetchPayPalTransactions(store, args, userId);

    case "analyze_velocity":
      return analyzeVelocity(runId, args);

    case "analyze_refunds":
      return analyzeRefunds(runId, args);

    case "check_large_transactions":
      return checkLargeTransactions(runId, args);

    case "cross_reference_sources":
      return crossReferenceSources(runId);

    case "classify_risk":
      return classifyRiskTool(runId, args);

    case "get_historical_alerts":
      return getHistoricalAlerts(userId, args);

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Individual Tool Functions ─────────────────────────────────────

async function fetchStripeTransactions(
  store: { stripe: RawTransaction[]; paypal: RawTransaction[] },
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  try {
    const { token } = await auth0.getAccessTokenForConnection({
      connection: "stripe",
    });

    const stripe = new Stripe(token);
    const limit = Math.min(Number(args.limit) || 50, 100);

    const [charges, paymentIntents] = await Promise.all([
      stripe.charges.list({ limit }).catch(() => ({ data: [] })),
      stripe.paymentIntents.list({ limit }).catch(() => ({ data: [] })),
    ]);

    const chargesTx: RawTransaction[] = charges.data.map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      status:
        c.status === "succeeded"
          ? ("succeeded" as const)
          : c.status === "failed"
          ? ("failed" as const)
          : ("pending" as const),
      created: c.created,
      source: "stripe" as const,
    }));

    const chargeIds = new Set(charges.data.map((c) => c.id));
    const piTx: RawTransaction[] = paymentIntents.data
      .filter(
        (pi) =>
          !pi.latest_charge || !chargeIds.has(pi.latest_charge as string)
      )
      .map((pi) => ({
        id: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        status:
          pi.status === "succeeded"
            ? ("succeeded" as const)
            : pi.status === "requires_payment_method" ||
              pi.status === "canceled"
            ? ("failed" as const)
            : ("pending" as const),
        created: pi.created,
        source: "stripe" as const,
      }));

    store.stripe = [...chargesTx, ...piTx];

    auditLogger.logTokenVault({
      userId,
      connection: "stripe",
      eventType: "TOKEN_USED",
      scopes: ["read_write"],
    });

    const sanitized = sanitizeTransactions(store.stripe, "stripe");
    return {
      success: true,
      connection: "token_vault",
      transactionCount: store.stripe.length,
      sanitizedStats: sanitized,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
      hint: "Stripe may not be connected via Token Vault. User should connect on the Permissions page.",
    };
  }
}

async function fetchPayPalTransactions(
  store: { stripe: RawTransaction[]; paypal: RawTransaction[] },
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  // PayPal mock data — in production, this would use Token Vault like Stripe
  const { getMockPayPalTransactions } = await import("@/lib/paypal-mock");
  const limit = Math.min(Number(args.limit) || 50, 100);
  const allTx = getMockPayPalTransactions();
  store.paypal = allTx.slice(0, limit);

  auditLogger.log({
    userId,
    action: "FETCH_PAYPAL",
    resource: "paypal",
    outcome: "SUCCESS",
    metadata: { transactionCount: store.paypal.length, mode: "demo" },
  });

  const sanitized = sanitizeTransactions(store.paypal, "paypal");
  return {
    success: true,
    connection: "demo_mode",
    transactionCount: store.paypal.length,
    sanitizedStats: sanitized,
  };
}

function analyzeVelocity(
  runId: string,
  args: Record<string, unknown>
): unknown {
  const source = (args.source as string) || "all";
  const windowHours = Number(args.window_hours) || 1;
  const transactions = getTransactions(
    runId,
    source as "stripe" | "paypal" | "all"
  );

  if (transactions.length === 0) {
    return {
      error: "No transactions loaded for this source. Fetch data first.",
    };
  }

  const windowMs = windowHours * 3600 * 1000;
  const timestamps = transactions
    .map((t) => t.created * 1000)
    .sort((a, b) => a - b);

  // Sliding window velocity
  let maxInWindow = 0;
  let peakWindowStart = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const windowEnd = timestamps[i] + windowMs;
    const count = timestamps.filter(
      (t) => t >= timestamps[i] && t < windowEnd
    ).length;
    if (count > maxInWindow) {
      maxInWindow = count;
      peakWindowStart = timestamps[i];
    }
  }

  // Hourly distribution
  const hourBuckets: Record<number, number> = {};
  for (const ts of timestamps) {
    const hour = new Date(ts).getHours();
    hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
  }

  const peakHour = Object.entries(hourBuckets).sort(
    ([, a], [, b]) => b - a
  )[0];

  return {
    source,
    windowHours,
    totalTransactions: transactions.length,
    maxTransactionsInWindow: maxInWindow,
    peakWindowStart: new Date(peakWindowStart).toISOString(),
    peakHourOfDay: peakHour
      ? { hour: Number(peakHour[0]), count: peakHour[1] }
      : null,
    velocityAssessment:
      maxInWindow > 10
        ? "CRITICAL — possible automated attack"
        : maxInWindow > 5
        ? "ELEVATED — unusual frequency"
        : "NORMAL",
  };
}

function analyzeRefunds(
  runId: string,
  args: Record<string, unknown>
): unknown {
  const source = (args.source as string) || "all";
  const transactions = getTransactions(
    runId,
    source as "stripe" | "paypal" | "all"
  );

  if (transactions.length === 0) {
    return { error: "No transactions loaded. Fetch data first." };
  }

  const refunds = transactions.filter(
    (t) => t.status === "refunded" || t.amount < 0
  );
  const totalAmount = transactions.reduce(
    (s, t) => s + Math.abs(t.amount),
    0
  );
  const refundAmount = refunds.reduce((s, t) => s + Math.abs(t.amount), 0);

  // Check refund clustering (multiple refunds within 24h)
  const refundTimestamps = refunds
    .map((t) => t.created * 1000)
    .sort((a, b) => a - b);
  let maxRefundsIn24h = 0;
  for (let i = 0; i < refundTimestamps.length; i++) {
    const windowEnd = refundTimestamps[i] + 86400000;
    const count = refundTimestamps.filter(
      (t) => t >= refundTimestamps[i] && t < windowEnd
    ).length;
    if (count > maxRefundsIn24h) maxRefundsIn24h = count;
  }

  return {
    source,
    totalTransactions: transactions.length,
    refundCount: refunds.length,
    refundRatio: Math.round((refunds.length / transactions.length) * 100) / 100,
    refundAmountRatio:
      totalAmount > 0
        ? Math.round((refundAmount / totalAmount) * 100) / 100
        : 0,
    maxRefundsIn24Hours: maxRefundsIn24h,
    refundClustering:
      maxRefundsIn24h >= 5
        ? "HIGH — multiple refunds clustered together"
        : maxRefundsIn24h >= 3
        ? "MODERATE — some refund clustering"
        : "LOW",
    assessment:
      refunds.length / transactions.length > 0.2
        ? "CRITICAL — refund ratio exceeds 20%"
        : refunds.length / transactions.length > 0.1
        ? "ELEVATED — refund ratio above 10%"
        : "NORMAL",
  };
}

function checkLargeTransactions(
  runId: string,
  args: Record<string, unknown>
): unknown {
  const thresholdDollars = Number(args.threshold_dollars) || 500;
  const source = (args.source as string) || "all";
  const transactions = getTransactions(
    runId,
    source as "stripe" | "paypal" | "all"
  );

  if (transactions.length === 0) {
    return { error: "No transactions loaded. Fetch data first." };
  }

  const thresholdCents = thresholdDollars * 100;
  const large = transactions.filter(
    (t) => Math.abs(t.amount) >= thresholdCents
  );

  // Timing analysis of large transactions
  const largeDates = large
    .map((t) => ({
      date: new Date(t.created * 1000).toISOString().split("T")[0],
      amountRounded: Math.round(Math.abs(t.amount) / 100 / 10) * 10, // rounded to $10
      status: t.status,
      source: t.source,
    }));

  // Check for round-number amounts (potential structuring)
  const roundAmounts = large.filter(
    (t) => Math.abs(t.amount) % 10000 === 0
  ).length;

  return {
    source,
    thresholdDollars,
    totalTransactions: transactions.length,
    largeTransactionCount: large.length,
    largeTransactionPercentage:
      Math.round((large.length / transactions.length) * 100) + "%",
    largeTransactions: largeDates.slice(0, 10), // Cap at 10 for readability
    roundNumberCount: roundAmounts,
    roundNumberWarning:
      roundAmounts > 2
        ? "WARNING — multiple round-number large transactions may indicate structuring"
        : null,
    largestAmountRounded:
      large.length > 0
        ? "$" +
          Math.round(
            Math.max(...large.map((t) => Math.abs(t.amount))) / 100 / 10
          ) *
            10
        : null,
  };
}

function crossReferenceSources(runId: string): unknown {
  const store = transactionStore.get(runId);
  if (!store) return { error: "No active run" };

  if (store.stripe.length === 0 && store.paypal.length === 0) {
    return {
      error: "No data from either source. Fetch from Stripe and PayPal first.",
    };
  }

  const stripeStats =
    store.stripe.length > 0
      ? sanitizeTransactions(store.stripe, "stripe")
      : null;
  const paypalStats =
    store.paypal.length > 0
      ? sanitizeTransactions(store.paypal, "paypal")
      : null;

  const discrepancies: string[] = [];

  if (stripeStats && paypalStats) {
    // Compare velocity
    if (
      Math.abs(
        stripeStats.velocityMetrics.maxPerHour -
          paypalStats.velocityMetrics.maxPerHour
      ) > 5
    ) {
      discrepancies.push(
        `Velocity discrepancy: Stripe max ${stripeStats.velocityMetrics.maxPerHour}/hr vs PayPal max ${paypalStats.velocityMetrics.maxPerHour}/hr`
      );
    }

    // Compare refund ratios
    if (Math.abs(stripeStats.refundRatio - paypalStats.refundRatio) > 0.1) {
      discrepancies.push(
        `Refund ratio discrepancy: Stripe ${Math.round(stripeStats.refundRatio * 100)}% vs PayPal ${Math.round(paypalStats.refundRatio * 100)}%`
      );
    }

    // Compare failure rates
    if (Math.abs(stripeStats.failureRate - paypalStats.failureRate) > 0.1) {
      discrepancies.push(
        `Failure rate discrepancy: Stripe ${Math.round(stripeStats.failureRate * 100)}% vs PayPal ${Math.round(paypalStats.failureRate * 100)}%`
      );
    }

    // Compare large transaction proportions
    const stripelargeRatio =
      stripeStats.amountBuckets.large / stripeStats.totalTransactions;
    const paypalLargeRatio =
      paypalStats.amountBuckets.large / paypalStats.totalTransactions;
    if (Math.abs(stripelargeRatio - paypalLargeRatio) > 0.15) {
      discrepancies.push(
        `Large transaction proportion differs significantly between sources`
      );
    }
  }

  return {
    stripeStats: stripeStats
      ? {
          transactions: stripeStats.totalTransactions,
          velocity: stripeStats.velocityMetrics.maxPerHour,
          refundRatio: stripeStats.refundRatio,
          failureRate: stripeStats.failureRate,
          largestAmount: stripeStats.largestSingleAmount,
        }
      : "not_fetched",
    paypalStats: paypalStats
      ? {
          transactions: paypalStats.totalTransactions,
          velocity: paypalStats.velocityMetrics.maxPerHour,
          refundRatio: paypalStats.refundRatio,
          failureRate: paypalStats.failureRate,
          largestAmount: paypalStats.largestSingleAmount,
        }
      : "not_fetched",
    discrepancies,
    discrepancyCount: discrepancies.length,
    assessment:
      discrepancies.length >= 3
        ? "HIGH CONCERN — multiple cross-source anomalies"
        : discrepancies.length >= 1
        ? "MODERATE — some differences between sources"
        : "CONSISTENT — sources show similar patterns",
  };
}

function classifyRiskTool(
  runId: string,
  args: Record<string, unknown>
): unknown {
  const source = (args.source as string) || "all";
  const transactions = getTransactions(
    runId,
    source as "stripe" | "paypal" | "all"
  );

  if (transactions.length === 0) {
    return { error: "No transactions loaded. Fetch data first." };
  }

  const sanitized = sanitizeTransactions(
    transactions,
    source === "all" ? "combined" : (source as "stripe" | "paypal")
  );

  // Run risk engine without AI anomalies (those come from the agent's own analysis)
  const risk = classifyRisk(sanitized, []);

  return {
    source,
    riskLevel: risk.level,
    riskScore: risk.score,
    signals: risk.reasons,
    thresholds: {
      HIGH: ">=55",
      MEDIUM: ">=25",
      LOW: "<25",
    },
  };
}

function getHistoricalAlerts(
  userId: string,
  args: Record<string, unknown>
): unknown {
  const daysBack = Number(args.days_back) || 7;
  const db = getDb();

  const cutoff = new Date(
    Date.now() - daysBack * 86400000
  ).toISOString();

  const recentAnalyses = db
    .prepare(
      `SELECT timestamp, action, risk_level, outcome, metadata
       FROM audit_events
       WHERE user_id = ? AND action IN ('AI_ANALYSIS', 'AGENT_ANALYSIS') AND timestamp > ?
       ORDER BY timestamp DESC LIMIT 20`
    )
    .all(userId, cutoff) as Array<{
      timestamp: string;
      action: string;
      risk_level: string;
      outcome: string;
      metadata: string;
    }>;

  let alerts: unknown[] = [];
  try {
    alerts = db
      .prepare(
        `SELECT timestamp, risk_level, risk_score, summary, dismissed
         FROM agent_alerts
         WHERE user_id = ? AND timestamp > ?
         ORDER BY timestamp DESC LIMIT 10`
      )
      .all(userId, cutoff);
  } catch {
    // Table may not exist yet
  }

  return {
    daysBack,
    recentAnalyses: recentAnalyses.map((a) => ({
      timestamp: a.timestamp,
      riskLevel: a.risk_level,
      outcome: a.outcome,
    })),
    alerts,
    totalAnalyses: recentAnalyses.length,
    highRiskCount: recentAnalyses.filter((a) => a.risk_level === "HIGH").length,
  };
}
