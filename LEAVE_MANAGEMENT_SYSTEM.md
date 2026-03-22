# Employee Leave Management System — Full Implementation Specification

## Project Context

**Company:** Category Five Ventures / BH STR LLC
**Purpose:** Replace manual (verbal/text-based) employee leave tracking with a secure, self-service web application where employees submit time-off requests and managers approve them within configurable policy guardrails.
**Current Scale:** ~20–50 employees across property management operations (multi-family residential, South Florida).
**Target Scale:** Architecture must support growth to 2,000+ employees across dozens of properties without re-architecture.

---

## 1. HR Policy Framework (Business Rules)

Every rule below is implemented as an **admin-editable setting stored in the database**, never hardcoded.

### 1.1 Leave Types & Accrual Defaults

| Leave Type | Annual Allotment | Accrual Method | Carry-Over |
|---|---|---|---|
| Paid Time Off (PTO) | 15 days (120 hrs) | 1.25 days/month | Max 5 days to next year |
| Sick Leave | 10 days (80 hrs) | Front-loaded Jan 1 | No carry-over |
| Personal Day | 3 days (24 hrs) | Front-loaded Jan 1 | No carry-over |
| Bereavement | 3–5 days per event | As-needed | N/A |
| Jury Duty | As required | As-needed | N/A |
| Unpaid Leave | Manager discretion | N/A | N/A |

Admin panel allows overriding allotments per employee, per department, or per property (organization).

### 1.2 Advance Notice Requirements

| Request Duration | Minimum Advance Notice |
|---|---|
| 1–2 days | 48 hours (2 business days) |
| 3–5 days | 2 weeks (10 business days) |
| 6–10 days (1–2 weeks) | 30 days |
| Emergency / same-day | ASAP within 1 hour of shift — auto-flagged, requires retroactive approval |

The system enforces these at submission time. If an employee attempts to request 5 days off with only 7 days notice, the system blocks submission and displays the policy requirement.

### 1.3 Consecutive Day Caps (Critical Rule)

| Parameter | Default Value | Admin Configurable |
|---|---|---|
| Max consecutive calendar days per single request | 7 days | Yes, per department |
| Minimum gap between multi-week requests | 14 calendar days | Yes, per department |
| Annual cap on total consecutive day blocks (5+ days) | 2 blocks per year | Yes, per employee level |
| Blackout override | No consecutive blocks during blackout periods | Yes |

**How it works:** If an employee wants two weeks off, they must submit two separate one-week requests with at least 14 calendar days between them. The system rejects a single 14-day request and explains the split-request policy.

**Manager override:** A property manager or executive can override the consecutive-day cap for exceptional circumstances (FMLA, medical leave, bereavement extension). The override is logged with a mandatory reason field and flagged for HR audit.

### 1.4 Approval Hierarchy

1. Employee submits request through the portal.
2. Direct supervisor receives notification and has 48 hours to approve/deny/request changes.
3. If no action in 48 hours, request auto-escalates to property manager.
4. Property manager can approve, deny, or escalate to executive level.
5. Executive override available for policy exceptions (consecutive day cap, blackout overrides).
6. All approvals and denials require a comment/reason (mandatory for denials).

The approval chain is configurable per property. Small properties with flat structure route directly to property manager. Larger operations can have team leads as first tier.

### 1.5 Blackout Periods & Coverage Minimums

- **Blackout periods:** Admin-defined date ranges where no PTO is approved (e.g., first/last week of month for rent collection, lease turnover season). Two severity levels: `hard_block` (prevents submission entirely) and `soft_block` (allows submission with warning, requires explicit manager approval).
- **Coverage minimums:** Per-department rule ensuring a minimum number of staff are on-site on any given day. Example: Maintenance department requires at least 2 of 4 techs on any given day. The system auto-calculates coverage when a request is submitted and warns the approver if approving would breach the minimum.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14+ (App Router) + Tailwind CSS + shadcn/ui | SSR for speed, Tailwind for rapid UI, shadcn for accessible components |
| Backend API | Next.js API Routes + tRPC | Type-safe API with zero boilerplate, co-located with frontend |
| Database | PostgreSQL 16 (via Supabase or Neon) | Row-level security, JSONB for flexible policy configs, excellent scaling |
| Authentication | NextAuth.js v5 (Auth.js) | Credential-based login now, extensible to SSO/OAuth later |
| ORM | Drizzle ORM | Type-safe SQL, lightweight, excellent migration support |
| Email Notifications | Resend | Simple API, generous free tier, reliable delivery |
| SMS Notifications | Twilio (optional, Phase 2) | For urgent approval escalations |
| Hosting | Vercel (frontend + API) + Supabase (database + storage) | Zero-config deployment, auto-scaling |
| File Storage | Supabase Storage | For doctor notes, supporting documents attached to leave requests |
| Monitoring | Vercel Analytics + Sentry | Error tracking, performance monitoring |
| CI/CD | GitHub Actions | Automated testing, linting, deployment on push |

