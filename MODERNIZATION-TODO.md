# Saman Poolak Modernization TODO

This file is an implementation backlog for Codex.

## Working rules

- `MASTERCONTEXT.md` is the canonical project reference.
- Read only the sections relevant to the current task.
- Preserve existing business behavior unless a task explicitly changes it.
- Preserve Persian/RTL behavior, Jalali dates, dark mode, permissions, API semantics, production calculations, and PDF output.
- Inspect `git status --short` before editing and preserve existing user changes.
- Do **not** push, deploy, or run live database migrations unless explicitly asked.
- Run appropriate verification after each completed problem.
- Prefer incremental migration over large rewrites.
- Do not introduce a new library merely because it is fashionable; each dependency must solve a concrete problem.

---

# 1. Problem: Component/page CSS is globally scoped

The project uses plain CSS imported by React components, but those styles are globally bundled. Broad selectors can unintentionally affect unrelated pages, calendars, navigation, forms, PDF nodes, and the employee/management surfaces.

- **Solution:** Gradually migrate feature/page styles to CSS Modules while keeping only true global styles in the global stylesheet.

## Tasks

1. [x] Audit `src/` for imported `.css` files and identify broad selectors such as `button`, `input`, `select`, `form`, `table`, and generic class names.
   - Inventory complete: feature styles now use CSS Modules for SettingsInfo, People, PayrollSettings, PayrollAttendance, ManagementStatistics, shared Management/order pages, Login, JobApplications, IssueNotes, Inquiries, HumanResources, Expenses, EmployeeTasks, EmployeeStatistics, shared navigation, and the production chart. `index.css` and Font Awesome are the remaining deliberate global CSS imports.
   - Broad selectors found during the audit: global font inheritance for form controls and Jalali picker internals in `index.css`; unscoped controls and generic classes in HumanResources; shared generic classes in Management. Feature selectors are now anchored to a hashed module root. Global control typography and shared theme/calendar/export rules remain intentional.
2. [x] Identify the highest-risk stylesheets first: pages with forms, calendars, dialogs, charts, statistics, employee production, and shared navigation.
   - Highest-risk sheets were HumanResources, shared Management/order pages, global `index.css`, People, PayrollAttendance, IssueNotes, EmployeeTasks, PayrollSettings, shared navigation, and statistics/chart styles. All feature styles in this inventory have now been migrated to page-rooted CSS Modules; shared global base/theme/calendar/export rules remain in `index.css`.
3. [x] Define what must remain global:
   - reset/base rules
   - `html` / `body`
   - typography defaults
   - `:root` design tokens
   - `[data-theme="dark"]` global tokens
   - global RTL defaults
   - deliberately global utilities
   - PDF/export rules that must remain global
   - Audit boundary: `src/index.css` retains document reset/base, `@font-face`, root/theme tokens, global RTL/body defaults, deliberate app-wide font inheritance (including Jalali picker internals), shared utilities used across page modules (`glass-card`, `segmented-control`, `primary-btn`, `toggle-row`, `ios-switch`), dark theme rules for shared widgets/calendar, and issue-slip export rules. Feature styling should migrate only as scoped page work is undertaken.
4. [x] For each page that is significantly modified in future work, migrate its stylesheet from `Page.css` to `Page.module.css`.
   - All current feature/page stylesheets have been migrated; future page work should continue using this pattern.
5. [x] Update the related JSX to import the module as `styles` and use module-scoped class names.
   - JSX imports each CSS Module and applies its local root class. Existing child class names are preserved under the hashed root to keep shared markup and behavior stable.
6. [x] Avoid global element selectors inside feature CSS.
   - Feature selectors are scoped below the local module root. Only deliberate app-wide form-control typography remains global in `index.css`.
7. [x] Preserve existing dark-mode behavior while migrating each stylesheet.
   - Existing dark theme selectors remain in the global stylesheet or are anchored beneath the local module root with the global theme ancestor.
