import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ─── Config ─────────────────────────────────────────────────
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

// ─── Curated Registry (Tier 1) ──────────────────────────────
const REGISTRY = {
  'stripe':       { kind: 'github', owner: 'stripe', repo: 'openapi' },
  'paypal':       { kind: 'github', owner: 'paypal', repo: 'paypal-rest-api-specifications', path: 'openapi' },
  'square':       { kind: 'github', owner: 'square', repo: 'connect-api-specification' },
  'twilio':       { kind: 'github', owner: 'twilio', repo: 'twilio-oai' },
  'github':       { kind: 'github', owner: 'github', repo: 'rest-api-description' },
  'discord':      { kind: 'github', owner: 'discord', repo: 'discord-api-spec', path: 'specs' },
  'digitalocean': { kind: 'github', owner: 'digitalocean', repo: 'openapi' },
  'cloudflare':   { kind: 'github', owner: 'cloudflare', repo: 'api-schemas' },
  'pagerduty':    { kind: 'github', owner: 'PagerDuty', repo: 'api-schema' },
  'okta':         { kind: 'github', owner: 'okta', repo: 'okta-management-openapi-spec', path: 'dist' },
  'plaid':        { kind: 'github', owner: 'plaid', repo: 'plaid-openapi' },
  'adyen':        { kind: 'apis-guru', providerKey: 'adyen.com' },
  'sendgrid':     { kind: 'apis-guru', providerKey: 'sendgrid.com' },
  'vonage':       { kind: 'apis-guru', providerKey: 'nexmo.com' },
  'gitlab':       { kind: 'apis-guru', providerKey: 'gitlab.com' },
  'jira':         { kind: 'apis-guru', providerKey: 'atlassian.com' },
  'aws':          { kind: 'apis-guru', providerKey: 'amazonaws.com' },
  'google-cloud': { kind: 'apis-guru', providerKey: 'googleapis.com' },
  'slack':        { kind: 'apis-guru', providerKey: 'slack.com' },
  'openai':       { kind: 'url', urls: [{ label: 'current', url: 'https://raw.githubusercontent.com/openai/openai-openapi/refs/heads/manual_spec/openapi.yaml' }] },
};

// ─── GitHub Helpers ─────────────────────────────────────────
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

  // Dedup JSON vs YAML
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

// ─── APIs.guru (Tier 2) ────────────────────────────────────
async function discoverFromApisGuru(providerKey) {
  try {
    const res = await fetch('https://api.apis.guru/v2/list.json', {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'apidiff-discovery/2.0' },
    });
    if (!res.ok) return [];
    const directory = await res.json();

    const matching = Object.entries(directory).filter(([key]) =>
      key === providerKey || key.startsWith(`${providerKey}:`)
    );

    const versions = [];
    for (const [apiKey, entry] of matching) {
      for (const [versionId, versionData] of Object.entries(entry.versions)) {
        const specUrl = versionData.swaggerUrl || versionData.swaggerYamlUrl;
        if (!specUrl) continue;
        const subApi = apiKey.includes(':') ? apiKey.split(':')[1] : null;
        const label = subApi ? `${subApi}@${versionId}` : versionId;
        versions.push({ label, url: specUrl, version: versionId });
      }
    }
    return versions;
  } catch { return []; }
}

// ─── URL Validation ─────────────────────────────────────────
async function validateSpecUrl(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'apidiff-discovery/2.0' },
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('"openapi"') || text.includes('openapi:') ||
           text.includes('"swagger"') || text.includes('swagger:');
  } catch { return false; }
}

function toRawUrl(url) {
  if (!url) return url;
  return url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
}

// ─── Helpers ────────────────────────────────────────────────
// Extract a group key from a label so that only comparable versions
// (same product/sub-API) get paired together. Strips version numbers
// and dates so `twilio_accounts_v1` and `twilio_accounts_v2` match,
// but `twilio_accounts_v1` and `twilio_api_v2010` do not.
//
// Uses the leaf (last path segment) only, so `spec3` and `latest/spec3`
// are treated as the same spec at different stability tiers.
function groupKey(label) {
  const leaf = label.split('/').pop() || label;
  return leaf
    .replace(/\.(json|yaml|yml)$/i, '')
    // version numbers: v1, v2010, 1.2.3, etc.
    .replace(/v?\d+(\.\d+)*/gi, '#')
    // ISO dates
    .replace(/\d{4}-\d{2}(-\d{2})?/g, '#')
    .toLowerCase();
}

function buildPairs(versions) {
  // Group by normalized key — only pair versions within the same group.
  const groups = new Map();
  for (const v of versions) {
    const key = groupKey(v.label);
    const arr = groups.get(key);
    if (arr) arr.push(v);
    else groups.set(key, [v]);
  }

  const pairs = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue; // nothing to compare
    const sorted = [...group].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({
        label: `${sorted[i].label} > ${sorted[i + 1].label}`,
        v1_url: sorted[i].url,
        v2_url: sorted[i + 1].url,
      });
    }
  }
  return pairs;
}

