"use client";

import { useState } from "react";
import { Building2, PlusCircle, Loader2, Pencil, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Department = {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  totalHeadcount: number;
  minCoverage: number | null;
};

// ---------------------------------------------------------------------------
// Department form dialog (create + edit)
// ---------------------------------------------------------------------------

type DeptForm = { name: string; headcount: string; minCoverage: string; parentId: string };
const EMPTY: DeptForm = { name: "", headcount: "0", minCoverage: "", parentId: "" };

function DeptDialog({
  mode, dept, allDepts, open, onClose,
}: {
  mode: "create" | "edit";
  dept: Department | null;
  allDepts: Department[];
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DeptForm>(() =>
    dept
      ? { name: dept.name, headcount: dept.totalHeadcount.toString(), minCoverage: dept.minCoverage?.toString() ?? "", parentId: dept.parentId ?? "" }
      : EMPTY
  );

  const resetFor = (d: Department | null) =>
    setForm(d ? { name: d.name, headcount: d.totalHeadcount.toString(), minCoverage: d.minCoverage?.toString() ?? "", parentId: d.parentId ?? "" } : EMPTY);

  const utils = trpc.useUtils();

  const create = trpc.admin.createDepartment.useMutation({
    onSuccess: () => {
      toast.success("Department created.");
      utils.admin.listDepartments.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.admin.updateDepartment.useMutation({
    onSuccess: () => {
      toast.success("Department updated.");
      utils.admin.listDepartments.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const headcount = Math.max(0, parseInt(form.headcount) || 0);
    const minCoverage = form.minCoverage !== "" ? Math.max(0, parseInt(form.minCoverage)) : undefined;
    const parentId = form.parentId || undefined;

    if (mode === "create") {
      create.mutate({ name: form.name.trim(), totalHeadcount: headcount, minCoverage, parentId });
    } else if (dept) {
      update.mutate({ departmentId: dept.id, name: form.name.trim(), totalHeadcount: headcount, minCoverage: minCoverage ?? null, parentId: parentId ?? null });
    }
  }

  const isPending = create.isPending || update.isPending;
  const ff = (key: keyof DeptForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  // Exclude self (and its children to avoid cycles) from parent options
  const parentOptions = allDepts.filter((d) => d.id !== dept?.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isPending) {
          resetFor(dept);
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create Department" : "Edit Department"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Add a new department to your organisation."
                : "Update department details."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input id="dept-name" value={form.name} onChange={ff("name")} required placeholder="e.g. Leasing" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-parent">
                Parent Department{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Select
                value={form.parentId || "_none"}
                onValueChange={(v) => setForm((p) => ({ ...p, parentId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger id="dept-parent" className="w-full">
                  <SelectValue placeholder="None (top-level)">
                    {form.parentId
                      ? (parentOptions.find((d) => d.id === form.parentId)?.name ?? "")
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None (top-level)</SelectItem>
                  {parentOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dept-headcount">Total Headcount</Label>
                <Input
                  id="dept-headcount" type="number" min={0} step={1}
                  value={form.headcount} onChange={ff("headcount")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dept-coverage">
                  Min Coverage{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </Label>
                <Input
                  id="dept-coverage" type="number" min={0} step={1}
                  placeholder="e.g. 2"
                  value={form.minCoverage} onChange={ff("minCoverage")}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button variant="outline" />} disabled={isPending}>
              Cancel
            </DialogClose>
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
// Page
// ---------------------------------------------------------------------------

export default function DepartmentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);

  const { data: rawDepts = [], isLoading, error } = trpc.admin.listDepartments.useQuery();
  const departments = rawDepts as Department[];

  // Separate top-level and sub-departments for grouped display
  const topLevel = departments.filter((d) => !d.parentId);
  const childMap = new Map<string, Department[]>();
  departments.filter((d) => d.parentId).forEach((d) => {
    if (!childMap.has(d.parentId!)) childMap.set(d.parentId!, []);
    childMap.get(d.parentId!)!.push(d);
  });

  if (error?.data?.code === "FORBIDDEN") {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  function DeptCard({ dept, isChild }: { dept: Department; isChild?: boolean }) {
    return (
      <Card key={dept.id} className={isChild ? "border-l-4 border-l-slate-200" : ""}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              {isChild && (
                <div className="mb-1 flex items-center gap-1 text-xs text-slate-400">
                  <ChevronRight className="h-3 w-3" />
                  <span>{dept.parent?.name ?? "Sub-department"}</span>
                </div>
              )}
              <p className="text-sm font-semibold text-slate-900">{dept.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  <span className="font-medium text-slate-700">{dept.totalHeadcount}</span> headcount
                </span>
                {dept.minCoverage != null && (
                  <span>
                    <span className="font-medium text-slate-700">{dept.minCoverage}</span> min coverage
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setEditDept(dept)}
              aria-label={`Edit ${dept.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Departments</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {departments.length > 0
              ? `${departments.length} department${departments.length !== 1 ? "s" : ""}`
              : "No departments yet"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Department
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : departments.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">No departments yet.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
            Create your first department
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {topLevel.map((dept) => (
            <div key={dept.id} className="space-y-2">
              <DeptCard dept={dept} />
              {(childMap.get(dept.id) ?? []).map((child) => (
                <div key={child.id} className="ml-6">
                  <DeptCard dept={child} isChild />
                </div>
              ))}
            </div>
          ))}
          {/* Orphaned children (parent was deleted or is outside the list) */}
          {departments
            .filter((d) => d.parentId && !departments.find((p) => p.id === d.parentId))
            .map((dept) => (
              <DeptCard key={dept.id} dept={dept} isChild />
            ))}
        </div>
      )}

      {/* Dialogs */}
      <DeptDialog
        mode="create"
        dept={null}
        allDepts={departments}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {editDept && (
        <DeptDialog
          mode="edit"
          dept={editDept}
          allDepts={departments}
          open={!!editDept}
          onClose={() => setEditDept(null)}
        />
      )}
    </div>
  );
}
