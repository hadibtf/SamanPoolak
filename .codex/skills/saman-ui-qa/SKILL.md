---
name: saman-ui-qa
description: Perform the final visual, responsive and regression review for Saman Poolak frontend changes. Use after creating, redesigning, or significantly modifying a page, component, form, navigation, chart, statistics view, employee workflow, or CSS.
---

# Saman Poolak UI QA

Do not treat successful compilation as proof that a UI task is finished.

Perform a focused final review.

## Visual review

Check:

- hierarchy
- alignment
- spacing
- typography
- density
- visual consistency
- wrapping
- control sizing
- status readability
- primary action prominence

Look specifically for signs of generic AI-generated UI:

- too many cards
- excessive rounded rectangles
- oversized headings
- huge whitespace
- redundant labels
- unnecessary icons
- unnecessary shadows

Correct them.

## Responsive review

Check the changed UI conceptually or directly at approximately:

- 360px
- 390px
- 768px
- 1280px
- 1440px

Also reason about very large desktop width.

Verify:

- no page-level horizontal overflow
- navigation remains reachable
- dialogs fit
- controls do not overlap
- Persian labels wrap correctly
- data remains understandable
- tap targets remain usable

## RTL review

Check:

- Persian flow
- icons
- mixed Persian/numeric content
- alignment
- directional controls
- numeric LTR usage where appropriate

Do not mechanically mirror directional semantics.

## Theme review

Check applicable UI in both:

- light
- dark

Verify:

- readable text
- borders remain visible
- inputs remain readable
- select options remain readable
- hover/focus states remain visible

## Interaction review

Check applicable:

- primary action
- secondary action
- delete/destructive action
- forms
- validation
- dropdown/select
- filters
- modal/dialog
- navigation
- loading
- empty state
- error state

## Regression review

Inspect changed CSS for selectors that could affect unrelated pages.

Pay special attention to:

- button
- input
- select
- calendar
- navigation
- PDF surfaces

## Project checks

Run the relevant available checks.

At minimum for meaningful frontend work:

npm run build

Fix warnings because production builds treat lint warnings as failures.

When tests relevant to the modified feature exist, run them.

Do not deploy unless the user asks.

## Finish

If QA reveals obvious problems, fix them rather than merely listing them.

Report remaining limitations only when they cannot reasonably be resolved within the task.