async function parseChangelog(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'apidiff-discovery/2.0', 'Accept': 'text/html,text/plain,*/*' },
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
    return Array.from(found).slice(0, 20);
  } catch { return []; }
}

// ─── Main Handler ───────────────────────────────────────────
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { base_url, changelog_url } = await req.json();
  if (!base_url) return Response.json({ error: 'base_url is required' }, { status: 400 });

  const query = base_url.trim().toLowerCase();
  console.log(`Discovery request: "${query}"`);

  let versions = [];
  let changelog_versions = [];
  let source = 'unknown';

  // ─── TIER 1: Curated registry ─────────────────────────────
  const registryEntry = REGISTRY[query];
  if (registryEntry) {
    console.log(`Tier 1 hit: ${query}`);

    if (registryEntry.kind === 'github') {
      const branch = await detectBranch(registryEntry.owner, registryEntry.repo);
      const startPath = registryEntry.path || '';
      const startInSpecDir = startPath !== '' && SPEC_DIR_NAMES.has(startPath.split('/').pop().toLowerCase());
      versions = await findSpecs(registryEntry.owner, registryEntry.repo, startPath, branch, 0, startInSpecDir);
      source = 'registry-github';
    } else if (registryEntry.kind === 'apis-guru') {
      versions = await discoverFromApisGuru(registryEntry.providerKey);
      source = 'registry-apis-guru';
    } else if (registryEntry.kind === 'url') {
      for (const spec of registryEntry.urls) {
        const valid = await validateSpecUrl(spec.url);
        if (valid) versions.push({ label: spec.label, url: spec.url, version: spec.label });
      }
      source = 'registry-url';
    }
  }

  // ─── TIER 2: GitHub URL or APIs.guru search ───────────────
  if (versions.length === 0) {
    const gh = parseGitHubUrl(base_url);

    if (gh) {
      console.log(`Tier 2: GitHub ${gh.owner}/${gh.repo}`);
      const branch = gh.branch || await detectBranch(gh.owner, gh.repo);
      versions = await findSpecs(gh.owner, gh.repo, gh.path, branch);
      source = 'github';
    } else {
      console.log(`Tier 2: APIs.guru search "${query}"`);
      for (const suffix of ['', '.com', '.io', '.dev']) {
        const key = query + suffix;
        const found = await discoverFromApisGuru(key);
        if (found.length > 0) {
          versions = found;
          source = 'apis-guru';
          break;
        }
      }
    }
  }

  // ─── TIER 3: AI Agent with web search ─────────────────────
  if (versions.length === 0) {
    console.log(`Tier 3: AI search "${query}"`);
    try {
      const prompt = [
        `Find all publicly available OpenAPI/Swagger spec file download URLs for: "${base_url}"`,
        `Search for GitHub repos, official API docs, and spec hosting services.`,
        `CRITICAL: Only include URLs to real downloadable spec files (JSON/YAML), not docs pages.`,
        `Return ONLY valid JSON: {"versions":[{"label":"v1","url":"https://...","version":"v1"}],"changelog_versions":[],"pairs":[],"github_repo":"owner/repo"}`,
      ].join('\n');

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            versions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, version: { type: 'string' } } } },
            changelog_versions: { type: 'array', items: { type: 'string' } },
            pairs: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, v1_url: { type: 'string' }, v2_url: { type: 'string' } } } },
            github_repo: { type: 'string' },
          },
        },
      });

      if (result?.versions?.length > 0) {
        console.log(`AI returned ${result.versions.length} URLs, validating...`);
        const validated = [];
        const checks = result.versions.map(async (v) => {
          const url = toRawUrl(v.url);
          const valid = await validateSpecUrl(url);
          if (valid) {
            validated.push({ label: v.label, url, version: v.version || v.label });
            console.log(`  OK ${v.label}: ${url}`);
          } else {
            console.log(`  FAIL ${v.label}: ${url}`);
          }
        });
        await Promise.allSettled(checks);
        versions = validated;
        source = 'ai-web-search';
      }

      if (result?.changelog_versions?.length > 0) {
        changelog_versions = result.changelog_versions;
      }

      // If AI found a GitHub repo but no direct URLs worked, crawl it
      if (versions.length === 0 && result?.github_repo) {
        console.log(`AI repo hint: ${result.github_repo}`);
        const [owner, repo] = result.github_repo.split('/');
        if (owner && repo) {
          const branch = await detectBranch(owner, repo);
          versions = await findSpecs(owner, repo, '', branch);
          source = 'ai-github-fallback';
        }
      }
    } catch (e) {
      console.log(`Tier 3 error: ${e.message}`);
    }
  }

  // ─── Finalize ─────────────────────────────────────────────
  const seen = new Set();
  const deduped = versions.filter(v => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });

  const pairs = buildPairs(deduped);

  if (changelog_url) {
    const clVersions = await parseChangelog(changelog_url);
    changelog_versions = Array.from(new Set([...changelog_versions, ...clVersions]));
  }

  console.log(`Done: ${deduped.length} versions, ${pairs.length} pairs (${source})`);
  return Response.json({ versions: deduped, changelog_versions, pairs, source });
});
