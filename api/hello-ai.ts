// Minimal AI gateway smoke test. If this returns "hi" in <10s the gateway
// is healthy; the extract-changeset timeout is then definitely schema-related.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateText } from "ai";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    res.status(500).json({ error: "AI_GATEWAY_API_KEY not set" });
    return;
  }
  try {
    const { text, usage } = await generateText({
      model: "anthropic/claude-sonnet-4.6",
      prompt: "Reply with exactly two words: hello world.",
      abortSignal: AbortSignal.timeout(30_000),
    });
    res.status(200).json({
      ok: true,
      text,
      usage,
      elapsedMs: Date.now() - t0,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg, elapsedMs: Date.now() - t0 });
  }
}