---

## 3. Database Schema

All tables include `created_at`, `updated_at`, and soft-delete (`deleted_at`) columns. Use UUIDs for all primary keys.

### 3.1 Core Tables

**`organizations`** — Top-level entity. Each property is an organization. Supports multi-tenant isolation from day one.
- `id` (UUID, PK)
- `name` (text, not null)
- `slug` (text, unique) — URL-safe identifier
- `timezone` (text, default 'America/New_York')
- `fiscal_year_start_month` (int, default 1)
- `work_schedule` (JSONB) — defines working days, default Mon–Fri
- `holiday_calendar` (JSONB) — company holidays
- `created_at`, `updated_at`, `deleted_at`

**`departments`** — Linked to organization.
- `id` (UUID, PK)
- `organization_id` (UUID, FK → organizations)
- `name` (text, not null)
- `min_coverage` (int, nullable) — minimum staff required per day
- `total_headcount` (int) — used for coverage calculations
- `created_at`, `updated_at`, `deleted_at`

**`users`** — All employees, managers, admins.
- `id` (UUID, PK)
- `organization_id` (UUID, FK → organizations)
- `department_id` (UUID, FK → departments)
- `email` (text, unique, not null)
- `password_hash` (text, not null)
- `first_name` (text, not null)
- `last_name` (text, not null)
- `role` (enum: 'employee', 'manager', 'admin', 'super_admin')
- `manager_id` (UUID, FK → users, nullable) — self-referencing for approval chain
- `hire_date` (date, not null)
- `employment_status` (enum: 'active', 'inactive', 'on_leave', 'terminated')
- `must_change_password` (boolean, default true)
- `failed_login_attempts` (int, default 0)
- `locked_until` (timestamp, nullable)
- `last_password_change` (timestamp)
- `notification_preferences` (JSONB) — channel preferences per event type
- `created_at`, `updated_at`, `deleted_at`

**`leave_types`** — Configurable per organization.
- `id` (UUID, PK)
- `organization_id` (UUID, FK → organizations)
- `name` (text, not null)
- `default_annual_days` (decimal, not null)
- `accrual_method` (enum: 'monthly', 'front_loaded', 'as_needed')
- `max_carryover_days` (decimal, default 0)
- `requires_documentation` (boolean, default false)
- `is_paid` (boolean, default true)
- `is_active` (boolean, default true)
- `created_at`, `updated_at`

**`leave_balances`** — Per user, per leave type, per year.
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `leave_type_id` (UUID, FK → leave_types)
- `year` (int, not null)
- `total_entitled` (decimal, not null)
- `used` (decimal, default 0)
- `pending` (decimal, default 0)
- `carried_over` (decimal, default 0)
- `adjusted` (decimal, default 0) — manual admin adjustments
- Computed column or app-layer: `remaining = total_entitled + carried_over + adjusted - used - pending`
- Unique constraint on (`user_id`, `leave_type_id`, `year`)

### 3.2 Request & Approval Tables

**`leave_requests`** — Central table.
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `leave_type_id` (UUID, FK → leave_types)
- `start_date` (date, not null)
- `end_date` (date, not null)
- `total_business_days` (decimal, not null) — excluding weekends and holidays
- `total_calendar_days` (int, not null)
- `status` (enum: 'draft', 'pending', 'approved', 'denied', 'cancelled', 'expired')
- `reason` (text, nullable)
- `is_emergency` (boolean, default false)
- `policy_override_used` (boolean, default false)
- `policy_violations` (JSONB, nullable) — stores which validators failed if override was used
- `submitted_at` (timestamp, nullable) — null while draft
- `decided_at` (timestamp, nullable)
- `cancelled_at` (timestamp, nullable)
- `created_at`, `updated_at`
- Index on (`user_id`, `status`, `start_date`)
- Index on (`status`) WHERE status = 'pending' (partial index for approval queue)

