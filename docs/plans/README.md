# Design Documents — Historical Archive

This directory contains design documents created before 2026-04-23.

**Active designs (created after 2026-04-23) live in their linked GitHub issue body** under the `## Design (feature-flow)` section, inserted by the `feature-flow:design-document` skill between HTML-comment markers:

```
<!-- feature-flow:design:start -->
## Design (feature-flow)

<generated design content>

<!-- feature-flow:design:end -->
```

To read the design for an active feature, open the linked GitHub issue and scroll to `## Design (feature-flow)`.

## Why issues instead of files?

- Design is a working artifact consumed within a single session. After merge, the PR body, linked issue, and commit log are the durable record.
- Running multiple `start:` sessions in parallel previously caused collisions when all sessions wrote to `docs/plans/` on the base branch simultaneously.
- The natural home for a design is the GitHub issue it belongs to.

## Files in this directory

The `*.md` files here are historical — kept as-is for reference. Do not delete or move them.
See the [feature-flow plugin](../../skills/design-document/SKILL.md) for the current lifecycle.
