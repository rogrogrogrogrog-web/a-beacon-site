/*
  Site Worker. Static files in public/ are served by Cloudflare's asset
  handling; only /api/* reaches this code (see run_worker_first in wrangler.jsonc).

  Public:
    GET    /api/comments?page=/posts/devlog-004/   approved comments for a page
    POST   /api/comments                           submit a comment (held as pending)

  Admin (Authorization: Bearer <ADMIN_PASSWORD>):
    GET    /api/admin/comments?status=pending|approved
    POST   /api/admin/comments/:id/approve
    POST   /api/admin/comments/:id/unapprove        back to pending (hidden from the site)
    DELETE /api/admin/comments/:id

  Bindings: DB (D1). Secrets: RECAPTCHA_SECRET, ADMIN_PASSWORD.
*/

const MAX_NAME = 60;
const MAX_MESSAGE = 2000;
const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_COUNT = 3;          // comments allowed per IP...
const RATE_LIMIT_WINDOW = '-10 minutes'; // ...within this window
const PAGE_PATTERN = /^\/posts\/[a-z0-9-]+\/$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/comments') {
        if (request.method === 'GET') return listApproved(url, env);
        if (request.method === 'POST') return createComment(request, env);
        return json({ error: 'Method not allowed' }, 405);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!(await isAdmin(request, env))) return json({ error: 'Unauthorised' }, 401);
        return handleAdmin(request, url, env);
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500);
    }
  },
};

async function listApproved(url, env) {
  const page = url.searchParams.get('page') || '';
  if (!PAGE_PATTERN.test(page)) return json({ error: 'Invalid page' }, 400);

  const { results } = await env.DB.prepare(
    `SELECT id, name, message, created_at FROM comments
     WHERE page = ? AND status = 'approved'
     ORDER BY created_at ASC, id ASC`
  ).bind(page).all();

  return json({ comments: results });
}

async function createComment(request, env) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json({ error: 'Expected JSON' }, 415);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Comment is too long' }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  // Honeypot: real visitors never see this field. Pretend it worked.
  if (body.website) return json({ status: 'pending' }, 202);

  const page = String(body.page || '');
  const name = String(body.name || '').trim();
  const message = String(body.message || '').trim();

  if (!PAGE_PATTERN.test(page)) return json({ error: 'Invalid page' }, 400);
  if (!name || name.length > MAX_NAME) {
    return json({ error: `Please enter a name (up to ${MAX_NAME} characters).` }, 400);
  }
  if (!message || message.length > MAX_MESSAGE) {
    return json({ error: `Please enter a comment (up to ${MAX_MESSAGE} characters).` }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await verifyRecaptcha(String(body.token || ''), ip, env))) {
    return json({ error: 'The reCAPTCHA check failed. Please try again.' }, 400);
  }

  const ipHash = await sha256Hex(`${env.RECAPTCHA_SECRET}:${ip}`);
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM comments
     WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)`
  ).bind(ipHash, RATE_LIMIT_WINDOW).first();
  if (recent && recent.n >= RATE_LIMIT_COUNT) {
    return json({ error: "You're commenting a bit fast. Please wait a few minutes." }, 429);
  }

  await env.DB.prepare(
    'INSERT INTO comments (page, name, message, ip_hash) VALUES (?, ?, ?, ?)'
  ).bind(page, name, message, ipHash).run();

  return json({ status: 'pending' }, 202);
}

async function verifyRecaptcha(token, ip, env) {
  if (!token || !env.RECAPTCHA_SECRET) return false;
  const form = new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token });
  if (ip) form.set('remoteip', ip);

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}

async function handleAdmin(request, url, env) {
  if (url.pathname === '/api/admin/comments' && request.method === 'GET') {
    const status = url.searchParams.get('status') === 'approved' ? 'approved' : 'pending';
    const { results } = await env.DB.prepare(
      `SELECT id, page, name, message, status, created_at FROM comments
       WHERE status = ? ORDER BY created_at DESC LIMIT 200`
    ).bind(status).all();
    return json({ comments: results });
  }

  const match = url.pathname.match(/^\/api\/admin\/comments\/(\d+)(\/approve|\/unapprove)?$/);
  if (match) {
    const id = Number(match[1]);
    if (match[2] && request.method === 'POST') {
      const newStatus = match[2] === '/approve' ? 'approved' : 'pending';
      const { meta } = await env.DB.prepare(
        'UPDATE comments SET status = ? WHERE id = ?'
      ).bind(newStatus, id).run();
      return meta.changes ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }
    if (!match[2] && request.method === 'DELETE') {
      const { meta } = await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
      return meta.changes ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }
  }

  return json({ error: 'Not found' }, 404);
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Compare fixed-length digests so the check takes the same time for any input.
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_PASSWORD)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

async function sha256Hex(text) {
  const bytes = new Uint8Array(await sha256(text));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
