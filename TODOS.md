# TODOS

## Completed

### P2 — Test infrastructure setup
**Completed:** 2026-03-24

Shared Vitest mock helpers created in `tests/__mocks__/db.ts` and `tests/__mocks__/resend.ts`.
Reference test for `admin.sendLoginLink` written in `tests/admin-send-login-link.test.ts` (8/8 passing).
`createCallerFactory` exported from `src/server/trpc/trpc.ts`.

### P2 — Audit log for admin email actions
**Completed:** 2026-03-24

`USER_LOGIN_LINK_SENT` added to `AUDIT_ACTIONS` in `audit-service.ts`.
`appendAuditLog` (fire-and-forget) called in both `sendLoginLink` and `bulkSendLoginLinks` mutations in `admin.ts`.

### P2 — Extract StatusBadge to shared component
**Completed:** 2026-03-24

`src/components/ui/status-badge.tsx` created with `STATUS_CFG` and `StatusBadge`.
All three duplicate consumers (`dashboard/page.tsx`, `requests/history/page.tsx`, `requests/[id]/page.tsx`) updated to import from the shared component.
`team/calendar` and `admin/reports` updated to use `StatusBadge` instead of bare `{evt.status}`.

### P2 — Fix hardcoded `bg-red-600` on cancel dialogs
**Completed:** 2026-03-24

Replaced `className="bg-red-600 hover:bg-red-700 text-white"` with `variant="destructive"` on cancel confirm buttons in `team/calendar/page.tsx:213` and `admin/reports/page.tsx:396`.

### P3 — Header action buttons: increase to 44px touch target
**Completed:** 2026-03-24

Notification bell button in `NotificationBell.tsx` and user profile button in `Header.tsx` updated from `h-9` (36px) to `h-11` (44px).

### P3 — Focus-visible ring on employee table name links
**Completed:** 2026-03-24

Added `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm` to employee name Link elements in `admin/employees/page.tsx`.
