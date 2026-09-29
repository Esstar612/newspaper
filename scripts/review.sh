#!/usr/bin/env bash
# Read-only Cursor review of a diff against the project rules and, optionally, the approved plan.
# Usage: scripts/review.sh [--plan FILE] [BASE] [PATH...]   (BASE defaults to HEAD: uncommitted changes)
set -euo pipefail

# Pinned to a non-Claude model so code review adds a perspective the Claude builder and plan reviewer lack.
REVIEW_MODEL="gpt-5.6-sol-high"
cd "$(git rev-parse --show-toplevel)"
plan=""
if [ "${1:-}" = "--plan" ]; then
  plan="${2:?--plan needs a file}"
  shift 2
  [ -f "$plan" ] || { echo "Plan file not found: $plan" >&2; exit 1; }
fi
base="${1:-HEAD}"
[ $# -gt 0 ] && shift
paths=("$@")
[ ${#paths[@]} -eq 0 ] && paths=(app components lib models tests e2e scripts .claude CLAUDE.md)

diff_file="$(mktemp "${TMPDIR:-/tmp}/cursor-review.XXXXXX")"
trap 'rm -f "$diff_file"' EXIT
git diff "$base" -- "${paths[@]}" > "$diff_file"
while IFS= read -r f; do
  git diff --no-index /dev/null "$f" >> "$diff_file" || true
done < <(git ls-files --others --exclude-standard -- "${paths[@]}")
if [ ! -s "$diff_file" ]; then
  echo "Nothing to review against $base."
  exit 0
fi
echo "Reviewing $(grep -c '^diff --git' "$diff_file") changed files against $base with $REVIEW_MODEL ..."

plan_intro=""
plan_check=""
if [ -n "$plan" ]; then
  plan_intro=" The approved plan is at $plan. Read it too."
  plan_check="
6. Plan drift: steps in the plan missing from the diff, changes the plan did not call for, and code that does something different from what the plan says."
fi

cursor-agent -p --mode ask --trust --model "$REVIEW_MODEL" --output-format text "You are reviewing a change to a Next.js news site. This is a review only: do not edit any file and do not run commands that change anything.

Read the diff at $diff_file, then read CLAUDE.md and whichever files the diff touches.$plan_intro

Report findings most severe first, as a numbered list. For each: file:line, the problem in one sentence, and a concrete failure scenario (inputs or state leading to a wrong result or crash).

Look for:
1. Correctness bugs.
2. Violations of the project rules in CLAUDE.md, especially: no invented numbers; no em dashes; near-zero comments; no secrets or server-only keys reachable from client code.
3. Test problems: assertions on mocks instead of behavior, MSW handlers that don't match the real API's response shape, real network calls in tests, Playwright timing waits or fragile selectors.
4. TypeScript problems: any, unchecked casts, or unhandled null and undefined.
5. New behavior without a test.$plan_check

Do not report style preferences or restate what the code does. If there are no correctness findings, write exactly: No findings. Then still add the section below.

After all correctness findings, add a final section titled \"Simplification (optional)\":
- At most 3 items: redundant code, duplicated logic, or functions that can be made shorter or clearer without changing behavior.
- If nothing is worth changing, write: none.
These items never block an approval."
