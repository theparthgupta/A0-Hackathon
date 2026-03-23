export interface RawTransaction {
  id: string;
  amount: number; // in cents
  currency: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  created: number; // unix timestamp
  source: "stripe" | "paypal";
}

export interface SanitizedDataPacket {
  source: "stripe" | "paypal" | "combined";
  totalTransactions: number;
  dateRange: { from: string; to: string };
  amountBuckets: {
    small: number; // < $100
    medium: number; // $100–$500
    large: number; // > $500
  };
  velocityMetrics: {
    maxPerHour: number;
    avgPerDay: number;
  };
  refundRatio: number;
  failureRate: number;
  uniqueCurrencies: string[];
  largestSingleAmount: number; // in dollars, rounded to nearest 10
}

export interface SanitizedInsight {
  summary: string;
  anomalies: string[];
  recommendations: string[];
}
