import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { leaveBalances, leaveTypes, users } from "@/server/db/schema";
import { appendAuditLog, AUDIT_ACTIONS } from "@/server/services/audit-service";

// ---------------------------------------------------------------------------
// processMonthlyAccrual
// ---------------------------------------------------------------------------

/**
 * Monthly accrual: for every active user, add 1/12 of defaultAnnualDays to
 * totalEntitled for each leave type with accrualMethod = 'monthly'.
 *
 * Uses INSERT … ON CONFLICT DO UPDATE so each call is idempotent within the
 * same month provided the caller passes consistent year/month values.
 * (The cron should ensure it only runs once per month.)
 */
export async function processMonthlyAccrual(
  _year: number,
  _month: number
): Promise<{ processed: number }> {
  // Monthly accrual is disabled — all leave types use annual front-loaded allocation.
  return { processed: 0 };
}

// ---------------------------------------------------------------------------
// processAnnualSetup
// ---------------------------------------------------------------------------

/**
 * Annual setup: at the start of a new year, create balance rows for all active
 * users.
 *   - front_loaded / as_needed → totalEntitled = defaultAnnualDays
 *   - monthly                  → totalEntitled = 0 (filled by monthly cron)
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so it's safe to call multiple times
 * and won't overwrite carry-over that was already credited.
 */
export async function processAnnualSetup(
  year: number
): Promise<{ processed: number }> {
  const activeUsers = await db.query.users.findMany({
    where: and(eq(users.employmentStatus, "active"), isNull(users.deletedAt)),
    columns: { id: true, organizationId: true },
  });

  let processed = 0;

  for (const user of activeUsers) {
    const allTypes = await db.query.leaveTypes.findMany({
      where: and(
        eq(leaveTypes.organizationId, user.organizationId),
        eq(leaveTypes.isActive, true)
      ),
    });

    for (const lt of allTypes) {
      const entitled = parseFloat(lt.defaultAnnualDays);

      await db
        .insert(leaveBalances)
        .values({
          userId: user.id,
          leaveTypeId: lt.id,
          year,
          totalEntitled: entitled.toFixed(2),
        })
        .onConflictDoNothing();

      if (entitled > 0) {
        await appendAuditLog({
          organizationId: user.organizationId,
          userId: null,
          action: AUDIT_ACTIONS.BALANCE_ACCRUED,
          entityType: "leave_balance",
          entityId: user.id,
          newValues: {
            leaveTypeId: lt.id,
            year,
            entitled,
            method: lt.accrualMethod,
          },
        });
      }

      processed++;
    }
  }

  return { processed };
}

// ---------------------------------------------------------------------------
// processCarryOver
// ---------------------------------------------------------------------------

/**
 * Year-end carry-over: for each active user's fromYear balance, calculate the
 * unused remainder (capped at maxCarryoverDays) and credit it into toYear's
 * carriedOver column.
 *
 * Must be called AFTER processAnnualSetup(toYear) has created the toYear rows.
 */
export async function processCarryOver(
  _fromYear: number,
  _toYear: number
): Promise<{ processed: number }> {
  // Carry-over is disabled — all leave operates on a use-it-or-lose-it basis.
  return { processed: 0 };
}