**`leave_request_approvals`** — One row per approval action. Supports multi-tier.
- `id` (UUID, PK)
- `request_id` (UUID, FK → leave_requests)
- `approver_id` (UUID, FK → users)
- `tier` (int, not null) — 1 = direct supervisor, 2 = property manager, 3 = executive
- `action` (enum: 'approved', 'denied', 'escalated', 'returned_for_changes')
- `comment` (text, not null for denials)
- `auto_escalated` (boolean, default false)
- `acted_at` (timestamp, not null)

**`leave_request_documents`** — File attachments.
- `id` (UUID, PK)
- `request_id` (UUID, FK → leave_requests)
- `file_url` (text, not null)
- `file_name` (text, not null)
- `file_size_bytes` (int)
- `mime_type` (text)
- `uploaded_by` (UUID, FK → users)
- `uploaded_at` (timestamp, not null)

### 3.3 Policy & Configuration Tables

**`policy_rules`** — JSONB-based flexible policy storage.
- `id` (UUID, PK)
- `organization_id` (UUID, FK → organizations)
- `department_id` (UUID, FK → departments, nullable) — null = org-wide
- `user_id` (UUID, FK → users, nullable) — null = applies to all in scope
- `rule_type` (enum: 'advance_notice', 'consecutive_cap', 'coverage_min', 'blackout', 'balance_override')
- `parameters` (JSONB, not null) — rule-specific config
- `priority` (int, default 0) — higher = more specific, wins in conflict
- `effective_from` (date, not null)
- `effective_until` (date, nullable) — null = no expiration
- `is_active` (boolean, default true)
- `created_by` (UUID, FK → users)
- `created_at`, `updated_at`

**Example `parameters` JSONB for each rule_type:**

```json
// consecutive_cap
{
  "max_consecutive_days": 7,
  "min_gap_between_blocks_days": 14,
  "max_long_blocks_per_year": 2,
  "long_block_threshold_days": 5
}

// advance_notice
{
  "tiers": [
    { "min_days": 1, "max_days": 2, "notice_hours": 48 },
    { "min_days": 3, "max_days": 5, "notice_hours": 240 },
    { "min_days": 6, "max_days": 10, "notice_hours": 720 }
  ]
}

// coverage_min
{
  "minimum_staff": 2,
  "applies_to_leave_types": ["pto", "personal"]
}

// blackout
{
  "start_date": "2026-12-20",
  "end_date": "2026-12-31",
  "severity": "hard_block",
  "reason": "Year-end close"
}
```

**`blackout_periods`** — Convenience table (duplicates blackout-type policy_rules for faster querying).
- `id` (UUID, PK)
- `organization_id` (UUID, FK → organizations)
- `department_id` (UUID, FK → departments, nullable)
- `start_date` (date, not null)
- `end_date` (date, not null)
- `reason` (text)
- `severity` (enum: 'soft_block', 'hard_block')
- `created_by` (UUID, FK → users)
- `created_at`, `updated_at`

**`audit_log`** — Immutable, append-only. Partitioned by month.
- `id` (UUID, PK)
- `organization_id` (UUID, FK → organizations)
- `user_id` (UUID, FK → users)
- `action` (text, not null) — e.g., 'leave_request.submitted', 'leave_request.approved', 'policy.updated', 'user.created'
- `entity_type` (text) — e.g., 'leave_request', 'policy_rule', 'user'
- `entity_id` (UUID)
- `old_values` (JSONB, nullable)
- `new_values` (JSONB, nullable)
- `ip_address` (inet)
- `user_agent` (text)
- `metadata` (JSONB, nullable) — extra context
- `timestamp` (timestamptz, not null, default now())
- Partition by RANGE on `timestamp` (monthly)
- Index on (`organization_id`, `timestamp`)
- Index on (`entity_type`, `entity_id`)
- **No UPDATE or DELETE operations permitted on this table — enforced via RLS policy**

