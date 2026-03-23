import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";
import { runAgent } from "@/lib/agent/orchestrator";

// Step-up auth: HIGH risk results require recent re-authentication
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

  // Run the autonomous agent
  const result = await runAgent(query, session.user.sub as string, {
    sources,
  });

  // ─── Step-Up Auth Gate ────────────────────────────────────
  if (result.risk.level === "HIGH" && !hasRecentAuth(session)) {
    if (!stepUpConfirmed) {
      auditLogger.log({
        userId: session.user.sub as string,
        action: "STEP_UP_TRIGGERED",
        resource: sources.join(","),
        outcome: "STEP_UP_REQUIRED",
        query,
        riskLevel: result.risk.level,
        metadata: {
          riskScore: result.risk.score,
          reason: "HIGH risk analysis requires re-authentication",
          authTime: session.user.auth_time,
        },
      });

      return Response.json({
        stepUpRequired: true,
        risk: { level: result.risk.level, score: result.risk.score, reasons: [] },
        message:
          "This analysis detected HIGH risk patterns. Re-authenticate to view detailed findings.",
        sanitizedStats: result.sanitizedStats,
        // Show agent steps even for step-up (proves the agent worked)
        agentSteps: result.steps.map((s) => ({
          type: s.type,
          tool: s.tool,
          timestamp: s.timestamp,
        })),
        toolsUsed: result.toolsUsed,
        iterationCount: result.iterationCount,
        sources: result.sources,
      });
    }

    // stepUpConfirmed but auth_time stale
    auditLogger.log({
      userId: session.user.sub as string,
      action: "STEP_UP_TRIGGERED",
      resource: sources.join(","),
      outcome: "DENIED",
      query,
      riskLevel: result.risk.level,
      metadata: {
        riskScore: result.risk.score,
        reason: "Step-up claimed but auth_time is stale",
        authTime: session.user.auth_time,
      },
    });

    return Response.json({
      stepUpRequired: true,
      risk: { level: result.risk.level, score: result.risk.score, reasons: [] },
      message: "Re-authentication expired. Please verify your identity again.",
      sanitizedStats: result.sanitizedStats,
      sources: result.sources,
    });
  }

  // ─── Return Full Agent Results ─────────────────────────────
  const wasStepUp = result.risk.level === "HIGH" && hasRecentAuth(session);

  return Response.json({
    sanitizedStats: result.sanitizedStats,
    insight: result.finalAnswer,
    risk: result.risk,
    sources: result.sources,
    aiAvailable: true,
    stepUpVerified: wasStepUp,
    // Agent-specific fields
    agentSteps: result.steps,
    toolsUsed: result.toolsUsed,
    iterationCount: result.iterationCount,
  });
}
