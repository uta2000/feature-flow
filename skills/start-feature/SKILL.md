---
name: start-feature
description: This skill should be used when the user asks to "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. It orchestrates the full lifecycle from idea to PR, invoking the right skills at each step.
tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion, Skill
---

# Start Feature — Lifecycle Orchestrator

Guide development work through the correct lifecycle steps, invoking the right skill at each stage. This is the single entry point for any non-trivial work.

**Announce at start:** "Starting the feature lifecycle. Let me check project context and determine the right steps."

## Purpose

Ensure the lifecycle is followed from start to finish. Track which steps are complete, invoke the right skill at each stage, and do not advance until the current step is done.

## Process

### Step 0: Load Project Context

Check for a `.spec-driven.yml` file in the project root.

If found, read it and extract:
- **`platform`** — determines lifecycle adjustments (web, ios, android, cross-platform)
- **`stack`** — determines which stack-specific checks are loaded during verification
- **`gotchas`** — project-specific pitfalls injected into every verification

See `../../references/project-context-schema.md` for the full schema.

If not found, proceed with the standard web lifecycle. Mention: "No `.spec-driven.yml` found — using standard lifecycle. Add one to enable platform and stack-specific adjustments."

### Step 1: Determine Scope

Ask the user what they want to build. Then classify the work:

| Scope | Description | Example |
|-------|------------|---------|
| **Quick fix** | Single-file bug fix, typo, config change | "Fix the null check in the login handler" |
| **Small enhancement** | 1-3 files, well-understood change, no new data model | "Add a loading spinner to the search page" |
| **Feature** | Multiple files, new UI or API, possible data model changes | "Add CSV export to the results page" |
| **Major feature** | New page/workflow, data model changes, external API integration, pipeline changes | "Build a creative domain generator with LLM" |

Present the classification to the user:

```
This looks like a [scope]. Here's the lifecycle for this work:

[show applicable steps with checkboxes]

Does this look right, or should I adjust the scope?
```

Use `AskUserQuestion` to confirm. Options: the four scope levels.

### Step 2: Build the Step List

Based on scope AND platform, determine which steps apply. Create a todo list to track progress.

**Quick fix (all platforms):**
```
- [ ] 1. Understand the problem
- [ ] 2. Implement fix (TDD)
- [ ] 3. Verify acceptance criteria
- [ ] 4. Commit and PR
```

**Small enhancement:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Design document
- [ ] 3. Create issue
- [ ] 4. Implementation plan
- [ ] 5. Verify plan criteria
- [ ] 6. Worktree setup
- [ ] 7. Implement (TDD)
- [ ] 8. Code review
- [ ] 9. Final verification
- [ ] 10. Commit and PR
```

**Feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Design document
- [ ] 3. Design verification
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Worktree setup
- [ ] 8. Implement (TDD)
- [ ] 9. Code review
- [ ] 10. Final verification
- [ ] 11. Commit and PR
```