**`notifications`** — In-app notification store.
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `type` (text) — e.g., 'request_submitted', 'request_approved', 'approval_reminder', 'escalation'
- `title` (text, not null)
- `body` (text, not null)
- `link` (text, nullable) — URL to navigate to when clicked
- `is_read` (boolean, default false)
- `read_at` (timestamp, nullable)
- `created_at` (timestamp, not null)
- Index on (`user_id`, `is_read`, `created_at`)

---

## 4. Policy Engine Architecture

### 4.1 Validation Pipeline

When an employee submits a request, it passes through these validators in order. If any validator fails, the request is blocked with a specific, human-readable error message. All validators are implemented as independent, testable service functions.

1. **Balance Validator** — Does the employee have enough days of this leave type remaining? Checks `leave_balances` for the relevant year.
2. **Advance Notice Validator** — Is the request far enough in the future per the applicable advance notice policy? Calculates business hours between now and `start_date`.
3. **Consecutive Day Validator** — Does the request exceed the max consecutive day cap? Checks `total_calendar_days` against the `consecutive_cap` policy.
4. **Gap Validator** — If the employee has another approved or pending block of 5+ days in the same year, is there at least the required gap (default 14 days) between blocks? Also checks the annual long-block count.
5. **Blackout Validator** — Do any requested dates fall within a blackout period? Hard blocks prevent submission; soft blocks show a warning but allow submission with flag.
6. **Coverage Validator** — Will approving this request cause the employee's department to fall below its minimum staffing level on any of the requested dates? Queries all approved/pending requests for the same department and date range.
7. **Overlap Validator** — Does the employee already have an approved or pending request that overlaps these dates?

### 4.2 Policy Resolution (Cascading Specificity)

When a validator needs a policy, it queries `policy_rules` with this precedence:
1. User-specific rule (highest priority) — `user_id` matches
2. Department-specific rule — `department_id` matches, `user_id` is null
3. Organization-wide rule (lowest priority) — both `department_id` and `user_id` are null

Within a tier, rules with higher `priority` value win. Only `is_active = true` and `effective_from <= today` and (`effective_until IS NULL OR effective_until >= today`) rules are considered.

### 4.3 Override Mechanism

- Only users with role `manager`, `admin`, or `super_admin` can invoke an override.
- Override must include a mandatory text reason (minimum 20 characters).
- The override is logged in `audit_log` with the original policy violation details, overrider's identity, and reason.
- The `leave_request` row stores `policy_override_used = true` and `policy_violations` (JSONB array of which validators failed).
- A weekly digest email is sent to super_admin listing all overrides for review.
- Override counts are tracked per manager and surfaced in admin reports.

---

## 5. Feature Specification (Screen by Screen)

### 5.1 Authentication

**Login Page (`/login`)**
- Email and password fields with show/hide password toggle.
- "Forgot password" link triggering email-based reset flow via Resend.
- Session management: JWT tokens with 24-hour expiry, refresh token rotation.
- Rate limiting: 5 failed attempts locks account for 15 minutes, admin notified via email.
- First-time login forces password change from admin-set temporary password.

**Password Requirements**
- Minimum 12 characters, at least one uppercase, one lowercase, one number, one special character.
- Cannot reuse last 5 passwords.
- 90-day password rotation policy (configurable per organization).

### 5.2 Employee Dashboard (`/dashboard`)

The employee landing page. Most common actions within one click.

- **Leave Balance Cards:** Visual cards showing remaining PTO, sick, personal days with circular progress indicators. Color-coded: green (>50%), yellow (25–50%), red (<25%).
- **Quick Request Button:** Prominent "Request Time Off" button opening the request form as a modal or slide-over panel.
- **Upcoming Requests:** Table of submitted/approved requests for next 90 days with status badges (Pending = yellow, Approved = green, Denied = red).
- **Team Calendar Snippet:** Miniature calendar showing who on your team is out this week and next, so employees self-coordinate before requesting.
- **Notifications Bell:** Unread count badge showing approval decisions, policy reminders, balance warnings.

### 5.3 Leave Request Form (`/requests/new`)

The core workflow. Most critical UX in the system.

1. Select leave type from dropdown (PTO, Sick, Personal, etc.).
2. Pick start and end dates using a date range picker with:
   - Blocked dates shown in gray (blackout periods).
   - Weekends auto-excluded from day count unless employee works weekends (per org work schedule).
   - Holidays auto-excluded based on company holiday calendar.
   - Real-time day count updates as dates are selected.
