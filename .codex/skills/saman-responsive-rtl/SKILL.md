---
name: saman-responsive-rtl
description: Build and review responsive Persian RTL interfaces for Saman Poolak across phones, tablets, laptops, desktop and large desktop screens. Use whenever changing layout, navigation, forms, lists, tables, charts, dialogs, employee screens, or responsive CSS.
---

# Responsive RTL Design

Every changed interface must work deliberately on both mobile and desktop.

Do not create a desktop page and merely allow CSS to shrink it.

Do not create a mobile page and merely stretch it across desktop.

## Viewports

Reason about at least:

- 360px phone
- 390px phone
- 768px tablet
- 1024px small desktop/tablet
- 1280px desktop
- 1440px desktop
- 1920px large desktop

Exact breakpoints should follow the layout rather than blindly matching these numbers.

## RTL

The application is Persian-first and RTL.

Respect RTL reading and action flow.

Use logical CSS properties where practical:

- margin-inline
- padding-inline
- inset-inline
- border-inline

instead of unnecessarily encoding left/right assumptions.

Do not mirror things that have an inherent direction.

Numeric fields, technical identifiers and suitable numeric values may use local:

dir="ltr"

when it improves readability.

## Mobile

Mobile layouts must prioritize:

1. primary task
2. important information
3. main actions
4. secondary details

Do not simply hide important information because the viewport is small.

Reformat it.

Prefer:

- stacked information
- compact summary rows
- expandable detail
- responsive grids
- bottom sheets/dialogs when appropriate
- accessible scrolling

Avoid:

- horizontal page overflow
- tiny controls
- dense desktop tables squeezed to phone width
- hover-dependent interaction
- multiple primary actions competing for width

Touch targets should generally be around 44px when practical.

Spacing between adjacent touch actions must prevent accidental activation.

## Desktop

Desktop should use additional space productively.

Prefer:

- constrained readable content width where appropriate
- multi-column forms
- side-by-side summary/details
- efficient filters
- denser tables/lists
- persistent contextual controls where useful

Do not stretch ordinary forms from edge to edge across 1920px displays.

Do not create huge blank spaces merely because the viewport is large.

## Tables and dense data

Do not automatically solve mobile tables with horizontal scrolling.

Choose based on the data.

Possible strategies:

- responsive stacked rows
- key-value cards
- hide genuinely secondary columns
- expandable row details
- horizontal scroll when column comparison is essential

When horizontal scrolling is necessary, keep important context visible when practical.

## Navigation

Preserve the application's established navigation behavior unless explicitly redesigning it.

Navigation must remain usable with:

- long Persian labels
- small phones
- safe-area spacing
- active state
- keyboard focus

Never allow the mobile navigation to cover important page content.

## Forms

Desktop:

- group related inputs
- use columns where relationships are obvious
- avoid extremely wide controls

Mobile:

- usually use one column
- keep labels immediately associated with controls
- avoid controls narrower than their content requires
- ensure numeric inputs remain readable

## Dialogs

Dialogs must not overflow small screens.

On narrow phones, prefer near-full-width dialogs with safe margins.

Large forms may need a page or sheet rather than a cramped modal.

Ensure important actions remain reachable without awkward scrolling.

## Persian text

Test realistic Persian labels rather than assuming English-length placeholders.

Account for:

- wrapping
- longer labels
- Persian digits
- numbers mixed with Persian
- units
- dates

## Responsive definition of done

Check for:

- horizontal overflow
- clipped Persian text
- overlapping controls
- bad line wrapping
- unreachable actions
- oversized whitespace
- tiny tap targets
- broken dialogs
- bottom navigation covering content
- awkward breakpoint transitions

Fix these issues before considering the UI complete.