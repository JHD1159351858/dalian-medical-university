import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useProgress } from '@react-three/drei'
import { RotateCcw, ShieldCheck, Stethoscope, Volume2, VolumeX } from 'lucide-react'

import { requestReply, checkChatAvailability, type ChatMessage } from './diagnosis/chat'
import { DiagnosisPage, type ConversationStatus } from './diagnosis/DiagnosisPage'
import { PhysicalExamPage } from './exam/PhysicalExamPage'
import { ClinicalModulePage } from './clinical/ClinicalModulePage'
import { PATIENT_OPENING, type ClinicalModuleId } from './clinical/caseData'
import { createInitialTreatmentPlan } from './clinical/treatmentPlan'
import { initialFlow, transition } from './flow'
import World, { clearModelCache } from './scene/World'
import type { DoorAction } from './scene/collision'
import { emotionForSpeech, preloadSpeech, speakChinese, startSpeechStream, stopSpeech, type SpeechStreamController } from './diagnosis/speech'
import { PATIENT_VOICE_PROFILE } from './diagnosis/voiceProfiles'

const phaseLabels = {
  loading: '载入临床场景',
  ready: '准备进入诊室',
  walking: '前往接诊区',
  waiting: '患者等待接诊',
  patientSpeech: '听取患者主诉',
  doctorDialog: '根据主诉开始问诊',
  diagnosis: '问诊进行中',
  physicalExam: '体格检查进行中',
  fourDiagnosis: '中医四诊进行中',
  auxiliaryExam: '辅助检查进行中',
  clinicalDiagnosis: '诊断记录进行中',
  treatment: '处置方案进行中',
  exiting: '患者正在离院',
  completed: '本次接诊已结束',
} as const

