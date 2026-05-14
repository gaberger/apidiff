#!/usr/bin/env bun
// validate-examples.ts
//
// Validates every YAML/JSON example under apidiffspec/ against
// apidiffspec/api-changeset-schema.json. Also validates the schema's own
// inline `examples` array. Exits 0 if all examples pass, 1 otherwise.
//
// Invoked from the Release workflow on every push (see .github/workflows/release.yml)
// so the README's claim that examples are checked in CI is enforceable.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Ajv ships its 2020 entrypoint without types in some installs.
import Ajv2020 from "ajv/dist/2020.js";
import { parse as yamlParse } from "yaml";
import { readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "apidiffspec");
const SCHEMA_PATH = join(ROOT, "api-changeset-schema.json");

const schema = JSON.parse(await Bun.file(SCHEMA_PATH).text());
const ajv = new (Ajv2020 as unknown as { new (opts: object): { compile: (s: unknown) => (d: unknown) => boolean; errors?: unknown } })({ strict: false });
const validate = ajv.compile(schema);

interface Result { file: string; ok: boolean; changes: number; errors?: unknown }
const results: Result[] = [];

// Inline examples baked into the schema itself.
const inline: unknown[] = (schema as { examples?: unknown[] }).examples ?? [];
for (let i = 0; i < inline.length; i++) {
  const ok = validate(inline[i]);
  results.push({
    file: `schema.examples[${i}]`,
    ok,
    changes: (inline[i] as { changes?: unknown[] }).changes?.length ?? 0,
    errors: ok ? undefined : (validate as unknown as { errors?: unknown }).errors,
  });
}

// Single comprehensive example next to the schema.
const top = join(ROOT, "example-changeset.yaml");
{
  const doc = yamlParse(await Bun.file(top).text());
  const ok = validate(doc);
  results.push({
    file: top.substring(top.indexOf("apidiffspec/")),
    ok,
    changes: doc?.changes?.length ?? 0,
    errors: ok ? undefined : (validate as unknown as { errors?: unknown }).errors,
  });
}

// Per-family focused examples under apidiffspec/examples/.
const examplesDir = join(ROOT, "examples");
const entries = readdirSync(examplesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"));
entries.sort();
for (const name of entries) {
  const path = join(examplesDir, name);
  const raw = await Bun.file(path).text();
  const doc = path.endsWith(".json") ? JSON.parse(raw) : yamlParse(raw);
  const ok = validate(doc);
  results.push({
    file: path.substring(path.indexOf("apidiffspec/")),
    ok,
    changes: doc?.changes?.length ?? 0,
    errors: ok ? undefined : (validate as unknown as { errors?: unknown }).errors,
  });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  process.stdout.write(`${r.ok ? "✓" : "✗"} ${r.file}  (${r.changes} changes)\n`);
  if (!r.ok) process.stdout.write(`    ${JSON.stringify(r.errors)}\n`);
}
process.stdout.write(`\n${results.length - failed.length}/${results.length} examples valid\n`);
process.exit(failed.length === 0 ? 0 : 1);
