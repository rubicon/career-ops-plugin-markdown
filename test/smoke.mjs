// Zero-network smoke test. Verifies the manifest/index hook contract, the CV
// Markdown hierarchy parsing (including #### nested sub-roles), and that the
// engine emits a clean, deterministic, structurally sane Markdown resume. Run by
// CI and by `plugins.mjs add` at install time. Uses only allowlisted node:
// builtins.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCvMarkdown, buildCvMarkdown } from '../lib/cv-markdown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const KINDS = ['provider', 'ingest', 'search', 'notify', 'export'];

// --- Manifest / index hook contract (the template's baseline check) ---------
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const mod = await import(path.join(root, manifest.entry || 'index.mjs'));
const hooks = mod.default;

assert(hooks && typeof hooks === 'object', 'default export must be an object of hooks');
const keys = Object.keys(hooks);
assert(keys.length > 0, 'declare at least one hook');
for (const k of keys) assert(KINDS.includes(k), `unknown hook "${k}"`);
for (const h of manifest.hooks)
  assert(keys.includes(h), `manifest declares hook "${h}" but index.mjs does not export it`);
assert(typeof hooks.export === 'function', 'export hook must be a function');
assert(manifest.humanInTheLoop === true, 'humanInTheLoop must be true');

// --- Hierarchy parsing on the bundled non-personal fixture ------------------
const md = readFileSync(path.join(root, 'examples', 'cv-fractional-example.md'), 'utf8');
const cv = parseCvMarkdown(md);

assert.equal(cv.name, 'Priya Okonkwo-Reyes', 'H1 should parse to the name (label stripped)');
assert(cv.contact.length >= 3, 'contact block should carry several fields');
const titles = cv.sections.map((s) => s.title);
for (const t of [
  'Professional Summary',
  'Experience',
  'Selected Projects',
  'Education',
  'Skills',
]) {
  assert(titles.includes(t), `missing section "${t}"`);
}

const exp = cv.sections.find((s) => s.title === 'Experience');
const umbrella = exp.blocks.find(
  (b) => b.type === 'entry' && /Reyes Systems Studio/.test(b.company),
);
// An entry and a sub-role hold one ordered content run, so that a code block
// written among their bullets keeps its place. Bullets are counted out of it.
const bulletsOf = (holder) => holder.content.filter((b) => b.type === 'bullet');

assert(umbrella, 'umbrella entry not found');
assert.equal(umbrella.subroles.length, 3, 'umbrella should hold 3 nested #### sub-roles');
assert(/Lumen Health/.test(umbrella.subroles[0].title), 'first sub-role title wrong');
assert.equal(umbrella.subroles[0].date, '2023-2024', 'sub-role date wrong');
assert.equal(bulletsOf(umbrella.subroles[0]).length, 3, 'sub-role should keep its own bullets');

const standard = exp.blocks.find((b) => b.type === 'entry' && /Brightloom/.test(b.company));
assert(standard, 'standard entry not found');
assert.equal(standard.subroles.length, 0, 'a ### with no #### should have no sub-roles');
assert(
  standard.role && standard.date && bulletsOf(standard).length === 3,
  'standard role should keep role/date/bullets',
);

// --- Output validity: a clean, structurally sane Markdown resume ------------
const out = buildCvMarkdown(md);
assert(typeof out === 'string' && out.length > 500, 'output should be a non-trivial string');

