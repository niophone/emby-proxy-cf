import { Hono, type Context } from 'hono';

type LineRow = {
  id: number;
  name: string;
  entry_domain: string;
  origin_domain: string;
  fast_domain: string;
  weight: number;
  tags: string;
  enabled: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type FastDomainRow = {
  id: number;
  domain: string;
  label: string;
  is_default: number;
  created_at: string;
};

type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const DEFAULT_FAST_DOMAINS: Array<{ domain: string; label: string }> = [
  { domain: 'youxuan.cf.090227.xyz', label: 'CM优选域名' },
  { domain: 'mfa.gov.ua', label: '国家优选' },
  { domain: 'store.ubi.com', label: '育碧优选' },
  { domain: 'saas.sin.fan', label: 'MIYU优选' },
  { domain: 'cf.tencentapp.cn', label: 'ktff维护优选' },
  { domain: 'lily.lat', label: 'Lily姐' },
];

const ensureDefaultFastDomains = async (db: D1Database) => {
  for (const item of DEFAULT_FAST_DOMAINS) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO fast_domains (domain, label, is_default, created_at) VALUES (?, ?, 1, ?)'
      )
      .bind(item.domain, item.label, new Date().toISOString())
      .run();
    await db
      .prepare('UPDATE fast_domains SET label = ?, is_default = 1 WHERE domain = ?')
      .bind(item.label, item.domain)
      .run();
  }
};

const buildErrorMessage = (err: unknown) => {
  if (err instanceof Error) {
    const message = err.message ?? '';
    if (message.includes('no such table')) {
      return '数据库未初始化，请先执行 D1 migrations apply';
    }
    if (
      message.includes('Cannot read properties of undefined') &&
      message.includes('prepare')
    ) {
      return 'D1 未绑定，请检查 wrangler.toml 的 DB 绑定';
    }
  }
  return '服务器内部错误';
};

const ensureDB = (c: Context<{ Bindings: Bindings }>) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 未绑定，请检查 wrangler.toml 的 DB 绑定' }, 500);
  }
  return null;
};

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: buildErrorMessage(err) }, 500);
});

const toLine = (row: Record<string, unknown>): LineRow => ({
  id: Number(row.id),
  name: String(row.name ?? ''),
  entry_domain: String(row.entry_domain ?? ''),
  origin_domain: String(row.origin_domain ?? ''),
  fast_domain: String(row.fast_domain ?? ''),
  weight: Number(row.weight ?? 0),
  tags: String(row.tags ?? ''),
  enabled: Number(row.enabled ?? 0),
  notes: String(row.notes ?? ''),
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});

const toFastDomain = (row: Record<string, unknown>): FastDomainRow => ({
  id: Number(row.id),
  domain: String(row.domain ?? ''),
  label: String(row.label ?? ''),
  is_default: Number(row.is_default ?? 0),
  created_at: String(row.created_at ?? ''),
});