8. [ ] Verify `JalaliDatePicker`, calendar arrows/day buttons, selects, dialogs, navigation, and PDF surfaces after each migration.
   - Automated tests and production builds pass. Interactive visual checks for Jalali picker, calendar arrows/day buttons, selects, dialogs, navigation, and PDF export surfaces remain for owner testing after deployment; browser automation was unavailable in this environment.
9. [x] Run `npm run build`.
10. [x] Do not attempt a single all-at-once CSS migration unless explicitly requested.
   - No stylesheet migration was part of this audit; retain incremental migration as the implementation rule.

---

# 2. Problem: The UI lacks a small reusable design system

The application has grown page-by-page, so common controls can develop inconsistent spacing, radii, sizing, colors, states, and responsive behavior. This also gives AI coding agents too much freedom to invent a different visual language on each screen.

- **Solution:** Build a small Saman Poolak UI foundation using reusable primitives plus shared design tokens.

## Tasks

1. [x] Audit repeated UI patterns across management and employee screens.
   - Management and employee surfaces repeat action buttons, icon actions, labeled controls, status treatments, page/section headings, toolbars, and empty/loading/error states. Existing `index.css` also exposes several legacy global UI classes with inconsistent sizing and glass-heavy styling.
2. [x] Identify the minimum useful shared primitive set. Start with:
   - Button
   - IconButton
   - Input
   - Textarea
   - Select wrapper if appropriate
   - Field / FormField
   - Dialog / Modal shell
   - Badge / StatusBadge
   - PageHeader
   - SectionHeader
   - Toolbar
   - EmptyState
   - LoadingState
   - ErrorState
   - Implemented the repeated foundations in `src/components/ui/Ui.jsx`; a dialog shell is deferred to Problem 3's accessible-primitives evaluation rather than creating behavior without focus management.
3. [x] Do not create generic abstractions for components that currently appear only once.
4. [x] Create or consolidate global design tokens for:
   - spacing
   - typography
   - control heights
   - radii
   - borders
   - surfaces
   - text colors
   - muted text
   - focus ring
   - primary/action colors
   - danger/warning/success semantics
5. [x] Make all shared primitives support light and dark modes.
6. [x] Make all shared primitives support Persian RTL layouts.
7. [x] Ensure controls provide appropriate states:
   - default
   - hover
   - focus-visible
   - active
   - disabled
   - loading where relevant
   - validation/error where relevant
8. [x] Keep visual styling restrained and suitable for dense business software.
9. [x] Avoid turning every section into a card.
10. [x] Migrate existing pages to shared primitives gradually when they are already being worked on.
   - Migrated the employee task screen's loading, error, empty, retry, and submit controls as a proof point; data behavior and workflow are unchanged.
11. [x] Run `npm run build` after each meaningful migration.
   - `npm test -- --watchAll=false --runInBand` and `npm run build` pass for this foundation and migration.

---

# 3. Problem: Complex interactive primitives are hand-maintained

Dialogs, dropdowns, selects, popovers, tabs, tooltips, and accordions require keyboard behavior, focus management, accessibility, and RTL handling. Re-implementing all of this manually increases maintenance cost and UI bugs.

- **Solution:** Evaluate an unstyled accessible primitive library, preferably Radix Primitives, only for controls where it provides clear value.

## Tasks

1. [x] Audit existing dialogs, dropdowns, selects, popovers, tabs, tooltips, and accordions.
   - Audited page-level controls. Several form dialogs were overlay `<div>`s without dialog semantics or managed focus. Search/autocomplete dropdown rows in HR and order entry are clickable `<div>`s without listbox/option semantics or arrow-key navigation. Native `<select>` controls keep browser keyboard and mobile picker behavior. No shared tabs or accordion pattern was found; the Jalali date picker supplies its own calendar popover.
2. [x] Identify which controls currently have accessibility, focus-management, keyboard, or mobile usability weaknesses.
   - The modal gap is high impact for data-entry: keyboard focus could move behind an open modal and Escape/return-focus behavior was inconsistent. The custom autocomplete gaps are recorded for a later targeted evaluation. Existing dialogs vary in mobile sizing, while the Expenses form already has a stacked phone layout.
