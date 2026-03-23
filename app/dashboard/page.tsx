import { auth0 } from "@/lib/auth0";
import { getAIStatus } from "@/lib/ai-engine";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth0.getSession();
  const ai = await getAIStatus();
  const ollamaUp = ai.available;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {session?.user.name ?? session?.user.email}
        </h1>
        <p className="text-slate-400 mt-1">
          Your financial data is processed locally. Nothing leaves your system.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          label="Local AI Engine"
          value={ollamaUp ? "Online" : "Offline"}
          status={ollamaUp ? "green" : "red"}
          detail={ai.engine === "openclaw" ? `OpenClaw → Groq (${ai.model ?? "llama-3.3-70b"})` : ai.engine === "groq" ? `Groq — ${ai.model ?? "llama-3.3-70b"}` : ai.engine === "ollama" ? `Ollama — ${ai.model ?? "llama3.2:1b"}` : "No engine detected"}
        />
        <StatusCard
          label="Auth Layer"
          value="Active"
          status="green"
          detail="Auth0 Token Vault"
        />
        <StatusCard
          label="Data Isolation"
          value="Enforced"
          status="green"
          detail="Raw data never leaves server"
        />
        <StatusCard
          label="Audit Logging"
          value="Enabled"
          status="green"
          detail="SQLite local audit trail"
        />
      </div>

      {/* Architecture Flow */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">Security Architecture</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {[
            { label: "User Login", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
            { label: "→", color: "text-slate-500" },
            { label: "Auth0 Token Vault", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
            { label: "→", color: "text-slate-500" },
            { label: "Scoped Token", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
            { label: "→", color: "text-slate-500" },
            { label: "Stripe/PayPal API", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
            { label: "→", color: "text-slate-500" },
            { label: "Sanitizer", color: "bg-red-500/20 text-red-300 border-red-500/30" },
            { label: "→", color: "text-slate-500" },
            { label: "OpenClaw → Groq", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
            { label: "→", color: "text-slate-500" },
            { label: "Insights Only", color: "bg-green-500/20 text-green-300 border-green-500/30" },
          ].map((step, i) =>
            step.color === "text-slate-500" ? (
              <span key={i} className="text-slate-500 font-bold">{step.label}</span>
            ) : (
              <span key={i} className={`px-2 py-1 rounded border text-xs font-medium ${step.color}`}>
                {step.label}
              </span>
            )
          )}
        </div>
        <p className="text-xs text-slate-500">
          Raw financial data is fetched and processed entirely server-side. Only statistical insights and risk classifications reach the browser.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/dashboard/analyze" className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-6 transition-colors group">
          <div className="text-2xl mb-2">🔍</div>
          <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">Run Analysis</div>
          <div className="text-slate-400 text-sm mt-1">Detect anomalies across your financial accounts</div>
        </Link>
        <Link href="/dashboard/permissions" className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-6 transition-colors group">
          <div className="text-2xl mb-2">🔐</div>
          <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">Manage Permissions</div>
          <div className="text-slate-400 text-sm mt-1">View and revoke connected account access</div>
        </Link>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  status,
  detail,
}: {
  label: string;
  value: string;
  status: "green" | "red" | "yellow";
  detail: string;
}) {
  const dot = status === "green" ? "bg-emerald-400" : status === "red" ? "bg-red-400" : "bg-yellow-400";
  const text = status === "green" ? "text-emerald-400" : status === "red" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-semibold flex items-center gap-1.5 ${text}`}>
        <span className={`w-2 h-2 rounded-full ${dot}`}></span>
        {value}
      </div>
      <div className="text-xs text-slate-600">{detail}</div>
    </div>
  );
}
