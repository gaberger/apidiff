import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function runDiscoveryAgent(base44, integration) {
  const { base_url, changelog_url, name } = integration;
  if (!base_url) return null;

  const prompt = [
    `Find all versioned OpenAPI spec files for this API: ${base_url}`,
    changelog_url ? `Changelog URL: ${changelog_url}` : "",
    "Return ONLY valid JSON with keys: versions (array of {label,url,version}), changelog_versions (array of strings), pairs (array of {label,v1_url,v2_url}).",
  ].filter(Boolean).join("\n");

  const conversation = await base44.agents.createConversation({
    agent_name: "api_discovery",
    metadata: { name: `Auto-discover: ${name}` },
  });

  await base44.agents.addMessage(conversation, { role: "user", content: prompt });

  // Poll for agent response (max 60s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const conv = await base44.agents.getConversation(conversation.id);
    const messages = conv.messages || [];
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.content) {
      try {
        const clean = last.content.replace(/```(?:json)?/g, "").trim();
        return JSON.parse(clean);
      } catch {
        console.log(`[${name}] Agent returned unparseable response`);
        return null;
      }
    }
  }
  console.log(`[${name}] Agent timed out`);
  return null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    // Also allow scheduled/service calls (no user context)
    if (user !== null) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const integrations = await base44.asServiceRole.entities.Integration.list();
  const results = [];

  for (const integration of integrations) {
    if (!integration.base_url) continue;

    console.log(`Discovering versions for: ${integration.name}`);
    const discovered = await runDiscoveryAgent(base44.asServiceRole, integration);
    if (!discovered?.pairs?.length) {
      results.push({ name: integration.name, status: "no_results" });
      continue;
    }

    // Merge new pairs — avoid duplicates by v1_url+v2_url
    const existing = new Set(
      (integration.comparisons || []).map((c) => `${c.v1_url}|${c.v2_url}`)
    );
    const newPairs = discovered.pairs.filter(
      (p) => !existing.has(`${p.v1_url}|${p.v2_url}`)
    );

    // Merge individual versions too
    const existingVersionUrls = new Set((integration.versions || []).map(v => v.url));
    const newVersions = (discovered.versions || []).filter(v => !existingVersionUrls.has(v.url));

    if (newPairs.length > 0 || newVersions.length > 0) {
      const updateData = {};
      if (newPairs.length > 0) updateData.comparisons = [...(integration.comparisons || []), ...newPairs];
      if (newVersions.length > 0) updateData.versions = [...(integration.versions || []), ...newVersions];
      await base44.asServiceRole.entities.Integration.update(integration.id, updateData);
      results.push({ name: integration.name, status: "updated", added_pairs: newPairs.length, added_versions: newVersions.length });
    } else {
      results.push({ name: integration.name, status: "no_new" });
    }
  }

  return Response.json({ results });
});