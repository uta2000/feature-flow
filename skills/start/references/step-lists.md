# Step Lists & Pre-Flight Details

Reference file for the start skill lifecycle orchestrator.

**Usage:**
- "Step Lists" sections — read during Step 2 to build the todo list for the selected scope
- "Pre-Flight Reviewer Audit", "Marketplace Discovery", "Install Missing Plugins Prompt" — read during pre-flight check after plugin availability checks

---

## Step Lists

### Quick path (all platforms, all scopes)

The quick path is an alternate route that bypasses all scope-based step lists below. It is taken **only** when Quick-Path Confirmation gates (in `SKILL.md` Step 3) all pass. It produces no brainstorming output, no design doc, no implementation plan, no acceptance criteria, and no handoff.

Quick-path steps (executed inline within the Triage section — no task list is built):
```
1. Announce: ⚡ Quick path confirmed: <path>:<line> — <region kind> in <language>, <N> file(s), budget: ≤<max_changed_lines> lines. Editing directly.
2. Edit the confirmed file(s).
3. Run Stop-hook checks (tsc, lint, type-sync).
4. Post-hook budget check: git diff --numstat summed across confirmed files ≤ max_changed_lines.
5. Escape hatch if post-conditions fail (restore all confirmed files, no commit).
6. Commit (model-authored, imperative mood, no Claude co-author trailer).
```

Skipped lifecycle phases: brainstorm → design → verify → plan → acceptance criteria → worktree → code review → CHANGELOG → final verification → sync → PR → wait for CI → harden PR → post-implementation comment → handoff.

---

### Quick fix (all platforms)

```
- [ ] 1. Understand the problem
- [ ] 2. Study existing patterns
- [ ] 3. Implement fix (TDD)
- [ ] 4. Self-review
- [ ] 5. Verify acceptance criteria
- [ ] 6. Sync with base branch
- [ ] 7. Commit and PR
- [ ] 8. Wait for CI and address reviews
- [ ] 9. Post implementation comment
```

### Small enhancement

If the small enhancement qualifies for fast-track (issue richness 3+ or equivalent inline detail), use the fast-track step list. Otherwise, use the standard step list.

*Standard (no fast-track):*
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Commit planning artifacts
- [ ] 8. Worktree setup
- [ ] 9. Copy env files
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Sync with base branch
- [ ] 17. Commit and PR
- [ ] 18. Wait for CI and address reviews
- [ ] 19. Post implementation comment
```

*Fast-track (issue richness 3+ or detailed inline context):*
```
- [ ] 1. Documentation lookup (Context7)
- [ ] 2. Create issue
- [ ] 3. Implementation plan
- [ ] 4. Commit planning artifacts
- [ ] 5. Worktree setup
- [ ] 6. Copy env files
- [ ] 7. Study existing patterns
- [ ] 8. Implement (TDD)
- [ ] 9. Self-review
- [ ] 10. Code review
- [ ] 11. Generate CHANGELOG entry
- [ ] 12. Final verification
- [ ] 13. Sync with base branch
- [ ] 14. Commit and PR
- [ ] 15. Wait for CI and address reviews
- [ ] 16. Post implementation comment
```

### Feature

```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Commit planning artifacts
- [ ] 9. Worktree setup
- [ ] 10. Copy env files
- [ ] 11. Study existing patterns
- [ ] 12. Implement (TDD)
- [ ] 13. Self-review
- [ ] 14. Code review
- [ ] 15. Generate CHANGELOG entry
- [ ] 16. Final verification
- [ ] 17. Sync with base branch
- [ ] 18. Commit and PR
- [ ] 19. Wait for CI and address reviews
- [ ] 20. Harden PR
- [ ] 21. Post implementation comment
- [ ] 22. Handoff
```

### Major feature

```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Design document
- [ ] 5. Design verification
- [ ] 6. Create issue
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Commit planning artifacts
- [ ] 10. Worktree setup
- [ ] 11. Copy env files
- [ ] 12. Study existing patterns
- [ ] 13. Implement (TDD)
- [ ] 14. Self-review
- [ ] 15. Code review
- [ ] 16. Generate CHANGELOG entry
- [ ] 17. Final verification
- [ ] 18. Sync with base branch
- [ ] 19. Commit and PR
- [ ] 20. Wait for CI and address reviews
- [ ] 21. Harden PR
- [ ] 22. Post implementation comment
- [ ] 23. Handoff
```

### Mobile platform adjustments (ios, android, cross-platform)

When the platform is mobile, modify the step list:

- **Implementation plan:** Add required sections — feature flag strategy, rollback plan, API versioning (if API changes)
- **After implementation:** Insert **device matrix testing** step (test on min OS version, small/large screens, slow network)
- **After final verification:** Insert **beta testing** step (TestFlight / Play Console internal testing)
- **After commit and PR:** Insert **app store review** step (human-driven gate — submission, review, potential rejection)
- **After app store review (or after commit and PR if not mobile):** Insert **post implementation comment** step (posts implementation summary comment; does not close the issue — closure happens via `Closes #N` on PR merge). Only runs when an issue is linked.
- **After post implementation comment (Feature and Major Feature scopes only):** Insert **Harden PR** and **Handoff** steps.

