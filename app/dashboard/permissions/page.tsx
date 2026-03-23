"use client";

import { useEffect, useState } from "react";

interface Connection {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "demo";
  scopes: string[];
  lastUsed: string | null;
  tokenSource?: string;
  note?: string;
}

export default function PermissionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/permissions")
      .then((r) => r.json())
      .then((data) => setConnections(data.connections ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function revoke(connectionId: string) {
    setRevoking(connectionId);
    setMessage(null);

    const res = await fetch("/api/permissions/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection: connectionId }),
    });

    const data = await res.json();

    if (res.ok) {
      setMessage({ type: "success", text: data.message });
      // Refresh connections
      const updated = await fetch("/api/permissions").then((r) => r.json());
      setConnections(updated.connections ?? []);
    } else {
      setMessage({ type: "error", text: data.error ?? "Revocation failed" });
    }

    setRevoking(null);
  }

  const statusBadge: Record<string, string> = {
    connected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    disconnected: "bg-slate-700/50 text-slate-400 border-slate-600",
    demo: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Permissions</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Connected accounts and their access scopes. Revoke access at any time.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl p-4 text-sm border ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">Loading connections...</div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-white">{conn.name}</h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${statusBadge[conn.status]}`}
                    >
                      {conn.status === "demo" ? "Demo Mode" : conn.status}
                    </span>
                  </div>
                  {conn.lastUsed && (
                    <p className="text-xs text-slate-500">
                      Last used: {new Date(conn.lastUsed).toLocaleString()}
                    </p>
                  )}
                  {conn.note && (
                    <p className="text-xs text-slate-500 italic">{conn.note}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  {conn.status === "disconnected" && conn.id === "stripe" && (
                    <a
                      href="/api/connect-stripe"
                      className="text-sm bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-1.5 rounded-lg transition-colors"
                    >
                      Connect via Token Vault
                    </a>
                  )}
                  {conn.status === "connected" && (
                    <button
                      onClick={() => revoke(conn.id)}
                      disabled={revoking === conn.id}
                      className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {revoking === conn.id ? "Revoking..." : "Revoke Access"}
                    </button>
                  )}
                </div>
              </div>

              {/* Scopes */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Granted Scopes
                </div>
                <div className="flex flex-wrap gap-2">
                  {conn.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-1 rounded font-mono"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              {/* What this connection CANNOT do */}
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs font-semibold text-slate-500 mb-1.5">
                  Agent Boundaries
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="text-emerald-400 flex gap-1">
                    <span>✓</span> Read transactions
                  </div>
                  <div className="text-red-400 flex gap-1">
                    <span>✗</span> Create charges
                  </div>
                  <div className="text-emerald-400 flex gap-1">
                    <span>✓</span> Analyze patterns
                  </div>
                  <div className="text-red-400 flex gap-1">
                    <span>✗</span> Issue refunds
                  </div>
                  <div className="text-emerald-400 flex gap-1">
                    <span>✓</span> Flag anomalies
                  </div>
                  <div className="text-red-400 flex gap-1">
                    <span>✗</span> Access PII
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
