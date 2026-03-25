"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Menu, LogOut, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "./Sidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";

// ---------------------------------------------------------------------------
// Derive page title from current path
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/requests/new": "Request Time Off",
  "/requests/history": "My Requests",
  "/team/calendar": "Team Calendar",
  "/profile": "Profile",
  "/approvals": "Approvals",
  "/admin/employees": "Employees",
  "/admin/policies": "Policies",
  "/admin/departments": "Departments",
  "/admin/settings": "Settings",
  "/admin/reports": "Reports",
  "/admin/audit-log": "Audit Log",
};

function usePageTitle(): string {
  const pathname = usePathname();
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefix = Object.keys(PAGE_TITLES).find((k) => pathname.startsWith(k + "/"));
  return prefix ? PAGE_TITLES[prefix] : "Leave Management";
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function Header() {
  const { data: session } = useSession();
  const pageTitle = usePageTitle();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const user = session?.user;

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 gap-4">
        {/* Left: mobile hamburger + page title */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-11 w-11 flex-shrink-0"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5 text-slate-500" />
          </Button>
          <span className="text-lg font-semibold text-slate-900 truncate">
            {pageTitle}
          </span>
        </div>

        {/* Right: notification bell + user menu */}
        <div className="flex items-center gap-1">
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="h-11 gap-2 pl-2 pr-1">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-32 truncate">
                    {user?.name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              }
            />

            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-slate-400 truncate capitalize">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <User className="mr-2 h-4 w-4" />
                Profile &amp; Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile sidebar Sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-56 p-0 bg-slate-950 border-r-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavClick={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
