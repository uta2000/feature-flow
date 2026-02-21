#!/usr/bin/env python3
"""
Analyze a Claude Code session JSON file and output structured metrics as JSON.
Used by the session-report skill to extract data before report generation.

Usage: python3 analyze-session.py <session-file.json>
"""

import json
import sys
from datetime import datetime, timezone
from collections import defaultdict, Counter


def parse_timestamp(ts):
    """Parse ISO timestamp string to datetime."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def analyze_session(filepath):
    with open(filepath) as f:
        data = json.load(f)

    session = data["session"]
    messages = data["messages"]
    report = {}

    # --- Session Overview ---
    timestamps = [m["timestamp"] for m in messages if m.get("timestamp")]
    first_ts = parse_timestamp(timestamps[0]) if timestamps else None
    last_ts = parse_timestamp(timestamps[-1]) if timestamps else None
    duration = (last_ts - first_ts) if first_ts and last_ts else None

    report["overview"] = {
        "session_id": session["id"],
        "project_id": session.get("projectId", "unknown"),
        "project_path": session.get("projectPath", "unknown"),
        "first_message": session.get("firstMessage", "unknown"),
        "message_count": session.get("messageCount", 0),
        "has_subagents": session.get("hasSubagents", False),
        "context_consumption": session.get("contextConsumption", 0),
        "compaction_count": session.get("compactionCount", 0),
        "git_branch": session.get("gitBranch", "unknown"),
        "start_time": timestamps[0] if timestamps else None,
        "end_time": timestamps[-1] if timestamps else None,
        "duration_seconds": duration.total_seconds() if duration else 0,
        "duration_human": str(duration) if duration else "unknown",
        "total_messages": len(messages),
    }

    # --- Token Usage by Model ---
    model_stats = defaultdict(
        lambda: {
            "api_calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation": 0,
            "cache_read": 0,
        }
    )

    for m in messages:
        if m.get("usage") and m.get("model"):
            model = m["model"]
            u = m["usage"]
            model_stats[model]["api_calls"] += 1
            model_stats[model]["input_tokens"] += u.get("input_tokens", 0)
            model_stats[model]["output_tokens"] += u.get("output_tokens", 0)
            model_stats[model]["cache_creation"] += u.get(
                "cache_creation_input_tokens", 0
            )
            model_stats[model]["cache_read"] += u.get("cache_read_input_tokens", 0)

    totals = {
        "input_tokens": sum(s["input_tokens"] for s in model_stats.values()),
        "output_tokens": sum(s["output_tokens"] for s in model_stats.values()),
        "cache_creation": sum(s["cache_creation"] for s in model_stats.values()),
        "cache_read": sum(s["cache_read"] for s in model_stats.values()),
    }
    totals["grand_total"] = sum(totals.values())
    totals["cache_read_pct"] = (
        round(totals["cache_read"] / totals["grand_total"] * 100, 2)
        if totals["grand_total"]
        else 0
    )

    report["token_usage"] = {"by_model": dict(model_stats), "totals": totals}

    # --- Message Type Breakdown ---
    type_counts = Counter(m.get("type", "unknown") for m in messages)
    report["message_types"] = dict(type_counts)

    # --- Tool Usage ---
    tool_counts = Counter()
    for m in messages:
        for tc in m.get("toolCalls", []):
            tool_counts[tc["name"]] += 1
    report["tool_usage"] = {
        "counts": dict(tool_counts.most_common()),
        "total_calls": sum(tool_counts.values()),
    }

    # --- Subagent Details ---
    subagents = []
    for m in messages:
        for tc in m.get("toolCalls", []):
            if tc["name"] == "Task":
                inp = tc.get("input", {})
                subagents.append(
                    {
                        "description": inp.get("description", "unknown"),
                        "subagent_type": inp.get("subagent_type", "unknown"),
                        "model": inp.get("model", "default (inherits parent)"),
                        "run_in_background": inp.get("run_in_background", False),
                    }
                )
    report["subagents"] = subagents

    # --- Skills Invoked ---
    skills = []
    for m in messages:
        for tc in m.get("toolCalls", []):
            if tc["name"] == "Skill":
                inp = tc.get("input", {})
                skills.append(
                    {
                        "skill": inp.get("skill", "unknown"),
                        "args_preview": str(inp.get("args", ""))[:120],
                    }
                )
    report["skills_invoked"] = skills

    # --- Repeated Bash Commands ---
    bash_cmds = []
    for m in messages:
        for tc in m.get("toolCalls", []):
            if tc["name"] == "Bash":
                inp = tc.get("input", {})
                cmd = inp.get("command", "") if isinstance(inp, dict) else str(inp)
                bash_cmds.append(cmd[:200])

    cmd_counts = Counter(bash_cmds)
    repeated = {cmd: count for cmd, count in cmd_counts.most_common() if count > 1}
    report["bash_commands"] = {
        "total": len(bash_cmds),
        "unique": len(set(bash_cmds)),
        "repeated": repeated,
    }

    # --- Tool Errors ---
    errors = []
    for i, m in enumerate(messages):
        for tr in m.get("toolResults", []):
            if tr.get("isError"):
                tool_use_id = tr.get("toolUseId", "")
                tool_name = "unknown"
                tool_input = ""
                for prev_m in messages[:i]:
                    for tc in prev_m.get("toolCalls", []):
                        if tc.get("id") == tool_use_id:
                            tool_name = tc.get("name", "unknown")
                            tool_input = str(tc.get("input", ""))[:300]
                errors.append(
                    {
                        "tool": tool_name,
                        "input_preview": tool_input,
                        "error": str(tr.get("content", ""))[:500],
                        "message_index": i,
                    }
                )

    # Also find Bash exit code errors that aren't flagged as isError
    for i, m in enumerate(messages):
        for tr in m.get("toolResults", []):
            content = str(tr.get("content", ""))
            if not tr.get("isError") and (
                "Exit code 1" in content or "Exit code 127" in content
            ):
                tool_use_id = tr.get("toolUseId", "")
                for prev_m in messages[:i]:
                    for tc in prev_m.get("toolCalls", []):
                        if tc.get("id") == tool_use_id and tc.get("name") == "Bash":
                            errors.append(
                                {
                                    "tool": "Bash (non-zero exit)",
                                    "input_preview": str(tc.get("input", {}))[:300],
                                    "error": content[:500],
                                    "message_index": i,
                                }
                            )

    report["tool_errors"] = errors

    # --- Timing Analysis ---
    key_events = []
    for m in messages:
        ts = m.get("timestamp")
        if not ts:
            continue
        dt = parse_timestamp(ts)

        label = None
        if m.get("type") == "user" and isinstance(m.get("content"), str):
            content = m["content"]
            if "start feature" in content:
                label = f"User: {content[:60]}"
            elif "being continued" in content:
                label = "Context compaction/continuation"

        for tc in m.get("toolCalls", []):
            if tc["name"] == "Skill":
                label = f"Skill: {tc['input'].get('skill', '')}"
            elif tc["name"] == "Task":
                inp = tc.get("input", {})
                label = f"Task: {inp.get('description', '')} ({inp.get('subagent_type', '')})"

        if label:
            key_events.append({"timestamp": ts, "label": label})

    # Calculate deltas
    for i in range(1, len(key_events)):
        prev_dt = parse_timestamp(key_events[i - 1]["timestamp"])
        curr_dt = parse_timestamp(key_events[i]["timestamp"])
        delta = curr_dt - prev_dt
        key_events[i]["delta_seconds"] = delta.total_seconds()
        key_events[i]["delta_human"] = str(delta)

    report["timing"] = key_events

    # --- Thinking Blocks ---
    thinking_count = 0
    for m in messages:
        if isinstance(m.get("content"), list):
            for block in m["content"]:
                if block.get("type") == "thinking":
                    thinking_count += 1
    report["thinking_blocks"] = thinking_count

    # --- Git Branches ---
    branches = set()
    for m in messages:
        if m.get("gitBranch"):
            branches.add(m["gitBranch"])
    report["git_branches"] = list(branches)

    # --- Compaction Info ---
    report["compaction"] = {
        "count": session.get("compactionCount", 0),
        "phases": session.get("phaseBreakdown", []),
    }

    # --- Compact Summary Messages ---
    compact_count = sum(1 for m in messages if m.get("isCompactSummary"))
    report["compact_summaries"] = compact_count

    # --- Lifecycle Tasks Created ---
    tasks_created = []
    for m in messages:
        for tc in m.get("toolCalls", []):
            if tc["name"] == "TaskCreate":
                inp = tc.get("input", {})
                tasks_created.append(inp.get("subject", "unknown"))
    report["lifecycle_tasks"] = tasks_created

    # --- User Questions Asked ---
    questions_asked = []
    for m in messages:
        for tc in m.get("toolCalls", []):
            if tc["name"] == "AskUserQuestion":
                inp = tc.get("input", {})
                for q in inp.get("questions", []):
                    question_entry = {"question": q.get("question", "")}
                    options = [o.get("label", "") for o in q.get("options", [])]
                    question_entry["options"] = options
                    questions_asked.append(question_entry)
    report["user_questions"] = questions_asked

    # --- Out-of-Scope Findings ---
    findings = []
    keywords = [
        "pre-existing",
        "out of scope",
        "tech debt",
        "anti-pattern",
        "existed before",
    ]
    for i, m in enumerate(messages):
        if m.get("type") != "assistant":
            continue
        content = m.get("content", "")
        if isinstance(content, list):
            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
            content = " ".join(texts)

        for kw in keywords:
            if kw.lower() in content.lower():
                idx = content.lower().find(kw.lower())
                start = max(0, idx - 80)
                end = min(len(content), idx + 300)
                snippet = content[start:end].replace("\n", " ").strip()
                findings.append(
                    {"keyword": kw, "message_index": i, "snippet": snippet}
                )
                break  # one match per message

    report["out_of_scope_findings"] = findings

    # --- Service Tiers ---
    tiers = Counter()
    for m in messages:
        if m.get("usage"):
            tiers[m["usage"].get("service_tier", "unknown")] += 1
    report["service_tiers"] = dict(tiers)

    return report


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <session-file.json>", file=sys.stderr)
        sys.exit(1)

    result = analyze_session(sys.argv[1])
    print(json.dumps(result, indent=2, default=str))