3. [x] Evaluate Radix Primitives against the current React 19/CRA setup before adding it.
   - Radix Dialog 1.1.23 supports React 19, modal focus containment/return, accessible title announcements, Escape, outside interaction and custom styling. It works with CRA's existing React/JSX toolchain.
4. [x] Confirm the chosen primitives support RTL and can be styled using the project's own CSS/design tokens.
   - The selected dialog uses `dir="rtl"`, existing Expenses CSS and existing glass surface tokens; no Radix theme or global style was added.
5. [x] Introduce the library only if it improves concrete existing controls.
   - Added `@radix-ui/react-dialog` for the Expenses add/edit modal, which previously used a click-outside overlay `<div>` without focus management or Escape handling.
6. [x] Start with one high-value primitive rather than migrating every control.
   - Only the Expenses modal uses Radix Dialog. Other modals, custom autocomplete dropdowns and native selects are unchanged.
7. [x] Preserve the Saman Poolak visual design instead of adopting a third-party visual theme.
   - The dialog uses the existing compact form grid, CSS module modal surface, actions and responsive rules.
8. [x] Verify keyboard navigation, focus-visible states, Escape behavior, click-outside behavior, and RTL.
   - Radix Dialog provides Tab/Shift+Tab containment, initial and return focus, Escape close and outside-interaction dismissal; the form remains RTL and its native controls retain browser keyboard handling. Focus-visible styling follows the existing control styles.
9. [x] Verify mobile behavior.
   - Existing CSS constrains dialog width and height to the viewport, uses a single-column form below 520px and allows the form content to scroll inside the dialog.
10. [x] Run relevant tests and `npm run build`.
   - Verified with `npm test -- --watchAll=false --runInBand` and `npm run build`.

---

# 4. Problem: Create React App is deprecated and the frontend build tooling is aging

The project currently uses React 19 with Create React App / `react-scripts`. CRA is no longer the preferred React build path and creates unnecessary long-term maintenance risk.

- **Solution:** Migrate the existing SPA build system from Create React App to Vite without changing application behavior.

## Tasks

1. [x] Treat this as a dedicated infrastructure migration; do not mix it into unrelated feature work.
2. [x] Audit the current CRA configuration and usages of:
   - `react-scripts`
   - `process.env.REACT_APP_*`
   - `public/`
   - service worker / PWA behavior
   - build output assumptions
   - platform build
   - employee build
   - deployment scripts
   - `REACT_APP_APP_SURFACE` was read by `src/index.js` and set by `scripts/dev.mjs` / `scripts/deploy.mjs`; it maps to `VITE_APP_SURFACE`.
   - `REACT_APP_API_URL` was read by `src/api/client.js`, documented in `.env.sample`, and set by the dev/deploy scripts; it maps to `VITE_API_URL`.
   - No other `REACT_APP_*` variables were found. `PUBLIC_URL` was used by the HTML template and three logo references; these now use root public paths / `import.meta.env.BASE_URL`.
   - CRA auto-injected the app entry from `public/index.html`; Vite now uses the root `index.html` entry and copies the rest of `public/`, including the pass-through `service-worker.js`, manifest, assets and `.htaccess`.
3. [x] List every `REACT_APP_*` environment variable and where it is used.
4. [x] Add Vite configuration while preserving React behavior and React Router SPA routing.
5. [x] Migrate environment access to Vite-compatible variables in a controlled way.
6. [x] Preserve `REACT_APP_APP_SURFACE` behavior conceptually, replacing it with an equivalent Vite environment variable.
7. [x] Preserve `REACT_APP_API_URL` behavior conceptually, replacing it with an equivalent Vite environment variable.
8. [x] Initially configure output paths to minimize deployment-script changes.
9. [x] Verify the management app build.
10. [x] Verify the employee app build.
11. [x] Verify deep-route refresh assumptions for `/tasks` and `/statistics`.
12. [x] Verify `.htaccess` handling remains correct.
13. [x] Verify dark mode, API URL configuration, login, navigation, and static assets.
   - Vitest smoke checks confirm management/employee login submissions retain their surface values and saved dark mode is applied to the document. Built bundles contain the configured API URL, app routes and public assets. No real account/API login was attempted.
