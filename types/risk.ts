export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskClassification {
  level: RiskLevel;
  score: number;
  reasons: string[];
  aiAnomalies: string[];
}
