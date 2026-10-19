'use client';

import { FormEvent, KeyboardEvent, RefObject, useEffect, useRef } from 'react'
import { ArrowLeft, LogOut, RotateCcw, Send, Square, Stethoscope, UserRound } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { ChatMessage } from './chat'
import { PATIENT_OPENING } from '@/clinical/caseData'

const AvatarCanvas = dynamic(() => import('@/scene/AvatarCanvas'), { ssr: false })

export type ConversationStatus = 'checking' | 'input' | 'thinking' | 'replying' | 'talking' | 'unavailable' | 'error'

interface DiagnosisPageProps {
  patientView: RefObject<HTMLDivElement | null>
  doctorView: RefObject<HTMLDivElement | null>
  messages: ChatMessage[]
  draft: string
  status: ConversationStatus
  error: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onStopReading: () => void
  onBack: () => void
  onReset: () => void
  onFinish: () => void
  onBeginExam: () => void
}

const statusCopy: Record<ConversationStatus, string> = {
  checking: '正在连接模拟患者…',
  input: '请围绕主诉继续追问',
  thinking: '患者正在回忆…',
  replying: '患者正在回答…',
  talking: '患者正在回答',
  unavailable: '模拟患者暂不可用，请联系教师检查服务配置。',
  error: '本次提问未送达，请保留原问题并重试。',
}

