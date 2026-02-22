from __future__ import annotations

import json
import subprocess

from dispatcher.models import Config, TriageResult

TRIAGE_SCHEMA = json.dumps({
    "type": "object",
    "properties": {
        "scope": {"type": "string", "enum": ["quick-fix", "small-enhancement", "feature", "major-feature"]},
        "richness_score": {"type": "integer", "minimum": 0, "maximum": 4},
        "richness_signals": {
            "type": "object",
            "properties": {
                "acceptance_criteria": {"type": "boolean"},
                "resolved_discussion": {"type": "boolean"},
                "concrete_examples": {"type": "boolean"},
                "structured_content": {"type": "boolean"},
            },
            "required": ["acceptance_criteria", "resolved_discussion", "concrete_examples", "structured_content"],
        },
        "triage_tier": {"type": "string", "enum": ["full-yolo", "supervised-yolo", "parked"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "risk_flags": {"type": "array", "items": {"type": "string"}},
        "missing_info": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "string"},
    },
    "required": ["scope", "richness_score", "richness_signals", "triage_tier", "confidence", "risk_flags", "missing_info", "reasoning"],
})

_TIER_MATRIX: dict[tuple[str, bool], str] = {
    ("quick-fix", False): "full-yolo",
    ("quick-fix", True): "full-yolo",
    ("small-enhancement", False): "full-yolo",
    ("small-enhancement", True): "full-yolo",
    ("feature", False): "parked",
    ("feature", True): "full-yolo",
    ("major-feature", False): "parked",
    ("major-feature", True): "supervised-yolo",
}


class TriageError(Exception):
    pass


def validate_tier(scope: str, richness_score: int, model_tier: str) -> str:
    key = (scope, richness_score >= 3)
    if key not in _TIER_MATRIX:
        raise TriageError(f"Unknown scope '{scope}' not in tier matrix")
    return _TIER_MATRIX[key]


def build_triage_prompt(title: str, body: str, comments: list[str]) -> str:
    comments_text = "\n---\n".join(comments) if comments else "(no comments)"
    return f"""Analyze this GitHub issue and classify it for automated processing.

## Issue Title
{title}

## Issue Body
{body}

## Comments
{comments_text}

## Instructions
Classify the issue's scope, assess its richness (how much detail it provides), and determine the appropriate automation tier. Be precise with confidence scores — only high confidence (>0.85) should be assigned to full-yolo.

Richness signals to check:
1. acceptance_criteria: Has clear acceptance criteria or requirements
2. resolved_discussion: Has resolved questions in comments
3. concrete_examples: Has specific examples, mockups, or specs
4. structured_content: Body >200 words with headings/lists/tables

Return a JSON object with: scope, richness_score (0-4), richness_signals, triage_tier, confidence (0-1), risk_flags, missing_info, reasoning."""


def _call_claude_triage(prompt: str, issue_number: int, config: Config) -> dict:
    try:
        result = subprocess.run(
            [
                "claude", "-p", prompt,
                "--model", config.triage_model,
                "--output-format", "json",
                "--json-schema", TRIAGE_SCHEMA,
                "--max-turns", str(config.triage_max_turns),
            ],
            capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired as exc:
        raise TriageError(f"Triage timed out for issue #{issue_number}") from exc
    return _parse_triage_output(result.stdout, issue_number)


def _parse_triage_output(stdout: str, issue_number: int) -> dict:
    try:
        outer = json.loads(stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        raise TriageError(f"Invalid JSON from claude -p for issue #{issue_number}: {stdout[:200]}") from exc

    if outer.get("is_error"):
        raise TriageError(f"claude -p error for issue #{issue_number}: {outer}")

    try:
        return json.loads(outer["result"]) if isinstance(outer.get("result"), str) else outer.get("result", outer)
    except (json.JSONDecodeError, TypeError) as exc:
        raise TriageError(f"Invalid triage result JSON for issue #{issue_number}") from exc


def triage_issue(issue_data: dict, issue_number: int, issue_url: str, config: Config) -> TriageResult:
    comments = [c["body"] for c in issue_data.get("comments", [])]
    prompt = build_triage_prompt(issue_data["title"], issue_data["body"] or "", comments)
    triage_data = _call_claude_triage(prompt, issue_number, config)
    return _build_triage_result(triage_data, issue_data, issue_number, issue_url)


def _build_triage_result(triage_data: dict, issue_data: dict, issue_number: int, issue_url: str) -> TriageResult:
    try:
        validated_tier = validate_tier(
            triage_data["scope"], triage_data["richness_score"], triage_data["triage_tier"],
        )
        return TriageResult(
            issue_number=issue_number,
            issue_title=issue_data["title"],
            issue_url=issue_url,
            scope=triage_data["scope"],
            richness_score=triage_data["richness_score"],
            richness_signals=triage_data["richness_signals"],
            triage_tier=validated_tier,
            confidence=triage_data["confidence"],
            risk_flags=triage_data["risk_flags"],
            missing_info=triage_data["missing_info"],
            reasoning=triage_data["reasoning"],
        )
    except KeyError as exc:
        raise TriageError(f"Missing required key in triage response for issue #{issue_number}: {exc}") from exc
