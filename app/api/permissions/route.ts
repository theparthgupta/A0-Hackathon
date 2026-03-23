import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check Stripe connection via Token Vault
  let stripeConnected = false;
  try {
    await auth0.getAccessTokenForConnection({ connection: "stripe" });
    stripeConnected = true;
  } catch {
    stripeConnected = false;
  }

  // Get token vault events from audit trail
  const tokenEvents = auditLogger.getTokenVaultEvents(session.user.sub) as Array<{
    connection: string;
    timestamp: string;
    event_type: string;
  }>;

  const lastStripeEvent = tokenEvents.find(
    (e) => e.connection === "stripe" && e.event_type === "TOKEN_USED"
  );

  auditLogger.log({
    userId: session.user.sub,
    action: "PERMISSION_VIEWED",
    resource: "permissions_dashboard",
    outcome: "SUCCESS",
  });

  return Response.json({
    connections: [
      {
        id: "stripe",
        name: "Stripe",
        status: stripeConnected ? "connected" : "disconnected",
        scopes: ["read_write"],
        lastUsed: lastStripeEvent?.timestamp ?? null,
        tokenSource: "Auth0 Token Vault",
        note: stripeConnected
          ? "Connected via Auth0 Token Vault — token securely stored"
          : "Not connected — click Connect to authorize via OAuth",
      },
      {
        id: "paypal",
        name: "PayPal",
        status: "demo",
        scopes: ["transactions:read", "reporting"],
        lastUsed: null,
        tokenSource: "Mock",
        note: "Demo mode — real PayPal OAuth not configured",
      },
    ],
  });
}
