"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import {
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import type { LeaveStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTER_TABS: { label: string; value: LeaveStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Denied", value: "denied" },
  { label: "Cancelled", value: "cancelled" },
];

// ---------------------------------------------------------------------------
// Cancel confirmation dialog
// ---------------------------------------------------------------------------

function CancelDialog({
  requestId,
  isApproved,
  open,
  onClose,
}: {
  requestId: string;
  isApproved: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const cancel = trpc.leave.cancelRequest.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled.");
      utils.leave.getMyRequests.invalidate();
      utils.leave.getBalances.invalidate();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            {isApproved
              ? "The approved request will be cancelled, your leave balance will be restored, and your approver will be notified. This cannot be undone."
              : "The request will be marked as cancelled and any pending balance will be restored. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Keep request
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => cancel.mutate({ requestId })}
            disabled={cancel.isPending}
          >
            {cancel.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Yes, cancel it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

function EditDialog({
  request,
  open,
  onClose,
}: {
  request: { id: string; startDate: string; endDate: string; reason?: string | null; status: string };
  open: boolean;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState(
    typeof request.startDate === "string"
      ? request.startDate.slice(0, 10)
      : format(new Date(request.startDate), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(
    typeof request.endDate === "string"
      ? request.endDate.slice(0, 10)
      : format(new Date(request.endDate), "yyyy-MM-dd")
  );
  const [reason, setReason] = useState(request.reason ?? "");

  const utils = trpc.useUtils();
  const edit = trpc.leave.editRequest.useMutation({
    onSuccess: () => {
      toast.success(
        request.status === "approved"
          ? "Request updated and reset to pending for re-approval."
          : "Request updated."
      );
      utils.leave.getMyRequests.invalidate();
      utils.leave.getBalances.invalidate();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (startDate > endDate) {
      toast.error("Start date must be before or equal to end date.");
      return;
    }
    edit.mutate({ requestId: request.id, startDate, endDate, reason: reason || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Leave Request</DialogTitle>
            <DialogDescription>
              {request.status === "approved"
                ? "Editing an approved request will reset it to pending and notify your approver."
                : "Update the dates or reason for your request."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="edit-start" className="text-sm font-medium text-slate-700">
                  Start date
                </label>
                <input
                  id="edit-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-end" className="text-sm font-medium text-slate-700">
                  End date
                </label>
                <input
                  id="edit-end"
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-reason" className="text-sm font-medium text-slate-700">
                Reason <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="edit-reason"
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add a note for your approver…"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={edit.isPending}>
              {edit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

export default function RequestHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; isApproved: boolean } | null>(null);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
    status: string;
  } | null>(null);

  const { data, isLoading } = trpc.leave.getMyRequests.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  function handleFilterChange(f: LeaveStatus | "all") {
    setStatusFilter(f);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Request History
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {total > 0 ? `${total} request${total !== 1 ? "s" : ""}` : "No requests yet"}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/requests/new" />}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Request
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleFilterChange(tab.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </CardContent>
        ) : items.length === 0 ? (
          <CardContent className="py-16 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">
              {statusFilter === "all"
                ? "No requests yet."
                : `No ${statusFilter} requests.`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              nativeButton={false}
              render={<Link href="/requests/new" />}
            >
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Request Time Off
            </Button>
          </CardContent>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden border-b px-4 pb-2 pt-3 sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4">
              {["Leave Type", "Dates", "Days", "Submitted", "Status"].map(
                (h) => (
                  <span
                    key={h}
                    className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    {h}
                  </span>
                )
              )}
            </div>

            <div className="divide-y">
              {items.map((req) => {
                const days = parseFloat(req.totalBusinessDays);
                return (
                  <div
                    key={req.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center sm:gap-4"
                  >
                    {/* Leave type */}
                    <Link
                      href={`/requests/${req.id}`}
                      className="text-sm font-medium text-slate-800 hover:underline"
                    >
                      {req.leaveType.name}
                    </Link>

                    {/* Dates */}
                    <span className="text-xs text-slate-500">
                      {format(parseLocalDate(req.startDate), "MMM d")}
                      {" – "}
                      {format(parseLocalDate(req.endDate), "MMM d, yyyy")}
                    </span>

                    {/* Days */}
                    <span className="text-xs text-slate-500 tabular-nums">
                      {days.toFixed(1)}d
                    </span>

                    {/* Submitted */}
                    <span className="text-xs text-slate-400">
                      {req.submittedAt
                        ? format(new Date(req.submittedAt), "MMM d, yyyy")
                        : "—"}
                    </span>

                    {/* Status + actions */}
                    <div className="flex items-center gap-2">
                      <StatusBadge status={req.status} />
                      {(req.status === "pending" || req.status === "approved") && (
                        <>
                          <button
                            onClick={() =>
                              setEditTarget({
                                id: req.id,
                                startDate: req.startDate as string,
                                endDate: req.endDate as string,
                                reason: req.reason,
                                status: req.status,
                              })
                            }
                            className="text-xs text-slate-500 hover:underline"
                            title="Edit request"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setCancelTarget({ id: req.id, isApproved: req.status === "approved" })}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <CardFooter className="flex items-center justify-between border-t pt-3">
            <span className="text-xs text-slate-400">
              Page {page} of {pages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Cancel dialog */}
      {cancelTarget && (
        <CancelDialog
          requestId={cancelTarget.id}
          isApproved={cancelTarget.isApproved}
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* Edit dialog */}
      {editTarget && (
        <EditDialog
          request={editTarget}
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
