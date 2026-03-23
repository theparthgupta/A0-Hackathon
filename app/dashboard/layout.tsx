import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();
  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800">
          <div className="font-bold text-emerald-400 text-lg">FinanceGuard</div>
          <div className="text-slate-500 text-xs mt-0.5">Local AI Auditor</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {[
            { href: "/dashboard", label: "Overview", icon: "⬡" },
            { href: "/dashboard/analyze", label: "Analyze", icon: "🔍" },
            { href: "/dashboard/permissions", label: "Permissions", icon: "🔐" },
            { href: "/dashboard/audit", label: "Audit Trail", icon: "📋" },
            { href: "/dashboard/demo", label: "Attack Demo", icon: "🛡️" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="px-3 py-2 text-xs text-slate-500 truncate">
            {session.user.email}
          </div>
          <a
            href="/auth/logout"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full"
          >
            <span>↩</span> Log out
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
