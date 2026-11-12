import { useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, ChevronRight, Hand, Move, RotateCcw } from 'lucide-react'
import { PULSE_FINGER_LABELS, PULSE_FINGER_ORDER, PULSE_GEOMETRY, createPulsePlacement, handHeight, imagePointFromClient, pulsePlacementReducer, type FingerCount, type ImagePoint, type PulsePlacementState } from './pulsePlacement'
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

export function PulsePalpationTrainer() {
  const [showHints, setShowHints] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [practice, dispatch] = useReducer(pulsePlacementReducer, undefined, () => createPulsePlacement())
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)

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
  const completed = practice.confirmed.length

  return <section className="pulse-trainer" aria-label="脉诊操作实训">
    <header className="pulse-trainer-heading">
      <div className="pulse-trainer-title"><h3>脉诊操作实训</h3><span>成人三指布指 · 拖动练习</span></div>
      <label className="pulse-hint-toggle"><input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} /><span>学习提示</span><i aria-hidden="true" /></label>
    </header>

    <div className="pulse-drag-guide">
      <Move size={22} aria-hidden="true" />
      <div>
        <strong>按住医生手部拖到患者手腕</strong>
        <p>选择三指并对准寸、关、尺。检查位置后，按中指 → 食指 → 无名指依次确认。</p>
      </div>
    </div>

    <div className="pulse-workspace">
      <div className="pulse-photo-canvas" ref={canvasRef} aria-label="脉诊照片操作画布">
        <img className="pulse-patient-photo" src="/four-exam-images/realistic/pulse-arm.png" alt="掌心向上的患者右手腕，手掌在左侧，前臂在右侧，置于脉枕上" width={1536} height={1024} draggable={false} />
        <span className="pulse-scene-caption">拖动医生手部至患者手腕</span>
        {showHints && <div className="pulse-targets" aria-label="寸关尺学习提示">{(['index', 'middle', 'ring'] as const).map((finger) => <span key={finger} className="pulse-target" style={{ left: `${PULSE_GEOMETRY.targets[finger].x}%`, top: `${PULSE_GEOMETRY.targets[finger].y}%` }}><i /><b>{PULSE_FINGER_LABELS[finger].position}</b></span>)}</div>}
        <div className={`pulse-doctor-hand pulse-draggable-hand ${dragging ? 'is-dragging' : ''}`} style={handStyle} role="group" aria-label="拖动医生手部" aria-describedby="pulse-drag-help" tabIndex={0} onKeyDown={nudge} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event)} onPointerCancel={(event) => endDrag(event, true)} onLostPointerCapture={(event) => endDrag(event, true)}>
          <img src={asset(count)} alt={`医生${count === 1 ? '一指' : count === 2 ? '二指' : '三指'}布指手部照片`} draggable={false} />
          {PULSE_FINGER_ORDER.filter((finger) => geometry.tips[finger]).map((finger) => <button key={finger} type="button" className={`pulse-fingertip ${practice.confirmed.includes(finger) ? 'is-confirmed' : ''}`} style={{ left: `${geometry.tips[finger]!.x}%`, top: `${geometry.tips[finger]!.y}%` }} aria-label={`确认${PULSE_FINGER_LABELS[finger].finger}触点`} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); dispatch({ type: 'confirm', finger }) }}>{practice.confirmed.includes(finger) ? <Check size={13} /> : PULSE_FINGER_LABELS[finger].short}</button>)}
        </div>
      </div>

      <aside className="pulse-instruction-panel">
        <h4>操作要点</h4>
        <ol className="pulse-instruction-list">{instructions.map((instruction, index) => <li key={instruction.finger} className={completed > index ? 'is-complete' : completed === index ? 'is-current' : ''}><span>{completed > index ? <Check size={16} /> : index + 1}</span><div><strong>{instruction.title}</strong><p>{instruction.detail}</p></div></li>)}</ol>
        <h4>操作反馈</h4>
        <div className={`pulse-feedback pulse-feedback-${feedback.kind}`} role="status" aria-live="polite"><Hand size={27} /><p>{feedback.message}</p></div>
        <div className="pulse-contact-buttons" aria-label="依次确认下指">{PULSE_FINGER_ORDER.map((finger) => <button key={finger} type="button" onClick={() => dispatch({ type: 'confirm', finger })} aria-label={`确认${PULSE_FINGER_LABELS[finger].finger}${PULSE_FINGER_LABELS[finger].position}位`} aria-pressed={practice.confirmed.includes(finger)}>{practice.confirmed.includes(finger) && <Check size={14} />}{PULSE_FINGER_LABELS[finger].finger} · {PULSE_FINGER_LABELS[finger].position}</button>)}</div>
        {feedback.code === 'complete' && (
          <section className="pulse-case-result" aria-label="病例脉象结果">
            <span>病例脉象结果</span>
            <strong>沉滑数</strong>
            <p>来自王旭原始病例记录。布指练习用于验证位置和下指顺序。</p>
          </section>
        )}
      </aside>
    </div>

    <div className="pulse-trainer-bottom">
      <div className="pulse-hand-picker"><h4>选择医生手指</h4><div>{([1, 2, 3] as const).map((option) => <button key={option} type="button" className={count === option ? 'is-selected' : ''} aria-pressed={count === option} aria-label={`选择${option === 1 ? '一' : option === 2 ? '二' : '三'}指`} onClick={() => { clearDrag(); dispatch({ type: 'select', count: option }) }}><img src={asset(option)} alt="" draggable={false} /><strong>{option === 1 ? '一指' : option === 2 ? '二指' : '三指'}</strong></button>)}</div></div>
      <div className="pulse-action-area">
        <button type="button" className="pulse-primary-button pulse-check-position" disabled={dragging} onClick={() => dispatch({ type: 'check' })}>检查位置<ChevronRight size={20} /></button>
        <button type="button" className="pulse-reset-button" onClick={() => { clearDrag(); dispatch({ type: 'reset' }) }}><RotateCcw size={17} />重置练习</button>
      </div>
    </div>
    <p className="pulse-drag-help" id="pulse-drag-help">拖动手部后先检查位置，再点击照片指尖的确认点，按中指 → 食指 → 无名指依次下指。也可聚焦手部，用方向键微调、Enter 检查，并使用右侧按钮确认。</p>
    <small className="pulse-practice-note">参考 GB/T 40665.4—2021，供教师结合教材审核。本练习仅检查成人三指布指的位置与下指顺序。完整诊脉还需结合轻取、中取、重取及单按、总按等方法体察脉象。</small>
  </section>
}
