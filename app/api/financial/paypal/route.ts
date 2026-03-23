import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";
import { getMockPayPalTransactions } from "@/lib/paypal-mock";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditLogger.logTokenVault({
    userId: session.user.sub,
    connection: "paypal-mock",
    eventType: "TOKEN_USED",
    scopes: ["transactions:read", "reporting"],
  });

  auditLogger.log({
    userId: session.user.sub,
    action: "FETCH_PAYPAL",
    resource: "paypal_transactions",
    outcome: "SUCCESS",
    metadata: { mode: "demo", recordCount: 57 },
  });

  return Response.json({ transactions: getMockPayPalTransactions() });
}