Announce the platform-specific additions: "Mobile platform detected. Adding: device matrix testing, beta testing, app store review, post implementation comment, and (for Feature/Major Feature scopes) Harden PR + Handoff steps."

---

## Pre-Flight Reviewer Audit

After loading `.feature-flow.yml` and completing the plugin registry scan (see `references/plugin-scanning.md`), report review coverage for the current stack using the registry data.

**Process:**
1. Read `plugin_registry` from `.feature-flow.yml`
2. Read the `stack` field from `.feature-flow.yml`
3. Group plugins by `source`:
   - **Base (required):** superpowers, context7
   - **Base (recommended):** pr-review-toolkit, feature-dev, backend-api-security
   - **Discovered:** all other plugins
4. For each plugin with a `code_review` or `security_review` role:
   a. Check `status` (installed / missing / installed_not_loaded)
   b. Check if `stack_affinity` includes `"*"` or intersects with the project's `stack` list
   c. Classify as: relevant+installed, relevant+missing, or irrelevant (stack mismatch)
5. Report to the user:

```
Plugin Registry (stack: [stack list]):
  Base (required):
    [status emoji] [plugin-name] — [roles] [stack_affinity]
  Base (recommended):
    [status emoji] [plugin-name] — [roles] [stack_affinity]
  Discovered:
    [confidence emoji] [plugin-name] — [roles] ([confidence]) [stack_affinity]
  Irrelevant (skipped for this stack):
    - [plugin-name] ([stack_affinity] — not matching stack)
```

**YOLO behavior:** No prompt for the audit display — always auto-run. Announce: `YOLO: start — Plugin registry audit → [N] relevant ([M] installed, [K] missing), [J] discovered, [L] irrelevant`

**Express behavior:** Same as YOLO for the audit display — announce inline.

## Marketplace Discovery

After the reviewer audit, discover additional code review plugins from the marketplace that may be relevant for the project's stack.

**Process:**
1. Run: `claude plugins search "code review"` (single CLI call)
2. Parse results for plugins not already installed
3. Cross-reference discovered plugins against the `plugin_registry` from `.feature-flow.yml` to determine stack relevance:
   - If a discovered plugin's `stack_affinity` matches the project's `stack` → suggest with install command
   - If a discovered plugin is not in the registry → present as "discovered — may be relevant"
4. Display marketplace results as a separate output block after the reviewer audit:
   ```
   Marketplace suggestions (stack: [stack list]):
     - [plugin-name] (matches stack) — install: claude plugins add [plugin-name]
     - [plugin-name] (discovered — may be relevant) — install: claude plugins add [plugin-name]
   ```
   If no relevant suggestions found: announce "Marketplace search complete — no new plugins found." and continue.

**Failure handling:** If `claude plugins search` fails (network error, CLI not available, non-zero exit), log a warning and continue: "Marketplace search failed — skipping plugin discovery. Continuing with installed plugins." This must never block the lifecycle.

**YOLO behavior:** Skip marketplace search entirely (install prompt will auto-skip anyway). Announce: `YOLO: start — Marketplace discovery → Skipped (YOLO mode)`

**Express behavior:** Same as YOLO — skip marketplace search.

## Install Missing Plugins Prompt