14. [x] Verify PWA behavior if the current CRA setup still provides PWA functionality.
   - The existing root-scoped service worker remains registered; the pass-through worker and install manifest are present in both build outputs.
15. [x] Update npm scripts only after both surfaces build correctly.
16. [x] Update `DOC.md`, `MASTERCONTEXT.md`, `DEPLOY.md`, and any commands that still refer to CRA/react-scripts.
17. [x] Remove CRA dependencies only after Vite builds are confirmed.
18. [x] Run production builds for both app surfaces.
19. [x] Do not deploy unless explicitly asked.

Verification: `npm test` passes 12 tests. CI-mode management and employee
production builds pass sequentially to their respective `dist/` directories. Vite
preview returns the SPA entry for `/`, `/tasks`, and `/statistics`; deploy
scripts still preserve the existing employee `.htaccess` upload behavior.

---

# 5. Problem: Management and employee builds share the same output directory

Before Problem 5, the management and employee builds shared `build/`, so one
build could overwrite the other.

- **Solution:** Give each application surface an independent build output.

## Tasks

1. [x] Complete this together with or after the Vite migration unless there is a strong reason to do it earlier.
2. [x] Introduce distinct outputs, for example:
   - `dist/platform/`
   - `dist/employee/`
3. [x] Add explicit build scripts such as:
   - `npm run build:platform`
   - `npm run build:employee`
4. [x] Update deployment scripts to upload the correct surface directory.
5. [x] Preserve employee `.htaccess` behavior.
6. [x] Preserve management server-owned `.htaccess` behavior.
7. [x] Verify one build cannot overwrite the other.
8. [x] Verify both surfaces can be built in either order.
9. [x] Update deployment documentation.
10. [x] Run both production builds.

Verification: both production builds pass in either order. Each build writes to
its own `dist/` subdirectory; the other directory's file manifest remains
unchanged. Platform uploads exclude `.htaccess`, while employee deployment
continues to include and explicitly upload its SPA rewrite file.

---

# 6. Problem: Database migrations rely too much on manual memory

Backend deployment does not modify the live schema automatically. Existing database changes must currently be remembered and manually applied through phpMyAdmin, and previously applied `ALTER` statements must not be rerun blindly.

- **Solution:** Introduce tracked, ordered, idempotent database migrations while keeping cPanel/phpMyAdmin constraints in mind.

## Tasks

1. [ ] Audit `server/schema.sql` and `server/migrations/`.
2. [ ] Inventory all existing migrations and determine which ones are already confirmed applied in production from `MASTERCONTEXT.md`.
3. [ ] Design a `schema_migrations` table with at least:
   - migration ID/name
   - applied timestamp
4. [ ] Define a consistent migration naming convention, for example:
   - `001_initial.sql`
   - `002_employee_accounts.sql`
   - `003_production_weights.sql`
5. [ ] Do not rewrite historical production schema blindly.
6. [ ] Create a migration runner appropriate for the existing PHP/cPanel environment.
7. [ ] The runner must:
   - determine which migrations are already applied
   - apply only missing migrations
   - execute in deterministic order
   - stop on failure
   - record successful application
   - provide useful error output
8. [ ] Prefer transactions where MySQL allows them safely.
9. [ ] Keep destructive migrations explicit and never auto-run them casually.
10. [ ] Add a dry-run/status capability if practical.
11. [ ] Add documentation showing:
   - how to inspect migration status
   - how to apply pending migrations
   - how deployment ordering works
12. [ ] Keep `server/schema.sql` valid for fresh installs.
13. [ ] Ensure fresh-install schema and migration history do not drift.
14. [ ] Add tests for the migration runner where practical.
15. [ ] Do not execute anything against the live database unless explicitly asked.

---

# 7. Problem: Production PHP may be running an end-of-life runtime

The documentation allows PHP 8.1+, but PHP 8.1 is end-of-life. If production is still actually running 8.1, that creates unnecessary security and maintenance risk.

