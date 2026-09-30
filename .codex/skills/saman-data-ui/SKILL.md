---
name: saman-data-ui
description: Design dense business-data interfaces for Saman Poolak, including statistics, charts, production tasks, order lists, filters, tables, quantities, weights, dates, statuses and drill-down views. Use when implementing data-heavy screens rather than simple presentation pages.
---

# Business Data UI

Optimize data-heavy screens for comprehension and operational speed.

The user should be able to scan the page and understand its state quickly.

## Information density

Do not confuse whitespace with usability.

Operational screens should be compact enough for repeated daily use.

Prioritize:

- scanning
- comparison
- status recognition
- fast actions
- low interaction cost

## Summary versus detail

Present information progressively:

summary → important state → details → history

Do not display every property with equal visual weight.

Highlight values that affect the user's next decision.

## Lists

Rows should have a predictable visual structure.

Prefer consistent locations for:

- primary identity
- secondary metadata
- status
- quantitative values
- actions

Do not make every row visually unique.

## Filters

Filters must clearly affect the data they belong to.

Prefer commonly used filters being immediately available.

Move uncommon filters into an expandable area if needed.

Clearly represent active filters.

Provide an obvious way to clear filters when applicable.

Do not create a huge filter panel that pushes the actual results below the fold.

## Numbers

Numbers are operational data.

Make important quantities easy to compare.

Use consistent formatting for:

- quantities
- weights
- money
- percentages
- dates
- identifiers

Follow existing project helpers and domain rules rather than implementing alternate formatting.

## Status

Status must be recognizable without requiring the user to read an entire paragraph.

Use restrained status treatment.

Do not rely on color alone.

Avoid an excessive rainbow of status colors.

## Charts

Charts should answer a specific question.

Avoid decorative charts.

Use:

- clear labels
- meaningful axis information
- readable values
- useful tooltips
- explicit empty/zero states

Do not sacrifice numeric understanding for animation or visual novelty.

When many days/categories exist, preserve useful context while scrolling.

## Statistics

Start with useful summary information, followed by trends and then drill-down detail when appropriate.

A statistics screen should help answer:

- how much was produced?
- when?
- by whom, when permitted?
- what contributed to the number?
- what happened on a specific day?

## Production-specific behavior

When modifying employee production/statistics screens, consult:

MASTERCONTEXT.md#employee-production

Do not duplicate or reinterpret its business rules.

Preserve established production units, ownership, log behavior, date behavior and aggregation rules.

## Tables versus cards

Use tables when comparison across rows/columns matters.

Use cards or stacked rows when individual records matter more than cross-row comparison.

On mobile, choose the representation that preserves the actual task.

Do not convert every desktop table into random disconnected cards unless doing so improves comprehension.

## Drill-down

Clickable summaries must visually indicate that detail exists.

Drill-down should preserve context:
the user should understand what value/date/item they opened.

## Destructive operations

Edit/delete/clear operations must not be visually confused with normal navigation.

Use confirmation when accidental execution has meaningful consequences.

## Loading

For frequently refreshed operational screens:

- avoid excessive layout jumping
- keep previous useful context when appropriate
- distinguish initial loading from refresh
- surface errors without destroying the rest of the page unnecessarily