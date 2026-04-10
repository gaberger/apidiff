/* eslint-disable */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const { url: rawUrl } = await req.json();
  if (!rawUrl || typeof rawUrl !== 'string') {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  // Convert GitHub blob URLs to raw URLs
  const url = rawUrl
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');

  const ghToken = Deno.env.get('GITHUB_TOKEN');
  const headers = {
    'Accept': 'application/json, */*',
    'User-Agent': 'Mozilla/5.0 apidiff/1.0',
  };
  if (ghToken && url.includes('raw.githubusercontent.com')) {
    headers['Authorization'] = `token ${ghToken}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    return Response.json({ error: `HTTP ${res.status} ${res.statusText}` }, { status: 502 });
  }

  const text = await res.text();
  if (!text.trim()) {
    return Response.json({ error: 'Empty response from server' }, { status: 502 });
  }

  // Check for HTML error pages
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    return Response.json({ error: 'URL returned an HTML page, not a JSON/YAML spec' }, { status: 502 });
  }

  // Determine format
  let isJson = false;
  try { JSON.parse(text); isJson = true; } catch {}

  // Stream raw text back wrapped minimally to avoid double-serialization of huge specs
  const wrapper = isJson
    ? `{"document":${text}}`
    : JSON.stringify({ document: text, format: 'yaml' });

  return new Response(wrapper, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});