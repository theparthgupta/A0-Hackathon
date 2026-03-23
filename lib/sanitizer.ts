import type { RawTransaction, SanitizedDataPacket } from "@/types/financial";

export function sanitizeTransactions(
  transactions: RawTransaction[],
  source: "stripe" | "paypal" | "combined"
): SanitizedDataPacket {
  if (transactions.length === 0) {
    return {
      source,
      totalTransactions: 0,
      dateRange: { from: "N/A", to: "N/A" },
      amountBuckets: { small: 0, medium: 0, large: 0 },
      velocityMetrics: { maxPerHour: 0, avgPerDay: 0 },
      refundRatio: 0,
      failureRate: 0,
      uniqueCurrencies: [],
      largestSingleAmount: 0,
    };
  }

  const amounts = transactions.map((t) => Math.abs(t.amount) / 100);
  const timestamps = transactions.map((t) => t.created * 1000);

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const daySpan = Math.max((maxTime - minTime) / 86400000, 1);

  // Bucket by amount
  const small = transactions.filter((t) => Math.abs(t.amount) < 10000).length;
  const medium = transactions.filter(
    (t) => Math.abs(t.amount) >= 10000 && Math.abs(t.amount) < 50000
  ).length;
  const large = transactions.filter((t) => Math.abs(t.amount) >= 50000).length;

  // Velocity: max transactions in any 1-hour window
  const sortedTs = [...timestamps].sort((a, b) => a - b);
  let maxPerHour = 0;
  for (let i = 0; i < sortedTs.length; i++) {
    const windowEnd = sortedTs[i] + 3600000;
    const count = sortedTs.filter((t) => t >= sortedTs[i] && t < windowEnd).length;
    if (count > maxPerHour) maxPerHour = count;
  }

  const refundCount = transactions.filter((t) => t.status === "refunded" || t.amount < 0).length;
  const failCount = transactions.filter((t) => t.status === "failed").length;

  // Largest amount rounded to nearest $10 (removes exact PII)
  const largestCents = Math.max(...transactions.map((t) => Math.abs(t.amount)));
  const largestRounded = Math.round((largestCents / 100) / 10) * 10;

  return {
    source,
    totalTransactions: transactions.length,
    dateRange: {
      from: new Date(minTime).toISOString().split("T")[0],
      to: new Date(maxTime).toISOString().split("T")[0],
    },
    amountBuckets: { small, medium, large },
    velocityMetrics: {
      maxPerHour,
      avgPerDay: Math.round(transactions.length / daySpan),
    },
    refundRatio: Math.round((refundCount / transactions.length) * 100) / 100,
    failureRate: Math.round((failCount / transactions.length) * 100) / 100,
    uniqueCurrencies: [...new Set(transactions.map((t) => t.currency))],
    largestSingleAmount: largestRounded,
  };
}