3. System performs instant policy validation (all 7 validators from Section 4.1):
   - Advance notice check — shows inline error if too close.
   - Consecutive day cap — shows error with explanation of split-request policy.
   - Balance check — warns if insufficient balance, blocks submission.
   - Coverage check — warns if team coverage will drop below minimum.
   - Overlap check — warns if dates conflict with existing request.
4. Optional reason/notes field (required for certain leave types configurable in admin).
5. Optional document upload (doctor note, jury summons, etc.). Max 5MB per file, accepted formats: PDF, JPG, PNG.
6. Submit button with confirmation modal showing: days requested, balance after approval, who will review.

### 5.4 Request Detail & History (`/requests/[id]`, `/requests/history`)

- Full detail view of any request: dates, status, approver actions timeline, attached documents.
- Employee can cancel a pending request (not approved ones — those require admin action).
- History page: paginated table of all past requests with filters by status, leave type, date range.

### 5.5 Manager Approval Dashboard (`/approvals`)

Managers see everything employees see plus the approval queue.

- **Pending Queue:** Sorted by urgency (closest start date first). Each card shows: employee name and photo, dates, leave type, day count, team coverage impact percentage, policy compliance status (green check or red warning).
- **One-Click Actions:** Approve (green) and Deny (red) buttons directly on each card. Deny requires a comment modal. Approve optionally accepts a comment.
- **Team Calendar:** Full monthly calendar view showing all approved and pending absences color-coded by employee. View-only, not drag-and-drop.
- **Coverage Heatmap:** Visual grid showing staffing levels per day per department. Red cells indicate below-minimum coverage. Yellow cells indicate at-minimum.
- **Delegation:** Managers can delegate approval authority to a peer when they themselves are on leave. Delegation has a start/end date and is logged.

### 5.6 Admin Configuration Panel (`/admin/*`)

Super admin and admin access only.

- **Policy Editor (`/admin/policies`):** Form-based editor for advance notice rules, consecutive day caps, coverage minimums, and blackout periods. Changes are versioned — old policies remain in audit log with `effective_until` set. Preview mode shows how a policy change would affect pending requests before saving.
- **Employee Management (`/admin/employees`):** Add/edit/deactivate employees, assign departments, set managers (approval chain), adjust individual leave balances with mandatory reason, reset passwords, view per-employee leave history.
- **Department Management (`/admin/departments`):** Create departments, set coverage minimums, assign default policies, view department-level leave utilization.
- **Organization Settings (`/admin/settings`):** Company holidays editor, fiscal year start, default work schedule (Mon–Fri vs custom), timezone, notification defaults.
- **Reports (`/admin/reports`):** Exportable reports:
  - PTO utilization by department (chart + table).
  - Approval turnaround time (average, median, P95).
  - Policy override frequency by manager.
  - Balance liability (financial value of unused PTO across all employees).
  - Absenteeism trends by month and department.
  - All reports exportable to CSV.
- **Audit Log Viewer (`/admin/audit-log`):** Searchable, filterable log of every action in the system. Filter by user, action type, entity type, date range. Export to CSV.

---

## 6. Notification System

| Event | Recipient | Channel | Timing |
|---|---|---|---|
| Request submitted | Approver (direct manager) | Email + in-app | Immediate |
| Request approved | Employee | Email + in-app | Immediate |
| Request denied (with reason) | Employee | Email + in-app | Immediate |
| Approval reminder | Approver | Email | 24 hours after submission if no action |
| Auto-escalation | Next-level approver | Email + in-app | 48 hours after submission if no action |
| Balance warning | Employee | Email | When balance drops below 3 days |
| Blackout approaching | All employees in dept | Email | 2 weeks before blackout start |
| Policy override used | Super admin | Email digest | Weekly summary (every Monday) |
| Password expiring | Employee | Email + in-app | 14 days before 90-day rotation |
| Account locked | Admin | Email | Immediate |

Each user can configure notification preferences (email only, in-app only, both, or muted for non-critical) from their profile settings page.

Email templates should be clean, mobile-friendly HTML with the company name in the header, a clear action button (e.g., "Review Request"), and a text-only fallback.

---

