# Atomic Git Commits Per Task — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create references/git-workflow.md — STATUS: pending
Task 2: Update yolo-overrides.md — STATUS: pending
Task 3: Update inline-steps.md — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Introduce atomic git commit guidelines — one commit per acceptance criterion — enabling precise `git bisect` debugging and a cleaner, more traceable PR history.

**Architecture:** Three documentation-only changes: create a new canonical reference file (`references/git-workflow.md`), update the implementer quality injection in `yolo-overrides.md` to mandate atomic commits, and add cross-references in `inline-steps.md`.

**Tech Stack:** Markdown (documentation only — no runtime code)

---

### Task 1: Create `references/git-workflow.md`

**Files:**
- Create: `references/git-workflow.md`

**Acceptance Criteria:**
- [ ] File exists at `references/git-workflow.md`
- [ ] Contains `## Commit Message Format` section with the template `feat(component): task — ✓criterion`
- [ ] Contains `## Atomic Commit Workflow` section with step-by-step commit-per-criterion instructions
- [ ] Contains `## git-bisect Workflow` section with example commands
- [ ] Contains `## Examples` section with at least 2 concrete commit message examples (short and long-criterion-list variants)
- [ ] Description line of every example stays under 72 characters

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A — no code
- Function length: N/A
- Pattern: follow structure and tone of existing `references/coding-standards.md`
- Files modified: none (new file)
- Parallelizable: no

**Steps:**

Step 1: Read `references/coding-standards.md` to understand tone and section structure convention.

```bash
cat references/coding-standards.md | head -60
```

Step 2: Write `references/git-workflow.md` with this exact content:

```markdown
# Git Workflow

Reference for git commit conventions used throughout the feature-flow lifecycle.

## Commit Message Format

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description> — ✓<criterion>
```

**Rules:**
- `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- `scope`: the component or module being changed (e.g., `brainstorming`, `start`, `design-document`)
- `description`: what the commit does — imperative, lowercase, no period
- `✓<criterion>`: the acceptance criterion this commit verifies — use the exact wording from the plan
- Max total length of the description line: **72 characters** (terminal readability)
- If the criterion list makes the line exceed 72 characters, keep the description short and move criteria to the commit body

**Long criterion list (move to body):**

```
feat(start): add tool selector step 0

Criteria verified:
✓ tool_selector.enabled=false skips detection
✓ confidence_threshold read from .feature-flow.yml
✓ auto_launch_gsd triggers without prompt
```

## Atomic Commit Workflow

Commit after every acceptance criterion is verified — not after the full task.

1. Implement the code that satisfies one criterion
2. Verify the criterion passes (run the test or check the output)
3. Stage and commit:
   ```bash
   git add <changed files>
   git commit -m "feat(component): task description — ✓criterion text"
   ```
4. Update the Progress Index in the plan file:
   - STATUS: `in-progress` → `done (commit [SHA])` after the last criterion for that task
5. Move to the next criterion

**When to group criteria in one commit:** Only when two criteria test the exact same code path and cannot be verified independently. Keep grouping rare.

**Never use:**
- `git commit --amend` — always create a new commit instead (even for wrong messages)
- `git rebase -i` — leave history as-is; ask the user before squashing
- `git push --force` — stop and ask the user if this seems necessary

## git-bisect Workflow

With atomic commits, `git bisect` pinpoints the exact criterion that introduced a bug:

```bash
git bisect start
git bisect bad HEAD            # current broken state
git bisect good <old-sha>      # known good commit
git bisect run <test-script>   # optional: automate bisect steps
# bisect narrows to a criterion-level commit
git show HEAD                  # reveals which criterion introduced the regression
git bisect reset
```

## Examples

**Single criterion (short):**
```
feat(brainstorming): add YOLO self-answer loop — ✓YOLO skips interactive prompts
```

**Single criterion (medium):**
```
fix(start): handle missing tool_selector config — ✓defaults applied when section absent
```

**Multiple tightly-coupled criteria:**
```
feat(design-document): add Express approval checkpoint — ✓checkpoint shown for feature scope ✓skipped for small enhancement
```
*(Only group when criteria cannot be verified independently.)*

**Long criterion list → move to body:**
```
feat(start): integrate tool selector as step 0

Criteria verified:
✓ tool_selector.enabled=false skips to brainstorming
✓ confidence_threshold parsed from .feature-flow.yml
✓ score < threshold shows quiet notification only
✓ score >= threshold shows recommendation block
```
```

Step 3: Verify file was created and contains required sections:

```bash
grep -c "## Commit Message Format\|## Atomic Commit Workflow\|## git-bisect Workflow\|## Examples" references/git-workflow.md
```

Expected output: `4` (all four required section headers present)

Step 4: Verify no description line in examples exceeds 72 characters:

```bash
# Check all lines starting with feat/fix/docs/refactor/test/chore in the file
grep -E "^(feat|fix|docs|refactor|test|chore)\(" references/git-workflow.md | awk 'length > 72 {print NR": "length" chars: "$0}'
```

Expected output: empty (no violations)

Step 5: Commit:

```bash
git add references/git-workflow.md
git commit -m "docs(git-workflow): add atomic commit guidelines and git-bisect workflow — ✓file created at references/git-workflow.md"
```

---

### Task 2: Update `skills/start/references/yolo-overrides.md`

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (design-first — 297 lines)

