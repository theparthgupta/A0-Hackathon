import { auth0 } from "@/lib/auth0";
import { auditLogger } from "@/lib/audit-logger";

export async function GET(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.redirect(new URL("/auth/login", request.url));
  }

  const url = new URL(request.url);
  const connectCode = url.searchParams.get("connect_code");
  // auth_session comes from our cookie (set during initiation)
  const cookies = request.headers.get("cookie") ?? "";
  const authSessionMatch = cookies.match(/stripe_auth_session=([^;]+)/);
  const authSessionParam = authSessionMatch ? authSessionMatch[1] : null;

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  const refreshToken = session.tokenSet?.refreshToken;

  if (!refreshToken) {
    return Response.json(
      { error: "No refresh token. Log out and back in." },
      { status: 400 }
    );
  }

  // Get My Account API access token
  const tokenRes = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      audience: `https://${domain}/me/`,
      scope: "create:me:connected_accounts",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return Response.json(
      { error: "Token exchange failed", detail: tokenData },
      { status: 500 }
    );
  }

  const myAccountToken = tokenData.access_token;

  // STEP 2: If we have a connect_code, complete the connection
  if (connectCode && authSessionParam) {
    const completeRes = await fetch(
      `https://${domain}/me/v1/connected-accounts/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${myAccountToken}`,
        },
        body: JSON.stringify({
          auth_session: authSessionParam,
          connect_code: connectCode,
          redirect_uri: `${process.env.APP_BASE_URL}/api/connect-stripe`,
        }),
      }
    );

    const completeData = await completeRes.json();

    if (completeRes.ok) {
      auditLogger.logTokenVault({
        userId: session.user.sub,
        connection: "stripe",
        eventType: "CONNECTED",
        scopes: completeData.scopes ?? ["read_write"],
      });

      auditLogger.log({
        userId: session.user.sub,
        action: "FETCH_STRIPE",
        resource: "stripe_connection",
        outcome: "SUCCESS",
        metadata: {
          connectionId: completeData.id,
          tokenSource: "auth0_token_vault",
        },
      });

      // Redirect to permissions page on success
      return Response.redirect(
        new URL("/dashboard/permissions?connected=stripe", request.url)
      );
    }

    return Response.json(
      { error: "Failed to complete connection", detail: completeData },
      { status: 500 }
    );
  }

  // STEP 1: Initiate the connection
  const connectRes = await fetch(
    `https://${domain}/me/v1/connected-accounts/connect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${myAccountToken}`,
      },
      body: JSON.stringify({
        connection: "stripe",
        redirect_uri: `${process.env.APP_BASE_URL}/api/connect-stripe`,
        scopes: ["read_write"],
      }),
    }
  );

  const connectData = await connectRes.json();

  if (!connectRes.ok) {
    return Response.json(
      { error: "Failed to initiate connection", detail: connectData },
      { status: connectRes.status }
    );
  }

  // Store auth_session in a cookie so we can use it in the callback
  const connectUrl = new URL(connectData.connect_uri);
  connectUrl.searchParams.set("ticket", connectData.connect_params.ticket);

  return new Response(null, {
    status: 302,
    headers: {
      Location: connectUrl.toString(),
      "Set-Cookie": `stripe_auth_session=${connectData.auth_session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`,
    },
  });
}
