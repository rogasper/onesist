# Vendored Skills

Skills copied from upstream repositories so project installs are deterministic
and offline. `installProjectSkills` copies these directories into an opened
project's `.agents/skills/<name>/`.

To update, re-clone the upstream repo, diff `vendor/skills/<name>/`, and update
the commit SHA below.

| Skill | Source | Commit |
|-------|--------|--------|
| fsd-analyzer | https://github.com/rogasper/system-analyst-skill | `593cd5617ab6abfe3fb2204d52ad13e256c7fcad` |
| markitdown | https://github.com/julianobarbosa/claude-code-skills (skills/markitdown) | `ac701ada10169dc2a7008cb3f8279acdfb3846f5` |
