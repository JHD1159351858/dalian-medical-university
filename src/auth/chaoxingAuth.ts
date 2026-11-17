import type { Session } from '@supabase/supabase-js'
import { setStudentSession } from '../records/studentSession'

export interface ChaoxingLoginConfiguration { available: boolean; message?: string }
export interface ChaoxingLoginResult { session: Session; next: string }
const unavailableMessage = '超星登录尚未配置，请联系管理员。'
let completion: Promise<ChaoxingLoginResult> | null = null

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function returnPath(next: string, fallback: string): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || /[\u0000-\u0020\u007f\\]/.test(next) || /^\/(?:%2f|%5c)/i.test(next)) return fallback
  try {
    const url = new URL(next, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid' || url.pathname.startsWith('//') || /^\/(?:%2f|%5c)/i.test(url.pathname)) return fallback
    for (const key of [...url.searchParams.keys()]) {
      if (['ticket', 'access_token', 'refresh_token'].includes(key.toLowerCase())) url.searchParams.delete(key)
    }
    return url.pathname + url.search + url.hash
  } catch { return fallback }
}

export function getChaoxingLoginUrl(next: string): string {
  return '/api/auth/chaoxing?' + new URLSearchParams({ next: returnPath(next, '/training') }).toString()
}

export function getChaoxingLogoutUrl(next = '/'): string {
  return '/api/auth/chaoxing/logout?' + new URLSearchParams({ next: returnPath(next, '/') }).toString()
}

async function request(path: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...options, credentials: 'same-origin', redirect: 'error' })
  } catch {
    throw new Error('无法连接超星登录服务，请稍后重试。')
  }
}

export async function getChaoxingLoginConfiguration(): Promise<ChaoxingLoginConfiguration> {
  const response = await request('/api/auth/chaoxing/config')
  if (response.status === 503) return { available: false, message: unavailableMessage }
  if (!response.ok) throw new Error('无法读取超星登录配置，请稍后重试。')
  const data: unknown = await response.json().catch(() => null)
  if (!object(data) || typeof data.available !== 'boolean' || (data.message !== undefined && typeof data.message !== 'string')) {
    throw new Error('超星登录配置返回格式异常，请联系管理员。')
  }
  return data.available ? { available: true } : { available: false, message: unavailableMessage }
}

export function completeChaoxingLogin(): Promise<ChaoxingLoginResult> {
  if (completion) return completion
  completion = (async () => {
    const response = await request('/api/auth/chaoxing/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    if (response.status === 401) throw new Error('超星登录已失效，请重新发起登录。')
    if (response.status === 503) throw new Error(unavailableMessage)
    if (!response.ok) throw new Error('超星登录未完成，请重新发起登录。')
    const data: unknown = await response.json().catch(() => null)
    if (!object(data) || typeof data.access_token !== 'string' || !data.access_token.trim() || typeof data.refresh_token !== 'string' || !data.refresh_token.trim()) {
      throw new Error('超星登录服务未返回有效会话，请重新登录。')
    }
    const session = await setStudentSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    return { session, next: returnPath(typeof data.next === 'string' ? data.next : '/', '/') }
  })()
  return completion
}
