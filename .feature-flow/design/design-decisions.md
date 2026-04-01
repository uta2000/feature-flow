# Design Decisions

## Key Decisions
- **Scan + infer capabilities:** Replace hardcoded checks with dynamic scanning + keyword classification
- **Persisted registry:** Store plugin_registry in .feature-flow.yml with diff-based change detection
- **Keyword matching:** Classify via keywords on plugin.json + descriptions — predictable, no token cost
- **Any lifecycle step:** 8 lifecycle roles, not just code review
- **Base + discovered:** 5 base plugins with hardcoded roles; discovery extends beyond
- **Marketplace-namespaced keys:** <marketplace>/<plugin-name> prevents collisions
- **Error handling split:** Throw for required base, warn for optional/discovered
- **Content hash fast path:** SHA-256 per plugin.json to skip unchanged plugins
- **Settings integration:** New Plugins category in /settings

## Rejected Alternatives
- **LLM classification:** Token cost, hallucination risk
- **Explicit metadata field:** Requires third-party adoption
- **In-memory only:** Plugins don't change often; persist to avoid redundant scans

## Open Questions
- [ ] None — all resolved during brainstorming and verification
