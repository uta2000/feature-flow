import argparse
from unittest.mock import patch

import pytest

from dispatcher.config import load_config


def _args(**overrides):
    defaults = {
        "issues": None, "label": None, "repo": None, "auto": False,
        "config": "nonexistent.yml", "dry_run": False, "resume": None,
        "limit": None, "verbose": False, "max_parallel": None,
    }
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


def test_load_config_from_yaml(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\ndefault_label: custom-label\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file)))
    assert cfg.plugin_path == "/test/path"
    assert cfg.default_label == "custom-label"


def test_cli_overrides_yaml(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\ndefault_label: yaml-label\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file), label="cli-label"))
    assert cfg.default_label == "cli-label"


def test_missing_yaml_generates_config(tmp_path):
    cfg_file = tmp_path / ".dispatcher" / "config.yml"
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        with patch("dispatcher.config._detect_plugin_path", return_value="/detected/plugins"):
            cfg = load_config(_args(config=str(cfg_file)))
    assert cfg.plugin_path == "/detected/plugins"
    assert cfg.repo == "owner/repo"
    assert cfg_file.exists()


def test_missing_yaml_no_plugin_path_exits(tmp_path):
    cfg_file = tmp_path / ".dispatcher" / "config.yml"
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        with patch("dispatcher.config._detect_plugin_path", return_value=""):
            with pytest.raises(SystemExit):
                load_config(_args(config=str(cfg_file)))


def test_missing_plugin_path_exits(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("default_label: test\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        with pytest.raises(SystemExit):
            load_config(_args(config=str(cfg_file)))


def test_issues_parsed(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file), issues="42,43,51"))
    assert cfg.issues == [42, 43, 51]


def test_yaml_max_parallel_loaded(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\nmax_parallel: 8\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file)))
    assert cfg.max_parallel == 8


def test_cli_max_parallel_overrides_yaml(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\nmax_parallel: 8\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file), max_parallel=6))
    assert cfg.max_parallel == 6
