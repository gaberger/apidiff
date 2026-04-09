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

  // Non-GitHub URL: use LLM with web search
  console.log(`[${name}] LLM web search discovery for: ${base_url}`);
  const prompt = [
    `Find all publicly available versioned OpenAPI/Swagger spec files for: "${base_url}"`,
    changelog_url ? `Changelog URL: ${changelog_url}` : '',
    `Return ONLY JSON: {"versions":[{"label":"v1","url":"https://...","version":"v1"}],"pairs":[{"label":"v1 → v2","v1_url":"https://...","v2_url":"https://..."}]}`,
    `Only include URLs that are direct download links to real spec files.`,
  ].filter(Boolean).join('\n');

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    model: 'gemini_3_flash',
    response_json_schema: {
      type: 'object',
      properties: {
        versions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, version: { type: 'string' } } } },
        pairs: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, v1_url: { type: 'string' }, v2_url: { type: 'string' } } } },
      },
    },
  });

  // Fix GitHub blob URLs to raw
  function toRawUrl(url) {
    if (!url) return url;
    return url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/');
  }
  if (result) {
    result.versions = (result.versions || []).map(v => ({ ...v, url: toRawUrl(v.url) }));
    result.pairs = (result.pairs || []).map(p => ({ ...p, v1_url: toRawUrl(p.v1_url), v2_url: toRawUrl(p.v2_url) }));
  }
  return result || null;
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
      results.push({ name: integration.name, status: 'skipped' });
      continue;
    }

    try {
      console.log(`Discovering: ${integration.name}`);
      const discovered = await discoverForIntegration(base44.asServiceRole, integration);

      if (!discovered?.versions?.length && !discovered?.pairs?.length) {
        results.push({ name: integration.name, status: 'no_results' });
        continue;
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
        results.push({ name: integration.name, status: 'updated', added_pairs: newPairs.length, added_versions: newVersions.length });
      } else {
        results.push({ name: integration.name, status: 'up_to_date' });
      }
    } catch (e) {
      console.log(`[${integration.name}] Error: ${e.message}`);
      results.push({ name: integration.name, status: 'error', error: e.message });
    }
  }

  console.log('Discovery complete:', JSON.stringify(results));
  return Response.json({ results });
});