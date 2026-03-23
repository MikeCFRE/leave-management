import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "employee",
  "manager",
  "admin",
  "super_admin",
]);

export const employmentStatusEnum = pgEnum("employment_status", [
  "active",
  "inactive",
  "on_leave",
  "terminated",
]);

export const accrualMethodEnum = pgEnum("accrual_method", [
  "monthly",
  "front_loaded",
  "as_needed",
]);

export const leaveStatusEnum = pgEnum("leave_status", [
  "draft",
  "pending",
  "approved",
  "denied",
  "cancelled",
  "expired",
]);

export const approvalActionEnum = pgEnum("approval_action", [
  "approved",
  "denied",
  "escalated",
  "returned_for_changes",
]);

export const ruleTypeEnum = pgEnum("rule_type", [
  "advance_notice",
  "consecutive_cap",
  "coverage_min",
  "blackout",
  "balance_override",
]);

export const blackoutSeverityEnum = pgEnum("blackout_severity", [
  "soft_block",
  "hard_block",
]);

// ---------------------------------------------------------------------------
// organizations
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  workSchedule: jsonb("work_schedule"), // { workDays: [1,2,3,4,5] }
  holidayCalendar: jsonb("holiday_calendar"), // { holidays: ["2026-01-01", ...] }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// departments
