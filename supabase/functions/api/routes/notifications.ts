import { Hono } from 'hono';

import {
  canSendNotification,
  notificationPrefsSchema,
  ok,
  registerPushTokenSchema,
  updateNotificationPrefsSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const notificationsRoute = new Hono<Env>()
  .get('/prefs', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db.from('profiles').select('notification_prefs').eq('id', user.id).single();
    if (error) throw new HttpError('INTERNAL', 'Could not load notification preferences.');
    return c.json(ok(notificationPrefsSchema.parse(data?.notification_prefs ?? {})));
  })
  .patch('/prefs', zval('json', updateNotificationPrefsSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const patch = c.req.valid('json');
    const { data: current, error: loadErr } = await db.from('profiles').select('notification_prefs').eq('id', user.id).single();
    if (loadErr) throw new HttpError('INTERNAL', 'Could not load notification preferences.');
    const prefs = notificationPrefsSchema.parse({ ...(current?.notification_prefs ?? {}), ...patch });
    const { error } = await db.from('profiles').update({ notification_prefs: prefs }).eq('id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not save notification preferences.');
    return c.json(ok(prefs));
  })
  .post('/test', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    if (Deno.env.get('ENVIRONMENT') === 'production') {
      throw new HttpError('FORBIDDEN', 'Test pushes are disabled in production.');
    }
    const { data: profile, error: profileErr } = await db.from('profiles').select('notification_prefs').eq('id', user.id).single();
    if (profileErr) throw new HttpError('INTERNAL', 'Could not load notification preferences.');
    const prefs = notificationPrefsSchema.parse(profile?.notification_prefs ?? {});
    const now = new Date();
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!canSendNotification(localTime, prefs, 'weekly_review')) {
      return c.json(ok({ delivered: false, reason: 'preferences_or_quiet_hours' }));
    }
    const { data: tokens, error } = await db.from('push_tokens').select('expo_token').eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not load push tokens.');
    return c.json(ok({ delivered: (tokens ?? []).length > 0, tokens: (tokens ?? []).length }));
  })
  .post('/tokens', zval('json', registerPushTokenSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const input = c.req.valid('json');
    const { data, error } = await db
      .from('push_tokens')
      .upsert({ user_id: user.id, ...input }, { onConflict: 'expo_token' })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not register this device.');
    return c.json(ok(data));
  });
