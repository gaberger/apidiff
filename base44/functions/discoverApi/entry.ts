import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GH_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'apidiff-discovery/1.0',
  ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {}),
};

const EXACT_SPEC_NAMES = ['openapi.json', 'swagger.json', 'api-docs.json', 'openapi.yaml', 'swagger.yaml'];
const VERSIONED_FILE_RE = /^(spec|api|openapi|swagger)[\d._-].*\.(json|yaml)$/i;

async function ghGet(url) {
  const res = await fetch(url, { headers: GH_HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) { console.log(`GH ${res.status}: ${url}`); return null; }
  return res.json();
}

function parseGitHubUrl(url) {
  let m = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/);
  if (m) return { owner: m[1], repo: m[2], branch: m[3], path: (m[4] || '').replace(/^\//, '') };
  m = url.match(/github\.com\/([^/]+)\/([^/?#\s]+)/);
  if (m) return { owner: m[1], repo: m[2], branch: 'main', path: '' };
  return null;
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

async function parseChangelog(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'apidiff-discovery/1.0', 'Accept': 'text/html,text/plain,*/*' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const found = new Set();
    for (const re of [/##\s+\[?(v?\d+\.\d+[\.\d]*)\]?/g, /\bv(\d+\.\d+[\.\d]*)\b/g]) {
      let m;
      while ((m = re.exec(text)) !== null) found.add(m[1]);
      if (found.size > 20) break;
    }
    return [...found].slice(0, 20);
  } catch { return []; }
}

async function webSearchDiscover(base44, query, changelogUrl) {
  console.log(`Web search discovery for: ${query}`);
  const prompt = [
    `Find all publicly available versioned OpenAPI/Swagger spec files for: "${query}"`,
    changelogUrl ? `Changelog URL: ${changelogUrl}` : '',
    `Search the web for GitHub repositories, API docs, and official spec URLs.`,
    `Return ONLY valid JSON (no markdown, no explanation) with this exact structure:`,
    `{"versions":[{"label":"v1","url":"https://...","version":"v1"}],"changelog_versions":["1.0","2.0"],"pairs":[{"label":"v1 → v2","v1_url":"https://...","v2_url":"https://..."}]}`,
    `Only include URLs that are direct download links to real OpenAPI/Swagger JSON or YAML files.`,
    `If you find a GitHub repo with versioned spec files, include each version as a separate entry.`,
  ].filter(Boolean).join('\n');

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    response_json_schema: {
      type: 'object',
      properties: {
        versions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, version: { type: 'string' } } } },
        changelog_versions: { type: 'array', items: { type: 'string' } },
        pairs: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, v1_url: { type: 'string' }, v2_url: { type: 'string' } } } },
      },
    },
  });

  return result || { versions: [], changelog_versions: [], pairs: [] };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { base_url, changelog_url } = await req.json();
  if (!base_url) return Response.json({ error: 'base_url is required' }, { status: 400 });

  console.log(`Discovering: ${base_url}`);

  const gh = parseGitHubUrl(base_url);

  if (gh) {
    // GitHub URL: use direct API
    console.log(`GitHub: ${gh.owner}/${gh.repo} branch="${gh.branch}" path="${gh.path}"`);
    const specs = await findSpecs(gh.owner, gh.repo, gh.path, gh.branch);
    const seen = new Set();
    const versions = [];
    for (const s of specs) {
      if (!seen.has(s.url)) { seen.add(s.url); versions.push(s); }
    }
    console.log(`Found ${versions.length} spec(s)`);

    let changelog_versions = [];
    if (changelog_url) {
      changelog_versions = await parseChangelog(changelog_url);
    }

    const sorted = [...versions].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({
        label: `${sorted[i].label} → ${sorted[i+1].label}`,
        v1_url: sorted[i].url,
        v2_url: sorted[i+1].url,
      });
    }

    // If GitHub found nothing, fall back to web search
    if (versions.length === 0) {
      console.log(`GitHub found nothing, falling back to web search`);
      const webResult = await webSearchDiscover(base44, base_url, changelog_url);
      return Response.json(webResult);
    }

    return Response.json({ versions, changelog_versions, pairs });
  } else {
    // Not a GitHub URL — could be a provider name, a website URL, or an API URL
    // Use web search to discover specs
    const webResult = await webSearchDiscover(base44, base_url, changelog_url);
    return Response.json(webResult);
  }
});