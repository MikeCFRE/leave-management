"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2, X, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ISO weekday: 1 = Monday … 7 = Sunday
const WEEKDAYS: { iso: number; label: string; short: string }[] = [
  { iso: 1, label: "Monday", short: "Mon" },
  { iso: 2, label: "Tuesday", short: "Tue" },
  { iso: 3, label: "Wednesday", short: "Wed" },
  { iso: 4, label: "Thursday", short: "Thu" },
  { iso: 5, label: "Friday", short: "Fri" },
  { iso: 6, label: "Saturday", short: "Sat" },
  { iso: 7, label: "Sunday", short: "Sun" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Holiday = { date: string; name: string };

type ImportantDate = {
  id: string;
  name: string;
  date: string;
  description?: string;
  visibility: "all" | "admin_only";
};

type OrgSettings = {
  orgName: string;
  timezone: string;
  fiscalYearStartMonth: number;
  workSchedule: number[];
  holidayCalendar: Holiday[];
  importantDates: ImportantDate[];
};

// ---------------------------------------------------------------------------
// Org Info card
// ---------------------------------------------------------------------------

function OrgInfoCard({
  settings,
  onSave,
  isSaving,
}: {
  settings: OrgSettings;
  onSave: (patch: Partial<OrgSettings>) => void;
  isSaving: boolean;
}) {
  const [orgName, setOrgName] = useState(settings.orgName);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [fiscalMonth, setFiscalMonth] = useState(settings.fiscalYearStartMonth);

  useEffect(() => {
    setOrgName(settings.orgName);
    setTimezone(settings.timezone);
    setFiscalMonth(settings.fiscalYearStartMonth);
  }, [settings.orgName, settings.timezone, settings.fiscalYearStartMonth]);

  const dirty =
    orgName !== settings.orgName ||
    timezone !== settings.timezone ||
    fiscalMonth !== settings.fiscalYearStartMonth;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-orgname">Organisation Name</Label>
          <Input
            id="s-orgname"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Acme Corp"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-tz">Timezone</Label>
            <Select value={timezone} onValueChange={(v) => setTimezone(v ?? timezone)}>
              <SelectTrigger id="s-tz" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-fiscal">Fiscal Year Start</Label>
            <Select value={fiscalMonth.toString()} onValueChange={(v) => setFiscalMonth(parseInt(v ?? fiscalMonth.toString()))}>
              <SelectTrigger id="s-fiscal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button
          onClick={() => onSave({ orgName, timezone, fiscalYearStartMonth: fiscalMonth })}
          disabled={isSaving || !dirty || !orgName.trim()}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Work Schedule card
// ---------------------------------------------------------------------------

function WorkScheduleCard({
  settings,
  onSave,
  isSaving,
}: {
  settings: OrgSettings;
  onSave: (patch: Partial<OrgSettings>) => void;
  isSaving: boolean;
}) {
  const [workDays, setWorkDays] = useState<number[]>(settings.workSchedule);

  useEffect(() => {
    setWorkDays(settings.workSchedule);
  }, [settings.workSchedule]);

  function toggle(iso: number) {
    setWorkDays((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort()
    );
  }

  const dirty =
    JSON.stringify(workDays.slice().sort()) !==
    JSON.stringify(settings.workSchedule.slice().sort());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Work Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-slate-500">Select which days are standard working days.</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map(({ iso, short }) => {
            const active = workDays.includes(iso);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => toggle(iso)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-400",
                ].join(" ")}
              >
                {short}
              </button>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button
          onClick={() => onSave({ workSchedule: workDays })}
          disabled={isSaving || !dirty || workDays.length === 0}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Holiday Calendar card
// ---------------------------------------------------------------------------

function HolidayCalendarCard({
  settings,
  onSave,
  isSaving,
}: {
  settings: OrgSettings;
  onSave: (patch: Partial<OrgSettings>) => void;
  isSaving: boolean;
}) {
  const [holidays, setHolidays] = useState<Holiday[]>(settings.holidayCalendar);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setHolidays(settings.holidayCalendar);
  }, [settings.holidayCalendar]);

  function addHoliday() {
    if (!newDate || !newName.trim() || holidays.some((h) => h.date === newDate)) return;
    setHolidays((prev) => [...prev, { date: newDate, name: newName.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setNewName("");
  }

  function removeHoliday(date: string) {
    setHolidays((prev) => prev.filter((h) => h.date !== date));
  }

  const dirty = JSON.stringify(holidays) !== JSON.stringify(settings.holidayCalendar);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Public Holidays</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          These dates are excluded from business-day calculations.
        </p>

        {/* Chip list */}
        {holidays.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {holidays.map((h) => (
              <span
                key={h.date}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span>{h.name}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{format(new Date(h.date + "T00:00:00"), "MMMM d, yyyy")}</span>
                <button
                  type="button"
                  onClick={() => removeHoliday(h.date)}
                  className="ml-0.5 text-slate-400 hover:text-slate-700"
                  aria-label={`Remove ${h.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add date */}
        <div className="flex gap-2">
          <Input
            placeholder="Holiday name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-auto"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addHoliday}
            disabled={!newDate || !newName.trim() || holidays.some((h) => h.date === newDate)}
            aria-label="Add holiday"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button
          onClick={() => onSave({ holidayCalendar: holidays })}
          disabled={isSaving || !dirty}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Important Dates card
// ---------------------------------------------------------------------------

function ImportantDatesCard({
  settings,
  onSave,
  isSaving,
}: {
  settings: OrgSettings;
  onSave: (patch: Partial<OrgSettings>) => void;
  isSaving: boolean;
}) {
  const [dates, setDates] = useState<ImportantDate[]>(settings.importantDates);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVis, setNewVis] = useState<"all" | "admin_only">("all");

  useEffect(() => {
    setDates(settings.importantDates);
  }, [settings.importantDates]);

  function addDate() {
    if (!newDate || !newName.trim()) return;
    const entry: ImportantDate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: newName.trim(),
      date: newDate,
      description: newDesc.trim() || undefined,
      visibility: newVis,
    };
    setDates((prev) => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
    setNewName("");
    setNewDate("");
    setNewDesc("");
    setNewVis("all");
  }

  function removeDate(id: string) {
    setDates((prev) => prev.filter((d) => d.id !== id));
  }

  function toggleVisibility(id: string) {
    setDates((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, visibility: d.visibility === "all" ? "admin_only" : "all" }
          : d
      )
    );
  }

  const dirty = JSON.stringify(dates) !== JSON.stringify(settings.importantDates);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Important Dates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          Dates that appear with a yellow highlight in the team calendar.
          Control who can see each one with the visibility toggle.
        </p>

        {dates.length > 0 && (
          <div className="space-y-2">
            {dates.map((d) => (
              <div
                key={d.id}
                className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-2.5"
              >
                <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                  <p className="text-xs text-slate-500">
                    {format(new Date(d.date + "T00:00:00"), "MMMM d, yyyy")}
                    {d.description && ` · ${d.description}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleVisibility(d.id)}
                  title={d.visibility === "all" ? "Visible to everyone — click to restrict to admins" : "Visible to admins only — click to make visible to all"}
                  className={[
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                    d.visibility === "all"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {d.visibility === "all" ? "All" : "Admins"}
                </button>
                <button
                  type="button"
                  onClick={() => removeDate(d.id)}
                  className="shrink-0 text-slate-400 hover:text-slate-700"
                  aria-label={`Remove ${d.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add row */}
        <div className="space-y-2 rounded-lg border border-dashed border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500">Add important date</p>
          <div className="flex gap-2">
            <Input
              placeholder="Event name (e.g. Property Takeover)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDate()}
            />
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDate()}
            />
            <Select value={newVis} onValueChange={(v) => setNewVis((v ?? "all") as "all" | "admin_only")}>
              <SelectTrigger className="w-36 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="admin_only">Admins only</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addDate}
              disabled={!newDate || !newName.trim()}
              aria-label="Add important date"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button
          onClick={() => onSave({ importantDates: dates })}
          disabled={isSaving || !dirty}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const utils = trpc.useUtils();

  const { data: rawSettings, isLoading, error } = trpc.admin.getOrgSettings.useQuery();

  const update = trpc.admin.updateOrgSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved.");
      utils.admin.getOrgSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (error?.data?.code === "FORBIDDEN") {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  if (isLoading || !rawSettings) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const settings: OrgSettings = {
    orgName: (rawSettings as { orgName?: string }).orgName ?? "",
    timezone: (rawSettings as { timezone?: string }).timezone ?? "UTC",
    fiscalYearStartMonth: (rawSettings as { fiscalYearStartMonth?: number }).fiscalYearStartMonth ?? 1,
    workSchedule: (rawSettings as { workSchedule?: { workDays?: number[] } | null })?.workSchedule?.workDays ?? [1, 2, 3, 4, 5],
    holidayCalendar: (() => {
      const raw = (rawSettings as { holidayCalendar?: unknown }).holidayCalendar;
      const arr = Array.isArray((raw as { holidays?: unknown })?.holidays)
        ? (raw as { holidays: unknown[] }).holidays
        : Array.isArray(raw) ? raw as unknown[] : [];
      return arr.map((h) =>
        typeof h === "string" ? { date: h, name: "" } : h as Holiday
      );
    })(),
    importantDates: (() => {
      const raw = (rawSettings as { importantDates?: unknown }).importantDates;
      const arr = Array.isArray((raw as { dates?: unknown })?.dates)
        ? (raw as { dates: unknown[] }).dates
        : [];
      return arr as ImportantDate[];
    })(),
  };

  function handleSave(patch: Partial<OrgSettings>) {
    const merged = { ...settings, ...patch };
    const { workSchedule, holidayCalendar, importantDates, ...rest } = merged;
    update.mutate({
      ...rest,
      workSchedule: { workDays: workSchedule },
      holidayCalendar: { holidays: holidayCalendar },
      importantDates: { dates: importantDates },
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Organisation Settings</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Configure global defaults for leave calculations and scheduling.
        </p>
      </div>

      <OrgInfoCard settings={settings} onSave={handleSave} isSaving={update.isPending} />

      <Separator />

      <WorkScheduleCard settings={settings} onSave={handleSave} isSaving={update.isPending} />

      <Separator />

      <HolidayCalendarCard settings={settings} onSave={handleSave} isSaving={update.isPending} />

      <Separator />

      <ImportantDatesCard settings={settings} onSave={handleSave} isSaving={update.isPending} />
    </div>
  );
}
