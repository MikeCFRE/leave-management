"use client";

import { useState, useMemo } from "react";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { Cake, Check, ChevronLeft, ChevronRight, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { start: toYMD(first), end: toYMD(last) };
}

function buildGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // Sun=0
  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  return cells;
}

const WEEK_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Stable per-person color derived from userId
const PERSON_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-pink-500",
];

function personColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0x7fffffff;
  }
  return PERSON_COLORS[hash % PERSON_COLORS.length];
}

function initials(firstName: string, lastName: string): string {
  return ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalEvent = {
  id: string;
  status: string;
  startDate: unknown;
  endDate: unknown;
  totalBusinessDays: string;
  user: { id: string; firstName: string; lastName: string; departmentId: string | null };
  leaveType: { id: string; name: string };
};

// ---------------------------------------------------------------------------
// Initials chip
// ---------------------------------------------------------------------------

function InitialsChip({ userId, firstName, lastName, pending }: { userId: string; firstName: string; lastName: string; pending: boolean }) {
  const ini = initials(firstName, lastName);
  return (
    <span
      title={`${firstName} ${lastName}${pending ? " (pending)" : ""}`}
      className={[
        "inline-flex items-center justify-center rounded text-white font-bold leading-none",
        "h-4 w-4 text-[8px] shrink-0",
        pending ? "bg-slate-400" : personColor(userId),
      ].join(" ")}
    >
      {ini}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Month grid (large cells with initials)
// ---------------------------------------------------------------------------

function BigMonth({
  year,
  month,
  peopleMap,
  importantDates,
  holidayDates,
  birthdayDates,
  selectedDay,
  todayStr,
  onSelect,
}: {
  year: number;
  month: number;
  peopleMap: Map<string, CalEvent[]>;
  importantDates: Set<string>;
  holidayDates: Map<string, string>; // date → holiday name
  birthdayDates: Set<string>;
  selectedDay: string | null;
  todayStr: string;
  onSelect: (d: string) => void;
}) {
  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {format(new Date(year, month, 1), "MMMM yyyy")}
      </p>
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-px mb-0.5">
        {WEEK_LABELS.map((lbl, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400 pb-0.5">
            {lbl}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {grid.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="h-14" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const events = peopleMap.get(dateStr) ?? [];
          const approved = events.filter((e) => e.status === "approved");
          const pending = events.filter((e) => e.status === "pending");
          const mmdd = dateStr.slice(5);
          const hasBirthday = birthdayDates.has(mmdd);
          const isImportant = importantDates.has(dateStr);
          const holidayName = holidayDates.get(dateStr);
          const isHoliday = !!holidayName;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;
          const allChips = [
            ...approved.map((e) => ({ ...e, pending: false })),
            ...pending.map((e) => ({ ...e, pending: true })),
          ];
          const visibleChips = allChips.slice(0, 4);
          const overflow = allChips.length - visibleChips.length;

          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr === selectedDay ? "" : dateStr)}
              className={[
                "relative flex flex-col rounded p-0.5 h-14 text-left transition-colors",
                isHoliday ? "bg-slate-100 hover:bg-slate-200" : "hover:bg-slate-50",
                isSelected ? "ring-2 ring-blue-500 ring-inset" : "",
                !isHoliday && isImportant ? "ring-2 ring-yellow-400 ring-inset bg-yellow-50" : "",
                !isHoliday && isSelected && isImportant ? "ring-2 ring-blue-500 ring-inset bg-yellow-50" : "",
              ].filter(Boolean).join(" ")}
            >
              {/* Day number */}
              <span className={[
                "text-[11px] leading-tight self-end pr-0.5",
                isToday ? "font-bold text-blue-600" : "font-normal text-slate-600",
              ].join(" ")}>
                {day}
              </span>
              {/* Birthday dot */}
              {hasBirthday && !isHoliday && (
                <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
              {/* Important date star */}
              {isImportant && !isHoliday && (
                <span className="absolute top-0.5 left-0.5 text-yellow-500">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 stroke-yellow-500" />
                </span>
              )}
              {/* Holiday chip */}
              {isHoliday && (
                <div className="flex flex-wrap gap-px mt-0.5">
                  <span
                    title={holidayName}
                    className="inline-flex items-center justify-center h-4 w-4 rounded bg-green-600 shrink-0"
                  >
                    <Star className="h-2.5 w-2.5 fill-slate-300 stroke-slate-300" />
                  </span>
                </div>
              )}
              {/* Initials chips */}
              {allChips.length > 0 && (
                <div className="flex flex-wrap gap-px mt-0.5">
                  {visibleChips.map((e, ci) => (
                    <InitialsChip
                      key={`${e.id}-${ci}`}
                      userId={e.user.id}
                      firstName={e.user.firstName}
                      lastName={e.user.lastName}
                      pending={e.pending}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="inline-flex items-center justify-center h-4 rounded bg-slate-200 text-[8px] font-bold text-slate-600 px-0.5">
                      +{overflow}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamCalendarPage() {
  const today = new Date();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "employee";
  const isAdmin = role === "admin" || role === "super_admin";
  const isApprover = role === "manager" || isAdmin;

  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; startDate: string; endDate: string } | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  // Add important date dialog
  const [addDateOpen, setAddDateOpen] = useState(false);
  const [newDateName, setNewDateName] = useState("");
  const [newDateDate, setNewDateDate] = useState("");
  const [newDateDesc, setNewDateDesc] = useState("");
  const [newDateVis, setNewDateVis] = useState<"all" | "admin_only">("all");

  const utils = trpc.useUtils();
  const cancelMutation = trpc.admin.cancelLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request cancelled and employee notified.");
      setCancelTargetId(null);
      utils.user.getTeamCalendar.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to cancel request.");
    },
  });

  const editMutation = trpc.admin.editLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request updated and employee notified.");
      setEditTarget(null);
      utils.user.getTeamCalendar.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to update request.");
    },
  });

  const approveMutation = trpc.approval.approve.useMutation({
    onSuccess: () => {
      toast.success("Leave request approved.");
      utils.user.getTeamCalendar.invalidate();
      utils.user.getImportantDates.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to approve request.");
    },
  });

  const addImportantDateMutation = trpc.admin.addImportantDate.useMutation({
    onSuccess: () => {
      toast.success("Important date added.");
      utils.user.getImportantDates.invalidate();
      setAddDateOpen(false);
      setNewDateName("");
      setNewDateDate("");
      setNewDateDesc("");
      setNewDateVis("all");
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to add date.");
    },
  });

  function openAddDate(prefilledDate?: string) {
    setNewDateDate(prefilledDate ?? "");
    setNewDateName("");
    setNewDateDesc("");
    setNewDateVis("all");
    setAddDateOpen(true);
  }

  function submitAddDate() {
    if (!newDateName.trim() || !newDateDate) return;
    addImportantDateMutation.mutate({
      name: newDateName.trim(),
      date: newDateDate,
      description: newDateDesc.trim() || undefined,
      visibility: newDateVis,
    });
  }

  function openEdit(evt: { id: string; startDate: unknown; endDate: unknown }) {
    const start = String(evt.startDate).slice(0, 10);
    const end = String(evt.endDate).slice(0, 10);
    setEditStart(start);
    setEditEnd(end);
    setEditTarget({ id: evt.id, startDate: start, endDate: end });
  }

  // Show 6 consecutive months starting from anchor (2 rows of 3)
  const months = useMemo(() => [0, 1, 2, 3, 4, 5].map((offset) => {
    const d = addMonths(anchor, offset);
    return { year: d.getFullYear(), month: d.getMonth() };
  }), [anchor]);

  const rangeStart = monthBounds(months[0].year, months[0].month).start;
  const rangeEnd = monthBounds(months[5].year, months[5].month).end;

  const { data: teamEvents = [], isLoading: loadingEvents } =
    trpc.user.getTeamCalendar.useQuery({
      startDate: rangeStart,
      endDate: rangeEnd,
      includeStatuses: ["approved", "pending"],
    });

  const { data: birthdayMembers = [] } = trpc.user.getTeamBirthdays.useQuery();
  const { data: importantDatesList = [] } = trpc.user.getImportantDates.useQuery();
  const { data: publicHolidays = [] } = trpc.user.getPublicHolidays.useQuery();

  // Map date → events
  const peopleMap = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    teamEvents.forEach((evt) => {
      const cur = new Date(evt.startDate.toString() + "T00:00:00Z");
      const last = new Date(evt.endDate.toString() + "T00:00:00Z");
      while (cur <= last) {
        const d = cur.toISOString().slice(0, 10);
        if (!m.has(d)) m.set(d, []);
        m.get(d)!.push(evt as CalEvent);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    });
    return m;
  }, [teamEvents]);

  // Set of important date strings (YYYY-MM-DD)
  const importantDatesSet = useMemo(() => {
    const s = new Set<string>();
    importantDatesList.forEach((d) => s.add(d.date));
    return s;
  }, [importantDatesList]);

  // Map date → holiday name
  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    publicHolidays.forEach((h) => m.set(h.date, h.name));
    return m;
  }, [publicHolidays]);

  // Birthday MM-DD set
  const birthdayMMDD = useMemo(() => {
    const s = new Set<string>();
    birthdayMembers.forEach((m) => s.add(m.birthday.slice(5)));
    return s;
  }, [birthdayMembers]);

  // Birthday detail map MM-DD → members
  const birthdayPeopleMap = useMemo(() => {
    const m = new Map<string, typeof birthdayMembers>();
    birthdayMembers.forEach((member) => {
      const mmdd = member.birthday.slice(5);
      if (!m.has(mmdd)) m.set(mmdd, []);
      m.get(mmdd)!.push(member);
    });
    return m;
  }, [birthdayMembers]);

  // Selected day detail
  const selectedEvents = selectedDay ? (peopleMap.get(selectedDay) ?? []) : [];
  const selectedBirthdays = selectedDay ? (birthdayPeopleMap.get(selectedDay.slice(5)) ?? []) : [];
  const selectedImportantDate = selectedDay
    ? importantDatesList.find((d) => d.date === selectedDay)
    : undefined;
  const selectedHolidayName = selectedDay ? holidayMap.get(selectedDay) : undefined;
  const todayStr = toYMD(today);

  const cancelTarget = selectedEvents.find((e) => e.id === cancelTargetId);

  return (
    <div className="space-y-4">
      {/* Cancel dialog */}
      <Dialog open={!!cancelTargetId} onOpenChange={(o: boolean) => { if (!o) setCancelTargetId(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Cancel approved leave?</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  This will cancel the approved{" "}
                  <strong>{cancelTarget.leaveType.name}</strong> leave for{" "}
                  <strong>{cancelTarget.user.firstName} {cancelTarget.user.lastName}</strong>{" "}
                  ({format(parseLocalDate(cancelTarget.startDate as string), "MMM d")} – {format(parseLocalDate(cancelTarget.endDate as string), "MMM d, yyyy")}).
                  The employee will be notified by email and their balance will be restored.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep</DialogClose>
            <Button
              variant="destructive"
              onClick={() => cancelTargetId && cancelMutation.mutate({ requestId: cancelTargetId })}
              disabled={cancelMutation.isPending}
            >
              Cancel Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dates dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o: boolean) => { if (!o) setEditTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Edit leave dates</DialogTitle>
            <DialogDescription>
              Update the start and end dates for this leave request. The employee will be notified by email.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cal-edit-start">Start Date</Label>
              <Input id="cal-edit-start" type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-edit-end">End Date</Label>
              <Input id="cal-edit-end" type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={() => editTarget && editMutation.mutate({ requestId: editTarget.id, startDate: editStart, endDate: editEnd })}
              disabled={editMutation.isPending || !editStart || !editEnd}
            >
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Important Date dialog */}
      <Dialog open={addDateOpen} onOpenChange={(o) => { if (!o) setAddDateOpen(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Important Date</DialogTitle>
            <DialogDescription>
              This date will appear with a yellow highlight in the team calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="idate-name">Event Name</Label>
              <Input
                id="idate-name"
                placeholder="e.g. Property Takeover — 123 Main St"
                value={newDateName}
                onChange={(e) => setNewDateName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idate-date">Date</Label>
              <Input
                id="idate-date"
                type="date"
                value={newDateDate}
                onChange={(e) => setNewDateDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idate-desc">Description <span className="font-normal text-slate-400">(optional)</span></Label>
              <Textarea
                id="idate-desc"
                placeholder="Additional details…"
                value={newDateDesc}
                onChange={(e) => setNewDateDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idate-vis">Visible to</Label>
              <Select value={newDateVis} onValueChange={(v) => setNewDateVis((v ?? "all") as "all" | "admin_only")}>
                <SelectTrigger id="idate-vis" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="admin_only">Admins only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={submitAddDate}
              disabled={addImportantDateMutation.isPending || !newDateName.trim() || !newDateDate}
            >
              {addImportantDateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Team Calendar</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAddDate(selectedDay ?? undefined)}
              className="gap-1.5 text-yellow-700 border-yellow-300 hover:bg-yellow-50"
            >
              <Star className="h-3.5 w-3.5 fill-yellow-400 stroke-yellow-500" />
              Add Important Date
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => { setAnchor((a) => subMonths(a, 6)); setSelectedDay(null); }} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-600">
            {format(anchor, "MMM yyyy")} – {format(addMonths(anchor, 5), "MMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => { setAnchor((a) => addMonths(a, 6)); setSelectedDay(null); }} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        {/* Six-month grid */}
        <Card>
          <CardContent className="pt-4">
            {loadingEvents ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-3">
                {months.map(({ year, month }) => (
                  <BigMonth
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    peopleMap={peopleMap}
                    importantDates={importantDatesSet}
                    holidayDates={holidayMap}
                    birthdayDates={birthdayMMDD}
                    selectedDay={selectedDay}
                    todayStr={todayStr}
                    onSelect={(d) => setSelectedDay(d || null)}
                  />
                ))}
              </div>
            )}
            {/* Legend */}
            {!loadingEvents && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-500 text-[8px] font-bold text-white">AB</span>
                  <span className="text-xs text-slate-500">Approved leave</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-400 text-[8px] font-bold text-white">AB</span>
                  <span className="text-xs text-slate-500">Pending request</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded ring-2 ring-yellow-400 bg-yellow-50 text-[8px] font-bold text-yellow-700">★</span>
                  <span className="text-xs text-slate-500">Important date</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-green-800">
                    <Star className="h-2.5 w-2.5 fill-slate-300 stroke-slate-300" />
                  </span>
                  <span className="text-xs text-slate-500">Public holiday</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                  <span className="text-xs text-slate-500">Birthday</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day detail panel */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {selectedDay ? format(parseISO(selectedDay), "EEEE, MMM d") : "Select a day"}
              </CardTitle>
              {isAdmin && selectedDay && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 shrink-0"
                  title="Mark as important date"
                  onClick={() => openAddDate(selectedDay)}
                >
                  <Star className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedDay ? (
              <p className="text-sm text-slate-400">Click any date to see who is out.</p>
            ) : (selectedEvents.length === 0 && selectedBirthdays.length === 0 && !selectedImportantDate && !selectedHolidayName) ? (
              <p className="text-sm text-slate-400">Nothing scheduled on this day.</p>
            ) : (
              <div className="divide-y">
                {/* Public holiday banner */}
                {selectedHolidayName && (
                  <div className="py-2.5 first:pt-0">
                    <div className="flex items-center gap-2 rounded-lg border border-green-800 bg-green-800 px-2.5 py-2">
                      <Star className="h-3.5 w-3.5 shrink-0 fill-slate-300 stroke-slate-300" />
                      <p className="text-sm font-semibold text-white">{selectedHolidayName}</p>
                    </div>
                  </div>
                )}
                {/* Important date banner */}
                {selectedImportantDate && (
                  <div className="py-2.5 first:pt-0">
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-2.5 py-2">
                      <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0 fill-yellow-400" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-900">{selectedImportantDate.name}</p>
                        {selectedImportantDate.description && (
                          <p className="text-xs text-yellow-700">{selectedImportantDate.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Birthdays */}
                {selectedBirthdays.map((member) => {
                  const birthYear = parseInt(member.birthday.slice(0, 4), 10);
                  const selectedYear = selectedDay ? parseInt(selectedDay.slice(0, 4), 10) : today.getFullYear();
                  const age = selectedYear - birthYear;
                  return (
                    <div key={`bday-${member.id}`} className="py-2.5 first:pt-0">
                      <div className="flex items-center gap-2">
                        <Cake className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <p className="text-sm font-medium text-slate-800">
                          {member.firstName} {member.lastName}
                        </p>
                      </div>
                      <p className="mt-0.5 ml-5.5 text-xs text-green-600">🎂 Birthday — turning {age}</p>
                    </div>
                  );
                })}
                {/* Leave events */}
                {selectedEvents.map((evt, i) => {
                  const days = parseFloat(evt.totalBusinessDays);
                  return (
                    <div key={`${evt.id}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className={[
                            "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white",
                            evt.status === "pending" ? "bg-slate-400" : personColor(evt.user.id),
                          ].join(" ")}>
                            {initials(evt.user.firstName, evt.user.lastName)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              {evt.user.firstName} {evt.user.lastName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">{evt.leaveType.name}</p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {format(parseLocalDate(evt.startDate as string), "MMM d")} – {format(parseLocalDate(evt.endDate as string), "MMM d")} · {days.toFixed(1)}d
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <StatusBadge status={evt.status} />
                          {isApprover && evt.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => approveMutation.mutate({ requestId: evt.id })}
                              disabled={approveMutation.isPending}
                              title="Approve this leave request"
                            >
                              {approveMutation.isPending
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Check className="h-3 w-3" />}
                            </Button>
                          )}
                          {isAdmin && evt.status === "approved" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                onClick={() => openEdit(evt)}
                                title="Edit dates"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setCancelTargetId(evt.id)}
                                title="Cancel this approved leave"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
