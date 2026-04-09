/* eslint-disable */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const { url } = await req.json();
  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, */*',
      'User-Agent': 'Mozilla/5.0 apidiff/1.0',
    },
  });

  if (!res.ok) {
    return Response.json({ error: `HTTP ${res.status} ${res.statusText}` }, { status: 502 });
  }

  const text = await res.text();
  if (!text.trim()) {
    return Response.json({ error: 'Empty response from server' }, { status: 502 });
  }

  const parsed = JSON.parse(text);
  return Response.json({ document: parsed });
});