export function DiagnosisPage({
  patientView,
  doctorView,
  messages,
  draft,
  status,
  error,
  onDraftChange,
  onSend,
  onStopReading,
  onBack,
  onReset,
  onFinish,
  onBeginExam,
}: DiagnosisPageProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const latestReply = [...messages].reverse().find((message) => message.role === 'assistant')?.content
  const canSend = status === 'input' || status === 'error'

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSend && draft.trim()) onSend()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    if (canSend && draft.trim()) onSend()
  }

  return (
    <section className="diagnosis-page flex min-h-screen flex-col bg-[#e9f1f2] text-[#173d49]" aria-label="问诊训练台">
      <header className="diagnosis-header flex items-center justify-between border-b border-[#d4e4e6] bg-white px-6 py-4">
        <button className="text-button inline-flex items-center gap-2 text-sm text-[#19758a] hover:text-[#0d4d66]" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={17} /> 返回场景
        </button>
        <div className="diagnosis-title text-center">
          <span className="block text-xs tracking-widest text-[#70878f]">OUTPATIENT · CASE 01</span>
          <strong className="block text-lg">门诊问诊记录</strong>
          <small className="text-xs text-[#70878f]">临床问诊训练台</small>
        </div>
        <div className="diagnosis-actions flex items-center gap-3">
          <button className="text-button finish-button inline-flex items-center gap-1.5 text-sm text-[#19758a] hover:text-[#0d4d66]" type="button" onClick={onFinish} title="结束接诊并让患者离院">
            <LogOut aria-hidden="true" size={16} /> 结束接诊
          </button>
          <button className="text-button danger-button inline-flex items-center gap-1.5 text-sm text-[#a64747] hover:text-[#7a3535]" type="button" onClick={onReset} title="重置训练">
            <RotateCcw aria-hidden="true" size={16} /> 重置训练
          </button>
        </div>
      </header>

      <div className="diagnosis-grid flex flex-1 gap-4 overflow-hidden p-4 lg:grid lg:grid-cols-[27%_1fr_25%]">
        <article className="identity-card patient-identity hidden flex-col rounded-xl border border-[#d4e4e6] bg-white p-4 shadow-sm lg:flex">
          <div className="card-kicker mb-3 text-xs font-semibold tracking-widest text-[#70878f]">STANDARDIZED PATIENT <span className="ml-2 text-[#19758a]">01</span></div>
          <div className="identity-heading mb-3 flex items-center gap-3">
            <span className="role-mark grid h-10 w-10 place-items-center rounded-full bg-[#dceff1] text-sm font-bold text-[#19758a]">SP</span>
            <div>
              <small className="block text-xs text-[#70878f]">标准化病人</small>
              <h2 className="font-serif text-xl font-semibold">王旭，48 岁</h2>
            </div>
          </div>
          <div className="avatar-viewport relative mb-3 min-h-[200px] flex-1 rounded-lg bg-[#eef6f6]" ref={patientView} aria-label="患者三维形象">
            <AvatarCanvas path="/models/patient.glb" />
          </div>
          <div className="case-facts flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-[#eef6f6] px-2 py-1 text-[#19758a]">男</span>
            <span className="rounded bg-[#eef6f6] px-2 py-1 text-[#19758a]">门诊初诊</span>
            <span className="rounded bg-[#eef6f6] px-2 py-1 text-[#19758a]">意识清楚</span>
          </div>
        </article>

        <article className="identity-card doctor-identity hidden flex-col rounded-xl border border-[#d4e4e6] bg-white p-4 shadow-sm lg:order-3 lg:flex">
          <div className="card-kicker mb-3 text-xs font-semibold tracking-widest text-[#70878f]">STUDENT ROLE <span className="ml-2 text-[#3b9079]">ONLINE</span></div>
          <div className="identity-heading mb-3 flex items-center gap-3">
            <span className="role-mark role-mark-doctor grid h-10 w-10 place-items-center rounded-full bg-[#0d4d66] text-white">
              <Stethoscope aria-hidden="true" size={17} />
            </span>
            <div>
              <small className="block text-xs text-[#70878f]">学生角色</small>
              <h2 className="font-serif text-xl font-semibold">接诊医生</h2>
            </div>
          </div>
          <div className="avatar-viewport relative mb-3 min-h-[200px] flex-1 rounded-lg bg-[#eef6f6]" ref={doctorView} aria-label="医生三维形象">
            <AvatarCanvas path="/models/doctor.glb" />
          </div>
          <div className="case-facts flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-[#eef6f6] px-2 py-1 text-[#19758a]">问诊中</span>
            <span className="rounded bg-[#eef6f6] px-2 py-1 text-[#19758a]">请独立判断</span>
          </div>
        </article>

        <aside className="latest-reply hidden flex-col rounded-xl border border-[#d4e4e6] bg-white p-4 shadow-sm lg:order-3 lg:flex">
          <div className="section-label mb-2 text-xs font-semibold tracking-widest text-[#70878f]">主诉摘要 <span className="ml-2 text-[#19758a]">CHIEF COMPLAINT</span></div>
          <blockquote className="mb-3 border-l-4 border-[#19758a] bg-[#eef6f6] p-3 text-sm italic text-[#173d49]">{latestReply ?? PATIENT_OPENING}</blockquote>
          <p className="mb-4 text-xs text-[#70878f]">围绕部位、性质、持续时间与伴随表现展开追问。</p>
          <div className="summary-rule mt-auto flex items-center gap-3 border-t border-[#d4e4e6] pt-3 text-sm">
            <span className="text-[#70878f]">问诊目标</span>
            <strong className="text-[#0d4d66]">采集现病史</strong>
          </div>
        </aside>

        <section className="conversation-panel flex min-h-0 flex-col rounded-xl border border-[#d4e4e6] bg-white p-4 shadow-sm lg:col-span-1 lg:row-span-2">
          <div className="conversation-topline mb-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={`status-dot h-2.5 w-2.5 rounded-full ${status === 'input' ? 'bg-[#3b9079]' : status === 'error' || status === 'unavailable' ? 'bg-[#a64747]' : 'bg-[#19758a]'}`} />
              <span className="text-[#70878f]">{statusCopy[status]}</span>
            </div>
            {status === 'talking' && (
              <button className="compact-button inline-flex items-center gap-1.5 rounded bg-[#eef6f6] px-2 py-1 text-xs text-[#19758a] hover:bg-[#dceff1]" type="button" onClick={onStopReading}>
                <Square aria-hidden="true" size={13} /> 停止朗读
              </button>
            )}
          </div>

          <div className="message-log flex-1 overflow-y-auto pr-2" ref={logRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-conversation flex h-full flex-col items-center justify-center gap-3 text-center text-[#70878f]">
                <UserRound aria-hidden="true" size={22} />
                <strong className="text-[#173d49]">根据患者主诉继续追问</strong>
                <span className="text-sm">例如：“您肚子具体哪个部位疼？疼痛是什么感觉？”</span>
              </div>
            ) : (
              messages.map((message, index) => (
                <div className={`message mb-4 flex ${message.role === 'user' ? 'flex-row-reverse' : ''}`} key={`${message.role}-${index}`}>
                  <div className="max-w-[78%]">
                    <span className={`block text-xs ${message.role === 'user' ? 'text-right' : ''} text-[#70878f]`}>{message.role === 'user' ? '你' : '王旭'}</span>
                    <p className={`mt-1 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-tr-none bg-[#08698b] text-white' : 'rounded-tl-none bg-[#e2f3fc] text-[#345a76]'}`}>
                      {message.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            {status === 'thinking' && (
              <div className="thinking-row flex gap-1.5">
                <i className="h-2 w-2 animate-bounce rounded-full bg-[#19758a]" />
                <i className="h-2 w-2 animate-bounce rounded-full bg-[#19758a] [animation-delay:0.15s]" />
                <i className="h-2 w-2 animate-bounce rounded-full bg-[#19758a] [animation-delay:0.3s]" />
              </div>
            )}
          </div>

          <form className="composer mt-3 border-t border-[#d4e4e6] pt-3" onSubmit={submit}>
            <label htmlFor="question" className="mb-2 block text-sm font-semibold text-[#234865]">向患者提问</label>
            <div className="composer-row flex gap-2">
              <textarea
                id="question"
                rows={2}
                maxLength={4000}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="输入你的问诊问题…"
                disabled={status === 'checking' || status === 'unavailable' || status === 'thinking' || status === 'replying'}
                className="min-w-0 flex-1 resize-none rounded-lg border border-[#cfe5f3] bg-white px-3 py-2 text-sm text-[#2b526e] placeholder:text-[#94a7bb] focus:border-[#19758a] focus:outline-none"
              />
              <button className="send-button grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg bg-[#0d4d66] text-white transition hover:bg-[#19758a] disabled:opacity-50" type="submit" disabled={!canSend || !draft.trim()} aria-label="发送问题">
                <Send aria-hidden="true" size={19} />
              </button>
            </div>
            {error && <p className="inline-error mt-2 text-sm text-[#a64747]" role="alert">{error}</p>}
          </form>
          <div className="diagnosis-next-step mt-3 flex items-center justify-between rounded-lg bg-[#eef6f6] p-3">
            <div className="text-sm">
              <span className="text-[#70878f]">下一步</span>
              <strong className="ml-2 text-[#0d4d66]">完成问诊记录后，进行腹部触诊</strong>
            </div>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-[#19758a] px-3 py-1.5 text-sm text-white hover:bg-[#0d4d66]" onClick={onBeginExam}>
              <Stethoscope aria-hidden="true" size={15} /> 开始体格检查
            </button>
          </div>
        </section>
      </div>
    </section>
  )
}
