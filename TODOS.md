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

## P2 — Extract StatusBadge to shared component

**What:** Move the `STATUS_CFG` record and `StatusBadge` component (copied identically in `dashboard/page.tsx`, `requests/history/page.tsx`, `requests/[id]/page.tsx`) into a shared component at `src/components/ui/status-badge.tsx`.

**Why:** The copy-paste is the root cause of CS-1 below — pages that didn't copy it (`team/calendar`, `admin/reports`) render raw `{evt.status}` values with no badge styling. Every future status label change requires 3 edits.

**Pros:** Single source of truth for status labels/variants. Fixes the raw-value bug in calendar and reports automatically when those pages are updated to use it.

**Cons:** Small refactor touching 5 files.

**Context:** `STATUS_CFG` maps `"approved"` → `{ label: "Approved", variant: "success", icon: CheckCircle }` etc. It lives in 3 page files verbatim. The fix is: create `src/components/ui/status-badge.tsx`, export `StatusBadge`, and update the 3 consumers. Then fix `team/calendar` and `admin/reports` to use it instead of rendering `{evt.status}` bare.

**Effort:** S (human: ~45 min / CC+gstack: ~5 min)
**Priority:** P2
**Depends on:** Nothing

## P2 — Fix hardcoded `bg-red-600` on cancel dialogs

**What:** Replace `className="bg-red-600 hover:bg-red-700 text-white"` with `variant="destructive"` on the cancel-leave confirm buttons in `src/app/(app)/team/calendar/page.tsx:213` and `src/app/(app)/admin/reports/page.tsx:396`.

**Why:** These two dialogs use a solid red fill while every other destructive action in the app (approvals, request history) uses `variant="destructive"` which applies a muted `bg-destructive/10` treatment. Found by design consistency subagent.

**Pros:** Design system consistency — all destructive actions look the same.

**Cons:** None. The `destructive` variant exists and matches the intent.

**Effort:** XS (human: ~5 min / CC+gstack: ~1 min)
**Priority:** P2
**Depends on:** Nothing

## P3 — Header action buttons: increase to 44px touch target

**What:** Increase notification bell and user profile buttons in Header.tsx from h-9 (36px) to h-11 (44px).

**Why:** WCAG 2.1 SC 2.5.5 requires 44px touch targets. Both header buttons are 36px — discoverable only via `/design-review` audit on 2026-03-24.

**Pros:** Fixes mobile accessibility gap on every authenticated page. One component file, low blast radius.

**Cons:** Slightly taller header on mobile — visually minor.

**Context:** The "Add Employee" button (32px) and search input (32px) on the employees page also fall below 44px. Consider doing a global audit of `h-8` and `h-9` instances across form controls.

**Effort:** S (human: ~15 min / CC+gstack: ~3 min)
**Priority:** P3
**Depends on:** Nothing

## P3 — Focus-visible ring on employee table name links

**What:** Add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm` to the employee name Link elements in `src/app/(app)/admin/employees/page.tsx`.

**Why:** Keyboard users navigating the employees table have no visible focus indicator on the name links — only `hover:underline` is present. Found by `/design-review` audit on 2026-03-24.

**Pros:** Correct keyboard navigation UX; trivial CSS-only change.

**Cons:** None.

**Effort:** XS (human: ~5 min / CC+gstack: ~1 min)
**Priority:** P3
**Depends on:** Nothing
