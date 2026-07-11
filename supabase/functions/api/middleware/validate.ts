// Zod validation helper. Parses body/query/params with a shared schema; invalid
// input → 400 VALIDATION_ERROR with field details. Handlers get typed data via
// c.req.valid('json' | 'query' | 'param'). (docs/api.md §2.)
import type { ValidationTargets } from 'hono';
import { validator } from 'hono/validator';
import type { ZodType } from 'zod';

import { HttpError } from './error.ts';

export function zval<T>(target: keyof ValidationTargets, schema: ZodType<T>) {
  return validator(target, (value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new HttpError('VALIDATION_ERROR', 'Invalid request.', result.error.flatten());
    }
    return result.data;
  });
}
