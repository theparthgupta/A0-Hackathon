import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  // Enable Connected Accounts endpoint for Token Vault
  // Mounts /auth/connect route for linking external accounts
  enableConnectAccountEndpoint: true,

  authorizationParameters: {
    // Request offline_access to get refresh tokens (required for Token Vault)
    scope: "openid profile email offline_access",
    // max_age tells Auth0 to include auth_time in the ID token (OIDC spec).
    // 86400 = 24h — won't force re-auth on normal login, but ensures auth_time is always present.
    // Step-up auth overrides this with max_age=0 to force immediate re-authentication.
    max_age: 86400,
  },

  // Preserve auth_time claim from ID token into session
  // Required for step-up auth: we check auth_time to verify recent re-authentication
  async beforeSessionSaved(session, idToken) {
    if (idToken) {
      try {
        // Decode JWT payload (already verified by SDK — just need the claims)
        const payload = JSON.parse(
          Buffer.from(idToken.split(".")[1], "base64url").toString()
        );
        if (payload.auth_time) {
          session.user.auth_time = payload.auth_time;
        }
      } catch {
        // Ignore decode errors
      }
    }
    return session;
  },
});
