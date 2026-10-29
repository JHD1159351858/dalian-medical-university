import { FormEvent, KeyboardEvent, RefObject, useEffect, useRef } from 'react'
import { ArrowLeft, LogOut, RotateCcw, Send, Square, Stethoscope, UserRound } from 'lucide-react'

import type { ChatMessage } from './chat'
import { PATIENT_OPENING } from '../clinical/caseData'

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
    <section className="diagnosis-page" aria-label="问诊训练台">
      <header className="diagnosis-header">
        <button className="text-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={17} /> 返回场景
        </button>
        <div className="diagnosis-title">
          <span>OUTPATIENT · CASE 01</span>
          <strong>门诊问诊记录</strong>
          <small>临床问诊训练台</small>
        </div>
        <div className="diagnosis-actions">
          <button className="text-button finish-button" type="button" onClick={onFinish} title="结束接诊并让患者离院">
            <LogOut aria-hidden="true" size={16} /> 结束接诊
          </button>
          <button className="text-button danger-button" type="button" onClick={onReset} title="重置训练">
            <RotateCcw aria-hidden="true" size={16} /> 重置训练
          </button>
        </div>
      </header>

      <div className="diagnosis-grid">
        <article className="identity-card patient-identity">
          <div className="card-kicker">STANDARDIZED PATIENT <span>01</span></div>
          <div className="identity-heading">
            <span className="role-mark">SP</span>
            <div><small>标准化病人</small><h2>王旭，48 岁</h2></div>
          </div>
          <div className="avatar-viewport" ref={patientView} aria-label="患者三维形象" />
          <div className="case-facts"><span>男</span><span>门诊初诊</span><span>意识清楚</span></div>
        </article>

        <article className="identity-card doctor-identity">
          <div className="card-kicker">STUDENT ROLE <span>ONLINE</span></div>
          <div className="identity-heading">
            <span className="role-mark role-mark-doctor"><Stethoscope aria-hidden="true" size={17} /></span>
            <div><small>学生角色</small><h2>接诊医生</h2></div>
          </div>
          <div className="avatar-viewport" ref={doctorView} aria-label="医生三维形象" />
          <div className="case-facts"><span>问诊中</span><span>请独立判断</span></div>
        </article>

        <aside className="latest-reply">
          <div className="section-label">主诉摘要 <span>CHIEF COMPLAINT</span></div>
          <blockquote>{latestReply ?? PATIENT_OPENING}</blockquote>
          <p>围绕部位、性质、持续时间与伴随表现展开追问。</p>
          <div className="summary-rule"><i /><span>问诊目标</span><strong>采集现病史</strong></div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-topline">
            <div><span className={`status-dot status-${status}`} />{statusCopy[status]}</div>
            {status === 'talking' && (
              <button className="compact-button" type="button" onClick={onStopReading}>
                <Square aria-hidden="true" size={13} /> 停止朗读
              </button>
            )}
          </div>

          <div className="message-log" ref={logRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-conversation">
                <UserRound aria-hidden="true" size={22} />
                <strong>根据患者主诉继续追问</strong>
                <span>例如：“您肚子具体哪个部位疼？疼痛是什么感觉？”</span>
              </div>
            ) : messages.map((message, index) => (
              <div className={`message message-${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === 'user' ? '你' : '王旭'}</span>
                <p>{message.content}</p>
              </div>
            ))}
            {status === 'thinking' && <div className="thinking-row"><i /><i /><i /></div>}
          </div>

          <form className="composer" onSubmit={submit}>
            <label htmlFor="question">向患者提问</label>
            <div className="composer-row">
              <textarea
                id="question"
                rows={2}
                maxLength={4000}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="输入你的问诊问题…"
                disabled={status === 'checking' || status === 'unavailable' || status === 'thinking' || status === 'replying'}
              />
              <button className="send-button" type="submit" disabled={!canSend || !draft.trim()} aria-label="发送问题">
                <Send aria-hidden="true" size={19} />
              </button>
            </div>
            {error && <p className="inline-error" role="alert">{error}</p>}
          </form>
          <div className="diagnosis-next-step">
            <div><span>下一步</span><strong>完成问诊记录后，进行腹部触诊</strong></div>
            <button type="button" onClick={onBeginExam}><Stethoscope aria-hidden="true" size={15} /> 开始体格检查</button>
          </div>
        </section>
      </div>
    </section>
  )
}
