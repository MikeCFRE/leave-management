"use client";

import { useState, useMemo } from "react";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { Cake, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  return cells;
}

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function heatColor(count: number): string {
  if (count === 0) return "";
  if (count === 1) return "bg-sky-200";
  if (count === 2) return "bg-blue-400";
  if (count === 3) return "bg-indigo-500";
  return "bg-violet-700";
}

// ---------------------------------------------------------------------------
// Mini month grid
// ---------------------------------------------------------------------------

function MiniMonth({
  year,
  month,
  countMap,
  birthdayDates,
  selectedDay,
  todayStr,
  onSelect,
}: {
  year: number;
  month: number;
  countMap: Map<string, number>;
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
      <div className="grid grid-cols-7 gap-px mb-px">
        {WEEK_LABELS.map((lbl, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400 pb-0.5">
            {lbl}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {grid.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const count = countMap.get(dateStr) ?? 0;
          const mmdd = dateStr.slice(5); // MM-DD
          const hasBirthday = birthdayDates.has(mmdd);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;
          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr === selectedDay ? "" : dateStr)}
              className={[
                "relative flex aspect-square items-center justify-center rounded text-[11px] transition-colors",
                heatColor(count),
                count >= 4 ? "text-white" : "",
                isSelected ? "ring-2 ring-blue-500 ring-offset-0" : "hover:bg-slate-100",
                isToday && !isSelected ? "font-bold text-blue-600" : "font-normal",
              ].filter(Boolean).join(" ")}
            >
              {day}
              {hasBirthday && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-green-500" />
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

  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const cancelMutation = trpc.admin.cancelLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request cancelled and employee notified.");
      setCancelTargetId(null);
      utils.user.getTeamCalendar.invalidate();
      utils.user.getCoverageHeatmap.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to cancel request.");
    },
  });

  // Show 3 consecutive months starting from anchor
  const months = useMemo(() => [0, 1, 2].map((offset) => {
    const d = addMonths(anchor, offset);
    return { year: d.getFullYear(), month: d.getMonth() };
  }), [anchor]);

  const rangeStart = monthBounds(months[0].year, months[0].month).start;
  const rangeEnd = monthBounds(months[2].year, months[2].month).end;

  const { data: heatmap = [], isLoading: loadingHeat } =
    trpc.user.getCoverageHeatmap.useQuery({ startDate: rangeStart, endDate: rangeEnd });

  const { data: birthdayMembers = [] } = trpc.user.getTeamBirthdays.useQuery();

  const { data: teamEvents = [], isLoading: loadingEvents } =
    trpc.user.getTeamCalendar.useQuery({
      startDate: rangeStart,
      endDate: rangeEnd,
      includeStatuses: ["approved", "pending"],
    });

  const countMap = useMemo(() => {
    const m = new Map<string, number>();
    heatmap.forEach(({ date, count }) => m.set(date, count));
    return m;
  }, [heatmap]);

  const peopleMap = useMemo(() => {
    const m = new Map<string, typeof teamEvents>();
    teamEvents.forEach((evt) => {
      const cur = new Date(evt.startDate.toString() + "T00:00:00Z");
      const last = new Date(evt.endDate.toString() + "T00:00:00Z");
      while (cur <= last) {
        const d = cur.toISOString().slice(0, 10);
        if (!m.has(d)) m.set(d, []);
        m.get(d)!.push(evt);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    });
    return m;
  }, [teamEvents]);

  // Build a Set of MM-DD strings for birthday lookup
  const birthdayMMDD = useMemo(() => {
    const s = new Set<string>();
    birthdayMembers.forEach((m) => s.add(m.birthday.slice(5)));
    return s;
  }, [birthdayMembers]);

  // Map MM-DD -> people with that birthday (for detail panel)
  const birthdayPeopleMap = useMemo(() => {
    const m = new Map<string, typeof birthdayMembers>();
    birthdayMembers.forEach((member) => {
      const mmdd = member.birthday.slice(5);
      if (!m.has(mmdd)) m.set(mmdd, []);
      m.get(mmdd)!.push(member);
    });
    return m;
  }, [birthdayMembers]);

  const selectedEvents = selectedDay ? (peopleMap.get(selectedDay) ?? []) : [];
  const selectedBirthdays = selectedDay ? (birthdayPeopleMap.get(selectedDay.slice(5)) ?? []) : [];
  const todayStr = toYMD(today);
  const isLoading = loadingHeat || loadingEvents;

  const cancelTarget = selectedEvents.find((e) => e.id === cancelTargetId);

  return (
    <div className="space-y-4">
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
                  ({format(parseLocalDate(cancelTarget.startDate), "MMM d")} – {format(parseLocalDate(cancelTarget.endDate), "MMM d, yyyy")}).
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

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Team Calendar</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { setAnchor((a) => subMonths(a, 3)); setSelectedDay(null); }} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-600">
            {format(anchor, "MMM yyyy")} – {format(addMonths(anchor, 2), "MMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => { setAnchor((a) => addMonths(a, 3)); setSelectedDay(null); }} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Three-month grid */}
        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-3">
                {months.map(({ year, month }) => (
                  <MiniMonth
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    countMap={countMap}
                    birthdayDates={birthdayMMDD}
                    selectedDay={selectedDay}
                    todayStr={todayStr}
                    onSelect={(d) => setSelectedDay(d || null)}
                  />
                ))}
              </div>
            )}
            {/* Legend */}
            {!isLoading && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                <span className="text-xs text-slate-400">Absences:</span>
                {[
                  { label: "0", cls: "bg-white border border-slate-200" },
                  { label: "1", cls: "bg-sky-200" },
                  { label: "2", cls: "bg-blue-400" },
                  { label: "3", cls: "bg-indigo-500" },
                  { label: "4+", cls: "bg-violet-700" },
                ].map(({ label, cls }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`h-3 w-3 rounded ${cls}`} />
                    <span className="text-xs text-slate-500">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 ml-2">
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
            <CardTitle className="text-sm font-medium text-slate-500">
              {selectedDay ? format(parseISO(selectedDay), "EEEE, MMM d") : "Select a day"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDay ? (
              <p className="text-sm text-slate-400">Click any date to see who is out.</p>
            ) : (selectedEvents.length === 0 && selectedBirthdays.length === 0) ? (
              <p className="text-sm text-slate-400">No one is out on this day.</p>
            ) : (
              <div className="divide-y">
                {selectedBirthdays.map((member) => (
                  <div key={`bday-${member.id}`} className="py-2.5 first:pt-0">
                    <div className="flex items-center gap-2">
                      <Cake className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <p className="text-sm font-medium text-slate-800">
                        {member.firstName} {member.lastName}
                      </p>
                    </div>
                    <p className="mt-0.5 ml-5.5 text-xs text-green-600">Birthday 🎂</p>
                  </div>
                ))}
                {selectedEvents.map((evt, i) => {
                  const days = parseFloat(evt.totalBusinessDays);
                  return (
                    <div key={`${evt.id}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {evt.user.firstName} {evt.user.lastName}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">{evt.leaveType.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {format(parseLocalDate(evt.startDate), "MMM d")} – {format(parseLocalDate(evt.endDate), "MMM d")} · {days.toFixed(1)}d
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <StatusBadge status={evt.status} />
                          {isAdmin && evt.status === "approved" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setCancelTargetId(evt.id)}
                              title="Cancel this approved leave"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
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