const getAuthError = (env: Bindings, authHeader?: string | null) => {
  if (!env.ADMIN_PASSWORD) {
    return { status: 500, body: { error: 'ADMIN_PASSWORD not set' } };
  }
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_PASSWORD}`) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }
  return null;
};

const normalizeDomain = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();

const isValidDomain = (value: string) => {
  if (!value || value.length > 255) return false;
  if (value.includes(' ')) return false;
  return value.includes('.') && !value.startsWith('.') && !value.endsWith('.');
};

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/auth/check') {
    return next();
  }
  const authError = getAuthError(c.env, c.req.header('Authorization'));
  if (authError) {
    return c.json(authError.body, authError.status);
  }
  return next();
});

app.post('/api/auth/check', (c) => {
  const authError = getAuthError(c.env, c.req.header('Authorization'));
  if (authError) {
    return c.json(authError.body, authError.status);
  }
  return c.json({ ok: true });
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/lines', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  const onlyEnabled = c.req.query('enabled') === '1';
  const sql = onlyEnabled
    ? 'SELECT * FROM lines WHERE enabled = 1 ORDER BY weight DESC, name ASC'
    : 'SELECT * FROM lines ORDER BY enabled DESC, weight DESC, name ASC';
  const result = await c.env.DB.prepare(sql).all();
  const lines = (result.results ?? []).map(toLine);
  return c.json(lines);
});

app.get('/api/lines/best', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.max(1, Math.min(20, Number(limitParam))) : 5;
  const result = await c.env.DB.prepare(
    'SELECT * FROM lines WHERE enabled = 1 ORDER BY weight DESC, name ASC LIMIT ?'
  )
    .bind(limit)
    .all();
  const lines = (result.results ?? []).map(toLine);
  return c.json(lines);
});

app.post('/api/lines', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  let payload: Record<string, unknown> = {};
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const name = String(payload.name ?? '').trim();
  const entryDomain = normalizeDomain(String(payload.entry_domain ?? payload.entryDomain ?? ''));
  const originDomain = normalizeDomain(String(payload.origin_domain ?? payload.originDomain ?? ''));
  const fastDomain = normalizeDomain(String(payload.fast_domain ?? payload.fastDomain ?? ''));

  if (!name || !entryDomain || !originDomain || !fastDomain) {
    return c.json({ error: 'name, entry_domain, origin_domain, fast_domain are required' }, 400);
  }
  if (![entryDomain, originDomain, fastDomain].every(isValidDomain)) {
    return c.json({ error: 'Invalid domain format' }, 400);
  }

  const weight = Number.isFinite(Number(payload.weight))
    ? Math.max(0, Math.round(Number(payload.weight)))
    : 100;
  const tags = String(payload.tags ?? '').trim();
  const enabled = payload.enabled === false || payload.enabled === 0 ? 0 : 1;
  const notes = String(payload.notes ?? '').trim();
  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    'INSERT INTO lines (name, entry_domain, origin_domain, fast_domain, weight, tags, enabled, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(name, entryDomain, originDomain, fastDomain, weight, tags, enabled, notes, now, now)
    .run();

  const id = Number(result.meta?.last_row_id ?? 0);
  const created = await c.env.DB.prepare('SELECT * FROM lines WHERE id = ?').bind(id).first();
  if (!created) {
    return c.json({ error: 'Failed to create line' }, 500);
  }
  return c.json(toLine(created as Record<string, unknown>), 201);
});

app.put('/api/lines/:id', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM lines WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }
  const current = toLine(existing as Record<string, unknown>);

  let payload: Record<string, unknown> = {};
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const name = String(payload.name ?? current.name).trim();
  const entryDomain = normalizeDomain(
    String(payload.entry_domain ?? payload.entryDomain ?? current.entry_domain)
  );
  const originDomain = normalizeDomain(
    String(payload.origin_domain ?? payload.originDomain ?? current.origin_domain)
  );
  const fastDomain = normalizeDomain(
    String(payload.fast_domain ?? payload.fastDomain ?? current.fast_domain)
  );

  if (!name || !entryDomain || !originDomain || !fastDomain) {
    return c.json({ error: 'name, entry_domain, origin_domain, fast_domain are required' }, 400);
  }
  if (![entryDomain, originDomain, fastDomain].every(isValidDomain)) {
    return c.json({ error: 'Invalid domain format' }, 400);
  }

  const weight = Number.isFinite(Number(payload.weight))
    ? Math.max(0, Math.round(Number(payload.weight)))
    : current.weight;
  const tags = payload.tags === undefined ? current.tags : String(payload.tags ?? '').trim();
  const enabled =
    payload.enabled === undefined
      ? current.enabled
      : payload.enabled === false || payload.enabled === 0
      ? 0
      : 1;
  const notes = payload.notes === undefined ? current.notes : String(payload.notes ?? '').trim();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'UPDATE lines SET name = ?, entry_domain = ?, origin_domain = ?, fast_domain = ?, weight = ?, tags = ?, enabled = ?, notes = ?, updated_at = ? WHERE id = ?'
  )
    .bind(name, entryDomain, originDomain, fastDomain, weight, tags, enabled, notes, now, id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM lines WHERE id = ?').bind(id).first();
  if (!updated) {
    return c.json({ error: 'Failed to update line' }, 500);
  }
  return c.json(toLine(updated as Record<string, unknown>));
});

app.delete('/api/lines/:id', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }
  const result = await c.env.DB.prepare('DELETE FROM lines WHERE id = ?').bind(id).run();
  return c.json({ ok: (result.meta?.changes ?? 0) > 0 });
});

app.get('/api/fast-domains', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  await ensureDefaultFastDomains(c.env.DB);
  const result = await c.env.DB.prepare(
    'SELECT * FROM fast_domains ORDER BY is_default DESC, domain ASC'
  ).all();
  const list = (result.results ?? []).map(toFastDomain);
  return c.json(list);
});

app.post('/api/fast-domains', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  let payload: Record<string, unknown> = {};
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const domain = normalizeDomain(String(payload.domain ?? ''));
  if (!isValidDomain(domain)) {
    return c.json({ error: 'Invalid domain format' }, 400);
  }
  const label = String(payload.label ?? '').trim();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO fast_domains (domain, label, is_default, created_at) VALUES (?, ?, 0, ?)'
  )
    .bind(domain, label, now)
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM fast_domains WHERE domain = ?')
    .bind(domain)
    .first();
  if (!created) {
    return c.json({ error: 'Failed to add fast domain' }, 500);
  }
  return c.json(toFastDomain(created as Record<string, unknown>), 201);
});

app.delete('/api/fast-domains/:id', async (c) => {
  const dbError = ensureDB(c);
  if (dbError) return dbError;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT * FROM fast_domains WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }
  const row = toFastDomain(existing as Record<string, unknown>);
  if (row.is_default === 1) {
    return c.json({ error: 'Default domain cannot be deleted' }, 400);
  }
  const result = await c.env.DB.prepare('DELETE FROM fast_domains WHERE id = ?').bind(id).run();
  return c.json({ ok: (result.meta?.changes ?? 0) > 0 });
});

app.all('*', async (c) => {
  if (!c.env.ASSETS) {
    return c.text('Assets not configured', 500);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