## 7. Security Architecture

### 7.1 Authentication
- Passwords hashed with bcrypt (cost factor 12).
- JWT access tokens (15-minute expiry) + HTTP-only secure refresh tokens (7-day expiry, rotate on use).
- CSRF protection via SameSite=Strict cookie attribute and Origin header validation.
- Session invalidation on password change (all active sessions terminated).
- Optional TOTP-based 2FA (Google Authenticator) — recommended for admin accounts.

### 7.2 Authorization (RBAC)

| Role | Permissions | Scope |
|---|---|---|
| Employee | Submit/edit/cancel own requests, view own balances and history | Own data only |
| Manager | All employee perms + approve/deny team requests, view team calendar, delegate approval | Own team within department |
| Admin | All manager perms + edit policies, manage employees, view reports, override policies | Entire organization |
| Super Admin | All admin perms + manage organizations, view audit logs, system config | All organizations (multi-tenant) |

Authorization is enforced at three layers:
1. **Middleware** — route-level protection based on role.
2. **tRPC procedures** — procedure-level role checks before executing any business logic.
3. **PostgreSQL RLS** — row-level security policies as defense-in-depth ensuring cross-organization data isolation.

### 7.3 Data Protection
- All data encrypted at rest (AES-256 via Supabase/PostgreSQL).
- All traffic encrypted in transit (TLS 1.3).
- Database backups: daily automated with 30-day retention, point-in-time recovery.
- File uploads: max 5MB, validated MIME type server-side, stored in private Supabase Storage bucket with signed URLs (expire in 1 hour).
- Audit log is append-only — no user including super_admin can delete audit entries (enforced via RLS + no DELETE policy).

---

## 8. Scaling Strategy

### Phase 1: Current State (1–50 employees)
- Single Supabase project (free tier).
- Vercel Hobby or Pro plan.
- Email notifications only (Resend free tier: 100 emails/day).
- Single organization.
- Estimated monthly cost: $0–$25.

### Phase 2: Multi-Property Growth (50–500 employees)
- Supabase Pro plan ($25/month) for connection pooling and increased storage.
- Add SMS notifications via Twilio for urgent approval escalations.
- Multi-organization support activated — each acquired property gets its own org with independent policies.
- Role-based dashboards: regional managers see aggregate data across properties.
- Add Redis (Upstash) for caching approval queues and team calendars.
- Estimated monthly cost: $50–$150.

### Phase 3: Enterprise Scale (500–5,000+ employees)
- Migrate to dedicated PostgreSQL (AWS RDS or Supabase Enterprise).
- Add SSO/SAML integration (Okta, Azure AD) for centralized identity.
- Implement read replicas for reporting queries.
- Add background job queue (Inngest or BullMQ) for async: accrual calculations, report generation, notification batching.
- API rate limiting per organization.
- APM monitoring (Datadog or equivalent).
- Estimated monthly cost: $200–$800.

### Database Scaling
- **Partitioning:** `audit_log` partitioned by month. Old partitions archived to cold storage.
- **Indexing:** Composite indexes on (`organization_id`, `department_id`, `status`) for `leave_requests`. Partial index on `status = 'pending'` for approval queue.
- **Connection Pooling:** PgBouncer via Supabase. Transaction-mode for API, session-mode for reports.
- **Row-Level Security:** PostgreSQL RLS policies ensure Organization A users never see Organization B data regardless of app-layer bugs.

---

## 9. Project File Structure

