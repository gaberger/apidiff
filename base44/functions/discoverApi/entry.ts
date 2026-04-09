import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GH_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'apidiff-discovery/1.0',
  ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {}),
};

// Exact filenames we treat as specs
const EXACT_SPEC_NAMES = ['openapi.json', 'swagger.json', 'api-docs.json', 'openapi.yaml', 'swagger.yaml'];
// Pattern: files whose names contain version-like segments, e.g. spec3.json, spec3.beta.json, v2.yaml
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
      // Use filename (without ext) as label
      const label = f.name.replace(/\.(json|yaml)$/i, '');
      results.push({ label, url: f.download_url, version: label });
    }
  }

  // Versioned subdirs: v1, v2, 2023-01-01, 2024, etc.
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

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { base_url, changelog_url } = await req.json();
  if (!base_url) return Response.json({ error: 'base_url is required' }, { status: 400 });

  console.log(`Discovering: ${base_url}`);
  const results = { versions: [], changelog_versions: [], pairs: [] };

  const gh = parseGitHubUrl(base_url);
  if (gh) {
    console.log(`GitHub: ${gh.owner}/${gh.repo} branch="${gh.branch}" path="${gh.path}"`);
    const specs = await findSpecs(gh.owner, gh.repo, gh.path, gh.branch);
    const seen = new Set();
    for (const s of specs) {
      if (!seen.has(s.url)) { seen.add(s.url); results.versions.push(s); }
    }
    console.log(`Found ${results.versions.length} spec(s): ${results.versions.map(v => v.label).join(', ')}`);
  } else {
    console.log(`Not a GitHub URL`);
  }

  if (changelog_url) {
    results.changelog_versions = await parseChangelog(changelog_url);
    console.log(`Changelog versions: ${results.changelog_versions.join(', ')}`);
  }

  const sorted = [...results.versions].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    results.pairs.push({
      label: `${sorted[i].label} → ${sorted[i+1].label}`,
      v1_url: sorted[i].url,
      v2_url: sorted[i+1].url,
    });
  }

  return Response.json(results);
});