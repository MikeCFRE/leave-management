"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  PlusCircle, Pencil, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeaveType = {
  id: string;
  name: string;
  defaultAnnualDays: number;
  accrualMethod: string;
  maxCarryoverDays: number | null;
  requiresDocumentation: boolean;
  isPaid: boolean;
  isActive: boolean;
};

type PolicyRule = {
  id: string;
  ruleType: string;
  departmentId: string | null;
  leaveTypeId: string | null;
  priority: number;
  effectiveFrom: string | Date;
  effectiveUntil: string | Date | null;
  parameters: Record<string, unknown>;
  isActive: boolean;
};

type BlackoutPeriod = {
  id: string;
  startDate: string | Date;
  endDate: string | Date;
  departmentId: string | null;
  severity: string;
  reason: string;
};

type Department = { id: string; name: string };

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Leave Type Dialog
// ---------------------------------------------------------------------------

type LTForm = {
  name: string;
  defaultAnnualDays: string;
  requiresDocumentation: boolean;
  isPaid: boolean;
};

const EMPTY_LT: LTForm = {
  name: "",
  defaultAnnualDays: "15",
  requiresDocumentation: false,
  isPaid: true,
};

function LeaveTypeDialog({
  mode, lt, open, onClose,
}: {
  mode: "create" | "edit";
  lt: LeaveType | null;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<LTForm>(() =>
    lt
      ? {
          name: lt.name,
          defaultAnnualDays: lt.defaultAnnualDays.toString(),
          requiresDocumentation: lt.requiresDocumentation,
          isPaid: lt.isPaid,
        }
      : EMPTY_LT
  );

  const utils = trpc.useUtils();

  const create = trpc.admin.createLeaveType.useMutation({
    onSuccess: () => {
      toast.success("Leave type created.");
      utils.admin.listLeaveTypes.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.admin.updateLeaveType.useMutation({
    onSuccess: () => {
      toast.success("Leave type updated.");
      utils.admin.listLeaveTypes.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      defaultAnnualDays: Math.max(0, parseFloat(form.defaultAnnualDays) || 0),
      requiresDocumentation: form.requiresDocumentation,
      isPaid: form.isPaid,
    };
    if (mode === "create") {
      create.mutate(payload);
    } else if (lt) {
      update.mutate({ leaveTypeId: lt.id, ...payload });
    }
  }

  const isPending = create.isPending || update.isPending;
  const sf = (key: keyof LTForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create Leave Type" : "Edit Leave Type"}</DialogTitle>
            <DialogDescription>
              {mode === "create" ? "Add a new leave type to the policy catalogue." : "Update leave type settings."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-name">Name</Label>
              <Input id="lt-name" value={form.name} onChange={sf("name")} required placeholder="e.g. Annual Leave" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-days">Default Annual Days</Label>
              <Input id="lt-days" type="number" min={0} step={0.5} value={form.defaultAnnualDays} onChange={sf("defaultAnnualDays")} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPaid}
                  onChange={(e) => setForm((p) => ({ ...p, isPaid: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Paid leave
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiresDocumentation}
                  onChange={(e) => setForm((p) => ({ ...p, requiresDocumentation: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Requires documentation
              </label>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button variant="outline" />} disabled={isPending}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Leave Type Dialog
// ---------------------------------------------------------------------------

function DeleteLeaveTypeDialog({
  lt, open, onClose,
}: { lt: LeaveType | null; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.admin.deleteLeaveType.useMutation({
    onSuccess: () => {
      toast.success("Leave type deactivated.");
      utils.admin.listLeaveTypes.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!lt) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !del.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{lt.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            This will permanently delete the leave type and all associated leave balances and requests. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <DialogClose render={<Button variant="outline" />} disabled={del.isPending}>Cancel</DialogClose>
          <Button
            variant="destructive"
            onClick={() => del.mutate({ leaveTypeId: lt.id })}
            disabled={del.isPending}
          >
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Leave Types tab
// ---------------------------------------------------------------------------

function LeaveTypesTab({ departments: _departments }: { departments: Department[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editLt, setEditLt] = useState<LeaveType | null>(null);
  const [deleteLt, setDeleteLt] = useState<LeaveType | null>(null);

  const { data: leaveTypes = [], isLoading } = trpc.admin.listLeaveTypes.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Leave Type
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : leaveTypes.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No leave types defined.</div>
      ) : (
        <div className="divide-y rounded-lg border">
          {(leaveTypes as unknown as LeaveType[]).map((lt) => (
            <div key={lt.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{lt.name}</p>
                  {!lt.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                  {lt.isPaid && <Badge variant="secondary" className="text-xs">Paid</Badge>}
                  {lt.requiresDocumentation && <Badge variant="outline" className="text-xs">Docs required</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {lt.defaultAnnualDays}d/yr · use it or lose it
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setEditLt(lt)}
                  aria-label={`Edit ${lt.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={() => setDeleteLt(lt)}
                  aria-label={`Delete ${lt.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LeaveTypeDialog mode="create" lt={null} open={createOpen} onClose={() => setCreateOpen(false)} />
      {editLt && (
        <LeaveTypeDialog mode="edit" lt={editLt} open={!!editLt} onClose={() => setEditLt(null)} />
      )}
      <DeleteLeaveTypeDialog lt={deleteLt} open={!!deleteLt} onClose={() => setDeleteLt(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policy Rule Dialog
// ---------------------------------------------------------------------------

const RULE_TYPES = [
  { value: "advance_notice", label: "Advance Notice" },
  { value: "consecutive_cap", label: "Consecutive Day Cap" },
  { value: "coverage_min", label: "Minimum Coverage" },
  { value: "blackout", label: "Blackout (rule)" },
  { value: "balance_override", label: "Balance Override" },
];

const RULE_DESCRIPTIONS: Record<string, string> = {
  advance_notice: "Requires employees to submit leave requests a minimum number of hours before the start date.",
  consecutive_cap: "Limits how many consecutive days off an employee can take, and how many extended leave blocks per year.",
  coverage_min: "Blocks leave approval if it would leave fewer than the required number of employees working at the same time.",
  blackout: "Restricts leave requests during a period. For date-specific blackouts, use the Blackout Periods tab.",
  balance_override: "Allows managers to approve leave that exceeds an employee's available balance by up to a set number of days.",
};

type PRForm = {
  ruleType: string;
  departmentId: string;
  priority: string;
  effectiveFrom: string;
  effectiveUntil: string;
  // advance_notice
  noticeHours: string;
  // consecutive_cap
  maxConsecutiveDays: string;
  minGapDays: string;
  maxLongBlocksPerYear: string;
  longBlockThresholdDays: string;
  // coverage_min
  minHeadcount: string;
  // blackout
  blackoutReason: string;
  // balance_override
  allowNegative: boolean;
  maxOverrideDays: string;
};

const EMPTY_PR: PRForm = {
  ruleType: "advance_notice",
  departmentId: "",
  priority: "10",
  effectiveFrom: "",
  effectiveUntil: "",
  noticeHours: "48",
  maxConsecutiveDays: "7",
  minGapDays: "14",
  maxLongBlocksPerYear: "2",
  longBlockThresholdDays: "5",
  minHeadcount: "2",
  blackoutReason: "",
  allowNegative: false,
  maxOverrideDays: "5",
};

function paramsFromRule(p: Record<string, unknown>): Partial<PRForm> {
  return {
    noticeHours: String((p?.tiers as Array<{ notice_hours: number }>)?.[0]?.notice_hours ?? 48),
    maxConsecutiveDays: String((p?.max_consecutive_days as number) ?? 7),
    minGapDays: String((p?.min_gap_between_blocks_days as number) ?? 14),
    maxLongBlocksPerYear: String((p?.max_long_blocks_per_year as number) ?? 2),
    longBlockThresholdDays: String((p?.long_block_threshold_days as number) ?? 5),
    minHeadcount: String((p?.min_headcount as number) ?? 2),
    blackoutReason: String(p?.reason ?? ""),
    allowNegative: Boolean(p?.allow_negative),
    maxOverrideDays: String((p?.max_override_days as number) ?? 5),
  };
}

function buildParams(form: PRForm): Record<string, unknown> {
  switch (form.ruleType) {
    case "advance_notice":
      return { tiers: [{ min_days: 1, max_days: null, notice_hours: parseInt(form.noticeHours) || 48 }] };
    case "consecutive_cap":
      return {
        max_consecutive_days: parseInt(form.maxConsecutiveDays) || 7,
        min_gap_between_blocks_days: parseInt(form.minGapDays) || 14,
        max_long_blocks_per_year: parseInt(form.maxLongBlocksPerYear) || 2,
        long_block_threshold_days: parseInt(form.longBlockThresholdDays) || 5,
      };
    case "coverage_min":
      return { min_headcount: parseInt(form.minHeadcount) || 2 };
    case "blackout":
      return { reason: form.blackoutReason.trim() || "Company blackout period" };
    case "balance_override":
      return { allow_negative: form.allowNegative, max_override_days: parseInt(form.maxOverrideDays) || 5 };
    default:
      return {};
  }
}

function ruleSummary(rule: PolicyRule): string {
  const p = rule.parameters as Record<string, unknown>;
  switch (rule.ruleType) {
    case "advance_notice": {
      const h = (p?.tiers as Array<{ notice_hours: number }>)?.[0]?.notice_hours ?? 48;
      return `${h} hours advance notice required`;
    }
    case "consecutive_cap": {
      const max = (p?.max_consecutive_days as number) ?? 7;
      return `Max ${max} consecutive days per block`;
    }
    case "coverage_min": {
      const min = (p?.min_headcount as number) ?? 2;
      return `Minimum ${min} employee${min !== 1 ? "s" : ""} must remain working`;
    }
    case "blackout": {
      const reason = (p?.reason as string) ?? "";
      return reason || "Blackout restriction";
    }
    case "balance_override": {
      const max = (p?.max_override_days as number) ?? 5;
      return `Up to ${max} day${max !== 1 ? "s" : ""} over balance allowed`;
    }
    default:
      return "";
  }
}

function PolicyRuleDialog({
  mode, rule, departments, open, onClose,
}: {
  mode: "create" | "edit";
  rule: PolicyRule | null;
  departments: Department[];
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PRForm>(() =>
    rule
      ? {
          ...EMPTY_PR,
          ruleType: rule.ruleType,
          departmentId: rule.departmentId ?? "",
          priority: rule.priority.toString(),
          effectiveFrom: rule.effectiveFrom.toString().slice(0, 10),
          effectiveUntil: rule.effectiveUntil ? rule.effectiveUntil.toString().slice(0, 10) : "",
          ...paramsFromRule(rule.parameters as Record<string, unknown>),
        }
      : EMPTY_PR
  );

  const utils = trpc.useUtils();

  const create = trpc.admin.createPolicyRule.useMutation({
    onSuccess: () => {
      toast.success("Policy rule created.");
      utils.admin.listPolicyRules.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.admin.updatePolicyRule.useMutation({
    onSuccess: () => {
      toast.success("Policy rule updated (new version created).");
      utils.admin.listPolicyRules.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleRuleTypeChange(v: string | null) {
    if (!v) return;
    setForm((p) => ({ ...p, ruleType: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ruleType: form.ruleType as "advance_notice" | "consecutive_cap" | "coverage_min" | "blackout" | "balance_override",
      departmentId: form.departmentId || undefined,
      priority: parseInt(form.priority) || 10,
      effectiveFrom: form.effectiveFrom,
      effectiveUntil: form.effectiveUntil || undefined,
      parameters: buildParams(form),
    };
    if (mode === "create") {
      create.mutate(payload);
    } else if (rule) {
      update.mutate({ ruleId: rule.id, ...payload });
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isPending) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create Policy Rule" : "Edit Policy Rule"}</DialogTitle>
            <DialogDescription>
              {mode === "edit"
                ? "Editing expires the current version and creates a new one with your changes."
                : "New rules are active immediately from the effective date."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Rule description */}
            {RULE_DESCRIPTIONS[form.ruleType] && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {RULE_DESCRIPTIONS[form.ruleType]}
              </p>
            )}

            {/* Rule type + Department */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pr-type">Rule Type</Label>
                <Select value={form.ruleType} onValueChange={handleRuleTypeChange} disabled={mode === "edit"}>
                  <SelectTrigger id="pr-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-dept">Department <span className="font-normal text-slate-400">(opt)</span></Label>
                <Select value={form.departmentId || "_all"} onValueChange={(v) => setForm((p) => ({ ...p, departmentId: v === "_all" ? "" : (v ?? "") }))}>
                  <SelectTrigger id="pr-dept" className="w-full"><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates + Priority */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pr-from">Effective From</Label>
                <Input id="pr-from" type="date" value={form.effectiveFrom} required
                  onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-until">Effective Until <span className="font-normal text-slate-400">(opt)</span></Label>
                <Input id="pr-until" type="date" value={form.effectiveUntil}
                  onChange={(e) => setForm((p) => ({ ...p, effectiveUntil: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-priority">Priority</Label>
                <Input id="pr-priority" type="number" min={1} step={1} value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
              </div>
            </div>

            {/* advance_notice */}
            {form.ruleType === "advance_notice" && (
              <div className="space-y-1.5">
                <Label htmlFor="pr-notice-hours">Required advance notice (hours)</Label>
                <Input id="pr-notice-hours" type="number" min={1} value={form.noticeHours}
                  onChange={(e) => setForm((p) => ({ ...p, noticeHours: e.target.value }))} />
                <p className="text-xs text-slate-400">Example: 48 = employees must submit requests at least 2 days before the start date.</p>
              </div>
            )}

            {/* consecutive_cap */}
            {form.ruleType === "consecutive_cap" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-max-consec">Max consecutive days</Label>
                    <Input id="pr-max-consec" type="number" min={1} value={form.maxConsecutiveDays}
                      onChange={(e) => setForm((p) => ({ ...p, maxConsecutiveDays: e.target.value }))} />
                    <p className="text-xs text-slate-400">Longest single leave block allowed.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-min-gap">Min gap between blocks (days)</Label>
                    <Input id="pr-min-gap" type="number" min={1} value={form.minGapDays}
                      onChange={(e) => setForm((p) => ({ ...p, minGapDays: e.target.value }))} />
                    <p className="text-xs text-slate-400">Mandatory rest between two leave blocks.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-long-thresh">Long block threshold (days)</Label>
                    <Input id="pr-long-thresh" type="number" min={1} value={form.longBlockThresholdDays}
                      onChange={(e) => setForm((p) => ({ ...p, longBlockThresholdDays: e.target.value }))} />
                    <p className="text-xs text-slate-400">A block is &ldquo;long&rdquo; if it exceeds this many days.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-max-long">Max long blocks per year</Label>
                    <Input id="pr-max-long" type="number" min={1} value={form.maxLongBlocksPerYear}
                      onChange={(e) => setForm((p) => ({ ...p, maxLongBlocksPerYear: e.target.value }))} />
                    <p className="text-xs text-slate-400">How many extended blocks are allowed per year.</p>
                  </div>
                </div>
              </div>
            )}

            {/* coverage_min */}
            {form.ruleType === "coverage_min" && (
              <div className="space-y-1.5">
                <Label htmlFor="pr-min-head">Minimum employees required at work</Label>
                <Input id="pr-min-head" type="number" min={1} value={form.minHeadcount}
                  onChange={(e) => setForm((p) => ({ ...p, minHeadcount: e.target.value }))} />
                <p className="text-xs text-slate-400">Leave will be blocked if fewer than this many employees would be working at the same time.</p>
              </div>
            )}

            {/* blackout */}
            {form.ruleType === "blackout" && (
              <div className="space-y-1.5">
                <Label htmlFor="pr-blackout-reason">Reason</Label>
                <Input id="pr-blackout-reason" value={form.blackoutReason}
                  onChange={(e) => setForm((p) => ({ ...p, blackoutReason: e.target.value }))}
                  placeholder="e.g. Peak season, Annual close" />
              </div>
            )}

            {/* balance_override */}
            {form.ruleType === "balance_override" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-max-override">Max extra days over balance</Label>
                  <Input id="pr-max-override" type="number" min={0} value={form.maxOverrideDays}
                    onChange={(e) => setForm((p) => ({ ...p, maxOverrideDays: e.target.value }))} />
                  <p className="text-xs text-slate-400">Managers can approve up to this many days beyond the employee&apos;s available balance.</p>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowNegative}
                    onChange={(e) => setForm((p) => ({ ...p, allowNegative: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Allow negative balance (employee can accrue &ldquo;leave debt&rdquo;)
                </label>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button variant="outline" />} disabled={isPending}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending || !form.effectiveFrom}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create Rule" : "Save (new version)"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Policy Rule Dialog
// ---------------------------------------------------------------------------

function DeletePolicyRuleDialog({
  rule, open, onClose,
}: { rule: PolicyRule | null; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.admin.deletePolicyRule.useMutation({
    onSuccess: () => {
      toast.success("Policy rule deleted.");
      utils.admin.listPolicyRules.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!rule) return null;
  const label = RULE_TYPES.find((t) => t.value === rule.ruleType)?.label ?? rule.ruleType;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !del.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{label}&rdquo; rule?</DialogTitle>
          <DialogDescription>
            This will permanently delete the policy rule. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <DialogClose render={<Button variant="outline" />} disabled={del.isPending}>Cancel</DialogClose>
          <Button
            variant="destructive"
            onClick={() => del.mutate({ ruleId: rule.id })}
            disabled={del.isPending}
          >
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Policy Rules tab
// ---------------------------------------------------------------------------

function PolicyRulesTab({ departments }: { departments: Department[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState<PolicyRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<PolicyRule | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  const { data: rules = [], isLoading } = trpc.admin.listPolicyRules.useQuery({ activeOnly: false });

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const filtered = typeFilter
    ? (rules as unknown as PolicyRule[]).filter((r) => r.ruleType === typeFilter)
    : (rules as unknown as PolicyRule[]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={typeFilter || "_all"} onValueChange={(v) => setTypeFilter(v === "_all" ? "" : (v ?? ""))}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All rule types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All rule types</SelectItem>
            {RULE_TYPES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No policy rules found.</div>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {RULE_TYPES.find((t) => t.value === rule.ruleType)?.label ?? rule.ruleType}
                  </p>
                  {!rule.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                  <Badge variant="secondary" className="text-xs">p{rule.priority}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {rule.departmentId ? deptMap.get(rule.departmentId) ?? rule.departmentId : "All departments"}
                  {" · "}
                  From {rule.effectiveFrom.toString().slice(0, 10)}
                  {rule.effectiveUntil ? ` → ${rule.effectiveUntil.toString().slice(0, 10)}` : ""}
                </p>
                {ruleSummary(rule) && (
                  <p className="mt-0.5 text-xs text-slate-400 italic">{ruleSummary(rule)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setEditRule(rule)}
                  aria-label="Edit rule"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={() => setDeleteRule(rule)}
                  aria-label="Delete rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PolicyRuleDialog mode="create" rule={null} departments={departments} open={createOpen} onClose={() => setCreateOpen(false)} />
      {editRule && (
        <PolicyRuleDialog mode="edit" rule={editRule} departments={departments} open={!!editRule} onClose={() => setEditRule(null)} />
      )}
      {deleteRule && (
        <DeletePolicyRuleDialog rule={deleteRule} open={!!deleteRule} onClose={() => setDeleteRule(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blackout Dialog
// ---------------------------------------------------------------------------

type BOForm = {
  startDate: string;
  endDate: string;
  departmentId: string;
  severity: string;
  reason: string;
};

const EMPTY_BO: BOForm = { startDate: "", endDate: "", departmentId: "", severity: "soft_block", reason: "" };

function BlackoutDialog({
  departments, open, onClose,
}: { departments: Department[]; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<BOForm>(EMPTY_BO);

  const utils = trpc.useUtils();
  const create = trpc.admin.createBlackoutPeriod.useMutation({
    onSuccess: () => {
      toast.success("Blackout period created.");
      utils.admin.listBlackoutPeriods.invalidate();
      setForm(EMPTY_BO);
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate || !form.endDate || !form.reason.trim()) return;
    create.mutate({
      startDate: form.startDate,
      endDate: form.endDate,
      departmentId: form.departmentId || undefined,
      severity: form.severity as "soft_block" | "hard_block",
      reason: form.reason.trim(),
    });
  }

  const sf = (key: keyof BOForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !create.isPending) { setForm(EMPTY_BO); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Blackout Period</DialogTitle>
            <DialogDescription>Restrict leave requests during a date range.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bo-start">Start Date</Label>
                <Input id="bo-start" type="date" value={form.startDate} onChange={sf("startDate")} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bo-end">End Date</Label>
                <Input id="bo-end" type="date" value={form.endDate} onChange={sf("endDate")} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bo-dept">Department <span className="font-normal text-slate-400">(opt)</span></Label>
                <Select value={form.departmentId} onValueChange={(v) => setForm((p) => ({ ...p, departmentId: v === "_all" ? "" : (v ?? "") }))}>
                  <SelectTrigger id="bo-dept" className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bo-severity">Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((p) => ({ ...p, severity: v ?? "" }))}>
                  <SelectTrigger id="bo-severity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft_block">Soft (warn)</SelectItem>
                    <SelectItem value="hard_block">Hard (block)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bo-reason">Reason</Label>
              <Input id="bo-reason" value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="e.g. Year-end close" required />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button variant="outline" />} disabled={create.isPending}>Cancel</DialogClose>
            <Button type="submit" disabled={create.isPending || !form.startDate || !form.endDate || !form.reason.trim()}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Blackout
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBlackoutDialog({
  id, label, open, onClose,
}: { id: string; label: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.admin.deleteBlackoutPeriod.useMutation({
    onSuccess: () => {
      toast.success("Blackout period deleted.");
      utils.admin.listBlackoutPeriods.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !del.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Blackout Period</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the blackout period <strong>{label}</strong>? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <DialogClose render={<Button variant="outline" />} disabled={del.isPending}>Cancel</DialogClose>
          <Button variant="destructive" onClick={() => del.mutate({ blackoutPeriodId: id })} disabled={del.isPending}>
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Blackout tab
// ---------------------------------------------------------------------------

function BlackoutTab({ departments }: { departments: Department[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: blackouts = [], isLoading } = trpc.admin.listBlackoutPeriods.useQuery();
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Blackout Period
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (blackouts as BlackoutPeriod[]).length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No blackout periods defined.</div>
      ) : (
        <div className="divide-y rounded-lg border">
          {(blackouts as BlackoutPeriod[]).map((bo) => {
            const startStr = bo.startDate.toString().slice(0, 10);
            const endStr = bo.endDate.toString().slice(0, 10);
            const label = `${startStr} – ${endStr}`;
            return (
              <div key={bo.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {format(parseISO(startStr), "MMM d")} – {format(parseISO(endStr), "MMM d, yyyy")}
                    </p>
                    <Badge
                      variant={bo.severity === "hard_block" ? "destructive" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {bo.severity}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {bo.departmentId ? deptMap.get(bo.departmentId) ?? bo.departmentId : "All departments"}
                    {" · "}
                    {bo.reason}
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600"
                  onClick={() => setDeleteTarget({ id: bo.id, label })}
                  aria-label="Delete blackout"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <BlackoutDialog departments={departments} open={createOpen} onClose={() => setCreateOpen(false)} />
      {deleteTarget && (
        <DeleteBlackoutDialog
          id={deleteTarget.id}
          label={deleteTarget.label}
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "leave-types" | "policy-rules" | "blackout";

export default function PoliciesPage() {
  const [tab, setTab] = useState<Tab>("leave-types");

  const { data: departments = [], error } = trpc.admin.listDepartments.useQuery();

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
        <h2 className="text-xl font-semibold text-slate-900">Policy Editor</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Manage leave types, policy rules, and blackout periods.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        <TabButton active={tab === "leave-types"} onClick={() => setTab("leave-types")}>Leave Types</TabButton>
        <TabButton active={tab === "policy-rules"} onClick={() => setTab("policy-rules")}>Policy Rules</TabButton>
        <TabButton active={tab === "blackout"} onClick={() => setTab("blackout")}>Blackout Periods</TabButton>
      </div>

      {/* Content */}
      {tab === "leave-types" && <LeaveTypesTab departments={departments} />}
      {tab === "policy-rules" && <PolicyRulesTab departments={departments} />}
      {tab === "blackout" && <BlackoutTab departments={departments} />}
    </div>
  );
}
