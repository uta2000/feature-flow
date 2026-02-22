from dispatcher.cli import build_parser


def test_parser_defaults():
    parser = build_parser()
    args = parser.parse_args([])
    assert args.issues is None
    assert args.label is None
    assert args.repo is None
    assert args.auto is False
    assert args.config == "dispatcher.yml"
    assert args.dry_run is False
    assert args.resume is None
    assert args.limit is None
    assert args.verbose is False


def test_parser_all_args():
    parser = build_parser()
    args = parser.parse_args([
        "--issues", "42,43",
        "--label", "custom",
        "--repo", "owner/repo",
        "--auto",
        "--config", "custom.yml",
        "--dry-run",
        "--resume", "run-123",
        "--limit", "10",
        "--verbose",
    ])
    assert args.issues == "42,43"
    assert args.label == "custom"
    assert args.repo == "owner/repo"
    assert args.auto is True
    assert args.config == "custom.yml"
    assert args.dry_run is True
    assert args.resume == "run-123"
    assert args.limit == 10
    assert args.verbose is True
