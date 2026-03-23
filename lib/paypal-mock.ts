import type { RawTransaction } from "@/types/financial";

// Deterministic seeded mock PayPal data for reproducible demos
export function getMockPayPalTransactions(): RawTransaction[] {
  const now = Date.now();
  const day = 86400000;

  const transactions: RawTransaction[] = [
    // Normal daily transactions
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `PP-${1000 + i}`,
      amount: Math.floor((50 + (i * 37) % 400) * 100), // $50–$450 in cents
      currency: "usd",
      status: "succeeded" as const,
      created: Math.floor((now - (i % 30) * day - (i * 3600000)) / 1000),
      source: "paypal" as const,
    })),

    // Suspicious: velocity spike — 8 transactions within 2 hours on day 12
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `PP-SPIKE-${i}`,
      amount: 9900, // $99 each
      currency: "usd",
      status: "succeeded" as const,
      created: Math.floor((now - 12 * day + i * 900) / 1000), // 15 min apart
      source: "paypal" as const,
    })),

    // Suspicious: large round number transaction
    {
      id: "PP-LARGE-001",
      amount: 500000, // $5000
      currency: "usd",
      status: "succeeded",
      created: Math.floor((now - 5 * day) / 1000),
      source: "paypal",
    },

    // Suspicious: refund anomaly — 5 refunds in 24h
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `PP-REF-${i}`,
      amount: -(15000 + i * 1000), // -$150 to -$190 refunds
      currency: "usd",
      status: "refunded" as const,
      created: Math.floor((now - 8 * day + i * 3600) / 1000),
      source: "paypal" as const,
    })),

    // Some failures
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `PP-FAIL-${i}`,
      amount: Math.floor((100 + i * 50) * 100),
      currency: "usd",
      status: "failed" as const,
      created: Math.floor((now - (15 + i) * day) / 1000),
      source: "paypal" as const,
    })),
  ];

  return transactions;
}
