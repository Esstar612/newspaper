# CLAUDE.md

## Working rules
- Show core code and where it will go before writing it.
- Never run commands. Give the exact command; the user runs it and pastes the output back.
- Keep PRs small and stacked, one step per PR.
- Keep comments near zero. Add one only when the code can't say it.
- No attribution or co-author lines in BUILD_LOG.md or commit messages.
- No em dashes anywhere.

## Plan reviews
- Save every plan review verbatim to `docs/reviews/<YYYY-MM-DD>-<step>-r<round>.md`, where `<step>` is a short slug for the build step and `<round>` starts at 1 for each step.
