"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { countBusinessDays, formatDate } from "@/lib/date-utils";

export default function NewRequestPage() {
  const router = useRouter();
  const [range, setRange] = useState<DateRange | undefined>();
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [reason, setReason] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [forceSubmit, setForceSubmit] = useState(false);

  const year = new Date().getFullYear();
  const { data: balances, isLoading: loadingBalances } =
    trpc.leave.getBalances.useQuery({ year });

  const utils = trpc.useUtils();
  const submit = trpc.leave.submitRequest.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Leave request submitted.");
        utils.leave.getMyRequests.invalidate();
        utils.leave.getBalances.invalidate();
        router.push(`/requests/${result.request.id}`);
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const businessDays =
    range?.from && range?.to
      ? countBusinessDays(formatDate(range.from), formatDate(range.to))
      : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveTypeId || !range?.from || !range?.to) return;
    submit.mutate({
      leaveTypeId,
      startDate: formatDate(range.from),
      endDate: formatDate(range.to),
      reason: reason.trim() || undefined,
      forceSubmit: forceSubmit || undefined,
    });
  }

  const validationErrors =
    submit.data && !submit.data.success ? submit.data.errors : [];
  const validationWarnings = submit.data?.warnings ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const canSubmit =
    !!leaveTypeId && !!range?.from && !!range?.to && !submit.isPending;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href="/dashboard" />}
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Request Time Off
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Submit a new leave request for approval.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave Details</CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Leave type */}
            <div className="space-y-1.5">
              <Label htmlFor="leave-type">Leave Type</Label>
              {loadingBalances ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading types…
                </div>
              ) : (
                <Select
                  value={leaveTypeId}
                  onValueChange={(v) => setLeaveTypeId(v as string)}
                >
                  <SelectTrigger id="leave-type" className="h-11 w-full">
                    <SelectValue placeholder="Select leave type">
                      {leaveTypeId
                        ? (balances?.find((b) => b.leaveTypeId === leaveTypeId)?.leaveType.name ?? "")
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {balances?.map((b) => {
                      const remaining =
                        parseFloat(b.totalEntitled) +
                        parseFloat(b.carriedOver) +
                        parseFloat(b.adjusted) -
                        parseFloat(b.used) -
                        parseFloat(b.pending);
                      return (
                        <SelectItem key={b.leaveTypeId} value={b.leaveTypeId} label={b.leaveType.name}>
                          {b.leaveType.name}
                          {"  ·  "}
                          {Math.max(0, remaining).toFixed(1)} days remaining
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Date range */}
            <div className="space-y-1.5">
              <Label>Date Range</Label>
              <Popover
                open={calOpen}
                onOpenChange={(o) => {
                  setCalOpen(o);
                  if (o) setRange(undefined);
                }}
              >
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                      {range?.from ? (
                        range.to ? (
                          <>
                            {format(range.from, "MMM d, yyyy")}
                            {" – "}
                            {format(range.to, "MMM d, yyyy")}
                          </>
                        ) : (
                          format(range.from, "MMM d, yyyy")
                        )
                      ) : (
                        <span className="text-slate-400">
                          Pick a date range
                        </span>
                      )}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={(r) => {
                      setRange(r);
                      if (r?.from && r?.to && r.from.getTime() !== r.to.getTime()) {
                        setCalOpen(false);
                      }
                    }}
                    disabled={{ before: today }}
                    numberOfMonths={1}
                  />
                </PopoverContent>
              </Popover>

              {range?.from && range?.to && (
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {businessDays}
                  </span>{" "}
                  business day{businessDays !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="reason">
                Reason{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Brief description of your leave request…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>

            {/* Policy violations — shown as a warning but submission still allowed */}
            {validationErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Policy violations detected
                </div>
                <ul className="ml-5 list-disc space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="text-sm text-red-700">
                      {err.message}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-red-600">
                  You may still submit this request. Your approver will see these violations and can approve or deny accordingly.
                </p>
                {!forceSubmit && (
                  <button
                    type="button"
                    onClick={() => setForceSubmit(true)}
                    className="text-xs font-medium text-red-700 underline hover:text-red-900"
                  >
                    Submit anyway
                  </button>
                )}
                {forceSubmit && (
                  <p className="text-xs font-medium text-red-700">
                    ✓ Will submit with policy override
                  </p>
                )}
              </div>
            )}

            {/* Warnings */}
            {validationWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Warnings
                </div>
                <ul className="mt-1.5 ml-5 list-disc space-y-0.5">
                  {validationWarnings.map((w, i) => (
                    <li key={i} className="text-sm text-amber-700">
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>

          <CardFooter className="justify-end gap-3">
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={!canSubmit}>
              {submit.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Request
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
