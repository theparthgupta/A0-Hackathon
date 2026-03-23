"use client";

import { useState, useEffect, useCallback } from "react";

interface Alert {
  id: number;
  timestamp: string;
  risk_level: string;
  risk_score: number;
  summary: string;
  anomalies: string;
  tools_used: string;
  iteration_count: number;
  dismissed: number;
}

interface MonitorResult {
  risk: { level: string; score: number };
  summary: string;
  anomalies: string[];
  toolsUsed: string[];
  iterations: number;
  alertCreated: boolean;
}

export default function AgentMonitor() {
  const [monitoring, setMonitoring] = useState(false);
  const [interval, setIntervalMin] = useState(5);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastCheck, setLastCheck] = useState<MonitorResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [nextCheckIn, setNextCheckIn] = useState(0);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // ignore
    }
  }, []);

  const runMonitorCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/agent/monitor", { method: "POST" });
      const data = await res.json();
      setLastCheck(data);
      await fetchAlerts();
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, [fetchAlerts]);

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Autonomous monitoring interval
  useEffect(() => {
    if (!monitoring) return;

    setNextCheckIn(interval * 60);
    const countdown = setInterval(() => {
      setNextCheckIn((prev) => {
        if (prev <= 1) {
          runMonitorCheck();
          return interval * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [monitoring, interval, runMonitorCheck]);

  const activeAlerts = alerts.filter((a) => !a.dismissed);
  const riskBadge = (level: string) => {
    const colors: Record<string, string> = {
      HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
      MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      LOW: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    };
    return colors[level] || colors.LOW;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-white">
            🤖 Autonomous Agent Monitor
          </h2>
          {monitoring && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Active
            </span>
          )}
          {activeAlerts.length > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded">
              {activeAlerts.length} alert
              {activeAlerts.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={interval}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1"
            disabled={monitoring}
          >
            <option value={1}>Every 1 min</option>
            <option value={5}>Every 5 min</option>
            <option value={15}>Every 15 min</option>
            <option value={30}>Every 30 min</option>
          </select>

          <button
            onClick={() => {
              if (!monitoring) {
                setMonitoring(true);
                runMonitorCheck(); // Run immediately
              } else {
                setMonitoring(false);
              }
            }}
            className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
              monitoring
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
            }`}
          >
            {monitoring ? "Stop Monitoring" : "Start Monitoring"}
          </button>

          <button
            onClick={runMonitorCheck}
            disabled={checking}
            className="text-xs text-slate-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded transition-colors disabled:opacity-40"
          >
            {checking ? "Checking..." : "Run Now"}
          </button>
        </div>
      </div>

      {monitoring && (
        <div className="text-xs text-slate-500">
          Next autonomous check in {Math.floor(nextCheckIn / 60)}m{" "}
          {nextCheckIn % 60}s
        </div>
      )}

      {/* Last Check Result */}
      {lastCheck && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Latest check result:</span>
            <span
              className={`text-xs px-2 py-0.5 rounded border ${riskBadge(lastCheck.risk.level)}`}
            >
              {lastCheck.risk.level} ({lastCheck.risk.score}/100)
            </span>
          </div>
          <p className="text-sm text-slate-300">{lastCheck.summary}</p>
          <div className="flex flex-wrap gap-1">
            {lastCheck.toolsUsed.map((t) => (
              <span
                key={t}
                className="text-[10px] bg-slate-700/50 text-slate-500 px-1.5 py-0.5 rounded"
              >
                {t}
              </span>
            ))}
            <span className="text-[10px] text-slate-600">
              • {lastCheck.iterations} iterations
            </span>
          </div>
        </div>
      )}

      {/* Alert History */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Agent Alerts
          </h3>
          {activeAlerts.slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border ${riskBadge(alert.risk_level)}`}
                  >
                    {alert.risk_level}
                  </span>
                  <span className="text-xs text-slate-600">
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-400 truncate">
                  {alert.summary}
                </p>
              </div>
              <button
                onClick={async () => {
                  await fetch("/api/agent/alerts", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ alertId: alert.id }),
                  });
                  fetchAlerts();
                }}
                className="text-xs text-slate-600 hover:text-slate-300 shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {!lastCheck && activeAlerts.length === 0 && (
        <p className="text-xs text-slate-600">
          The autonomous agent monitors your financial accounts on a schedule.
          Start monitoring to enable automatic risk checks — no button clicks
          needed.
        </p>
      )}
    </div>
  );
}
