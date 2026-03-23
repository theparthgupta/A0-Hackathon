import type { SanitizedDataPacket, SanitizedInsight } from "@/types/financial";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const SYSTEM_PROMPT = `You are a financial compliance auditor AI running locally.
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

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error("[Ollama] health check failed:", err);
    return false;
  }
}

export async function analyzeWithOllama(
  data: SanitizedDataPacket
): Promise<SanitizedInsight> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: { num_ctx: 8192 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze these transaction statistics:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const result = await response.json();
  const content: string = result.message?.content ?? "";

  // Parse JSON from Ollama response (may have extra text around it)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback if model doesn't return JSON
    return {
      summary: "Analysis complete. Review flagged metrics below.",
      anomalies: ["Unable to parse AI response — rule-based analysis only"],
      recommendations: ["Review high-risk signals identified by the rule engine"],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: String(parsed.summary ?? ""),
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map(String)
        : [],
    };
  } catch {
    return {
      summary: "Analysis complete. Review flagged metrics below.",
      anomalies: ["Rule-based analysis only — AI parsing failed"],
      recommendations: ["Review flagged patterns manually"],
    };
  }
}
