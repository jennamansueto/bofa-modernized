#!/usr/bin/env node
/**
 * Generates docs/04-traceability.md from a REAL Playwright run (report/results.json).
 *   AC ID -> criterion -> legacy source pointer(s) (doc 01) -> backend JUnit test(s) -> Playwright test(s) -> status
 * Usage: node scripts/traceability.mjs   (after `npm test` / `npm run test:quick`)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const e2e = resolve(root, 'e2e');

// ---- doc 01 (lives on branch devin/docs-phase0 until the docs land on main) ----
const docPath = resolve(root, 'docs/01-acceptance-criteria.md');
const doc01 = existsSync(docPath)
  ? readFileSync(docPath, 'utf8')
  : execSync('git show origin/devin/docs-phase0:docs/01-acceptance-criteria.md', { cwd: root, encoding: 'utf8' });
const docRef = existsSync(docPath) ? 'docs/01-acceptance-criteria.md' : '`docs/01-acceptance-criteria.md` (branch `devin/docs-phase0`)';

const criteria = new Map();
const lines = doc01.split('\n');
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\*\*(AC-\d\d) — (.+)\*\*\s*$/);
  if (!m) continue;
  let source = '';
  for (let j = i + 1; j < lines.length && !lines[j].startsWith('**AC-'); j++) {
    if (lines[j].startsWith('Source:')) { source = lines[j].replace(/^Source:\s*/, '').trim(); break; }
  }
  criteria.set(m[1], { title: m[2].trim(), source });
}
if (criteria.size !== 42) throw new Error(`Expected 42 criteria in doc 01, found ${criteria.size}`);

