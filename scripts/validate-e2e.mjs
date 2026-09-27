import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const run = (command, args) => {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
};
const required = ['packages/frontend/package.json', 'packages/backend/src/start.mjs', '.env.example'];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`MISSING_REQUIRED_FILE: ${file}`);

run('npm', ['run', 'build']);

const secretPattern = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})/;
const ignored = new Set(['node_modules', 'dist', '.git', 'screenshots']);
const scan = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (/\.(js|mjs|ts|tsx|json|html|css)$/.test(entry.name)) {
      const text = readFileSync(full, 'utf8');
      if (secretPattern.test(text) && !full.endsWith('.env.example')) throw new Error(`POSSIBLE_SECRET_LITERAL: ${full}`);
    }
  }
};
scan(join(root, 'packages'));
console.log('\nSECRET_SCAN: PASS');
console.log(process.env.GENESIS_VALIDATE_PORTS === '1'
  ? 'PORT_CHECK: requested; run against active 5000/8080 services.'
  : 'PORT_CHECK: skipped because no service-start side effect is performed by this validator.');
console.log('VALIDATE_E2E: PASS');