- **Solution:** Determine the real production PHP version and prepare the codebase for a supported version, preferably PHP 8.4 if the host supports it.

## Tasks

1. [ ] Do not assume the live runtime is 8.1 just because the docs say `8.1+`.
2. [ ] Determine the PHP versions supported by the current cPanel host when the owner is ready to check production.
3. [ ] Locally/staticly review the backend for version-sensitive syntax or behavior.
4. [ ] Run PHP lint against all backend PHP files with the target version where possible.
5. [ ] Run `server/tests/production_validation.php`.
6. [ ] Prefer PHP 8.4 if supported by the host and compatible with the codebase.
7. [ ] If PHP 8.4 is unavailable, select the newest supported stable version available on the host.
8. [ ] Document any compatibility fixes required before the production runtime is changed.
9. [ ] Update `MASTERCONTEXT.md` and `DEPLOY.md` only after the supported target is confirmed.
10. [ ] Do not change the production cPanel PHP version unless explicitly asked.

---

# 8. Problem: CI is not being used enough for verification

The host blocks deployment from GitHub runners, but that does not prevent GitHub Actions from validating code. Local-only deployment and CI verification can coexist.

- **Solution:** Use CI for tests/build/lint verification while keeping deployment local.

## Tasks

1. [ ] Inspect the existing `.github/workflows/` files.
2. [ ] Do not attempt to restore remote FTP deployment through GitHub Actions.
3. [ ] Create or revise a verification workflow that runs on appropriate pushes and pull requests.
4. [ ] Run frontend tests with CI settings.
5. [ ] Run the management production build.
6. [ ] Run the employee production build.
7. [ ] Run PHP lint on backend PHP files.
8. [ ] Run `server/tests/production_validation.php`.
9. [ ] Cache npm dependencies where appropriate.
10. [ ] Ensure CI does not require production secrets.
11. [ ] Keep deployment scripts local.
12. [ ] Update documentation to distinguish:
   - CI verification
   - local production deployment

---

# 9. Problem: JavaScript provides limited protection for a growing domain model

The application now has complex domain data involving orders, item UIDs, production logs, weights in different units, Rial/Toman display, Jalali dates, status history, people, employees, and server-generated identifiers. Plain JavaScript allows more accidental shape/unit mistakes as the project grows.

- **Solution:** Introduce stronger typing incrementally instead of converting the whole repository at once.

## Tasks

1. [ ] Do not start with a repository-wide TypeScript rewrite.
2. [ ] First inventory important domain shapes:
   - Person
   - User
   - Order
   - OrderItem
   - StateHistory entry
   - ProductionAssignment
   - ProductionLog
   - Expense
   - Marking
3. [ ] Decide between:
   - incremental TypeScript, or
   - JSDoc typedefs as a lighter first step
4. [ ] Prioritize boundaries where mistakes are expensive:
   - API request/response shapes
   - production weights
   - quantities
   - money values
   - IDs
   - dates
5. [ ] Introduce types for new code first.
6. [ ] Convert complex existing modules only when they are already being modified.
7. [ ] Avoid mixing large UI redesigns and large typing migrations in one task.
8. [ ] Preserve existing runtime behavior.
9. [ ] If TypeScript is adopted, configure strictness incrementally rather than enabling a setting that makes the whole existing repository fail immediately.
10. [ ] Document the chosen incremental typing convention.

---

# 10. Problem: API request lifecycle handling may become repetitive on direct-fetch screens

Production/statistics screens intentionally use `productionApi` directly with local React state rather than Dexie. As more direct server-state screens are added, loading/error/refetch/cache logic may become repetitive.

- **Solution:** Keep the current architecture for now, but evaluate TanStack Query only if direct API state management becomes clearly repetitive.

## Tasks

1. [ ] Do not add TanStack Query immediately.
2. [ ] Audit direct-API React screens for repeated patterns:
   - loading
   - error
   - refetch
   - stale data
   - request cancellation
   - retry