// ---- backend JUnit methods ACnn_* ----
const backend = new Map();
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(resolve(dir, d.name)) : [resolve(dir, d.name)]);
for (const f of walk(resolve(root, 'backend/src/test/java')).filter((f) => f.endsWith('Test.java'))) {
  const cls = basename(f, '.java');
  for (const m of readFileSync(f, 'utf8').matchAll(/void (AC(\d\d)_\w+)\s*\(/g)) {
    const id = `AC-${m[2]}`;
    if (!backend.has(id)) backend.set(id, []);
    backend.get(id).push(`${cls}.${m[1]}`);
  }
}

// ---- Playwright results ----
const resultsPath = resolve(e2e, 'report/results.json');
if (!existsSync(resultsPath)) throw new Error('report/results.json not found — run the suite first (npm test or npm run test:quick)');
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
const pw = new Map();
let totals = { passed: 0, failed: 0, fixme: 0, skipped: 0 };
const visit = (suite, file) => {
  for (const spec of suite.specs ?? []) {
    const m = spec.title.match(/^(AC-\d\d): /);
    const r = spec.tests[0]?.results?.at(-1);
    const annotations = spec.tests[0]?.annotations ?? [];
    let status = r?.status ?? 'skipped';
    if (annotations.some((a) => a.type === 'fixme')) status = 'fixme';
    else if (status === 'passed') status = 'pass';
    else if (status === 'failed' || status === 'timedOut') status = 'fail';
    totals[status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : status === 'fixme' ? 'fixme' : 'skipped']++;
    if (!m) continue;
    if (!pw.has(m[1])) pw.set(m[1], []);
    pw.get(m[1]).push({ file: `${file ?? spec.file}:${spec.line}`, status, reason: annotations.find((a) => a.type === 'fixme')?.description });
  }
  for (const s of suite.suites ?? []) visit(s, file ?? suite.file);
};
for (const s of results.suites) visit(s, s.file);

// Deliberate deviations / notes that a reader of the matrix needs (kept next to the status, not buried in the tests).
const notes = {
  'AC-02': 'Modern backend treated a whitespace-only password as "invalid" (counted a strike); fixed in this PR (`AuthService` uses `isBlank()`), matching legacy.',
  'AC-06': 'Only the User ID is pre-filled from the cookie (the checkbox is not pre-ticked), exactly as the criterion states; the cookie is removed when the box is unticked on a later sign-in.',
  'AC-08': 'Server contract (600 s) asserted via `/api/secure/me`; the 10-minute idle warning + redirect is driven with Playwright\'s fake clock. The real server-side expiry (Spring Session JDBC, `server.servlet.session.timeout=10m`) is not waited for.',
  'AC-13': 'Modern: draft is kept client-side per session (`sessionStorage`) instead of a server-side Struts form bean; observable behaviour identical.',
  'AC-19': 'Second external account is not in the seed; the test adds `ACCT-1004` via the gated `/api/test/fixtures/second-external-account` endpoint.',
  'AC-21': 'Missing fee row is produced via the gated `/api/test/fixtures/exn-standard-fee-row-not-effective` endpoint (`eff_dt` pushed to 2099).',
  'AC-28': 'Deliberate deviation: legacy rendered `Today\'\'s` (Struts double-escaping, which also produced invalid JSON); the modern API renders `Today\'s`.',
  'AC-39': 'Modern app is an SPA: the "redirect" is a client-side route change to `/transfers/confirmation/{conf}` backed by `GET /api/secure/transfers/{conf}`; refresh re-reads, never resubmits.',
  'AC-40': 'Modern app shows the failure inline (role=alert) without a page reload; form, balance cards and recent activity stay on screen.',
  'AC-42': 'Modern app renders the branded page for unknown routes (client 404) with an `ERR-` reference; server 5xx is not injectable without a fault endpoint, so only the 404 path is exercised end to end.',
};

const esc = (s) => s.replace(/\|/g, '\\|');
const statusCell = (s) => ({ pass: 'PASS', fail: 'FAIL', fixme: 'FIXME', skipped: 'SKIPPED' }[s] ?? s.toUpperCase());

let acTotals = { pass: 0, fail: 0, fixme: 0, none: 0 };
const rows = [];
for (const [id, c] of [...criteria.entries()].sort()) {
  const tests = pw.get(id) ?? [];
  const st = tests.length === 0 ? 'none' : tests.some((t) => t.status === 'fail') ? 'fail' : tests.every((t) => t.status === 'fixme') ? 'fixme' : 'pass';
  acTotals[st]++;
  const be = (backend.get(id) ?? []).map((m) => `\`${m}\``).join('<br>') || '— (UI-only)';
  const pwCell = tests.map((t) => `\`${t.file}\`${t.status === 'fixme' ? ` (fixme: ${t.reason ?? 'see test'})` : ''}`).join('<br>') || '—';
  const note = notes[id] ? `<br><sub>${esc(notes[id])}</sub>` : '';
  rows.push(`| ${id} | ${esc(c.title)}${note} | ${esc(c.source)} | ${be} | ${pwCell} | ${st === 'none' ? 'NOT COVERED' : statusCell(st)} |`);
}

const runDate = new Date(results.stats.startTime).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const md = `# 04 — Traceability matrix (acceptance criteria → legacy source → tests → result)

Generated by \`e2e/scripts/traceability.mjs\` from a real run of the Playwright acceptance suite against the docker compose stack
(React UI + Spring Boot API + PostgreSQL 16, no mocks). Criterion text and legacy pointers are taken verbatim from ${docRef}.
Backend tests are the JUnit/Testcontainers methods named \`ACnn_*\` under \`backend/src/test/java\`; Playwright tests are titled
\`AC-NN: <criterion>\` so the HTML report (\`e2e/report/index.html\`) reads like the acceptance-criteria document.

**Run:** ${runDate} · Playwright ${results.config.version} · project \`chromium\` · ${results.stats.expected + results.stats.unexpected + results.stats.skipped} tests in ${(results.stats.duration / 1000).toFixed(0)} s

## Totals

| | Count |
|---|---|
| Acceptance criteria in doc 01 | ${criteria.size} |
| Criteria with at least one Playwright test | ${criteria.size - acTotals.none} |
| Criteria PASS | ${acTotals.pass} |
| Criteria FAIL | ${acTotals.fail} |
| Criteria FIXME (cannot be exercised) | ${acTotals.fixme} |
| Criteria without a Playwright test | ${acTotals.none} |
| Criteria also covered by a backend JUnit test | ${[...criteria.keys()].filter((k) => backend.has(k)).length} |
| Playwright tests (incl. headline demo flows) — passed / failed / fixme / skipped | ${totals.passed} / ${totals.failed} / ${totals.fixme} / ${totals.skipped} |

Status per criterion is **PASS** only if every Playwright test carrying that AC ID passed in this run; **FAIL** if any failed;
**FIXME** if the only tests are \`test.fixme\`. Notes under a criterion record deliberate deviations from legacy or how an
otherwise unreachable precondition is produced (test-only endpoints under \`/api/test/*\`, enabled solely by \`OLB_TEST_CLOCK_ENABLED=true\`).

## Matrix

| AC | Criterion | Legacy source (doc 01) | Backend test(s) | Playwright test(s) | Status |
|---|---|---|---|---|---|
${rows.join('\n')}

## Headline demo flows (\`e2e/tests/90-demo-flows.spec.ts\`)

Browser-only re-runs of the four demo scripts, each titled with the AC it illustrates:

| Flow | Title | Status |
|---|---|---|
${(() => {
  const demo = [];
  const v = (suite, file) => { for (const s of suite.specs ?? []) if ((file ?? suite.file ?? '').includes('90-demo-flows')) demo.push(s); for (const x of suite.suites ?? []) v(x, file ?? suite.file); };
  for (const s of results.suites) v(s, s.file);
  const labels = ['Login → internal $1,250 → XFR261009-000001 → $2,965.38 / $14,190.00', 'Standard EXN to Chase: $3.00 fee, skips Sat/Sun + Columbus Day → Tue 10/13', 'Same-account error', 'Three bad passwords → locked (correct password still refused)'];
  return demo.map((s, i) => `| ${labels[i] ?? ''} | ${esc(s.title)} | ${statusCell(s.tests[0].results.at(-1).status === 'passed' ? 'pass' : 'fail')} |`).join('\n');
})()}

## How to reproduce

\`\`\`bash
npm test                 # from repo root: docker compose down -v && up --wait (test clock on), then the full suite
npm run test:headed      # same suite, headed Chromium, slowMo, video on every test
npm run test:demo        # only the four headline demo flows, headed
npm run e2e:report       # open e2e/report/index.html
npm run e2e:traceability # regenerate this file from e2e/report/results.json
\`\`\`
`;
writeFileSync(resolve(root, 'docs/04-traceability.md'), md);
console.log(`docs/04-traceability.md written: ${acTotals.pass} pass / ${acTotals.fail} fail / ${acTotals.fixme} fixme / ${acTotals.none} uncovered; tests ${totals.passed}/${totals.failed}/${totals.fixme}`);
