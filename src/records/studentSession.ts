import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'

export class RecordsError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

let clientPromise: Promise<SupabaseClient> | null = null

export function getStudentClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch('/api/records-config')
      const config: { url?: unknown; publishableKey?: unknown; tenantId?: unknown } | null = await response.json().catch(() => null)
      if (!response.ok || !config || typeof config.url !== 'string' || !config.url.trim() || typeof config.publishableKey !== 'string' || !config.publishableKey.trim()
        || (config.tenantId !== undefined && (typeof config.tenantId !== 'string' || !config.tenantId.trim() || config.tenantId.length > 256 || /[\u0000-\u001f\u007f]/.test(config.tenantId)))) {
        throw new RecordsError('接诊记录的云端存档尚未配置，请联系管理员。', 503)
      }
      return createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        ...(typeof config.tenantId === 'string' ? { global: { headers: { 'X-Instance-ID': config.tenantId } } } : {}),
      })
    })().catch((error: unknown) => { clientPromise = null; throw error })
  }
  return clientPromise
}

/** 超星服务端桥接取得真实 Supabase Auth 会话后，从回调页面调用。 */
export async function setStudentSession(tokens: { access_token: string; refresh_token: string }) {
  const client = await getStudentClient()
  try {
    const { data, error } = await client.auth.setSession(tokens)
    if (error || !data.session) throw new RecordsError('学生登录会话无效，请重新登录。', 401)
    const verified = await client.auth.getUser(data.session.access_token)
    if (verified.error || !verified.data.user || verified.data.user.id !== data.session.user.id) throw new RecordsError('学生登录会话无效，请重新登录。', 401)
    return { ...data.session, user: verified.data.user }
  } catch {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    throw new RecordsError('学生登录会话无效，请重新登录。', 401)
  }
}

export async function clearStudentSession() {
  const client = await getStudentClient()
  try {
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw new RecordsError('退出登录失败，请稍后重试。', 503)
  } catch {
    throw new RecordsError('退出登录失败，请稍后重试。', 503)
  }
}

export function studentIdentity(session: Session | null) {
  return session ? { userId: session.user.id, token: session.access_token } : null
}

export async function getStudentIdentity() {
  const client = await getStudentClient()
  const { data, error } = await client.auth.getSession()
  if (error) throw new RecordsError('学生登录已失效，请重新登录。', 401)
  return studentIdentity(data.session)
}
