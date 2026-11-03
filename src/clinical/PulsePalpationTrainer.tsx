import { useEffect, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Hand, Move, Pause, Play, RotateCcw } from 'lucide-react'
import { PULSE_STEPS, reduceTeachingPlayback, type TeachingPlayback, type TeachingPlaybackAction } from './teachingSteps'
import { PULSE_FINGER_LABELS, PULSE_FINGER_ORDER, PULSE_GEOMETRY, createPulsePlacement, handHeight, idealHandPosition, imagePointFromClient, pulsePlacementReducer, type FingerCount, type ImagePoint, type PulsePlacementState } from './pulsePlacement'
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
  const [mode, setMode] = useState<'demo' | 'practice'>('demo')
  const [showHints, setShowHints] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [practice, dispatch] = useReducer(pulsePlacementReducer, undefined, () => createPulsePlacement())
  const [demo, demoDispatch] = useReducer((state: TeachingPlayback, action: TeachingPlaybackAction) => reduceTeachingPlayback(state, action, PULSE_STEPS.length), { step: 0, playing: false })
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) demoDispatch({ type: 'pause' })
    }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (mode !== 'demo' || !demo.playing) return
    const timer = window.setTimeout(() => demoDispatch({ type: 'tick' }), 2400)
    return () => window.clearTimeout(timer)
  }, [mode, demo.step, demo.playing])

  const changeMode = (next: 'demo' | 'practice') => {
    demoDispatch({ type: 'pause' })
    dragRef.current = null
    setDragging(false)
    setMode(next)
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'practice' || !event.isPrimary || event.button !== 0 || dragRef.current || !canvasRef.current) return
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
    dragRef.current = null
    setDragging(false)
    if (cancelled) dispatch({ type: 'cancel', previous: session.previous })
    else dispatch({ type: 'drop', position: session.position, moved: session.moved })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'practice') return
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

  const count: FingerCount = mode === 'practice' ? practice.count : demo.step === 2 ? 1 : demo.step === 3 ? 2 : 3
  const geometry = PULSE_GEOMETRY.hands[count]
  const position = mode === 'practice' ? practice.position : idealHandPosition(count)
  const handStyle: CSSProperties = { left: `${position.x - geometry.width / 2}%`, top: `${position.y - handHeight(count) / 2}%`, width: `${geometry.width}%`, height: `${handHeight(count)}%` }
  const completed = mode === 'practice' ? practice.confirmed.length : Math.max(0, Math.min(3, demo.step - 1))
  const feedback = mode === 'practice' ? practice.feedback : { kind: 'info', message: PULSE_STEPS[demo.step].detail }

  return <section className="pulse-trainer" aria-label="脉诊操作实训" data-reduced-motion={reducedMotion}>
    <header className="pulse-trainer-heading">
      <div className="pulse-trainer-title"><h3>脉诊操作实训</h3><span>成人三指布指</span></div>
      <div className="pulse-mode-switch" role="tablist" aria-label="脉诊练习模式"><button type="button" role="tab" aria-selected={mode === 'demo'} onClick={() => changeMode('demo')}>操作演示</button><button type="button" role="tab" aria-selected={mode === 'practice'} onClick={() => changeMode('practice')}>拖动练习</button></div>
      <label className="pulse-hint-toggle"><input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} /><span>学习提示</span><i aria-hidden="true" /></label>
    </header>

    <div className="pulse-drag-guide">
      <Move size={22} aria-hidden="true" />
      <div>
        <strong>按住医生手部拖到患者手腕</strong>
        <p>进入拖动练习并选择三指。对准寸、关、尺后检查位置，再按中指 → 食指 → 无名指依次确认。</p>
      </div>
    </div>

    <div className="pulse-workspace">
      <div className={`pulse-photo-canvas ${mode === 'demo' ? `pulse-demo-step-${demo.step}` : 'pulse-practice-canvas'}`} ref={canvasRef} aria-label="脉诊照片操作画布">
        <img className="pulse-patient-photo" src="/four-exam-images/realistic/pulse-arm.png" alt="掌心向上的患者右手腕，手掌在左侧，前臂在右侧，置于脉枕上" width={1536} height={1024} draggable={false} />
        <span className="pulse-scene-caption">{mode === 'demo' ? `${demo.step + 1}/${PULSE_STEPS.length} · ${PULSE_STEPS[demo.step].title}` : '拖动医生手部至患者手腕'}</span>
        {showHints && (mode === 'practice' || demo.step >= 1) && <div className="pulse-targets" aria-label="寸关尺学习提示">{(['index', 'middle', 'ring'] as const).map((finger) => <span key={finger} className="pulse-target" style={{ left: `${PULSE_GEOMETRY.targets[finger].x}%`, top: `${PULSE_GEOMETRY.targets[finger].y}%` }}><i /><b>{PULSE_FINGER_LABELS[finger].position}</b></span>)}</div>}
        <div className={`pulse-doctor-hand ${mode === 'demo' ? 'pulse-demo-hand' : 'pulse-draggable-hand'} ${dragging ? 'is-dragging' : ''} ${mode === 'demo' && demo.step < 2 ? 'is-hidden' : ''}`} style={handStyle} role="group" aria-label="拖动医生手部" aria-describedby="pulse-drag-help" tabIndex={mode === 'practice' ? 0 : -1} onKeyDown={nudge} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event)} onPointerCancel={(event) => endDrag(event, true)} onLostPointerCapture={(event) => endDrag(event, true)}>
          <img src={asset(count)} alt={`医生${count === 1 ? '一指' : count === 2 ? '二指' : '三指'}布指手部照片`} draggable={false} />
          {mode === 'practice' && PULSE_FINGER_ORDER.filter((finger) => geometry.tips[finger]).map((finger) => <button key={finger} type="button" className={`pulse-fingertip ${practice.confirmed.includes(finger) ? 'is-confirmed' : ''}`} style={{ left: `${geometry.tips[finger]!.x}%`, top: `${geometry.tips[finger]!.y}%` }} aria-label={`确认${PULSE_FINGER_LABELS[finger].finger}触点`} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); dispatch({ type: 'confirm', finger }) }}>{practice.confirmed.includes(finger) ? <Check size={13} /> : PULSE_FINGER_LABELS[finger].short}</button>)}
        </div>
        {mode === 'demo' && demo.step === 0 && <div className="pulse-demo-start"><Hand size={25} /><span>播放演示，观察伸手与布指过程</span></div>}
      </div>

      <aside className="pulse-instruction-panel">
        <h4>操作要点</h4>
        <ol className="pulse-instruction-list">{instructions.map((instruction, index) => <li key={instruction.finger} className={completed > index ? 'is-complete' : completed === index ? 'is-current' : ''}><span>{completed > index ? <Check size={16} /> : index + 1}</span><div><strong>{instruction.title}</strong><p>{instruction.detail}</p></div></li>)}</ol>
        <h4>操作反馈</h4>
        <div className={`pulse-feedback pulse-feedback-${feedback.kind}`} role="status" aria-live="polite"><Hand size={27} /><p>{feedback.message}</p></div>
        {mode === 'practice' && <div className="pulse-contact-buttons" aria-label="依次确认下指">{PULSE_FINGER_ORDER.map((finger) => <button key={finger} type="button" onClick={() => dispatch({ type: 'confirm', finger })} aria-label={`确认${PULSE_FINGER_LABELS[finger].finger}${PULSE_FINGER_LABELS[finger].position}位`} aria-pressed={practice.confirmed.includes(finger)}>{practice.confirmed.includes(finger) && <Check size={14} />}{PULSE_FINGER_LABELS[finger].finger} · {PULSE_FINGER_LABELS[finger].position}</button>)}</div>}
        {mode === 'practice' && practice.feedback.code === 'complete' && (
          <section className="pulse-case-result" aria-label="病例脉象结果">
            <span>病例脉象结果</span>
            <strong>沉滑数</strong>
            <p>来自王旭原始病例记录。布指练习用于验证位置和下指顺序。</p>
          </section>
        )}
      </aside>
    </div>

    <div className="pulse-trainer-bottom">
      <div className="pulse-hand-picker"><h4>选择医生手指 <small>选择后进入拖动练习</small></h4><div>{([1, 2, 3] as const).map((option) => <button key={option} type="button" className={practice.count === option ? 'is-selected' : ''} aria-pressed={practice.count === option} aria-label={`选择${option === 1 ? '一' : option === 2 ? '二' : '三'}指`} onClick={() => { changeMode('practice'); dispatch({ type: 'select', count: option }) }}><img src={asset(option)} alt="" draggable={false} /><strong>{option === 1 ? '一指' : option === 2 ? '二指' : '三指'}</strong></button>)}</div></div>
      <div className="pulse-action-area">{mode === 'demo' ? <><div className="pulse-demo-controls"><button type="button" className="pulse-primary-button" onClick={() => demoDispatch({ type: demo.playing ? 'pause' : 'play' })}>{demo.playing ? <Pause size={16} /> : <Play size={16} />}{demo.playing ? '暂停演示' : '播放演示'}</button><button type="button" onClick={() => demoDispatch({ type: 'previous' })} disabled={demo.step === 0}><ChevronLeft size={16} />上一步</button><button type="button" onClick={() => demoDispatch({ type: 'next' })} disabled={demo.step === PULSE_STEPS.length - 1}>下一步<ChevronRight size={16} /></button><button type="button" onClick={() => demoDispatch({ type: 'replay', autoPlay: !reducedMotion })}><RotateCcw size={16} />重播</button></div><button type="button" className="pulse-practice-entry" onClick={() => changeMode('practice')}>进入拖动练习<ChevronRight size={18} /></button></> : <><button type="button" className="pulse-primary-button pulse-check-position" disabled={dragging} onClick={() => dispatch({ type: 'check' })}>检查位置<ChevronRight size={20} /></button><button type="button" className="pulse-reset-button" onClick={() => { dragRef.current = null; setDragging(false); dispatch({ type: 'reset' }) }}><RotateCcw size={17} />重置练习</button></>}</div>
    </div>
    <p className="pulse-drag-help" id="pulse-drag-help">{mode === 'practice' ? '拖动手部后先检查位置，再点击照片指尖的确认点，按中指 → 食指 → 无名指依次下指；也可聚焦手部，用方向键微调、Enter 检查，并使用右侧按钮确认。' : '可播放完整演示，也可用上一步、下一步查看每个动作。'}{reducedMotion && ' 已启用减少动态效果。'}</p>
    <small className="pulse-practice-note">按 GB/T 40665.4—2021 的布指顺序演示，供教师结合教材审核。本练习只检查图片定位与下指顺序，不测量真实按压力度或脉象。</small>
  </section>
}
