#!/usr/bin/env bun
// Transpiles src/core/domain/*.ts → src/lib/domain/*.js
// Run via: bun run sync:lib
// Wired into build and dev so Base44's plain-JS copies stay in sync
// with the canonical TypeScript source automatically.

import { build } from 'bun';
import { readdirSync } from 'fs';

const domainFiles = readdirSync('src/core/domain')
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map(f => `src/core/domain/${f}`);

const result = await build({
  entrypoints: domainFiles,
  outdir: 'src/lib/domain',
  format: 'esm',
  target: 'browser',
});

if (!result.success) {
  console.error('sync-lib-domain failed:');
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`✓ Synced ${domainFiles.length} domain files → src/lib/domain/`);
for (const f of domainFiles) {
  const name = f.split('/').pop().replace('.ts', '.js');
  console.log(`  ${f} → src/lib/domain/${name}`);
}
