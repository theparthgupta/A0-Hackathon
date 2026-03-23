import type { SanitizedDataPacket } from "@/types/financial";
import type { RiskClassification } from "@/types/risk";

export interface AgentStep {
  type: "planning" | "tool_call" | "tool_result" | "thinking" | "final_answer";
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  content?: string;
  timestamp: number;
}

export interface AgentResult {
  steps: AgentStep[];
  finalAnswer: {
    summary: string;
    anomalies: string[];
    recommendations: string[];
  };
  risk: RiskClassification;
  toolsUsed: string[];
  iterationCount: number;
  sanitizedStats: SanitizedDataPacket;
  sources: Record<string, string>;
  stepUpVerified?: boolean;
}

export interface AgentAlert {
  id?: number;
  timestamp: string;
  user_id: string;
  risk_level: string;
  risk_score: number;
  summary: string;
  anomalies: string; // JSON array
  tools_used: string; // JSON array
  iteration_count: number;
  dismissed: number;
}

// Tool definition in OpenAI-compatible format for Groq
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallResult {
  name: string;
  result: unknown;
}
