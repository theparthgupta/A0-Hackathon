import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  // Enable Connected Accounts endpoint for Token Vault
  // Mounts /auth/connect route for linking external accounts
  enableConnectAccountEndpoint: true,

  authorizationParameters: {
    // Request offline_access to get refresh tokens (required for Token Vault)
    scope: "openid profile email offline_access",
  },
});
