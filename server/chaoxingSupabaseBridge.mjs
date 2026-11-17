import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { recordsConfiguration } from './encounterRecords.mjs';

/** @typedef {Record<string, string | undefined>} BridgeEnvironment */
/** @typedef {{ issuer: string, subject: string, displayName: string }} VerifiedIdentity */
const failed = () => new Error('超星登录会话暂时无法建立，请稍后重新登录。');

/** @param {BridgeEnvironment} env */
function configuration(env) {
  const publicConfig = recordsConfiguration(env);
  const adminKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const identitySecret = (env.SSO_IDENTITY_SECRET || '').trim();
  let privileged = /^sb_secret_[A-Za-z0-9_-]+$/.test(adminKey);
  if (!privileged && adminKey.split('.').length === 3) {
    try { privileged = JSON.parse(Buffer.from(adminKey.split('.')[1], 'base64url').toString('utf8')).role === 'service_role'; } catch { privileged = false; }
  }
  if (!privileged || identitySecret.length < 32 || publicConfig.status !== 200 || !('url' in publicConfig.body)) return null;
  const target = new URL(publicConfig.body.url);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))) return null;
  return { ...publicConfig.body, adminKey, identitySecret };
}

/** @param {BridgeEnvironment} env */
export function chaoxingBridgeConfigured(env = process.env) {
  return Boolean(configuration(env));
}

/**
 * @param {VerifiedIdentity} identity
 * @param {{ env?: BridgeEnvironment, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ access_token: string, refresh_token: string }>}
 */
export async function createChaoxingSupabaseSession(identity, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = configuration(env);
  if (!config) throw Object.assign(new Error('超星登录会话尚未配置，请联系管理员。'), { status: 503 });
  try {
    if (!identity || typeof identity.issuer !== 'string' || !identity.issuer || identity.issuer.length > 512 || typeof identity.subject !== 'string' || !identity.subject || identity.subject.length > 512 || typeof identity.displayName !== 'string') throw failed();
    const email = `cx_${createHmac('sha256', config.identitySecret).update(JSON.stringify([identity.issuer, identity.subject])).digest('hex').slice(0, 48)}@hospital-auth.invalid`;
    const marker = { issuer: identity.issuer, subject: identity.subject };
    const profile = { full_name: identity.displayName.trim().slice(0, 120) };
    /** @type {typeof fetch} */
    const safeFetch = async (input, init) => {
      try {
        const timeout = AbortSignal.timeout(10_000);
        return await fetchImpl(input, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
      } catch { throw failed(); }
    };
    /** @param {string} key */
    const client = (key) => createClient(config.url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: safeFetch, headers: config.tenantId ? { 'X-Instance-ID': config.tenantId } : {} },
    });
    const admin = client(config.adminKey);
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { hospital_sso: marker }, user_metadata: profile });
    if (created.error && !['email_exists', 'user_already_exists'].includes(created.error.code ?? '')) throw failed();
    if (!created.error && !created.data.user?.id) throw failed();

    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const user = link.data.user;
    const stored = user?.app_metadata?.hospital_sso;
    if (link.error || !user || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) || user.email !== email || !stored || typeof stored !== 'object' || stored.issuer !== marker.issuer || stored.subject !== marker.subject || !link.data.properties?.hashed_token) throw failed();
    if (created.data.user?.id && created.data.user.id !== user.id) throw failed();
    const updated = await admin.auth.admin.updateUserById(user.id, { user_metadata: profile });
    if (updated.error) throw failed();

    const verified = await client(config.publishableKey).auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
    const session = verified.data.session;
    if (verified.error || verified.data.user?.id !== user.id || session?.user?.id !== user.id || typeof session.access_token !== 'string' || !session.access_token || session.access_token.length > 12_000 || typeof session.refresh_token !== 'string' || !session.refresh_token || session.refresh_token.length > 2_000) throw failed();
    return { access_token: session.access_token, refresh_token: session.refresh_token };
  } catch { throw failed(); }
}
