import { auth0 } from "@/lib/auth0";
import { runAgent } from "@/lib/agent/orchestrator";
import { getDb } from "@/lib/db";

// Autonomous monitoring: the agent runs a routine risk check without user direction
// It decides what to investigate based on what it finds
export async function POST() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub as string;

  // Run agent in monitoring mode — it autonomously decides what to check
  const result = await runAgent(
    "Routine autonomous monitoring check. Fetch latest transactions, analyze for anomalies, and assess risk.",
    userId,
    {
      sources: ["stripe", "paypal"],
      monitoringMode: true,
    }
  );

  // Store alert if risk is MEDIUM or HIGH
  if (result.risk.level !== "LOW") {
    const db = getDb();
    db.prepare(
      `INSERT INTO agent_alerts (timestamp, user_id, risk_level, risk_score, summary, anomalies, tools_used, iteration_count, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      new Date().toISOString(),
      userId,
      result.risk.level,
      result.risk.score,
      result.finalAnswer.summary,
      JSON.stringify(result.finalAnswer.anomalies),
      JSON.stringify(result.toolsUsed),
      result.iterationCount
    );
  }

  return Response.json({
    risk: result.risk,
    summary: result.finalAnswer.summary,
    anomalies: result.finalAnswer.anomalies,
    toolsUsed: result.toolsUsed,
    iterations: result.iterationCount,
    alertCreated: result.risk.level !== "LOW",
  });
}
