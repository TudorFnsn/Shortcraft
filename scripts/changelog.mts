/**
 * Changelog fragments (rules in `src/lib/changelog.ts` and `docs/changelog/README.md`).
 *
 * Run: npx tsx scripts/changelog.mts           (validate + print pending entries, newest first)
 *      npx tsx scripts/changelog.mts --fold    (move them into TheMasterPlan.md §10 and delete
 *                                               the files; do this in its own PR, never a feature PR)
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  FRAGMENT_DIR,
  foldFragments,
  parseFragment,
  sortFragments,
  type Fragment,
} from '@/lib/changelog';

const dir = resolve(FRAGMENT_DIR);
const fragments: Fragment[] = [];
const problems: string[] = [];
for (const name of readdirSync(dir)) {
  if (name === 'README.md' || !name.endsWith('.md')) continue;
  const parsed = parseFragment(name, readFileSync(join(dir, name), 'utf8'));
  if (parsed.ok) fragments.push(parsed.value);
  else problems.push(parsed.error);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

if (!process.argv.includes('--fold')) {
  for (const f of sortFragments(fragments)) console.log(f.line);
  console.log(`\n${fragments.length} pending fragment(s).`);
  process.exit(0);
}

const planPath = resolve('TheMasterPlan.md');
const folded = foldFragments(readFileSync(planPath, 'utf8'), fragments);
if (!folded.ok) {
  console.error(folded.error);
  process.exit(1);
}
writeFileSync(planPath, folded.value);
for (const f of fragments) rmSync(join(dir, f.name));
console.log(`Folded ${fragments.length} fragment(s) into TheMasterPlan.md §10.`);
