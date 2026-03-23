"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft, Loader2, AlertCircle, Clock,
  CheckCircle2, XCircle, Minus, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import type { LeaveStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee", manager: "Manager",
  admin: "Admin", super_admin: "Super Admin",
};

const STATUS_CFG: Record<LeaveStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
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
// Balance adjust dialog
// ---------------------------------------------------------------------------

type BalanceRow = {
  id: string;
  leaveTypeId: string;
  year: number;
  totalEntitled: string;
  used: string;
  pending: string;
  carriedOver: string;
  adjusted: string;
  leaveType: { id: string; name: string };
};

function AdjustBalanceDialog({
  userId, balance, open, onClose,
}: {
  userId: string;
  balance: BalanceRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const adjust = trpc.admin.adjustBalance.useMutation({
    onSuccess: () => {
      toast.success("Balance adjusted.");
      utils.admin.getUser.invalidate({ userId });
      setDays("");
      setReason("");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!balance) return null;

  const currentAdjusted = parseFloat(balance.adjusted);
  const currentRemaining =
    parseFloat(balance.totalEntitled) +
    parseFloat(balance.carriedOver) +
    currentAdjusted -
    parseFloat(balance.used) -
    parseFloat(balance.pending);

  const parsedDays = parseFloat(days) || 0;
  const newRemaining = currentRemaining + parsedDays;

  const canSubmit = reason.trim().length > 0 && days !== "" && parsedDays !== 0 && !adjust.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !adjust.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Balance — {balance.leaveType.name}</DialogTitle>
          <DialogDescription>
            Enter a positive number to add days or a negative number to subtract. Current remaining:{" "}
            <strong>{currentRemaining.toFixed(1)} days</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adj-days">Adjustment (days)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button" variant="outline" size="icon"
                onClick={() => setDays((d) => (parseFloat(d || "0") - 1).toString())}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="adj-days" type="number" step="0.5"
                placeholder="e.g. 2 or -1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="text-center"
              />
              <Button
                type="button" variant="outline" size="icon"
                onClick={() => setDays((d) => (parseFloat(d || "0") + 1).toString())}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {days !== "" && parsedDays !== 0 && (
              <p className="text-xs text-slate-500">
                New remaining:{" "}
                <span className={newRemaining < 0 ? "font-medium text-red-600" : "font-medium text-slate-700"}>
                  {newRemaining.toFixed(1)} days
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Reason (required)</Label>
            <Textarea
              id="adj-reason" rows={2} maxLength={500}
              placeholder="Reason for this adjustment…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={adjust.isPending}>
            Cancel
          </DialogClose>
          <Button
            onClick={() => adjust.mutate({
              userId,
              leaveTypeId: balance.leaveTypeId,
              year: balance.year,
              adjustmentDays: parsedDays,
              reason: reason.trim(),
            })}
            disabled={!canSubmit}
          >
            {adjust.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Deactivate dialog
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Delete (terminated) employee dialog
// ---------------------------------------------------------------------------

function DeleteEmployeeDialog({
  userId, employeeName, open, onClose,
}: {
  userId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const del = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success(`${employeeName} has been permanently deleted.`);
      utils.admin.listUsers.invalidate();
      router.push("/admin/employees");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !del.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently delete {employeeName}?</DialogTitle>
          <DialogDescription>
            This will permanently remove the employee and all their leave history from the system. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={del.isPending}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => del.mutate({ userId })}
            disabled={del.isPending}
          >
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Deactivate dialog
// ---------------------------------------------------------------------------

function DeactivateDialog({
  userId, employeeName, open, onClose,
}: {
  userId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const deactivate = trpc.admin.deactivateUser.useMutation({
    onSuccess: (result) => {
      toast.success(
        `${employeeName} has been deactivated.${result.cancelledRequests > 0 ? ` ${result.cancelledRequests} pending request(s) cancelled.` : ""}`
      );
      utils.admin.listUsers.invalidate();
      router.push("/admin/employees");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !deactivate.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {employeeName}?</DialogTitle>
          <DialogDescription>
            This will terminate their account, cancel all pending requests, and prevent future logins. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="deact-reason">Reason <span className="font-normal text-slate-400">(optional)</span></Label>
          <Textarea
            id="deact-reason" rows={2} maxLength={500}
            placeholder="Reason for deactivation…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={deactivate.isPending}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => deactivate.mutate({ userId, reason: reason.trim() || undefined })}
            disabled={deactivate.isPending}
          >
            {deactivate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deactivate Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [adjustBalance, setAdjustBalance] = useState<BalanceRow | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: user, isLoading, error } = trpc.admin.getUser.useQuery({ userId: id }, { retry: false });
  const { data: departments = [] } = trpc.admin.listDepartments.useQuery();
  const { data: allUsers } = trpc.admin.listUsers.useQuery({ limit: 100 });

  // Edit form state
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "",
    role: "employee", departmentId: "", managerId: "", employmentStatus: "active",
  });

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId ?? "",
        managerId: user.managerId ?? "",
        employmentStatus: user.employmentStatus,
      });
    }
  }, [user]);

  const utils = trpc.useUtils();
  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Employee updated.");
      utils.admin.getUser.invalidate({ userId: id });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateUser.mutate({
      userId: id,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      role: form.role as "employee" | "manager" | "admin" | "super_admin",
      departmentId: form.departmentId || null,
      managerId: form.managerId || null,
      employmentStatus: form.employmentStatus as "active" | "inactive" | "on_leave" | "terminated",
    });
  }

  const ff = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="py-12 text-center space-y-4">
        <AlertCircle className="mx-auto h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">Employee not found.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/admin/employees" />}>Back to employees</Button>
      </div>
    );
  }

  const employeeName = `${user.firstName} ${user.lastName}`;
  const currentYear = new Date().getFullYear();
  const currentYearBalances = (user.leaveBalances as BalanceRow[]).filter((b) => b.year === currentYear);
  const recentRequests = user.leaveRequests.slice(0, 5);
  const managerOptions = allUsers?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/admin/employees" />} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{employeeName}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{user.email}</p>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ed-first">First Name</Label>
                <Input id="ed-first" value={form.firstName} onChange={ff("firstName")} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-last">Last Name</Label>
                <Input id="ed-last" value={form.lastName} onChange={ff("lastName")} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-email">Email</Label>
              <Input id="ed-email" type="email" value={form.email} onChange={ff("email")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v ?? "" }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.employmentStatus} onValueChange={(v) => setForm((p) => ({ ...p, employmentStatus: v ?? "" }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={form.departmentId || "_none"}
                  onValueChange={(v) => setForm((p) => ({ ...p, departmentId: v === "_none" ? "" : (v ?? "") }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None">
                      {form.departmentId
                        ? (departments.find((d) => d.id === form.departmentId)?.name ?? "")
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Manager</Label>
                <Select
                  value={form.managerId || "_none"}
                  onValueChange={(v) => setForm((p) => ({ ...p, managerId: v === "_none" ? "" : (v ?? "") }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None">
                      {form.managerId
                        ? (() => { const m = managerOptions.find((u) => u.id === form.managerId); return m ? `${m.firstName} ${m.lastName}` : ""; })()
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {managerOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between border-t pt-4">
            <p className="text-xs text-slate-400">
              Hired {format(new Date(user.hireDate), "MMMM d, yyyy")}
            </p>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Leave balances */}
      {currentYearBalances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{currentYear} Leave Balances</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {currentYearBalances.map((b) => {
              const total = parseFloat(b.totalEntitled) + parseFloat(b.carriedOver) + parseFloat(b.adjusted);
              const remaining = total - parseFloat(b.used) - parseFloat(b.pending);
              return (
                <div key={b.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{b.leaveType.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {Math.max(0, remaining).toFixed(1)} / {total.toFixed(1)} days remaining
                      {parseFloat(b.adjusted) !== 0 && (
                        <span className="ml-2 text-blue-600">
                          (adj {parseFloat(b.adjusted) > 0 ? "+" : ""}{parseFloat(b.adjusted).toFixed(1)})
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setAdjustBalance(b)}
                  >
                    Adjust
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent requests */}
      {recentRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Requests</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {recentRequests.map((req) => {
              const days = parseFloat(req.totalBusinessDays);
              return (
                <div key={req.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {(req.leaveType as { name: string }).name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {format(new Date(req.startDate), "MMM d")}
                      {" – "}
                      {format(new Date(req.endDate), "MMM d, yyyy")}
                      {" · "}
                      {days.toFixed(1)}d
                    </p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Danger zone */}
      <Separator />
      {user.employmentStatus !== "terminated" ? (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-red-800">Deactivate Account</p>
            <p className="mt-0.5 text-xs text-red-600">
              Terminates the account and cancels all pending requests.
            </p>
          </div>
          <Button
            variant="destructive" size="sm"
            onClick={() => setDeactivateOpen(true)}
          >
            Deactivate
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-red-800">Delete Employee</p>
            <p className="mt-0.5 text-xs text-red-600">
              Permanently remove this terminated employee and all their data.
            </p>
          </div>
          <Button
            variant="destructive" size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete Permanently
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <AdjustBalanceDialog
        userId={id}
        balance={adjustBalance}
        open={!!adjustBalance}
        onClose={() => setAdjustBalance(null)}
      />
      <DeactivateDialog
        userId={id}
        employeeName={employeeName}
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
      />
      <DeleteEmployeeDialog
        userId={id}
        employeeName={employeeName}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
