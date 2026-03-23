/**
 * Seed script — run with: npx tsx src/server/db/seed.ts
 *
 * Creates:
 *  - 1 organization (San Marco Apartments / Category Five Ventures)
 *  - 3 departments (Maintenance, Leasing, Administration)
 *  - 1 super_admin (admin@categoryfiveventures.com)
 *  - 5 employees across departments
 *  - 6 leave types (PTO, Sick, Personal, Bereavement, Jury Duty, Unpaid)
 *  - Default policy rules (advance notice tiers, consecutive cap, coverage min)
 *  - Leave balances for all employees for the current year
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import bcrypt from "bcryptjs";
import { db } from "./index";
import {
  organizations,
  departments,
  users,
  leaveTypes,
  leaveBalances,
  policyRules,
} from "./schema";

const CURRENT_YEAR = new Date().getFullYear();
const BCRYPT_COST = 12;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

async function seed() {
  console.log("🌱 Seeding database...");

  // -------------------------------------------------------------------------
  // Organization
  // -------------------------------------------------------------------------
  console.log("  Creating organization...");
  const [org] = await db
    .insert(organizations)
    .values({
      name: "San Marco Apartments",
      slug: "san-marco",
      timezone: "America/New_York",
      fiscalYearStartMonth: 1,
      workSchedule: { workDays: [1, 2, 3, 4, 5] }, // Mon–Fri
      holidayCalendar: {
        holidays: [
          `${CURRENT_YEAR}-01-01`, // New Year's Day
          `${CURRENT_YEAR}-01-20`, // MLK Day
          `${CURRENT_YEAR}-02-17`, // Presidents Day
          `${CURRENT_YEAR}-05-26`, // Memorial Day
          `${CURRENT_YEAR}-07-04`, // Independence Day
          `${CURRENT_YEAR}-09-01`, // Labor Day
          `${CURRENT_YEAR}-11-27`, // Thanksgiving
          `${CURRENT_YEAR}-11-28`, // Day after Thanksgiving
          `${CURRENT_YEAR}-12-24`, // Christmas Eve
          `${CURRENT_YEAR}-12-25`, // Christmas Day
          `${CURRENT_YEAR}-12-31`, // New Year's Eve
        ],
      },
    })
    .returning();

  // -------------------------------------------------------------------------
  // Departments
  // -------------------------------------------------------------------------
  console.log("  Creating departments...");
  const [deptMaintenance, deptLeasing, deptAdmin] = await db
    .insert(departments)
    .values([
      {
        organizationId: org.id,
        name: "Maintenance",
        minCoverage: 2,
        totalHeadcount: 4,
      },
      {
        organizationId: org.id,
        name: "Leasing",
        minCoverage: 1,
        totalHeadcount: 3,
      },
      {
        organizationId: org.id,
        name: "Administration",
        minCoverage: 1,
        totalHeadcount: 3,
      },
    ])
    .returning();

  // -------------------------------------------------------------------------
  // Super Admin
  // -------------------------------------------------------------------------
  console.log("  Creating super admin...");
  const [superAdmin] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      departmentId: deptAdmin.id,
      email: "mike@categoryfiveventures.com",
      passwordHash: await hashPassword("Test123!"),
      firstName: "Mike",
      lastName: "Peisach",
      role: "super_admin",
      hireDate: "2020-01-01",
      employmentStatus: "active",
      mustChangePassword: false,
      notificationPreferences: {
        requestSubmitted: { email: true, inApp: true },
        requestApproved: { email: true, inApp: true },
        requestDenied: { email: true, inApp: true },
        escalation: { email: true, inApp: true },
        balanceWarning: { email: true, inApp: false },
        overrideDigest: { email: true, inApp: false },
      },
    })
    .returning();

  // -------------------------------------------------------------------------
  // Managers
  // -------------------------------------------------------------------------
  console.log("  Creating managers...");
  const [managerMaint, managerLeasing] = await db
    .insert(users)
    .values([
      {
        organizationId: org.id,
        departmentId: deptMaintenance.id,
        email: "manager.maintenance@categoryfiveventures.com",
        passwordHash: await hashPassword("TempPass1!"),
        firstName: "Carlos",
        lastName: "Rivera",
        role: "manager",
        managerId: superAdmin.id,
        hireDate: "2021-03-15",
        employmentStatus: "active",
        mustChangePassword: true,
        notificationPreferences: {},
      },
      {
        organizationId: org.id,
        departmentId: deptLeasing.id,
        email: "manager.leasing@categoryfiveventures.com",
        passwordHash: await hashPassword("TempPass1!"),
        firstName: "Sarah",
        lastName: "Johnson",
        role: "manager",
        managerId: superAdmin.id,
        hireDate: "2021-06-01",
        employmentStatus: "active",
        mustChangePassword: true,
        notificationPreferences: {},
      },
    ])
    .returning();

  // -------------------------------------------------------------------------
  // Employees
  // -------------------------------------------------------------------------
  console.log("  Creating employees...");
  const employeeData = [
    {
      organizationId: org.id,
      departmentId: deptMaintenance.id,
      email: "employee1@categoryfiveventures.com",
      passwordHash: await hashPassword("TempPass1!"),
      firstName: "James",
      lastName: "Williams",
      role: "employee" as const,
      managerId: managerMaint.id,
      hireDate: "2022-01-10",
      employmentStatus: "active" as const,
      mustChangePassword: true,
      notificationPreferences: {},
    },
    {
      organizationId: org.id,
      departmentId: deptMaintenance.id,
      email: "employee2@categoryfiveventures.com",
      passwordHash: await hashPassword("TempPass1!"),
      firstName: "Maria",
      lastName: "Garcia",
      role: "employee" as const,
      managerId: managerMaint.id,
      hireDate: "2022-04-15",
      employmentStatus: "active" as const,
      mustChangePassword: true,
      notificationPreferences: {},
    },
    {
      organizationId: org.id,
      departmentId: deptLeasing.id,
      email: "employee3@categoryfiveventures.com",
      passwordHash: await hashPassword("TempPass1!"),
      firstName: "David",
      lastName: "Chen",
      role: "employee" as const,
      managerId: managerLeasing.id,
      hireDate: "2023-02-01",
      employmentStatus: "active" as const,
      mustChangePassword: true,
      notificationPreferences: {},
    },
    {
      organizationId: org.id,
      departmentId: deptAdmin.id,
      email: "employee4@categoryfiveventures.com",
      passwordHash: await hashPassword("TempPass1!"),
      firstName: "Lisa",
      lastName: "Thompson",
      role: "employee" as const,
      managerId: superAdmin.id,
      hireDate: "2023-05-20",
      employmentStatus: "active" as const,
      mustChangePassword: true,
      notificationPreferences: {},
    },
    {
      organizationId: org.id,
      departmentId: deptAdmin.id,
      email: "employee5@categoryfiveventures.com",
      passwordHash: await hashPassword("TempPass1!"),
      firstName: "Robert",
      lastName: "Martinez",
      role: "employee" as const,
      managerId: superAdmin.id,
      hireDate: "2024-01-08",
      employmentStatus: "active" as const,
      mustChangePassword: true,
      notificationPreferences: {},
    },
  ];

  const insertedEmployees = await db.insert(users).values(employeeData).returning();

  const allEmployees = [
    superAdmin,
    managerMaint,
    managerLeasing,
    ...insertedEmployees,
  ];

  // -------------------------------------------------------------------------
  // Leave Types
  // -------------------------------------------------------------------------
  console.log("  Creating leave types...");
  const leaveTypeData = [
    {
      organizationId: org.id,
      name: "Paid Time Off (PTO)",
      defaultAnnualDays: "15.00",
      accrualMethod: "monthly" as const,
      maxCarryoverDays: "5.00",
      requiresDocumentation: false,
      isPaid: true,
      isActive: true,
    },
    {
      organizationId: org.id,
      name: "Sick Leave",
      defaultAnnualDays: "10.00",
      accrualMethod: "front_loaded" as const,
      maxCarryoverDays: "0.00",
      requiresDocumentation: false,
      isPaid: true,
      isActive: true,
    },
    {
      organizationId: org.id,
      name: "Personal Day",
      defaultAnnualDays: "3.00",
      accrualMethod: "front_loaded" as const,
      maxCarryoverDays: "0.00",
      requiresDocumentation: false,
      isPaid: true,
      isActive: true,
    },
    {
      organizationId: org.id,
      name: "Bereavement",
      defaultAnnualDays: "5.00",
      accrualMethod: "as_needed" as const,
      maxCarryoverDays: "0.00",
      requiresDocumentation: false,
      isPaid: true,
      isActive: true,
    },
    {
      organizationId: org.id,
      name: "Jury Duty",
      defaultAnnualDays: "10.00",
      accrualMethod: "as_needed" as const,
      maxCarryoverDays: "0.00",
      requiresDocumentation: true,
      isPaid: true,
      isActive: true,
    },
    {
      organizationId: org.id,
      name: "Unpaid Leave",
      defaultAnnualDays: "30.00",
      accrualMethod: "as_needed" as const,
      maxCarryoverDays: "0.00",
      requiresDocumentation: false,
      isPaid: false,
      isActive: true,
    },
  ];

  const insertedLeaveTypes = await db
    .insert(leaveTypes)
    .values(leaveTypeData)
    .returning();

  const [ltPTO, ltSick, ltPersonal] = insertedLeaveTypes;

  // -------------------------------------------------------------------------
  // Policy Rules (org-wide defaults)
  // -------------------------------------------------------------------------
  console.log("  Creating default policy rules...");

  // PTO accrual is 1.25 days/month — 15 days / 12 months
  // Balances are set manually in the balance seed below based on hire date

  await db.insert(policyRules).values([
    // Advance notice tiers
    {
      organizationId: org.id,
      ruleType: "advance_notice" as const,
      parameters: {
        tiers: [
          { min_days: 1, max_days: 2, notice_hours: 48 },
          { min_days: 3, max_days: 5, notice_hours: 240 },
          { min_days: 6, max_days: 10, notice_hours: 720 },
        ],
      },
      priority: 0,
      effectiveFrom: `${CURRENT_YEAR}-01-01`,
      isActive: true,
      createdBy: superAdmin.id,
    },
    // Consecutive day cap
    {
      organizationId: org.id,
      ruleType: "consecutive_cap" as const,
      parameters: {
        max_consecutive_days: 7,
        min_gap_between_blocks_days: 14,
        max_long_blocks_per_year: 2,
        long_block_threshold_days: 5,
      },
      priority: 0,
      effectiveFrom: `${CURRENT_YEAR}-01-01`,
      isActive: true,
      createdBy: superAdmin.id,
    },
    // Coverage minimum — Maintenance (override dept default)
    {
      organizationId: org.id,
      departmentId: deptMaintenance.id,
      ruleType: "coverage_min" as const,
      parameters: {
        minimum_staff: 2,
        applies_to_leave_types: ["pto", "personal"],
      },
      priority: 10,
      effectiveFrom: `${CURRENT_YEAR}-01-01`,
      isActive: true,
      createdBy: superAdmin.id,
    },
    // Coverage minimum — Leasing
    {
      organizationId: org.id,
      departmentId: deptLeasing.id,
      ruleType: "coverage_min" as const,
      parameters: {
        minimum_staff: 1,
        applies_to_leave_types: ["pto", "personal"],
      },
      priority: 10,
      effectiveFrom: `${CURRENT_YEAR}-01-01`,
      isActive: true,
      createdBy: superAdmin.id,
    },
  ]);

  // -------------------------------------------------------------------------
  // Leave Balances (current year for all employees)
  // -------------------------------------------------------------------------
  console.log("  Creating leave balances...");

  const balanceInserts: Parameters<typeof db.insert>[0] extends typeof leaveBalances
    ? never
    : (typeof leaveBalances.$inferInsert)[] = [];

  for (const employee of allEmployees) {
    // PTO — pro-rated by months employed this year
    const hireDate = new Date(employee.hireDate);
    const yearStart = new Date(`${CURRENT_YEAR}-01-01`);
    const hireYear = hireDate.getFullYear();
    const monthsEarned =
      hireYear < CURRENT_YEAR
        ? 12
        : Math.max(0, 12 - hireDate.getMonth()); // rough pro-rate

    const ptoEarned = (monthsEarned * 1.25).toFixed(2);

    balanceInserts.push(
      {
        userId: employee.id,
        leaveTypeId: ltPTO.id,
        year: CURRENT_YEAR,
        totalEntitled: ptoEarned,
        used: "0",
        pending: "0",
        carriedOver: "0",
        adjusted: "0",
      },
      {
        userId: employee.id,
        leaveTypeId: ltSick.id,
        year: CURRENT_YEAR,
        totalEntitled: "10.00",
        used: "0",
        pending: "0",
        carriedOver: "0",
        adjusted: "0",
      },
      {
        userId: employee.id,
        leaveTypeId: ltPersonal.id,
        year: CURRENT_YEAR,
        totalEntitled: "3.00",
        used: "0",
        pending: "0",
        carriedOver: "0",
        adjusted: "0",
      }
    );
  }

  await db.insert(leaveBalances).values(balanceInserts);

  console.log("✅ Seed complete!");
  console.log(`
  Accounts created:
  ─────────────────────────────────────────────────
  Super Admin:  admin@categoryfiveventures.com  /  Admin123!@#
  Manager:      manager.maintenance@categoryfiveventures.com  /  TempPass1!
  Manager:      manager.leasing@categoryfiveventures.com  /  TempPass1!
  Employees:    employee1–5@categoryfiveventures.com  /  TempPass1!
  ─────────────────────────────────────────────────
  All employees except super admin must change password on first login.
  `);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
