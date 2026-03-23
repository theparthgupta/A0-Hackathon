import { auth0 } from "@/lib/auth0";

// Step-up auth endpoint: uses Auth0 SDK's startInteractiveLogin with max_age=0
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

  // Use the SDK's startInteractiveLogin with max_age=0
  // This properly handles state/nonce/PKCE — unlike manual /authorize URLs
  // max_age=0 forces Auth0 to require re-authentication regardless of session
  return auth0.startInteractiveLogin({
    authorizationParameters: {
      max_age: 0, // Forces re-authentication (step-up)
    },
    returnTo,
  });
}
