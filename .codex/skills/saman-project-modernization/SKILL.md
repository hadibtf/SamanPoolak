---
name: saman-project-modernization
description: Safely modernize Saman Poolak project tooling and architecture, including CRA to Vite migration, build configuration, environment variables, dependencies, JavaScript typing improvements, and frontend infrastructure. Use for infrastructure modernization rather than ordinary feature work.
---

# Project Modernization

Modernize incrementally.

Before changing infrastructure:

1. Read the relevant sections of MASTERCONTEXT.md.
2. Inspect package.json and existing scripts.
3. Inspect deployment assumptions.
4. Preserve existing behavior.
5. Avoid combining unrelated migrations.

## Principles

Do not rewrite working architecture merely because a newer library exists.

Prefer:

- incremental changes
- reversible changes
- minimal dependency additions
- compatibility with existing deployment
- preserving management and employee surfaces

Do not introduce:

- Next.js
- Redux
- Zustand
- Tailwind
- a backend framework

unless explicitly requested or justified by a concrete problem.

## Build changes

When modifying the build system, preserve:

- management surface
- employee surface
- API URL configuration
- SPA routing
- .htaccess behavior
- static assets
- dark mode
- environment-specific configuration

Never assume the application works because one build succeeds.

Verify both surfaces.

## Dependency changes

Before adding a dependency:

1. establish the problem it solves
2. check whether the existing stack already solves it
3. check React compatibility
4. consider bundle and maintenance cost

Remove obsolete dependencies only after their replacement is verified.

## Incremental typing

Do not perform a repository-wide TypeScript conversion.

Prioritize:

- API boundaries
- domain models
- production units
- money
- dates
- IDs

Preserve runtime behavior.