```
leave-management/
├── src/
│   ├── app/                              # Next.js App Router pages
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── reset-password/page.tsx
│   │   │   └── change-password/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── requests/
│   │   │   ├── new/page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── history/page.tsx
│   │   ├── approvals/page.tsx
│   │   ├── team/calendar/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── admin/
│   │   │   ├── policies/page.tsx
│   │   │   ├── employees/page.tsx
│   │   │   ├── employees/[id]/page.tsx
│   │   │   ├── departments/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   └── audit-log/page.tsx
│   │   ├── api/trpc/[trpc]/route.ts
│   │   └── layout.tsx
│   ├── components/                       # Reusable UI components
│   │   ├── ui/                           # shadcn/ui base components
│   │   ├── leave/                        # RequestForm, BalanceCard, DayCounter
│   │   ├── calendar/                     # TeamCalendar, CoverageHeatmap, DateRangePicker
│   │   ├── approval/                     # ApprovalCard, ApprovalQueue, ApprovalActions
│   │   ├── admin/                        # PolicyEditor, EmployeeForm, ReportCharts
│   │   ├── notifications/                # NotificationBell, NotificationCenter
│   │   └── layout/                       # Sidebar, Header, RoleGate
│   ├── server/                           # Backend logic
│   │   ├── db/
│   │   │   ├── schema.ts                 # Drizzle ORM schema (all tables)
│   │   │   ├── index.ts                  # DB connection + drizzle instance
│   │   │   ├── migrations/               # Auto-generated SQL migration files
│   │   │   └── seed.ts                   # Development seed data
│   │   ├── services/
│   │   │   ├── policy-engine.ts          # All 7 validators + policy resolution
│   │   │   ├── leave-service.ts          # Request CRUD + business logic
│   │   │   ├── approval-service.ts       # Approval workflow + auto-escalation
│   │   │   ├── notification-service.ts   # Email (Resend) + in-app notifications
│   │   │   ├── accrual-service.ts        # Balance calculations + carry-over
│   │   │   ├── user-service.ts           # User CRUD, password management
│   │   │   └── audit-service.ts          # Immutable audit log writes
│   │   ├── trpc/
│   │   │   ├── router.ts                 # Root merged router
│   │   │   ├── leave.ts                  # Leave request procedures
│   │   │   ├── approval.ts               # Approval procedures
│   │   │   ├── admin.ts                  # Admin CRUD procedures
│   │   │   ├── user.ts                   # Profile + notification prefs
│   │   │   └── context.ts                # Auth context creation
│   │   ├── auth.ts                       # NextAuth v5 config
│   │   └── cron/
│   │       ├── auto-escalation.ts        # Check pending > 48 hrs, escalate
│   │       ├── accrual-processing.ts     # Monthly accrual calculations
│   │       ├── balance-warnings.ts       # Low balance email notifications
│   │       └── override-digest.ts        # Weekly override summary email
│   ├── lib/
│   │   ├── utils.ts                      # General utilities
│   │   ├── date-utils.ts                 # Business day calc, holiday exclusion
│   │   ├── constants.ts                  # App-wide constants
│   │   ├── types.ts                      # Shared TypeScript types
│   │   └── email-templates/              # React Email templates
│   │       ├── request-submitted.tsx
│   │       ├── request-approved.tsx
│   │       ├── request-denied.tsx
│   │       ├── approval-reminder.tsx
│   │       ├── escalation-notice.tsx
│   │       └── base-layout.tsx
│   └── middleware.ts                     # Auth + route protection + RBAC
├── drizzle.config.ts
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.local                            # Local environment variables
├── .env.example                          # Template with all required vars
└── vitest.config.ts
```

---

## 10. Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:***@db.xxx.supabase.co:5432/postgres

# Auth
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://leave.categoryfiveventures.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Email
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@categoryfiveventures.com

# File Storage
STORAGE_BUCKET=leave-documents

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx

