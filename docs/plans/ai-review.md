# AI PR review plan

Status: step 3 done (2026-11-14). `.github/workflows/claude-review.yml` written and reviewed, not committed. Next: step 4 (local review of PR #1).

Goal: any pull request can get an AI code review (bugs + security + project conventions) posted on the PR by commenting `@claude review`, without spending quota on unfinished code and without blocking merges.

## Where we are

- `.github/workflows/ci.yml` runs the blocking `quality-gate` job (lint, typecheck, build, test). The "Protect main" ruleset requires it. `ci.yml` is only on `feat/auth`, so `main` has no CI yet.
- The user is on a **Claude Pro** subscription, with no Anthropic API key.
- Done: `claude setup-token` was run, and the repo secret `CLAUDE_CODE_OAUTH_TOKEN` is set (verified with `gh secret list`).
- Done: the Claude GitHub App is installed on `servio-be` only.

## How it works

`anthropics/claude-code-action@v1` starts Claude Code on GitHub's runner. It logs in with `CLAUDE_CODE_OAUTH_TOKEN`, the long-lived token from the Pro account, so runs count against the same Pro usage limit as local sessions. There's no per-run bill. It reads the PR diff and the repo's `CLAUDE.md`, then posts comments through the Claude GitHub App.

Checked in the docs: `claude-code-action` accepts `claude_code_oauth_token`. `claude-code-security-review` accepts only `claude-api-key`, so it can't be used on Pro.

---

## Decision 1: how do we get both a general review and a security review?

| | A. One action, prompt covers both | B. Two separate jobs (general + security) | C. `claude-code-action` + `claude-code-security-review` |
|---|---|---|---|
| Effort | 1 workflow, 1 job | 1 workflow, 2 jobs | 1 workflow, 2 jobs |
| Pro quota per review | 1 run | 2 runs | 1 run + API bill |
| Works on Pro | Yes | Yes | **No**, the security action needs an API key |
| Long-term cost | One prompt to maintain | Two prompts, double quota | Pay-per-use billing |

**Pick A.** B uses up quota twice as fast. C doesn't work without a paid API key.

## Decision 2: when does the review run? (changed while grilling)

| | A. Every push to a PR | B. PR opened / reopened / ready + `@claude` re-review | C. Only when someone comments `@claude review` |
|---|---|---|---|
| Quota | High: every push is a run | Medium; the first run often hits unfinished code | Lowest: only when asked |
| Fits "open PR early, keep pushing" | No | Partly | Yes |
| Downside | Burns quota | Wasted first run | You have to remember to ask |

**Pick C.** The user opens PRs early and keeps pushing, so only the author knows when the code is ready. Comments that don't contain `@claude review` do nothing. This also makes a second "free-form @claude assistant" job unnecessary: one job, one fixed review prompt.

## Decision 3: what does the output look like?

| | A. Inline comments on lines + one summary comment | B. One summary comment only | C. Formal GitHub review ("Request changes") |
|---|---|---|---|
| Readability | Best, feedback next to the code | Long single comment to scroll | Good |
| Side effects | None | None | AI "changes requested" state on the PR |

**Pick A.** C adds a review state that a solo developer then has to dismiss. B is harder to act on.

## Decision 4: does the review block merging?

Not blocking. It lives in a separate workflow file, `claude-review.yml`, and isn't added to the "Protect main" ruleset. This follows the CI principle of splitting jobs by "blocks merge?": the AI review is informational, so a hit Pro limit or a flaky run never stops a merge.

## Decision 5: how does PR #1 (`feat/auth`) get reviewed? (grilled)

Comment-triggered workflows only run from `main`, and `main` doesn't have `claude-review.yml` yet.

| | A. New branch from `main` with only the workflow, merge first | B. Disable "Protect main" briefly to merge the workflow | C. Add the workflow on `feat/auth`, review PR #1 locally, then merge PR #1 |
|---|---|---|---|
| Works | **No**: `main` has no `ci.yml`, so the required `quality-gate` never runs and the PR can't merge. Copying `ci.yml` in would fail too, because `main` lacks the test setup | Yes | Yes |
| Breaks rules | No | Yes, the bypass is for emergencies only | No |
| PR #1 reviewed | — | In CI | Locally (`/code-review` + `/security-review`), same Pro quota |

**Pick C.** Merging PR #1 brings both `ci.yml` and `claude-review.yml` to `main`, and every later PR gets `@claude review`.

---

## Steps

1. ~~User: `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`.~~ Done.
2. ~~User: install the Claude GitHub App on `servio-be` only.~~ Done.
3. Implementer: add `.github/workflows/claude-review.yml` on `feat/auth`:
   - Trigger: `issue_comment` (`created`). The job runs only when the comment is on a PR and the body contains `@claude review`.
   - Only users with write access can trigger it (the action's default; keep it).
   - Skip fork PRs (grilled Q5): a first step looks up the PR, and the job stops unless the head repo equals the base repo. This guards against prompt injection in a stranger's code leaking `CLAUDE_CODE_OAUTH_TOKEN`. Rejected: trusting the owner to never tag a bad PR, and a capped API key (no API key on Pro).
   - Permissions: `contents: read`, `pull-requests: write`, `issues: write`, `id-token: write`.
   - Concurrency group per PR with cancel-in-progress, plus a `timeout-minutes` limit.
   - `issue_comment` runs check out `main` by default, so the job must review the **PR's code**: use `gh pr diff` and/or check out the PR head.
   - `anthropics/claude-code-action@v1` with `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` and a fixed review prompt.
   - Prompt covers correctness bugs, security (auth, JWT/tokens, OTP, injection, secrets, rate limiting, error leakage), project conventions from `CLAUDE.md`, and missing tests. Output goes to inline comments plus one summary, with no praise or filler.
   - Re-reviews (grilled Q4): review the whole PR, but first read the existing comments (`gh pr view --comments`) and don't repeat issues already flagged. The summary lists earlier issues as fixed / still open. Rejected: reviewing from scratch (duplicate comments), and reviewing only new commits (misses new code breaking old code).
   - Skip machine-made files (grilled Q7): `pnpm-lock.yaml`, `dist/`, the generated Prisma client. Still review `prisma/schema.prisma` and migration SQL. Rejected: reading everything (lockfile burns quota) and `src/` only (misses schema, migration, CI and config bugs).
   - Model (grilled Q6): `--model claude-sonnet-5-5` in `claude_args`, the latest Sonnet. It balances review quality and Pro quota. Rejected: Opus (drains Pro limits) and Haiku (misses subtle bugs). For big or risky PRs, run `/code-review` locally with a bigger model.
   - `--allowedTools` limited to inline-comment, `gh pr comment`, `gh pr diff` and `gh pr view`.
4. Review PR #1 locally: `/code-review high 1` + `/security-review` on `feat/auth`. Fix the findings.
5. Main session: record the decisions in memory.
6. User merges PR #1.
7. Verify on the next real PR: comment `@claude review`, then check that it runs, posts inline comments + a summary, ignores comments without the phrase, and leaves `quality-gate` unaffected.

## Known limits

- Public repo: only users with write access can trigger it, and PRs from forks are skipped. Comment events run with the repo's secrets, so fork code is never reviewed while holding the token.
- Dependabot PRs aren't reviewed unless the owner comments `@claude review`, and that works because the comment is the owner's event.
- Pro usage is shared with local Claude Code sessions. Heavy local use can hit the limit, and that run fails without blocking the merge.
