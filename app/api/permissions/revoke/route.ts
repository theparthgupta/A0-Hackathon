import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connection: string = body.connection ?? "stripe";

  // For demo: we call Auth0 Management API to unlink the identity
  // In production, you'd use the Management API to revoke the token
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    // Simulate revocation for demo purposes
    auditLogger.logTokenVault({
      userId: session.user.sub,
      connection,
      eventType: "REVOKED",
      scopes: [],
    });

    auditLogger.log({
      userId: session.user.sub,
      action: "REVOKE_TOKEN",
      resource: connection,
      outcome: "SUCCESS",
      metadata: { mode: "demo_revocation" },
    });

    return Response.json({
      success: true,
      message: `Access to ${connection} has been revoked (demo mode)`,
      demo: true,
    });
  }

  try {
    // Get Management API access token
    const tokenRes = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience: `https://${domain}/api/v2/`,
      }),
    });

    const { access_token: mgmtToken } = await tokenRes.json();

    // Get user identities to find the connection to unlink
    const userRes = await fetch(
      `https://${domain}/api/v2/users/${encodeURIComponent(session.user.sub)}`,
      { headers: { Authorization: `Bearer ${mgmtToken}` } }
    );
    const user = await userRes.json();

    const identity = user.identities?.find(
      (id: { connection: string }) => id.connection === connection
    );

    if (identity) {
      const [provider, userId] = [identity.provider, identity.user_id];
      await fetch(
        `https://${domain}/api/v2/users/${encodeURIComponent(session.user.sub)}/identities/${provider}/${userId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${mgmtToken}` },
        }
      );
    }

    auditLogger.logTokenVault({
      userId: session.user.sub,
      connection,
      eventType: "REVOKED",
      scopes: [],
    });

    auditLogger.log({
      userId: session.user.sub,
      action: "REVOKE_TOKEN",
      resource: connection,
      outcome: "SUCCESS",
    });

    return Response.json({ success: true, message: `Access to ${connection} revoked` });
  } catch (err) {
    console.error("Revocation error:", err);
    return Response.json({ error: "Revocation failed" }, { status: 500 });
  }
}
