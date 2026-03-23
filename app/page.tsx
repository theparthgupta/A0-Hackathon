import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth0.getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            Local AI — Your data never leaves your system
          </div>
          <h1 className="text-5xl font-bold text-white">FinanceGuard AI</h1>
          <p className="text-xl text-slate-400">
            Local-first financial auditing with Auth0 Token Vault.
            <br />
            Sovereign AI. Controlled access. Zero data leakage.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-left">
          {[
            {
              icon: "🔐",
              title: "Scoped Tokens",
              desc: "Auth0 Token Vault issues read-only access. AI never holds credentials.",
            },
            {
              icon: "🤖",
              title: "Local Processing",
              desc: "Ollama runs analysis on your machine. Insights only — no raw data sent out.",
            },
            {
              icon: "📋",
              title: "Audit Trail",
              desc: "Every access logged. Every token tracked. Full accountability.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2"
            >
              <div className="text-2xl">{f.icon}</div>
              <div className="font-semibold text-white text-sm">{f.title}</div>
              <div className="text-slate-400 text-xs leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/auth/login"
            className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Get Started — Log In
          </a>
          <a
            href="/auth/login?screen_hint=signup"
            className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Create Account
          </a>
        </div>
      </div>
    </main>
  );
}
