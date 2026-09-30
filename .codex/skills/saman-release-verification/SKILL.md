---
name: saman-release-verification
description: Verify Saman Poolak changes before release using frontend builds, tests, PHP validation, management/employee surface checks, deployment constraints, and regression checks. Use after infrastructure, backend, database, or significant frontend changes.
---

# Release Verification

Verification must match the scope of the change.

Do not deploy unless explicitly requested.

## Git safety

Before substantial work:

git status --short

Preserve existing user changes.

Do not push unless explicitly requested.

## Frontend

For meaningful frontend changes:

- run relevant tests
- run production build
- verify management surface when affected
- verify employee surface when affected

Lint warnings that fail the production build must be fixed.

## Backend

For PHP changes:

- lint changed PHP files
- run server/tests/production_validation.php when relevant

## Employee app

When employee functionality changes, verify:

- /tasks
- /statistics
- authorization boundaries
- RTL
- mobile behavior
- deep-route refresh assumptions

## Database

When schema changes are involved:

- verify migration state
- verify migration ordering
- verify API compatibility

Do not run live migrations automatically.

## Deployment

Production deployment is local.

Do not attempt GitHub-hosted FTP deployment.

CI may perform verification even though deployment remains local.

## Final check

Report:

- checks performed
- checks passed
- checks not performed
- any remaining risk

Never claim a test was performed when it was not.