function App({ autoStart = false }: { autoStart?: boolean }) {
  const [flow, sendFlow] = useReducer(transition, initialFlow)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const [sceneError, setSceneError] = useState('')
  const [sceneAttempt, setSceneAttempt] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [conversationStatus, setConversationStatus] = useState<ConversationStatus>('checking')
  const [conversationError, setConversationError] = useState('')
  const [fourDiagnosisRecords, setFourDiagnosisRecords] = useState<Record<string, string>>({})
  const [auxiliaryExamRecords, setAuxiliaryExamRecords] = useState<Record<string, string>>({})
  const [clinicalDiagnosisRecords, setClinicalDiagnosisRecords] = useState<Record<string, string>>({})
  const [treatmentPlan, setTreatmentPlan] = useState(createInitialTreatmentPlan)
  const [canInteract, setCanInteract] = useState(false)
  const [doorAction, setDoorAction] = useState<DoorAction | null>(null)
  const [interactionRequest, setInteractionRequest] = useState(0)
  const [arrivalNotice, setArrivalNotice] = useState(false)
  const movementInput = useRef({ x: 0, y: 0 })
  const patientView = useRef<HTMLDivElement>(null)
  const doctorView = useRef<HTMLDivElement>(null)
  const requestRef = useRef<{ controller: AbortController; id: number } | null>(null)
  const speechStreamRef = useRef<SpeechStreamController | null>(null)
  const requestId = useRef(0)
  const { progress } = useProgress()
  const firstEntry = useRef(autoStart)
  useEffect(() => {
    if (flow.phase === 'ready' && firstEntry.current) {
      firstEntry.current = false
      sendFlow({ type: 'START' })
    }
  }, [flow.phase])
  const isDiagnosis = flow.phase === 'diagnosis'
  const isFourDiagnosis = flow.phase === 'fourDiagnosis'
  const isAuxiliaryExam = flow.phase === 'auxiliaryExam'
  const isClinicalDiagnosis = flow.phase === 'clinicalDiagnosis'
  const isTreatment = flow.phase === 'treatment'
  const canChat = isDiagnosis || isFourDiagnosis
  const isPhysicalExam = flow.phase === 'physicalExam'
  const isClinicalModule = ['fourDiagnosis', 'auxiliaryExam', 'clinicalDiagnosis', 'treatment'].includes(flow.phase)
  const canMove = ['walking', 'waiting', 'exiting', 'completed'].includes(flow.phase) && !sceneError

  const requestInteraction = useCallback(() => {
    if (canMove) setInteractionRequest((request) => request + 1)
  }, [canMove])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (canMove) { event.preventDefault(); requestInteraction() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canMove, requestInteraction])

  useEffect(() => {
    if (!arrivalNotice) return
    const timeout = window.setTimeout(() => setArrivalNotice(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [arrivalNotice])

  useEffect(() => {
    if (flow.phase !== 'waiting') return
    const emotion = emotionForSpeech(PATIENT_OPENING)
    void preloadSpeech(PATIENT_OPENING, { ...PATIENT_VOICE_PROFILE, emotion })
  }, [flow.phase])

  const handleArrive = useCallback(() => {
    sendFlow({ type: 'ARRIVED' })
    setArrivalNotice(true)
  }, [])

  const abortConversation = useCallback(() => {
    requestId.current += 1
    requestRef.current?.controller.abort()
    requestRef.current = null
    speechStreamRef.current?.stop()
    speechStreamRef.current = null
    stopSpeech()
  }, [])

  useEffect(() => {
    if (!canChat) {
      abortConversation()
      return
    }
    const controller = new AbortController()
    const id = ++requestId.current
    setConversationStatus('checking')
    setConversationError('')
    checkChatAvailability(controller.signal).then((available) => {
      if (id !== requestId.current || controller.signal.aborted) return
      setConversationStatus(available ? 'input' : 'unavailable')
    })
    return () => controller.abort()
  }, [canChat, flow.phase, flow.session, abortConversation])

  useEffect(() => {
    if (flow.phase !== 'patientSpeech') return
    setMessages((current) => current.length ? current : [{ role: 'assistant', content: PATIENT_OPENING }])
    let minimumElapsed = false
    let voiceFinished = muted
    let advanced = false
    const finish = () => {
      if (minimumElapsed && voiceFinished && !advanced) {
        advanced = true
        sendFlow({ type: 'PATIENT_SPEECH_DONE' })
      }
    }
    const minimumTimer = window.setTimeout(() => {
      minimumElapsed = true
      finish()
    }, Math.max(2200, PATIENT_OPENING.length * 160))
    const fallbackTimer = window.setTimeout(() => {
      voiceFinished = true
      finish()
    }, Math.max(8500, PATIENT_OPENING.length * 400))
    if (!muted) {
      const started = speakChinese(PATIENT_OPENING, () => {
        voiceFinished = true
        finish()
      }, emotionForSpeech(PATIENT_OPENING), PATIENT_VOICE_PROFILE)
      if (!started) voiceFinished = true
    }
    finish()
    return () => {
      window.clearTimeout(minimumTimer)
      window.clearTimeout(fallbackTimer)
      stopSpeech()
    }
  }, [flow.phase, muted])

  const sendQuestion = async () => {
    const question = draft.trim()
    if (!question || requestRef.current || (conversationStatus !== 'input' && conversationStatus !== 'error')) return

    abortConversation()
    const controller = new AbortController()
    const id = ++requestId.current
    requestRef.current = { controller, id }
    setConversationStatus('thinking')
    setConversationError('')

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(nextMessages)
    setDraft('')
    let partialReply = ''
    const speechStream = mutedRef.current ? null : startSpeechStream(
      PATIENT_VOICE_PROFILE,
      () => {
        if (id === requestId.current && !controller.signal.aborted) setConversationStatus('talking')
      },
      () => {
        if (id !== requestId.current || controller.signal.aborted) return
        speechStreamRef.current = null
        setConversationStatus(requestRef.current ? 'replying' : 'input')
      },
    )
    speechStreamRef.current = speechStream
    try {
      const reply = await requestReply(nextMessages, (text) => {
        if (id !== requestId.current || controller.signal.aborted) return
        partialReply += text
        setMessages([...nextMessages, { role: 'assistant', content: partialReply }])
        setConversationStatus((status) => status === 'talking' ? status : 'replying')
        if (speechStream && speechStreamRef.current === speechStream) {
          speechStream.push(text)
        }
      }, controller.signal)
      if (id !== requestId.current || controller.signal.aborted) return
      setMessages([...nextMessages, { role: 'assistant', content: reply }])
      requestRef.current = null
      if (speechStream && speechStreamRef.current === speechStream) {
        if (reply.startsWith(partialReply)) speechStream.push(reply.slice(partialReply.length))
        speechStream.finish()
      } else {
        setConversationStatus('input')
      }
    } catch (error) {
      if (controller.signal.aborted || id !== requestId.current) return
      requestRef.current = null
      speechStream?.stop()
      if (speechStreamRef.current === speechStream) speechStreamRef.current = null
      setMessages(messages)
      setDraft(question)
      setConversationStatus('error')
      setConversationError(error instanceof Error ? error.message : '患者暂时无法回应，请稍后重试。')
    }
  }

  const stopReading = () => {
    speechStreamRef.current?.stop()
    speechStreamRef.current = null
    stopSpeech()
    setConversationStatus(requestRef.current ? 'replying' : 'input')
  }

  const toggleMute = () => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    if (next) {
      speechStreamRef.current?.stop()
      speechStreamRef.current = null
      stopSpeech()
      if (conversationStatus === 'talking' || conversationStatus === 'replying') setConversationStatus(requestRef.current ? 'replying' : 'input')
    }
  }

  const resetTraining = () => {
    abortConversation()
    setMessages([])
    setDraft('')
    setConversationError('')
    setFourDiagnosisRecords({})
    setAuxiliaryExamRecords({})
    setClinicalDiagnosisRecords({})
    setTreatmentPlan(createInitialTreatmentPlan())
    setArrivalNotice(false)
    setCanInteract(false)
    setDoorAction(null)
    setSceneError('')
    sendFlow({ type: 'RESET' })
  }

  const retryScene = () => {
    clearModelCache()
    setSceneError('')
    setSceneAttempt((attempt) => attempt + 1)
  }

  const leaveDiagnosis = (finish: boolean) => {
    abortConversation()
    sendFlow({ type: finish ? 'FINISH' : 'BACK' })
  }

  const navigateFourDiagnosis = (module: ClinicalModuleId) => {
    if (module === 'fourDiagnosis') return
    abortConversation()
    if (module === 'diagnosis' || module === 'physicalExam') {
      sendFlow({ type: 'BACK' })
      if (module === 'diagnosis') sendFlow({ type: 'BACK' })
    } else {
      sendFlow({ type: 'BEGIN_AUXILIARY_EXAM' })
      if (module === 'clinicalDiagnosis' || module === 'treatment') sendFlow({ type: 'BEGIN_CLINICAL_DIAGNOSIS' })
      if (module === 'treatment') sendFlow({ type: 'BEGIN_TREATMENT' })
    }
  }

  const navigateAuxiliaryExam = (module: ClinicalModuleId) => {
    if (module === 'auxiliaryExam') return
    abortConversation()
    if (module === 'diagnosis' || module === 'physicalExam' || module === 'fourDiagnosis') {
      sendFlow({ type: 'BACK' })
      if (module !== 'fourDiagnosis') navigateFourDiagnosis(module)
    } else {
      sendFlow({ type: 'BEGIN_CLINICAL_DIAGNOSIS' })
      if (module === 'treatment') sendFlow({ type: 'BEGIN_TREATMENT' })
    }
  }

  const navigateClinicalDiagnosis = (module: ClinicalModuleId) => {
    if (module === 'clinicalDiagnosis') return
    abortConversation()
    if (module === 'treatment') {
      sendFlow({ type: 'BEGIN_TREATMENT' })
    } else {
      sendFlow({ type: 'BACK' })
      if (module !== 'auxiliaryExam') navigateAuxiliaryExam(module)
    }
  }

  const navigateTreatment = (module: ClinicalModuleId) => {
    if (module === 'treatment') return
    abortConversation()
    sendFlow({ type: 'BACK' })
    if (module !== 'clinicalDiagnosis') navigateClinicalDiagnosis(module)
  }

  return (
    <main className={`app-shell ${isDiagnosis ? 'is-diagnosis' : ''} ${isPhysicalExam ? 'is-exam-app' : ''} ${isFourDiagnosis ? 'is-four-diagnosis' : ''} ${isAuxiliaryExam ? 'is-auxiliary-exam' : ''} ${isClinicalDiagnosis ? 'is-clinical-diagnosis' : ''} ${isTreatment ? 'is-treatment' : ''}`}>
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-seal"><Stethoscope aria-hidden="true" size={20} /></span>
          <div><strong>大连医科大学</strong><span>临床问诊实训</span></div>
        </div>
        <div className="header-actions">
          <span className="session-chip"><ShieldCheck aria-hidden="true" size={15} /> 教学模拟环境</span>
          <button className="icon-text-button" type="button" onClick={toggleMute}>
            {muted ? <VolumeX aria-hidden="true" size={17} /> : <Volume2 aria-hidden="true" size={17} />}
            {muted ? '开启语音' : '静音'}
          </button>
          {!isDiagnosis && flow.phase !== 'loading' && (
            <button className="icon-text-button" type="button" onClick={resetTraining}>
              <RotateCcw aria-hidden="true" size={16} /> {isFourDiagnosis || isAuxiliaryExam || isClinicalDiagnosis || isTreatment ? '重置训练' : '重播场景'}
            </button>
          )}
        </div>
      </header>

      <div className={`stage-shell ${isDiagnosis ? 'is-diagnosis-shell' : ''} ${isPhysicalExam ? 'is-exam-shell' : ''} ${isFourDiagnosis ? 'is-four-diagnosis-shell' : isAuxiliaryExam ? 'is-auxiliary-exam-shell' : isClinicalDiagnosis ? 'is-clinical-diagnosis-shell' : isTreatment ? 'is-treatment-shell' : isClinicalModule ? 'is-clinical-shell' : ''}`}>
        {!isPhysicalExam && !isClinicalModule && <div className={`world-layer ${isDiagnosis ? 'world-diagnosis' : ''}`} aria-hidden="true">
          <World
            key={`${flow.session}-${sceneAttempt}`}
            phase={flow.phase}
            patientSpeaking={flow.phase === 'patientSpeech' || (isDiagnosis && conversationStatus === 'talking')}
            movementInput={movementInput}
            interactionRequest={interactionRequest}
            patientView={patientView}
            doctorView={doctorView}
            onReady={() => sendFlow({ type: 'WORLD_READY' })}
            onArrive={handleArrive}
            onDepart={() => sendFlow({ type: 'DEPARTED' })}
            onInteract={() => { setArrivalNotice(false); sendFlow({ type: 'INTERACT' }) }}
            onInteractionChange={setCanInteract}
            onDoorInteractionChange={setDoorAction}
            onError={setSceneError}
          />
        </div>}

        {isDiagnosis ? (
          <DiagnosisPage
            patientView={patientView}
            doctorView={doctorView}
            messages={messages}
            draft={draft}
            status={conversationStatus}
            error={conversationError}
            onDraftChange={setDraft}
            onSend={sendQuestion}
            onStopReading={stopReading}
            onBack={() => leaveDiagnosis(false)}
            onFinish={() => leaveDiagnosis(true)}
            onReset={resetTraining}
            onBeginExam={() => sendFlow({ type: 'BEGIN_EXAM' })}
          />
        ) : isPhysicalExam ? (
          <PhysicalExamPage
            muted={muted}
            onBack={() => sendFlow({ type: 'BACK' })}
            onFinish={() => sendFlow({ type: 'BEGIN_FOUR_DIAGNOSIS' })}
            onReset={resetTraining}
          />
        ) : isClinicalModule ? (
          <ClinicalModulePage
            module={flow.phase as 'fourDiagnosis' | 'auxiliaryExam' | 'clinicalDiagnosis' | 'treatment'}
            onBack={() => sendFlow({ type: 'BACK' })}
            onNext={() => sendFlow({ type: flow.phase === 'fourDiagnosis' ? 'BEGIN_AUXILIARY_EXAM' : flow.phase === 'auxiliaryExam' ? 'BEGIN_CLINICAL_DIAGNOSIS' : flow.phase === 'clinicalDiagnosis' ? 'BEGIN_TREATMENT' : 'COMPLETE_CASE' })}
            onReset={resetTraining}
            fourDiagnosis={isFourDiagnosis ? {
              messages,
              draft,
              status: conversationStatus,
              error: conversationError,
              muted,
              records: fourDiagnosisRecords,
              onDraftChange: setDraft,
              onSend: sendQuestion,
              onStopReading: stopReading,
              onBack: () => sendFlow({ type: 'BACK' }),
              onNext: () => sendFlow({ type: 'BEGIN_AUXILIARY_EXAM' }),
              onReset: resetTraining,
              onRecordChange: (id, value) => setFourDiagnosisRecords((current) => ({ ...current, [id]: value })),
              onNavigate: navigateFourDiagnosis,
            } : undefined}
            auxiliaryExam={isAuxiliaryExam ? {
              records: auxiliaryExamRecords,
              onRecordChange: (id, value) => setAuxiliaryExamRecords((current) => ({ ...current, [id]: value })),
              onBack: () => sendFlow({ type: 'BACK' }),
              onNext: () => sendFlow({ type: 'BEGIN_CLINICAL_DIAGNOSIS' }),
              onNavigate: navigateAuxiliaryExam,
            } : undefined}
            clinicalDiagnosis={isClinicalDiagnosis ? {
              records: clinicalDiagnosisRecords,
              onRecordChange: (id, value) => setClinicalDiagnosisRecords((current) => ({ ...current, [id]: value })),
              onBack: () => sendFlow({ type: 'BACK' }),
              onNext: () => sendFlow({ type: 'BEGIN_TREATMENT' }),
              onNavigate: navigateClinicalDiagnosis,
            } : undefined}
            treatment={isTreatment ? {
              plan: treatmentPlan,
              onPlanChange: setTreatmentPlan,
              onBack: () => sendFlow({ type: 'BACK' }),
              onFinish: () => sendFlow({ type: 'COMPLETE_CASE' }),
              onNavigate: navigateTreatment,
            } : undefined}
          />
        ) : (
          <section className={`hospital-interface ${canMove ? 'is-playing' : ''}`}>
            <div className="scene-index" aria-label="当前训练阶段">
              <span>情境实训 · 01</span>
              <strong>{phaseLabels[flow.phase]}</strong>
            </div>

            <aside className="episode-rail">
              <div className="rail-heading"><span>OUTPATIENT</span><strong>门诊接诊</strong></div>
              <dl>
                <div><dt>病例</dt><dd>01</dd></div>
                <div><dt>地点</dt><dd>综合门诊</dd></div>
                <div><dt>目标</dt><dd>完成主诉与现病史采集</dd></div>
              </dl>
              <div className="progress-steps">
                {['进入诊室', '听取主诉', '开始问诊'].map((label, index) => {
                  const stage = ['loading', 'ready', 'walking', 'waiting'].includes(flow.phase) ? 0 : flow.phase === 'patientSpeech' ? 1 : 2
                  return <div className={index <= stage ? 'is-complete' : ''} key={label}><i>{index + 1}</i><span>{label}</span></div>
                })}
              </div>
            </aside>

            <div className="stage-prompt">
              {flow.phase === 'loading' && (
                <div className="loading-card">
                  <span>正在准备实训场景</span>
                  <div className="loading-track"><i style={{ width: `${Math.max(8, progress)}%` }} /></div>
                  <small>{Math.round(progress)}%</small>
                </div>
              )}
              {flow.phase === 'ready' && (
                <div className="prompt-card">
                  <span className="prompt-kicker">临床情境已就绪</span>
                  <h1>从第一句主诉开始</h1>
                  <p>你是接诊医生。自由移动，待患者到达后，靠近并按 F 开始接诊。</p>
                  <button className="primary-button" type="button" onClick={() => sendFlow({ type: 'START' })}>进入医院</button>
                </div>
              )}
              {flow.phase === 'walking' && <div className="quiet-caption"><i /> 患者正在前往接诊区</div>}
              {flow.phase === 'waiting' && <div className="quiet-caption">{canInteract ? '按 F，主动开始接诊' : '患者正在等待，请靠近并面向患者'}</div>}
              {flow.phase === 'exiting' && <div className="quiet-caption"><i /> 患者正在离院，请保持通道畅通</div>}
              {flow.phase === 'completed' && <div className="prompt-card compact-prompt">
                <span className="prompt-kicker">本轮训练完成</span>
                <h2>患者已离院</h2>
                <p>准备好后，可以重新开始本病例的问诊训练。</p>
                <button className="primary-button" type="button" onClick={resetTraining}>开始下一轮</button>
              </div>}
              {flow.phase === 'patientSpeech' && <div className="subtitle-card"><span>王旭</span><p>{PATIENT_OPENING}</p></div>}
              {flow.phase === 'doctorDialog' && (
                <div className="prompt-card compact-prompt doctor-reply-card">
                  <span className="prompt-kicker">{flow.hasConsulted ? '继续问诊' : '王旭 · 患者主诉'}</span>
                  <blockquote>{flow.hasConsulted ? '根据已有问诊记录继续提问。' : PATIENT_OPENING}</blockquote>
                  <button className="primary-button" type="button" onClick={() => sendFlow({ type: 'BEGIN_DIAGNOSIS' })}>{flow.hasConsulted ? '继续问诊' : '开始问诊'}</button>
                </div>
              )}
              {sceneError && (
                <div className="scene-error" role="alert">
                  <span>{sceneError}</span>
                  <button type="button" onClick={retryScene}>重新加载</button>
                </div>
              )}
            </div>
            {arrivalNotice && <div className="arrival-notice" role="status"><Stethoscope size={19} aria-hidden="true" /><div><strong>有病人前来就诊</strong><span>王旭已到达接诊点，等待你主动接诊。</span></div></div>}
            {canMove && <HospitalControls movementInput={movementInput} waiting={flow.phase === 'waiting'} eligible={canInteract} doorAction={doorAction} resume={flow.hasConsulted} onInteract={requestInteraction} />}
          </section>
        )}
      </div>
    </main>
  )
}

export default App

function HospitalControls({ movementInput, waiting, eligible, doorAction, resume, onInteract }: {
  movementInput: RefObject<{ x: number; y: number }>
  waiting: boolean; eligible: boolean; doorAction: DoorAction | null; resume: boolean; onInteract: () => void
}) {
  const enabled = eligible || doorAction === 'open' || doorAction === 'close'
  const actionLabel = eligible || !doorAction ? (resume ? '继续接诊' : '接诊') : doorAction === 'open' ? '开门' : doorAction === 'close' ? '关门' : '门区有人'
  const promptLabel = enabled ? actionLabel : doorAction === 'blocked' ? '门区有人，暂不能关门' : '靠近并面向患者'
  const [thumb, setThumb] = useState({ x: 0, y: 0 })
  const pointer = useRef<number | null>(null)
  const release = useCallback(() => {
    pointer.current = null
    movementInput.current = { x: 0, y: 0 }
    setThumb({ x: 0, y: 0 })
  }, [movementInput])
  useEffect(() => {
    const hide = () => { if (document.hidden) release() }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', hide)
      movementInput.current = { x: 0, y: 0 }
    }
  }, [movementInput, release])
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left - rect.width / 2) / 34
    const y = (rect.top + rect.height / 2 - event.clientY) / 34
    const length = Math.hypot(x, y)
    const scale = length > 1 ? 1 / length : 1
    const next = length < 0.14 ? { x: 0, y: 0 } : { x: x * scale, y: y * scale }
    movementInput.current = next
    setThumb(next)
  }
  return <div className="game-controls">
    <div className="keyboard-guide"><span><kbd>W A S D</kbd> / <kbd>↑ ↓ ← →</kbd> 移动</span><small>拖动旋转视角 · 滚轮缩放</small></div>
    <div className="touch-joystick" role="application" aria-label="医生移动摇杆"
      onPointerDown={(event) => {
        if (pointer.current !== null) return
        event.preventDefault()
        pointer.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        move(event)
      }} onPointerMove={move} onPointerUp={(event) => { if (event.pointerId === pointer.current) release() }}
      onPointerCancel={(event) => { if (event.pointerId === pointer.current) release() }} onLostPointerCapture={release}>
      <span className="joystick-cross" aria-hidden="true">✣</span>
      <i style={{ transform: `translate(${thumb.x * 34}px, ${-thumb.y * 34}px)` }} />
      <span className="joystick-label">移动</span>
    </div>
    {(waiting || doorAction) && <div className={`interaction-prompt ${enabled ? 'is-eligible' : ''}`}>
      <span className="keyboard-interact"><kbd>F</kbd><span>{promptLabel}</span></span>
      <button type="button" className="touch-interact" aria-label={actionLabel} disabled={!enabled} onClick={onInteract}><kbd>F</kbd>{actionLabel}</button>
    </div>}
  </div>
}
