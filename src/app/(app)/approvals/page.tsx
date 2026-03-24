"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import {
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  ShieldAlert,
  Loader2,
  Users,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionType = "approve" | "deny" | "escalate" | "override";

type ActiveDialog = {
  type: ActionType;
  requestId: string;
  employeeName: string;
} | null;

// ---------------------------------------------------------------------------
// Coverage badge
// ---------------------------------------------------------------------------

function CoverageBadge({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const color =
    pct >= 50
      ? "border-red-200 bg-red-50 text-red-700"
      : pct >= 25
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${color}`}
    >
      <Users className="h-3 w-3" />
      {pct.toFixed(0)}% dept. absent
    </span>
  );
}

// ---------------------------------------------------------------------------
// Queue card
// ---------------------------------------------------------------------------

type QueueItem = {
  request: {
    id: string;
    startDate: string | Date;
    endDate: string | Date;
    totalBusinessDays: string;
    totalCalendarDays: number;
    reason: string | null;
    submittedAt: Date | string | null;
    policyOverrideUsed: boolean;
    policyViolations?: { rule: string; message: string }[] | null;
    user: { id: string; firstName: string; lastName: string };
    leaveType: { id: string; name: string };
  };
  coveragePercent: number;
  policyCompliant: boolean;
};

function QueueCard({
  item,
  onAction,
}: {
  item: QueueItem;
  onAction: (type: ActionType, requestId: string, employeeName: string) => void;
}) {
  const { request, coveragePercent, policyCompliant } = item;
  const days = parseFloat(request.totalBusinessDays);
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {/* Top row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {employeeName}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {request.leaveType.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CoverageBadge pct={coveragePercent} />
            {request.policyOverrideUsed && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                <AlertCircle className="h-3 w-3" />
                Policy violations
              </span>
            )}
            {!policyCompliant && !request.policyOverrideUsed && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                <ShieldAlert className="h-3 w-3" />
                Policy override
              </span>
            )}
          </div>
          {request.policyOverrideUsed && request.policyViolations && request.policyViolations.length > 0 && (
            <ul className="mt-1 ml-1 list-disc list-inside space-y-0.5">
              {request.policyViolations.map((v, i) => (
                <li key={i} className="text-xs text-red-600">{v.message}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Dates + days */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            <span className="font-medium">
              {format(parseLocalDate(request.startDate), "MMM d")}
            </span>
            {" – "}
            <span className="font-medium">
              {format(parseLocalDate(request.endDate), "MMM d, yyyy")}
            </span>
          </span>
          <span className="text-slate-400">
            {days.toFixed(1)} business day{days !== 1 ? "s" : ""}
            {" · "}
            {request.totalCalendarDays} calendar day
            {request.totalCalendarDays !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Reason */}
        {request.reason && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 italic">
            "{request.reason}"
          </p>
        )}

        {/* Submitted */}
        {request.submittedAt && (
          <p className="text-xs text-slate-400">
            Submitted {format(new Date(request.submittedAt), "MMM d, yyyy")}
            {" · "}
            <Link
              href={`/requests/${request.id}`}
              className="text-blue-600 hover:underline"
            >
              View details
            </Link>
          </p>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => onAction("approve", request.id, employeeName)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => onAction("deny", request.id, employeeName)}
          >
            <XCircle className="h-3.5 w-3.5" />
            Deny
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onAction("escalate", request.id, employeeName)}
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            Escalate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => onAction("override", request.id, employeeName)}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Override
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action dialogs
// ---------------------------------------------------------------------------

const DIALOG_COPY: Record<
  ActionType,
  {
    title: (name: string) => string;
    description: string;
    requiresInput: boolean;
    inputLabel: string;
    inputPlaceholder: string;
    inputRequired: boolean;
    inputMinLength?: number;
    confirmLabel: string;
    confirmVariant: "default" | "destructive";
  }
> = {
  approve: {
    title: (name) => `Approve ${name}'s request?`,
    description: "Leave will be approved and the employee will be notified.",
    requiresInput: true,
    inputLabel: "Comment (optional)",
    inputPlaceholder: "Add a note for the employee…",
    inputRequired: false,
    confirmLabel: "Approve",
    confirmVariant: "default",
  },
  deny: {
    title: (name) => `Deny ${name}'s request?`,
    description:
      "The employee will be notified with your reason. A reason is required.",
    requiresInput: true,
    inputLabel: "Reason for denial",
    inputPlaceholder: "Explain why this request cannot be approved…",
    inputRequired: true,
    confirmLabel: "Deny Request",
    confirmVariant: "destructive",
  },
  escalate: {
    title: (name) => `Escalate ${name}'s request?`,
    description:
      "The request will be forwarded to the next approver in the chain.",
    requiresInput: false,
    inputLabel: "",
    inputPlaceholder: "",
    inputRequired: false,
    confirmLabel: "Escalate",
    confirmVariant: "default",
  },
  override: {
    title: (name) => `Override policy for ${name}'s request?`,
    description:
      "This will force-approve the request, bypassing any policy violations. A detailed justification is required and will be audited.",
    requiresInput: true,
    inputLabel: "Justification (min. 20 characters)",
    inputPlaceholder:
      "Provide a detailed reason for overriding policy constraints…",
    inputRequired: true,
    inputMinLength: 20,
    confirmLabel: "Override & Approve",
    confirmVariant: "destructive",
  },
};

