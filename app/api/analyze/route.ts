import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";
import { sanitizeTransactions } from "@/lib/sanitizer";
import { analyzeLocally, checkAIHealth } from "@/lib/ai-engine";
import { classifyRisk } from "@/lib/risk-engine";
import { getMockPayPalTransactions } from "@/lib/paypal-mock";
import type { RawTransaction } from "@/types/financial";
import Stripe from "stripe";

// Step-up auth: HIGH risk results require recent re-authentication
// Uses Auth0's auth_time claim to verify the user re-authenticated within STEP_UP_WINDOW
const STEP_UP_WINDOW_SECONDS = 300; // 5 minutes

function hasRecentAuth(session: { user: Record<string, unknown> }): boolean {
  const authTime = session.user.auth_time as number | undefined;
  if (!authTime) return false;
  const elapsed = Math.floor(Date.now() / 1000) - authTime;
  return elapsed < STEP_UP_WINDOW_SECONDS;
}

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const query: string = body.query ?? "Analyze recent transactions";
  const sources: string[] = body.sources ?? ["stripe", "paypal"];
  const stepUpConfirmed: boolean = body.stepUpConfirmed === true;

  // Check if local AI engine is available
  const aiAvailable = await checkAIHealth();

  let stripeTransactions: RawTransaction[] = [];
  let stripeConnected = false;
  let stripeError = "";

  // Fetch Stripe data via Auth0 Token Vault
  if (sources.includes("stripe")) {
    try {
      // Token Vault: exchange Auth0 session for scoped Stripe token
      const { token } = await auth0.getAccessTokenForConnection({
        connection: "stripe",
      });

      const stripe = new Stripe(token);

      // Fetch both charges and payment intents (charges API blocked in India)
      const [charges, paymentIntents] = await Promise.all([
        stripe.charges.list({ limit: 50 }).catch(() => ({ data: [] })),
        stripe.paymentIntents.list({ limit: 50 }).catch(() => ({ data: [] })),
      ]);

      // Map charges
      const chargesTx: RawTransaction[] = charges.data.map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        status:
          c.status === "succeeded"
            ? "succeeded" as const
            : c.status === "failed"
            ? "failed" as const
            : "pending" as const,
        created: c.created,
        source: "stripe" as const,
      }));

      // Map payment intents (avoid duplicates with charges)
      const chargeIds = new Set(charges.data.map(c => c.id));
      const piTx: RawTransaction[] = paymentIntents.data
        .filter(pi => !pi.latest_charge || !chargeIds.has(pi.latest_charge as string))
        .map((pi) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status:
            pi.status === "succeeded"
              ? "succeeded" as const
              : pi.status === "requires_payment_method" || pi.status === "canceled"
              ? "failed" as const
              : "pending" as const,
          created: pi.created,
          source: "stripe" as const,
        }));

      stripeTransactions = [...chargesTx, ...piTx];

      stripeConnected = true;

      auditLogger.logTokenVault({
        userId: session.user.sub,
        connection: "stripe",
        eventType: "TOKEN_USED",
        scopes: ["read_write"],
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Token Vault] Stripe fetch error:", errMsg);
      stripeConnected = false;
      stripeError = errMsg;
    }
  }

  // Fetch PayPal data (mock)
  const paypalTransactions: RawTransaction[] = sources.includes("paypal")
    ? getMockPayPalTransactions()
    : [];

  const allTransactions = [...stripeTransactions, ...paypalTransactions];

  if (allTransactions.length === 0) {
    // Stripe connected but no charges → still a valid demo scenario
    if (stripeConnected && stripeTransactions.length === 0) {
      return Response.json({
        sanitizedStats: {
          source: "stripe",
          totalTransactions: 0,
          dateRange: { from: "N/A", to: "N/A" },
          amountBuckets: { small: 0, medium: 0, large: 0 },
          velocityMetrics: { maxPerHour: 0, avgPerDay: 0 },
          refundRatio: 0,
          failureRate: 0,
          largestSingleAmount: 0,
        },
        insight: {
          summary: "Stripe account connected via Token Vault successfully. No charges found in this test account. Enable PayPal (demo) to see AI analysis with sample data, or create test charges in Stripe.",
          anomalies: [],
          recommendations: [
            "Create test charges in Stripe Dashboard to see real Token Vault → AI analysis flow",
            "Enable PayPal (demo data) alongside Stripe for a combined analysis demo",
          ],
        },
        risk: { level: "LOW", score: 0, reasons: [] },
        sources: {
          stripe: "connected_no_data",
          paypal: sources.includes("paypal") ? "demo_mode" : "not_selected",
        },
        aiAvailable,
      });
    }

    const detail = stripeError
      ? `Stripe Token Vault error: ${stripeError}`
      : "Connect Stripe via Token Vault or enable PayPal.";
    return Response.json(
      { error: `No data available. ${detail}` },
      { status: 400 }
    );
  }

  // Sanitize — raw data never leaves this function
  const sanitized = sanitizeTransactions(allTransactions, "combined");

  // Local AI Analysis (OpenClaw + Ollama)
  let aiInsight = {
    summary: "Local AI engine not available — rule-based analysis only.",
    anomalies: [] as string[],
    recommendations: [] as string[],
  };

  if (aiAvailable) {
    try {
      aiInsight = await analyzeLocally(sanitized, query);
    } catch (err) {
      console.error("Local AI analysis failed:", err);
    }
  }

  // Risk classification
  const risk = classifyRisk(sanitized, aiInsight.anomalies);

  // ─── Step-Up Auth Gate ────────────────────────────────────
  // HIGH risk results require recent re-authentication (max_age=0 in Auth0)
  // This prevents an attacker with a stolen session from viewing sensitive findings
  if (risk.level === "HIGH" && !hasRecentAuth(session)) {
    if (!stepUpConfirmed) {
      // Withhold detailed results — require step-up
      auditLogger.log({
        userId: session.user.sub,
        action: "STEP_UP_TRIGGERED",
        resource: sources.join(","),
        outcome: "STEP_UP_REQUIRED",
        query,
        riskLevel: risk.level,
        metadata: {
          riskScore: risk.score,
          reason: "HIGH risk analysis requires re-authentication",
          authTime: session.user.auth_time,
        },
      });

      return Response.json({
        stepUpRequired: true,
        risk: { level: risk.level, score: risk.score, reasons: [] },
        message:
          "This analysis detected HIGH risk patterns. Re-authenticate to view detailed findings.",
        sanitizedStats: sanitized,
        sources: {
          stripe: stripeConnected ? "connected" : "not_connected",
          paypal: "demo_mode",
        },
        aiAvailable,
      });
    }
    // stepUpConfirmed=true but auth_time is stale — deny
    auditLogger.log({
      userId: session.user.sub,
      action: "STEP_UP_TRIGGERED",
      resource: sources.join(","),
      outcome: "DENIED",
      query,
      riskLevel: risk.level,
      metadata: {
        riskScore: risk.score,
        reason: "Step-up claimed but auth_time is stale",
        authTime: session.user.auth_time,
      },
    });

    return Response.json({
      stepUpRequired: true,
      risk: { level: risk.level, score: risk.score, reasons: [] },
      message:
        "Re-authentication expired. Please verify your identity again.",
      sanitizedStats: sanitized,
      sources: {
        stripe: stripeConnected ? "connected" : "not_connected",
        paypal: "demo_mode",
      },
      aiAvailable,
    });
  }

  // ─── Audit + Return ──────────────────────────────────────
  const wasStepUp = risk.level === "HIGH" && hasRecentAuth(session);

  auditLogger.log({
    userId: session.user.sub,
    action: "AI_ANALYSIS",
    resource: sources.join(","),
    outcome: "SUCCESS",
    query,
    riskLevel: risk.level,
    metadata: {
      totalTransactions: sanitized.totalTransactions,
      riskScore: risk.score,
      aiUsed: aiAvailable,
      stripeConnected,
      tokenSource: "auth0_token_vault",
      stepUpVerified: wasStepUp,
    },
  });

  // Return ONLY sanitized insights — no raw financial data
  return Response.json({
    sanitizedStats: sanitized,
    insight: aiInsight,
    risk,
    sources: {
      stripe: stripeConnected ? "connected" : "not_connected",
      paypal: "demo_mode",
    },
    aiAvailable,
    stepUpVerified: wasStepUp,
  });
}
