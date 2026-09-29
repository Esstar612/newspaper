# CLAUDE.md

## Working rules
- Show core code and where it will go before writing it.
- Size each PR so a reviewer can comfortably review it. Group related changes into one PR instead of opening one per small fix.
- Keep comments near zero. Add one only when the code can't say it.
- No attribution or co-author lines in BUILD_LOG.md or commit messages.
- No em dashes anywhere.
- No invented numbers. Every figure comes from a file, command output, or a cited source.
- No secrets or server-only keys reachable from client code.
- Ask before pushing, making paid or rate-limited API calls outside normal page loads, or writing to the database. That includes `/api/cron/*` and `/api/admin/*` ingestion, which write to the MongoDB database behind `MONGODB_URI`.

## Sizing
State the tier at the start of each task. When unsure, pick the higher one.
- Docs, comments, or config only: no plan review and no Cursor review. Run whatever checks apply.
- Small fix (no new behavior, a few lines): skip plan review. Run tests, checks, and the Cursor review.
- Feature, or anything touching API routes, `models/`, `lib/` data fetching, or keys: the full flow.

## Plan review loop
1. Save the plan to `docs/plans/<YYYY-MM-DD>-<step>.md`. Every plan step names the test that proves it.
2. Before showing the plan, have the `plan-reviewer` subagent review it. Call the subagent directly; `/plan-review` is for manual use and waits for the user.
3. Apply the required changes, then re-review. Stop when it approves, or after 3 rounds, showing any unresolved findings.
4. Stop and ask, without deciding, when a finding needs the user's decision.
5. Save every round verbatim to `docs/reviews/<YYYY-MM-DD>-<step>-r<round>.md`, where `<step>` matches the plan file and `<round>` starts at 1.
6. With the final plan, show the final verdict verbatim, the findings applied, and the findings rejected with the reason for each.

## Build and code review loop
1. Write each step's test first and confirm it fails, then implement until it passes. Until a test runner exists, the first feature plan sets up Vitest (and MSW or Playwright when a step needs them).
2. Run the tests, `npx tsc --noEmit`, and `npx eslint .`, and fix any failures.
3. Run `scripts/review.sh --plan docs/plans/<file>` (small fixes have no plan, so they omit `--plan`). Fix every correctness, rule, test, TypeScript, and plan-drift finding, then run it again. Stop at "No findings." or when only nitpicks remain, or after 3 rounds.
4. For UI changes, run `npm run dev` and open each affected page in the browser. Confirm it renders with real data and the console shows no errors.
5. Stop and ask when a finding needs the user's decision.
6. Hand over the change with the final review output verbatim, the findings fixed, the findings skipped with the reason for each, the test results, and what was checked in the browser.
