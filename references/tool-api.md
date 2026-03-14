# Tool API Reference

Canonical reference for tool invocation syntax in feature-flow skills. When a skill says "see `references/tool-api.md`", use the exact parameter names and patterns documented here. Do NOT guess or invent parameter names.

## Task Tool (dispatch subagents)

Launches a specialized agent to handle a subtask. Returns a result message when the agent completes.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subagent_type` | string | Yes | Agent type to dispatch. Must be a valid agent (see below). |
| `prompt` | string | Yes | Detailed instructions for the agent. |
| `description` | string | Yes | Short (3-5 word) summary. |
| `model` | `"haiku"` \| `"sonnet"` \| `"opus"` | No | Model override. Defaults to parent model. |
| `isolation` | `"worktree"` | No | Run in isolated git worktree. |
| `run_in_background` | boolean | No | Run without blocking. |

**Valid `subagent_type` values (common in feature-flow):**

- `"Explore"` — Read-only codebase exploration (Glob, Grep, Read, Bash). Use for pattern study, codebase analysis, verification. **Default model: `haiku`** (see Recommended Model Defaults below).
- `"general-purpose"` — Full tool access including Write, Edit, Bash. Use for experiments, implementation, tasks needing write access.
- `"feature-flow:task-verifier"` — Verify acceptance criteria against the codebase.
- `"superpowers:code-reviewer"` — Code review against coding standards.
- `"pr-review-toolkit:code-simplifier"` — Direct-fix code simplification.
- `"pr-review-toolkit:silent-failure-hunter"` — Direct-fix silent failure detection.
- `"feature-dev:code-reviewer"` — Bug and convention review (report mode).
- `"pr-review-toolkit:pr-test-analyzer"` — Test coverage analysis.
- `"pr-review-toolkit:type-design-analyzer"` — Type design review.
- `"backend-api-security:backend-security-coder"` — Security review.
- `"Plan"` — Architecture and planning agent.

**Common mistakes — do NOT do these:**

- Do NOT use tool names as `subagent_type` values (e.g., `"TodoWrite"`, `"TaskCreate"`, `"Skill"` are NOT valid agent types)
- Do NOT use `type` instead of `subagent_type`
- Do NOT use `agent` or `agent_type` instead of `subagent_type`

**Examples:**

```
Task(subagent_type: "Explore", model: "haiku", description: "Study API patterns", prompt: "Read files in src/api/ and extract...")
Task(subagent_type: "general-purpose", model: "sonnet", isolation: "worktree", description: "Run spike experiment", prompt: "Test whether...")
Task(subagent_type: "feature-flow:task-verifier", description: "Verify acceptance criteria", prompt: "Verify the following...")
```

### Recommended Model Defaults

**Always set `model` explicitly.** Omitting it causes agents to inherit the parent model, which wastes cost when the orchestrator is Opus (the default). This is enforced by a PreToolUse hook that blocks Task/Agent dispatches without an explicit `model` parameter.

| `subagent_type` | Recommended Model | Rationale |
|-----------------|-------------------|-----------|
| `"Explore"` | `haiku` | Read-only; no advanced reasoning needed |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning |

**Override guidance:** Use `sonnet` for Explore agents that do substantive analysis (e.g., design-verification batch agents). Use `opus` for implementation agents handling architectural complexity. For the full orchestrator-level phase table and override conditions, see the Model Routing Defaults section in `skills/start/SKILL.md`.

## Skill Tool (invoke a skill)

Executes a skill within the current conversation. Skills provide specialized workflows.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skill` | string | Yes | Skill name (e.g., `"superpowers:brainstorming"`). |
| `args` | string | No | Arguments passed to the skill. |

**Common mistakes — do NOT do these:**

- Do NOT use `skill_name` instead of `skill`
- Do NOT use `arguments` instead of `args`
- Do NOT use `name` instead of `skill`

**Examples:**

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: feature. Build CSV export")
Skill(skill: "feature-flow:design-document", args: "express: true. scope: small enhancement.")
Skill(skill: "feature-flow:verify-plan-criteria")
```

## Deferred Tools (must load before use)

These tools are NOT available until loaded via `ToolSearch`. Calling them without loading first will fail.

**Loading pattern:** Call `ToolSearch(query: "select:<tool_name>")` before first use. Once loaded, the tool remains available for the rest of the conversation.

| Tool | Purpose | Load command |
|------|---------|-------------|
| `TaskCreate` | Create a todo/task item | `ToolSearch(query: "select:TaskCreate")` |
| `TaskUpdate` | Update task status (pending/in_progress/completed) | `ToolSearch(query: "select:TaskUpdate")` |
| `TaskList` | List all tasks | `ToolSearch(query: "select:TaskList")` |
| `TaskGet` | Get a specific task | `ToolSearch(query: "select:TaskGet")` |
| `AskUserQuestion` | Present a question with options to the user | `ToolSearch(query: "select:AskUserQuestion")` |
| `WebFetch` | Fetch a URL | `ToolSearch(query: "select:WebFetch")` |
| `WebSearch` | Search the web | `ToolSearch(query: "select:WebSearch")` |
| `EnterWorktree` | Enter a git worktree context | `ToolSearch(query: "select:EnterWorktree")` |

**Common mistakes — do NOT do these:**

- Do NOT call a deferred tool without loading it via ToolSearch first
- Do NOT use the Task tool with `subagent_type: "TodoWrite"` to create tasks — use the `TaskCreate` deferred tool instead
- Do NOT confuse deferred tools with Task subagent types — they are completely different systems

**Batch loading:** You can load multiple deferred tools in parallel by making multiple `ToolSearch` calls in a single message.

## Context7 MCP Tools (documentation lookup)

Context7 is an MCP plugin for querying up-to-date library documentation. Its tools are MCP-provided and must be verified as available before use.

**Availability check:** Before using Context7 tools, verify the plugin is loaded by checking for `mcp__plugin_context7_context7__resolve-library-id` in available tools (use `ToolSearch` if needed). If not available, skip any Context7 operations and announce: "Context7 not available — skipping documentation lookup."

**Tools:**

### `mcp__plugin_context7_context7__resolve-library-id`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryName` | string | Yes | Library name to search for (e.g., `"next.js"`, `"supabase-js"`) |
| `query` | string | Yes | What you need to accomplish — used to rank results by relevance |

### `mcp__plugin_context7_context7__query-docs`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryId` | string | Yes | Context7 library ID in format `/org/project` (from `resolve-library-id` or `.feature-flow.yml`) |
| `query` | string | Yes | Specific question or topic (e.g., `"server actions error handling"`) |

**Usage pattern:**

1. Check `.feature-flow.yml` for `context7` field with library IDs
2. Verify Context7 MCP plugin is available (not just that the field exists)
3. Use `resolve-library-id` if you need to find a library
4. Use `query-docs` with a focused query string

**Common mistakes — do NOT do these:**

- Do NOT assume Context7 is available just because `.feature-flow.yml` has a `context7` field — the plugin must also be loaded
- Do NOT call Context7 tools without checking availability first
- Do NOT use `context7CompatibleLibraryID` as a parameter name — the correct parameter is `libraryId`
- Do NOT omit `libraryName` when calling `resolve-library-id` — both `libraryName` and `query` are required
