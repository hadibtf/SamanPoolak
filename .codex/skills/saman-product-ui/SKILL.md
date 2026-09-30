---
name: saman-product-ui
description: Design or redesign polished production-quality UI for the Saman Poolak React applications. Use whenever creating, restyling, reviewing, or improving pages, layouts, navigation, forms, cards, dialogs, dashboards, employee screens, settings, login, orders, HR, expenses, or other visual interfaces.
---

# Saman Poolak Product UI

Design this application as serious Persian business software used daily in a factory.

The goal is not flashy UI.
The goal is polished, deliberate, compact, clear, modern business software.

## Before editing

Inspect the existing page, nearby components, and relevant CSS.

For project/domain behavior, consult MASTERCONTEXT.md only when relevant to the task.
Do not duplicate domain rules here.

Preserve existing behavior unless the task explicitly changes it.

## Visual direction

Prefer:

- strong visual hierarchy
- clean alignment
- consistent spacing
- restrained surfaces
- compact business-oriented layouts
- clear section grouping
- readable Persian typography
- intentional information density
- obvious primary actions
- subtle borders
- restrained shadows
- useful whitespace rather than excessive whitespace

Avoid generic AI-dashboard aesthetics.

Specifically avoid:

- putting every section inside a floating card
- excessive border radius
- excessive shadows
- glassmorphism
- decorative gradients without a functional reason
- huge page titles
- oversized empty areas
- giant buttons
- random accent colors
- excessive badges
- excessive icon usage
- centered layouts for data-heavy screens
- duplicated headings that communicate the same thing

## Hierarchy

Every page should make these visually obvious:

1. What screen am I on?
2. What information matters most?
3. What can I do here?
4. What is secondary?
5. What requires attention?

Primary actions must look primary.

Secondary actions must not compete visually with the main action.

Destructive actions must be visually distinct but should not dominate the page.

## Spacing

Use a consistent spacing scale rather than arbitrary values.

Prefer a scale approximately based on:

4px
8px
12px
16px
20px
24px
32px

Do not use excessive vertical padding just to make the interface look "modern".

Dense management interfaces should remain efficient.

## Typography

Persian labels are the primary interface language.

Use typography intentionally:

- page heading
- section heading
- important value
- normal label
- supporting/helper text

Do not solve hierarchy only with larger font sizes.

Use weight, spacing, grouping, and contrast.

Numeric values should remain especially easy to scan.

## Surfaces

Use containers only when they improve grouping.

Not every block needs:

- background
- border
- shadow
- radius

Prefer subtle separators and layout hierarchy when enough.

## Forms

Forms must be fast to understand and complete.

- group related inputs
- align related controls
- use clear labels
- keep helper text close to its control
- keep validation messages close to the error
- avoid overly wide text inputs
- avoid excessive single-column vertical scrolling on desktop
- use multi-column layouts when relationships are clear

Do not compress mobile forms into unusably narrow multi-column layouts.

## Actions

Every interactive control should account for applicable states:

- default
- hover
- focus-visible
- active
- disabled
- loading
- validation/error

Do not use text that looks clickable without an interaction affordance.

## Empty/loading/error states

Never leave data screens visually unfinished.

When applicable, design explicit:

- loading
- empty
- offline/network
- error
- no-search-results
- disabled
- permission-limited

states.

Empty states should explain what is empty and what the user can do next.

## Icons

Icons should reinforce meaning, not decorate everything.

Do not use an icon where Persian text alone communicates the action more clearly.

Maintain consistent icon sizing and optical alignment.

## Existing design language

Improve the existing application instead of replacing every screen with an unrelated design system.

When redesigning multiple pages, establish reusable conventions for:

- inputs
- buttons
- cards/panels
- page headings
- section headings
- filters
- empty states
- dialogs
- status indicators
- list rows

Reuse existing components when they are suitable.
Extract reusable UI only when there is real repetition.

## Definition of done

A page is not finished merely because it renders.

Before finishing, visually reconsider:

- hierarchy
- alignment
- whitespace
- density
- text wrapping
- actions
- states
- RTL behavior
- mobile behavior
- dark mode

Fix obvious visual problems you find.