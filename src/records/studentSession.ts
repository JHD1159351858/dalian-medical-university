import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'

export class RecordsError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

let clientPromise: Promise<SupabaseClient> | null = null

export function getStudentClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch('/api/records-config')
      const config: { url?: unknown; publishableKey?: unknown } | null = await response.json().catch(() => null)
      if (!response.ok || !config || typeof config.url !== 'string' || typeof config.publishableKey !== 'string') {
        throw new RecordsError('接诊记录的云端存档尚未配置，请联系管理员。', 503)
      }
      return createClient(config.url, config.publishableKey)
    })().catch((error: unknown) => { clientPromise = null; throw error })
  }
  return clientPromise
}

/** 超星验票服务兑换真实 Supabase Auth 会话后，从回调页面调用。 */
export async function setStudentSession(tokens: { access_token: string; refresh_token: string }) {
  const client = await getStudentClient()
  const { data, error } = await client.auth.setSession(tokens)
  if (error || !data.session) throw new RecordsError('学生登录会话无效，请重新登录。', 401)
  return data.session
}

export async function clearStudentSession() {
  const client = await getStudentClient()
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) throw error
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
