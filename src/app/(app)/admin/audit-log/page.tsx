"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, ChevronDown, ChevronRight as ChevronRightSm } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIT_ACTIONS = [
  "leave_request.submitted",
  "leave_request.approved",
  "leave_request.denied",
  "leave_request.cancelled",
  "leave_request.escalated",
  "leave_request.expired",
  "leave_request.override_approved",
  "policy.created",
  "policy.updated",
  "policy.overridden",
  "user.created",
  "user.updated",
  "user.deactivated",
  "user.password_changed",
  "user.account_locked",
  "balance.adjusted",
  "balance.accrued",
  "balance.carried_over",
];

const ENTITY_TYPES = [
  "leave_request",
  "policy",
  "user",
  "balance",
];

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "leave_request.approved": "default",
  "leave_request.denied": "destructive",
  "leave_request.cancelled": "outline",
  "leave_request.escalated": "secondary",
  "user.deactivated": "destructive",
  "user.account_locked": "destructive",
  "policy.overridden": "secondary",
};

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Row component (with collapsible old/new values)
// ---------------------------------------------------------------------------

type AuditEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  user?: { id: string; firstName: string; lastName: string } | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  timestamp: string | Date;
};

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasValues = entry.oldValues || entry.newValues;
  const ts = typeof entry.timestamp === "string" ? parseISO(entry.timestamp) : entry.timestamp;
  const actorName = entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : null;

  return (
    <div className="border-b last:border-0">
      <div
        className={[
          "flex items-start gap-3 px-4 py-3",
          hasValues ? "cursor-pointer hover:bg-slate-50" : "",
        ].join(" ")}
        onClick={() => hasValues && setExpanded((v) => !v)}
        role={hasValues ? "button" : undefined}
        tabIndex={hasValues ? 0 : undefined}
        onKeyDown={(e) => { if (hasValues && (e.key === "Enter" || e.key === " ")) setExpanded((v) => !v); }}
      >
        {/* Expand chevron */}
        <div className="mt-0.5 w-4 shrink-0 text-slate-400">
          {hasValues ? (
            expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRightSm className="h-4 w-4" />
          ) : null}
        </div>

        {/* Timestamp */}
        <div className="w-36 shrink-0">
          <p className="text-xs text-slate-500">{format(ts, "MMM d, yyyy")}</p>
          <p className="text-xs text-slate-400">{format(ts, "HH:mm:ss")}</p>
        </div>

        {/* Action */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={ACTION_VARIANT[entry.action] ?? "outline"}
              className="text-xs font-mono"
            >
              {entry.action}
            </Badge>
            <span className="text-xs text-slate-500">
              {entry.entityType ?? "—"}
              {entry.entityId && (
                <>{" "}<span className="font-mono text-slate-700">{entry.entityId.slice(0, 8)}…</span></>
              )}
            </span>
          </div>
          {actorName && (
            <p className="mt-0.5 text-xs text-slate-400">by {actorName}</p>
          )}
        </div>
      </div>

      {/* Expanded diff */}
      {expanded && hasValues && (
        <div className="mx-4 mb-3 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          {entry.oldValues && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Before</p>
              <pre className="overflow-x-auto text-xs text-slate-600 whitespace-pre-wrap break-all">
                {JSON.stringify(entry.oldValues, null, 2)}
              </pre>
            </div>
          )}
          {entry.newValues && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">After</p>
              <pre className="overflow-x-auto text-xs text-slate-600 whitespace-pre-wrap break-all">
                {JSON.stringify(entry.newValues, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = trpc.admin.getAuditLog.useQuery({
    action: action || undefined,
    entityType: entityType || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const items = (data?.items ?? []) as AuditEntry[];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  function resetPage() { setPage(1); }

  if (error?.data?.code === "FORBIDDEN") {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Audit Log</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {total > 0 ? `${total.toLocaleString()} event${total !== 1 ? "s" : ""}` : "No events found"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action || "_all"} onValueChange={(v) => { setAction(v === "_all" ? "" : v); resetPage(); }}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Entity Type</Label>
          <Select value={entityType || "_all"} onValueChange={(v) => { setEntityType(v === "_all" ? "" : v); resetPage(); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All types</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            className="w-36"
          />
        </div>
        {(action || entityType || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setAction(""); setEntityType(""); setDateFrom(""); setDateTo(""); resetPage(); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Log */}
      <Card>
        {isLoading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </CardContent>
        ) : items.length === 0 ? (
          <CardContent className="py-16 text-center">
            <p className="text-sm text-slate-400">No audit events match your filters.</p>
          </CardContent>
        ) : (
          <>
            <div className="divide-y">
              {items.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>

            {pages > 1 && (
              <CardFooter className="flex items-center justify-between border-t pt-3">
                <span className="text-xs text-slate-400">Page {page} of {pages}</span>
                <div className="flex gap-1">
                  <Button
                    variant="outline" size="icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline" size="icon"
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page >= pages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardFooter>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
