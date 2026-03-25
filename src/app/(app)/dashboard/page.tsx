"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import {
  PlusCircle, Clock, CheckCircle2, XCircle,
  AlertCircle, ArrowRight, CalendarDays, Loader2,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import type { LeaveStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CFG: Record<LeaveStatus, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending:   { label: "Pending",   variant: "outline",     icon: Clock },
  approved:  { label: "Approved",  variant: "default",     icon: CheckCircle2 },
  denied:    { label: "Denied",    variant: "destructive", icon: XCircle },
  cancelled: { label: "Cancelled", variant: "secondary",   icon: XCircle },
  expired:   { label: "Expired",   variant: "secondary",   icon: AlertCircle },
  draft:     { label: "Draft",     variant: "outline",     icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as LeaveStatus] ?? STATUS_CFG.pending;
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs shrink-0">
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Balance card
// ---------------------------------------------------------------------------

type BalanceItem = {
  id: string;
  leaveType: { name: string };
  totalEntitled: string;
  used: string;
  pending: string;
  carriedOver: string;
  adjusted: string;
};

function BalanceCard({ b }: { b: BalanceItem }) {
  const entitled  = parseFloat(b.totalEntitled);
  const used      = parseFloat(b.used);
  const pending   = parseFloat(b.pending);
  const carried   = parseFloat(b.carriedOver);
  const adjusted  = parseFloat(b.adjusted);
  const total     = entitled + carried + adjusted;
  const remaining = total - used - pending;
  const pct       = total > 0 ? Math.min(100, ((used + pending) / total) * 100) : 0;

  const numColor  = remaining <= 0 ? "text-red-600" : remaining <= 3 ? "text-amber-600" : "text-slate-900";
  const barColor  = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">
          {b.leaveType.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-1.5">
          <span className={`text-3xl font-bold tabular-nums ${numColor}`}>
            {remaining <= 0 ? "0" : remaining.toFixed(1)}
          </span>
          <span className="text-sm text-slate-400 pb-0.5">/ {total.toFixed(1)} days</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span><span className="font-medium text-slate-700">{used.toFixed(1)}</span> used</span>
          {pending > 0 && (
            <span><span className="font-medium text-amber-600">{pending.toFixed(1)}</span> pending</span>
          )}
          {carried > 0 && (
            <span><span className="font-medium text-slate-600">{carried.toFixed(1)}</span> carried</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent request row
// ---------------------------------------------------------------------------

type RequestItem = {
  id: string;
  leaveType: { name: string };
  startDate: string | Date;
  endDate: string | Date;
  totalBusinessDays: string;
  status: string;
};

function RequestRow({ req }: { req: RequestItem }) {
  const days = parseFloat(req.totalBusinessDays);
  return (
    <Link
      href={`/requests/${req.id}`}
      className="flex items-center justify-between gap-4 -mx-4 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{req.leaveType.name}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {format(parseLocalDate(req.startDate.toString()), "MMM d")}
          {" – "}
          {format(parseLocalDate(req.endDate.toString()), "MMM d, yyyy")}
          {" · "}
          {days.toFixed(1)} day{days !== 1 ? "s" : ""}
        </p>
      </div>
      <StatusBadge status={req.status} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session } = useSession();
  const role       = session?.user?.role ?? "employee";
  const isManager  = ["manager", "admin", "super_admin"].includes(role);
  const year       = new Date().getFullYear();

  const { data: balances,     isLoading: loadingBalances  } = trpc.leave.getBalances.useQuery({ year });
  const { data: requestsData, isLoading: loadingRequests  } = trpc.leave.getMyRequests.useQuery({ limit: 5, page: 1 });
  const { data: queue } = trpc.approval.getPendingQueue.useQuery(undefined, { enabled: isManager });

  const pendingCount = queue?.length ?? 0;
  const firstName    = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Welcome back, {firstName}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Button nativeButton={false} render={<Link href="/requests/new" />}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Request Time Off
        </Button>
      </div>

      {/* Manager alert */}
      {isManager && pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              You have{" "}
              <strong>{pendingCount} pending approval{pendingCount !== 1 ? "s" : ""}</strong>{" "}
              awaiting your review.
            </span>
          </div>
          <Button
            variant="outline" size="sm"
            nativeButton={false}
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
            render={<Link href="/approvals" />}
          >
            Review now
          </Button>
        </div>
      )}

      {/* Leave balances */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {year} Leave Balances
          </h3>
          <Link href="/requests/new" className="inline-flex items-center py-2 text-xs text-blue-600 hover:underline">
            Request leave →
          </Link>
        </div>

        {loadingBalances ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : !balances?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-400">
              No leave balances for {year}. Contact your administrator.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {balances.map((b) => <BalanceCard key={b.id} b={b} />)}
          </div>
        )}
      </section>

      <Separator />

      {/* Recent requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent Requests
          </h3>
          <Link href="/requests/history" className="inline-flex items-center gap-0.5 py-2 text-xs text-blue-600 hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <Card>
          {loadingRequests ? (
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </CardContent>
          ) : !requestsData?.items.length ? (
            <CardContent className="py-10 text-center">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">No requests yet.</p>
              <Button
                variant="outline" size="sm" className="mt-4"
                nativeButton={false}
                render={<Link href="/requests/new" />}
              >
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                Request Time Off
              </Button>
            </CardContent>
          ) : (
            <CardContent className="divide-y py-0">
              {requestsData.items.map((req) => <RequestRow key={req.id} req={req} />)}
            </CardContent>
          )}

          {(requestsData?.total ?? 0) > 5 && (
            <CardFooter>
              <Button
                variant="ghost" size="sm"
                nativeButton={false}
                className="w-full gap-1 text-xs text-slate-500"
                render={<Link href="/requests/history" />}
              >
                View all {requestsData!.total} requests
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardFooter>
          )}
        </Card>
      </section>

    </div>
  );
}
