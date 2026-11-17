import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chaoxingBridgeConfigured, createChaoxingSupabaseSession } from './chaoxingSupabaseBridge.mjs';

const COOKIE = 'hospital_chaoxing_sso';
const COOKIE_PATH = '/api/auth/chaoxing';
const CALLBACK = '/api/auth/chaoxing/callback';
const FRONT_CALLBACK = '/auth/chaoxing/callback';
const CONTEXT_SECONDS = 300;
const HANDOFF_SECONDS = 90;
const AAD = Buffer.from('hospital_chaoxing_sso:v1');

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const localHttp = (url) => url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

function origin(value) {
  try {
    const url = new URL(value || '');
    return (url.protocol === 'https:' || localHttp(url)) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' ? url.origin : null;
  } catch { return null; }
}

function settings(env) {
  const center = origin(env.SSO_CENTER_URL);
  const site = origin(env.APP_PUBLIC_URL);
  const sharedSecret = (env.SSO_SHARED_SECRET || '').trim();
  const sessionSecret = (env.SSO_SESSION_SECRET || '').trim();
  if (!center || !site || !sharedSecret || sessionSecret.length < 32) return null;
  return { center, site, sharedSecret, key: createHash('sha256').update(sessionSecret).digest() };
}

export function safeChaoxingNext(value, site, fallback = '/training') {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, site);
    const decoded = decodeURIComponent(url.pathname);
    if (url.origin !== site || url.pathname.startsWith('//') || decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    if (url.pathname.startsWith(COOKIE_PATH) || url.pathname.startsWith('/auth/chaoxing')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

function encrypt(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

function decrypt(value, key) {
  try {
    const [version, ivText, encryptedText, tagText, extra] = value.split('.');
    if (version !== 'v1' || extra || ![ivText, encryptedText, tagText].every((part) => typeof part === 'string' && /^[A-Za-z0-9_-]+$/.test(part))) return null;
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(AAD);
    cipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([cipher.update(Buffer.from(encryptedText, 'base64url')), cipher.final()]).toString('utf8'));
    return object(payload) ? payload : null;
  } catch { return null; }
}

function readCookie(headers) {
  return (headers.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}

function cookie(value, seconds, site) {
  return `${COOKIE}=${value}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${seconds}${site?.startsWith('https:') ? '; Secure' : ''}`;
}

/** @param {number} status
 * @param {Record<string, unknown> | null} body
 * @param {Record<string, string>} headers
 * @returns {{ status: number, body: Record<string, unknown> | null, headers: Record<string, string> }} */
function response(status, body, headers = {}) {
  return { status, body, headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', ...headers } };
}

function failedCallback(code, config, env) {
  return response(302, null, { location: `${FRONT_CALLBACK}?error=${code}`, 'set-cookie': cookie('', 0, config?.site || origin(env.APP_PUBLIC_URL)) });
}

function stableValue(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && value.trim() && value.trim().length <= 256 ? value.trim() : null;
}

function identity(value, issuer) {
  if (!object(value)) return null;
  const uid = stableValue(value.uid);
  const openid = stableValue(value.openid);
  if (!uid && !openid) return null;
  const name = [value.displayName, value.name].find((entry) => typeof entry === 'string' && entry.trim());
  return { issuer, subject: uid ? `uid:${uid}` : `openid:${openid}`, displayName: typeof name === 'string' ? name.trim().slice(0, 120) : '超星学生' };
}

function sameState(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length > 128 || right.length > 128) return false;
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}

/** @param {{ action: string, url: string, headers: Headers, method?: string }} input
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number, bridgeImpl?: typeof createChaoxingSupabaseSession, now?: () => number }} options */
export async function chaoxingAuth(input, { env = process.env, fetchImpl = globalThis.fetch, signal, timeoutMs = 15_000, bridgeImpl = createChaoxingSupabaseSession, now = Date.now } = {}) {
  const config = settings(env);
  const available = Boolean(config && chaoxingBridgeConfigured(env));
  if (input.action === 'config') return response(200, { available, message: available ? '可使用超星账号登录。' : '超星登录尚未配置完成，请联系管理员。' });
  const search = new URL(input.url, 'http://localhost').searchParams;
  if (input.action === 'logout') {
    const center = origin(env.SSO_CENTER_URL);
    const site = origin(env.APP_PUBLIC_URL);
    if (!center || !site) return response(503, { error: '超星退出尚未配置。' });
    const destination = new URL('/logout', center);
    destination.searchParams.set('return_to', new URL(safeChaoxingNext(search.get('next'), site, '/'), site).toString());
    return response(302, null, { location: destination.toString(), 'set-cookie': cookie('', 0, site) });
  }
  if (!config || !available) return input.action === 'callback' ? failedCallback('config_missing', config, env) : response(503, { error: '超星登录尚未配置完成，请联系管理员。' });
  if (input.action === 'start') {
    const state = randomBytes(32).toString('base64url');
    const next = safeChaoxingNext(search.get('next'), config.site);
    const callback = new URL(CALLBACK, config.site);
    callback.searchParams.set('state', state);
    const destination = new URL('/api/auth/chaoxing', config.center);
    destination.searchParams.set('return_to', callback.toString());
    return response(302, null, { location: destination.toString(), 'set-cookie': cookie(encrypt({ type: 'state', state, next, expiresAt: now() + CONTEXT_SECONDS * 1000 }, config.key), CONTEXT_SECONDS, config.site) });
  }
  const rawCookie = readCookie(input.headers);
  const context = rawCookie.length <= 4096 ? decrypt(rawCookie, config.key) : null;
  if (input.action === 'session') {
    if (input.method !== 'POST') return response(405, { error: '请求方式无效。' });
    if (input.headers.get('origin') !== config.site) return response(403, { error: '登录交接请求来源无效。' });
    const expired = { 'set-cookie': cookie('', 0, config.site) };
    if (!context || context.type !== 'session' || typeof context.expiresAt !== 'number' || context.expiresAt <= now() || typeof context.access_token !== 'string' || typeof context.refresh_token !== 'string') return response(401, { error: '超星登录已失效，请重新登录。' }, expired);
    return response(200, { access_token: context.access_token, refresh_token: context.refresh_token, next: safeChaoxingNext(context.next, config.site) }, expired);
  }
  if (input.action !== 'callback') return response(404, { error: '未找到登录接口。' });
  if (!context || context.type !== 'state' || typeof context.expiresAt !== 'number' || context.expiresAt <= now() || !sameState(context.state, search.get('state'))) return failedCallback('invalid_state', config, env);
  const ticket = search.get('ticket');
  if (!ticket || ticket.length > 4096) return failedCallback('ticket_invalid', config, env);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  let failureCode = 'ticket_invalid';
  try {
    const verified = await fetchImpl(`${config.center}/api/sso/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket, secret: config.sharedSecret }), signal: controller.signal, redirect: 'error',
    });
    if (!verified.ok) return failedCallback('ticket_invalid', config, env);
    const user = identity(await verified.json().catch(() => null), config.center);
    if (!user) return failedCallback('ticket_invalid', config, env);
    failureCode = 'session_failed';
    const tokens = await bridgeImpl(user, { env, fetchImpl: (url, init) => fetchImpl(url, { ...init, signal: controller.signal }) });
    if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) return failedCallback('session_failed', config, env);
    const handoff = encrypt({ type: 'session', access_token: tokens.access_token, refresh_token: tokens.refresh_token, next: safeChaoxingNext(context.next, config.site), expiresAt: now() + HANDOFF_SECONDS * 1000 }, config.key);
    if (handoff.length > 3700) return failedCallback('session_failed', config, env);
    return response(302, null, { location: FRONT_CALLBACK, 'set-cookie': cookie(handoff, HANDOFF_SECONDS, config.site) });
  } catch {
    return failedCallback(failureCode, config, env);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
