# Patterns Found

## Existing Patterns

### Skills — Frontmatter
- Order: name → description → tools → ---
- name: matches directory name (hyphenated)
- description: starts with trigger phrases ("Use when asked to...", "Surface and verify...")
- tools: comma-separated, only declare what the skill uses

### Skills — File Structure
- SKILL.md (H1 title → "When to Use" → "When to Skip" → "Process" → numbered Steps → Quality Rules → Additional Resources)
- references/ subdirectory for reusable patterns
- No per-skill CLAUDE.md files

### Agent Dispatch Pattern (from design-verification)
- Task(subagent_type: "Explore", model: "haiku") for read-only extraction
- Task(subagent_type: "general-purpose", model: "haiku") for verification with Bash/curl
- All agents in single parallel message
- Failure: retry once, then skip/mark UNAVAILABLE

### Reference Files
- Markdown tables for structured data
- Code blocks with bash for verification commands
- H2 for categories, H3 for sub-categories

## How to Code This (per task)

### Task 1: assumption-patterns.md
- Follow pattern from: `skills/spike/references/assumption-patterns.md` (table format, section headings)
- Use H2 for categories, bash code blocks for verification commands
- Content from spec file: feature-flow-assumption-verification.md

### Task 2: discovery-endpoints.md
- Follow pattern from: `skills/design-verification/references/checklist.md` (category groupings)
- Use code blocks for endpoint patterns, tables for cloud services
- Content from spec file: feature-flow-assumption-verification.md

### Task 3: SKILL.md
- Follow frontmatter from: `skills/design-verification/SKILL.md` (name, description with triggers, tools including Task)
- Follow process structure from: `skills/spike/SKILL.md` (numbered steps, assumption categories, YOLO behavior)
- Agent dispatch syntax from: `references/tool-api.md`
- YOLO format: `YOLO: surface-assumptions — [decision] → [action]` (Unicode arrow)

## Anti-Patterns Found
- None flagged — this is markdown-only skill creation
