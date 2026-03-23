export type AuditAction =
  | "FETCH_STRIPE"
  | "FETCH_PAYPAL"
  | "AI_ANALYSIS"
  | "REVOKE_TOKEN"
  | "STEP_UP_TRIGGERED"
  | "PERMISSION_VIEWED";

export type AuditOutcome = "SUCCESS" | "DENIED" | "STEP_UP_REQUIRED" | "ERROR";

// SQLite returns snake_case column names
export interface AuditEvent {
  id: number;
  timestamp: string;
  user_id: string;
  action: AuditAction;
  resource: string;
  query_hash?: string;
  risk_level?: string;
  outcome: AuditOutcome;
  metadata?: string; // JSON string
}

export interface TokenVaultEvent {
  id: number;
  timestamp: string;
  user_id: string;
  connection: string;
  event_type: "CONNECTED" | "TOKEN_USED" | "REVOKED";
  scopes?: string; // JSON array string
}
