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
