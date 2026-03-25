/**
 * Reference tests for the admin.sendLoginLink tRPC mutation.
 *
 * Covers:
 *  - Happy path: returns tempPassword
 *  - DB is updated (passwordHash + mustChangePassword)
 *  - sendWelcomeEmail is called with correct args
 *  - sendWelcomeEmail failure does NOT propagate — tempPassword still returned
 *  - appendAuditLog is called (fire-and-forget)
 *  - NOT_FOUND when user doesn't exist in the org
 *  - NOT_FOUND when user is soft-deleted
 *  - FORBIDDEN when caller is not admin
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock() factories
// ---------------------------------------------------------------------------

const {
  mockHashPassword,
  mockSendWelcomeEmail,
  mockGetUserById,
  mockAppendAuditLog,
} = vi.hoisted(() => ({
  mockHashPassword: vi.fn().mockResolvedValue("hashed-password"),
  mockSendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  mockGetUserById: vi.fn(),
  mockAppendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/server/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

vi.mock("@/server/services/notification-service", () => ({
  notifyAdminCancelledRequest: vi.fn(),
}));

vi.mock("@/server/services/user-service", () => ({
  hashPassword: mockHashPassword,
  sendWelcomeEmail: mockSendWelcomeEmail,
  getUserById: mockGetUserById,
}));

vi.mock("@/server/services/audit-service", () => ({
  appendAuditLog: mockAppendAuditLog,
  AUDIT_ACTIONS: {
    USER_LOGIN_LINK_SENT: "user.login_link_sent",
    USER_UPDATED: "user.updated",
    USER_CREATED: "user.created",
    USER_DEACTIVATED: "user.deactivated",
    USER_PASSWORD_CHANGED: "user.password_changed",
    USER_ACCOUNT_LOCKED: "user.account_locked",
    LEAVE_SUBMITTED: "leave_request.submitted",
    LEAVE_APPROVED: "leave_request.approved",
    LEAVE_DENIED: "leave_request.denied",
    LEAVE_CANCELLED: "leave_request.cancelled",
    LEAVE_ESCALATED: "leave_request.escalated",
    LEAVE_EXPIRED: "leave_request.expired",
    LEAVE_OVERRIDE_APPROVED: "leave_request.override_approved",
    POLICY_CREATED: "policy.created",
    POLICY_UPDATED: "policy.updated",
    POLICY_OVERRIDDEN: "policy.overridden",
    BALANCE_ADJUSTED: "balance.adjusted",
    BALANCE_ACCRUED: "balance.accrued",
    BALANCE_CARRIED_OVER: "balance.carried_over",
  },
}));

// Drizzle db — shared mock helpers
import {
  mockDbFindFirst,
  mockDbUpdate,
  mockDbSet,
  mockDbWhere,
  resetDbMocks,
  db as mockDb,
} from "./__mocks__/db";

vi.mock("@/server/db", () => ({ db: mockDb }));

// ---------------------------------------------------------------------------
// System under test — imported after mocks
// ---------------------------------------------------------------------------

import { adminRouter } from "@/server/trpc/admin";
import { createCallerFactory } from "@/server/trpc/trpc";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
// All IDs that pass through Zod z.string().uuid() must satisfy:
//   version byte (3rd group, 1st char): [1-8]
//   variant byte (4th group, 1st char): [89abAB]
const ADMIN_USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // v4, variant b ✓
const TARGET_USER_ID = "550e8400-e29b-41d4-a716-446655440001"; // v4, variant a ✓
const MANAGER_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"; // v4, variant a ✓

const adminDbUser = {
  id: ADMIN_USER_ID,
  organizationId: ORG_ID,
  role: "admin" as const,
  deletedAt: null,
  employmentStatus: "active" as const,
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
};

const targetDbUser = {
  id: TARGET_USER_ID,
  email: "alice@example.com",
  firstName: "Alice",
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Caller factory
// ---------------------------------------------------------------------------

const createCaller = createCallerFactory(adminRouter);

function adminCtx() {
  return {
    req: new Request("http://localhost"),
    session: {
      user: {
        id: ADMIN_USER_ID,
        email: adminDbUser.email,
        role: "admin",
        mustChangePassword: false,
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
  } as import("@/server/trpc/context").TRPCContext;
}

function managerCtx() {
  return {
    req: new Request("http://localhost"),
    session: {
      user: {
        id: MANAGER_USER_ID,
        email: "mgr@example.com",
        role: "manager",
        mustChangePassword: false,
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
  } as import("@/server/trpc/context").TRPCContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin.sendLoginLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbMocks();

    // protectedProcedure validates the session user is still active
    mockGetUserById.mockResolvedValue(adminDbUser);
  });

  it("returns a non-empty tempPassword on the happy path", async () => {
    mockDbFindFirst.mockResolvedValue(targetDbUser);

    const caller = createCaller(adminCtx());
    const result = await caller.sendLoginLink({ userId: TARGET_USER_ID });

    expect(result).toHaveProperty("tempPassword");
    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword.length).toBeGreaterThanOrEqual(12);
  });

  it("updates passwordHash and sets mustChangePassword = true", async () => {
    mockDbFindFirst.mockResolvedValue(targetDbUser);

    const caller = createCaller(adminCtx());
    await caller.sendLoginLink({ userId: TARGET_USER_ID });

    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: expect.any(String),
        mustChangePassword: true,
        updatedAt: expect.any(Date),
      })
    );
    expect(mockDbWhere).toHaveBeenCalledOnce();
  });

  it("passes correct email/firstName/tempPassword to sendWelcomeEmail", async () => {
    mockDbFindFirst.mockResolvedValue(targetDbUser);

    const caller = createCaller(adminCtx());
    const { tempPassword } = await caller.sendLoginLink({ userId: TARGET_USER_ID });

    expect(mockSendWelcomeEmail).toHaveBeenCalledWith({
      email: targetDbUser.email,
      firstName: targetDbUser.firstName,
      tempPassword,
    });
  });

  it("still returns tempPassword when sendWelcomeEmail rejects", async () => {
    mockDbFindFirst.mockResolvedValue(targetDbUser);
    mockSendWelcomeEmail.mockRejectedValue(new Error("SMTP timeout"));

    const caller = createCaller(adminCtx());
    const result = await caller.sendLoginLink({ userId: TARGET_USER_ID });

    expect(result).toHaveProperty("tempPassword");
    expect(typeof result.tempPassword).toBe("string");
  });

  it("fires appendAuditLog with action user.login_link_sent", async () => {
    mockDbFindFirst.mockResolvedValue(targetDbUser);

    const caller = createCaller(adminCtx());
    await caller.sendLoginLink({ userId: TARGET_USER_ID });

    // appendAuditLog is fire-and-forget; flush the microtask queue
    await Promise.resolve();

    expect(mockAppendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.login_link_sent",
        entityType: "user",
        entityId: TARGET_USER_ID,
      })
    );
  });

  it("throws NOT_FOUND when user does not exist in the org", async () => {
    mockDbFindFirst.mockResolvedValue(null);

    const caller = createCaller(adminCtx());

    await expect(
      caller.sendLoginLink({ userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when user is soft-deleted", async () => {
    mockDbFindFirst.mockResolvedValue({
      ...targetDbUser,
      deletedAt: new Date("2024-01-01"),
    });

    const caller = createCaller(adminCtx());

    await expect(
      caller.sendLoginLink({ userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when the caller is a manager (not admin)", async () => {
    mockGetUserById.mockResolvedValue({
      ...adminDbUser,
      id: MANAGER_USER_ID,
      role: "manager" as const,
    });

    const caller = createCaller(managerCtx());

    await expect(
      caller.sendLoginLink({ userId: TARGET_USER_ID })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
