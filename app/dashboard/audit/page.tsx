"use client";

import { useEffect, useState } from "react";
import type { AuditEvent, TokenVaultEvent } from "@/types/audit";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tokenEvents, setTokenEvents] = useState<TokenVaultEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"agent" | "tokens">("agent");

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setTokenEvents(data.tokenEvents ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const outcomeColor: Record<string, string> = {
    SUCCESS: "text-emerald-400",
    DENIED: "text-red-400",
    STEP_UP_REQUIRED: "text-yellow-400",
    ERROR: "text-red-400",
  };

  const riskColor: Record<string, string> = {
    LOW: "text-emerald-400",
    MEDIUM: "text-yellow-400",
    HIGH: "text-red-400",
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Complete log of every agent action. Immutable. Local SQLite.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {(["agent", "tokens"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t === "agent" ? "Agent Actions" : "Token Vault Events"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Loading audit trail...</div>
      ) : tab === "agent" ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {events.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm text-center">
              No audit events yet. Run an analysis to see entries here.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr>
                  {["Timestamp", "Action", "Resource", "Risk", "Outcome"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {event.action}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{event.resource}</td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {event.risk_level ? (
                        <span className={riskColor[event.risk_level] ?? "text-slate-400"}>
                          {event.risk_level}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${outcomeColor[event.outcome] ?? "text-slate-400"}`}>
                      {event.outcome}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {tokenEvents.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm text-center">
              No token vault events yet. Connect an account to see entries.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr>
                  {["Timestamp", "Connection", "Event", "Scopes"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tokenEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300 capitalize text-sm">{ev.connection}</td>
                    <td className={`px-4 py-3 text-xs font-medium ${
                      ev.event_type === "REVOKED"
                        ? "text-red-400"
                        : ev.event_type === "CONNECTED"
                        ? "text-emerald-400"
                        : "text-blue-400"
                    }`}>
                      {ev.event_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {ev.scopes ? JSON.parse(ev.scopes).join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
