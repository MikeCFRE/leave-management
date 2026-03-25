import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { leaveBalances, leaveTypes, users } from "@/server/db/schema";
import { appendAuditLog, AUDIT_ACTIONS } from "@/server/services/audit-service";

// ---------------------------------------------------------------------------
// processMonthlyAccrual
// ---------------------------------------------------------------------------

/**
 * Monthly accrual stub.
 *
 * Currently a no-op — all configured leave types use annual front-loaded
 * allocation (accrualMethod = 'front_loaded'). If a 'monthly' accrual type is
 * ever enabled in the org settings this stub must be implemented.
 *
 * Signature is kept so the cron route can call it unconditionally.
 */
export async function processMonthlyAccrual(
  _year: number,
  _month: number
): Promise<{ processed: number }> {
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

  if (!activeUsers.length) return { processed: 0 };

  // Group users by org so we fetch leave types once per org, not once per user.
  const byOrg = new Map<string, string[]>();
  for (const u of activeUsers) {
    const ids = byOrg.get(u.organizationId) ?? [];
    ids.push(u.id);
    byOrg.set(u.organizationId, ids);
  }

  const orgIds = Array.from(byOrg.keys());
  const allTypes = await db.query.leaveTypes.findMany({
    where: and(
      inArray(leaveTypes.organizationId, orgIds),
      eq(leaveTypes.isActive, true)
    ),
  });

  // Index leave types by org for O(1) lookup
  const typesByOrg = new Map<string, typeof allTypes>();
  for (const lt of allTypes) {
    const arr = typesByOrg.get(lt.organizationId) ?? [];
    arr.push(lt);
    typesByOrg.set(lt.organizationId, arr);
  }

  let processed = 0;

  for (const [orgId, userIds] of byOrg) {
    const orgTypes = typesByOrg.get(orgId) ?? [];
    if (!orgTypes.length) continue;

    // Build all balance rows for this org and insert in one statement.
    const balanceRows = userIds.flatMap((userId) =>
      orgTypes.map((lt) => ({
        userId,
        leaveTypeId: lt.id,
        year,
        totalEntitled: parseFloat(lt.defaultAnnualDays).toFixed(2),
      }))
    );

    await db.insert(leaveBalances).values(balanceRows).onConflictDoNothing();

    // Audit logs per user×type (only for types with non-zero entitlement)
    for (const userId of userIds) {
      for (const lt of orgTypes) {
        const entitled = parseFloat(lt.defaultAnnualDays);
        if (entitled > 0) {
          await appendAuditLog({
            organizationId: orgId,
            userId: null,
            action: AUDIT_ACTIONS.BALANCE_ACCRUED,
            entityType: "leave_balance",
            entityId: userId,
            newValues: { leaveTypeId: lt.id, year, entitled, method: lt.accrualMethod },
          });
        }
        processed++;
      }
    }
  }

  return { processed };
}

// ---------------------------------------------------------------------------
// processCarryOver
// ---------------------------------------------------------------------------

/**
 * Year-end carry-over stub.
 *
 * Currently a no-op — all leave operates on a use-it-or-lose-it basis.
 * If carry-over is enabled (via a leave type's maxCarryoverDays setting) this
 * stub must be implemented. It should be called AFTER processAnnualSetup(toYear)
 * has created the toYear balance rows.
 *
 * Signature is kept so the cron route can call it unconditionally.
 */
export async function processCarryOver(
  _fromYear: number,
  _toYear: number
): Promise<{ processed: number }> {
  return { processed: 0 };
}
