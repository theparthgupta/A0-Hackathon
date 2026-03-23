# Local-First Finance Auditor

> **AI-powered financial auditor that never exposes your raw data.**
> Built for the [Authorized to Act: Auth0 for AI Agents](https://auth0.devpost.com/) hackathon.

## What It Does

An AI agent that pulls financial data securely from **Stripe** (real) and **PayPal** (demo) via **Auth0 Token Vault**, processes everything through a local AI pipeline (**OpenClaw** sovereign gateway + **Groq** llama-3.3-70b), and only sends **sanitized statistical insights** to the browser. Raw financial data never leaves the server.

```
User Login --> Auth0 Token Vault --> Scoped Stripe Token --> Fetch Transactions
     --> Sanitize (strip PII) --> OpenClaw/Groq AI --> Insights Only --> Browser
```

---

## Live Demo Pages

| Page | URL | What It Shows |
|------|-----|---------------|
| **Dashboard** | `/dashboard` | System status, architecture flow, quick actions |
| **Analyze** | `/dashboard/analyze` | Run AI analysis on Stripe/PayPal data with custom queries |
| **Permissions** | `/dashboard/permissions` | Connected accounts, scopes, agent boundaries, revoke access |
| **Audit Trail** | `/dashboard/audit` | Every agent action and token vault event logged |
| **Attack Demo** | `/dashboard/demo` | 4-step interactive attack scenario showing security model |

---

## Architecture

### Security Model

```
+---------------+     +--------------------+     +---------------+
|   Browser     | <-- |  Next.js Server    | --> |  Stripe API   |
| (insights     |     |  (data boundary)   |     |  (via Token   |
|  only)        |     |                    |     |   Vault)      |
+---------------+     +---------+----------+     +---------------+
                                |
                      +---------v----------+
                      |   Sanitizer        |
                      | (strips all PII)   |
                      +---------+----------+
                                |
                      +---------v----------+
                      |  OpenClaw/Groq     |
                      | (AI analysis on    |
                      |  aggregates only)  |
                      +--------------------+
```

### What the AI receives (sanitized):
```json
{
  "totalTransactions": 12,
  "amountBuckets": { "small": 8, "medium": 3, "large": 1 },
  "velocityMetrics": { "maxPerHour": 12, "avgPerDay": 12 },
  "refundRatio": 0,
  "failureRate": 0,
  "largestSingleAmount": 1000
}
```

### What the AI does NOT receive:
- No card numbers, account numbers
- No customer names or emails
- No exact transaction amounts (rounded to nearest $10)
- No transaction IDs or metadata

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Full-stack React |
| **Auth** | Auth0 + Token Vault | Secure credential management |
| **AI Gateway** | OpenClaw v2026.3.13 | Sovereign AI routing |
| **LLM** | Groq (llama-3.3-70b-versatile) | Fast inference |
| **LLM Fallback** | Ollama (llama3.2:1b) | Fully local fallback |
| **Financial API** | Stripe (real via Token Vault) | Transaction data |
| **Mock Data** | PayPal (deterministic mock) | Demo anomalies |
| **Database** | SQLite (better-sqlite3) | Local audit trail |
| **Styling** | Tailwind CSS 4 + shadcn/ui | UI components |

---

## How Auth0 Token Vault Works Here

### Connection Flow
1. User clicks **"Connect via Token Vault"** on the Permissions page
2. App exchanges Auth0 refresh token for a **My Account API** access token
3. Calls Auth0 `/me/v1/connected-accounts/connect` to get a connection ticket
4. User is redirected to **Stripe Connect OAuth** consent screen
5. After approval, Auth0 stores the Stripe refresh token in **Token Vault**
6. App receives a `connect_code`, calls `/me/v1/connected-accounts/complete`
7. Token Vault event is logged to the audit trail

### Token Usage (Every Analysis)
```typescript
// Server-side only -- token never reaches the browser
const { token } = await auth0.getAccessTokenForConnection({
  connection: "stripe",
});
const stripe = new Stripe(token);
const data = await stripe.paymentIntents.list({ limit: 50 });
```

### Agent Boundaries (Enforced)
| Allowed | Denied |
|---------|--------|
| Read transactions | Create charges |
| Analyze patterns | Issue refunds |
| Flag anomalies | Access PII |

---

## AI Pipeline

### 3-Tier Fallback
```
OpenClaw Gateway (sovereign) --> Groq Direct (fast) --> Ollama (local)
```

1. **OpenClaw** -- sovereign AI gateway on `localhost:18789`, routes through Groq backend. Provides agent-level controls, logging, and model routing.
2. **Groq** -- direct API fallback if OpenClaw is rate-limited. Uses `llama-3.3-70b-versatile` for high-quality financial analysis (~500ms response).
3. **Ollama** -- fully local fallback on `localhost:11434`. Uses `llama3.2:1b`. No data leaves your machine at all.

### Data Flow
```
Raw Stripe/PayPal Data (server only)
        |
   sanitizeTransactions()   <-- strips PII, creates statistical aggregates
        |
   analyzeLocally()         <-- sends ONLY aggregates to AI
        |
   classifyRisk()           <-- rule-based + AI anomaly scoring
        |
   Browser receives: { sanitizedStats, insight, risk }
```

---

## Risk Engine

Rule-based scoring (0-100) combined with AI anomaly detection:

| Signal | Points |
|--------|--------|
| Velocity >10 tx/hour | +30 |
| Velocity >5 tx/hour | +10 |
| Refund ratio >20% | +25 |
| Refund ratio >10% | +10 |
| >3 large transactions (>$500) | +20 |
| Single amount >$2000 | +15 |
| Failure rate >15% | +15 |
| AI detected 3+ anomalies | +20 |
| AI detected any anomaly | +10 |

**Classification:** HIGH (>=55) | MEDIUM (>=25) | LOW (<25)

---

## Audit Trail

Every action is logged to a local SQLite database (`data/audit.db`):

### Agent Actions
- `FETCH_STRIPE` -- Token Vault token exchange + Stripe API call
- `FETCH_PAYPAL` -- PayPal data retrieval (mock)
- `AI_ANALYSIS` -- AI analysis with risk score, query hash, transaction count
- `REVOKE_TOKEN` -- Token access revoked
- `PERMISSION_VIEWED` -- Permissions page accessed

### Token Vault Events
- `CONNECTED` -- New Stripe account linked via Token Vault
- `TOKEN_USED` -- Scoped token exchanged for API call
- `REVOKED` -- Token access revoked (instant)

---

## Project Structure

```
local-finance-auditor/
|-- app/
|   |-- api/
|   |   |-- analyze/route.ts         # Main AI analysis endpoint
|   |   |-- audit/route.ts           # Audit trail retrieval
|   |   |-- connect-stripe/route.ts  # Token Vault OAuth flow
|   |   |-- financial/
|   |   |   |-- stripe/route.ts      # Stripe via Token Vault
|   |   |   |-- paypal/route.ts      # Mock PayPal data
|   |   |-- permissions/route.ts     # List connected accounts
|   |   |-- permissions/revoke/route.ts  # Revoke access
|   |-- dashboard/
|   |   |-- page.tsx                 # Overview with status cards
|   |   |-- analyze/page.tsx         # AI analysis UI
|   |   |-- audit/page.tsx           # Audit trail viewer
|   |   |-- demo/page.tsx            # Attack scenario walkthrough
|   |   |-- permissions/page.tsx     # Manage connections
|   |   |-- layout.tsx               # Sidebar navigation
|   |-- layout.tsx                   # Root layout
|   |-- page.tsx                     # Landing page
|-- lib/
|   |-- ai-engine.ts                 # OpenClaw/Groq/Ollama orchestration
|   |-- audit-logger.ts              # SQLite audit logging
|   |-- auth0.ts                     # Auth0 client (Token Vault enabled)
|   |-- db.ts                        # SQLite schema + connection
|   |-- paypal-mock.ts               # Deterministic mock data with anomalies
|   |-- risk-engine.ts               # Risk scoring algorithm
|   |-- sanitizer.ts                 # PII stripping + statistical aggregation
|-- types/
|   |-- audit.ts                     # AuditEvent, TokenVaultEvent types
|   |-- financial.ts                 # RawTransaction, SanitizedDataPacket
|   |-- risk.ts                      # RiskClassification type
|-- proxy.ts                         # Next.js 16 middleware (Auth0)
|-- .env.local                       # All credentials (see setup below)
|-- package.json
```

---

## Setup Guide (For Reviewers)

### Prerequisites
- **Node.js** 20+ (tested on 24.12.0)
- **Auth0 Account** (free tier works)
- **Stripe Account** (test mode)
- **Groq API Key** (free at [console.groq.com](https://console.groq.com))
- **OpenClaw** (optional, `npm i -g openclaw`)
- **Ollama** (optional fallback, [ollama.com](https://ollama.com))

### Step 1: Clone and Install

```bash
git clone <repo-url>
cd local-finance-auditor
npm install
```

### Step 2: Auth0 Setup

1. Create a **Regular Web Application** in Auth0
2. Set Allowed Callback URLs: `http://localhost:3000/auth/callback, http://localhost:3000/api/connect-stripe`
3. Set Allowed Logout URLs: `http://localhost:3000`
4. Enable **Refresh Token Rotation** and grant **Offline Access**
5. Create a **Machine-to-Machine** app with Management API access (optional, for revoke feature)

### Step 3: Stripe Connect Setup

1. Go to **Auth0 Dashboard -> Authentication -> Social**
2. Add a **Stripe** connection
3. Enter your **Stripe Connect Client ID** (`ca_...`) and **Stripe Secret Key** (`sk_test_...`)
4. Set Purpose to **"Connected Accounts for Token Vault"**
5. Check the **"Read Write"** permission
6. Enable the connection for your Auth0 application

### Step 4: Environment Variables

Create `.env.local`:

```env
# Auth0
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_SECRET=run_openssl_rand_hex_32_to_generate

# Auth0 Management API (optional, for revoke feature)
AUTH0_MGMT_CLIENT_ID=your_m2m_client_id
AUTH0_MGMT_CLIENT_SECRET=your_m2m_client_secret

# App
APP_BASE_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=rk_test_or_sk_test_your_key

# Ollama (optional local fallback)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b

# OpenClaw (optional sovereign gateway)
OPENCLAW_BASE_URL=http://localhost:18789
OPENCLAW_API_KEY=your_openclaw_gateway_token

# Groq (recommended -- fast + free)
GROQ_API_KEY=gsk_your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
```

### Step 5: OpenClaw Setup (Optional)

```bash
npm i -g openclaw
openclaw config set gateway.mode local
openclaw config set gateway.http.endpoints.chatCompletions.enabled true
openclaw models set groq/llama-3.3-70b-versatile
openclaw config set models.providers.groq.baseUrl "https://api.groq.com/openai/v1"
openclaw config set models.providers.groq.apiKey "your_groq_key"
openclaw config set models.providers.groq.api "openai-completions"
# Add models array manually to ~/.openclaw/openclaw.json for groq provider (see README)
openclaw gateway --port 18789
```

### Step 6: Run

```bash
npm run dev
# Open http://localhost:3000
```

### Step 7: Connect Stripe

1. Log in at `http://localhost:3000`
2. Go to **Permissions** -> Click **"Connect via Token Vault"**
3. Authorize on Stripe's OAuth consent page
4. Stripe is now connected -- run analysis!

### Step 8: Seed Test Data (If Stripe account has no transactions)

Visit while logged in:
```
http://localhost:3000/api/test-vault?seed=true
```
This creates 12 test payment intents on the connected Stripe account.

---

## How the Analysis Flow Works Internally

### 1. User clicks "Run Analysis" on `/dashboard/analyze`

The client sends a POST to `/api/analyze` with:
```json
{ "query": "Analyze last 30 days...", "sources": ["stripe", "paypal"] }
```

### 2. Server fetches data via Token Vault

```typescript
// Token Vault exchange -- Auth0 returns a scoped Stripe token
const { token } = await auth0.getAccessTokenForConnection({ connection: "stripe" });
const stripe = new Stripe(token);
const paymentIntents = await stripe.paymentIntents.list({ limit: 50 });
```
- The token is a real Stripe secret key stored by Auth0
- It's scoped to the connected account only
- Token is NEVER sent to the browser or stored in our database

### 3. Data is sanitized

```typescript
const sanitized = sanitizeTransactions(allTransactions, "combined");
```
This converts raw transactions into:
- **Amount buckets**: small (<$100), medium ($100-$500), large (>$500)
- **Velocity metrics**: max transactions per hour, avg per day
- **Ratios**: refund ratio, failure rate
- **Rounded amounts**: largest amount rounded to nearest $10

All PII is stripped. No names, emails, card numbers, or exact amounts survive.

### 4. Sanitized data goes to AI

```typescript
const aiInsight = await analyzeLocally(sanitized, userQuery);
```
The AI engine tries (in order):
1. **OpenClaw gateway** (`localhost:18789/v1/chat/completions`) -- routes to Groq
2. **Groq direct** (`api.groq.com`) -- if OpenClaw is down/rate-limited
3. **Ollama local** (`localhost:11434`) -- if everything else fails

The AI receives ONLY the sanitized JSON and the user's query. It returns:
```json
{
  "summary": "Transaction statistics show a low refund ratio...",
  "anomalies": ["Large single transaction of 1000", "High max per hour"],
  "recommendations": ["Review the large transaction for legitimacy"]
}
```

### 5. Risk engine scores the result

```typescript
const risk = classifyRisk(sanitized, aiInsight.anomalies);
```
Combines rule-based signals (velocity, refund ratio, large transactions) with AI anomaly count for a 0-100 risk score classified as LOW/MEDIUM/HIGH.

### 6. Browser receives insights only

```json
{
  "sanitizedStats": { "totalTransactions": 12, "amountBuckets": {...} },
  "insight": { "summary": "...", "anomalies": [...], "recommendations": [...] },
  "risk": { "level": "MEDIUM", "score": 50, "reasons": [...] },
  "sources": { "stripe": "connected", "paypal": "demo_mode" }
}
```

**No raw financial data, no tokens, no PII ever reaches the browser.**

### 7. Everything is logged

```typescript
auditLogger.log({
  action: "AI_ANALYSIS",
  riskLevel: risk.level,
  metadata: { totalTransactions: 12, riskScore: 50, aiUsed: true, stripeConnected: true }
});
```

---

## Security Highlights

| Threat | Mitigation |
|--------|-----------|
| Token theft | Auth0 Token Vault -- tokens never stored in app |
| Data exfiltration via AI | Sanitization strips all PII before AI processing |
| PII leakage to browser | Only statistical aggregates and insights returned |
| Unauthorized writes | Agent boundaries enforce read-only access |
| Credential replay | Scoped, time-limited tokens + instant revocation |
| Missing audit trail | Immutable SQLite log of all agent actions + token events |
| AI hallucinating PII | System prompt + only statistical input = no PII to hallucinate |

---

## Hackathon Requirements Checklist

- [x] **Auth0 Token Vault** -- Stripe connected via Connected Accounts for Token Vault
- [x] **AI Agent** -- Financial auditor with multi-source analysis
- [x] **Scoped Access** -- Read-only token, agent boundaries enforced
- [x] **Security Architecture** -- Data sanitization, local processing, audit trail
- [x] **Attack Scenario** -- Interactive demo with token exfiltration + revocation
- [x] **Step-up Auth** -- HIGH risk results require re-authentication via Auth0 `max_age=0` (forces MFA/password). Fresh `auth_time` claim must be within 5 minutes to unlock detailed findings.
- [x] **Audit Trail** -- Full event logging for compliance

---

## Built With

- [Auth0](https://auth0.com) -- Authentication + Token Vault (Connected Accounts)
- [OpenClaw](https://openclaw.ai) -- Sovereign AI agent gateway
- [Groq](https://groq.com) -- Ultra-fast LLM inference (llama-3.3-70b)
- [Ollama](https://ollama.com) -- Local LLM fallback
- [Stripe](https://stripe.com) -- Financial data via Connect OAuth
- [Next.js 16](https://nextjs.org) -- Full-stack React framework
- [SQLite](https://sqlite.org) -- Local audit database
