import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Common OpenAPI spec path patterns to probe
const SPEC_PATHS = [
  'openapi.json', 'swagger.json', 'api-docs.json',
  'openapi.yaml', 'swagger.yaml', 'api.json',
  '.well-known/openapi.json',
];

// Version patterns to detect in URLs/filenames
const VERSION_RE = /v?(\d+)[\._\-]?(\d*)[\._\-]?(\d*)/i;

async function tryFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json, */*', 'User-Agent': 'apidiff-discovery/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    try { return { json: JSON.parse(text), text }; }
    catch { return { json: null, text }; }
  } catch { return null; }
}

// Try to resolve GitHub repo into raw file listing
async function probeGitHub(url) {
  // e.g. https://github.com/owner/repo/tree/main/path or https://raw.githubusercontent.com/...
  const githubRaw = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)/);
  const githubTree = url.match(/github\.com\/([^/]+)\/([^/]+)\/?(?:tree\/([^/]+)\/?(.*?))?$/);

  let owner, repo, branch, path;
  if (githubRaw) {
    [, owner, repo, branch, path] = githubRaw;
    path = path.replace(/[^/]*$/, ''); // strip filename, keep dir
  } else if (githubTree) {
    [, owner, repo, branch, path] = githubTree;
    branch = branch || 'main';
    path = path || '';
  } else return null;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch || 'main'}`;
  const res = await fetch(apiUrl, {
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'apidiff-discovery/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const files = await res.json();
  if (!Array.isArray(files)) return null;

  // Group JSON files by version pattern
  const specFiles = files.filter(f =>
    f.type === 'file' && (f.name.endsWith('.json') || f.name.endsWith('.yaml'))
  );

  const versions = specFiles
    .map(f => {
      const match = f.name.match(VERSION_RE);
      return match ? { version: match[0], label: f.name.replace(/\.(json|yaml)$/, ''), url: f.download_url } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  // Also check subdirectories as version folders
  const versionDirs = files.filter(f => f.type === 'dir' && VERSION_RE.test(f.name));
  for (const dir of versionDirs.slice(0, 5)) {
    const dirRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${dir.path}?ref=${branch || 'main'}`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'apidiff-discovery/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!dirRes.ok) continue;
    const dirFiles = await dirRes.json();
    if (!Array.isArray(dirFiles)) continue;
    const spec = dirFiles.find(f => SPEC_PATHS.some(p => f.name === p || f.name.includes('openapi') || f.name.includes('swagger')));
    if (spec) versions.push({ version: dir.name, label: dir.name, url: spec.download_url });
  }

  return versions.length > 0 ? versions : null;
}

// Probe a changelog page for version mentions
async function parseChangelog(url) {
  const result = await tryFetch(url);
  if (!result) return [];
  const { text } = result;
  // Find version-like strings e.g. ## v2.1, # 2024-01-01, ## [1.2.3]
  const found = new Set();
  const patterns = [
    /##\s+\[?(v?\d+\.\d+[\.\d]*)\]?/g,
    /^#+\s+version\s+(v?\d+[\.\d]+)/gim,
    /released?\s+(v?\d+[\.\d]+)/gi,
    /\bv(\d+\.\d+[\.\d]*)\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1]);
    if (found.size > 20) break;
  }
  return [...found].slice(0, 20);
}

// Probe common spec paths at a base URL
async function probeBaseUrl(base) {
  const normalized = base.replace(/\/+$/, '');
  const discovered = [];

  // Try direct spec paths
  for (const path of SPEC_PATHS) {
    const url = `${normalized}/${path}`;
    const result = await tryFetch(url);
    if (result?.json && (result.json.openapi || result.json.swagger)) {
      const version = result.json.info?.version || 'latest';
      discovered.push({ label: `${path} (${version})`, url, version });
      break;
    }
  }

  // Try versioned paths: v1, v2, v3...
  const versionPrefixes = ['v1', 'v2', 'v3', 'v4', '1', '2', '3'];
  for (const v of versionPrefixes) {
    for (const specPath of ['openapi.json', 'swagger.json', 'api-docs.json']) {
      const url = `${normalized}/${v}/${specPath}`;
      const result = await tryFetch(url);
      if (result?.json && (result.json.openapi || result.json.swagger)) {
        discovered.push({ label: v, url, version: v });
        break;
      }
    }
    // Also try base/v1.json style
    const flatUrl = `${normalized}/${v}.json`;
    const flatResult = await tryFetch(flatUrl);
    if (flatResult?.json && (flatResult.json.openapi || flatResult.json.swagger)) {
      discovered.push({ label: v, url: flatUrl, version: v });
    }
  }

  return discovered;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { base_url, changelog_url } = await req.json();
  if (!base_url) return Response.json({ error: 'base_url is required' }, { status: 400 });

  const results = { versions: [], changelog_versions: [], pairs: [] };

  // Try GitHub-specific discovery
  const ghVersions = await probeGitHub(base_url);
  if (ghVersions) {
    results.versions = ghVersions;
  } else {
    // Fallback: probe common paths
    results.versions = await probeBaseUrl(base_url);
  }

  // Parse changelog if provided
  if (changelog_url) {
    results.changelog_versions = await parseChangelog(changelog_url);
  }

  // Build adjacent-version comparison pairs from discovered versions
  const sorted = [...results.versions].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    results.pairs.push({
      label: `${sorted[i].label} → ${sorted[i + 1].label}`,
      v1_url: sorted[i].url,
      v2_url: sorted[i + 1].url,
    });
  }

  return Response.json(results);
});