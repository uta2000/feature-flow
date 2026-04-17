# Modes

| Mode | Tier | Goal | Current state | Question |
|---|---|---|---|---|
| review-design | soft | Design doc summary | Full design doc text inline | Identify unstated assumptions, missing edge cases, internal contradictions, vague requirements. |
| review-plan | soft | Design doc summary + path | Plan file with tasks + acceptance criteria inline | For each task, assess whether criteria are sufficient to prove behavior — not just existence. |
| review-code | soft | Design doc summary + path | `git diff <base>..HEAD` truncated to 8 KB + changed files list | Does this diff realize the design? Any quality issues? Any drift from stated design? |
| stuck | strict | Current in-flight task from plan | Failing signal with sample output | What's actually wrong? What approach hasn't been tried? Is the task approach flawed? |

Strict tier = reactive `stuck` mode only. It uses the PreToolUse verdict-gate hook to block non-verdict Skill calls until the verdict is recorded. Soft tier = all proactive modes; missing verdict surfaces as `<not recorded>` in PR metadata.
