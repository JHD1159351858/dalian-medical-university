'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { LogIn, LogOut, Stethoscope, X } from 'lucide-react'
import { clearStudentSession, getStudentClient, RecordsError } from '../records/studentSession'
import { completeChaoxingLogin, getChaoxingLoginConfiguration, getChaoxingLoginUrl, getChaoxingLogoutUrl } from './chaoxingAuth'
import './studentAuth.css'

interface StudentAuth {
  user: User | null
  status: 'loading' | 'signed_out' | 'signed_in' | 'unconfigured'
  busy: boolean
  login: (next?: '/' | '/training') => Promise<void>
  logout: () => Promise<void>
}

const StudentAuthContext = createContext<StudentAuth>({ user: null, status: 'loading', busy: false, login: async () => {}, logout: async () => {} })
const callbackPath = '/auth/chaoxing/callback'
const callbackErrors: Record<string, string> = {
  config_missing: '超星登录与学生会话连接尚未配置，请联系管理员。',
  invalid_state: '登录请求已失效，请重新发起超星登录。',
  ticket_invalid: '登录票据已失效，请重新发起超星登录。',
  session_failed: '学生会话建立失败，请重试或联系管理员。',
}

export function useStudentAuth() {
  return useContext(StudentAuthContext)
}

export function RequireStudentSession({ children }: { children: ReactNode }) {
  const { user, status, busy, login } = useStudentAuth()
  if (status === 'loading') return <div className="training-loading" role="status">正在检查登录状态…</div>
  if (status !== 'signed_in' || !user) return <main className="student-auth-callback"><section className="student-auth-card"><Stethoscope size={36} aria-hidden="true" /><h1>请先登录</h1><p>登录学生账号后，才能开始实训。</p><div className="student-auth-actions"><button type="button" className="icon-text-button" disabled={busy} onClick={() => void login('/training')}>{busy ? '正在登录…' : '超星登录'}</button><button type="button" className="icon-text-button" onClick={() => window.location.assign(window.location.origin)}>返回首页</button></div></section></main>
  return children
}

export function StudentAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<StudentAuth['status']>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [callbackStatus, setCallbackStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const actionRunning = useRef(false)
  const callbackStarted = useRef(false)
  const callbackFailure = useRef<string | null>(null)
  const callbackTask = useRef<ReturnType<typeof completeChaoxingLogin> | null>(null)

  useEffect(() => {
    if (window.location.pathname === callbackPath) return
    let active = true
    let unsubscribe: (() => void) | undefined
    void getStudentClient().then(async (client) => {
      const current = await client.auth.getSession()
      if (current.error) throw new RecordsError('学生登录已失效，请重新登录。', 401)
      let currentUser: User | null = null
      if (current.data.session) {
        const verified = await client.auth.getUser()
        if (verified.error || !verified.data.user || verified.data.user.id !== current.data.session.user.id) {
          await clearStudentSession()
          throw new RecordsError('学生登录已失效，请重新登录。', 401)
        }
        currentUser = verified.data.user
      }
      if (!active) return
      setUser(currentUser)
      setStatus(currentUser ? 'signed_in' : 'signed_out')
      const subscription = client.auth.onAuthStateChange((_event, session) => {
        if (!active) return
        setUser(session?.user ?? null)
        setStatus(session ? 'signed_in' : 'signed_out')
      })
      unsubscribe = () => subscription.data.subscription.unsubscribe()
    }).catch((reason: unknown) => {
      if (!active) return
      setUser(null)
      setStatus(reason instanceof RecordsError && reason.status === 401 ? 'signed_out' : 'unconfigured')
    })
    return () => { active = false; unsubscribe?.() }
  }, [])

  useEffect(() => {
    if (window.location.pathname !== callbackPath) return
    let active = true
    if (!callbackStarted.current) {
      callbackStarted.current = true
      const code = new URLSearchParams(window.location.search).get('error')
      window.history.replaceState(null, '', callbackPath)
      if (code) callbackFailure.current = callbackErrors[code] ?? '超星登录未完成，请重新登录。'
      else callbackTask.current = completeChaoxingLogin()
    }
    if (callbackFailure.current) {
      setError(callbackFailure.current)
      setCallbackStatus('error')
      return
    }
    setCallbackStatus('working')
    void callbackTask.current?.then(({ session, next }) => {
      if (!active) return
      setUser(session.user)
      setStatus('signed_in')
      window.location.replace(next)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : '超星登录未完成，请重新登录。')
      setCallbackStatus('error')
    })
    return () => { active = false }
  }, [])

  const login = useCallback(async (next: '/' | '/training' = '/') => {
    if (actionRunning.current) return
    actionRunning.current = true
    setBusy(true)
    setError('')
    try {
      const config = await getChaoxingLoginConfiguration()
      if (!config.available) throw new Error(config.message ?? '超星登录尚未配置，请联系管理员。')
      window.location.assign(getChaoxingLoginUrl(next))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法发起超星登录，请稍后重试。')
      actionRunning.current = false
      setBusy(false)
    }
  }, [])

  const logout = useCallback(async () => {
    if (actionRunning.current) return
    actionRunning.current = true
    setBusy(true)
    setError('')
    try {
      const config = await getChaoxingLoginConfiguration().catch(() => null)
      await clearStudentSession()
      setUser(null)
      setStatus('signed_out')
      window.location.assign(config?.available ? getChaoxingLogoutUrl('/') : '/')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '退出登录失败，请稍后重试。')
      actionRunning.current = false
      setBusy(false)
    }
  }, [])

  return <StudentAuthContext.Provider value={{ user, status, busy, login, logout }}>
    {callbackStatus === 'idle' ? children : <main className="student-auth-callback"><section className="student-auth-card"><Stethoscope size={36} aria-hidden="true" /><h1>{callbackStatus === 'working' ? '正在完成超星登录' : '超星登录未完成'}</h1><p role={callbackStatus === 'error' ? 'alert' : 'status'}>{callbackStatus === 'working' ? '正在验证学生身份，请稍候…' : error}</p>{callbackStatus === 'error' && <div className="student-auth-actions"><button type="button" className="icon-text-button" disabled={busy} onClick={() => void login('/')}>重新超星登录</button><button type="button" className="icon-text-button" onClick={() => window.location.assign('/')}>返回首页</button></div>}</section></main>}
    {callbackStatus === 'idle' && error && <div className="student-auth-notice" role="alert"><span>{error}</span><button type="button" aria-label="关闭登录提示" onClick={() => setError('')}><X size={18} /></button></div>}
  </StudentAuthContext.Provider>
}

export function StudentAccount({ returnTo = '/' }: { returnTo?: '/' | '/training' }) {
  const { user, status, busy, login, logout } = useStudentAuth()
  const labels: unknown[] = user ? [user.user_metadata.display_name, user.user_metadata.displayName, user.user_metadata.name, user.user_metadata.full_name] : []
  const name = labels.find((value): value is string => typeof value === 'string' && !!value.trim())?.trim().slice(0, 80) ?? '已登录学生'
  return <div className="student-account">{user ? <><span className="student-account-name">{name}</span><button type="button" className="icon-text-button" disabled={busy} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />退出登录</button></> : <button type="button" className="icon-text-button" disabled={busy || status === 'loading'} onClick={() => void login(returnTo)}><LogIn size={16} aria-hidden="true" />{busy ? '正在登录…' : '超星登录'}</button>}</div>
}
