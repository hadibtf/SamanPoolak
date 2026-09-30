```md
---
name: saman-employee-production
description: Implement, modify, redesign, or review Saman Poolak employee production features including task assignments, production logging, measured weights, employee statistics, admin production statistics, daily drill-downs, log editing/deletion, progress calculations, and production charts.
---

# Saman Poolak Employee Production

This skill applies specifically to employee production functionality.

Before making behavioral changes, read:

MASTERCONTEXT.md#employee-production

Do not duplicate or reinterpret those rules here.

The canonical project documentation remains the source of truth.

## Scope

Use this skill for work involving:

- employee production tasks
- production assignments
- `/tasks`
- `/statistics`
- admin production statistics
- employee statistics
- production logs
- production progress
- measured weight of 10 pieces
- batch weight entry
- calculated piece quantities
- remaining production
- production log editing
- production log deletion
- clearing production logs
- daily production drill-down
- production charts
- employee ownership and permissions

For visual work, also use:

- `saman-product-ui`
- `saman-responsive-rtl`
- `saman-data-ui`
- `saman-ui-qa`

For React implementation safety, also use:

- `saman-frontend-guardrails`

## Architecture

Production and statistics are intentionally different from ordinary mirrored management resources.

They use:

- `productionApi`
- direct server requests
- local React state

Do not move production logs into the general Dexie management mirror unless an explicit architectural task requires it.

The server remains authoritative.

Do not introduce another production-data cache without a concrete requirement.

## Employee separation

Employee functionality must remain isolated from management functionality.

Employee-facing UI must never expose:

- management URLs
- management-only navigation
- admin-only controls
- unrelated management data

Frontend restrictions do not replace backend authorization.

Preserve server ownership and role checks.

## Assignments

Assignments reference an existing order item.

Do not duplicate order financial/customer data into production assignments unnecessarily.

Preserve:

- order ID relationship
- item UID relationship
- employee ownership
- assigned quantity
- produced quantity
- remaining quantity

Do not allow assignment changes to silently violate already-produced quantities or available order capacity.

Any transfer/reallocation behavior must follow the canonical rules in `MASTERCONTEXT.md`.

## Production measurement

The established workflow is:

1. save the measured weight of 10 pieces in grams
2. enter production batch weight in kilograms
3. server calculates estimated produced pieces

Do not change units silently.

Keep terminology and units visually clear.

Important concepts include:

- weight of 10 pieces → grams
- production batch weight → kilograms
- unit weight → derived from 10-piece weight
- estimated produced pieces
- estimated remaining weight

Do not introduce conflicting client-side calculations when the server already defines canonical results.

## Production logs

Production logs must respect ownership.

Employees may operate only on production data permitted by the documented rules.

Do not allow one employee to:

- edit another employee's log
- delete another employee's log
- clear another employee's production history

Preserve soft-delete behavior where documented.

Do not convert soft-deletion into destructive hard deletion without explicit instruction.

## Duplicate submission safety

Preserve submission UUID/idempotency behavior.

Do not remove duplicate-retry protection.

A retry of the same submission should continue to behave according to the server contract.

Do not generate accidental duplicate production logs from UI retry behavior.

## Dates

Production dates use the existing Jalali date rules.

Supported production years remain governed by project documentation.

Use the existing Jalali picker and date utilities.

Do not:

- replace Jalali storage values with Gregorian storage
- pass compact storage strings directly where a Jalali DateObject is expected
- invent another date format

## Statistics

Employee statistics must expose only data the employee is authorized to see.

Management statistics may support wider scopes according to existing permissions.

Preserve existing aggregation semantics.

Do not calculate statistics from soft-deleted logs.

## Charts

When modifying production charts, preserve documented behavior including:

- all valid days represented
- zero-production days represented
- daily drill-down
- readable quantity values
- scrolling behavior
- visible contextual labels
- existing production aggregation rules

Do not alter chart math merely to improve appearance.

Visual improvements must not change the represented data.

When horizontal scrolling is required on mobile:

- preserve axis/context visibility where practical
- maintain readable labels
- avoid compressing bars until they become meaningless
- prevent page-level horizontal overflow

## Daily drill-down

A user opening a chart day should clearly understand:

- which date was selected
- total production for the date
- contributing logs/items when available
- relevant quantities

Keep context visible when opening and closing detail.

## Mobile employee workflow

Employee production screens are especially important on phones.

Prioritize:

1. current assigned work
2. progress
3. remaining production
4. production entry
5. recent/history information

Do not reproduce a wide desktop management table on a phone.

Prefer:

- stacked information
- clear sections
- large enough touch controls
- concise metadata
- progressive disclosure
- single-open accordion behavior where already established

Avoid excessive vertical chrome that forces the worker to scroll past decoration before reaching the task.

## RTL and Persian

Employee UI is Persian-first and RTL.

Check:

- Persian text flow
- numeric readability
- units
- mixed Persian/numeric labels
- Jalali dates
- button ordering
- accordion direction
- chart labels

Use local LTR only where numeric/technical content benefits from it.

## Loading and errors

Production entry must communicate request state clearly.

Prevent accidental duplicate submission while a save is already in progress.

For network failure:

- do not fake successful production
- keep entered information where practical
- clearly communicate failure
- allow safe retry

Writes require network connectivity unless project architecture explicitly changes.

## Editing and deletion

When production logs are editable:

- prefill the actual persisted values
- make changed units clear
- revalidate against server rules
- update the UI from canonical server results

For destructive or clearing actions:

- make the affected scope clear
- distinguish deleting one log from clearing selected production history
- require appropriate confirmation

## Visual priorities

Production interfaces should feel operational rather than decorative.

Prioritize:

- employee name/task identity
- product/item identity
- assigned quantity
- produced quantity
- remaining quantity
- measured weight
- batch-entry controls
- status/progress

Avoid:

- excessive cards
- large decorative headings
- redundant labels
- excessive icons
- hiding important production numbers behind extra interactions

## Verification

After meaningful production changes, verify applicable behavior:

- employee `/tasks`
- employee `/statistics`
- management production statistics
- assignment behavior
- ownership boundaries
- production entry
- edit/delete behavior
- date selection
- daily drill-down
- charts
- mobile layout
- desktop layout
- RTL
- light mode
- dark mode

Run relevant tests.

Run:

npm run build

If both application surfaces are affected, verify both builds.

For PHP changes:

- lint changed PHP files
- run `server/tests/production_validation.php` when relevant

Do not deploy unless explicitly asked.

## Definition of done

A production feature is not complete merely because the UI renders.

Before finishing, confirm:

- business rules remain intact
- ownership remains intact
- quantities remain correct
- units remain correct
- dates remain correct
- server remains authoritative
- mobile use is practical
- RTL is correct
- charts represent the same data as before
- relevant build/tests pass
```
