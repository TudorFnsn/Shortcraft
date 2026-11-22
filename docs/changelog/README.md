# Changelog fragments

Every PR used to add its changelog line at the top of `TheMasterPlan.md` §10. All open
PRs edited the same line, so merging one put every other open PR in conflict (on
2026-10-22, 8 of 10 open PRs conflicted with `main`, all on that line).

**Rule:** a PR adds its changelog line as a new file here instead of editing §10.

- Name: `YYYY-MM-DD-<slug>.md` (slug: lowercase letters, digits, dashes), e.g.
  `2026-10-22-changelog-fragments.md`.
- Content: exactly one line, the same bullet §10 uses:
  `- **2026-10-22** — What changed and why. +N tests (total). (CEO routine)`
- Still update the rest of TheMasterPlan.md (roadmap status, risks, decisions) in the
  same PR; only the changelog line moves here.

`npx tsx scripts/changelog.mts` validates the files and prints them newest first, so
the pending entries are readable before they are folded. `tests/lib/changelog.test.ts`
fails CI on a malformed fragment.

**Folding:** once a week (or when several PRs have merged), one PR runs
`npx tsx scripts/changelog.mts --fold`, which inserts the lines into §10 below the
fold marker, newest first, and deletes the files. Only a fold PR edits §10's list.
