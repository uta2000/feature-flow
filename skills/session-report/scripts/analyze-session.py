#!/usr/bin/env python3
"""
Analyze a Claude Code session JSON file and output structured metrics as JSON.
Used by the session-report skill to extract data before report generation.

v2 — Adds: cost calculation, conversation tree analysis, idle gap detection,
model switch tracking, thinking block content analysis, tool success rates,
permission denial detection, test progression, lines changed, working directory
tracking, context consumption interpretation, and prompt quality signals.

Usage: python3 analyze-session.py <session-file.json>
"""

import json
import re
import sys
from datetime import datetime, timedelta
from collections import defaultdict, Counter


# =========================================================================
# PRICING TABLE (USD per 1M tokens) — update when Anthropic changes pricing
# =========================================================================
# Source: https://docs.anthropic.com/en/docs/about-claude/models
# Format: model_substring -> {input, output, cache_read, cache_creation}
MODEL_PRICING = {
    "opus-4": {
        "input": 15.00,
        "output": 75.00,
        "cache_read": 1.50,       # 10% of input
        "cache_creation": 18.75,  # 125% of input
    },
    "sonnet-4": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_creation": 3.75,
    },
    "haiku-4": {
        "input": 0.80,
        "output": 4.00,
        "cache_read": 0.08,
        "cache_creation": 1.00,
    },
    # Claude 3.x fallbacks
    "opus-3": {
        "input": 15.00,
        "output": 75.00,
        "cache_read": 1.50,
        "cache_creation": 18.75,
    },
    "sonnet-3": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_creation": 3.75,
    },
    "haiku-3": {
        "input": 0.25,
        "output": 1.25,
        "cache_read": 0.03,
        "cache_creation": 0.30,
    },
}

# Default pricing if model string doesn't match any known pattern
DEFAULT_PRICING = {
    "input": 3.00,
    "output": 15.00,
    "cache_read": 0.30,
    "cache_creation": 3.75,
}


def get_pricing(model_name):
    """Match a model string to its pricing tier."""
    name = model_name.lower()
    for key, pricing in MODEL_PRICING.items():
        if key in name:
            return pricing
    return DEFAULT_PRICING


def cost_usd(model_name, input_tok, output_tok, cache_read_tok, cache_creation_tok):
    """Calculate cost in USD for a single API call."""
    p = get_pricing(model_name)
    return (
        input_tok * p["input"]
        + output_tok * p["output"]
        + cache_read_tok * p["cache_read"]
        + cache_creation_tok * p["cache_creation"]
    ) / 1_000_000


# =========================================================================
# HELPERS
# =========================================================================

def parse_timestamp(ts):
    """Parse ISO timestamp string to datetime."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def extract_text_content(message):
    """Extract plain text from a message's content field."""
    content = message.get("content", "")
    if isinstance(content, list):
        return " ".join(
            c.get("text", "") for c in content if c.get("type") == "text"
        )
    return content if isinstance(content, str) else ""


def parse_subagent_usage(text):
    """Extract usage metrics from <usage> tags in Task tool result text."""
    match = re.search(r"<usage>(.*?)</usage>", text, re.DOTALL)
    if not match:
        return None
    block = match.group(1)
    result = {}
    for line in block.strip().split("\n"):
        line = line.strip()
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            try:
                result[key] = int(val)
            except ValueError:
                try:
                    result[key] = float(val)
                except ValueError:
                    result[key] = val
    return result if result else None


# Friction keyword patterns (word-boundary to avoid false positives)
FRICTION_PATTERNS = [
    (r"\bno,", "no,"),
    (r"\bwrong\b", "wrong"),
    (r"\bactually\b", "actually"),
    (r"\bundo\b", "undo"),
    (r"\brevert\b", "revert"),
    (r"that's not\b", "that's not"),
    (r"\binstead,", "instead,"),
    (r"\bwait,", "wait,"),
    (r"\bnevermind\b", "nevermind"),
    (r"I don't want\b", "I don't want"),
]
FRICTION_REGEXES = [
    (re.compile(p, re.IGNORECASE), kw) for p, kw in FRICTION_PATTERNS
]

# Permission denial patterns in error text
PERMISSION_PATTERNS = re.compile(
    r"permission denied|not allowed|requires approval|cannot execute|"
    r"access denied|operation not permitted|EACCES|EPERM|"
    r"user rejected|user denied|needs_user_approval",
    re.IGNORECASE,
)

# Test result patterns in bash output
TEST_PASS_PATTERNS = re.compile(
    r"(\d+)\s+(?:passing|passed|tests?\s+passed)|"
    r"Tests:\s+(\d+)\s+passed|"
    r"✓|PASS(?:ED)?|ok\b",
    re.IGNORECASE,
)
TEST_FAIL_PATTERNS = re.compile(
    r"(\d+)\s+(?:failing|failed|tests?\s+failed)|"
    r"Tests:\s+(\d+)\s+failed|"
    r"✗|✕|FAIL(?:ED)?|ERROR",
    re.IGNORECASE,
)
TEST_SUMMARY_PATTERN = re.compile(
    r"(\d+)\s+passed.*?(\d+)\s+failed|"
    r"Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed|"
    r"(\d+)\s+passing,\s+(\d+)\s+failing",
    re.IGNORECASE,
)

