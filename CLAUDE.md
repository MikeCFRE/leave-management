@AGENTS.md

# gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

To install gstack (one-time per machine):
```
git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Available gstack skills:
- `/office-hours` — engineering office hours / async Q&A
- `/plan-ceo-review` — prepare plan for CEO review
- `/plan-eng-review` — prepare plan for eng review
- `/plan-design-review` — prepare plan for design review
- `/design-consultation` — design consultation session
- `/review` — code review
- `/ship` — ship a feature end-to-end
- `/land-and-deploy` — land and deploy changes
- `/canary` — canary deploy
- `/benchmark` — run benchmarks
- `/browse` — web browsing (use this for ALL web browsing)
- `/qa` — QA a feature
- `/qa-only` — QA only (no shipping)
- `/design-review` — design review
- `/setup-browser-cookies` — set up browser cookies
- `/setup-deploy` — set up deploy pipeline
- `/retro` — retrospective
- `/investigate` — investigate an issue
- `/document-release` — document a release
- `/codex` — codex agent
- `/cso` — CSO agent
- `/autoplan` — auto-plan a feature
- `/careful` — careful/cautious mode
- `/freeze` — freeze deployments
- `/guard` — guard against regressions
- `/unfreeze` — unfreeze deployments
- `/gstack-upgrade` — upgrade gstack
