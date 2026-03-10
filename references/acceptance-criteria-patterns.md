# Acceptance Criteria Patterns — Structured Format Reference

This file is loaded by verify-plan-criteria when flagging non-conforming acceptance criteria during the planning phase. It defines the required format for all acceptance criteria and is referenced in flag messages to explain why a criterion was rejected and how to fix it.

<!-- section: format-spec -->
## Format Specification

Every verifiable acceptance criterion must follow this three-part structure:

```
[WHAT] measured by [HOW] verified by `[COMMAND]`
```

- **[WHAT]** — The property or behavior that must hold. Written as a declarative statement: `TypeScript types are valid`, `Reference file is present`, `Test suite passes`.
- **[HOW]** — The observable metric or artifact that demonstrates the property holds. Must be concrete and unambiguous: `zero new compilation errors`, `file existence`, `zero failures`, `keyword presence in FILE`.
- **[COMMAND]** — A shell command or tool invocation that can be run to check the criterion. Must be a literal runnable command in backticks: `` `npm run typecheck` ``, `` `ls path/to/file` ``, `` `grep -c "pattern" file` ``.

<!-- /section: format-spec -->

<!-- section: examples -->
## Good vs Bad Examples

| Bad (vague) | Good (structured) |
|---|---|
| `Code quality is maintained` | `TypeScript types are valid measured by zero new compilation errors verified by \`npm run typecheck\`` |
| `Feature works correctly` | `Format check is active measured by keyword presence in SKILL.md verified by \`grep -c "measured by" skills/verify-plan-criteria/SKILL.md\`` |
| `Performance is acceptable` | `Response time is within threshold measured by p95 < 200ms verified by \`npm run test:perf\`` |
| `File is created` | `Reference file is present measured by file existence verified by \`ls references/acceptance-criteria-patterns.md\`` |
| `Tests pass` | `Test suite passes measured by zero failures verified by \`npm test\`` |

<!-- /section: examples -->

<!-- section: common-patterns -->
## Common Patterns

### File Existence

Use when a task requires creating a file.

```
`path/to/file` is present measured by file existence verified by `ls path/to/file`
```

### Command Passes

Use when a task requires an operation to succeed with no errors.

```
[operation] succeeds measured by zero failures verified by `[command]`
```

### Typecheck

Use when a task touches TypeScript source files.

```
TypeScript types are valid measured by zero new compilation errors verified by `npm run typecheck`
```

### Lint

Use when a task modifies source files that are covered by the linter.

```
Linting passes measured by zero new warnings verified by `npm run lint`
```

### Export Presence

Use when a task requires a new type or function to be exported from a module.

```
`TypeName` is exported measured by export presence verified by `grep "export.*TypeName" path/to/file`
```

### Content Presence

Use when a task requires specific text or a pattern to appear in a file.

```
[content] is present measured by text presence verified by `grep -c "pattern" path/to/file`
```

### Test Suite

Use when a task includes or modifies tests that must pass.

```
[feature] test suite passes measured by zero failures verified by `[test command]`
```

<!-- /section: common-patterns -->

<!-- section: manual-prefix -->
## [MANUAL] Prefix Usage

Some criteria require human judgment that cannot be expressed as a shell command. Prefix these with `[MANUAL]` to exempt them from the format check in verify-plan-criteria.

**When to use [MANUAL]:**

- Visual rendering and layout correctness
- UX behavior that requires interaction
- Prose quality, accuracy, or completeness
- Subjective assessments that no script can reliably verify

**Format:**

```
- [ ] [MANUAL] Description of what a human must verify
```

**Example:**

```
- [ ] [MANUAL] Examples in the reference doc are accurate and cover all common pattern types
```

Criteria marked `[MANUAL]` still appear in the acceptance criteria list and must be checked off before a task is considered complete. They are simply excluded from the automated format verification.

<!-- /section: manual-prefix -->

<!-- section: anti-patterns -->
## Anti-Patterns

| Anti-Pattern | Why It Fails |
|---|---|
| `Code is clean measured by review` | `[COMMAND]` is missing — "review" is not a shell command |
| `Feature is fast measured by performance` | Both `[HOW]` and `[COMMAND]` are vague non-commands |
| `verified by checking the UI` | `[COMMAND]` must be a runnable shell command, not a description |
| `measured by it working correctly` | `[HOW]` must be an observable metric, not circular reasoning |

<!-- /section: anti-patterns -->
