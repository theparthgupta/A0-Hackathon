import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditLogger.log({
    userId: session.user.sub,
    action: "PERMISSION_VIEWED",
    resource: "audit_trail",
    outcome: "SUCCESS",
  });

  const events = auditLogger.getEvents(session.user.sub);
  const tokenEvents = auditLogger.getTokenVaultEvents(session.user.sub);

  return Response.json({ events, tokenEvents });
}