After displaying the reviewer audit (including marketplace suggestions), if there are any **Relevant + missing** or **Marketplace suggestions** plugins, prompt the user to install them before continuing.

Use `AskUserQuestion`:
- Question: `"Missing/suggested review plugins found. Install them for better coverage? (Requires Claude Code restart to take effect)"`
- Option 1: `"Install all and restart"` with description: `"Installs plugins, then you restart Claude Code and re-run start: to get full coverage"`
- Option 2: `"Let me pick"` with description: `"I'll choose which plugins to install"`
- Option 3: `"Skip — continue without installing"` with description: `"*Recommended — proceed with currently installed plugins; install more later if needed*"`

**If "Install all and restart":**
1. For each missing/suggested plugin, run: `claude plugins add [plugin-name]`
2. If any install fails, log the failure and continue with remaining installs
3. Announce which plugins were installed
4. Instruct the user: `"Plugins installed. Restart Claude Code for them to take effect, then re-run start: with the same arguments. The lifecycle will restart from pre-flight and detect the newly installed plugins."`
5. **Stop the lifecycle.** Do not continue — the new plugins will not be available until restart.

**Note:** If the user re-runs `start:` without restarting Claude Code, newly installed plugins will NOT be detected by pre-flight checks (they check loaded skills, not installed-on-disk plugins). The audit will still show them as missing. This is expected — remind the user to restart if they appear stuck in a loop.

**If "Let me pick":**
1. Present the list of missing/suggested plugins with numbers
2. User selects which to install (e.g., "1, 3" or "all except 2")
3. Install selected plugins
4. Same restart instruction and lifecycle stop as "Install all and restart"

**If "Skip":**
Continue the lifecycle with currently installed plugins. No further action.

**If no plugins are missing or suggested:** Skip this prompt entirely — no need to ask.

**YOLO behavior:** Skip the prompt. Auto-select "Skip — continue without installing." Announce: `YOLO: start — Install missing plugins → Skipped (YOLO mode)`

**Express behavior:** Same as YOLO — skip the prompt, continue with installed plugins.

---

## Tool Selector Detection

The `start` skill analyzes your project description to recommend feature-flow or GSD.

### How It Works

**1. Feature Detection**
Counts distinct features mentioned: "add X", "build Y", "implement Z"
- 1 feature: feature-flow signal
- 2-3 features: neutral
- 4+ features: GSD signal

**2. Scope Keywords**
Searches for high-impact phrases:
- GSD indicators: "from scratch", "complete app", "full system", "build everything"
- GSD indicators: "multiple independent", "parallel execution", "separate services"

**3. Timeline Estimation**
Extracts time mentions:
- Feature-flow: "1-2 hours", "a few hours", "today"
- GSD: "1-2 weeks", "several weeks", "a month"

**4. Complexity Patterns**
Detects architectural signals:
- Multiple tech stacks in one description
- Microservices or distributed language
- Explicit counts: "50+ tasks", "10+ pages"

### Recommendation Bands

| Band | Confidence | When | Action |
|------|-----------|------|--------|
| 🟢 feature-flow | 0-40% | Small scope, 1-2 features | Proceed with feature-flow |
| 🟡 GSD-recommended | 40-70% | Multi-feature, weeks timeline | Ask user to choose |
| 🔴 GSD-strongly-recommended | 70%+ | Large, "from scratch", complex | Ask user to choose |

### Examples

**Triggers 🟢 feature-flow:**
```
start: add a logout button
start: implement dark mode
start: fix the authentication bug
```

**Triggers 🟡 GSD-recommended:**
```
start: build payments and invoicing features
start: create user dashboard and settings page
```

**Triggers 🔴 GSD-strongly-recommended:**
```
start: build complete SaaS with payments, billing, analytics, dashboards
start: build from scratch with React frontend, Node backend, PostgreSQL
```

### Configuration

Control tool selection with `.feature-flow.yml`:
```yaml
tool_selector:
  enabled: true                  # Enable/disable tool selection
  confidence_threshold: 0.7      # Only recommend if >= 70% confident
  auto_launch_gsd: false        # Auto-launch GSD without asking
```

Or use command-line overrides:
```bash
start: description --feature-flow   # Force feature-flow
start: description --gsd            # Force GSD
start: description                  # Auto-detect
```
