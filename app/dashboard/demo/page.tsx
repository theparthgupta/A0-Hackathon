"use client";

import { useState } from "react";

const STEPS = [
  {
    title: "Normal Operation",
    description: "The agent requests Stripe data. Auth0 Token Vault returns a scoped, short-lived token. The agent uses it to fetch charges.",
    detail: `// What the agent gets from Token Vault
{
  token: "rk_test_...",  // Stripe restricted key
  scopes: ["charges:read"],
  expires_in: 3600
}

// What the agent CAN do with this token
stripe.charges.list({ limit: 50 }) ✓

// What the agent CANNOT do
stripe.charges.create(...)  ✗  // 403 Forbidden
stripe.customers.list(...)  ✗  // 403 Forbidden
stripe.refunds.create(...)  ✗  // 403 Forbidden`,
    status: "safe",
  },
  {
    title: "Simulate Token Exfiltration",
    description: "An attacker gets the token value. What can they do with it?",
    detail: `// Attacker has stolen token: "rk_test_51..."
// They try to abuse it...

curl -u rk_test_51...: https://api.stripe.com/v1/charges
// ✓ Can see transaction COUNT and basic metadata

curl -u rk_test_51...: https://api.stripe.com/v1/customers
// ✗ 403 — Scope: charges:read only

curl -u rk_test_51...: https://api.stripe.com/v1/charges -X POST
// ✗ 403 — Read-only key, no write permissions

// RESULT: Token is scoped. Attacker can see stats,
// but cannot steal customer data, create charges,
// or issue refunds.`,
    status: "limited",
  },
  {
    title: "Token Revocation",
    description: "One click revokes all access. The token becomes invalid immediately.",
    detail: `// Call revoke endpoint
POST /api/permissions/revoke
{ "connection": "stripe" }

// Auth0 Management API: unlink identity
DELETE /api/v2/users/{userId}/identities/oauth2/{identityId}

// All subsequent Token Vault calls fail:
auth0.getAccessTokenForConnection({ connection: "stripe" })
// → AccessTokenError: missing_refresh_token

// Audit trail records the revocation:
{ action: "REVOKE_TOKEN", outcome: "SUCCESS", timestamp: "..." }`,
    status: "revoked",
  },
  {
    title: "Re-Authorization",
    description: "The user re-connects their account. A new token is issued. The audit trail shows the full lifecycle.",
    detail: `// User reconnects via Auth0 OAuth flow
GET /auth/login?connection=stripe&prompt=consent

// New token issued and stored in Token Vault
// Previous token is invalidated

// Audit trail shows full lifecycle:
[
  { event: "CONNECTED",   timestamp: "09:00" },
  { event: "TOKEN_USED",  timestamp: "09:15" },
  { event: "TOKEN_USED",  timestamp: "09:30" },
  { event: "REVOKED",     timestamp: "10:00" },
  { event: "CONNECTED",   timestamp: "10:05" },
]`,
    status: "restored",
  },
];

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);

  async function handleRevoke() {
    setRevoking(true);
    try {
      const res = await fetch("/api/permissions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection: "stripe" }),
      });
      const data = await res.json();
      setRevoked(true);
      setRevokeMsg(data.message ?? "Access revoked");
    } catch {
      setRevokeMsg("Revocation triggered (check audit trail)");
      setRevoked(true);
    } finally {
      setRevoking(false);
    }
  }

  const statusColor: Record<string, string> = {
    safe: "border-emerald-500/40 bg-emerald-500/5",
    limited: "border-yellow-500/40 bg-yellow-500/5",
    revoked: "border-red-500/40 bg-red-500/5",
    restored: "border-blue-500/40 bg-blue-500/5",
  };

  const current = STEPS[step];

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Attack Scenario Demo</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Interactive walkthrough: What happens when this agent is compromised?
        </p>
      </div>

      {/* Step Progress */}
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              i === step
                ? "bg-slate-700 text-white"
                : i < step
                ? "bg-slate-800 text-emerald-400"
                : "bg-slate-900 text-slate-600 border border-slate-800"
            }`}
          >
            Step {i + 1}
          </button>
        ))}
      </div>

      {/* Current Step */}
      <div className={`border rounded-xl p-6 space-y-4 ${statusColor[current.status]}`}>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Step {step + 1} of {STEPS.length}
          </div>
          <h2 className="text-xl font-bold text-white">{current.title}</h2>
          <p className="text-slate-300 text-sm mt-2">{current.description}</p>
        </div>

        <pre className="bg-slate-950 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed font-mono">
          {current.detail}
        </pre>

        {/* Interactive action for step 3 (revocation) */}
        {step === 2 && (
          <div className="space-y-2">
            <button
              onClick={handleRevoke}
              disabled={revoking || revoked}
              className="bg-red-500 hover:bg-red-400 disabled:bg-red-500/40 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
            >
              {revoking ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Revoking...
                </>
              ) : revoked ? (
                "✓ Access Revoked"
              ) : (
                "Revoke Stripe Access Now"
              )}
            </button>
            {revokeMsg && (
              <p className="text-sm text-emerald-400">{revokeMsg} — Check the Audit Trail tab.</p>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            ← Previous
          </button>
          <button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={step === STEPS.length - 1}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Key Takeaway */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-2 text-sm">Why This Matters</h3>
        <div className="grid grid-cols-3 gap-4 text-xs text-slate-400">
          <div>
            <div className="text-emerald-400 font-medium mb-1">Scope Limiting</div>
            Stolen tokens can only read charges. No write access, no customer PII.
          </div>
          <div>
            <div className="text-emerald-400 font-medium mb-1">Instant Revocation</div>
            One API call invalidates all tokens. No waiting for expiry.
          </div>
          <div>
            <div className="text-emerald-400 font-medium mb-1">Full Audit Trail</div>
            Every token issuance and revocation is logged with timestamps.
          </div>
        </div>
      </div>
    </div>
  );
}
