# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.1.0] - 2026-03-24

### Fixed

- **Select dropdowns rendered raw sentinel values** (`_all`, `_none`) instead of display text. `SelectItem` now auto-derives the `label` prop from string children so `Select.Value` renders correctly across all dropdowns in the app.
- **Employee name links had 20px touch targets** — well below the 44px WCAG 2.1 SC 2.5.5 minimum. Links now use `inline-flex min-h-[44px] items-center` for correct mobile tap area without visual change.
- **H1/H2 heading hierarchy was inverted across all authenticated pages.** `Header.tsx` used `<h1>` for the nav bar label (18px) while every page content heading used `<h2>` (20px). Changed nav label to `<span>` — identical styling, correct semantics.

### Added

- `TODOS.md` — post-launch backlog organized by priority (P2–P3): StatusBadge shared component extraction, cancel dialog design consistency, header touch targets, and focus-visible ring on employee table links.
- `VERSION` file (gstack 4-digit format).
- `CHANGELOG.md` (this file).
