#!/usr/bin/env node
/* Proprietary / All Rights Reserved - Genesis OS */
import { readFileSync } from 'node:fs';
import { verifyContainerOffline } from './evidenceContainer.js';
const path = process.argv[2];
if (!path) { console.error('usage: verifyContainer.cli.ts <bundle.zip>'); process.exit(2); }
const bytes = new Uint8Array(readFileSync(path));
const res = verifyContainerOffline(bytes);
process.stdout.write(JSON.stringify(res, null, 2) + "\n");
process.exit(res.ok ? 0 : 1);
