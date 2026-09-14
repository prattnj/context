import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE = 'ctx_session';
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function sign(payload) {
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verify(token) {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const expected = sign(payload);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && Date.now() < expires;
}

export function checkPassword(password) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected || typeof password !== 'string') return false;
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function issueCookie(res) {
  const token = sign(String(Date.now() + TTL_MS));
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_MS,
  });
}

export function clearCookie(res) {
  res.clearCookie(COOKIE);
}

export function requireAuth(req, res, next) {
  if (verify(req.cookies?.[COOKIE])) return next();
  res.status(401).json({ error: 'unauthorized' });
}

export function isAuthed(req) {
  return verify(req.cookies?.[COOKIE]);
}
