"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2, X, Plus } from "lucide-react";
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

type OrgSettings = {
  orgName: string;
  timezone: string;
  fiscalYearStartMonth: number;
  workSchedule: number[];
  holidayCalendar: Holiday[];
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
            <Select value={timezone} onValueChange={setTimezone}>
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
            <Select value={fiscalMonth.toString()} onValueChange={(v) => setFiscalMonth(parseInt(v))}>
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
  };

  function handleSave(patch: Partial<OrgSettings>) {
    const merged = { ...settings, ...patch };
    const { workSchedule, holidayCalendar, ...rest } = merged;
    update.mutate({ ...rest, workSchedule: { workDays: workSchedule }, holidayCalendar: { holidays: holidayCalendar } });
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
    </div>
  );
}
