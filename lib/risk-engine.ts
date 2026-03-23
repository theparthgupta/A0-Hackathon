import type { SanitizedDataPacket } from "@/types/financial";
import type { RiskClassification } from "@/types/risk";

export function classifyRisk(
  data: SanitizedDataPacket,
  aiAnomalies: string[]
): RiskClassification {
  const signals: string[] = [];
  let score = 0;

  // Velocity check
  if (data.velocityMetrics.maxPerHour > 10) {
    score += 30;
    signals.push(`High transaction velocity: ${data.velocityMetrics.maxPerHour} transactions in one hour`);
  } else if (data.velocityMetrics.maxPerHour > 5) {
    score += 10;
    signals.push(`Elevated velocity: ${data.velocityMetrics.maxPerHour} transactions/hour`);
  }

  // Refund ratio check
  if (data.refundRatio > 0.2) {
    score += 25;
    signals.push(`High refund ratio: ${Math.round(data.refundRatio * 100)}% of transactions`);
  } else if (data.refundRatio > 0.1) {
    score += 10;
    signals.push(`Elevated refund ratio: ${Math.round(data.refundRatio * 100)}%`);
  }

  // Large transaction check
  if (data.amountBuckets.large > 3) {
    score += 20;
    signals.push(`${data.amountBuckets.large} large transactions (>$500) detected`);
  }

  // Failure rate check
  if (data.failureRate > 0.15) {
    score += 15;
    signals.push(`High failure rate: ${Math.round(data.failureRate * 100)}%`);
  }

  // Large single amount
  if (data.largestSingleAmount > 2000) {
    score += 15;
    signals.push(`Single transaction exceeds $${data.largestSingleAmount} threshold`);
  }

  // AI anomalies add to score
  if (aiAnomalies.length >= 3) {
    score += 20;
  } else if (aiAnomalies.length > 0) {
    score += 10;
  }

  const level =
    score >= 55 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";

  return {
    level,
    score,
    reasons: signals,
    aiAnomalies,
  };
}
