# Session Report: Per-Phase Context Contributors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `context_contributors` section to `analyze-session.py` that tracks which files/tools consume the most token context per lifecycle phase, and expose it in the session report via `SKILL.md`.

**Architecture:** Phase boundaries are detected from `TaskUpdate(in_progress)` events in the tool call loop. Each contributing tool call (Read, Bash, Skill, Task/Agent) is associated with the current phase at the time it was called, then its tool result size is used to estimate tokens (chars ÷ 4). A post-pass aggregates into top-5 contributors per phase. Non-workflow sessions (no TaskUpdate events) get a single `"session"` fallback phase.

**Tech Stack:** Python 3, pytest, standard library only (`collections.defaultdict`, `re`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `skills/session-report/scripts/analyze-session.py` | Modify | Add helper fn, init vars, tool loop branches, result loop, post-pass |
| `skills/session-report/scripts/test_context_contributors.py` | Create | Unit tests for new logic (helper fn, phase detection, aggregation) |
| `skills/session-report/SKILL.md` | Modify | Add `3S` analysis step + `Top Context Contributors` report section |

---

### Task 1: `normalize_contributor_path` helper function

**Acceptance Criteria:**
- [ ] `normalize_contributor_path` function is defined in `analyze-session.py` measured by function presence verified by `grep -n "def normalize_contributor_path" skills/session-report/scripts/analyze-session.py`
- [ ] `test_context_contributors.py` is created measured by file existence verified by `ls skills/session-report/scripts/test_context_contributors.py`
- [ ] All 5 normalize tests pass measured by zero failures verified by `cd skills/session-report/scripts && python -m pytest test_context_contributors.py -k "normalize" -v --tb=short 2>&1 | tail -5`

**Quality Constraints:**
- Error handling: no exceptions — pure string transformation with regex, returns input unchanged on no-match
- Types: `path: str -> str` annotation enforced
- Function length: ≤15 lines
- Pattern: follow existing helper functions (e.g., `parse_timestamp`) in `analyze-session.py`

**Files:**
- Modify: `skills/session-report/scripts/analyze-session.py` (add after existing helper functions, before the `analyze_session` function)
- Create: `skills/session-report/scripts/test_context_contributors.py`

- [ ] **Step 1: Write the failing test**

Create `skills/session-report/scripts/test_context_contributors.py`.

> Note: `analyze-session.py` has a hyphen in the filename so it can't be imported directly. Use `importlib` to load it. The test should fail because `normalize_contributor_path` doesn't exist yet.

```python
import importlib.util
import os

_spec = importlib.util.spec_from_file_location(
    "analyze_session",
    os.path.join(os.path.dirname(__file__), "analyze-session.py"),
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
normalize_contributor_path = _mod.normalize_contributor_path


def test_normalize_user_plugin_cache():
    path = "/Users/alice/.claude/plugins/cache/superpowers/superpowers/5.0.7/skills/writing-plans/SKILL.md"
    assert normalize_contributor_path(path) == "~/.claude/plugins/cache/superpowers/.../writing-plans/SKILL.md"


def test_normalize_project_plugin_cache():
    path = "/Users/alice/Dev/myproject/.claude/plugins/cache/feature-flow/feature-flow/1.37.0/skills/start/SKILL.md"
    assert normalize_contributor_path(path) == "<project>/.claude/plugins/cache/feature-flow/.../start/SKILL.md"


def test_normalize_home_dir():
    path = "/Users/alice/Dev/myproject/src/foo.py"
    assert normalize_contributor_path(path) == "~/Dev/myproject/src/foo.py"


def test_normalize_already_tilde():
    path = "~/some/file.py"
    assert normalize_contributor_path(path) == "~/some/file.py"


def test_normalize_relative():
    path = "skills/session-report/SKILL.md"
    assert normalize_contributor_path(path) == "skills/session-report/SKILL.md"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py -v 2>&1 | head -30
```

Expected: `AttributeError: module 'analyze_session' has no attribute 'normalize_contributor_path'`

- [ ] **Step 3: Add the helper function to `analyze-session.py`**

Add to `analyze-session.py` before the `analyze_session` function (find the line `def analyze_session(` and insert above it):

```python
def normalize_contributor_path(path: str) -> str:
    """Shorten plugin cache paths and replace /Users/<user>/ with ~/."""
    # Plugin cache: .../project/.claude/plugins/cache/owner/name/ver/skills/skill/...
    m = re.match(
        r".+/\.claude/plugins/cache/([^/]+)/[^/]+/[^/]+/skills/([^/]+)/(.+)",
        path,
    )
    if m:
        owner, skill, rest = m.group(1), m.group(2), m.group(3)
        if re.match(r"/Users/[^/]+/\.claude/", path):
            return f"~/.claude/plugins/cache/{owner}/.../{skill}/{rest}"
        else:
            return f"<project>/.claude/plugins/cache/{owner}/.../{skill}/{rest}"
    # Replace /Users/<username>/ with ~/
    return re.sub(r"^/Users/[^/]+/", "~/", path)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py::test_normalize_user_plugin_cache test_context_contributors.py::test_normalize_project_plugin_cache test_context_contributors.py::test_normalize_home_dir test_context_contributors.py::test_normalize_already_tilde test_context_contributors.py::test_normalize_relative -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add skills/session-report/scripts/analyze-session.py skills/session-report/scripts/test_context_contributors.py
git commit -m "feat(session-report): add normalize_contributor_path helper"
```

---

### Task 2: Phase detection — init variables and tool call loop

**Acceptance Criteria:**
- [ ] `current_phase_name` variable is initialized in `analyze_session` measured by variable presence verified by `grep -n "current_phase_name" skills/session-report/scripts/analyze-session.py`
- [ ] `phase_contributors` defaultdict is initialized measured by variable presence verified by `grep -n "phase_contributors" skills/session-report/scripts/analyze-session.py`
- [ ] TaskUpdate branch is present in tool call loop measured by code presence verified by `grep -n 'tool_name == "TaskUpdate"' skills/session-report/scripts/analyze-session.py`
- [ ] `tool_use_phase` is populated for Read/Bash/Skill/Task/Agent calls measured by code presence verified by `grep -n "tool_use_phase\[tc_id\]" skills/session-report/scripts/analyze-session.py`

**Quality Constraints:**
- Error handling: `.get()` with defaults throughout; no KeyError possible from missing keys
- Types: use `defaultdict` for `phase_contributors` and plain `dict` for `tool_use_phase`
- Function length: each new branch ≤15 lines
- Pattern: follow existing `if tool_name == "TaskCreate":` pattern in `analyze-session.py`

**Files:**
- Modify: `skills/session-report/scripts/analyze-session.py`
- Modify: `skills/session-report/scripts/test_context_contributors.py`

- [ ] **Step 1: Write failing tests for phase detection**

Append to `test_context_contributors.py`:

```python
# ── Phase detection helpers ──────────────────────────────────────────────────

def make_message(msg_type, tool_calls=None, tool_results=None):
    """Build a minimal session message dict."""
    m = {"type": msg_type}
    if tool_calls:
        m["toolCalls"] = tool_calls
    if tool_results:
        m["toolResults"] = tool_results
    return m


def make_tc(name, tc_id, inp=None):
    return {"name": name, "id": tc_id, "input": inp or {}}


def make_tr(tool_use_id, content="ok"):
    return {"toolUseId": tool_use_id, "content": content}


def run_phase_detection(messages):
    """Run analyze_session on synthetic messages and return context_contributors."""
    import tempfile, json
    # analyze_session expects {"session": {...}, "messages": [...]}
    data = {
        "session": {"id": "test-session", "contextConsumption": 0, "messageCount": len(messages)},
        "messages": messages,
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        fname = f.name
    result = _mod.analyze_session(fname)
    os.unlink(fname)
    return result.get("context_contributors", {})


def test_phase_detection_single_task():
    """TaskUpdate(in_progress) starts a named phase."""
    messages = [
        make_message("assistant", tool_calls=[
            make_tc("TaskCreate", "tc1", {"subject": "Build feature"}),
        ]),
        make_message("user", tool_results=[
            make_tr("tc1", "Task #1 created successfully: Build feature"),
        ]),
        make_message("assistant", tool_calls=[
            make_tc("TaskUpdate", "tu1", {"taskId": "1", "status": "in_progress"}),
        ]),
        make_message("user", tool_results=[make_tr("tu1", "ok")]),
        make_message("assistant", tool_calls=[
            make_tc("Read", "r1", {"file_path": "/Users/test/file.py"}),
        ]),
        make_message("user", tool_results=[make_tr("r1", "x" * 400)]),
    ]
    cc = run_phase_detection(messages)
    phases = cc.get("phases", {})
    assert "Build feature" in phases, f"Expected 'Build feature' in {list(phases.keys())}"


def test_phase_fallback_no_tasks():
    """Sessions with no TaskUpdate events get a single 'session' phase."""
    messages = [
        make_message("assistant", tool_calls=[
            make_tc("Read", "r1", {"file_path": "/Users/test/file.py"}),
        ]),
        make_message("user", tool_results=[make_tr("r1", "x" * 400)]),
    ]
    cc = run_phase_detection(messages)
    phases = cc.get("phases", {})
    assert "session" in phases, f"Expected fallback 'session' phase in {list(phases.keys())}"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py::test_phase_detection_single_task test_context_contributors.py::test_phase_fallback_no_tasks -v 2>&1 | tail -10
```

Expected: Tests fail (KeyError or AssertionError — `context_contributors` not yet in output)

- [ ] **Step 3: Add init variables in `analyze_session` function**

In `analyze-session.py`, find the `# Lifecycle tasks` comment block (around line 444). After `tasks_created = []`, add:

```python
    # Context contributors — phase-attributed token estimation
    task_create_id_to_subject = {}   # tool_use_id of TaskCreate -> subject str
    task_id_to_subject = {}          # task #N str -> subject str
    tool_use_phase = {}              # tool_use_id -> (phase_name, contributor_key)
    current_phase_name = "startup"
    current_phase_id = None
    phase_contributors = defaultdict(
        lambda: defaultdict(lambda: {"count": 0, "tokens": 0})
    )
```

- [ ] **Step 4: Add TaskCreate and TaskUpdate branches in tool call loop**

In `analyze-session.py`, find the `# TaskCreate` block (around line 801):

```python
            # TaskCreate
            if tool_name == "TaskCreate":
                tasks_created.append(inp.get("subject", "unknown"))
```

Replace with:

```python
            # TaskCreate
            if tool_name == "TaskCreate":
                subject = inp.get("subject", "unknown")
                tasks_created.append(subject)
                tc_id = tc.get("id", "")
                if tc_id:
                    task_create_id_to_subject[tc_id] = subject

            # TaskUpdate — phase boundary detection
            if tool_name == "TaskUpdate":
                status = inp.get("status", "")
                task_id = str(inp.get("taskId", ""))
                if status == "in_progress":
                    phase_name = task_id_to_subject.get(task_id, f"task-{task_id}")
                    current_phase_name = phase_name
                    current_phase_id = task_id
                elif status in ("completed", "deleted", "cancelled"):
                    current_phase_name = "startup"
                    current_phase_id = None
```

- [ ] **Step 5: Add contributor key recording for Read/Bash/Skill/Task/Agent in tool call loop**

In `analyze-session.py`, find the `# File reads` block (around line 795):

```python
            # File reads
            if tool_name == "Read":
                file_path = inp.get("file_path", "")
                if file_path:
                    file_read_counts[file_path] += 1
```

After this block (and before `# TaskCreate`), add:

```python
            # Context contributor attribution — record tool call -> phase mapping
            contributor_key = None
            if tool_name == "Read":
                raw_path = inp.get("file_path", "")
                if raw_path:
                    contributor_key = normalize_contributor_path(raw_path)
            elif tool_name == "Bash":
                cmd = inp.get("command", "") if isinstance(inp, dict) else str(inp)
                contributor_key = "Bash: " + cmd[:60].replace("\n", " ")
            elif tool_name == "Skill":
                contributor_key = "Skill: " + inp.get("skill", "unknown")
            elif tool_name in ("Task", "Agent"):
                desc = inp.get("description", inp.get("prompt", "unknown"))
                contributor_key = tool_name + ": " + str(desc)[:60]
            if contributor_key:
                tc_id = tc.get("id", "")
                if tc_id:
                    tool_use_phase[tc_id] = (current_phase_name, contributor_key)
```

- [ ] **Step 6: Verify implementation compiles**

```bash
cd skills/session-report/scripts && python -c "import importlib.util, os; s=importlib.util.spec_from_file_location('a', 'analyze-session.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print('OK')"
```

Expected: `OK` — no syntax errors. The phase detection tests will remain red until Task 4 adds the post-pass that emits `context_contributors`. Do not commit yet — wait for Task 4.

---

### Task 3: TaskCreate result parsing and token accumulation in tool result loop

**Acceptance Criteria:**
- [ ] `task_id_to_subject` is populated from TaskCreate results measured by code presence verified by `grep -n "task_id_to_subject\[" skills/session-report/scripts/analyze-session.py`
- [ ] `tool_result_total_tokens` accumulator is incremented in tool result loop measured by code presence verified by `grep -n "tool_result_total_tokens" skills/session-report/scripts/analyze-session.py`
- [ ] Token attribution to `phase_contributors` is present in tool result loop measured by code presence verified by `grep -c "phase_contributors\[phase_name\]\[contributor_key\]" skills/session-report/scripts/analyze-session.py`

**Quality Constraints:**
- Error handling: `str(content) if content else ""` fallback for unexpected content types; regex `re.search` used (not `re.match`) for TaskCreate result ID extraction
- Types: `result_token_estimate: int` from integer division (`// 4`)
- Function length: new block within tool result loop ≤20 lines
- Pattern: follow existing dual-format content extraction pattern (lines 903-911) in `analyze-session.py`

**Files:**
- Modify: `skills/session-report/scripts/analyze-session.py`
- Modify: `skills/session-report/scripts/test_context_contributors.py`

- [ ] **Step 1: Write failing test for token accumulation**

Append to `test_context_contributors.py`:

```python
def test_token_accumulation_read():
    """Read result tokens are estimated and attributed to current phase."""
    messages = [
        make_message("assistant", tool_calls=[
            make_tc("TaskCreate", "tc1", {"subject": "Phase A"}),
        ]),
        make_message("user", tool_results=[
            make_tr("tc1", "Task #1 created successfully: Phase A"),
        ]),
        make_message("assistant", tool_calls=[
            make_tc("TaskUpdate", "tu1", {"taskId": "1", "status": "in_progress"}),
        ]),
        make_message("user", tool_results=[make_tr("tu1", "ok")]),
        make_message("assistant", tool_calls=[
            make_tc("Read", "r1", {"file_path": "/Users/test/bigfile.py"}),
        ]),
        make_message("user", tool_results=[make_tr("r1", "x" * 4000)]),
    ]
    cc = run_phase_detection(messages)
    phases = cc.get("phases", {})
    assert "Phase A" in phases
    contributors = phases["Phase A"]
    assert len(contributors) > 0
    top = contributors[0]
    assert top["tokens"] == 1000  # 4000 chars // 4


def test_token_accumulation_bash():
    """Bash result tokens attributed to phase."""
    messages = [
        make_message("assistant", tool_calls=[
            make_tc("TaskCreate", "tc1", {"subject": "Build"}),
        ]),
        make_message("user", tool_results=[
            make_tr("tc1", "Task #1 created successfully: Build"),
        ]),
        make_message("assistant", tool_calls=[
            make_tc("TaskUpdate", "tu1", {"taskId": "1", "status": "in_progress"}),
        ]),
        make_message("user", tool_results=[make_tr("tu1", "ok")]),
        make_message("assistant", tool_calls=[
            make_tc("Bash", "b1", {"command": "ls -la /src"}),
        ]),
        make_message("user", tool_results=[make_tr("b1", "y" * 800)]),
    ]
    cc = run_phase_detection(messages)
    phases = cc.get("phases", {})
    assert "Build" in phases
    contributor = phases["Build"][0]
    assert contributor["key"].startswith("Bash: ls -la /src")
    assert contributor["tokens"] == 200  # 800 // 4


def test_tool_result_estimated_tokens_total():
    """tool_result_estimated_tokens is the sum of all result tokens."""
    messages = [
        make_message("assistant", tool_calls=[
            make_tc("Read", "r1", {"file_path": "/Users/test/a.py"}),
        ]),
        make_message("user", tool_results=[make_tr("r1", "a" * 4000)]),
        make_message("assistant", tool_calls=[
            make_tc("Read", "r2", {"file_path": "/Users/test/b.py"}),
        ]),
        make_message("user", tool_results=[make_tr("r2", "b" * 2000)]),
    ]
    cc = run_phase_detection(messages)
    assert cc.get("tool_result_estimated_tokens") == 1500  # (4000 + 2000) // 4
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py::test_token_accumulation_read test_context_contributors.py::test_token_accumulation_bash test_context_contributors.py::test_tool_result_estimated_tokens_total -v 2>&1 | tail -10
```

Expected: All 3 fail (context_contributors not in report yet)

- [ ] **Step 3: Add TaskCreate result parsing in tool result loop**

In `analyze-session.py`, find the tool results loop (around line 894):

```python
        # --- Tool results (user messages containing results) ---
        for tr in m.get("toolResults", []):
            tool_use_id = tr.get("toolUseId", "")

            # Subagent metrics from Task results
            if tool_use_id in tool_call_index:
```

Right after `tool_use_id = tr.get("toolUseId", "")`, add:

```python
            # Context contributor: accumulate tokens and parse TaskCreate results
            content = tr.get("content", "")
            if isinstance(content, list):
                result_text = " ".join(
                    c.get("text", "")
                    for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                )
            else:
                result_text = str(content) if content else ""
            result_token_estimate = len(result_text) // 4

            # Parse TaskCreate result to populate task_id_to_subject
            if tool_use_id in task_create_id_to_subject:
                subject = task_create_id_to_subject[tool_use_id]
                id_match = re.search(r"Task #(\d+) created successfully", result_text)
                if id_match:
                    task_id_to_subject[id_match.group(1)] = subject

            # Accumulate tokens for contributor attribution
            if tool_use_id in tool_use_phase:
                phase_name, contributor_key = tool_use_phase[tool_use_id]
                phase_contributors[phase_name][contributor_key]["count"] += 1
                phase_contributors[phase_name][contributor_key]["tokens"] += result_token_estimate

```

Also add a running total tracker. In the init variables (after `phase_contributors = ...`), add:

```python
    tool_result_total_tokens = 0
```

Then in the tool result loop, after `result_token_estimate = len(result_text) // 4`:

```python
            tool_result_total_tokens += result_token_estimate
```

- [ ] **Step 4: Verify implementation compiles**

```bash
cd skills/session-report/scripts && python -c "import importlib.util, os; s=importlib.util.spec_from_file_location('a', 'analyze-session.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print('OK')"
```

Expected: `OK` — no syntax errors. All token accumulation tests remain red until Task 4 emits `context_contributors`. Do not commit yet — wait for Task 4.

---

### Task 4: Post-pass aggregation — build `context_contributors` output

**Acceptance Criteria:**
- [ ] `report["context_contributors"]` is assigned in `analyze_session` measured by key assignment verified by `grep -n 'report\["context_contributors"\]' skills/session-report/scripts/analyze-session.py`
- [ ] Output dict includes all four keys measured by key presence verified by `grep -c '"tool_result_estimated_tokens"\|"calibration_note"\|"phase_summary"\|"phases"' skills/session-report/scripts/analyze-session.py`
- [ ] All context contributor tests pass measured by zero failures verified by `cd skills/session-report/scripts && python -m pytest test_context_contributors.py -v --tb=short 2>&1 | tail -5`

**Quality Constraints:**
- Error handling: empty `phase_contributors` produces empty `phases_output`; fallback to `"session"` phase only when no named phases exist
- Types: `phases_output: dict[str, list[dict]]`, `phase_summary: dict[str, int]`
- Function length: post-pass block ≤30 lines
- Pattern: follow existing `file_read_redundancy` post-pass block pattern in `analyze-session.py`

**Files:**
- Modify: `skills/session-report/scripts/analyze-session.py`

- [ ] **Step 1: Add `context_contributors` post-pass**

In `analyze-session.py`, find the `# --- File read redundancy ---` post-pass block (around line 1224). Add a new block immediately after the `file_read_redundancy` block closes (after `}`):

```python
    # --- Context contributors ---
    phases_output = {}
    for phase_name, contributors in phase_contributors.items():
        sorted_contribs = sorted(
            contributors.items(),
            key=lambda x: x[1]["tokens"],
            reverse=True,
        )[:5]
        phases_output[phase_name] = [
            {"key": k, "count": v["count"], "tokens": v["tokens"]}
            for k, v in sorted_contribs
        ]

    # Fallback: non-workflow sessions with no task phases
    if not phases_output:
        # Aggregate all tracked tool results under a single "session" phase
        session_contributors = defaultdict(lambda: {"count": 0, "tokens": 0})
        for tc_id, (phase_name, contributor_key) in tool_use_phase.items():
            # phase_name will be "startup" for all (current_phase_name never changed)
            if tc_id in tool_use_phase:
                _, ck = tool_use_phase[tc_id]
                # Look up actual token value from phase_contributors["startup"]
                entry = phase_contributors.get("startup", {}).get(ck)
                if entry:
                    session_contributors[ck]["count"] += entry["count"]
                    session_contributors[ck]["tokens"] += entry["tokens"]
        if session_contributors:
            sorted_session = sorted(
                session_contributors.items(),
                key=lambda x: x[1]["tokens"],
                reverse=True,
            )[:5]
            phases_output["session"] = [
                {"key": k, "count": v["count"], "tokens": v["tokens"]}
                for k, v in sorted_session
            ]

    phase_summary = {
        phase: sum(c["tokens"] for c in contribs)
        for phase, contribs in phases_output.items()
    }

    report["context_contributors"] = {
        "phases": phases_output,
        "phase_summary": phase_summary,
        "tool_result_estimated_tokens": tool_result_total_tokens,
        "calibration_note": "Token counts are estimated as len(result_text) // 4.",
    }
```

- [ ] **Step 2: Run all context contributor tests**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py -v 2>&1 | tail -20
```

Expected: All tests pass. If any fail, debug and fix before continuing.

- [ ] **Step 3: Fix the fallback phase logic**

The fallback above has a bug: the `phase_contributors` dict uses `"startup"` as the phase name (since `current_phase_name` defaults to `"startup"`), but we want the fallback to present as `"session"`. Instead of the complex lookup, simplify:

Replace the fallback block with:

```python
    # Fallback: non-workflow sessions — rename "startup" phase to "session"
    if not phases_output and "startup" in phase_contributors:
        sorted_session = sorted(
            phase_contributors["startup"].items(),
            key=lambda x: x[1]["tokens"],
            reverse=True,
        )[:5]
        phases_output["session"] = [
            {"key": k, "count": v["count"], "tokens": v["tokens"]}
            for k, v in sorted_session
        ]
```

- [ ] **Step 4: Re-run all tests**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py -v 2>&1
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/session-report/scripts/analyze-session.py
git commit -m "feat(session-report): add context_contributors post-pass aggregation"
```

---

### Task 5: SKILL.md additions

**Acceptance Criteria:**
- [ ] `### 3S: Top Context Contributors` section is present in SKILL.md measured by section heading existence verified by `grep -n "3S: Top Context Contributors" skills/session-report/SKILL.md`
- [ ] `### Top Context Contributors` report section is present in SKILL.md measured by section heading existence verified by `grep -n "### Top Context Contributors" skills/session-report/SKILL.md`
- [ ] `### 3S` appears after `### 3R` in SKILL.md measured by line order verified by `grep -n "### 3R\|### 3S" skills/session-report/SKILL.md`
- [ ] `## Tool Performance` heading is still present (unchanged) measured by heading existence verified by `grep -n "^## Tool Performance" skills/session-report/SKILL.md`

**Quality Constraints:**
- Exempt from error handling/type constraints — documentation only
- Pattern: follow existing section heading and formatting style in SKILL.md (e.g., `### 3R: Out-of-Scope Findings`, `### Thinking Patterns`)

**Files:**
- Modify: `skills/session-report/SKILL.md`

- [ ] **Step 1: Add `### 3S: Top Context Contributors` analysis step**

In `SKILL.md`, find `### 3R: Out-of-Scope Findings` and the `---` that follows it (around line 310-317). After the content of `3R` ends and before `---`, insert a new subsection:

Find the exact marker after 3R ends:

```
### 3R: Out-of-Scope Findings

For each item in `out_of_scope_findings`:
1. Read the snippet and surrounding context
2. Classify severity: **High** (breaks functionality), **Medium** (degrades quality), **Low** (cosmetic/minor tech debt)
3. Recommend: "File issue" / "Add to backlog" / "Ignore"

---
```

Replace with:

```
### 3R: Out-of-Scope Findings

For each item in `out_of_scope_findings`:
1. Read the snippet and surrounding context
2. Classify severity: **High** (breaks functionality), **Medium** (degrades quality), **Low** (cosmetic/minor tech debt)
3. Recommend: "File issue" / "Add to backlog" / "Ignore"

### 3S: Top Context Contributors

From `context_contributors` in the script output:

- **`tool_result_estimated_tokens`:** Report this as the total estimated context consumed by tool results session-wide (tokens ≈ chars ÷ 4). Annotate with the `calibration_note`.
- **Per phase (`phases`):** For each phase in `phases`, list the top contributors in descending token order. Format each contributor as "`<key>` — <count> call(s), ~<tokens> tokens".
- **`phase_summary`:** Report total estimated tokens per phase to show which lifecycle phase consumed the most context.
- **If only `"session"` phase is present:** Omit phase labeling — just report the top contributors as a flat list with the header "Top contributors (session-wide)".
- **Threshold:** Only include a phase section if it has at least one contributor with `tokens > 0`. Skip phases with no attributed results.

---
```

- [ ] **Step 2: Add `### Top Context Contributors` section to report template**

In `SKILL.md`, find the `### Thinking Patterns` section and the `---` that follows it (around lines 452-460):

```
### Thinking Patterns

> Include only if `thinking_blocks.count > 3` or notable signals detected.

- **Thinking blocks:** <count>
- **Key signals:** <planning> planning, <alternatives> alternative explorations, <direction_change> direction changes, <uncertainty> uncertainty markers
- <Interpretation per 3K>

---

## Tool Performance
```

Replace the `---` separator (the one between Thinking Patterns and Tool Performance) so the new section appears between them:

```
### Thinking Patterns

> Include only if `thinking_blocks.count > 3` or notable signals detected.

- **Thinking blocks:** <count>
- **Key signals:** <planning> planning, <alternatives> alternative explorations, <direction_change> direction changes, <uncertainty> uncertainty markers
- <Interpretation per 3K>

### Top Context Contributors

> Include only if `context_contributors.phases` is non-empty and at least one contributor has `tokens > 0`.

**Total tool result context:** ~<tool_result_estimated_tokens> tokens (<calibration_note>)

**By phase (top 5 each):**

| Phase | Contributor | Calls | ~Tokens |
|---|---|---:|---:|
| <phase_name> | `<key>` | <count> | <tokens> |

**Phase totals:**

| Phase | ~Tokens |
|---|---:|
| <phase_name> | <tokens> |

<Interpretation per 3S: highlight the phase consuming the most context, flag any single contributor using >30% of a phase's token budget as a "context hot spot".>

---

## Tool Performance
```

- [ ] **Step 3: Verify SKILL.md is well-formed**

```bash
grep -n "### 3S\|### Top Context Contributors\|## Tool Performance\|## Quality Signals" skills/session-report/SKILL.md
```

Expected output includes:
- `### 3S: Top Context Contributors` (in Step 3 analysis section)
- `### Top Context Contributors` (in Quality Signals section)
- `## Tool Performance` (unchanged)

- [ ] **Step 4: Commit**

```bash
git add skills/session-report/SKILL.md
git commit -m "feat(session-report): add 3S analysis step and Top Context Contributors report section"
```

---

### Task 6: End-to-end smoke test with a synthetic session JSON

**Acceptance Criteria:**
- [ ] All context contributor tests pass measured by zero failures verified by `cd skills/session-report/scripts && python -m pytest test_context_contributors.py -v --tb=short 2>&1 | tail -5`
- [ ] `context_contributors` key is present in `analyze-session.py` output on a minimal synthetic session measured by key presence verified by `python3 -c "import json,tempfile,os,importlib.util; s=importlib.util.spec_from_file_location('a','skills/session-report/scripts/analyze-session.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); data={'session':{'id':'t','contextConsumption':0,'messageCount':2},'messages':[{'type':'assistant','toolCalls':[{'name':'Read','id':'r1','input':{'file_path':'/tmp/a.py'}}]},{'type':'user','toolResults':[{'toolUseId':'r1','content':'x'*400}]}]}; f=tempfile.mktemp(suffix='.json'); open(f,'w').write(json.dumps(data)); r=m.analyze_session(f); os.unlink(f); print('PASS' if 'context_contributors' in r else 'FAIL')"`
- [ ] Fallback `"session"` phase appears for sessions with no TaskUpdate events measured by phase key presence in output (verified by smoke test Step 3 passing)

**Quality Constraints:**
- Exempt — this is a verification-only step, no production code written

> Note: `analyze-session.py` reads a pre-processed `{"session": {...}, "messages": [...]}` JSON file — NOT raw `.jsonl` files from `~/.claude/projects/`. The integration test creates a minimal synthetic session JSON and runs the script against it.

**Files:**
- No file modifications needed — this is a verification step only.

- [ ] **Step 1: Create a synthetic session JSON with two phases**

```bash
python3 -c "
import json, tempfile, os

data = {
    'session': {'id': 'smoke-test', 'contextConsumption': 0, 'messageCount': 8},
    'messages': [
        {'type': 'assistant', 'toolCalls': [
            {'name': 'TaskCreate', 'id': 'tc1', 'input': {'subject': 'Implement feature'}},
        ]},
        {'type': 'user', 'toolResults': [
            {'toolUseId': 'tc1', 'content': 'Task #1 created successfully: Implement feature'},
        ]},
        {'type': 'assistant', 'toolCalls': [
            {'name': 'TaskUpdate', 'id': 'tu1', 'input': {'taskId': '1', 'status': 'in_progress'}},
        ]},
        {'type': 'user', 'toolResults': [{'toolUseId': 'tu1', 'content': 'ok'}]},
        {'type': 'assistant', 'toolCalls': [
            {'name': 'Read', 'id': 'r1', 'input': {'file_path': '/Users/weee/Dev/project/src/main.py'}},
        ]},
        {'type': 'user', 'toolResults': [
            {'toolUseId': 'r1', 'content': 'x' * 8000},
        ]},
        {'type': 'assistant', 'toolCalls': [
            {'name': 'Bash', 'id': 'b1', 'input': {'command': 'pytest tests/ -v'}},
        ]},
        {'type': 'user', 'toolResults': [
            {'toolUseId': 'b1', 'content': 'y' * 2000},
        ]},
    ]
}
with open('/tmp/smoke-session.json', 'w') as f:
    json.dump(data, f)
print('Wrote /tmp/smoke-session.json')
"
```

- [ ] **Step 2: Run `analyze-session.py` on the synthetic file**

```bash
cd /Users/weee/Dev/feature-flow/.worktrees/session-report-context-contributors-0f44 && \
python3 skills/session-report/scripts/analyze-session.py /tmp/smoke-session.json 2>&1 | \
python3 -c "
import sys, json
d = json.load(sys.stdin)
cc = d.get('context_contributors', {})
print('context_contributors present:', 'context_contributors' in d)
print('phases:', list(cc.get('phases', {}).keys()))
print('total_tokens:', cc.get('tool_result_estimated_tokens', 0))
for p, contribs in cc.get('phases', {}).items():
    print(f'  {p}: {contribs[:2]}')
"
```

Expected output:
```
context_contributors present: True
phases: ['Implement feature']
total_tokens: 2500
  Implement feature: [{'key': '~/Dev/project/src/main.py', 'count': 1, 'tokens': 2000}, {'key': 'Bash: pytest tests/ -v', 'count': 1, 'tokens': 500}]
```

Verify:
1. `context_contributors present: True`
2. At least one phase is present
3. Token counts are non-zero integers
4. No `KeyError` or traceback in stderr

- [ ] **Step 3: Smoke test the fallback "session" phase (no TaskUpdate events)**

```bash
python3 -c "
import json
data = {
    'session': {'id': 'smoke-nophase', 'contextConsumption': 0, 'messageCount': 2},
    'messages': [
        {'type': 'assistant', 'toolCalls': [
            {'name': 'Read', 'id': 'r1', 'input': {'file_path': '/Users/weee/Dev/foo.py'}},
        ]},
        {'type': 'user', 'toolResults': [{'toolUseId': 'r1', 'content': 'z' * 1200}]},
    ]
}
with open('/tmp/smoke-nophase.json', 'w') as f:
    json.dump(data, f)
print('Wrote /tmp/smoke-nophase.json')
" && \
cd /Users/weee/Dev/feature-flow/.worktrees/session-report-context-contributors-0f44 && \
python3 skills/session-report/scripts/analyze-session.py /tmp/smoke-nophase.json 2>&1 | \
python3 -c "import sys,json; d=json.load(sys.stdin); cc=d.get('context_contributors',{}); print('phases:', list(cc.get('phases',{}).keys()))"
```

Expected: `phases: ['session']`

- [ ] **Step 4: Run the full test suite one final time**

```bash
cd skills/session-report/scripts && python -m pytest test_context_contributors.py -v
```

Expected: All tests pass.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test(session-report): smoke-verified context_contributors on synthetic sessions"
```

---

## Self-Review

**Spec coverage check:**
- [x] Phase detection via TaskUpdate(in_progress) → `current_phase_name` update
- [x] Fallback "session" phase for non-workflow sessions
- [x] Token estimation: `len(result_text) // 4`
- [x] Contributor types: Read (normalized path), Bash (truncated cmd), Skill (name), Task/Agent (description)
- [x] Top-5 per phase
- [x] `phase_summary` dict
- [x] `tool_result_estimated_tokens` (renamed from `session_total`)
- [x] `calibration_note`
- [x] Path normalization for `~/.claude/plugins/cache/` AND `<project>/.claude/plugins/cache/`
- [x] SKILL.md `3S` subsection added after `3R`
- [x] SKILL.md `### Top Context Contributors` inside `## Quality Signals`
- [x] TaskCreate result parsing to build `task_id_to_subject` (enables named phases)
- [x] camelCase field names throughout (`toolCalls`, `toolResults`, `toolUseId`)
- [x] Bash included in contributor types

**Placeholder scan:** None found.

**Type consistency:** `normalize_contributor_path(path: str) -> str` used consistently in Tasks 1, 3. `phase_contributors` structure `{phase_name: {contributor_key: {count, tokens}}}` consistent across Tasks 2, 3, 4. Output structure `{phases, phase_summary, tool_result_estimated_tokens, calibration_note}` consistent in Task 4 and Task 5 SKILL.md template.
