# Scope Classification Guide

## Quick Fix

**Criteria (all must be true):**
- Affects 1 file, maybe 2
- The problem and solution are both obvious
- No data model changes
- No new UI components
- No external API changes
- Can be completed in under 15 minutes

**Examples:**
- Fix a typo in a string
- Fix a null check that causes a crash
- Update an environment variable
- Fix a CSS alignment issue
- Update a dependency version

**Lifecycle:** Understand → Implement (TDD) → Verify → Commit

**Why no design doc:** The fix is self-evident. Writing a design doc would take longer than the fix itself.

---

## Small Enhancement

**Criteria (most should be true):**
- Affects 1-3 files
- Well-understood change with no ambiguity
- No new database tables or columns
- May add a new UI component but nothing complex
- No external API integration
- No pipeline or workflow changes
- Can be completed in under 1 hour

**Examples:**
- Add a loading spinner to an existing page
- Show an additional column in an existing data table UI (no schema change)
- Add client-side form validation
- Add a sort option to an existing list
- Add a tooltip to an existing button

**Lifecycle:** Brainstorm → Design doc → Issue → Plan → Verify criteria → Worktree → Implement → Review → Verify → PR

**Why no spike or design verification:** The change is small enough that schema conflicts and technical unknowns are unlikely. The design doc is brief (under 500 words).

---

## Feature

**Criteria (any of these):**
- Affects 4+ files
- Adds new UI page or significant component
- Modifies existing data model (new columns, nullable changes)
- Adds new API route
- Requires filter/sort/export changes
- Takes more than 1 hour

**Examples:**
- Add CSV export with filters to a results page
- Add a new settings page with user preferences
- Add bulk actions to a list view
- Integrate a new API endpoint for data enrichment
- Add a new search mode to an existing search feature

**Lifecycle:** Brainstorm → Design doc → Design verification → Issue → Plan → Verify criteria → Worktree → Implement → Review → Verify → PR

**Why design verification:** Multiple files and data model changes increase the chance of conflicts with existing code. Verification catches these before implementation.

**Why no spike:** The technologies and patterns are already established in the codebase. No risky unknowns.

---

## Major Feature

**Criteria (any of these):**
- Introduces a new page/workflow with multiple steps
- New data model (new tables, significant schema changes)
- External API integration not previously used
- New pipeline or processing flow
- LLM integration
- Multiple new components and hooks
- Touches 10+ files
- Takes multiple sessions

**Examples:**
- Build a creative domain generator with LLM
- Add a watch list with email alerts
- Integrate a new payment provider
- Build a real-time collaboration feature
- Add a multi-step onboarding wizard

**Lifecycle:** Brainstorm → Spike → Design doc → Design verification → Issue → Plan → Verify criteria → Worktree → Implement → Review → Verify → PR

**Why spike:** Major features often rely on assumptions about external APIs, LLM behavior, or performance that have never been tested. A spike validates these before committing to a design.

---

## Edge Cases

### "I'm not sure if this needs a spike"

Ask these questions:
1. Does the feature depend on an external API we haven't used before? → Spike
2. Does the feature use a library feature we haven't tested? → Spike
3. Does the feature assume performance characteristics we haven't measured? → Spike
4. Does the feature use LLM output in a way we haven't validated? → Spike

If all answers are no, skip the spike.

### "This started as a small enhancement but got bigger"

Upgrade the scope. Announce the change, add missing steps (design verification, etc.), and continue from where you are. Do not restart the lifecycle — just add the steps that were previously skipped.

### "This is a bug fix but it touches many files"

If the root cause is understood and the fix is clear, it's still a quick fix even if it touches many files. If the root cause is unclear and investigation is needed, upgrade to a feature (with brainstorming = investigation, design doc = root cause analysis and fix approach).

### "The user just wants to start coding"

Explain the lifecycle briefly:
"This feature touches [N files / new data model / external API]. The lifecycle takes about [X minutes] of planning but saves hours of debugging later. Want to proceed with the lifecycle, or skip to implementation?"

If they skip, note the risk and proceed directly to implementation. Do not force the lifecycle.
