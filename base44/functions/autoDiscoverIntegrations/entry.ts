import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GH_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'apidiff-discovery/1.0',
  ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {}),
};

const EXACT_SPEC_NAMES = ['openapi.json', 'swagger.json', 'api-docs.json', 'openapi.yaml', 'swagger.yaml'];
const VERSIONED_FILE_RE = /^(spec|api|openapi|swagger)[\d._-].*\.(json|yaml)$/i;

function parseGitHubUrl(url) {
  let m = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/);
  if (m) return { owner: m[1], repo: m[2], branch: m[3], path: (m[4] || '').replace(/^\//, '') };
  m = url.match(/github\.com\/([^/]+)\/([^/?#\s]+)/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), branch: 'main', path: '' };
  return null;
}

async function ghGet(url) {
  const res = await fetch(url, { headers: GH_HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return res.json();
}

async function listDir(owner, repo, path, branch) {
  const items = await ghGet(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  if (items) return { items, branch };
  if (branch === 'main') {
    const fallback = await ghGet(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=master`);
    if (fallback) return { items: fallback, branch: 'master' };
  }
  return { items: null, branch };
}

async function findSpecs(owner, repo, path, branch, depth = 0) {
  if (depth > 2) return [];
  const { items, branch: b } = await listDir(owner, repo, path, branch);
  if (!Array.isArray(items)) return [];

  const results = [];
  for (const f of items) {
    if (f.type !== 'file') continue;
    const name = f.name.toLowerCase();
    if (EXACT_SPEC_NAMES.includes(name) || VERSIONED_FILE_RE.test(name)) {
      const label = f.name.replace(/\.(json|yaml)$/i, '');
      results.push({ label, url: f.download_url, version: label });
    }
  }

  const versionDirs = items.filter(f => f.type === 'dir' && /^(v?\d|\d{4}-\d{2})/.test(f.name));
  for (const dir of versionDirs.slice(0, 10)) {
    const sub = await findSpecs(owner, repo, dir.path, b, depth + 1);
    if (sub.length > 0) {
      results.push(...sub.map(s => ({ ...s, label: dir.name, version: dir.name })));
    } else {
      for (const specName of EXACT_SPEC_NAMES) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${dir.path}/${specName}`;
        const res = await fetch(rawUrl, { signal: AbortSignal.timeout(4000) });
        if (res.ok) { results.push({ label: dir.name, url: rawUrl, version: dir.name }); break; }
      }
    }
  }
  return results;
}

async function discoverForIntegration(base44, integration) {
  const { base_url, changelog_url, name } = integration;
  if (!base_url) return null;

  const gh = parseGitHubUrl(base_url);

  if (gh) {
    // Direct GitHub API discovery — fast, no AI needed
    console.log(`[${name}] GitHub discovery: ${gh.owner}/${gh.repo}`);
    const specs = await findSpecs(gh.owner, gh.repo, gh.path, gh.branch);
    const seen = new Set();
    const versions = [];
    for (const s of specs) {
      if (!seen.has(s.url)) { seen.add(s.url); versions.push(s); }
    }
    if (versions.length === 0) return null;

    const sorted = [...versions].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({ label: `${sorted[i].label} → ${sorted[i + 1].label}`, v1_url: sorted[i].url, v2_url: sorted[i + 1].url });
    }
    return { versions, pairs };
  }

  // Non-GitHub URL: use LLM with web search (skip to avoid long timeouts)
  console.log(`[${name}] Skipping non-GitHub URL (LLM discovery not supported in scheduled mode)`);
  return null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user !== null && user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const integrations = await base44.asServiceRole.entities.Integration.list();
  const toProcess = integrations.filter(i => i.base_url);
  const skipped = integrations.filter(i => !i.base_url).map(i => ({ name: i.name, status: 'skipped' }));

  // Process all integrations in parallel for speed
  const settled = await Promise.allSettled(
    toProcess.map(async (integration) => {
      console.log(`Discovering: ${integration.name}`);
      const discovered = await discoverForIntegration(base44.asServiceRole, integration);

      if (!discovered?.versions?.length && !discovered?.pairs?.length) {
        return { name: integration.name, status: 'no_results' };
      }

      const existing = new Set((integration.comparisons || []).map(c => `${c.v1_url}|${c.v2_url}`));
      const newPairs = (discovered.pairs || []).filter(p => !existing.has(`${p.v1_url}|${p.v2_url}`));

      const existingVersionUrls = new Set((integration.versions || []).map(v => v.url));
      const newVersions = (discovered.versions || []).filter(v => !existingVersionUrls.has(v.url));

      if (newPairs.length > 0 || newVersions.length > 0) {
        const updateData = {};
        if (newPairs.length > 0) updateData.comparisons = [...(integration.comparisons || []), ...newPairs];
        if (newVersions.length > 0) updateData.versions = [...(integration.versions || []), ...newVersions];
        await base44.asServiceRole.entities.Integration.update(integration.id, updateData);
        return { name: integration.name, status: 'updated', added_pairs: newPairs.length, added_versions: newVersions.length };
      }
      return { name: integration.name, status: 'up_to_date' };
    })
  );

  const results = [
    ...skipped,
    ...settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      console.log(`[${toProcess[i].name}] Error: ${s.reason?.message}`);
      return { name: toProcess[i].name, status: 'error', error: s.reason?.message };
    }),
  ];

  console.log('Discovery complete:', JSON.stringify(results));
  return Response.json({ results });
});