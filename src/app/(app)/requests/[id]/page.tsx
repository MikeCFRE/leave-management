"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpCircle,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CFG: Record<
  LeaveStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  pending: { label: "Pending", variant: "outline", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  denied: { label: "Denied", variant: "destructive", icon: XCircle },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
  expired: { label: "Expired", variant: "secondary", icon: AlertCircle },
  draft: { label: "Draft", variant: "outline", icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as LeaveStatus] ?? STATUS_CFG.pending;
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Approval action icon
// ---------------------------------------------------------------------------

const ACTION_CFG: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    color: "text-green-600",
  },
  denied: { label: "Denied", icon: XCircle, color: "text-red-600" },
  escalated: {
    label: "Escalated",
    icon: ArrowUpCircle,
    color: "text-amber-600",
  },
  returned_for_changes: {
    label: "Returned for changes",
    icon: AlertCircle,
    color: "text-slate-500",
  },
};

// ---------------------------------------------------------------------------
// Cancel dialog
// ---------------------------------------------------------------------------

function CancelDialog({
  requestId,
  open,
  onClose,
}: {
  requestId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const cancel = trpc.leave.cancelRequest.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled.");
      utils.leave.getRequestDetail.invalidate({ requestId });
      utils.leave.getMyRequests.invalidate();
      utils.leave.getBalances.invalidate();
      onClose();
      router.push("/requests/history");
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
            The request will be marked as cancelled and any pending balance will
            be restored. This cannot be undone.
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
// Detail row helper
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: request, isLoading, error } = trpc.leave.getRequestDetail.useQuery(
    { requestId: id },
    { retry: false }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">Request not found.</p>
        <Button variant="outline" render={<Link href="/requests/history" />}>
          Back to history
        </Button>
      </div>
    );
  }

  const days = parseFloat(request.totalBusinessDays);
  const canCancel = request.status === "pending";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/requests/history" />}
          aria-label="Back to history"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">
              {request.leaveType.name}
            </h2>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            Submitted{" "}
            {request.submittedAt
              ? formatDistanceToNow(new Date(request.submittedAt), {
                  addSuffix: true,
                })
              : "—"}
          </p>
        </div>
      </div>

      {/* Policy override notice */}
      {request.policyOverrideUsed && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            This request was approved via a{" "}
            <strong>policy override</strong>. Normal policy constraints were
            waived.
          </span>
        </div>
      )}

      {/* Request details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request Details</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <DetailRow label="Leave Type">{request.leaveType.name}</DetailRow>
          <DetailRow label="Start Date">
            {format(new Date(request.startDate), "EEEE, MMMM d, yyyy")}
          </DetailRow>
          <DetailRow label="End Date">
            {format(new Date(request.endDate), "EEEE, MMMM d, yyyy")}
          </DetailRow>
          <DetailRow label="Duration">
            {days.toFixed(1)} business day{days !== 1 ? "s" : ""}
            {" · "}
            {request.totalCalendarDays} calendar day
            {request.totalCalendarDays !== 1 ? "s" : ""}
          </DetailRow>
          {request.reason && (
            <DetailRow label="Reason">{request.reason}</DetailRow>
          )}
          {request.decidedAt && (
            <DetailRow label="Decided">
              {format(new Date(request.decidedAt), "MMM d, yyyy")}
            </DetailRow>
          )}
        </CardContent>
      </Card>

      {/* Approval timeline */}
      {request.approvals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {request.approvals.map((approval, i) => {
              const cfg =
                ACTION_CFG[approval.action] ?? ACTION_CFG.approved;
              const Icon = cfg.icon;
              return (
                <div key={approval.id}>
                  {i > 0 && <Separator className="my-3" />}
                  <div className="flex items-start gap-3">
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.color}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">
                          {approval.approver.firstName}{" "}
                          {approval.approver.lastName}
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            · Tier {approval.tier}
                          </span>
                        </p>
                        <span
                          className={`text-xs font-medium ${cfg.color}`}
                        >
                          {cfg.label}
                          {approval.autoEscalated && " (auto-escalated)"}
                        </span>
                      </div>
                      {approval.comment && (
                        <p className="mt-1 text-xs text-slate-500">
                          {approval.comment}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDistanceToNow(new Date(approval.actedAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {canCancel && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => setCancelOpen(true)}
          >
            Cancel Request
          </Button>
        </div>
      )}

      <CancelDialog
        requestId={id}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />
    </div>
  );
}