**Major feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Worktree setup
- [ ] 9. Implement (TDD)
- [ ] 10. Code review
- [ ] 11. Final verification
- [ ] 12. Commit and PR
```

**Mobile platform adjustments (ios, android, cross-platform):**

When the platform is mobile, modify the step list:

- **Implementation plan:** Add required sections — feature flag strategy, rollback plan, API versioning (if API changes)
- **After implementation:** Insert **device matrix testing** step (test on min OS version, small/large screens, slow network)
- **After final verification:** Insert **beta testing** step (TestFlight / Play Console internal testing)
- **After commit and PR:** Insert **app store review** step (human-driven gate — submission, review, potential rejection)

Announce the platform-specific additions: "Mobile platform detected. Adding: device matrix testing, beta testing, and app store review steps."

Use `TaskCreate` to create a todo item for each step.

### Step 3: Execute Steps in Order

For each step, follow this pattern:

1. **Announce the step:** "Step N: [name]. Invoking [skill name]."
2. **Mark in progress:** Update the todo item to `in_progress`
3. **Invoke the skill** using the Skill tool (see mapping below)
4. **Confirm completion:** Verify the step produced its expected output
5. **Mark complete:** Update the todo item to `completed`
6. **Announce next step:** "Step N complete. Next: Step N+1 — [name]."

**Do not skip steps.** If the user asks to skip a step, explain why it matters and confirm they want to skip. If they insist, mark it as skipped and note the risk.

### Skill Mapping

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX |
| Spike / PoC | `spec-driven:spike` | Confirmed/denied assumptions |
| Design document | `spec-driven:design-document` | File at `docs/plans/YYYY-MM-DD-*.md` |
| Design verification | `spec-driven:design-verification` | Blockers/gaps identified and fixed |
| Create issue | `spec-driven:create-issue` | GitHub issue URL |
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria |
| Verify plan criteria | `spec-driven:verify-plan-criteria` | All tasks have verifiable criteria |
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created |
| Implement | `superpowers:test-driven-development` | Code written with tests |
| Code review | `superpowers:requesting-code-review` | Review feedback addressed |
| Final verification | `spec-driven:verify-acceptance-criteria` + `superpowers:verification-before-completion` | All criteria PASS + lint/typecheck/build pass |
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL |
| Device matrix testing | No skill — manual step | Tested on min OS, small/large screens, slow network |
| Beta testing | No skill — manual step | TestFlight / Play Console build tested by internal tester |
| App store review | No skill — manual step | Submission accepted |

### Step 4: Handle Interruptions

**Within the same session:**
- The todo list persists across messages — check it to determine which step is next
- If the user switches topics mid-lifecycle, retain the lifecycle state and resume when they return
- Announce: "Resuming lifecycle. Last completed step: [N]. Next: [N+1]."

**Across sessions (new conversation):**
- Todo lists do not persist across sessions. If the user says "resume the feature lifecycle," ask which feature and which step they were on.
- Check for artifacts from previous sessions: design docs in `docs/plans/`, open GitHub issues, existing worktrees, and branch history to infer progress.

### Step 5: Completion

When all steps are done:

```
Lifecycle complete!

Summary:
- Platform: [web/ios/android/cross-platform]
- Design doc: docs/plans/YYYY-MM-DD-feature.md
- Issue: #[number]
- PR: #[number]
- All acceptance criteria verified

[List any skipped steps and their risks]
[List any platform-specific notes (e.g., "App store submission pending")]
```

## Scope Adjustment Rules

During the lifecycle, the scope may need to change:

- **Upgrade:** Brainstorming reveals more complexity than expected → upgrade from "small enhancement" to "feature" and add missing steps
- **Downgrade:** Design verification finds no conflicts, spike confirms everything works → keep the steps but move through them quickly
- **Add spike:** Design verification reveals risky unknowns → insert a spike step before continuing

When adjusting, announce: "Adjusting scope from [old] to [new]. Adding/removing steps: [list]."

## Quality Rules

- **One step at a time.** Never run two lifecycle steps in parallel.
- **Skill invocation is mandatory.** Always invoke the mapped skill — do not perform the step manually and claim it's done.
- **Output verification.** Each step must produce its expected output before marking complete.
- **No silent skips.** If a step is skipped, it must be acknowledged with a reason.
- **Scope can change.** The lifecycle adapts to what is discovered during execution.
- **Platform context is loaded once.** Read `.spec-driven.yml` at the start; pass context to skills that need it.

## Additional Resources

### Reference Files

For detailed scope classification guidance and step descriptions:
- **`references/scope-guide.md`** — Detailed criteria for classifying work scope, with examples and edge cases

For project context and platform-specific lifecycle adjustments:
- **`../../references/project-context-schema.md`** — Schema for `.spec-driven.yml`
- **`../../references/platforms/mobile.md`** — Mobile lifecycle adjustments, required sections, beta testing checklist
- **`../../references/platforms/web.md`** — Web lifecycle adjustments
