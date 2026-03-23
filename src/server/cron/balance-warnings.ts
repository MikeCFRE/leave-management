import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { leaveBalances, users } from "@/server/db/schema";
import { notifyLowBalance } from "@/server/services/notification-service";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Warn users whose net remaining balance drops to or below this threshold. */
const WARNING_THRESHOLD_DAYS = 3;

// ---------------------------------------------------------------------------
// runBalanceWarnings
// ---------------------------------------------------------------------------

/**
 * Scans all active users' leave balances for the current year and sends a
 * low-balance warning for any balance that has fallen at or below
 * WARNING_THRESHOLD_DAYS.
 *
 * Designed to be called daily. There is no deduplication guard — if the
 * user's balance remains low, they will receive a daily notification.
 * Users can silence these via their notification preferences
 * (set balance_warning → "none").
 */
export async function runBalanceWarnings(now?: Date): Promise<{
  warned: number;
  errors: number;
}> {
  const year = (now ?? new Date()).getFullYear();

  const balances = await db.query.leaveBalances.findMany({
    where: and(
      eq(leaveBalances.year, year)
    ),
    with: {
      user: {
        columns: {
          id: true,
          employmentStatus: true,
          deletedAt: true,
          notificationPreferences: true,
        },
      },
      leaveType: {
        columns: { id: true, name: true, defaultAnnualDays: true },
      },
    },
  });

  let warned = 0;
  let errors = 0;

  for (const balance of balances) {
    // Skip inactive / terminated / deleted users
    if (
      balance.user.employmentStatus === "terminated" ||
      balance.user.employmentStatus === "inactive" ||
      balance.user.deletedAt !== null
    ) {
      continue;
    }

    const entitled = parseFloat(balance.totalEntitled);
    const used = parseFloat(balance.used);
    const pending = parseFloat(balance.pending);
    const carried = parseFloat(balance.carriedOver);
    const adjusted = parseFloat(balance.adjusted);

    // Skip types where the user was never entitled to any days (as_needed zeroes, etc.)
    if (entitled + carried + adjusted <= 0) continue;

    const remaining = entitled + carried + adjusted - used - pending;

    if (remaining <= WARNING_THRESHOLD_DAYS) {
      try {
        await notifyLowBalance(
          balance.userId,
          balance.leaveType.name,
          remaining,
          year
        );
        warned++;
      } catch (err) {
        console.error(
          `[cron/balance-warnings] Failed to notify user ${balance.userId}:`,
          err
        );
        errors++;
      }
    }
  }

  return { warned, errors };
}
