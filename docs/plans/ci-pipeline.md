# CI pipeline plan

Status: done (2026-11-14). Pipeline green on push + PR, ruleset "Protect main" active (verified: failing PR #2 was BLOCKED), Dependabot on. Remaining: user merges PR #1.

Goal: every push to any branch runs the pipeline, every pull request runs it too, and a PR into `main` can't be merged while the pipeline is red.

## Where we are

`.github/workflows/ci.yml` already exists (commit `706db1f`). It triggers on `push` (all branches) and `pull_request`, starts Postgres, and runs install, `prisma generate`, lint, typecheck, build and tests. It has not run on GitHub yet because it hasn't been pushed. Nothing on GitHub stops a red PR from being merged.

The repo is public, so Actions minutes and branch rules are free.

---

## Decision 0: how many jobs?

Reference: the TopsPizza FE GitLab pipeline puts all blocking checks (tsc, lint, Jest) in one `test` job. Separate jobs exist only for non-blocking checks (`type_coverage`, `dependency_audit`, both `allow_failure`). So jobs are split by "does it block the merge?", not by tool.

| | A. One blocking `ci` job + Dependabot | B. `ci` + non-blocking `pnpm audit` job | C. Separate lint/typecheck/test jobs + audit |
|---|---|---|---|
| Required checks on `main` | 1 (`ci`) | 1 | 3+, kept in sync with the rule |
| Vulnerability checks | Dependabot alerts + auto-fix PRs (GitHub built-in, no YAML) | Self-maintained, red ❌ on unrelated pushes when new advisories appear | Same as B |
| Installs per run | 1 | 2 | 3–4 |

**Pick A.** Same principle as the FE, with less to maintain. B re-implements what GitHub gives for free, and C multiplies installs and required checks for no gain at this size.

## Decision 1: when should the pipeline run?

| | A. Every push + every PR, cancel outdated runs | B. Push to `main` only + every PR | C. Every push only |
|---|---|---|---|
| Push to a branch with no PR | Runs | **Doesn't run** | Runs |
| PR | Runs (tests branch merged with `main`) | Runs | Only the branch's own push run |
| Duplicate runs | Push run + PR run for PR branches. That's useful: one tests the branch, the other tests it merged with `main` | None | None |
| Wasted runs when pushing twice quickly | Old run cancelled | Old run continues | Old run continues |

**Pick A.** It's the only one that meets "every push" and also checks the PR merged with the latest `main`. B skips branches without a PR. C never tests the merge result.

## Decision 2: how is "don't merge if red" enforced?

| | A. Ruleset on `main`: PR required + `ci` check must pass | B. No rule, reviewers look at the ✅/❌ | C. Ruleset + 1 required approval |
|---|---|---|---|
| Red PR can be merged | No, the button is blocked | Yes, by mistake | No |
| Solo developer | Works | Works | **Blocks you**: you can't approve your own PR |
| Effort | 2 min in GitHub settings | None | 2 min |

**Pick A.** It turns "please check the pipeline" into a hard rule. B relies on memory, and C locks a solo developer out. Approvals can be added later when there's a second reviewer.

## Decision 3: must a PR be up to date with `main` before merging?

| | A. Yes ("require branches to be up to date") | B. No | C. Merge queue |
|---|---|---|---|
| Guarantee | The tested code is exactly what lands on `main` | Two PRs that are green alone can break `main` together | Same as A, automated |
| Cost | Click "Update branch" sometimes, and CI re-runs | None | Setup; built for busy teams |

**Pick A.** It's cheap with few PRs and prevents "green PR, red main". B leaves that gap, and C is overkill for this team size.

---

## Steps

0. **Turn on Dependabot** (user, GitHub UI): Settings → Advanced Security (or "Code security") → enable **Dependabot alerts** and **Dependabot security updates**.
1. **Workflow tweaks** (implementer):
   - Add `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
   - Add `permissions: contents: read`, so the pipeline can only read the code.
   - Add `timeout-minutes: 15` on the job.
   - Add `.nvmrc` containing `24`, and switch setup-node to `node-version-file: .nvmrc`.
   - Keep the job id `ci`, because the branch rule refers to that name.
   - Verify: the YAML parses and `pnpm lint` passes.
2. **Push `feat/auth`** (user, or Claude when asked). Verify: the Actions tab shows a green run for the push.
3. **Open a PR** `feat/auth → main`. Verify: the PR shows the `ci` check, green.
4. **Create a ruleset on `main`** (user, GitHub UI: Settings → Rules → Rulesets → New branch ruleset):
   - Target: default branch (`main`). Enforcement: Active. Bypass list: **empty**, so the owner can't bypass either.
   - ✅ Restrict deletions, ✅ Block force pushes.
   - ✅ Require a pull request before merging (required approvals: 0).
   - ✅ Require status checks to pass → add `ci` → ✅ Require branches to be up to date before merging.
5. **Prove the gate works:**
   - Push a throwaway branch with a deliberately failing test and open a PR.
   - Confirm the merge button is blocked.
   - Close the PR and delete the branch.
6. Merge the `feat/auth` PR once it's green.

## Decisions log

| # | Decision | Chosen |
|---|---|---|
| 0 | Job layout | One blocking `ci` job + Dependabot alerts/security updates (not a self-run audit job, not per-tool jobs) |
| 1 | Triggers | Every push + every PR, cancel outdated runs per branch (not `main`-only push, not push-only) |
| 2 | Enforcement | Ruleset on `main`: PR required + `ci` check required, 0 approvals (not reviewer discipline, not required approval) |
| 2b | Bypass | Nobody, not even the owner. Emergency = temporarily disable the ruleset (not owner bypass, not PR-only bypass) |
| 2c | Node version source | `.nvmrc` read by CI via `node-version-file` (not `engines` only, not hardcoded in CI) |
| 2d | Dependency updates | Dependabot security updates only, no `dependabot.yml` version updates (not grouped weekly, not ungrouped weekly) |
| 2e | Who runs GitHub steps | Claude via `gh` (push, PR, ruleset via API, Dependabot, gate test). User only merges |
| 2f | Job naming | Job id `quality-gate`, display name "Lint, typecheck, build & test" (ruleset requires the display name). Future deploy job: `deploy`, `needs: quality-gate`, `main` only (rejected: `ci`, `checks`, `verify`, step-list names) |
| 3 | Up to date with `main` | Required (not optional, not merge queue) |
