import {
  processMonthlyAccrual,
  processAnnualSetup,
  processCarryOver,
} from "@/server/services/accrual-service";

// ---------------------------------------------------------------------------
// runAccrualProcessing
// ---------------------------------------------------------------------------

/**
 * Determines what accrual work to run based on the current date and executes
 * it. Designed to be called on the 1st of each month (e.g. "0 6 1 * *").
 *
 * Logic:
 *   - Every 1st of the month → run monthly accrual for the current month.
 *   - January 1st (month = 1) → also run annual setup for the new year and
 *     carry-over from the previous year (setup must complete before carry-over
 *     so the new-year rows exist to receive the carry-over credits).
 */
export async function runAccrualProcessing(now?: Date): Promise<{
  monthlyProcessed: number;
  annualSetupProcessed: number;
  carryOverProcessed: number;
}> {
  const date = now ?? new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based

  let monthlyProcessed = 0;
  let annualSetupProcessed = 0;
  let carryOverProcessed = 0;

  // Always run monthly accrual on the 1st
  const monthly = await processMonthlyAccrual(year, month);
  monthlyProcessed = monthly.processed;

  // On January 1st: annual setup for the new year + carry-over from last year
  if (month === 1) {
    const setup = await processAnnualSetup(year);
    annualSetupProcessed = setup.processed;

    const carry = await processCarryOver(year - 1, year);
    carryOverProcessed = carry.processed;
  }

  return { monthlyProcessed, annualSetupProcessed, carryOverProcessed };
}
