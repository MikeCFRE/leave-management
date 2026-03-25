# TODOS

## P2 — Test infrastructure setup

**What:** Set up shared Vitest mock infrastructure: Drizzle query builder mocks, Resend mock factory, NextAuth suppressor.

**Why:** The project has Vitest installed but zero tests. The launch-preflight PR added the first 4 test files (last-login-format, user-service-last-login, admin-mutations, auth-last-login). Each required bespoke mock setup — the patterns should be extracted into shared helpers so future tests aren't starting from scratch.

**Pros:** Every future test file starts from a working foundation rather than rediscovering Drizzle's builder chain mock pattern (`.update().set().where()`) from scratch.

**Cons:** Small upfront investment; mock patterns may need adjusting as Drizzle or NextAuth versions change.

**Context:** Drizzle's fluent builder pattern is awkward to mock with vi.fn() — it requires chaining `.mockReturnThis()` across `.update()`, `.set()`, `.where()`. The first test files in this codebase will establish the pattern. Extract it into `tests/__mocks__/db.ts` and `tests/__mocks__/resend.ts` after the first few test files exist. Start with the `sendLoginLink` tests as the reference implementation.

**Effort:** S (human: ~2 hours / CC+gstack: ~10 min)
**Priority:** P2
**Depends on:** Launch-preflight PR merged and first test files written

## P2 — Audit log for admin email actions

**What:** Ensure `appendAuditLog` is called in both `sendLoginLink` and `bulkSendLoginLinks` mutations.

**Why:** Admin-triggered emails (sending login links) are sensitive operations that should be traceable. Currently `cancelLeaveRequest` is logged; these should be too.

**Pros:** Trust and accountability. If an employee says "I never got an email," the audit log shows whether the admin sent it.

**Cons:** None — it's a 3-line addition per mutation using the existing audit infrastructure.

**Context:** `appendAuditLog` + `AUDIT_ACTIONS` are already imported in admin.ts. Add a new `SEND_LOGIN_LINK` constant to `AUDIT_ACTIONS` in audit-service.ts and call `appendAuditLog` at the end of both mutations (fire-and-forget, `.catch(console.error)` — same pattern as other non-critical audit writes).

**Effort:** S (human: ~30 min / CC+gstack: ~3 min)
**Priority:** P2
**Depends on:** sendLoginLink and bulkSendLoginLinks mutations implemented
