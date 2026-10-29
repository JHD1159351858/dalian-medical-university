import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Activity, ArrowLeft, ArrowRight, Check, ClipboardList, Ear, Eye, MessageCircle, Send, Square, UserRound } from 'lucide-react'
import { PatientPortrait } from '../exam/ExamScene'
import type { ChatMessage } from '../diagnosis/chat'
import type { ConversationStatus } from '../diagnosis/DiagnosisPage'
import { clinicalModules, moduleItems, type ClinicalModuleId } from './caseData'
import { FourExaminationViewer, fourExaminations, type FourExaminationKind } from './FourExaminationViewer'

export interface FourDiagnosisPageProps {
  messages: ChatMessage[]
  draft: string
  status: ConversationStatus
  error: string
  muted: boolean
  records: Record<string, string>
  onDraftChange: (value: string) => void
  onRecordChange: (id: string, value: string) => void
  onSend: () => void
  onStopReading: () => void
  onBack: () => void
  onNext: () => void
  onReset: () => void
  onNavigate: (module: ClinicalModuleId) => void
}

const tools = [
  { id: 'look', label: '望诊', detail: '神色 · 形态 · 舌象', icon: Eye },
  { id: 'listen', label: '闻诊', detail: '声音 · 呼吸 · 气味', icon: Ear },
  { id: 'ask', label: '问诊', detail: '寒热 · 饮食 · 二便', icon: MessageCircle },
  { id: 'feel', label: '切诊', detail: '脉象 · 腹部按诊', icon: Activity },
  { id: 'summary', label: '四诊总结', detail: '四诊合参', icon: ClipboardList },
]

const guidance: Record<string, [string, string][]> = {
  look: [['神色', '观察面色、神志、精神状态'], ['形态', '观察体型、姿态、动态表现'], ['舌质', '观察舌体的颜色、形态'], ['舌苔', '观察舌苔的颜色、厚薄、润燥']],
  listen: [['声音', '关注语声、咳嗽等声音表现'], ['呼吸', '留意呼吸节律及异常声音'], ['气味', '记录患者描述或检查中发现的异常气味']],
  ask: [['寒热', '询问发热、畏寒与汗出'], ['饮食', '了解食欲、口渴与饮食情况'], ['二便', '询问大小便的变化'], ['追问', '在右侧向患者提问，补充四诊信息']],
  feel: [['脉象', '记录脉象的检查所见'], ['按诊', '记录腹部按诊的部位与反应'], ['依据', '结合问诊与检查所见进行记录']],
}

const statusCopy: Record<ConversationStatus, string> = {
  checking: '正在连接模拟患者…', input: '可以提问', thinking: '患者正在回忆…',
  replying: '患者正在回答…', talking: '患者正在回答',
  unavailable: '模拟患者暂不可用，请联系教师检查服务配置。', error: '可重新发送',
}

