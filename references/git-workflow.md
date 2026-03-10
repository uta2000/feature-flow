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

## Atomic Commit Workflow

Commit after every acceptance criterion is verified — not after the full task.

1. Implement the code that satisfies one criterion
2. Verify the criterion passes (run the test or check the output)
3. Stage and commit:
   ```bash
   git add <changed files>
   git commit -m "feat(component): task description — ✓criterion text"
   ```
4. Update the Progress Index in the plan file: STATUS `in-progress` → `done (commit [SHA])` after the last criterion commit for that task
5. Move to the next criterion

**When to group criteria in one commit:** Only when two criteria test the exact same code path and cannot be verified independently. Keep grouping rare.

**Never use:**
- `git commit --amend` — always create a new commit instead (even for wrong messages or forgotten files)
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
feat(brainstorming): add YOLO self-answer loop — ✓YOLO mode works
```

**Single criterion (medium):**
```
fix(start): handle missing tool_selector config — ✓defaults applied
```

**Multiple tightly-coupled criteria:**
```
feat(design-document): add approval checkpoint — ✓shown ✓skipped
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