// Exactly one top-level heading (MD025).
const h1Count = out.split('\n').filter((l) => /^#\s/.test(l)).length;
assert.equal(h1Count, 1, 'resume must have exactly one H1');

// Ends with a single trailing newline (MD047), no trailing whitespace (MD009),
// no tab characters, and no consecutive blank lines (MD012).
assert(out.endsWith('\n') && !out.endsWith('\n\n'), 'output should end with exactly one newline');
assert(!/[ \t]+\n/.test(out), 'no trailing spaces on any line (MD009)');
assert(!/\t/.test(out), 'no tab characters in the output');
assert(!/\n\n\n/.test(out), 'no consecutive blank lines (MD012)');

// No em-dash or en-dash survives; dates render on the heading line via " -- ".
assert(!/[—–]/.test(out), 'no em-dash or en-dash in the rendered resume');
assert(out.includes('### Reyes Systems Studio'), 'umbrella heading should render');
assert(/#### Lumen Health.* -- .*2023-2024/.test(out), 'sub-role heading should carry its date');

// Deterministic: identical input yields identical bytes.
const again = buildCvMarkdown(md);
assert.equal(out, again, 'output should be deterministic for identical input');

// --- Nesting before the first ## section ------------------------------------
// A ### / #### above the first ## has no parent section to attach to. Headings
// written up there are lifted by one fixed amount, so sibling headings always
// render at the same level as each other, and the body under them stops being
// mistaken for another contact field.
//
// The identity-bearing lines (the H1 and the contact field) are taken from the
// bundled non-personal fixture rather than written inline, so no test input
// carries a name or an address of its own. Everything else below is generic
// structure with no personal data in it.
const fixtureLines = md.split('\n');
const fixtureH1 = fixtureLines.find((l) => l.startsWith('# '));
const fixtureContactLine = fixtureLines.find((l) => l.startsWith('**Email:**'));
assert(fixtureH1 && fixtureContactLine, 'fixture must supply an H1 and an email contact line');
const fixtureEmail = fixtureContactLine.replace(/^\*\*Email:\*\*\s*/, '');
// The H1 as the renderer emits it (the "CV --" label stripped), taken from the
// fixture parse above so no expected output has to restate a name of its own.
const renderedH1 = `# ${cv.name}`;

/**
 * Tag every line of a rendered document with whether it sits inside a fenced
 * block, so the helpers below never read code as structure. A block closes only
 * on a run of the same fence character at least as long as the one that opened
 * it, and only when nothing but whitespace follows -- the same rule the parser
 * applies, so a `## ` or a shorter backtick run written inside a block stays
 * code here too.
 */
function scanFences(out) {
  const rows = [];
  let fence = null;
  for (const line of out.split('\n')) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      rows.push({ line, fenced: true });
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !m[2].trim()) fence = null;
      continue;
    }
    rows.push({ line, fenced: m !== null });
    if (m) fence = m[1];
  }
  return rows;
}

/**
 * Every heading line of a rendered document, in order, outside fenced blocks.
 * Asserting the whole list pins each heading's level, which is what the promotion
 * is for: it catches a heading that vanished, one that survived at the wrong
 * level, and any jump of more than one level (MD001), in one comparison that
 * cannot be satisfied by a document that simply has less in it.
 */
