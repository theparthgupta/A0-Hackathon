import { auth0 } from "@/lib/auth0";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const alerts = db
    .prepare(
      `SELECT * FROM agent_alerts WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20`
    )
    .all(session.user.sub as string);

  return Response.json({ alerts });
}

// Dismiss an alert
export async function PATCH(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { alertId } = await request.json().catch(() => ({ alertId: null }));
  if (!alertId) {
    return Response.json({ error: "Missing alertId" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    `UPDATE agent_alerts SET dismissed = 1 WHERE id = ? AND user_id = ?`
  ).run(alertId, session.user.sub as string);

  return Response.json({ success: true });
}