// ---------------------------------------------------------------------------

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => departments.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  minCoverage: integer("min_coverage"),
  totalHeadcount: integer("total_headcount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: userRoleEnum("role").notNull().default("employee"),
  managerId: uuid("manager_id").references((): AnyPgColumn => users.id, {
    onDelete: "set null",
  }),
  hireDate: date("hire_date").notNull(),
  employmentStatus: employmentStatusEnum("employment_status")
    .notNull()
    .default("active"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastPasswordChange: timestamp("last_password_change", { withTimezone: true }),
  notificationPreferences: jsonb("notification_preferences"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// leave_types
// ---------------------------------------------------------------------------

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  defaultAnnualDays: decimal("default_annual_days", {
    precision: 5,
    scale: 2,
  }).notNull(),
  accrualMethod: accrualMethodEnum("accrual_method").notNull(),
  maxCarryoverDays: decimal("max_carryover_days", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
  requiresDocumentation: boolean("requires_documentation")
    .notNull()
    .default(false),
  isPaid: boolean("is_paid").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// leave_balances
// ---------------------------------------------------------------------------

export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    totalEntitled: decimal("total_entitled", { precision: 6, scale: 2 }).notNull(),
    used: decimal("used", { precision: 6, scale: 2 }).notNull().default("0"),
    pending: decimal("pending", { precision: 6, scale: 2 }).notNull().default("0"),
    carriedOver: decimal("carried_over", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    adjusted: decimal("adjusted", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
  },
  (table) => [
    uniqueIndex("leave_balances_user_type_year_idx").on(
      table.userId,
      table.leaveTypeId,
      table.year
    ),
  ]
);

// ---------------------------------------------------------------------------
// leave_requests
// ---------------------------------------------------------------------------

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    totalBusinessDays: decimal("total_business_days", {
      precision: 5,
      scale: 2,
    }).notNull(),
    totalCalendarDays: integer("total_calendar_days").notNull(),
    status: leaveStatusEnum("status").notNull().default("draft"),
    reason: text("reason"),
    isEmergency: boolean("is_emergency").notNull().default(false),
    policyOverrideUsed: boolean("policy_override_used").notNull().default(false),
    policyViolations: jsonb("policy_violations"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leave_requests_user_status_start_idx").on(
      table.userId,
      table.status,
      table.startDate
    ),
    index("leave_requests_pending_idx").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// leave_request_approvals
// ---------------------------------------------------------------------------

export const leaveRequestApprovals = pgTable("leave_request_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => leaveRequests.id, { onDelete: "cascade" }),
  approverId: uuid("approver_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  tier: integer("tier").notNull(),
  action: approvalActionEnum("action").notNull(),
  comment: text("comment"),
  autoEscalated: boolean("auto_escalated").notNull().default(false),
  actedAt: timestamp("acted_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// leave_request_documents
// ---------------------------------------------------------------------------

export const leaveRequestDocuments = pgTable("leave_request_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => leaveRequests.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: text("mime_type"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// policy_rules
// ---------------------------------------------------------------------------

export const policyRules = pgTable("policy_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "cascade",
  }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  ruleType: ruleTypeEnum("rule_type").notNull(),
  parameters: jsonb("parameters").notNull(),
  priority: integer("priority").notNull().default(0),
  effectiveFrom: date("effective_from").notNull(),
  effectiveUntil: date("effective_until"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// blackout_periods
// ---------------------------------------------------------------------------

export const blackoutPeriods = pgTable("blackout_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "cascade",
  }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  severity: blackoutSeverityEnum("severity").notNull().default("soft_block"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// audit_log  (append-only — no updates/deletes enforced via RLS in Supabase)
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_org_timestamp_idx").on(
      table.organizationId,
      table.timestamp
    ),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ]
);

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_read_idx").on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  departments: many(departments),
  users: many(users),
  leaveTypes: many(leaveTypes),
  policyRules: many(policyRules),
  blackoutPeriods: many(blackoutPeriods),
  auditLog: many(auditLog),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [departments.organizationId],
    references: [organizations.id],
  }),
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: "dept_parent",
  }),
  children: many(departments, { relationName: "dept_parent" }),
  users: many(users),
  policyRules: many(policyRules),
  blackoutPeriods: many(blackoutPeriods),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager_reports",
  }),
  reports: many(users, { relationName: "manager_reports" }),
  leaveBalances: many(leaveBalances),
  leaveRequests: many(leaveRequests),
  notifications: many(notifications),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [leaveTypes.organizationId],
    references: [organizations.id],
  }),
  balances: many(leaveBalances),
  requests: many(leaveRequests),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  user: one(users, {
    fields: [leaveBalances.userId],
    references: [users.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveRequestsRelations = relations(
  leaveRequests,
  ({ one, many }) => ({
    user: one(users, {
      fields: [leaveRequests.userId],
      references: [users.id],
    }),
    leaveType: one(leaveTypes, {
      fields: [leaveRequests.leaveTypeId],
      references: [leaveTypes.id],
    }),
    approvals: many(leaveRequestApprovals),
    documents: many(leaveRequestDocuments),
  })
);

export const leaveRequestApprovalsRelations = relations(
  leaveRequestApprovals,
  ({ one }) => ({
    request: one(leaveRequests, {
      fields: [leaveRequestApprovals.requestId],
      references: [leaveRequests.id],
    }),
    approver: one(users, {
      fields: [leaveRequestApprovals.approverId],
      references: [users.id],
    }),
  })
);

export const leaveRequestDocumentsRelations = relations(
  leaveRequestDocuments,
  ({ one }) => ({
    request: one(leaveRequests, {
      fields: [leaveRequestDocuments.requestId],
      references: [leaveRequests.id],
    }),
    uploadedByUser: one(users, {
      fields: [leaveRequestDocuments.uploadedBy],
      references: [users.id],
    }),
  })
);

export const policyRulesRelations = relations(policyRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyRules.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [policyRules.departmentId],
    references: [departments.id],
  }),
  user: one(users, {
    fields: [policyRules.userId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [policyRules.createdBy],
    references: [users.id],
    relationName: "policy_creator",
  }),
}));

export const blackoutPeriodsRelations = relations(blackoutPeriods, ({ one }) => ({
  organization: one(organizations, {
    fields: [blackoutPeriods.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [blackoutPeriods.departmentId],
    references: [departments.id],
  }),
  createdByUser: one(users, {
    fields: [blackoutPeriods.createdBy],
    references: [users.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