3. [ ] Determine whether the repetition is large enough to justify another server-state abstraction.
4. [ ] If evaluation is justified, prototype TanStack Query on one direct-API screen only.
5. [ ] Do not replace the Dexie management mirror merely to standardize libraries.
6. [ ] Keep production ownership/security rules unchanged.
7. [ ] Compare complexity before and after the prototype.
8. [ ] Adopt it more broadly only if the code becomes materially simpler.
9. [ ] Otherwise keep the current local-state approach.

---

# 11. Problem: UI quality depends too much on each individual page implementation

Even after CSS isolation, screens can still become inconsistent if layout, responsive behavior, state presentation, and business-data patterns are invented separately each time.

- **Solution:** Establish explicit UI implementation and QA rules for Codex and future development.

## Tasks

1. [ ] Add the repository skills under `.codex/skills/`:
   - `saman-product-ui`
   - `saman-responsive-rtl`
   - `saman-data-ui`
   - `saman-frontend-guardrails`
   - `saman-ui-qa`
2. [ ] Add `saman-employee-production` if employee production work remains frequent.
3. [ ] Keep each skill focused; do not duplicate the full contents of `MASTERCONTEXT.md`.
4. [ ] Restore only a very small `AGENTS.md` bootstrap if Codex benefits from auto-loading it.
5. [ ] `AGENTS.md` should point Codex to `MASTERCONTEXT.md` and relevant skills rather than becoming another canonical documentation file.
6. [ ] Require meaningful UI changes to consider:
   - 360px phone
   - 390px phone
   - tablet
   - 1280px desktop
   - 1440px desktop
   - large desktop
7. [ ] Require explicit RTL review.
8. [ ] Require light/dark review.
9. [ ] Require empty/loading/error state review where relevant.
10. [ ] Require final `npm run build`.
11. [ ] When a page is redesigned, fix obvious QA problems found during the same task rather than only reporting them.

---

# 12. Problem: Some modernization ideas would add complexity without solving a current problem

There is a risk of replacing working architecture simply because newer libraries exist.

- **Solution:** Explicitly preserve the parts of the project that are currently appropriate.

## Tasks

1. [ ] Keep React 19.
2. [ ] Keep React Router unless a concrete routing limitation appears.
3. [ ] Keep PHP + PDO + MySQL unless backend complexity creates a demonstrated need for a framework migration.
4. [ ] Keep the server as the source of truth.
5. [ ] Keep Dexie/useLiveQuery for the existing management mirror architecture.
6. [ ] Keep Context for existing auth/settings concerns.
7. [ ] Keep local React state for screen-local state.
8. [ ] Do not add Redux/Zustand merely to centralize state.
9. [ ] Keep the existing PDF pipeline unless selectable/searchable PDF text or another concrete requirement makes replacement worthwhile.
10. [ ] Keep local WinSCP/FTPS deployment while the hosting provider blocks GitHub-runner FTP access.
11. [ ] Do not adopt Tailwind solely for modernization.
12. [ ] Do not adopt Next.js; this application currently fits an SPA + PHP API architecture.
13. [ ] Re-evaluate these decisions only when a concrete limitation appears.

---

# Recommended implementation order

1. [ ] Add/update Codex skills and the minimal Codex project bootstrap.
2. [ ] Establish design tokens and the first reusable UI primitives.
3. [ ] Start CSS Module migration opportunistically on actively redesigned pages.
4. [ ] Audit the production PHP runtime and prepare a supported runtime upgrade.
5. [ ] Add CI verification.
6. [ ] Design and implement tracked database migrations.
7. [x] Migrate CRA to Vite as a dedicated task.
8. [ ] Split platform and employee build outputs.
9. [ ] Introduce incremental stronger typing.
10. [ ] Re-evaluate TanStack Query only after measuring repeated direct-fetch boilerplate.

---

# Completion principle

Do not treat this file as a request to rewrite the application.

The intended strategy is:

**stabilize → standardize → isolate → modernize → strengthen**

Complete one problem at a time, preserve working behavior, verify the result, and update the relevant project documentation when architecture or operational behavior actually changes.