**Acceptance Criteria:**
- [ ] "Implementer Quality Context Injection" section — item 6 (Git Safety Protocol) references `references/git-workflow.md`
- [ ] A new item 7 "Atomic Commit Protocol" is added to the quality context injection list, directing implementers to commit per acceptance criterion using the format in `references/git-workflow.md`
- [ ] The "Injection format" block at the end of the section includes `### Atomic Commit Protocol` as a new subsection
- [ ] Cross-reference note added near the top of the Git Safety Protocol block: "See `references/git-workflow.md` for the full commit message format."

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A
- Function length: N/A
- Pattern: match the numbered-item style and injection format already used in this file (lines 239–297)
- Files modified: `skills/start/references/yolo-overrides.md` (design-first — 297 lines)
- Design-first: output your change plan before any Edit call on this file
- Parallelizable: yes

**Steps:**

Step 1: Read the full file to understand current structure:

```bash
# Read from line 239 onward (Implementer Quality Context Injection section)
```

Use Read tool: `file_path: skills/start/references/yolo-overrides.md, offset: 239, limit: 60`

Step 2: Output your change plan before editing:

Identify:
- Exact line where item 6 (Git Safety Protocol) ends and where item 7 should be inserted
- Exact old_string for the Edit that adds the cross-reference to item 6
- Exact old_string for the Edit that adds item 7 and updates the injection format block

Step 3: Add cross-reference to item 6 and add item 7.

**Edit A** — Add cross-reference to Git Safety Protocol header (item 6):

Find the line:
```
6. **Git Safety Protocol.** Instruct the implementer to never use history-rewriting git operations:
```

Replace with:
```
6. **Git Safety Protocol.** Instruct the implementer to never use history-rewriting git operations (see `references/git-workflow.md` for the full commit message format):
```

**Edit B** — Add item 7 after the end of item 6's bullet list (after the line that reads `- This aligns with Claude Code's own git safety protocol: "CRITICAL: Always create NEW commits rather than amending"`):

Insert after that line (before the blank line and `**Injection format:**`):

```
7. **Atomic Commit Protocol.** Instruct the implementer to commit after every acceptance criterion is verified — not after the full task. Full guidelines: `references/git-workflow.md`.

   Key rules:
   - One commit per acceptance criterion (group only when criteria are inseparable)
   - Commit message format: `feat(scope): task description — ✓criterion text`
   - Max description line: 72 characters; long criterion lists go in the commit body
   - Never amend or rebase — always create new commits
```

**Edit C** — Add `### Atomic Commit Protocol` subsection to the Injection format block.

Find the line in the injection format block:
```
### Git Safety Protocol
```

Add after the Git Safety Protocol subsection content (after the last bullet `If a pre-commit hook failed: fix the underlying issue and create a NEW commit — do not amend.`):

```
### Atomic Commit Protocol
Commit after every acceptance criterion is verified — not after the full task.
Format: `feat(scope): task description — ✓criterion text` (max 72 chars; long lists go in body)
Full guidelines: `references/git-workflow.md`
```

Step 4: Verify edits landed correctly:

```bash
grep -n "Atomic Commit Protocol\|git-workflow.md" skills/start/references/yolo-overrides.md
```

Expected output: 3+ lines showing the cross-reference in item 6, item 7 header, and the injection format subsection.

Step 5: Commit:

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "docs(yolo-overrides): add atomic commit protocol to implementer quality injection — ✓item 7 added ✓injection format updated"
```

---

### Task 3: Update `skills/start/references/inline-steps.md`

**Files:**
- Modify: `skills/start/references/inline-steps.md` (design-first — 446 lines)

**Acceptance Criteria:**
- [ ] "Commit Planning Artifacts Step" section includes a note distinguishing planning-artifact commits (fixed message) from implementation commits (see `references/git-workflow.md`)
- [ ] "Comment and Close Issue Step" — step 2 includes a note that atomic commits appear naturally in `git log` output and should be included as-is for traceability

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A
- Function length: N/A
- Pattern: match the note/callout style already used in this file
- Files modified: `skills/start/references/inline-steps.md` (design-first — 446 lines)
- Design-first: output your change plan before any Edit call on this file
- Parallelizable: yes

**Steps:**

Step 1: Read the Commit Planning Artifacts section:

Use Read tool: `file_path: skills/start/references/inline-steps.md, offset: 47, limit: 30`

Step 2: Read the Comment and Close Issue section:

Use Read tool: `file_path: skills/start/references/inline-steps.md, offset: 382, limit: 60`

Step 3: Output your change plan before editing.

Step 4: Add note to "Commit Planning Artifacts Step" section.

Find the "Edge cases:" block in the Commit Planning Artifacts section. Add a note **before** the `---` separator that follows the step:

**Edit A** — Find this exact line near the end of the Commit Planning Artifacts section:
```
- **git errors in output** — `2>&1` redirects stderr to stdout; git errors appear as non-empty output and are treated conservatively as "may have artifacts" — the subagent proceeds and determines the actual state
```

Add after it (before the `---`):

```

> **Note:** The commit message in this step is fixed (`docs: add design and implementation plan for [feature-name]`). For implementation commits (created during the Implement step), follow the atomic commit format in `references/git-workflow.md` — one commit per acceptance criterion with the `feat(scope): description — ✓criterion` format.
```

Step 5: Add note to "Comment and Close Issue Step" — step 2.

Find this line in step 2 of the Comment and Close Issue section:
```
   → Derive 2-4 "What was built" bullets from commit messages.
```

Add after it:

```
   > **Atomic commits:** With atomic commits (see `references/git-workflow.md`), each criterion has its own commit. Include these criterion-level commits as-is in the bullets — they provide precise traceability.
```

Step 6: Verify edits:

```bash
grep -n "git-workflow.md" skills/start/references/inline-steps.md
```

Expected output: 2 lines — one in Commit Planning Artifacts, one in Comment and Close Issue.

Step 7: Commit:

```bash
git add skills/start/references/inline-steps.md
git commit -m "docs(inline-steps): cross-reference git-workflow.md in commit steps — ✓planning artifacts note added ✓comment-close note added"
```
