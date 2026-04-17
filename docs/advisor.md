# Advisor Tool — feature-flow Integration

## What it is

The Claude advisor tool (currently in beta as `advisor-tool-2026-03-01`) is an Anthropic-provided capability that gives Claude access to a second AI opinion within the same conversation. Unlike codex-consultation — which makes an explicit external MCP call with a logged verdict — the advisor is automatic and per-turn: Claude can call it whenever it judges that a second perspective is useful, without any lifecycle overhead.

Within feature-flow, advisor is wired as a soft complement to codex-consultation:
- **Advisor** = automatic, per-turn, no audit log, discretionary. Good for quick sanity checks ("am I interpreting this correctly?") and gut-check moments.
- **Codex** = explicit lifecycle checkpoint, durable log, PR-embedded verdict. Good for proactive reviews (design, plan, code) and reactive stuck recovery.

They coexist. Codex is still the scripted gate; advisor is the "check with a colleague" button that Claude can press at any moment.

## How to enable

The advisor feature requires a beta header in your Claude Code `settings.json`.

**Find your settings file:**
- macOS: `~/.claude/settings.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/claude/settings.json`, falling back to `~/.claude/settings.json`
- Windows: `%APPDATA%\claude\settings.json`

**Add the beta header:**

```json
{
  "env": {
    "ANTHROPIC_BETA": "advisor-tool-2026-03-01"
  }
}
```

If you already have other `ANTHROPIC_BETA` values, append with a comma:

```json
{
  "env": {
    "ANTHROPIC_BETA": "other-existing-header,advisor-tool-2026-03-01"
  }
}
```

**Verify it's working:** The feature-flow SessionStart tip will disappear after the header is detected.

**Quick setup via settings skill:**
```
feature-flow:settings advisor
```

## When it's worth it

Advisor adds the most value at **judgment-heavy, one-time decisions** in a feature session:

- Before declaring a design verification blocker — especially when the interpretation is ambiguous
- When a `verify-acceptance-criteria` criterion is unclear about what exactly it's checking
- Before spending a codex call on `mode: stuck` — advisor is same-family and faster
- Before constructing the codex brief — a quick advisor sanity-check can prevent sending an incomplete brief to codex

Advisor adds little value for mechanical tasks (writing tests, refactoring per a clear spec, running commands). feature-flow's SKILL.md hints point to advisor at exactly the moments where it pays off.

**Access note:** The advisor beta is access-gated via Anthropic account teams. If you're on a plan that doesn't include advisor access, the beta header has no effect — Claude proceeds as usual with no error. feature-flow's behavior is identical in both cases; the hints are non-blocking.

## Relationship to codex-consultation

feature-flow has two AI consultation mechanisms:

| | Advisor | Codex-consultation |
|---|---|---|
| **Invocation** | Automatic (Claude decides per-turn) | Explicit lifecycle checkpoint |
| **Scope** | Same-family check (same model family) | External MCP call (different model) |
| **Cost** | Advisor-model rate | Codex API rate |
| **Audit log** | None | Logged to `.feature-flow/consultations.json`, embedded in PR body |
| **Verdict required?** | No | Yes (strict: required before continuing; soft: recommended) |
| **Use case** | Quick judgment sanity-check | Proactive review (design/plan/code) + stuck recovery |

The two tools are **additive, not competitive**. The recommended flow for a high-uncertainty judgment call:
1. Call `advisor()` for a fast same-family check
2. If still uncertain after advisor, invoke `feature-flow:consult-codex` for a full external review with audit log

See `docs/plans/2026-04-14-codex-consultation.md` for the full codex-consultation design.
