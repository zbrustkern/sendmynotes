import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Each file starts with a fresh disk-backed test database. Use an allowlist
// so developer-shell cloud credentials never reach the regression adapters.
const cases = readdirSync('tests').filter(name => /^wedding.*\.test\.[cm]?[jt]sx?$/.test(name)).sort();
if (!cases.length) throw new Error('No wedding test files found.');
const failures = [];
for (const file of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'smn-wedding-test-'));
  try {
    const env = Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','LANG'].flatMap(k =>
      process.env[k] ? [[k, process.env[k]]] : []));
    Object.assign(env, {NODE_ENV:'test', NODE_OPTIONS:'--require='+resolve('tests/support/deny-external-network.cjs'), SMN_TEST_DATA_DIR:dir, NEXT_PUBLIC_WEDDING_PORTAL_ENABLED:'true',
      WEDDING_PROJECTS_ENABLED:'true', WEDDING_PORTAL_ENABLED:'true', WEDDING_CHECKOUT_ENABLED:'true',
      STAGING_REVIEW_ONLY:'true', NEXT_PUBLIC_STAGING_REVIEW_ONLY:'true', ALLOW_LOCAL_MOCK_PAYMENTS:'true'});
    console.log('\n' + file);
    const result = spawnSync(process.execPath, ['--import','tsx',join('tests',file)], {env,stdio:'inherit'});
    if (result.status !== 0 || result.error) failures.push(file);
  } finally {
    rmSync(dir, {recursive:true, force:true});
  }
}
console.log(failures.length ? 'Failed: ' + failures.join(', ') : 'Passed ' + cases.length + ' wedding test files.');
process.exitCode = failures.length ? 1 : 0;
