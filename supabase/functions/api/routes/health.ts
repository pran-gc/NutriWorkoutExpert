// GET /health — public liveness: version + uptime. No auth. (NWE-113)
import { Hono } from 'hono';

import { ok } from '../../_shared/index.ts';

const startedAt = Date.now();
const VERSION = Deno.env.get('API_VERSION') ?? '0.1.0';

export const healthRoute = new Hono().get('/', (c) => {
  return c.json(ok({ version: VERSION, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) }));
});
