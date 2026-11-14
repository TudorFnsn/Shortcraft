/**
 * Changelog fragments: each PR adds its changelog line as its own file in
 * `docs/changelog/` instead of inserting it at the top of TheMasterPlan.md §10.
 * Every open PR used to edit the same line, so merging one put all the others
 * in conflict. New files never conflict; a separate fold PR moves them into §10.
 *
 * Fragment rules: file name `YYYY-MM-DD-<slug>.md` (slug: lowercase letters,
 * digits, dashes), content exactly one bullet `- **YYYY-MM-DD** — …` whose date
 * matches the file name.
 */

import { err, ok, type Result } from '@/lib/result';

export const FRAGMENT_DIR = 'docs/changelog';
/** §10 line the fold inserts after; newest entries sit right below it. */
export const FOLD_MARKER = '<!-- changelog:fold-here -->';

const NAME_RE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export type Fragment = { readonly name: string; readonly date: string; readonly line: string };

function isRealDate(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Validates one fragment file; the error says what to fix. */
export function parseFragment(name: string, content: string): Result<Fragment, string> {
  const m = NAME_RE.exec(name);
  if (!m || !m[1]) return err(`${name}: name must be YYYY-MM-DD-<slug>.md`);
  const date = m[1];
  if (!isRealDate(date)) return err(`${name}: ${date} is not a real date`);
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length !== 1 || !lines[0]) return err(`${name}: must hold exactly one line`);
  const line = lines[0].trimEnd();
  if (!line.startsWith(`- **${date}** — `)) {
    return err(`${name}: line must start with "- **${date}** — "`);
  }
  return ok({ name, date, line });
}

/** Newest first; same day falls back to the file name so the order is stable. */
export function sortFragments(fragments: readonly Fragment[]): Fragment[] {
  return [...fragments].sort((a, b) =>
    a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date),
  );
}

/** Inserts the fragments' lines right after the fold marker in the plan text. */
export function foldFragments(
  plan: string,
  fragments: readonly Fragment[],
): Result<string, string> {
  const lines = plan.split('\n');
  const at = lines.findIndex((l) => l.trim() === FOLD_MARKER);
  if (at === -1) return err(`fold marker ${FOLD_MARKER} not found`);
  if (fragments.length === 0) return ok(plan);
  const entries = sortFragments(fragments).map((f) => f.line);
  // Keep a blank line between the marker and the list, as markdown expects.
  const rest = lines.slice(at + 1);
  while (rest[0]?.trim() === '') rest.shift();
  return ok([...lines.slice(0, at + 1), '', ...entries, ...rest].join('\n'));
}
