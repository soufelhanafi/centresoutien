# Centre Soutien — Claude Code Skills

This bundle contains eight custom skills for the Centre Soutien Next.js landing page repo. They encode the coding standards, SEO discipline, i18n rules, RTL handling, and PII compliance procedures specific to this project.

## Installation

Extract this bundle into your repo at `.claude/skills/`:

```bash
unzip centre-soutien-skills.zip -d .claude/skills/
```

Final structure:

```
.claude/
└── skills/
    ├── solid-coding/SKILL.md
    ├── seo-audit/SKILL.md
    ├── i18n-add-string/SKILL.md
    ├── rtl-check/SKILL.md
    ├── shadcn-add-component/SKILL.md
    ├── add-landing-section/SKILL.md
    ├── pre-merge-check/SKILL.md
    └── founder-form-changes/SKILL.md
```

Reference them in your `CLAUDE.md`:

```markdown
## Skills available in this repo

- `solid-coding` — the default coding standard. Triggers on any code change.
- `seo-audit` — after any page or metadata change.
- `i18n-add-string` — whenever adding user-facing text.
- `rtl-check` — after any styling change.
- `shadcn-add-component` — the only way to add a shadcn primitive.
- `add-landing-section` — the standard procedure for new sections.
- `pre-merge-check` — before every PR merge.
- `founder-form-changes` — required for any change to the Founder form.
```

## The eight skills

| Skill | Triggers on | What it enforces |
|---|---|---|
| `solid-coding` | Any code change | SOLID, DRY, KISS, YAGNI, Server-first, TS strictness |
| `seo-audit` | Page or metadata change | Metadata, JSON-LD, hreflang, Lighthouse budgets |
| `i18n-add-string` | Adding user-facing text | FR + AR sync, key naming, ICU, no hardcoded strings |
| `rtl-check` | Any styling change | Logical Tailwind properties, icon mirroring, bidi handling |
| `shadcn-add-component` | Needing a new UI primitive | CLI install, no forking, extend via variants |
| `add-landing-section` | New landing section | Coordinates the other skills into one procedure |
| `pre-merge-check` | Before every merge | 14-step gate covering lint, types, build, SEO, RTL, PII |
| `founder-form-changes` | Touching the Founder form path | PII handling, loi 09-08 compliance, no logging |

## Order of authority

If two skills conflict (rare), the order of authority is:

1. `founder-form-changes` (legal exposure)
2. `pre-merge-check` (last line of defense)
3. `seo-audit` (business KPI)
4. `rtl-check` (correctness)
5. `i18n-add-string` (correctness)
6. `solid-coding` (quality)
7. `add-landing-section` (workflow)
8. `shadcn-add-component` (workflow)

## Maintaining the skills

Any time a bug ships to production that these skills should have caught, update the relevant skill to catch it next time. The skills evolve with the project.
