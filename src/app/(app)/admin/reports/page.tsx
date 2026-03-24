"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { Loader2, BarChart3, Clock, TrendingUp, DollarSign, Activity, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportType =
  | "all_requests"
  | "pto_utilization"
  | "approval_turnaround"
  | "override_frequency"
  | "balance_liability"
  | "absenteeism";

const REPORT_TABS: { type: ReportType; label: string; icon: React.ElementType }[] = [
  { type: "all_requests", label: "All Requests", icon: List },
  { type: "pto_utilization", label: "PTO Utilization", icon: BarChart3 },
  { type: "approval_turnaround", label: "Approval Turnaround", icon: Clock },
  { type: "override_frequency", label: "Override Frequency", icon: TrendingUp },
  { type: "balance_liability", label: "Balance Liability", icon: DollarSign },
  { type: "absenteeism", label: "Absenteeism", icon: Activity },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TabButton({
  active, onClick, icon: Icon, children,
}: { active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Filter bar (shared date range + department)
// ---------------------------------------------------------------------------

type Filters = {
  startDate: string;
  endDate: string;
  departmentId: string;
};

function FilterBar({
  filters,
  departments,
  onChange,
}: {
  filters: Filters;
  departments: { id: string; name: string }[];
  onChange: (f: Filters) => void;
}) {
  const [local, setLocal] = useState(filters);

  function apply() {
    onChange(local);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          value={local.startDate}
          onChange={(e) => setLocal((p) => ({ ...p, startDate: e.target.value }))}
          className="w-36"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          value={local.endDate}
          onChange={(e) => setLocal((p) => ({ ...p, endDate: e.target.value }))}
          className="w-36"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Department</Label>
        <Select
          value={local.departmentId || "_all"}
          onValueChange={(v) => setLocal((p) => ({ ...p, departmentId: v === "_all" ? "" : (v ?? "") }))}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={apply} variant="outline">Run Report</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual report views
// ---------------------------------------------------------------------------

function PtoUtilizationReport({
  data,
  deptMap,
  ltMap,
}: {
  data: { departmentId: string | null; leaveTypeId: string | null; totalUsedDays: number | string; requestCount: number }[];
  deptMap: Map<string, string>;
  ltMap: Map<string, string>;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data for this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs font-semibold uppercase tracking-wider text-slate-400">
            <th className="pb-2 pr-4 text-left">Department</th>
            <th className="pb-2 pr-4 text-left">Leave Type</th>
            <th className="pb-2 pr-4 text-right">Days Used</th>
            <th className="pb-2 text-right">Requests</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr key={i} className="text-slate-700">
              <td className="py-2 pr-4">{row.departmentId ? deptMap.get(row.departmentId) ?? row.departmentId : "—"}</td>
              <td className="py-2 pr-4">{row.leaveTypeId ? ltMap.get(row.leaveTypeId) ?? row.leaveTypeId : "—"}</td>
              <td className="py-2 pr-4 text-right font-medium">{parseFloat(row.totalUsedDays as string).toFixed(1)}</td>
              <td className="py-2 text-right">{row.requestCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalTurnaroundReport({
  data,
}: {
  data: { stats: { averageHours: number; medianHours: number; p95Hours: number; totalRequests: number } };
}) {
  const { averageHours, medianHours, p95Hours, totalRequests } = data.stats;
  function fmtHours(h: number) {
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Total Requests" value={totalRequests.toString()} />
      <StatCard label="Avg Turnaround" value={fmtHours(averageHours)} sub="average" />
      <StatCard label="Median" value={fmtHours(medianHours)} sub="50th percentile" />
      <StatCard label="P95" value={fmtHours(p95Hours)} sub="95th percentile" />
    </div>
  );
}

function OverrideFrequencyReport({
  data,
  userMap,
}: {
  data: { userId: string; overrideCount: number }[];
  userMap: Map<string, string>;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No overrides in this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs font-semibold uppercase tracking-wider text-slate-400">
            <th className="pb-2 pr-4 text-left">Employee</th>
            <th className="pb-2 text-right">Override Count</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr key={i} className="text-slate-700">
              <td className="py-2 pr-4">{userMap.get(row.userId) ?? row.userId}</td>
              <td className="py-2 text-right font-medium">
                <Badge variant={row.overrideCount >= 3 ? "destructive" : "secondary"} className="text-xs">
                  {row.overrideCount}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceLiabilityReport({
  data,
  userMap,
  ltMap,
}: {
  data: { userId: string; leaveTypeId: string; remainingDays: number | string }[];
  userMap: Map<string, string>;
  ltMap: Map<string, string>;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No balance data available.</p>;
  }
  const totalDays = data.reduce((s, r) => s + parseFloat(r.remainingDays as string), 0);
  return (
    <div className="space-y-4">
      <StatCard label="Total Accrued Liability" value={`${totalDays.toFixed(1)} days`} sub="across all employees and leave types" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wider text-slate-400">
              <th className="pb-2 pr-4 text-left">Employee</th>
              <th className="pb-2 pr-4 text-left">Leave Type</th>
              <th className="pb-2 text-right">Remaining Days</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((row, i) => (
              <tr key={i} className="text-slate-700">
                <td className="py-2 pr-4">{userMap.get(row.userId) ?? row.userId}</td>
                <td className="py-2 pr-4">{ltMap.get(row.leaveTypeId) ?? row.leaveTypeId}</td>
                <td className="py-2 text-right font-medium">{parseFloat(row.remainingDays as string).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbsenteeismReport({
  data,
  deptMap,
}: {
  data: { year: number; month: number; departmentId: string | null; totalDays: number | string; requestCount: number }[];
  deptMap: Map<string, string>;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data for this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs font-semibold uppercase tracking-wider text-slate-400">
            <th className="pb-2 pr-4 text-left">Period</th>
            <th className="pb-2 pr-4 text-left">Department</th>
            <th className="pb-2 pr-4 text-right">Total Days</th>
            <th className="pb-2 text-right">Requests</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr key={i} className="text-slate-700">
              <td className="py-2 pr-4">{format(new Date(row.year, row.month - 1), "MMM yyyy")}</td>
              <td className="py-2 pr-4">{row.departmentId ? deptMap.get(row.departmentId) ?? row.departmentId : "All"}</td>
              <td className="py-2 pr-4 text-right font-medium">{parseFloat(row.totalDays as string).toFixed(1)}</td>
              <td className="py-2 text-right">{row.requestCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// All Requests report (admin view of every leave request)
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  denied: "destructive",
  cancelled: "secondary",
  pending: "outline",
  expired: "secondary",
  draft: "outline",
};

const ALL_REQ_PAGE_SIZE = 25;

function AllRequestsReport({ departments }: { departments: { id: string; name: string }[] }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.listAllLeaveRequests.useQuery({
    status: (statusFilter || undefined) as "pending" | "approved" | "denied" | "cancelled" | "expired" | "draft" | undefined,
    departmentId: deptFilter || undefined,
    page,
    limit: ALL_REQ_PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  function handleFilter(setter: (v: string) => void) {
    return (v: string | null) => { setter(v === "_all" ? "" : (v ?? "")); setPage(1); };
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter || "_all"} onValueChange={handleFilter(setStatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses">
              {statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            {["pending", "approved", "denied", "cancelled", "expired"].map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptFilter || "_all"} onValueChange={handleFilter(setDeptFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All departments">
              {deptFilter ? departments.find((d) => d.id === deptFilter)?.name : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto self-end text-xs text-slate-400">
          {total > 0 ? `${total} request${total !== 1 ? "s" : ""}` : "No requests"}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No requests match your filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-4 text-left">Employee</th>
                  <th className="pb-2 pr-4 text-left">Leave Type</th>
                  <th className="pb-2 pr-4 text-left">Dates</th>
                  <th className="pb-2 pr-4 text-right">Days</th>
                  <th className="pb-2 pr-4 text-left">Submitted</th>
                  <th className="pb-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((req) => {
                  const r = req as typeof req & {
                    user: { id: string; firstName: string; lastName: string };
                    leaveType: { id: string; name: string };
                  };
                  return (
                    <tr key={r.id} className="text-slate-700">
                      <td className="py-2 pr-4 font-medium">{r.user.firstName} {r.user.lastName}</td>
                      <td className="py-2 pr-4">{r.leaveType.name}</td>
                      <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">
                        {format(parseLocalDate(r.startDate), "MMM d")} – {format(parseLocalDate(r.endDate), "MMM d, yyyy")}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{parseFloat(r.totalBusinessDays).toFixed(1)}</td>
                      <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">
                        {r.submittedAt ? format(new Date(r.submittedAt), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="py-2">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="text-xs capitalize">
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Page {page} of {pages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function defaultFilters(): Filters {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(now, "yyyy-MM-dd"),
    departmentId: "",
  };
}

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>("all_requests");
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const { data: departments = [], error: deptError } = trpc.admin.listDepartments.useQuery();
  const { data: leaveTypes = [] } = trpc.admin.listLeaveTypes.useQuery();
  const { data: usersData } = trpc.admin.listUsers.useQuery({ limit: 200 });

  const deptMap = useMemo(
    () => new Map((departments as { id: string; name: string }[]).map((d) => [d.id, d.name])),
    [departments]
  );
  const ltMap = useMemo(
    () => new Map((leaveTypes as { id: string; name: string }[]).map((lt) => [lt.id, lt.name])),
    [leaveTypes]
  );
  const userMap = useMemo(() => {
    const items = usersData?.items ?? [];
    return new Map(
      (items as { id: string; firstName: string; lastName: string }[]).map((u) => [
        u.id,
        `${u.firstName} ${u.lastName}`,
      ])
    );
  }, [usersData]);

  const analyticsReportType = activeReport !== "all_requests" ? activeReport : null;
  const { data: reportData, isLoading, isFetching } = trpc.admin.generateReport.useQuery(
    {
      type: analyticsReportType as Exclude<typeof activeReport, "all_requests">,
      dateFrom: filters.startDate,
      dateTo: filters.endDate,
      departmentId: filters.departmentId || undefined,
    },
    { enabled: !!filters.startDate && !!filters.endDate && analyticsReportType !== null }
  );

  if (deptError?.data?.code === "FORBIDDEN") {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  function renderReport() {
    if (activeReport === "all_requests") {
      return <AllRequestsReport departments={departments as { id: string; name: string }[]} />;
    }

    if (isLoading || isFetching) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      );
    }
    if (!reportData) return <p className="py-8 text-center text-sm text-slate-400">Run the report to see results.</p>;

    const rd = reportData as Record<string, unknown>;

    switch (activeReport) {
      case "pto_utilization":
        return <PtoUtilizationReport data={(rd.rows as Parameters<typeof PtoUtilizationReport>[0]["data"]) ?? []} deptMap={deptMap} ltMap={ltMap} />;
      case "approval_turnaround":
        return <ApprovalTurnaroundReport data={rd as Parameters<typeof ApprovalTurnaroundReport>[0]["data"]} />;
      case "override_frequency":
        return <OverrideFrequencyReport data={(rd.rows as Parameters<typeof OverrideFrequencyReport>[0]["data"]) ?? []} userMap={userMap} />;
      case "balance_liability":
        return <BalanceLiabilityReport data={(rd.rows as Parameters<typeof BalanceLiabilityReport>[0]["data"]) ?? []} userMap={userMap} ltMap={ltMap} />;
      case "absenteeism":
        return <AbsenteeismReport data={(rd.rows as Parameters<typeof AbsenteeismReport>[0]["data"]) ?? []} deptMap={deptMap} />;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Reports</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Generate HR insights across leave usage, approvals, and balances.
        </p>
      </div>

      {/* Report type tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {REPORT_TABS.map(({ type, label, icon }) => (
          <TabButton
            key={type}
            active={activeReport === type}
            onClick={() => setActiveReport(type)}
            icon={icon}
          >
            {label}
          </TabButton>
        ))}
      </div>

      {/* Filters — not shown for the All Requests tab which has its own filters */}
      {activeReport !== "all_requests" && (
        <FilterBar
          filters={filters}
          departments={departments as { id: string; name: string }[]}
          onChange={setFilters}
        />
      )}

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-500">
            {REPORT_TABS.find((t) => t.type === activeReport)?.label ?? "Report"}
          </CardTitle>
        </CardHeader>
        <CardContent>{renderReport()}</CardContent>
      </Card>
    </div>
  );
}
