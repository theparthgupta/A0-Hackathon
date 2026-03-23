import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";
import Stripe from "stripe";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auth0 Token Vault: exchange Auth0 session for a scoped Stripe access token.
  // The token is stored securely in Token Vault — our agent never holds credentials.
  let stripeToken: string;

  try {
    const tokenResult = await auth0.getAccessTokenForConnection({
      connection: "stripe",
    });
    stripeToken = tokenResult.token;
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code;
    console.error("[Token Vault] Stripe token error:", errorCode, err);

    // User hasn't linked their Stripe account yet
    return Response.json(
      {
        error: "STRIPE_NOT_CONNECTED",
        message: "Stripe account not linked via Token Vault",
        needsConnection: true,
      },
      { status: 403 }
    );
  }

  try {
    const stripe = new Stripe(stripeToken);
    const charges = await stripe.charges.list({ limit: 50 });

    // Log Token Vault usage — token was retrieved from vault and used
    auditLogger.logTokenVault({
      userId: session.user.sub,
      connection: "stripe",
      eventType: "TOKEN_USED",
      scopes: ["read_write"],
    });

    auditLogger.log({
      userId: session.user.sub,
      action: "FETCH_STRIPE",
      resource: "stripe_charges",
      outcome: "SUCCESS",
      metadata: {
        recordCount: charges.data.length,
        tokenSource: "auth0_token_vault",
      },
    });

    return Response.json({ charges: charges.data });
  } catch (err) {
    auditLogger.log({
      userId: session.user.sub,
      action: "FETCH_STRIPE",
      resource: "stripe_charges",
      outcome: "ERROR",
      metadata: { error: String(err) },
    });
    return Response.json({ error: "Failed to fetch Stripe data" }, { status: 500 });
  }
}
