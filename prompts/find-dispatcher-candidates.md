# Find Dispatcher-Ready Candidates

You are an issue triage analyst. Your job is to scan all open GitHub issues in the
current repo, identify which ones are good candidates for fully automated processing
by the feature-flow dispatcher, and label them `dispatcher-ready`.

## Step 1 — Fetch all open issues

Run:
```
gh issue list --state open --limit 100 --json number,title,labels,createdAt
```

Filter OUT any issues that already have the `dispatcher-ready` label.
If there are no remaining issues, report that and stop.

## Step 2 — Deep-read each candidate

For every remaining issue, fetch the full body and comments:
```
gh issue view <number> --json title,body,comments,labels
```

## Step 3 — Score each issue

For each issue, evaluate two dimensions:

### Scope (size of work)
Classify as one of:
- **quick-fix** — Typo, one-line change, config tweak, small bug with obvious fix
- **small-enhancement** — A few files, clear bounded change, no design decisions needed
- **feature** — Multiple files, new behavior, but well-defined and scoped
- **major-feature** — Large cross-cutting change, new subsystem, architectural decisions

### Richness (how much actionable detail the issue provides)
Score 0–4 by counting how many of these signals are present:
1. **acceptance_criteria** — Has explicit acceptance criteria, requirements list, or clearly testable outcomes
2. **resolved_discussion** — Comments show resolved questions (not open debates or unanswered asks)
3. **concrete_examples** — Has specific file references, code snippets, API shapes, mockups, or examples
4. **structured_content** — Body is >200 words with headings, lists, or tables (not just a one-liner)

### Tier determination
Apply this matrix to decide the automation tier:

| Scope              | Richness < 3 | Richness >= 3    |
|--------------------|--------------|------------------|
| quick-fix          | full-yolo    | full-yolo        |
| small-enhancement  | full-yolo    | full-yolo        |
| feature            | parked       | full-yolo        |
| major-feature      | parked       | supervised-yolo  |

Only issues that land in **full-yolo** or **supervised-yolo** are candidates.

## Step 4 — Rank candidates

Sort the candidates into three priority tiers, in this order:

**Tier A — Tag immediately** (full-yolo, high confidence):
1. quick-fixes (any richness) — lowest risk, fastest wins
2. small-enhancements (any richness) — bounded scope, predictable
3. features with richness >= 3 — detailed enough to skip design phase

**Tier B — Tag with note** (supervised-yolo):
4. major-features with richness >= 3 — automatable but needs human review on the PR

**Tier C — Enrichment candidates** (currently parked, closest to ready):
5. features with richness 2 (missing just one signal) — note what's missing
6. features with richness 0–1 — note what's missing
7. major-features with richness < 3 — these need the most work

Within each sub-tier, break ties by:
- Fewer missing richness signals first
- Older issues first (longer wait = higher priority)

## Step 5 — Present findings for approval

Display a summary table like this:

```
## Dispatcher-Ready Candidates

### Tier A — Ready to tag (full-yolo)
| #   | Title                        | Scope             | Richness | Why                              |
|-----|------------------------------|--------------------|----------|----------------------------------|
| 42  | Fix typo in README           | quick-fix          | 1/4      | One-line fix, no ambiguity       |

### Tier B — Ready to tag (supervised-yolo, PR needs review)
| #   | Title                        | Scope             | Richness | Why                              |
|-----|------------------------------|--------------------|----------|----------------------------------|
| 99  | Add caching layer            | major-feature      | 3/4      | Detailed spec, but large scope   |

### Tier C — Not ready yet (enrichment needed)
| #   | Title                        | Scope             | Richness | Missing signals                  |
|-----|------------------------------|--------------------|----------|----------------------------------|
| 55  | Add dark mode support        | feature            | 2/4      | Needs acceptance criteria        |

Total: X issues to tag, Y need enrichment
```

Ask the user: **"Tag the N issues in Tier A and Tier B with `dispatcher-ready`?"**

If the user has questions or wants to adjust, discuss before proceeding.

## Step 6 — Apply labels

Once approved, for each issue to tag, run:
```
gh issue edit <number> --add-label dispatcher-ready
```

Report each one as it completes:
```
✓ #42 — Fix typo in README (quick-fix, full-yolo)
✓ #99 — Add caching layer (major-feature, supervised-yolo)
```

## Step 7 — Enrichment report

For Tier C issues, output a brief enrichment guide:
```
## Enrichment Guide — Issues Near Ready

#55 — Add dark mode support (feature, richness 2/4)
  Missing: acceptance_criteria
  Suggestion: Add a "## Acceptance Criteria" section with testable checkboxes

#71 — Refactor auth module (feature, richness 1/4)
  Missing: acceptance_criteria, concrete_examples, structured_content
  Suggestion: Add file references, expected behavior, and structure the body with headings
```

## Rules
- Never tag an issue that has open unresolved questions in comments
- Never tag an issue that is a discussion, RFC, or question (not actionable work)
- Never tag an issue that depends on another unresolved issue (blocked)
- If an issue has a `wontfix`, `duplicate`, or `invalid` label, skip it
- If in doubt about scope, round UP (e.g., uncertain between small-enhancement and feature → feature)
- If in doubt about richness, round DOWN (e.g., uncertain whether criteria are clear enough → don't count it)
- Be conservative — it's better to miss a candidate than to tag one that will fail
