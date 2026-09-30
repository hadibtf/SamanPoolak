---
name: saman-frontend-guardrails
description: Safely implement React frontend changes in the existing Saman Poolak architecture. Use when creating or modifying React components, CSS, state, API interactions, settings, navigation, forms, production screens, or shared frontend behavior.
---

# Saman Poolak Frontend Guardrails

Preserve the existing architecture unless the task explicitly requires architectural change.

Do not introduce a new frontend stack just to implement a UI improvement.

## Stack

The project uses:

- React 19
- Create React App
- JavaScript/JSX
- React Router
- plain CSS
- existing Context providers
- Dexie/useLiveQuery for mirrored management resources

Do not convert unrelated files to TypeScript.

Do not introduce Tailwind, CSS-in-JS, Redux, Zustand, a component framework, or another state system unless explicitly requested.

## Read before changing

Inspect:

- the target component
- its CSS
- nearby reusable components
- existing design tokens
- relevant shared utilities

Read MASTERCONTEXT.md sections relevant to the task.

Do not read every project document for every tiny change.

## CSS

CSS imported by components is bundled globally.

Therefore scope component-specific styles carefully.

Avoid generic selectors such as:

button {}
input {}
select {}
form {}

inside feature stylesheets when they could affect unrelated screens.

Prefer a feature/component namespace.

Example:

.production-statistics__toolbar
.production-statistics__filter
.production-statistics__chart

Do not solve one page by breaking shared UI.

## Existing tokens

Reuse existing theme variables where suitable.

Keep light/dark behavior consistent.

Do not hard-code separate arbitrary colors throughout individual components if an existing token serves the same semantic purpose.

## Dark mode

Any new component must support existing light/dark behavior when it appears in both themes.

Keep PDF/export DOM rules separate from normal application styling.

Do not accidentally apply dark-mode styles to invoice/salary PDF surfaces.

## Data architecture

For ordinary mirrored management resources:

- API is authoritative
- writes go to the API
- returned canonical data updates Dexie
- UI normally reads the mirror

Do not invent a second caching approach.

Production/statistics screens are an exception.

They use productionApi directly and local React state.

Do not move employee production logs into the general management mirror without an explicit architectural task.

## State

Prefer local state when the state belongs to one screen/component.

Use existing contexts for existing global concerns.

Avoid unnecessary derived state.

Do not duplicate server-derived canonical data unnecessarily.

## Components

Extract shared components when:

- markup or behavior genuinely repeats
- the abstraction has a clear responsibility

Do not create premature generic components with dozens of props.

## Dependencies

Before adding a dependency:

1. check whether the project already solves the problem
2. determine whether native browser/React/CSS is sufficient
3. add the dependency only when it materially improves the implementation

Avoid dependencies for trivial visual effects.

## Behavior preservation

A visual redesign must not silently change:

- API semantics
- permissions
- filtering semantics
- units
- date storage
- workflow behavior
- server-assigned identifiers
- production ownership rules

unless explicitly requested.

## Quality

Keep code understandable for a developer familiar with Kotlin/Compose concepts but still working within idiomatic React.

Favor readable implementation over clever implementation.