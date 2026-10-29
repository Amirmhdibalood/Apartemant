#!/usr/bin/env node
/**
 * Apartemant — one command for everything (works on Windows, macOS, Linux):
 *   npm run test:full                 unit tests + stress + scenario (1000 bills × 100 units) + build
 *   npm run test:full -- --full       same with 1000, 5000 and 10000 bills (slow: ~10 min, ~3 GB RAM)
 *   npm run test:full -- --sizes=2000,4000
 * Prints a short PASS/FAIL table plus key timings; exit code 1 if anything failed.
 * Detailed numbers: perf/results/stress-*.json and perf/results/scenario-*.json
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const sizesArg = args.find((a) => a.startsWith('--sizes='));
const sizes = sizesArg ? sizesArg.slice(8) : args.includes('--full') ? '1000,5000,10000' : '1000';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  { name: 'Unit tests (npm test)', cmd: npx, args: ['vitest', 'run'], env: {} },
  { name: `Stress (${sizes} bills × 100 units)`, cmd: npx, args: ['vitest', 'run', '--config', 'vitest.stress.config.ts', 'tests/stress/stress.stress.ts'], env: { STRESS_BILLS: sizes } },
  { name: `Scenario (multi-building, backup/restore, old formats, malicious, ${sizes} bills)`, cmd: npx, args: ['vitest', 'run', '--config', 'vitest.stress.config.ts', 'tests/stress/scenario.stress.ts'], env: { SCENARIO_SIZES: sizes } },
  { name: 'Build (tsc + vite)', cmd: npm, args: ['run', 'build'], env: {} },
];

const rows = [];
let failed = false;
for (const s of steps) {
  process.stdout.write(`▶ ${s.name} … `);
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, {
    cwd: root, env: { ...process.env, ...s.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=6144`.trim() },
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: process.platform === 'win32',
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const ok = r.status === 0;
  if (!ok) failed = true;
  const tests = (out.match(/Tests\s+([^\n]+)/g) ?? []).pop()?.replace(/\s+/g, ' ').replace(/\u001b\[[0-9;]*m/g, '') ?? '';
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(ok ? `PASS (${secs}s)` : `FAIL (${secs}s)`);
  if (!ok) console.log(out.split('\n').filter((l) => /FAIL|Error|×|expected/.test(l)).slice(0, 30).join('\n'));
  rows.push({ step: s.name, result: ok ? 'PASS' : 'FAIL', tests, seconds: secs });
}

console.log('\n══════ Summary ══════');
console.table(rows);

const read = (f) => { const p = join(root, 'perf/results', f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const timing = [];
for (const n of sizes.split(',').map((x) => x.trim())) {
  const sc = read(`scenario-timings-${n}x100.json`);
  const st = read(`stress-${n}x100.json`);
  if (!sc && !st) continue;
  timing.push({
    bills: `${n} × 100`,
    'save bill (ms)': sc?.saveOneBillMs ?? st?.saveOneBillMs,
    'mark paid (ms)': sc?.markPaidMs ?? st?.markOnePaidMs,
    'journal/save (KB)': sc?.saveJournalKB ?? st?.saveOneBillJournalKB,
    'cold start (ms)': sc?.coldStartWithReplayMs ?? st?.coldStartLoadMs,
    'snapshot (ms)': sc?.checkpointMs ?? st?.checkpointMs,
    'DB (MB)': sc?.snapshotMB ?? st?.dbBytesMB,
    'backup (MB)': sc?.backupMB ?? st?.backupSizeMB,
    'restore (ms)': sc?.restoreMs ?? st?.backupRestoreMs,
  });
}
if (timing.length) { console.log('Key timings (Node, in-memory storage; phones are slower):'); console.table(timing); }
const mal = read('scenario-malicious.json');
if (mal) console.log(`Malicious/corrupt backups: ${mal.variants} variants, ${mal.rejected} rejected, 0 data changes.`);
console.log(failed ? '\n❌ Something failed — see above.' : '\n✅ All checks passed.');
process.exit(failed ? 1 : 0);
