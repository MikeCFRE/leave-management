"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Search, PlusCircle, ChevronLeft, ChevronRight,
  Loader2, Copy, Check, UserX, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee", manager: "Manager",
  admin: "Admin", super_admin: "Super Admin",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  employee: "outline", manager: "secondary",
  admin: "default", super_admin: "default",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", on_leave: "secondary",
  inactive: "outline", terminated: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active", on_leave: "On Leave",
  inactive: "Inactive", terminated: "Terminated",
};

// ---------------------------------------------------------------------------
// Create employee dialog
// ---------------------------------------------------------------------------

type CreateForm = {
  firstName: string; lastName: string; email: string;
  role: string; departmentId: string; hireDate: string;
  birthday: string; initialAnnualLeaveDays: string;
};

const EMPTY_FORM: CreateForm = {
  firstName: "", lastName: "", email: "",
  role: "employee", departmentId: "", hireDate: "",
  birthday: "", initialAnnualLeaveDays: "",
};

function CreateEmployeeDialog({
  open, onClose, departments,
}: {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();
  const create = trpc.admin.createUser.useMutation({
    onSuccess: (result) => {
      setTempPassword(result.tempPassword);
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleClose() {
    setForm(EMPTY_FORM);
    setTempPassword(null);
    setCopied(false);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) return;
    create.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      role: form.role as "employee" | "manager" | "admin" | "super_admin",
      departmentId: form.departmentId || undefined,
      hireDate: form.hireDate || undefined,
      birthday: form.birthday || undefined,
      initialAnnualLeaveDays: form.initialAnnualLeaveDays
        ? parseFloat(form.initialAnnualLeaveDays)
        : undefined,
    });
  }

  function copyPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const f = (key: keyof CreateForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        {!tempPassword ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create Employee</DialogTitle>
              <DialogDescription>
                An invitation email with login instructions will be sent to the employee automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ce-first">First Name</Label>
                  <Input id="ce-first" value={form.firstName} onChange={f("firstName")} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ce-last">Last Name</Label>
                  <Input id="ce-last" value={form.lastName} onChange={f("lastName")} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ce-email">Email</Label>
                <Input id="ce-email" type="email" value={form.email} onChange={f("email")} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ce-role">Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v ?? "" }))}>
                    <SelectTrigger id="ce-role" className="w-full">
                      <SelectValue>{ROLE_LABELS[form.role] ?? form.role}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ce-dept">Department</Label>
                  <Select
                    value={form.departmentId}
                    onValueChange={(v) => setForm((p) => ({ ...p, departmentId: v ?? "" }))}
                  >
                    <SelectTrigger id="ce-dept" className="w-full">
                      <SelectValue placeholder="None">
                        {form.departmentId
                          ? (departments.find((d) => d.id === form.departmentId)?.name ?? "None")
                          : "None"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ce-hire">
                    Hire Date <span className="text-slate-400 font-normal">(optional)</span>
                  </Label>
                  <Input id="ce-hire" type="date" value={form.hireDate} onChange={f("hireDate")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ce-bday">
                    Birthday <span className="text-slate-400 font-normal">(optional)</span>
                  </Label>
                  <Input id="ce-bday" type="date" value={form.birthday} onChange={f("birthday")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ce-pto">
                  Initial Annual Leave Days{" "}
                  <span className="text-slate-400 font-normal">(optional — defaults to policy)</span>
                </Label>
                <Input
                  id="ce-pto"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 10"
                  value={form.initialAnnualLeaveDays}
                  onChange={f("initialAnnualLeaveDays")}
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <DialogClose render={<Button variant="outline" />} disabled={create.isPending}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={create.isPending || !form.firstName || !form.lastName || !form.email}
              >
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Employee
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Employee Created</DialogTitle>
              <DialogDescription>
                A login invitation has been sent to <strong>{form.email}</strong> with their temporary password and sign-in link.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500">If the email doesn&apos;t arrive, share this temporary password directly:</p>
              <Label>Temporary Password</Label>
              <div className="flex gap-2">
                <Input value={tempPassword} readOnly className="font-mono" />
                <Button variant="outline" size="icon" onClick={copyPassword} aria-label="Copy password">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bulk import dialog
// ---------------------------------------------------------------------------

function BulkImportDialog({
  open, onClose, departments,
}: {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
}) {
  const [csvText, setCsvText] = useState("");
  const [defaultDeptId, setDefaultDeptId] = useState("");
  const [defaultRole, setDefaultRole] = useState("employee");
  const [results, setResults] = useState<
    { email: string; success: boolean; tempPassword?: string; error?: string }[] | null
  >(null);

  const utils = trpc.useUtils();
  const bulk = trpc.admin.bulkCreateUsers.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleClose() {
    setCsvText("");
    setDefaultDeptId("");
    setDefaultRole("employee");
    setResults(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lines = csvText.trim().split("\n").filter(Boolean);
    const parsed: { firstName: string; lastName: string; email: string; role: "employee" | "manager" | "admin" | "super_admin"; departmentId?: string }[] = [];
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length < 3) continue;
      const [firstName, lastName, email] = parts;
      if (!firstName || !lastName || !email) continue;
      parsed.push({
        firstName,
        lastName,
        email,
        role: defaultRole as "employee" | "manager" | "admin" | "super_admin",
        departmentId: defaultDeptId || undefined,
      });
    }
    if (!parsed.length) {
      toast.error("No valid rows. Format: First Name, Last Name, Email");
      return;
    }
    bulk.mutate({ users: parsed });
  }

  const rowCount = csvText.trim().split("\n").filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        {!results ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Bulk Import Employees</DialogTitle>
              <DialogDescription>
                One employee per line:{" "}
                <code className="text-xs bg-slate-100 px-1 rounded">First Name, Last Name, Email</code>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bi-csv">Employee List</Label>
                <textarea
                  id="bi-csv"
                  className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                  placeholder={"John, Smith, john@company.com\nJane, Doe, jane@company.com"}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />
                <p className="text-xs text-slate-400">{rowCount} row{rowCount !== 1 ? "s" : ""} entered</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bi-role">Default Role</Label>
                  <Select value={defaultRole} onValueChange={(v) => setDefaultRole(v ?? "employee")}>
                    <SelectTrigger id="bi-role" className="w-full">
                      <SelectValue>{ROLE_LABELS[defaultRole] ?? defaultRole}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bi-dept">Default Department</Label>
                  <Select value={defaultDeptId} onValueChange={(v) => setDefaultDeptId(v ?? "")}>
                    <SelectTrigger id="bi-dept" className="w-full">
                      <SelectValue placeholder="None">
                        {defaultDeptId
                          ? (departments.find((d) => d.id === defaultDeptId)?.name ?? "None")
                          : "None"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <DialogClose render={<Button variant="outline" />} disabled={bulk.isPending}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={bulk.isPending || !csvText.trim()}>
                {bulk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {rowCount > 0 ? `${rowCount} Employee${rowCount !== 1 ? "s" : ""}` : "Employees"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Import Complete</DialogTitle>
              <DialogDescription>
                {results.filter((r) => r.success).length} of {results.length} employees created successfully.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-64 overflow-y-auto space-y-1.5">
              {results.map((r) => (
                <div key={r.email} className="flex items-center gap-2 text-sm">
                  <span className={r.success ? "text-green-600 shrink-0" : "text-red-500 shrink-0"}>
                    {r.success ? "✓" : "✗"}
                  </span>
                  <span className="flex-1 truncate text-xs">{r.email}</span>
                  {r.success && r.tempPassword && (
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                      {r.tempPassword}
                    </code>
                  )}
                  {!r.success && (
                    <span className="text-xs text-red-500 truncate max-w-[140px]">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter className="mt-4">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export default function EmployeesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data, isLoading, error } = trpc.admin.listUsers.useQuery({
    search: search || undefined,
    role: (roleFilter || undefined) as "employee" | "manager" | "admin" | "super_admin" | undefined,
    employmentStatus: (statusFilter || undefined) as "active" | "inactive" | "on_leave" | "terminated" | undefined,
    page,
    limit: PAGE_SIZE,
  });

  const { data: departments = [] } = trpc.admin.listDepartments.useQuery();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string | null) => { setter(v === "_all" ? "" : (v ?? "")); setPage(1); };
  }

  if (error?.data?.code === "FORBIDDEN") {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  if (error?.data?.code === "UNAUTHORIZED") {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-sm font-medium text-red-600">Your session is no longer valid.</p>
        <p className="text-xs text-slate-500">Your account status may have changed. Please sign out and sign back in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Employees</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {total > 0 ? `${total} employee${total !== 1 ? "s" : ""}` : "No employees"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Users className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-56"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search className="h-4 w-4" />
          </Button>
        </form>
        <Select value={roleFilter || "_all"} onValueChange={handleFilterChange(setRoleFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Roles">
              {roleFilter ? (ROLE_LABELS[roleFilter] ?? roleFilter) : "All Roles"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter || "_all"} onValueChange={handleFilterChange(setStatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Statuses">
              {statusFilter ? (STATUS_LABELS[statusFilter] ?? statusFilter) : "All Statuses"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </CardContent>
        ) : items.length === 0 ? (
          <CardContent className="py-16 text-center">
            <UserX className="mx-auto mb-3 h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">No employees found.</p>
          </CardContent>
        ) : (
          <>
            {/* Header row */}
            <div className="hidden border-b px-4 pb-2 pt-3 sm:grid sm:grid-cols-[1fr_1fr_auto_auto_auto_auto] sm:gap-4">
              {["Name", "Email", "Role", "Department", "Status", "Hired"].map((h) => (
                <span key={h} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {h}
                </span>
              ))}
            </div>

            <div className="divide-y">
              {items.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-1 px-4 py-2 sm:grid sm:grid-cols-[1fr_1fr_auto_auto_auto_auto] sm:items-center sm:gap-4"
                >
                  <Link
                    href={`/admin/employees/${u.id}`}
                    className="inline-flex items-center text-sm font-medium text-slate-800 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {u.firstName} {u.lastName}
                  </Link>
                  <span className="text-xs text-slate-500 truncate">{u.email}</span>
                  <Badge variant={ROLE_VARIANTS[u.role] ?? "outline"} className="text-xs w-fit">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {(u.department as { name: string } | null)?.name ?? "—"}
                  </span>
                  <Badge variant={STATUS_VARIANTS[u.employmentStatus] ?? "outline"} className="text-xs capitalize w-fit">
                    {u.employmentStatus.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {format(new Date(u.hireDate), "MMM d, yyyy")}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {pages > 1 && (
          <CardFooter className="flex items-center justify-between border-t pt-3">
            <span className="text-xs text-slate-400">Page {page} of {pages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <CreateEmployeeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departments={departments}
      />
      <BulkImportDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        departments={departments}
      />

      {/* Role permission reference */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Role Permissions Reference</p>
        <div className="space-y-2.5">
          {[
            {
              role: "Employee",
              description: "Submit and track their own leave requests. View personal balances and history only.",
            },
            {
              role: "Manager",
              description: "Approve or deny leave for direct reports. View team calendar and department summaries.",
            },
            {
              role: "Admin",
              description: "Manage employees, departments, and leave policies. Access reports and audit log.",
            },
            {
              role: "Super Admin",
              description: "Unrestricted access. Manage all settings, override policies, and administer accounts.",
            },
          ].map(({ role, description }) => (
            <div key={role} className="flex gap-3">
              <span className="mt-0.5 w-24 shrink-0 text-xs font-semibold text-slate-700">{role}</span>
              <span className="text-xs text-slate-500">{description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
