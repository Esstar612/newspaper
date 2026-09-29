# Code review script and a complete build workflow

## Context
The flow so far is: plan, `/plan-review`, implement, Cursor code review, commit. The user wants Claude to run the Cursor review itself and re-run it until clean, in place of the old rule where the user ran every command. The user also asked for improvements to the flow and approved seven: three fixes and four new ideas.
- Fixes: a narrow guard to replace the command ban; typecheck and lint before Cursor; an automatic plan review loop, as in CUAD.
- New ideas: tests as the main gate; checking the diff against the plan; running the app before commit; scaling the process to the size of the change.

The weakness these address: until now every gate was an LLM's opinion. Tests and a run of the real app add executable evidence, and the plan check links the two review stages.

Branch: `chore/plan-reviewer` (clean; commit `2ee9592` added `CLAUDE.md` and the plan reviewer files).

## Files

### 1. `scripts/review.sh` (new, `chmod +x`)
This is the approved draft with one addition: an optional `--plan FILE` first argument.
- Usage becomes `scripts/review.sh [--plan FILE] [BASE] [PATH...]`.
- Parsing: `plan=""; if [ "${1:-}" = "--plan" ]; then plan="$2"; shift 2; fi` goes before `base=`. The script exits with an error if the file doesn't exist.
- When a plan is given, the prompt says: "The approved plan is at $plan. Read it too." The script also adds a sixth item to the Look-for list: "6. Plan drift: steps in the plan missing from the diff, changes the plan did not call for, and code that does something different from what the plan says."
- Everything else is unchanged: `gpt-5.6-sol-high`, `--mode ask --trust`, no `--force`, and the same default paths, untracked-file handling, and "Nothing to review" message.

### 2. `CLAUDE.md` (rewritten sections)
**Working rules**
- Remove "Never run commands."
- Add "No invented numbers. Every figure comes from a file, command output, or a cited source."
- Add "No secrets or server-only keys reachable from client code."
- Add "Ask before pushing, making paid or rate-limited API calls outside normal page loads, or writing to the database. That includes `/api/cron/*` and `/api/admin/*` ingestion, which write to the MongoDB database behind `MONGODB_URI`." (The NewsAPI, NYT, OpenWeatherMap, and marketdata.app keys in `.env.example` are all rate-limited.)

**Sizing** (state the tier at the start of each task; when unsure, pick the higher one)
- Docs, comments, or config only: no plan review and no Cursor review. Run whatever checks apply.
- Small fix (no new behavior, a few lines): skip plan review. Run tests, checks, and the Cursor review.
- Feature, or anything touching API routes, `models/`, `lib/` data fetching, or keys: the full flow.

**Plan review loop** (full tier)
1. Save the plan to `docs/plans/<YYYY-MM-DD>-<step>.md`. Every plan step names the test that proves it.
2. Before showing the plan, have the `plan-reviewer` subagent review it. Call the subagent directly; `/plan-review` stays for manual use and waits for the user.
3. Apply the required changes, then re-review. Stop when it approves, or after 3 rounds, showing any unresolved findings.
4. Stop and ask, without deciding, when a finding needs the user's decision.
5. Save every round verbatim to `docs/reviews/<YYYY-MM-DD>-<step>-r<round>.md`. This replaces the current "Plan reviews" section.
6. With the final plan, show the final verdict verbatim, the findings applied, and the findings rejected with a reason for each.

**Build and code review loop**
1. Write each step's test first and confirm it fails, then implement until it passes. Until a test runner exists, the first feature plan sets up Vitest (and MSW or Playwright when a step needs them).
2. Run the tests, `npx tsc --noEmit`, and `npx eslint .`, and fix any failures. (`npm run lint` calls `next lint`, which Next 16.1.6 removed. Fixing the npm script is a separate small PR.)
3. Run `scripts/review.sh --plan docs/plans/<file>` (small fixes have no plan, so they omit `--plan`). Fix every correctness, rule, test, TypeScript, and plan-drift finding, then run it again. Stop at "No findings." or when only nitpicks remain, or after 3 rounds.
4. For UI changes, run `npm run dev` and open each affected page in the browser. Confirm it renders with real data and the console shows no errors.
5. Stop and ask when a finding needs the user's decision.
6. Hand over the change with: the final review output verbatim, the findings fixed, the findings skipped with a reason for each, the test results, and what was checked in the browser.

### 3. `.claude/agents/plan-reviewer.md`
- Item 7: replace "commands given rather than run" with "sizing tier stated, and code review loop included before commit".
- Item 9: replace "Missing tests." with "Missing tests: any step that does not name the test that proves it, or a test that is not written before the code."

### 4. Commit
One commit on `chore/plan-reviewer`, with no co-author line.

## Verification
- `bash -n scripts/review.sh`.
- Run `scripts/review.sh --plan <this plan copied to docs/plans/2026-09-29-review-workflow.md>` on the uncommitted change. This exercises the new flag and the plan-drift check. Apply the loop to its output, up to 3 rounds.
- Run `npx tsc --noEmit` and `npx eslint .` once, to confirm the loop commands work. Report any errors that already exist, but don't fix them here.
- A grep for em dashes across the changed files returns 0, and `git log -1 --format=%B` shows no co-author line.
- If `cursor-agent` fails (auth or sandbox network), report the exact error and don't commit.
