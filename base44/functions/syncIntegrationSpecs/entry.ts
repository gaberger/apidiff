import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Shared discovery logic — same as discoverApi but for batch syncing all Integrations.
// Only uses Tier 1 (registry) and Tier 2 (GitHub/APIs.guru) — no AI for batch jobs.

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GH_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'apidiff-discovery/2.0',
  ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {}),
};

const SPEC_FILENAMES = ['openapi.json', 'swagger.json', 'api-docs.json', 'openapi.yaml', 'swagger.yaml'];
const VERSIONED_FILE_RE = /^(spec|api|openapi|swagger)[\d._-].*\.(json|yaml)$/i;
const PRODUCT_SPEC_RE = /^[a-z][a-z0-9_-]+_v\d+\.(json|yaml)$/i;
const VERSION_DIR_RE = /^(v?\d|\d{4}-\d{2})/;
const SPEC_DIR_NAMES = new Set([
  'openapi', 'swagger', 'specs', 'spec', 'api', 'latest', 'preview',
  'descriptions', 'definitions', 'schemas',
]);
const SKIP_DIRS = new Set(['.github', 'node_modules', 'dist', 'build', 'test', 'tests', 'examples', 'docs']);

async function ghGet(url) {
  try {
    const res = await fetch(url, { headers: GH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function parseGitHubUrl(url) {
  let m = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/);
  if (m) return { owner: m[1], repo: m[2], branch: m[3], path: (m[4] || '').replace(/^\//, '') };
  m = url.match(/github\.com\/([^/]+)\/([^/?#\s]+)/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), branch: null, path: '' };
  return null;
}

async function detectBranch(owner, repo) {
  const data = await ghGet(`https://api.github.com/repos/${owner}/${repo}`);
  return data?.default_branch ?? 'main';
}

async function findSpecs(owner, repo, path, branch, depth = 0, insideSpecDir = false) {
  if (depth > 3) return [];
  const items = await ghGet(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  if (!Array.isArray(items)) return [];

  const results = [];
  const parentDir = path ? path.split('/').pop() : '';

  for (const f of items) {
    if (f.type !== 'file') continue;
    const name = f.name.toLowerCase();
    if (name.startsWith('fixture') || name === 'changelog.md' || name === 'readme.md') continue;

    const isSpec =
      SPEC_FILENAMES.includes(name) ||
      VERSIONED_FILE_RE.test(f.name) ||
      (insideSpecDir && PRODUCT_SPEC_RE.test(f.name));

    if (isSpec) {
      const baseName = f.name.replace(/\.(json|yaml)$/i, '');
      const label = parentDir ? `${parentDir}/${baseName}` : baseName;
      results.push({ label, url: f.download_url, version: baseName });
    }
  }

  const byVersion = new Map();
  for (const r of results) {
    const existing = byVersion.get(r.version);
    if (!existing || r.url.endsWith('.json')) byVersion.set(r.version, r);
  }
  results.length = 0;
  results.push(...Array.from(byVersion.values()));

  const dirs = items.filter(f => f.type === 'dir' && !SKIP_DIRS.has(f.name.toLowerCase()));
  const versionDirs = dirs.filter(f => VERSION_DIR_RE.test(f.name));
  const specDirs = dirs.filter(f => SPEC_DIR_NAMES.has(f.name.toLowerCase()) && !versionDirs.includes(f));

  for (const dir of specDirs.slice(0, 5)) {
    const sub = await findSpecs(owner, repo, dir.path, branch, depth + 1, true);
    results.push(...sub);
  }

  if (insideSpecDir) {
    const otherDirs = dirs.filter(f => !specDirs.includes(f) && !versionDirs.includes(f));
    for (const dir of otherDirs.slice(0, 10)) {
      const sub = await findSpecs(owner, repo, dir.path, branch, depth + 1, true);
      results.push(...sub);
    }
  }

  for (const dir of versionDirs.slice(0, 15)) {
    const sub = await findSpecs(owner, repo, dir.path, branch, depth + 1, insideSpecDir);
    if (sub.length > 0) {
      results.push(...sub.map(s => ({ ...s, label: dir.name, version: dir.name })));
    } else {
      for (const specName of SPEC_FILENAMES) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dir.path}/${specName}`;
        try {
          const res = await fetch(rawUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (res.ok) { results.push({ label: dir.name, url: rawUrl, version: dir.name }); break; }
        } catch { /* skip */ }
      }
    }
  }

  return results;
}

async function discoverForIntegration(integration) {
  const { base_url } = integration;
  if (!base_url) return null;

  const gh = parseGitHubUrl(base_url);
  if (!gh) return null;

  console.log(`[${integration.name}] GitHub: ${gh.owner}/${gh.repo}`);
  const branch = gh.branch || await detectBranch(gh.owner, gh.repo);
  const specs = await findSpecs(gh.owner, gh.repo, gh.path, branch);

  const seen = new Set();
  const versions = specs.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  if (versions.length === 0) return null;

  const sorted = [...versions].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    pairs.push({ label: `${sorted[i].label} > ${sorted[i + 1].label}`, v1_url: sorted[i].url, v2_url: sorted[i + 1].url });
  }
  return { versions, pairs };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user !== null && user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const integrations = await base44.asServiceRole.entities.Integration.list();
  const results = [];

  for (const integration of integrations) {
    if (!integration.base_url) {
      results.push({ name: integration.name, status: 'skipped', reason: 'no base_url' });
      continue;
    }

    console.log(`Syncing: ${integration.name}`);
    const discovered = await discoverForIntegration(integration);

    if (!discovered?.versions?.length) {
      results.push({ name: integration.name, status: 'no_results' });
      continue;
    }

    const existing = new Set((integration.comparisons || []).map(c => `${c.v1_url}|${c.v2_url}`));
    const newPairs = discovered.pairs.filter(p => !existing.has(`${p.v1_url}|${p.v2_url}`));

    const existingVersionUrls = new Set((integration.versions || []).map(v => v.url));
    const newVersions = discovered.versions.filter(v => !existingVersionUrls.has(v.url));

    if (newPairs.length > 0 || newVersions.length > 0) {
      const updateData = {};
      if (newPairs.length > 0) updateData.comparisons = [...(integration.comparisons || []), ...newPairs];
      if (newVersions.length > 0) updateData.versions = [...(integration.versions || []), ...newVersions];
      await base44.asServiceRole.entities.Integration.update(integration.id, updateData);
      results.push({ name: integration.name, status: 'updated', added_pairs: newPairs.length, added_versions: newVersions.length });
    } else {
      results.push({ name: integration.name, status: 'up_to_date' });
    }
  }

  console.log('Sync complete:', JSON.stringify(results));
  return Response.json({ results });
});
