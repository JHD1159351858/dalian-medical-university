import { useEffect, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, ChevronRight, Move, RotateCcw } from 'lucide-react'
import { PULSE_FINGER_LABELS, PULSE_FINGER_ORDER, PULSE_GEOMETRY, createPulsePlacement, handHeight, imagePointFromClient, misplacedFingers, pulsePlacementReducer, type FingerCount, type ImagePoint, type PulseFinger, type PulsePlacementState } from './pulsePlacement'
import { createPulseTouch, type PulsePressure } from './pulseTouch'
import { loadPulseCase, submitPulseAnswer, type PulseAssessment, type PulseCaseData } from './pulseExam'
import './pulsePalpation.css'

const asset = (count: FingerCount) => `/four-exam-images/realistic/doctor-hand-${count}.png`
const instructions = [
  { finger: 'middle', title: '先以中指定关', detail: '以桡骨茎突内侧确定关位。' },
  { finger: 'index', title: '食指定位寸', detail: '关前，靠近手掌、腕端。' },
  { finger: 'ring', title: '无名指定位尺', detail: '关后，靠近肘部。' },
] as const

interface DragSession {
  pointerId: number
  start: ImagePoint
  clientStart: ImagePoint
  position: ImagePoint
  previous: PulsePlacementState
  moved: boolean
}