export function FourDiagnosisPage({ messages, draft, status, error, muted, records, onDraftChange, onRecordChange, onSend, onStopReading, onBack, onNext, onNavigate }: FourDiagnosisPageProps) {
  const [selected, setSelected] = useState('look')
  const [examination, setExamination] = useState<FourExaminationKind | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const activeItem = moduleItems.fourDiagnosis.find((item) => item.id === selected)!
  const completed = tools.filter((tool) => records[tool.id]?.trim()).length
  const canSend = status === 'input' || status === 'error'
  const inputDisabled = ['checking', 'unavailable', 'thinking', 'replying'].includes(status)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, status])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSend && draft.trim()) onSend()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSend && draft.trim()) onSend()
    }
  }

  return <section className="four-workspace" aria-label="中医四诊训练台">
    <aside className="four-rail">
      <div className="four-rail-heading"><strong>接诊流程</strong><span>CASE 01</span></div>
      <nav aria-label="病例模块">{clinicalModules.map((module, index) => <button key={module.id} type="button" className={module.id === 'fourDiagnosis' ? 'is-active' : ''} aria-current={module.id === 'fourDiagnosis' ? 'step' : undefined} onClick={() => onNavigate(module.id)}><b>{module.short}</b><span>{module.label}</span>{index < 2 && <Check size={18} />}</button>)}</nav>
      <div className="four-rail-caption"><ClipboardList size={20} /><span>临床综合实训</span></div>
    </aside>

    <div className="four-main">
      <header className="four-heading">
        <div className="four-title"><h1>中医四诊</h1><p>望闻问切 · 证候采集</p></div>
        <div className="four-patient-identity">王旭 <span>· 男 · 48 岁 · 门诊初诊</span></div>
        <div className="four-progress"><span>{completed}/5 已记录</span><div role="progressbar" aria-label="四诊记录进度" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completed}><i style={{ width: `${completed / 5 * 100}%` }} /></div></div>
      </header>

      <div className="four-tools" role="tablist" aria-label="四诊项目">{tools.map(({ id, label, detail, icon: Icon }) => <button key={id} id={`four-tool-${id}`} type="button" role="tab" aria-selected={selected === id} aria-controls="four-current-task" className={selected === id ? 'is-active' : ''} onClick={() => setSelected(id)}><Icon size={30} /><span><strong>{label}{records[id]?.trim() && <Check size={13} aria-label="已记录" />}</strong><small>{detail}</small></span></button>)}</div>

      <section className="four-patient-stage" aria-label="患者观察场景">
        <span className="four-standard-patient">标准化病人</span>
        <div className="four-patient-model"><PatientPortrait /></div>
        <div className="four-stage-status"><span>意识清楚</span><span><i />患者在场</span></div>
        <aside className="four-guidance" id="four-current-task" role="tabpanel" aria-labelledby={`four-tool-${selected}`}>
          <div className="four-guidance-heading"><h2>{selected === 'summary' ? '四诊总结' : `${activeItem.label}要点`}</h2>{(selected === 'look' || selected === 'listen' || selected === 'feel') && <button type="button" className="four-view-examination" onClick={() => setExamination(selected)}><Eye size={17} />{fourExaminations[selected].button}</button>}</div>
          {selected === 'summary' ? <dl>{tools.slice(0, 4).map((tool) => <div key={tool.id}><dt>{tool.label}</dt><dd>{records[tool.id]?.trim() || '尚未填写记录'}</dd></div>)}</dl> : <dl>{guidance[selected].map(([label, detail]) => <div key={label}><dt>{label}</dt><dd>{detail}</dd></div>)}</dl>}
          <p>{selected === 'summary' ? '结合四诊记录，在下方整理证候依据。' : '观察后，在下方记录检查所见。'}</p>
        </aside>
      </section>

      <section className="four-record" aria-label="当前四诊记录">
        <div><h2>{selected === 'summary' ? '四诊总结' : `${activeItem.label}记录`}</h2><span>{activeItem.detail}</span></div>
        <textarea aria-label="检查记录" placeholder="补充你的检查所见或判断…" value={records[selected] ?? ''} onChange={(event) => onRecordChange(selected, event.target.value)} />
      </section>
    </div>

    <aside className="four-chat" aria-label="AI 患者聊天">
      <header className="four-chat-heading"><h2>AI 患者 · 王旭</h2><span>教学模拟</span><div className={`four-chat-status four-status-${status}`}><i />{statusCopy[status]}</div>{status === 'talking' && <button type="button" className="four-stop-reading" onClick={onStopReading}><Square size={13} />停止朗读</button>}</header>
      <div className="four-chat-messages" ref={logRef} aria-live="polite">
        {messages.length ? messages.map((message, index) => <div key={index} className={`four-message four-message-${message.role}`}><div className="four-message-avatar">{message.role === 'user' ? <UserRound size={19} /> : '王'}</div><div><span>{message.role === 'user' ? '学生' : '王旭'}</span><p>{message.content}</p></div></div>) : <div className="four-chat-empty"><MessageCircle size={34} /><strong>从一句问题开始</strong><p>向王旭提问，采集四诊信息。</p></div>}
        {status === 'thinking' && <p className="four-chat-thinking">患者正在回忆，请稍候…</p>}
      </div>
      <form className="four-chat-composer" onSubmit={submit}>
        <label htmlFor="four-patient-question">向患者提问</label>
        <div><textarea id="four-patient-question" value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="向王旭提问…" maxLength={4000} disabled={inputDisabled} rows={2} /><button type="submit" aria-label="发送问题" disabled={!canSend || !draft.trim()}><Send size={22} /><span>发送</span></button></div>
        {error && <p className="four-chat-error" role="alert">{error}</p>}
      </form>
    </aside>

    <footer className="four-footer"><button type="button" className="four-back" onClick={onBack}><ArrowLeft size={21} />返回上一步</button><span>完成当前项目后，继续下一模块</span><button type="button" className="four-next" onClick={onNext}>进入辅助检查<ArrowRight size={22} /></button></footer>
    {examination && <FourExaminationViewer kind={examination} voiceText={[...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim())?.content || '医生我身体不舒服'} muted={muted} onStopReading={onStopReading} onClose={() => setExamination(null)} />}
  </section>
}
