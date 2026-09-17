import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync(new URL('../genesis-packages.manifest.json', import.meta.url), 'utf8'));
const missing = [];
for (const spec of Object.values(manifest.packages)) {
  for (const file of spec.files) {
    const path = join(spec.dir, file);
    if (!existsSync(path)) missing.push(path);
  }
}
console.log(missing.length ? 'MISSING_FILES:\n' + missing.join('\n') : 'ALL_PACKAGE_FILES_PRESENT');
if (process.argv.includes('--run')) {
  const run = (command) => { try { execSync(command, { stdio: 'inherit' }); return true; } catch { return false; } };
  const okBuild = run('npm run build');
  const okAdvanced = run('npx vitest run packages/core/src/advanced');
  const okSupreme = run('npx vitest run packages/core/src/supreme');
  const okLint = run('npm run lint');
  const ok = missing.length === 0 && okBuild && okAdvanced && okSupreme && okLint;
  console.log('MANUS_VERIFY:', ok ? 'OK' : 'BLOCKED');
  process.exit(ok ? 0 : 1);
}
console.log('MANUS_VERIFY:', missing.length === 0 ? 'FILES_OK' : 'BLOCKED');
process.exit(missing.length === 0 ? 0 : 1);