# App
NEXT_PUBLIC_APP_URL=https://leave.categoryfiveventures.com
```

---

## 11. Testing Strategy

### Unit Tests (Vitest)
- All 7 policy validators: boundary dates, exactly-at-limit, one-day-over, multiple overlapping rules, cascading specificity resolution.
- Accrual calculation engine: monthly accrual, carry-over limits, mid-year hires, terminations.
- Date utility functions: business day calculation with holiday exclusion, weekend handling, timezone edge cases.
- Authorization middleware: role-based access for every tRPC procedure.
- Password validation: complexity requirements, reuse prevention.

### Integration Tests
- Full request lifecycle: create → validate → submit → notify → approve → balance update.
- Escalation flow: submit → 48 hours simulated → auto-escalation → second-tier approval.
- Concurrent requests: two employees requesting same dates when only one coverage slot available.
- Policy override flow: submit blocked request → manager override → audit log entry → weekly digest.
- Multi-organization isolation: user in Org A cannot access Org B data even with direct API calls.

### End-to-End Tests (Playwright)
- Login flow, password reset, first-time password change.
- Employee: submit request, view history, cancel pending request.
- Manager: approve request, deny with comment, view team calendar, delegate approval.
- Admin: create policy rule, add employee, generate report, view audit log.
- Mobile viewport: test all core flows on 375px width.

---

## 12. Cron Jobs / Background Tasks

These run on Vercel Cron or an external scheduler (Inngest recommended for production):

| Job | Frequency | Logic |
|---|---|---|
| Auto-escalation | Every hour | Find `leave_requests` WHERE `status = 'pending'` AND `submitted_at < now() - 48 hours` AND no approval action exists for the request's current tier. Create escalation record, notify next-tier approver. |
| Monthly accrual | 1st of each month at midnight | For all active employees with `accrual_method = 'monthly'` leave types, add the monthly increment to `leave_balances.total_entitled`. |
| Annual carry-over | Jan 1 at midnight | Calculate unused balance from previous year, apply carry-over cap, create new year's balance record with `carried_over` field. |
| Balance warning | Daily at 9 AM | Find employees with any leave type balance below 3 days, send email if not already sent this month. |
| Override digest | Every Monday at 8 AM | Query `audit_log` for `action = 'policy.overridden'` in the past 7 days, compile summary, email to all super_admins. |
| Password expiry warning | Daily at 9 AM | Find users where `last_password_change` is older than 76 days (14-day warning before 90-day policy), send email. |
| Request expiry | Daily at midnight | Find `leave_requests` WHERE `status = 'pending'` AND `start_date < today`. Set status to 'expired', notify employee. |

---

## 13. API Design (Key tRPC Procedures)

### Leave Procedures
- `leave.getBalances` — Returns all leave balances for current user and year.
- `leave.submitRequest` — Runs all 7 validators, creates request, sends notifications. Input: `{ leaveTypeId, startDate, endDate, reason?, documentIds? }`. Returns request object or validation errors.
- `leave.cancelRequest` — Employee cancels own pending request. Restores pending balance.
- `leave.getMyRequests` — Paginated list with filters (status, dateRange, leaveType).
- `leave.getRequestDetail` — Full detail including approval timeline and documents.

### Approval Procedures
- `approval.getPendingQueue` — Manager's pending requests sorted by urgency. Includes coverage impact calculation.
- `approval.approve` — Approve request, update balance, notify employee, log to audit.
- `approval.deny` — Deny with mandatory comment, notify employee, log to audit.
- `approval.escalate` — Manually escalate to next tier.
- `approval.override` — Approve despite policy violations, mandatory reason, log violations.
- `approval.delegate` — Set delegation to peer for date range.

### Admin Procedures
- `admin.createUser` — Create employee with temporary password.
- `admin.updateUser` — Edit profile, role, department, manager.
- `admin.adjustBalance` — Manual balance adjustment with mandatory reason.
- `admin.deactivateUser` — Soft-delete, cancel pending requests, revoke sessions.
- `admin.createPolicyRule` — Create new policy with preview of impact.
- `admin.updatePolicyRule` — Version policy (set effective_until on old, create new).
- `admin.getAuditLog` — Paginated, filterable audit log query.
- `admin.generateReport` — Generate report data for specified type and date range.

### Team Procedures
- `team.getCalendar` — Monthly calendar data showing team absences. Scoped by manager's department.
- `team.getCoverageHeatmap` — Daily staffing levels for department over date range.

---

## 14. Success Metrics

| Metric | Target |
|---|---|
| Adoption rate | 100% within 30 days of launch |
| Approval turnaround | < 24 hours average |
| Auto-escalation rate | < 10% of requests |
| Policy override rate | < 5% of requests |
| System uptime | 99.9% |
| Zero coverage breaches | No days where actual staff fell below department minimum |

---

## 15. Future Enhancements (Post-MVP, Architecturally Supported)

- **Entrata Integration:** Sync employee rosters from Entrata to eliminate double data entry.
- **Payroll Export:** CSV/API payloads for payroll processors showing approved leave by pay period.
- **Mobile App:** PWA wrapper with push notifications and offline request drafting.
- **Calendar Sync:** Push approved leave to Google Calendar or Outlook.
- **Slack/Teams Integration:** Submit requests and receive notifications in messaging platforms.
- **HRIS Integration:** Connect to BambooHR, Gusto, or ADP for centralized employee data.
- **AI Scheduling:** Predictive model suggesting optimal leave dates based on historical patterns and coverage.