function renderedHeadings(out) {
  return scanFences(out)
    .filter((r) => !r.fenced && /^#{1,6}\s/.test(r.line))
    .map((r) => r.line);
}

/**
 * Return the body of a rendered `## Title` section, or null when the rendered
 * document has no such section. Section-scoped so an assertion cannot be
 * satisfied by content that landed somewhere else entirely (a mangled contact
 * line, say) instead of under the heading it belongs to.
 */
function renderedSection(out, title) {
  const rows = scanFences(out);
  const start = rows.findIndex((r) => !r.fenced && r.line === `## ${title}`);
  if (start === -1) return null;
  let end = rows.length;
  for (let i = start + 1; i < rows.length; i += 1) {
    if (!rows[i].fenced && /^## /.test(rows[i].line)) {
      end = i;
      break;
    }
  }
  return rows
    .slice(start + 1, end)
    .map((r) => r.line)
    .join('\n')
    .trim();
}

// The two helpers above decide whether every assertion below can fail at all, so
// they are checked against documents that must make them fire. A helper that
// silently never fires is indistinguishable from one that works.
const FENCE = '`'.repeat(3);
const helperProbe = [
  '# Name',
  '',
  '## Real',
  '',
  `${FENCE}text`,
  '## Fake',
  `${FENCE}yaml`,
  '### Hidden',
  FENCE,
  '',
  '- body',
].join('\n');
assert.equal(
  renderedSection(helperProbe, 'Fake'),
  null,
  'renderedSection must not accept a ## written inside a fenced block as a section',
);
assert(
  renderedSection(helperProbe, 'Real')?.includes('- body'),
  'renderedSection must still find a real section and reach past a fenced block inside it',
);
assert.deepEqual(
  renderedHeadings(helperProbe),
  ['# Name', '## Real'],
  'renderedHeadings must skip headings inside a fenced block and keep the real ones',
);
assert.deepEqual(
  renderedHeadings(
    ['# Name', `${FENCE}${FENCE}text`, FENCE, '## Still code', `${FENCE}${FENCE}`].join('\n'),
  ),
  ['# Name'],
  'a fence run shorter than the one that opened the block must not end it',
);

const preSectionCv = [
  fixtureH1,
  '',
  fixtureContactLine,
  '',
  '### Career Snapshot',
  '',
  'Platform lead, twelve years in developer tooling.',
  '',
  '- Shipped the internal build platform.',
  '',
  '## Experience',
  '',
  '### Second Employer',
  '',
  '**Staff Engineer**',
  '',
  '2019-2023',
  '',
  '- Led the storage migration.',
].join('\n');

const preCv = parseCvMarkdown(preSectionCv);
assert.deepEqual(
  preCv.sections.map((s) => s.title),
  ['Career Snapshot', 'Experience'],
  'a ### before the first ## should open a section of its own, not vanish',
);
assert.deepEqual(
  preCv.contact,
  [fixtureEmail],
  'body under a pre-section ### is content, not another contact field',
);

const preOut = buildCvMarkdown(preSectionCv);
const snapshot = renderedSection(preOut, 'Career Snapshot');
assert(snapshot, 'the pre-section heading must survive the render as its own section');
assert(
  snapshot?.includes('Platform lead, twelve years in developer tooling.'),
  'prose under a pre-section heading must render inside that section',
);
assert(
  snapshot?.includes('- Shipped the internal build platform.'),
  'bullets under a pre-section heading must render inside that section',
);
// The whole heading shape at once: the lifted heading is present and renders as a
// ##, a ### after a real ## still renders as an entry rather than a section, and
// no level is skipped (MD001), since a lift past ## would put an H3 under the H1.
assert.deepEqual(
  renderedHeadings(preOut),
  [renderedH1, '## Career Snapshot', '## Experience', '### Second Employer -- 2019-2023'],
  'a lifted ### renders as a section while a ### under a real ## stays an entry',
);

// Siblings render alike: with no ## anywhere, every ### opens its own section
// rather than the first one becoming a section and the rest entries under it.
const allEntriesCv = [
  fixtureH1,
  '',
  '### First Employer',
  '',
  '**Staff Engineer**',
  '',
  '2019-2023',
  '',
  '- Led the storage migration.',
  '',
  '### Second Employer',
  '',
  '**Principal**',
  '',
  '2015-2019',
  '',
  '- Ran the platform team.',
].join('\n');
const allEntries = parseCvMarkdown(allEntriesCv);
assert.deepEqual(
  allEntries.sections.map((s) => s.title),
  ['First Employer', 'Second Employer'],
  'with no ## anywhere, sibling ### headings must all open sections, not just the first',
);
const allEntriesOut = buildCvMarkdown(allEntriesCv);
assert.deepEqual(
  renderedHeadings(allEntriesOut),
  [renderedH1, '## First Employer', '## Second Employer'],
  'every promoted sibling renders as a section, and none survives at ### under one of them',
);
assert(
  renderedSection(allEntriesOut, 'Second Employer')?.includes('- Ran the platform team.'),
  'the second sibling keeps its bullets under its own section',
);

// The lift is one fixed amount for the whole pre-section run, so a #### under a
// promoted ### becomes an entry: the umbrella/sub-role relationship survives
// instead of the second client being nested inside the first.
const umbrellaCv = [
  fixtureH1,
  '',
  '### Advisory Practice',
  '',
  '#### First Client',
  '',
  '2023-2024',
  '',
  '- Stood up the design system.',
  '',
  '#### Second Client',
  '',
  '2022-2023',
  '',
  '- Owned the frontend platform.',
].join('\n');
const umbrella2 = parseCvMarkdown(umbrellaCv);
assert.deepEqual(
  umbrella2.sections.map((s) => s.title),
  ['Advisory Practice'],
  'a #### below a promoted ### belongs inside it, not in a section of its own',
);
const umbrellaOut = buildCvMarkdown(umbrellaCv);
assert.deepEqual(
  renderedHeadings(umbrellaOut),
  [
    renderedH1,
    '## Advisory Practice',
    '### First Client -- 2023-2024',
    '### Second Client -- 2022-2023',
  ],
  'sibling #### clients under a promoted ### render as entries at the same level as each other',
);
assert(
  renderedSection(umbrellaOut, 'Advisory Practice')?.includes('- Stood up the design system.'),
  'a promoted umbrella keeps the bullets of the client under it',
);

// The same promotion applies to a #### with neither a section nor an entry, and
// there too the siblings render alike.
const preSubroleCv = [
  fixtureH1,
  '',
  '#### Early Work',
  '',
  '- Ran the helpdesk.',
  '',
  '#### Earlier Work',
  '',
  '- Ran the mailroom.',
].join('\n');
const preSubroleParsed = parseCvMarkdown(preSubroleCv);
assert.deepEqual(
  preSubroleParsed.sections.map((s) => s.title),
  ['Early Work', 'Earlier Work'],
  'sibling #### headings before the first ## should each open a section of their own',
);
const preSubroleOut = buildCvMarkdown(preSubroleCv);
assert.deepEqual(
  renderedHeadings(preSubroleOut),
  [renderedH1, '## Early Work', '## Earlier Work'],
  'sibling #### headings before the first ## render as sections, two levels up from the H1',
);
assert(
  renderedSection(preSubroleOut, 'Early Work')?.includes('- Ran the helpdesk.'),
  'bullets under a pre-section #### must render inside that section',
);
assert(
  renderedSection(preSubroleOut, 'Earlier Work')?.includes('- Ran the mailroom.'),
  'the second pre-section #### keeps its own bullets under its own section',
);

// --- Fenced code blocks are not read as document structure -------------------
// A ### inside a fence is code, not a heading, so it must not open a section or
// an entry, and no fence may leak into the output unclosed.
const fencedCv = [
  fixtureH1,
  '',
  fixtureContactLine,
  '',
  '```',
  '### not a heading',
  '```',
  '',
  '## Experience',
  '',
  '- Led the storage migration.',
].join('\n');
const fenced = parseCvMarkdown(fencedCv);
assert.deepEqual(
  fenced.contact,
  [fixtureEmail],
  'a code fence is not a contact field and must not be mangled into the contact line',
);
// The whole document, byte for byte: a fence above the first section has no block
// that can hold it, so it is dropped rather than half-emitted, no fence character
// survives anywhere, no section is fabricated out of the ### inside it, and the
// content after it still lands in its own section.
assert.equal(
  buildCvMarkdown(fencedCv),
  [renderedH1, '', fixtureEmail, '', '## Experience', '', '- Led the storage migration.', ''].join(
    '\n',
  ),
  'a fence above the first section leaks nothing into the rendered resume',
);

// Inside a section a fenced block is kept verbatim, with a language on the
// opening fence (MD040), and its contents are never parsed as headings.
const fencedSectionCv = [
  fixtureH1,
  '',
  '## Notes',
  '',
  '```yaml',
  '### not a heading',
  'key: value',
  '```',
  '',
  '- Kept the note.',
].join('\n');
const notes = parseCvMarkdown(fencedSectionCv);
assert(
  notes.sections[0].blocks.every((b) => b.type !== 'entry'),
  'a ### inside a fence within a section must not open an entry',
);
// Again the whole document: the block is kept verbatim with its language, the ###
// inside it opens neither a section nor an entry, and the bullet after it stays a
// bullet of the section rather than being absorbed into the block.
assert.equal(
  buildCvMarkdown(fencedSectionCv),
  [
    renderedH1,
    '',
    '## Notes',
    '',
    '```yaml',
    '### not a heading',
    'key: value',
    '```',
    '',
    '- Kept the note.',
    '',
  ].join('\n'),
  'a fenced block inside a section renders verbatim, and what follows it is unaffected',
);
// A fence with no language gets one, so the output cannot fail MD040.
assert(
  buildCvMarkdown([fixtureH1, '', '## Notes', '', '```', 'plain', '```'].join('\n')).includes(
    '```text\nplain\n```',
  ),
  'a fence with no info string renders with a language (MD040)',
);

// A closing fence carries no info string (CommonMark): a ```yaml line written
// inside a ``` block is content, not a closer. Treating it as one ended the block
// early, spilled the rest of the code into the resume as prose, and let the real
// closing fence open a second block that swallowed whatever followed it.
const nestedFenceCv = [
  fixtureH1,
  '',
  '## Writing Samples',
  '',
  '```',
  '```yaml',
  'on: push',
  '```',
  '',
  '- Kept the bullet.',
].join('\n');
const nestedFence = parseCvMarkdown(nestedFenceCv);
assert.deepEqual(
  nestedFence.sections[0].blocks.map((b) => b.type),
  ['code', 'bullet'],
  'a fence line with an info string must not close a block, and must not spill code into prose',
);
assert.deepEqual(
  nestedFence.sections[0].blocks[0].lines,
  ['```yaml', 'on: push'],
  'the whole block, including the inner fence line, is kept verbatim',
);
// The re-emitted fence outgrows the longest backtick run it holds, so the inner
// line cannot close the block it is written inside.
assert.equal(
  buildCvMarkdown(nestedFenceCv),
  [
    renderedH1,
    '',
    '## Writing Samples',
    '',
    '````text',
    '```yaml',
    'on: push',
    '````',
    '',
    '- Kept the bullet.',
    '',
  ].join('\n'),
  'a block holding a fence line renders inside a longer fence, with the bullet after it intact',
);

// A tilde fence may carry backticks in its info string, where a backtick fence may
// not. Rejecting the line outright left the fence unrecognized, so a ### inside it
// fabricated an entry and the closing ~~~ opened a block over the rest of the CV.
const tildeFenceCv = [
  fixtureH1,
  '',
  '## Notes',
  '',
  '~~~yaml`inline`',
  '### not a heading',
  '~~~',
  '',
  '- Kept the note.',
].join('\n');
const tildeFence = parseCvMarkdown(tildeFenceCv);
assert.deepEqual(
  tildeFence.sections[0].blocks.map((b) => b.type),
  ['code', 'bullet'],
  'a tilde fence whose info string holds backticks is still a fence',
);
assert.deepEqual(
  tildeFence.sections[0].blocks[0].lines,
  ['### not a heading'],
  'a ### inside a tilde fence is code, not an entry',
);
// Output fences are always backticks (MD048 consistency), and a backtick fence's
// info string may not hold a backtick, so the language is kept and the rest of an
// unrepresentable info string is dropped rather than emitted as a broken fence.
assert.equal(
  buildCvMarkdown(tildeFenceCv),
  [
    renderedH1,
    '',
    '## Notes',
    '',
    '```yaml',
    '### not a heading',
    '```',
    '',
    '- Kept the note.',
    '',
  ].join('\n'),
  'a tilde fence re-renders as a valid backtick fence carrying its language',
);

// An empty fenced block inside a section is something the author wrote, so it
// survives, and it renders with no blank line invented inside it.
assert.equal(
  buildCvMarkdown([fixtureH1, '', '## Notes', '', '```js', '```', '', '- After.'].join('\n')),
  [renderedH1, '', '## Notes', '', '```js', '```', '', '- After.', ''].join('\n'),
  'an empty fenced block in a section is preserved, with nothing invented inside it',
);

// A fenced block written inside a ### entry or a #### sub-role belongs where the
// author put it. Holding every block at section level while bullets kept attaching
// to the still-open entry reordered the document: the entry rendered in full, so a
// bullet written after the block came out before it.
const fenceInEntryCv = [
  fixtureH1,
  '',
  '## Experience',
  '',
  '### Company',
  '',
  '- Bullet before the block.',
  '',
  '```js',
  'code();',
  '```',
  '',
  '- Bullet after the block.',
].join('\n');
assert.equal(
  buildCvMarkdown(fenceInEntryCv),
  [
    renderedH1,
    '',
    '## Experience',
    '',
    '### Company',
    '',
    '- Bullet before the block.',
    '',
    '```js',
    'code();',
    '```',
    '',
    '- Bullet after the block.',
    '',
  ].join('\n'),
  'a fenced block inside an entry stays between the bullets it was written between',
);

// The same for a #### sub-role, whose content is held one level deeper again.
const fenceInSubroleCv = [
  fixtureH1,
  '',
  '## Experience',
  '',
  '### Umbrella',
  '',
  '#### Client',
  '',
  '- Bullet before the block.',
  '',
  '```sh',
  'make build',
  '```',
  '',
  '- Bullet after the block.',
].join('\n');
assert.equal(
  buildCvMarkdown(fenceInSubroleCv),
  [
    renderedH1,
    '',
    '## Experience',
    '',
    '### Umbrella',
    '',
    '#### Client',
    '',
    '- Bullet before the block.',
    '',
    '```sh',
    'make build',
    '```',
    '',
    '- Bullet after the block.',
    '',
  ].join('\n'),
  'a fenced block inside a sub-role stays between the bullets it was written between',
);

// A fence the author never closed still ends at the end of the document, and what
// it holds is what they wrote. Splitting on newlines yields one empty trailing
// element for the document's final newline; inside an open fence that artifact was
// being kept as a content line, so every unclosed block gained a blank last line.
// A blank line the author really did write (a document ending in a blank line) is
// still theirs and is kept.
const unclosedCv = [fixtureH1, '', '## Notes', '', '```js', 'code();', ''].join('\n');
assert.deepEqual(
  parseCvMarkdown(unclosedCv).sections[0].blocks[0].lines,
  ['code();'],
  'the final newline of a document is not a line of an unclosed fenced block',
);
assert.equal(
  buildCvMarkdown(unclosedCv),
  [renderedH1, '', '## Notes', '', '```js', 'code();', '```', ''].join('\n'),
  'an unclosed fenced block renders with nothing invented at its end',
);
assert.deepEqual(
  parseCvMarkdown([fixtureH1, '', '## Notes', '', '```js', 'code();', '', ''].join('\n'))
    .sections[0].blocks[0].lines,
  ['code();', ''],
  'a blank line the author actually wrote inside the block is still kept',
);

console.log('✓ smoke ok:', keys.join(', '));
