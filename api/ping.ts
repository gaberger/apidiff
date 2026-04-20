import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    env: {
      AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: !!process.env.VERCEL_OIDC_TOKEN,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    node: process.version,
  });
}