export function PulsePalpationTrainer({ caseId = 'wang-xu' }: { caseId?: string }) {
  const [showHints, setShowHints] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [practice, dispatch] = useReducer(pulsePlacementReducer, undefined, () => createPulsePlacement())
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const touchRef = useRef<ReturnType<typeof createPulseTouch> | null>(null)
  const submitRef = useRef<AbortController | null>(null)
  const [caseData, setCaseData] = useState<PulseCaseData | null>(null)
  const [readings, setReadings] = useState<Partial<Record<PulseFinger, Partial<Record<PulsePressure, string>>>>>({})
  const [pressedFinger, setPressedFinger] = useState<PulseFinger | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [assessment, setAssessment] = useState<PulseAssessment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [caseError, setCaseError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setCaseData(null)
    setReadings({})
    setSelected([])
    setAssessment(null)
    setSubmitting(false)
    setPressedFinger(null)
    setError('')
    setCaseError('')
    dispatch({ type: 'reset' })
    void loadPulseCase(caseId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setCaseData(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setCaseError(reason instanceof Error ? reason.message : '病例脉诊资料暂不可用。')
    })
    return () => {
      controller.abort()
      submitRef.current?.abort()
      touchRef.current?.cancel()
    }
  }, [caseId])

  useEffect(() => {
    touchRef.current?.cancel()
    touchRef.current = null
    setPressedFinger(null)
  }, [practice.positionChecked, practice.count])

  const readFinger = (finger: PulseFinger, pressure: PulsePressure) => {
    if (!practice.positionChecked || !caseData || caseData.caseId !== caseId) return
    const description = caseData.positions[finger][pressure]
    setReadings((current) => ({ ...current, [finger]: { ...current[finger], [pressure]: description } }))
  }

  const startTouch = (event: PointerEvent<HTMLButtonElement>, finger: PulseFinger) => {
    if (!practice.positionChecked || !caseData || !event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    touchRef.current?.cancel()
    touchRef.current = createPulseTouch((pressure) => readFinger(finger, pressure))
    setPressedFinger(finger)
    event.currentTarget.setPointerCapture(event.pointerId)
    touchRef.current.start()
  }

  const endTouch = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    event.stopPropagation()
    if (cancelled) touchRef.current?.cancel()
    else touchRef.current?.release()
    touchRef.current = null
    setPressedFinger(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const reset = () => {
    touchRef.current?.cancel()
    submitRef.current?.abort()
    clearDrag()
    dispatch({ type: 'reset' })
    setReadings({})
    setSelected([])
    setAssessment(null)
    setSubmitting(false)
    setError('')
  }

  const submit = async () => {
    if (!caseData || submitting || !selected.length || !Object.keys(readings).length) return
    const controller = new AbortController()
    submitRef.current = controller
    setSubmitting(true)
    setError('')
    try {
      const result = await submitPulseAnswer(caseId, selected, controller.signal)
      if (!controller.signal.aborted) setAssessment(result)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '脉象判断暂时无法核对。')
    } finally {
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  const clearDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || dragRef.current || !canvasRef.current) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const start = imagePointFromClient({ x: event.clientX, y: event.clientY }, canvasRef.current.getBoundingClientRect())
    dragRef.current = { pointerId: event.pointerId, start, clientStart: { x: event.clientX, y: event.clientY }, position: practice.position, previous: practice, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId || !canvasRef.current) return
    const point = imagePointFromClient({ x: event.clientX, y: event.clientY }, canvasRef.current.getBoundingClientRect())
    if (!session.moved && Math.hypot(event.clientX - session.clientStart.x, event.clientY - session.clientStart.y) < 4) return
    session.moved = true
    session.position = { x: session.previous.position.x + point.x - session.start.x, y: session.previous.position.y + point.y - session.start.y }
    dispatch({ type: 'move', position: session.position })
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    clearDrag()
    if (cancelled) dispatch({ type: 'cancel', previous: session.previous })
    else dispatch({ type: 'drop', position: session.position, moved: session.moved })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      dispatch({ type: 'check' })
      return
    }
    const amount = event.shiftKey ? 1 : .25
    const delta: Record<string, ImagePoint> = { ArrowLeft: { x: -amount, y: 0 }, ArrowRight: { x: amount, y: 0 }, ArrowUp: { x: 0, y: -amount }, ArrowDown: { x: 0, y: amount } }
    if (!delta[event.key]) return
    event.preventDefault()
    dispatch({ type: 'nudge', dx: delta[event.key].x, dy: delta[event.key].y })
  }

  const { count, position, feedback } = practice
  const geometry = PULSE_GEOMETRY.hands[count]
  const handStyle: CSSProperties = { left: `${position.x - geometry.width / 2}%`, top: `${position.y - handHeight(count) / 2}%`, width: `${geometry.width}%`, height: `${handHeight(count)}%` }
  const fingers = PULSE_FINGER_ORDER.filter((finger) => geometry.tips[finger])
  const misplaced = feedback.code === 'position' ? misplacedFingers(count, position) : []

  return <section className="pulse-trainer" aria-label="脉诊操作实训">
    <header className="pulse-trainer-heading">
      <div className="pulse-trainer-title"><h3>脉诊操作实训</h3><span>摆位 · 模拟触诊 · 自主辨脉</span></div>
      <label className="pulse-hint-toggle"><input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} /><span>学习提示</span><i aria-hidden="true" /></label>
    </header>

    <div className="pulse-drag-guide">
      <Move size={22} aria-hidden="true" />
      <div>
        <strong>按住医生手部拖到患者手腕</strong>
        <p>检查位置后，轻点指尖模拟轻取，持续按住模拟深取。结合触诊线索，自行判断脉象。</p>
        <p>↓ 向下滑动，查看触诊线索并完成脉象判断。</p>
      </div>
    </div>

    <div className="pulse-workspace">
      <div className="pulse-photo-canvas" ref={canvasRef} aria-label="脉诊照片操作画布">
        <img className="pulse-patient-photo" src="/four-exam-images/realistic/pulse-arm.png" alt="掌心向上的患者右手腕，手掌在左侧，前臂在右侧，置于脉枕上" width={1536} height={1024} draggable={false} />
        <span className="pulse-scene-caption">拖动医生手部至患者手腕</span>
        {showHints && <div className="pulse-targets" aria-label="寸关尺学习提示">{(['index', 'middle', 'ring'] as const).map((finger) => <span key={finger} className="pulse-target" style={{ left: `${PULSE_GEOMETRY.targets[finger].x}%`, top: `${PULSE_GEOMETRY.targets[finger].y}%` }}><i /><b>{PULSE_FINGER_LABELS[finger].position}</b></span>)}</div>}
        <div className={`pulse-doctor-hand pulse-draggable-hand ${dragging ? 'is-dragging' : ''}`} style={handStyle} role="group" aria-label="拖动医生手部" aria-describedby="pulse-drag-help" tabIndex={0} onKeyDown={nudge} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event)} onPointerCancel={(event) => endDrag(event, true)} onLostPointerCapture={(event) => endDrag(event, true)}>
          <img src={asset(count)} alt={`医生${count === 1 ? '一指' : count === 2 ? '二指' : '三指'}布指手部照片`} draggable={false} />
          {fingers.map((finger) => <button key={finger} type="button" className={`pulse-fingertip ${practice.positionChecked ? 'is-confirmed' : ''} ${misplaced.includes(finger) ? 'is-misplaced' : ''} ${pressedFinger === finger ? 'is-palpating' : ''}`} style={{ left: `${geometry.tips[finger]!.x}%`, top: `${geometry.tips[finger]!.y}%` }} aria-label={`触诊${PULSE_FINGER_LABELS[finger].finger}${PULSE_FINGER_LABELS[finger].position}位`} aria-disabled={!practice.positionChecked || !caseData} title="轻点：轻取；持续按住：深取；键盘 Enter：轻取，Shift+Enter：深取" onPointerDown={(event) => startTouch(event, finger)} onPointerUp={(event) => endTouch(event)} onPointerCancel={(event) => endTouch(event, true)} onLostPointerCapture={(event) => endTouch(event, true)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) readFinger(finger, event.shiftKey ? 'deep' : 'light') } }} onClick={(event) => { event.stopPropagation(); if (event.detail === 0) readFinger(finger, 'light') }}>{PULSE_FINGER_LABELS[finger].short}</button>)}
        </div>
      </div>

      <aside className="pulse-instruction-panel">
        <h4>操作要点</h4>
        <ol className="pulse-instruction-list">{instructions.filter((instruction) => fingers.includes(instruction.finger)).map((instruction, index) => <li key={instruction.finger} className={practice.positionChecked ? 'is-complete' : ''}><span>{practice.positionChecked ? <Check size={16} /> : index + 1}</span><div><strong>{instruction.title}</strong><p>{instruction.detail}</p></div></li>)}</ol>
        <h4>触诊线索</h4>
        <div className="pulse-findings" aria-label="触诊记录" aria-live="polite">{PULSE_FINGER_ORDER.map((finger) => <section key={finger}>
          <strong>{PULSE_FINGER_LABELS[finger].finger} · {PULSE_FINGER_LABELS[finger].position}部</strong>
          <p><b>轻取</b>{readings[finger]?.light ?? '尚未轻取'}</p>
          <p><b>深取</b>{readings[finger]?.deep ?? '尚未深取'}</p>
        </section>)}</div>
      </aside>
    </div>

    <div className="pulse-trainer-bottom">
      <div className="pulse-hand-picker"><h4>选择定位方式</h4><div>{([1, 3] as const).map((option) => <button key={option} type="button" className={count === option ? 'is-selected' : ''} aria-pressed={count === option} aria-label={`选择${option === 1 ? '一' : '三'}指`} onClick={() => { clearDrag(); dispatch({ type: 'select', count: option }) }}><img src={asset(option)} alt="" draggable={false} /><strong>{option === 1 ? '一指 · 关部单按' : '三指 · 寸关尺布指'}</strong></button>)}</div></div>
      <div className="pulse-action-area">
        <button type="button" className="pulse-primary-button pulse-check-position" disabled={dragging} onClick={() => dispatch({ type: 'check' })}>检查位置<ChevronRight size={20} /></button>
        <button type="button" className="pulse-reset-button" onClick={reset}><RotateCcw size={17} />重置练习</button>
        <p className={`pulse-position-status ${feedback.kind}`} role="status">{feedback.message}</p>
      </div>
    </div>
    <p className="pulse-drag-help" id="pulse-drag-help">拖动后点击“检查位置”，再在各指尖轻点或持续按住。键盘可用方向键微调手部、Enter 检查；聚焦指尖后，Enter 为轻取、Shift+Enter 为深取。</p>
    <section className="pulse-judgement" aria-label="脉象判断">
      <h4>你的脉象判断</h4>
      <p>结合已采集的线索选择脉象，可多选；提交后核对病例参考。</p>
      {!caseData && !caseError && <p role="status">正在载入病例触诊资料…</p>}
      <fieldset disabled={submitting || !Object.keys(readings).length}>
        <legend>选择你判断的脉象</legend>
        <div className="pulse-answer-options">{caseData?.options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => { setSelected((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]); setAssessment(null) }} />{option}</label>)}</div>
      </fieldset>
      <button type="button" className="pulse-submit-answer" disabled={submitting || !selected.length || !Object.keys(readings).length} onClick={() => void submit()}>{submitting ? '正在核对…' : '提交脉象判断'}</button>
      {(caseError || error) && <p role="alert">{caseError || error}</p>}
      {assessment && <section className={`pulse-assessment ${assessment.correct ? 'is-correct' : ''}`} aria-label="脉象判断结果">
        <strong>{assessment.correct ? '你的判断与病例参考一致' : '请对照触诊线索再判断'}</strong>
        <p>病例参考：{assessment.standardAnswer.join('')}</p>
        {!!assessment.missed.length && <p>尚未识别：{assessment.missed.join('、')}</p>}
        {!!assessment.extra.length && <p>需要再核对：{assessment.extra.join('、')}</p>}
        <dl>{assessment.standardAnswer.map((item) => <div key={item}><dt>{item}</dt><dd>{assessment.explanation[item]}</dd></div>)}</dl>
      </section>}
    </section>
    <small className="pulse-practice-note">参考 GB/T 40665.4—2021 的布指及轻重取法。本图提供关部单按与三指布指定位。鼠标短点、长按模拟不同取脉力度，触感描述用于病例教学。</small>
  </section>
}
