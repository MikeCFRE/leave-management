import { parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { and, eq, gte, isNull, lte, ne, or, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  blackoutPeriods,
  departments,
  leaveBalances,
  leaveRequests,
  policyRules,
  users,
} from "@/server/db/schema";
import {
  countCalendarDays,
  formatDate,
  gapBetweenRanges,
  getHoursUntilStart,
  isWorkDay,
  WorkSchedule,
} from "@/lib/date-utils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ValidationError {
  validator: string;
  message: string;
}

export interface ValidationWarning {
  validator: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidateRequestInput {
  userId: string;
  organizationId: string;
  departmentId: string | null;
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  totalBusinessDays: number;
  totalCalendarDays: number;
  workSchedule: WorkSchedule | null;
  holidays: string[] | null;
  excludeRequestId?: string; // exclude from overlap / gap checks (for edits)
}

// ---------------------------------------------------------------------------
// Policy parameter shapes (JSONB)
// ---------------------------------------------------------------------------

interface AdvanceNoticeTier {
  min_days: number;
  max_days: number;
  notice_hours: number;
}

interface AdvanceNoticeParams {
  tiers: AdvanceNoticeTier[];
}

interface ConsecutiveCapParams {
  max_consecutive_days: number;
  min_gap_between_blocks_days: number;
  max_long_blocks_per_year: number;
  long_block_threshold_days: number;
}

// ---------------------------------------------------------------------------
// Defaults (used when no policy rule is configured)
// ---------------------------------------------------------------------------

const DEFAULT_ADVANCE_NOTICE_TIERS: AdvanceNoticeTier[] = [
  { min_days: 1, max_days: 2, notice_hours: 48 },
  { min_days: 3, max_days: 5, notice_hours: 240 },
  { min_days: 6, max_days: 10, notice_hours: 720 },
];

const DEFAULT_CONSECUTIVE_CAP: ConsecutiveCapParams = {
  max_consecutive_days: 7,
  min_gap_between_blocks_days: 14,
  max_long_blocks_per_year: 2,
  long_block_threshold_days: 5,
};

// ---------------------------------------------------------------------------
// Policy resolution — cascading specificity
// Precedence: user-specific > department-specific > org-wide
// Within each tier, highest `priority` value wins.
// ---------------------------------------------------------------------------

async function resolvePolicy<T>(
  orgId: string,
  deptId: string | null,
  userId: string,
  ruleType: string
): Promise<T | null> {
  const today = formatDate(new Date());

  const rules = await db.query.policyRules.findMany({
    where: and(
      eq(policyRules.organizationId, orgId),
      eq(policyRules.ruleType, ruleType as "advance_notice" | "consecutive_cap" | "coverage_min" | "blackout" | "balance_override"),
      eq(policyRules.isActive, true),
      lte(policyRules.effectiveFrom, today),
      or(
        isNull(policyRules.effectiveUntil),
        gte(policyRules.effectiveUntil, today)
      )
    ),
  });

  if (!rules.length) return null;

  const userRules = rules.filter((r) => r.userId === userId);
  const deptRules = deptId
    ? rules.filter((r) => r.userId === null && r.departmentId === deptId)
    : [];
  const orgRules = rules.filter(
    (r) => r.userId === null && r.departmentId === null
  );

  const candidates = userRules.length
    ? userRules
    : deptRules.length
    ? deptRules
    : orgRules;

  if (!candidates.length) return null;

  const best = candidates.reduce((a, b) => (a.priority >= b.priority ? a : b));
  return best.parameters as T;
}

// ---------------------------------------------------------------------------
// Validator 1: Balance
// ---------------------------------------------------------------------------

async function validateBalance(
  input: ValidateRequestInput
): Promise<ValidationError | null> {
  const year = new Date().getFullYear();

  const balance = await db.query.leaveBalances.findFirst({
    where: and(
      eq(leaveBalances.userId, input.userId),
      eq(leaveBalances.leaveTypeId, input.leaveTypeId),
      eq(leaveBalances.year, year)
    ),
  });

  if (!balance) {
    return {
      validator: "balance",
      message: "No leave balance found for this leave type. Please contact HR.",
    };
  }

  const remaining =
    parseFloat(balance.totalEntitled) +
    parseFloat(balance.carriedOver) +
    parseFloat(balance.adjusted) -
    parseFloat(balance.used) -
    parseFloat(balance.pending);

  if (remaining < input.totalBusinessDays) {
    return {
      validator: "balance",
      message: `Insufficient balance. You have ${remaining.toFixed(1)} day(s) remaining but this request requires ${input.totalBusinessDays}.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validator 2: Advance Notice
// ---------------------------------------------------------------------------

async function validateAdvanceNotice(
  input: ValidateRequestInput
): Promise<ValidationError | null> {
  const params = await resolvePolicy<AdvanceNoticeParams>(
    input.organizationId,
    input.departmentId,
    input.userId,
    "advance_notice"
  );

  const tiers = params?.tiers ?? DEFAULT_ADVANCE_NOTICE_TIERS;

  const tier = tiers.find(
    (t) =>
      input.totalBusinessDays >= t.min_days &&
      input.totalBusinessDays <= t.max_days
  );

  if (!tier) return null; // No tier covers this duration (e.g., >10 days — handled by consecutive cap)

  const hoursUntil = getHoursUntilStart(input.startDate);

  if (hoursUntil < tier.notice_hours) {
    const requiredDays = Math.round(tier.notice_hours / 24);
    return {
      validator: "advance_notice",
      message: `This request requires at least ${tier.notice_hours} hours (${requiredDays} day(s)) advance notice. Please submit earlier or contact your manager.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validator 3: Consecutive Days
// ---------------------------------------------------------------------------

async function validateConsecutiveDays(
  input: ValidateRequestInput
): Promise<ValidationError | null> {
  const params =
    (await resolvePolicy<ConsecutiveCapParams>(
      input.organizationId,
      input.departmentId,
      input.userId,
      "consecutive_cap"
    )) ?? DEFAULT_CONSECUTIVE_CAP;

  if (input.totalCalendarDays > params.max_consecutive_days) {
    return {
      validator: "consecutive_days",
      message: `A single request cannot exceed ${params.max_consecutive_days} consecutive calendar days. Please split into separate requests with at least ${params.min_gap_between_blocks_days} days between them.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validator 4: Gap (between long blocks)
// ---------------------------------------------------------------------------

async function validateGap(
  input: ValidateRequestInput
): Promise<ValidationError | null> {
  const params =
    (await resolvePolicy<ConsecutiveCapParams>(
      input.organizationId,
      input.departmentId,
      input.userId,
      "consecutive_cap"
    )) ?? DEFAULT_CONSECUTIVE_CAP;

  // Only applies when this request qualifies as a "long block"
  if (input.totalCalendarDays < params.long_block_threshold_days) return null;

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;

  const existingRequests = await db.query.leaveRequests.findMany({
    where: and(
      eq(leaveRequests.userId, input.userId),
      or(
        eq(leaveRequests.status, "approved"),
        eq(leaveRequests.status, "pending")
      ),
      gte(leaveRequests.endDate, yearStart),
      lte(leaveRequests.startDate, yearEnd),
      input.excludeRequestId
        ? ne(leaveRequests.id, input.excludeRequestId)
        : undefined
    ),
  });

  const longBlocks = existingRequests.filter(
    (r) => r.totalCalendarDays >= params.long_block_threshold_days
  );

  if (longBlocks.length >= params.max_long_blocks_per_year) {
    return {
      validator: "gap",
      message: `You have already used ${longBlocks.length} extended leave block(s) this year. The maximum is ${params.max_long_blocks_per_year} per year.`,
    };
  }

  for (const block of longBlocks) {
    // Determine which comes first
    let gapDays: number;
    if (input.startDate > block.endDate) {
      // New request starts after existing block ends
      gapDays = gapBetweenRanges(block.endDate, input.startDate);
    } else if (block.startDate > input.endDate) {
      // New request ends before existing block starts
      gapDays = gapBetweenRanges(input.endDate, block.startDate);
    } else {
      // Overlapping — handled by the overlap validator
      gapDays = 0;
    }

    if (gapDays < params.min_gap_between_blocks_days) {
      return {
        validator: "gap",
        message: `There must be at least ${params.min_gap_between_blocks_days} days between extended leave blocks. This conflicts with your leave from ${block.startDate} to ${block.endDate} (gap: ${gapDays} day(s)).`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validator 5: Blackout Periods
// ---------------------------------------------------------------------------

async function validateBlackout(input: ValidateRequestInput): Promise<{
  errors: ValidationError[];
  warnings: ValidationWarning[];
}> {
  const overlapping = await db.query.blackoutPeriods.findMany({
    where: and(
      eq(blackoutPeriods.organizationId, input.organizationId),
      lte(blackoutPeriods.startDate, input.endDate),
      gte(blackoutPeriods.endDate, input.startDate),
      or(
        isNull(blackoutPeriods.departmentId),
        input.departmentId
          ? eq(blackoutPeriods.departmentId, input.departmentId)
          : undefined
      )
    ),
  });

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const period of overlapping) {
    const reasonSuffix = period.reason ? `: ${period.reason}` : "";
    const dateRange = `${period.startDate} to ${period.endDate}`;

    if (period.severity === "hard_block") {
      errors.push({
        validator: "blackout",
        message: `Your requested dates overlap with a blocked period (${dateRange})${reasonSuffix}. Leave requests are not permitted during this time.`,
      });
    } else {
      warnings.push({
        validator: "blackout",
        message: `Your requested dates overlap with a restricted period (${dateRange})${reasonSuffix}. Your request will require explicit manager approval.`,
      });
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Validator 6: Coverage Minimum
// ---------------------------------------------------------------------------

async function validateCoverage(
  input: ValidateRequestInput
): Promise<ValidationWarning | null> {
  if (!input.departmentId) return null;

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, input.departmentId),
  });

  if (!dept?.minCoverage) return null;

  // All active employees in the department (excluding the requester)
  const deptUsers = await db.query.users.findMany({
    where: and(
      eq(users.departmentId, input.departmentId),
      eq(users.employmentStatus, "active")
    ),
    columns: { id: true },
  });

  const othersIds = deptUsers
    .map((u) => u.id)
    .filter((id) => id !== input.userId);

  if (!othersIds.length) return null;

  // Approved/pending requests from other dept members overlapping the date range
  const overlapping = await db.query.leaveRequests.findMany({
    where: and(
      inArray(leaveRequests.userId, othersIds),
      or(
        eq(leaveRequests.status, "approved"),
        eq(leaveRequests.status, "pending")
      ),
      lte(leaveRequests.startDate, input.endDate),
      gte(leaveRequests.endDate, input.startDate)
    ),
  });

  const holidaySet = input.holidays?.length
    ? new Set(input.holidays)
    : undefined;

  let minAvailable = dept.totalHeadcount;
  let current = parseISO(input.startDate);
  const end = parseISO(input.endDate);

  while (current <= end) {
    if (isWorkDay(current, input.workSchedule, holidaySet)) {
      const dayStr = formatDate(current);
      const onLeave = overlapping.filter(
        (r) => r.startDate <= dayStr && r.endDate >= dayStr
      ).length;
      // totalHeadcount - others already on leave - this requester
      const available = dept.totalHeadcount - onLeave - 1;
      minAvailable = Math.min(minAvailable, available);
    }
    current = addDays(current, 1);
  }

  if (minAvailable < dept.minCoverage) {
    return {
      validator: "coverage",
      message: `Approving this request would leave ${minAvailable} staff available on some days, below the department minimum of ${dept.minCoverage}. Your manager will need to review coverage before approving.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validator 7: Overlap with own existing requests
// ---------------------------------------------------------------------------

async function validateOverlap(
  input: ValidateRequestInput
): Promise<ValidationError | null> {
  const existing = await db.query.leaveRequests.findFirst({
    where: and(
      eq(leaveRequests.userId, input.userId),
      or(
        eq(leaveRequests.status, "pending"),
        eq(leaveRequests.status, "approved")
      ),
      lte(leaveRequests.startDate, input.endDate),
      gte(leaveRequests.endDate, input.startDate),
      input.excludeRequestId
        ? ne(leaveRequests.id, input.excludeRequestId)
        : undefined
    ),
  });

  if (existing) {
    return {
      validator: "overlap",
      message: `You already have a ${existing.status} leave request (${existing.startDate} to ${existing.endDate}) that overlaps with these dates.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Run all 7 validators
// ---------------------------------------------------------------------------

export async function runAllValidators(
  input: ValidateRequestInput
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validators 1–4 and 7 are independent — run in parallel
  const [
    balanceError,
    advanceNoticeError,
    consecutiveDaysError,
    gapError,
    overlapError,
  ] = await Promise.all([
    validateBalance(input),
    validateAdvanceNotice(input),
    validateConsecutiveDays(input),
    validateGap(input),
    validateOverlap(input),
  ]);

  if (balanceError) errors.push(balanceError);
  if (advanceNoticeError) errors.push(advanceNoticeError);
  if (consecutiveDaysError) errors.push(consecutiveDaysError);
  if (gapError) errors.push(gapError);
  if (overlapError) errors.push(overlapError);

  // Validator 5: blackout — produces both hard errors and soft warnings
  const blackoutResult = await validateBlackout(input);
  errors.push(...blackoutResult.errors);
  warnings.push(...blackoutResult.warnings);

  // Validator 6: coverage — warning only
  const coverageWarning = await validateCoverage(input);
  if (coverageWarning) warnings.push(coverageWarning);

  return { valid: errors.length === 0, errors, warnings };
}
