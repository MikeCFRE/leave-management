"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  PlusCircle,
  Clock,
  CalendarDays,
  User,
  CheckSquare,
  Users,
  FileText,
  Building2,
  Settings,
  BarChart2,
  ShieldCheck,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Nav item definitions
// ---------------------------------------------------------------------------

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

type NavSection = {
  title?: string;
  minRole?: "manager" | "admin";
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/requests/new", label: "Request Time Off", icon: PlusCircle },
      { href: "/requests/history", label: "My Requests", icon: Clock },
      { href: "/team/calendar", label: "Team Calendar", icon: CalendarDays },
      { href: "/profile", label: "Profile", icon: User },
    ],
  },
  {
    minRole: "manager",
    items: [
      { href: "/approvals", label: "Approvals", icon: CheckSquare },
    ],
  },
  {
    title: "Admin",
    minRole: "admin",
    items: [
      { href: "/admin/employees", label: "Employees", icon: Users },
      { href: "/admin/policies", label: "Policies", icon: FileText },
      { href: "/admin/departments", label: "Departments", icon: Building2 },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/reports", label: "Reports", icon: BarChart2 },
      { href: "/admin/audit-log", label: "Audit Log", icon: ShieldCheck },
    ],
  },
];

function roleLevel(role: string): number {
  return { employee: 0, manager: 1, admin: 2, super_admin: 3 }[role] ?? 0;
}

function hasAccess(role: string, minRole?: "manager" | "admin"): boolean {
  if (!minRole) return true;
  return roleLevel(role) >= roleLevel(minRole);
}

// ---------------------------------------------------------------------------
// Reusable nav link
// ---------------------------------------------------------------------------

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <item.icon
        className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-blue-600" : "text-slate-400")}
      />
      <span className="flex-1">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
          {item.badge > 99 ? "99+" : item.badge}
        </Badge>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar content (shared between desktop and mobile Sheet)
// ---------------------------------------------------------------------------

export function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "employee";

  return (
    <div className="flex h-full flex-col">
      {/* Logo / Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
          <Briefcase className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">Leave Manager</p>
          <p className="truncate text-xs text-slate-400">5th Coast Properties</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_SECTIONS.map((section, i) => {
          if (!hasAccess(role, section.minRole)) return null;
          return (
            <div key={i}>
              {section.title && (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} onClick={onNavClick} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info footer */}
      {session?.user && (
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-900">
            {session.user.name}
          </p>
          <p className="truncate text-xs capitalize text-slate-400">
            {session.user.role?.replace("_", " ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar (always visible on lg+)
// ---------------------------------------------------------------------------

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-shrink-0">
      <div className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <SidebarContent />
      </div>
    </aside>
  );
}
