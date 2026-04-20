// Minimal diagnostic: no imports, no async work.

export default function handler(_req: Request): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      env: {
        AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY,
        VERCEL_OIDC_TOKEN: !!process.env.VERCEL_OIDC_TOKEN,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
      node: process.version,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
