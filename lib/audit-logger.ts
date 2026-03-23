import { getDb } from "./db";
import type { AuditAction, AuditOutcome } from "@/types/audit";
import crypto from "crypto";

interface LogEventParams {
  userId: string;
  action: AuditAction;
  resource: string;
  outcome: AuditOutcome;
  query?: string; // will be hashed, never stored raw
  riskLevel?: string;
  metadata?: Record<string, unknown>;
}

interface LogTokenVaultParams {
  userId: string;
  connection: string;
  eventType: "CONNECTED" | "TOKEN_USED" | "REVOKED";
  scopes?: string[];
}

export const auditLogger = {
  log(params: LogEventParams) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO audit_events (timestamp, user_id, action, resource, query_hash, risk_level, outcome, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const queryHash = params.query
      ? crypto.createHash("sha256").update(params.query).digest("hex").slice(0, 16)
      : null;

    stmt.run(
      new Date().toISOString(),
      params.userId,
      params.action,
      params.resource,
      queryHash,
      params.riskLevel ?? null,
      params.outcome,
      params.metadata ? JSON.stringify(params.metadata) : null
    );
  },

  logTokenVault(params: LogTokenVaultParams) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO token_vault_events (timestamp, user_id, connection, event_type, scopes)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      new Date().toISOString(),
      params.userId,
      params.connection,
      params.eventType,
      params.scopes ? JSON.stringify(params.scopes) : null
    );
  },

  getEvents(userId: string, limit = 50) {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM audit_events WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`
      )
      .all(userId, limit);
  },

  getTokenVaultEvents(userId: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM token_vault_events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20`
      )
      .all(userId);
  },
};
