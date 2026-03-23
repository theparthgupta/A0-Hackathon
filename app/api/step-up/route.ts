import { auth0 } from "@/lib/auth0";

// Step-up auth endpoint: redirects to Auth0 with max_age=0
// This forces re-authentication (MFA if configured, password at minimum)
// After re-auth, auth_time in the ID token is updated to "now"
export async function GET(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const returnTo =
    new URL(request.url).searchParams.get("returnTo") ||
    "/dashboard/analyze";

  // Redirect to Auth0 login with max_age=0 to force re-authentication
  // This is the standard OAuth 2.0 way to implement step-up auth
  // Auth0 will require the user to authenticate again (password + MFA if enabled)
  const loginUrl = new URL(`https://${process.env.AUTH0_DOMAIN}/authorize`);
  loginUrl.searchParams.set("client_id", process.env.AUTH0_CLIENT_ID!);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set(
    "redirect_uri",
    `${process.env.APP_BASE_URL}/auth/callback`
  );
  loginUrl.searchParams.set(
    "scope",
    "openid profile email offline_access"
  );
  loginUrl.searchParams.set("max_age", "0"); // Forces re-authentication
  loginUrl.searchParams.set("state", Buffer.from(JSON.stringify({
    returnTo,
    stepUp: true,
  })).toString("base64url"));

  return Response.redirect(loginUrl.toString(), 302);
}
