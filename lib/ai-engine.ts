import type { SanitizedDataPacket, SanitizedInsight } from "@/types/financial";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const OPENCLAW_BASE_URL =
  process.env.OPENCLAW_BASE_URL || "http://localhost:18789";
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a financial compliance auditor AI running locally (sovereign AI).
You receive sanitized transaction statistics (aggregates only — no PII, no card numbers, no names).

Your task:
1. Identify anomalies in the statistical patterns (velocity spikes, unusual amounts, high refund ratios)
2. Note compliance concerns (round-number transactions, rapid succession, high failure rates)
3. Suggest specific audit actions

STRICT OUTPUT RULES:
- Respond ONLY with valid JSON in this exact format:
  {"summary": "...", "anomalies": ["...", "..."], "recommendations": ["...", "..."]}
- Do NOT invent specific account numbers, names, emails, or card details
- Only reference the statistical patterns you were given
- Keep anomalies array to max 5 items
- Keep recommendations array to max 3 items`;

// ─── Health Checks ──────────────────────────────────────────

async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkOpenClawHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OPENCLAW_BASE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function checkGroqHealth(): Promise<boolean> {
  return !!GROQ_API_KEY;
}

export async function checkAIHealth(): Promise<boolean> {
  if (await checkOpenClawHealth()) return true;
  if (await checkGroqHealth()) return true;
  return checkOllamaHealth();
}

export async function getAIStatus(): Promise<{
  engine: "openclaw" | "groq" | "ollama" | "none";
  available: boolean;
  model?: string;
}> {
  if (await checkOpenClawHealth()) {
    return {
      engine: "openclaw",
      available: true,
      model: `groq/${GROQ_MODEL}`,
    };
  }
  if (await checkGroqHealth()) {
    return { engine: "groq", available: true, model: GROQ_MODEL };
  }
  if (await checkOllamaHealth()) {
    return { engine: "ollama", available: true, model: OLLAMA_MODEL };
  }
  return { engine: "none", available: false };
}

// ─── Analysis Engines ───────────────────────────────────────

function buildMessages(data: SanitizedDataPacket, userQuery?: string) {
  const dataBlock = `Transaction statistics:\n${JSON.stringify(data, null, 2)}`;
  const userMessage = userQuery
    ? `User question: "${userQuery}"\n\n${dataBlock}\n\nAnswer the user's specific question using the data above, then provide your standard analysis.`
    : `Analyze these transaction statistics:\n${JSON.stringify(data, null, 2)}`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
}

async function analyzeWithOpenClaw(
  data: SanitizedDataPacket,
  userQuery?: string
): Promise<SanitizedInsight> {
  // OpenClaw Gateway → Groq backend (sovereign gateway layer)
  const response = await fetch(`${OPENCLAW_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENCLAW_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openclaw",
      messages: buildMessages(data, userQuery),
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenClaw error: ${response.status} ${errorBody}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content ?? "";

  // OpenClaw wraps rate limit errors in the content
  if (content.includes("rate limit") || content.includes("⚠️")) {
    throw new Error(`OpenClaw rate limited: ${content}`);
  }

  return parseAIResponse(content);
}

async function analyzeWithGroq(
  data: SanitizedDataPacket,
  userQuery?: string
): Promise<SanitizedInsight> {
  // Direct Groq API — fast inference with open-source models
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: buildMessages(data, userQuery),
        stream: false,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Groq error: ${response.status} ${errorBody}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content ?? "";
  return parseAIResponse(content);
}

async function analyzeWithOllama(
  data: SanitizedDataPacket,
  userQuery?: string
): Promise<SanitizedInsight> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: { num_ctx: 8192 },
      messages: buildMessages(data, userQuery),
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const result = await response.json();
  return parseAIResponse(result.message?.content ?? "");
}

// ─── Response Parser ────────────────────────────────────────

function parseAIResponse(content: string): SanitizedInsight {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      summary: "Analysis complete. Review flagged metrics below.",
      anomalies: ["Unable to parse AI response — rule-based analysis applied"],
      recommendations: [
        "Review high-risk signals identified by the rule engine",
      ],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: String(parsed.summary ?? ""),
      anomalies: Array.isArray(parsed.anomalies)
        ? parsed.anomalies.map(String)
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map(String)
        : [],
    };
  } catch {
    return {
      summary: "Analysis complete. Review flagged metrics below.",
      anomalies: ["Rule-based analysis only — AI response parsing failed"],
      recommendations: ["Review flagged patterns manually"],
    };
  }
}

// ─── Main Entry ─────────────────────────────────────────────

export async function analyzeLocally(
  data: SanitizedDataPacket,
  userQuery?: string
): Promise<SanitizedInsight> {
  // Priority: OpenClaw (sovereign gateway) → Groq (direct) → Ollama (local)
  if (await checkOpenClawHealth()) {
    try {
      return await analyzeWithOpenClaw(data, userQuery);
    } catch (e) {
      console.warn("OpenClaw analysis failed, trying Groq direct:", e);
    }
  }

  if (await checkGroqHealth()) {
    try {
      return await analyzeWithGroq(data, userQuery);
    } catch (e) {
      console.warn("Groq analysis failed, trying Ollama:", e);
    }
  }

  if (await checkOllamaHealth()) {
    return analyzeWithOllama(data, userQuery);
  }

  throw new Error("No AI engine available");
}