# Thinking block analysis keywords
THINKING_SIGNALS = {
    "alternatives": re.compile(
        r"\balternative(?:ly|s)?\b|\binstead\b|\bother approach\b|\bcould also\b",
        re.IGNORECASE,
    ),
    "uncertainty": re.compile(
        r"\bnot sure\b|\buncertain\b|\bmight be\b|\bpossibly\b|\bI think\b.*\bbut\b",
        re.IGNORECASE,
    ),
    "errors_noticed": re.compile(
        r"\bbug\b|\berror\b|\bwrong\b|\bincorrect\b|\bfail\b|\bbroken\b",
        re.IGNORECASE,
    ),
    "planning": re.compile(
        r"\bfirst.*then\b|\bstep \d\b|\bplan\b|\bapproach\b|\bstrategy\b",
        re.IGNORECASE,
    ),
    "direction_change": re.compile(
        r"\bwait\b|\bactually\b|\bon second thought\b|\blet me reconsider\b|\bhmm\b",
        re.IGNORECASE,
    ),
}


# =========================================================================
# MAIN ANALYSIS
# =========================================================================

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

    # Context consumption interpretation
    # The field may be a raw token count (e.g. 130381) or a 0-1 ratio.
    ctx_consumption = session.get("contextConsumption", 0)
    if ctx_consumption > 1:
        # Raw token count — no way to derive percentage without knowing window size
        ctx_consumption_pct = None
        ctx_assessment = None
    else:
        # 0-1 ratio
        ctx_consumption_pct = round(ctx_consumption * 100, 1) if ctx_consumption else 0
        if ctx_consumption > 0.8:
            ctx_assessment = "critical"
        elif ctx_consumption > 0.6:
            ctx_assessment = "high"
        elif ctx_consumption > 0.4:
            ctx_assessment = "moderate"
        else:
            ctx_assessment = "healthy"

    report["overview"] = {
        "session_id": session["id"],
        "project_id": session.get("projectId", "unknown"),
        "project_path": session.get("projectPath", "unknown"),
        "first_message": session.get("firstMessage", "unknown"),
        "message_count": session.get("messageCount", 0),
        "has_subagents": session.get("hasSubagents", False),
        "context_consumption": ctx_consumption,
        "context_consumption_pct": ctx_consumption_pct,
        "context_assessment": ctx_assessment,
        "compaction_count": session.get("compactionCount", 0),
        "git_branch": session.get("gitBranch", "unknown"),
        "start_time": timestamps[0] if timestamps else None,
        "end_time": timestamps[-1] if timestamps else None,
        "duration_seconds": duration.total_seconds() if duration else 0,
        "duration_human": str(duration) if duration else "unknown",
        "total_messages": len(messages),
    }

    # ===================================================================
    # SINGLE-PASS ACCUMULATORS
    # ===================================================================

    # Token usage by model
    model_stats = defaultdict(
        lambda: {
            "api_calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation": 0,
            "cache_read": 0,
            "cost_usd": 0.0,
        }
    )

    # Cache economics
    cache_creation_5m = 0
    cache_creation_1h = 0
    total_cache_creation = 0
    total_cache_read = 0
    cold_start_detected = False
    first_assistant_with_usage_seen = False

    # Message type counts
    type_counts = Counter()

    # Tool usage counts
    tool_counts = Counter()

    # Tool call index: tool_use_id -> (message_idx, tool_call_dict)
    tool_call_index = {}

    # Subagent details (backward compat)
    subagents = []

    # Subagent actual metrics
    subagent_metrics_list = []

    # Skills invoked
    skills = []

    # Bash commands (full tracking for test progression)
    bash_cmds = []
    bash_cmd_details = []  # (message_idx, command, tool_use_id)

    # Tool errors
    errors = []

    # Tool error index by tool name for success rate
    errors_by_tool = Counter()

    # Permission denials (subset of errors)
    permission_denials = []

    # Timing / key events
    key_events = []

    # Thinking blocks — now with content analysis
    thinking_count = 0
    thinking_analysis = []  # list of {message_index, preview, signals}

    # Git branches
    branches = set()

    # Compact summaries
    compact_count = 0

    # Lifecycle tasks
    tasks_created = []

    # User questions
    questions_asked = []

    # Out-of-scope findings
    out_of_scope_keywords = [
        "pre-existing",
        "out of scope",
        "tech debt",
        "anti-pattern",
        "existed before",
    ]
    findings = []

    # Service tiers
    tiers = Counter()

    # File read redundancy
    file_read_counts = Counter()

    # Git activity
    git_commits = []
    git_push_count = 0
    git_branch_creations = []

    # Lines changed tracking
    lines_added_total = 0
    lines_removed_total = 0

    # Friction signals
    corrections = []
    user_message_count = 0

    # Thrashing detection
    bash_prefix_groups = Counter()
    file_edit_indices = defaultdict(list)

    # Startup overhead
    first_work_tool_seen = False
    startup_messages = 0
    startup_tokens = 0
    non_skill_tools = {
        "Read", "Write", "Edit", "Bash", "Grep", "Glob", "Task",
        "WebFetch", "WebSearch", "NotebookEdit",
    }

    # Token density timeline
    assistant_msg_data = []  # (timestamp_dt, total_tokens_for_msg)

    # --- NEW: Conversation tree ---
    uuid_to_idx = {}         # uuid -> message index
    parent_map = {}          # uuid -> parentUuid
    sidechain_count = 0
    max_depth = 0
    children_map = defaultdict(list)  # parentUuid -> [childUuid]

    # --- NEW: Idle gap detection ---
    # Pairs: (last_assistant_ts, next_user_ts) for gap calculation
    last_assistant_ts = None
    idle_gaps = []           # list of {gap_seconds, after_message_index}
    IDLE_THRESHOLD_SEC = 60

    # --- NEW: Model switch detection ---
    last_model = None
    model_switches = []      # list of {from, to, message_index, timestamp}

    # --- NEW: Working directory tracking ---
    cwd_set = set()
    cwd_changes = []         # list of {from, to, message_index}
    last_cwd = None

    # --- NEW: Test progression ---
    test_snapshots = []      # list of {message_index, passed, failed, raw}

    # --- NEW: Agent tree metadata ---
    agent_tree_nodes = []    # list of {agentId, agentType, teamName, parentToolUseId, ...}

    # --- NEW: Per-API-call cost tracking ---
    total_session_cost = 0.0

    # --- NEW: First user message length (for prompt quality signal) ---
    first_user_message_length = 0
    first_user_seen = False

    # ===================================================================
    # SINGLE PASS
    # ===================================================================
    for i, m in enumerate(messages):
        msg_type = m.get("type", "unknown")
        type_counts[msg_type] += 1
        msg_uuid = m.get("uuid", "")
        msg_parent = m.get("parentUuid", "")
        msg_ts = m.get("timestamp")

        # --- Conversation tree ---
        if msg_uuid:
            uuid_to_idx[msg_uuid] = i
            parent_map[msg_uuid] = msg_parent
            if msg_parent:
                children_map[msg_parent].append(msg_uuid)

        if m.get("isSidechain"):
            sidechain_count += 1

        # --- Agent tree metadata ---
        agent_id = m.get("agentId")
        if agent_id:
            agent_tree_nodes.append({
                "agent_id": agent_id,
                "agent_type": m.get("agentType", "unknown"),
                "team_name": m.get("teamName", ""),
                "parent_tool_use_id": m.get("parentToolUseId", ""),
                "message_index": i,
            })

        # --- Working directory tracking ---
        msg_cwd = m.get("cwd", "")
        if msg_cwd:
            cwd_set.add(msg_cwd)
            if last_cwd and msg_cwd != last_cwd:
                cwd_changes.append({
                    "from": last_cwd,
                    "to": msg_cwd,
                    "message_index": i,
                })
            last_cwd = msg_cwd

        # --- Token usage, cache economics, and cost ---
        if m.get("usage") and m.get("model"):
            model = m["model"]
            u = m["usage"]
            inp_tok = u.get("input_tokens", 0)
            out_tok = u.get("output_tokens", 0)
            cc = u.get("cache_creation_input_tokens", 0)
            cr = u.get("cache_read_input_tokens", 0)

            model_stats[model]["api_calls"] += 1
            model_stats[model]["input_tokens"] += inp_tok
            model_stats[model]["output_tokens"] += out_tok
            model_stats[model]["cache_creation"] += cc
            model_stats[model]["cache_read"] += cr

            # Per-call cost
            call_cost = cost_usd(model, inp_tok, out_tok, cr, cc)
            model_stats[model]["cost_usd"] += call_cost
            total_session_cost += call_cost

            total_cache_creation += cc
            total_cache_read += cr

            # Ephemeral breakdown
            cc_detail = u.get("cache_creation", {})
            if isinstance(cc_detail, dict):
                cache_creation_5m += cc_detail.get("ephemeral_5m_input_tokens", 0)
                cache_creation_1h += cc_detail.get("ephemeral_1h_input_tokens", 0)

            # Cold start detection
            if msg_type == "assistant" and not first_assistant_with_usage_seen:
                first_assistant_with_usage_seen = True
                if cc > 0 and cr == 0:
                    cold_start_detected = True

        # --- Service tiers ---
        if m.get("usage"):
            tiers[m["usage"].get("service_tier", "unknown")] += 1

        # --- Git branches ---
        if m.get("gitBranch"):
            branches.add(m["gitBranch"])

        # --- Compact summaries ---
        if m.get("isCompactSummary"):
            compact_count += 1

        # --- Thinking blocks (with content analysis) ---
        if isinstance(m.get("content"), list):
            for block in m["content"]:
                if block.get("type") == "thinking":
                    thinking_count += 1
                    think_text = block.get("text", "")
                    # Analyze thinking content for signals
                    signals_found = {}
                    for signal_name, pattern in THINKING_SIGNALS.items():
                        if pattern.search(think_text):
                            signals_found[signal_name] = True
                    if signals_found or thinking_count <= 5:
                        # Always capture first 5, plus any with signals
                        thinking_analysis.append({
                            "message_index": i,
                            "preview": think_text[:200].replace("\n", " ").strip(),
                            "char_length": len(think_text),
                            "signals": signals_found,
                        })

        # --- Model switch detection (assistant messages with model field) ---
        if msg_type == "assistant" and m.get("model"):
            current_model = m["model"]
            if last_model and current_model != last_model:
                model_switches.append({
                    "from": last_model,
                    "to": current_model,
                    "message_index": i,
                    "timestamp": msg_ts,
                })
            last_model = current_model

        # --- Idle gap detection ---
        if msg_type == "assistant" and msg_ts:
            last_assistant_ts = parse_timestamp(msg_ts)
        if msg_type == "user" and msg_ts and last_assistant_ts:
            user_ts = parse_timestamp(msg_ts)
            gap = (user_ts - last_assistant_ts).total_seconds()
            if gap > IDLE_THRESHOLD_SEC:
                idle_gaps.append({
                    "gap_seconds": round(gap, 1),
                    "gap_human": str(timedelta(seconds=int(gap))),
                    "after_message_index": i,
                })

        # --- First user message length (prompt quality) ---
        if msg_type == "user" and not first_user_seen and not m.get("isMeta"):
            content_text = extract_text_content(m)
            if content_text.strip():
                first_user_message_length = len(content_text)
                first_user_seen = True

        # --- Tool calls (assistant messages) ---
        for tc in m.get("toolCalls", []):
            tool_name = tc["name"]
            tool_counts[tool_name] += 1
            tool_call_index[tc.get("id", "")] = (i, tc)
            inp = tc.get("input", {})

            # Subagents
            if tool_name == "Task":
                subagents.append({
                    "description": inp.get("description", "unknown"),
                    "subagent_type": inp.get("subagent_type", "unknown"),
                    "model": inp.get("model", "default (inherits parent)"),
                    "run_in_background": inp.get("run_in_background", False),
                })

            # Skills
            if tool_name == "Skill":
                skills.append({
                    "skill": inp.get("skill", "unknown"),
                    "args_preview": str(inp.get("args", ""))[:120],
                })

            # Bash commands
            if tool_name == "Bash":
                cmd = inp.get("command", "") if isinstance(inp, dict) else str(inp)
                cmd_trunc = cmd[:200]
                bash_cmds.append(cmd_trunc)
                bash_cmd_details.append({
                    "message_index": i,
                    "command": cmd_trunc,
                    "tool_use_id": tc.get("id", ""),
                })

                # Thrashing: bash prefix groups
                prefix = cmd[:40]
                bash_prefix_groups[prefix] += 1

                # Git activity
                if "git commit" in cmd:
                    heredoc_match = re.search(
                        r"cat\s+<<['\"]?EOF['\"]?\n(.+?)(?:\n|$)", cmd
                    )
                    if heredoc_match:
                        preview = heredoc_match.group(1).strip()[:80]
                    else:
                        msg_match = re.search(r'-m\s+["\'](.+?)["\']', cmd)
                        preview = msg_match.group(1)[:80] if msg_match else cmd[:80]
                    git_commits.append(
                        {"message_preview": preview, "message_index": i}
                    )
                if "git push" in cmd:
                    git_push_count += 1
                if "git checkout -b" in cmd or "git switch -c" in cmd:
                    branch_match = re.search(
                        r"git (?:checkout -b|switch -c)\s+(\S+)", cmd
                    )
                    if branch_match:
                        git_branch_creations.append(branch_match.group(1))

                # Lines changed: detect git diff --stat output in later results
                # (We'll parse the result, not the command — see tool results section)

            # File reads
            if tool_name == "Read":
                file_path = inp.get("file_path", "")
                if file_path:
                    file_read_counts[file_path] += 1

            # TaskCreate
            if tool_name == "TaskCreate":
                tasks_created.append(inp.get("subject", "unknown"))

            # AskUserQuestion
            if tool_name == "AskUserQuestion":
                for q in inp.get("questions", []):
                    question_entry = {"question": q.get("question", "")}
                    options = [o.get("label", "") for o in q.get("options", [])]
                    question_entry["options"] = options
                    questions_asked.append(question_entry)

            # Write/Edit for thrashing
            if tool_name in ("Write", "Edit"):
                fp = inp.get("file_path", "")
                if fp:
                    file_edit_indices[fp].append(i)

            # Startup overhead: track first non-Skill tool call
            if not first_work_tool_seen and tool_name in non_skill_tools:
                first_work_tool_seen = True

        # --- Startup overhead: count assistant messages before first work tool ---
        if msg_type == "assistant" and not first_work_tool_seen:
            startup_messages += 1
            if m.get("usage"):
                startup_tokens += m["usage"].get("output_tokens", 0)
                startup_tokens += m["usage"].get("input_tokens", 0)
                startup_tokens += m["usage"].get("cache_creation_input_tokens", 0)
                startup_tokens += m["usage"].get("cache_read_input_tokens", 0)

        # --- Token density timeline data ---
        if msg_type == "assistant" and msg_ts and m.get("usage"):
            dt = parse_timestamp(msg_ts)
            total_msg_tokens = (
                m["usage"].get("input_tokens", 0)
                + m["usage"].get("output_tokens", 0)
                + m["usage"].get("cache_creation_input_tokens", 0)
                + m["usage"].get("cache_read_input_tokens", 0)
            )
            assistant_msg_data.append((dt, total_msg_tokens))

        # --- Timing / key events ---
        if msg_ts:
            label = None
            if msg_type == "user" and isinstance(m.get("content"), str):
                content = m["content"]
                if "start feature" in content:
                    label = f"User: {content[:60]}"
                elif "being continued" in content:
                    label = "Context compaction/continuation"

            for tc in m.get("toolCalls", []):
                if tc["name"] == "Skill":
                    label = f"Skill: {tc['input'].get('skill', '')}"
                elif tc["name"] == "Task":
                    inp_tc = tc.get("input", {})
                    label = (
                        f"Task: {inp_tc.get('description', '')} "
                        f"({inp_tc.get('subagent_type', '')})"
                    )

            if label:
                key_events.append({"timestamp": msg_ts, "label": label})

        # --- Out-of-scope findings (assistant messages) ---
        if msg_type == "assistant":
            content_text = extract_text_content(m)
            for kw in out_of_scope_keywords:
                if kw.lower() in content_text.lower():
                    idx = content_text.lower().find(kw.lower())
                    start = max(0, idx - 80)
                    end = min(len(content_text), idx + 300)
                    snippet = content_text[start:end].replace("\n", " ").strip()
                    findings.append(
                        {"keyword": kw, "message_index": i, "snippet": snippet}
                    )
                    break

        # --- Friction signals (user messages) ---
        if msg_type == "user" and not m.get("isMeta"):
            content_text = extract_text_content(m)
            if content_text.strip():
                user_message_count += 1
                for regex, keyword in FRICTION_REGEXES:
                    if regex.search(content_text):
                        corrections.append({
                            "message_index": i,
                            "keyword": keyword,
                            "preview": content_text[:120].replace("\n", " "),
                        })
                        break

        # --- Tool results (user messages containing results) ---
        for tr in m.get("toolResults", []):
            tool_use_id = tr.get("toolUseId", "")

            # Subagent metrics from Task results
            if tool_use_id in tool_call_index:
                _, orig_tc = tool_call_index[tool_use_id]
                if orig_tc.get("name") == "Task":
                    result_text = ""
                    content = tr.get("content", "")
                    if isinstance(content, list):
                        result_text = " ".join(
                            c.get("text", "")
                            for c in content
                            if isinstance(c, dict) and c.get("type") == "text"
                        )
                    elif isinstance(content, str):
                        result_text = content

                    usage = parse_subagent_usage(result_text)
                    if usage:
                        orig_inp = orig_tc.get("input", {})
                        sa_model = orig_inp.get("model", "default (inherits parent)")
                        sa_tokens = usage.get("total_tokens", 0)
                        sa_cost = 0.0
                        sa_cost_estimated = False
                        effective_model = sa_model if sa_model != "default (inherits parent)" else (last_model or "sonnet-4")
                        if "input_tokens" in usage and "output_tokens" in usage:
                            # Exact cost from per-type token breakdown
                            sa_cost = cost_usd(
                                effective_model,
                                usage.get("input_tokens", 0),
                                usage.get("output_tokens", 0),
                                usage.get("cache_read_input_tokens", 0),
                                usage.get("cache_creation_input_tokens", 0),
                            )
                        elif sa_tokens > 0:
                            # Estimate: ~98% of subagent tokens are cache reads.
                            # Use cache_read price * 1.05 to account for the
                            # ~2% that are cache_creation + output (more expensive).
                            p = get_pricing(effective_model)
                            sa_cost = sa_tokens * p["cache_read"] * 1.05 / 1_000_000
                            sa_cost_estimated = True
                        subagent_entry = {
                            "description": orig_inp.get("description", "unknown"),
                            "subagent_type": orig_inp.get("subagent_type", "unknown"),
                            "model": sa_model,
                            "total_tokens": sa_tokens,
                            "total_duration_ms": usage.get("duration_ms", 0),
                            "total_tool_use_count": usage.get("tool_uses", 0),
                            "cost_usd": round(sa_cost, 4),
                        }
                        if sa_cost_estimated:
                            subagent_entry["cost_note"] = "estimated from total_tokens"
                        subagent_metrics_list.append(subagent_entry)

            # Tool errors (O(1) lookup)
            is_error = tr.get("isError", False)
            content_str = str(tr.get("content", ""))

            if is_error:
                tool_name = "unknown"
                tool_input = ""
                if tool_use_id in tool_call_index:
                    _, tc = tool_call_index[tool_use_id]
                    tool_name = tc.get("name", "unknown")
                    tool_input = str(tc.get("input", ""))[:300]

                error_entry = {
                    "tool": tool_name,
                    "input_preview": tool_input,
                    "error": content_str[:500],
                    "message_index": i,
                    "is_permission_denial": False,
                }

                # Permission denial check
                if PERMISSION_PATTERNS.search(content_str):
                    error_entry["is_permission_denial"] = True
                    permission_denials.append(error_entry)

                errors.append(error_entry)
                errors_by_tool[tool_name] += 1

            # Bash exit code errors
            if not is_error and (
                "Exit code 1" in content_str or "Exit code 127" in content_str
            ):
                if tool_use_id in tool_call_index:
                    _, tc = tool_call_index[tool_use_id]
                    if tc.get("name") == "Bash":
                        bash_error = {
                            "tool": "Bash (non-zero exit)",
                            "input_preview": str(tc.get("input", {}))[:300],
                            "error": content_str[:500],
                            "message_index": i,
                            "is_permission_denial": False,
                        }
                        if PERMISSION_PATTERNS.search(content_str):
                            bash_error["is_permission_denial"] = True
                            permission_denials.append(bash_error)
                        errors.append(bash_error)
                        errors_by_tool["Bash (non-zero exit)"] += 1

            # --- Test progression: parse test output from bash results ---
            if tool_use_id in tool_call_index:
                _, tc_orig = tool_call_index[tool_use_id]
                if tc_orig.get("name") == "Bash":
                    summary_match = TEST_SUMMARY_PATTERN.search(content_str)
                    if summary_match:
                        groups = summary_match.groups()
                        # Find first non-None pair
                        passed = failed = 0
                        for j in range(0, len(groups), 2):
                            if groups[j] is not None:
                                passed = int(groups[j])
                                failed = int(groups[j + 1]) if j + 1 < len(groups) and groups[j + 1] is not None else 0
                                break
                        test_snapshots.append({
                            "message_index": i,
                            "passed": passed,
                            "failed": failed,
                            "total": passed + failed,
                            "raw": content_str[:200].replace("\n", " "),
                        })

            # --- Lines changed: parse git diff --stat output ---
            if tool_use_id in tool_call_index:
                _, tc_orig = tool_call_index[tool_use_id]
                if tc_orig.get("name") == "Bash":
                    cmd_text = tc_orig.get("input", {})
                    if isinstance(cmd_text, dict):
                        cmd_text = cmd_text.get("command", "")
                    if "git diff" in str(cmd_text) or "git show" in str(cmd_text):
                        # Parse "X insertions(+), Y deletions(-)"
                        diff_match = re.search(
                            r"(\d+)\s+insertion", content_str
                        )
                        del_match = re.search(
                            r"(\d+)\s+deletion", content_str
                        )
                        if diff_match:
                            lines_added_total += int(diff_match.group(1))
                        if del_match:
                            lines_removed_total += int(del_match.group(1))

    # ===================================================================
    # POST-PASS AGGREGATION
    # ===================================================================

    # --- Token usage ---
    totals = {
        "input_tokens": sum(s["input_tokens"] for s in model_stats.values()),
        "output_tokens": sum(s["output_tokens"] for s in model_stats.values()),
        "cache_creation": sum(s["cache_creation"] for s in model_stats.values()),
        "cache_read": sum(s["cache_read"] for s in model_stats.values()),
    }
    grand_total = sum(totals.values())
    totals["grand_total"] = grand_total
    totals["cache_read_pct"] = (
        round(totals["cache_read"] / grand_total * 100, 2) if grand_total else 0
    )
    # Round per-model costs
    for ms in model_stats.values():
        ms["cost_usd"] = round(ms["cost_usd"], 4)

    report["token_usage"] = {"by_model": dict(model_stats), "totals": totals}

    # --- Cost analysis (NEW) ---
    sa_total_cost = sum(a.get("cost_usd", 0) for a in subagent_metrics_list)
    commit_count = len(git_commits)
    lines_changed = lines_added_total + lines_removed_total

    report["cost_analysis"] = {
        "parent_cost_usd": round(total_session_cost, 4),
        "subagent_cost_usd": round(sa_total_cost, 4),
        "total_session_cost_usd": round(total_session_cost + sa_total_cost, 4),
        "cost_by_model": {
            model: round(stats["cost_usd"], 4)
            for model, stats in model_stats.items()
        },
        "cost_per_commit": (
            round((total_session_cost + sa_total_cost) / commit_count, 4)
            if commit_count else None
        ),
        "cost_per_line_changed": (
            round((total_session_cost + sa_total_cost) / lines_changed, 6)
            if lines_changed else None
        ),
        "pricing_note": "Costs calculated from token counts using published API pricing. "
                        "Actual plan costs may differ based on subscription tier.",
    }

    # --- Message types ---
    report["message_types"] = dict(type_counts)

    # --- Tool usage with success rates (NEW) ---
    tool_success_rates = {}
    for tool, count in tool_counts.items():
        err_count = errors_by_tool.get(tool, 0)
        tool_success_rates[tool] = {
            "total_calls": count,
            "errors": err_count,
            "success_rate_pct": (
                round((count - err_count) / count * 100, 1) if count else 0
            ),
        }
    report["tool_usage"] = {
        "counts": dict(tool_counts.most_common()),
        "total_calls": sum(tool_counts.values()),
        "success_rates": tool_success_rates,
    }

    # --- Subagents (backward compat) ---
    report["subagents"] = subagents

    # --- Subagent metrics ---
    sa_total_tokens = sum(a["total_tokens"] for a in subagent_metrics_list)
    sa_total_duration = sum(a["total_duration_ms"] for a in subagent_metrics_list)
    sa_total_tools = sum(a["total_tool_use_count"] for a in subagent_metrics_list)
    report["subagent_metrics"] = {
        "count": len(subagent_metrics_list),
        "total_tokens": sa_total_tokens,
        "total_duration_ms": sa_total_duration,
        "total_tool_use_count": sa_total_tools,
        "total_cost_usd": round(sa_total_cost, 4),
        "by_agent": subagent_metrics_list,
    }

    # --- Skills invoked ---
    report["skills_invoked"] = skills

    # --- Bash commands ---
    cmd_counts = Counter(bash_cmds)
    repeated = {cmd: count for cmd, count in cmd_counts.most_common() if count > 1}
    report["bash_commands"] = {
        "total": len(bash_cmds),
        "unique": len(set(bash_cmds)),
        "repeated": repeated,
    }

    # --- Tool errors ---
    report["tool_errors"] = errors

    # --- Permission denials (NEW) ---
    report["permission_denials"] = {
        "count": len(permission_denials),
        "denials": permission_denials,
        "affected_tools": list(set(d["tool"] for d in permission_denials)),
    }

    # --- Timing ---
    for j in range(1, len(key_events)):
        prev_dt = parse_timestamp(key_events[j - 1]["timestamp"])
        curr_dt = parse_timestamp(key_events[j]["timestamp"])
        delta = curr_dt - prev_dt
        key_events[j]["delta_seconds"] = delta.total_seconds()
        key_events[j]["delta_human"] = str(delta)
    report["timing"] = key_events

    # --- Thinking blocks (enhanced) ---
    # Aggregate signal counts across all analyzed blocks
    signal_totals = Counter()
    for ta in thinking_analysis:
        for sig in ta.get("signals", {}):
            signal_totals[sig] += 1

    report["thinking_blocks"] = {
        "count": thinking_count,
        "analyzed_count": len(thinking_analysis),
        "signal_summary": dict(signal_totals),
        "notable_blocks": thinking_analysis[:20],  # Cap at 20 to limit output size
    }

    # --- Git branches ---
    report["git_branches"] = list(branches)

    # --- Compaction (enhanced with phase interpretation) ---
    phases = session.get("phaseBreakdown", [])
    report["compaction"] = {
        "count": session.get("compactionCount", 0),
        "phases": phases,
        "phase_count": len(phases),
        "note": (
            "Session underwent compaction, which may have caused loss of earlier context. "
            "Check for repeated work after compaction events."
            if session.get("compactionCount", 0) > 0
            else "No compaction occurred — session stayed within context limits."
        ),
    }

    # --- Compact summaries ---
    report["compact_summaries"] = compact_count

    # --- Lifecycle tasks ---
    report["lifecycle_tasks"] = tasks_created

    # --- User questions ---
    report["user_questions"] = questions_asked

    # --- Out-of-scope findings ---
    report["out_of_scope_findings"] = findings

    # --- Service tiers ---
    report["service_tiers"] = dict(tiers)

    # --- File read redundancy ---
    total_reads = sum(file_read_counts.values())
    unique_files = len(file_read_counts)
    redundant_files = {
        path: count for path, count in file_read_counts.items() if count > 2
    }
    report["file_read_redundancy"] = {
        "total_reads": total_reads,
        "unique_files": unique_files,
        "reads_per_unique_file": (
            round(total_reads / unique_files, 2) if unique_files else 0
        ),
        "redundant_files": redundant_files,
    }

    # --- Cache economics ---
    cache_total_creation_and_read = total_cache_creation + total_cache_read
    cache_efficiency = (
        round(total_cache_read / cache_total_creation_and_read * 100, 2)
        if cache_total_creation_and_read
        else 0
    )
    cache_rw_ratio = (
        round(total_cache_read / total_cache_creation, 1)
        if total_cache_creation
        else 0
    )
    report["cache_economics"] = {
        "cache_creation_5m": cache_creation_5m,
        "cache_creation_1h": cache_creation_1h,
        "cache_read": total_cache_read,
        "cache_efficiency_pct": cache_efficiency,
        "cold_start_detected": cold_start_detected,
        "cache_read_to_write_ratio": cache_rw_ratio,
    }

    # --- Git activity (enhanced with lines changed) ---
    report["git_activity"] = {
        "commit_count": len(git_commits),
        "commits": git_commits,
        "push_count": git_push_count,
        "branch_creations": git_branch_creations,
        "lines_added": lines_added_total,
        "lines_removed": lines_removed_total,
        "lines_changed": lines_changed,
        "lines_note": (
            "Line counts extracted from git diff --stat output found in bash results. "
            "May be incomplete if diffs were not run during the session."
            if lines_changed > 0
            else "No git diff output detected — line counts unavailable."
        ),
    }

    # --- Friction signals ---
    report["friction_signals"] = {
        "correction_count": len(corrections),
        "corrections": corrections,
        "friction_rate": (
            round(len(corrections) / user_message_count, 4)
            if user_message_count
            else 0
        ),
    }

    # --- Thrashing signals ---
    bash_near_dupes = [
        {"prefix": prefix, "count": count}
        for prefix, count in bash_prefix_groups.most_common()
        if count > 2
    ]
    edit_rework = [
        {"file_path": fp, "edit_indices": indices}
        for fp, indices in file_edit_indices.items()
        if len(indices) >= 3
    ]
    report["thrashing_signals"] = {
        "bash_near_duplicates": bash_near_dupes,
        "edit_rework_files": edit_rework,
    }

    # --- Startup overhead ---
    report["startup_overhead"] = {
        "messages_before_first_work": startup_messages,
        "tokens_before_first_work": startup_tokens,
        "pct_of_total": (
            round(startup_tokens / grand_total * 100, 2) if grand_total else 0
        ),
    }

    # --- Token density timeline ---
    quartiles = []
    if assistant_msg_data:
        n = len(assistant_msg_data)
        q_size = max(1, n // 4)
        for q in range(4):
            start_idx = q * q_size
            end_idx = n if q == 3 else (q + 1) * q_size
            chunk = assistant_msg_data[start_idx:end_idx]
            if chunk:
                avg_tokens = round(sum(t for _, t in chunk) / len(chunk))
                quartiles.append(
                    {"q": q + 1, "avg_tokens": avg_tokens, "message_count": len(chunk)}
                )
            else:
                quartiles.append({"q": q + 1, "avg_tokens": 0, "message_count": 0})
    else:
        quartiles = [
            {"q": q + 1, "avg_tokens": 0, "message_count": 0} for q in range(4)
        ]
    report["token_density_timeline"] = {"quartiles": quartiles}

    # ===================================================================
    # NEW SECTIONS
    # ===================================================================

    # --- Conversation tree analysis ---
    # Calculate max depth
    def get_depth(uuid, memo={}):
        if uuid not in parent_map or not parent_map[uuid]:
            return 0
        if uuid in memo:
            return memo[uuid]
        depth = 1 + get_depth(parent_map[uuid], memo)
        memo[uuid] = depth
        return depth

    depths = [get_depth(u) for u in parent_map]
    max_depth = max(depths) if depths else 0

    # Detect branching (multiple children from same parent)
    branch_points = {
        parent: children
        for parent, children in children_map.items()
        if len(children) > 1
    }

    report["conversation_tree"] = {
        "total_nodes": len(uuid_to_idx),
        "max_depth": max_depth,
        "sidechain_count": sidechain_count,
        "branch_points": len(branch_points),
        "branch_details": [
            {
                "parent_uuid": p[:12] + "...",
                "child_count": len(c),
                "parent_message_index": uuid_to_idx.get(p),
            }
            for p, c in sorted(
                branch_points.items(),
                key=lambda x: len(x[1]),
                reverse=True,
            )[:10]  # Top 10 branch points
        ],
    }

    # --- Idle gap analysis ---
    total_idle = sum(g["gap_seconds"] for g in idle_gaps)
    wall_clock = duration.total_seconds() if duration else 0
    active_time = wall_clock - total_idle if wall_clock else 0

    report["idle_analysis"] = {
        "idle_threshold_seconds": IDLE_THRESHOLD_SEC,
        "idle_gap_count": len(idle_gaps),
        "total_idle_seconds": round(total_idle, 1),
        "total_idle_human": str(timedelta(seconds=int(total_idle))),
        "wall_clock_seconds": round(wall_clock, 1),
        "active_working_seconds": round(max(active_time, 0), 1),
        "active_working_human": str(timedelta(seconds=int(max(active_time, 0)))),
        "idle_pct": (
            round(total_idle / wall_clock * 100, 1)
            if wall_clock > 0 else 0
        ),
        "longest_gaps": sorted(
            idle_gaps, key=lambda g: g["gap_seconds"], reverse=True
        )[:5],
    }

    # --- Model switches ---
    report["model_switches"] = {
        "count": len(model_switches),
        "switches": model_switches,
        "models_used": list(set(
            [s["from"] for s in model_switches]
            + [s["to"] for s in model_switches]
        )) if model_switches else list(model_stats.keys()),
    }

    # --- Working directory tracking ---
    report["working_directories"] = {
        "unique_directories": list(cwd_set),
        "directory_count": len(cwd_set),
        "changes": cwd_changes,
        "change_count": len(cwd_changes),
        "is_multi_directory": len(cwd_set) > 1,
    }

    # --- Test progression ---
    report["test_progression"] = {
        "snapshot_count": len(test_snapshots),
        "snapshots": test_snapshots,
        "trajectory": (
            "improving" if (
                len(test_snapshots) >= 2
                and test_snapshots[-1]["passed"] > test_snapshots[0]["passed"]
            )
            else "regressing" if (
                len(test_snapshots) >= 2
                and test_snapshots[-1]["passed"] < test_snapshots[0]["passed"]
            )
            else "stable" if len(test_snapshots) >= 2
            else "insufficient_data"
        ),
        "first_snapshot": test_snapshots[0] if test_snapshots else None,
        "last_snapshot": test_snapshots[-1] if test_snapshots else None,
    }

    # --- Agent tree metadata ---
    unique_agents = {}
    for node in agent_tree_nodes:
        aid = node["agent_id"]
        if aid not in unique_agents:
            unique_agents[aid] = node
    report["agent_tree"] = {
        "agent_count": len(unique_agents),
        "agents": list(unique_agents.values()),
        "has_team_mode": any(n.get("team_name") for n in agent_tree_nodes),
        "team_names": list(set(
            n["team_name"] for n in agent_tree_nodes if n.get("team_name")
        )),
    }

    # --- Prompt quality signal ---
    report["prompt_quality"] = {
        "first_message_length_chars": first_user_message_length,
        "user_message_count": user_message_count,
        "correction_count": len(corrections),
        "friction_rate": (
            round(len(corrections) / user_message_count, 4)
            if user_message_count else 0
        ),
        "assessment": (
            "underspecified"
            if first_user_message_length < 100 and len(corrections) >= 2
            else "verbose_but_unclear"
            if first_user_message_length > 500 and len(corrections) >= 3
            else "well_specified"
            if len(corrections) <= 1
            else "moderate_friction"
        ),
        "note": (
            "Short initial prompt with multiple corrections suggests the task "
            "needed more upfront specification."
            if first_user_message_length < 100 and len(corrections) >= 2
            else "Initial prompt was detailed but still required corrections — "
            "consider restructuring for clarity."
            if first_user_message_length > 500 and len(corrections) >= 3
            else "Low friction — initial prompt effectively communicated intent."
            if len(corrections) <= 1
            else "Moderate friction detected — review correction patterns for improvement opportunities."
        ),
    }

    return report


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <session-file.json>", file=sys.stderr)
        sys.exit(1)

    result = analyze_session(sys.argv[1])
    print(json.dumps(result, indent=2, default=str))