function ActionDialog({
  dialog,
  onClose,
}: {
  dialog: ActiveDialog;
  onClose: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const utils = trpc.useUtils();

  function handleSuccess(msg: string) {
    toast.success(msg);
    utils.approval.getPendingQueue.invalidate();
    utils.leave.getMyRequests.invalidate();
    onClose();
  }

  const approve = trpc.approval.approve.useMutation({
    onSuccess: () => handleSuccess("Request approved."),
    onError: (err) => toast.error(err.message),
  });
  const deny = trpc.approval.deny.useMutation({
    onSuccess: () => handleSuccess("Request denied."),
    onError: (err) => toast.error(err.message),
  });
  const escalate = trpc.approval.escalate.useMutation({
    onSuccess: () => handleSuccess("Request escalated."),
    onError: (err) => toast.error(err.message),
  });
  const override = trpc.approval.override.useMutation({
    onSuccess: () => handleSuccess("Request approved via policy override."),
    onError: (err) => toast.error(err.message),
  });

  if (!dialog) return null;

  const copy = DIALOG_COPY[dialog.type];
  const isPending =
    approve.isPending ||
    deny.isPending ||
    escalate.isPending ||
    override.isPending;

  const canConfirm =
    !isPending &&
    (!copy.inputRequired ||
      (inputValue.trim().length >= (copy.inputMinLength ?? 1)));

  function handleConfirm() {
    const id = dialog!.requestId;
    if (dialog!.type === "approve") {
      approve.mutate({ requestId: id, comment: inputValue.trim() || undefined });
    } else if (dialog!.type === "deny") {
      deny.mutate({ requestId: id, comment: inputValue.trim() });
    } else if (dialog!.type === "escalate") {
      escalate.mutate({ requestId: id });
    } else if (dialog!.type === "override") {
      override.mutate({ requestId: id, reason: inputValue.trim() });
    }
  }

  return (
    <Dialog
      open={!!dialog}
      onOpenChange={(o) => {
        if (!o && !isPending) {
          setInputValue("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title(dialog.employeeName)}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {copy.requiresInput && (
          <div className="space-y-1.5">
            <Label htmlFor="action-input">{copy.inputLabel}</Label>
            <Textarea
              id="action-input"
              placeholder={copy.inputPlaceholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={3}
              maxLength={500}
            />
            {copy.inputMinLength && inputValue.trim().length > 0 && (
              <p className="text-xs text-slate-400">
                {inputValue.trim().length} / {copy.inputMinLength} characters
                minimum
              </p>
            )}
          </div>
        )}

        {dialog.type === "override" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This action is logged and may be reviewed in the audit trail.
          </div>
        )}

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            disabled={isPending}
          >
            Cancel
          </DialogClose>
          <Button
            variant={copy.confirmVariant}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApprovalsPage() {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const { data: queue, isLoading } = trpc.approval.getPendingQueue.useQuery();

  const items = queue ?? [];

  function openDialog(
    type: ActionType,
    requestId: string,
    employeeName: string
  ) {
    setActiveDialog({ type, requestId, employeeName });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Approval Queue
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {isLoading
              ? "Loading…"
              : items.length > 0
                ? `${items.length} request${items.length !== 1 ? "s" : ""} awaiting your review`
                : "No pending requests"}
          </p>
        </div>
        {items.length > 0 && (
          <Badge variant="outline" className="text-sm px-3 py-1">
            {items.length} pending
          </Badge>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">All caught up!</p>
          <p className="mt-1 text-sm text-slate-400">
            No leave requests are waiting for your approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <QueueCard
              key={item.request.id}
              item={item as QueueItem}
              onAction={openDialog}
            />
          ))}
        </div>
      )}

      {/* Action dialog */}
      <ActionDialog
        dialog={activeDialog}
        onClose={() => setActiveDialog(null)}
      />
    </div>
  );
}
