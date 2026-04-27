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


# ── Token accumulation tests ─────────────────────────────────────────────────

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


def test_phase_summary_counts_all_contributors():
    """phase_summary includes ALL contributors, not just top-5."""
    # Build 7 distinct files each returning 400 chars → 100 tokens each
    messages = []
    for i in range(7):
        messages.append(make_message("assistant", tool_calls=[
            make_tc("Read", f"r{i}", {"file_path": f"/Users/test/file{i}.py"}),
        ]))
        messages.append(make_message("user", tool_results=[make_tr(f"r{i}", "x" * 400)]))
    cc = run_phase_detection(messages)
    # phases["session"] has only top 5, but phase_summary must reflect all 7
    assert cc.get("phase_summary", {}).get("session") == 700  # 7 * 100
    assert len(cc.get("phases", {}).get("session", [])) == 5  # capped at 5


def test_hybrid_startup_and_named_phase():
    """Tool calls before first TaskUpdate are kept under 'startup' phase."""
    messages = [
        make_message("assistant", tool_calls=[
            make_tc("Read", "r0", {"file_path": "/Users/test/issue.md"}),
        ]),
        make_message("user", tool_results=[make_tr("r0", "x" * 4000)]),
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
            make_tc("Read", "r1", {"file_path": "/Users/test/code.py"}),
        ]),
        make_message("user", tool_results=[make_tr("r1", "y" * 2000)]),
    ]
    cc = run_phase_detection(messages)
    phases = cc.get("phases", {})
    assert "startup" in phases, f"startup contributors dropped! phases={list(phases.keys())}"
    assert "Build" in phases
