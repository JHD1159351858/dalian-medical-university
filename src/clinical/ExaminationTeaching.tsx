import { useEffect, useReducer, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { PULSE_STEPS, TONGUE_STEPS, reduceTeachingPlayback, type TeachingPlayback, type TeachingPlaybackAction } from './teachingSteps'
import './examinationTeaching.css'

type TeachingStep = { readonly title: string; readonly detail: string }

function TeachingPlayer({ title, steps, children, note }: {
  title: string
  steps: readonly TeachingStep[]
  children: (step: number) => ReactNode
  note: string
}) {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [state, dispatch] = useReducer((current: TeachingPlayback, action: TeachingPlaybackAction) => reduceTeachingPlayback(current, action, steps.length), { step: 0, playing: false })

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) dispatch({ type: 'pause' })
    }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!state.playing) return
    const timer = window.setTimeout(() => dispatch({ type: 'tick' }), 2200)
    return () => window.clearTimeout(timer)
  }, [state.playing, state.step])

  return <section className="examination-teaching" aria-label={title} data-reduced-motion={reducedMotion}>
    <div className="teaching-heading"><strong>{title}</strong><span>教学示意 · {state.step + 1}/{steps.length}</span></div>
    <div className="teaching-diagram" data-step={state.step}>{children(state.step)}</div>
    <div className="teaching-current-step" aria-live="polite" aria-atomic="true"><strong>{steps[state.step].title}</strong><p>{steps[state.step].detail}</p></div>
    <div className="teaching-controls">
      <button type="button" onClick={() => dispatch({ type: state.playing ? 'pause' : 'play' })}>{state.playing ? <Pause size={16} /> : <Play size={16} />}{state.playing ? '暂停演示' : '播放演示'}</button>
      <button type="button" onClick={() => dispatch({ type: 'previous' })} disabled={state.step === 0}><ChevronLeft size={16} />上一步</button>
      <button type="button" onClick={() => dispatch({ type: 'next' })} disabled={state.step === steps.length - 1}>下一步<ChevronRight size={16} /></button>
      <button type="button" onClick={() => dispatch({ type: 'replay', autoPlay: !reducedMotion })}><RotateCcw size={16} />重播</button>
    </div>
    <small className="teaching-note">{note}{reducedMotion && ' 已启用减少动态效果，可用上一步、下一步逐步查看。'}</small>
  </section>
}

export function TongueTeaching() {
  return <TeachingPlayer title="张口伸舌演示" steps={TONGUE_STEPS} note="动作仅作教学示意；本病例舌象需由教师确认，不能据此填写舌象结论。">{(step) => <svg className="tongue-teaching-diagram" viewBox="0 0 640 280" role="img" aria-label="患者张口伸舌教学示意">
    <rect x="0" y="0" width="640" height="280" rx="12" fill="#eef6fa" />
    <path d="M218 280 Q230 245 276 239 L364 239 Q410 245 422 280" fill="#6d9bb5" />
    <rect x="291" y="209" width="58" height="42" rx="18" fill="#e3b69b" />
    <ellipse cx="232" cy="137" rx="14" ry="25" fill="#e9bda3" /><ellipse cx="408" cy="137" rx="14" ry="25" fill="#e9bda3" />
    <path d="M235 86 Q235 24 320 24 Q405 24 405 86 L399 170 Q392 226 320 236 Q248 226 241 170 Z" fill="#f2cbb2" stroke="#c99276" strokeWidth="2" />
    <path d="M235 95 Q218 18 307 12 Q399 6 407 77 L399 101 Q388 69 369 61 Q332 88 278 59 Q248 62 235 95" fill="#4b4446" />
    <path d="M263 111 Q280 102 295 110 M345 110 Q361 102 377 111" stroke="#625052" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M267 127 Q280 132 292 127 M348 127 Q361 132 373 127" stroke="#625052" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M319 133 L310 160 Q320 165 330 160" stroke="#cf9c80" strokeWidth="2" fill="none" strokeLinecap="round" />
    <ellipse className="teaching-mouth-cavity" cx="320" cy="189" rx="39" ry={step >= 1 ? 25 : 3} fill="#743f45" />
    <path className="teaching-upper-teeth" d="M289 173 Q320 180 351 173 L348 184 Q320 190 292 184Z" fill="#fffaf3" opacity={step >= 1 ? 1 : 0} />
    <path className={`teaching-tongue ${step >= 2 ? 'is-extended' : ''}`} d="M296 186 Q320 180 344 186 L342 216 Q338 233 320 235 Q302 233 298 216Z" fill="#d9858c" stroke="#bc6670" strokeWidth="1.5" />
    <path className={`teaching-tongue ${step >= 2 ? 'is-extended' : ''}`} d="M320 190 L320 220" stroke="#bc6670" strokeWidth="1.5" />
    <path d="M281 187 Q320 169 359 187" stroke="#b87176" strokeWidth="3" fill="none" strokeLinecap="round" />
    {step >= 2 && <g className="teaching-annotation"><path d="M365 218 L450 218" stroke="#087a9b" strokeWidth="1.5" /><circle cx="361" cy="218" r="3" fill="#087a9b" /><text x="462" y="222">自然伸舌</text></g>}
    <text x="24" y="32" className="teaching-canvas-caption">患者正面 · 动作演示</text>
  </svg>}</TeachingPlayer>
}

function DoctorFinger({ x, active, visible, label }: { x: number; active: boolean; visible: boolean; label: string }) {
  return <g className={`teaching-doctor-finger ${active ? 'is-contacting' : ''}`} style={{ transform: active ? 'translateY(0)' : 'translateY(-68px)', opacity: visible ? 1 : 0 }} aria-label={label}>
    <path d={`M${x - 14} 12 L${x - 14} 135 Q${x - 14} 156 ${x} 157 Q${x + 14} 156 ${x + 14} 135 L${x + 14} 12Z`} fill="#e4b394" stroke="#b68266" strokeWidth="2" />
    <path d={`M${x - 8} 119 Q${x} 114 ${x + 8} 119 L${x + 8} 134 Q${x} 143 ${x - 8} 134Z`} fill="#f7d7c4" stroke="#cf9b80" />
    <path d={`M${x - 10} 78 Q${x} 82 ${x + 10} 78 M${x - 10} 86 Q${x} 90 ${x + 10} 86`} fill="none" stroke="#c99678" />
  </g>
}

export function PulseTeaching() {
  return <TeachingPlayer title="寸关尺布指演示" steps={PULSE_STEPS} note="按 GB/T 40665.4—2021 布指方法制作示意，实际教学与考核请结合教师指定教材。此演示不提供本病例脉象。">{(step) => <svg className="pulse-teaching-diagram" viewBox="0 0 680 310" role="img" aria-label="患者伸手与寸关尺布指教学示意">
    <rect x="0" y="0" width="680" height="310" rx="12" fill="#eef6fa" />
    <rect x="268" y="207" width="181" height="51" rx="22" fill="#a3c7d8" stroke="#84afc2" strokeWidth="2" />
    <path d="M278 239 Q356 225 439 239" stroke="#8ab5c7" strokeWidth="2" fill="none" />
    <g className={`teaching-patient-arm ${step >= 1 ? 'is-extended' : ''}`}>
      <path d="M680 161 L315 155 Q299 147 288 131 L261 97 Q251 84 241 91 Q233 97 239 110 L257 139 L171 129 Q159 128 157 139 Q156 149 169 152 L222 164 L143 162 Q129 162 129 173 Q129 184 144 184 L218 187 L151 192 Q139 195 141 205 Q143 215 156 213 L227 207 L180 219 Q168 222 171 232 Q174 241 187 237 L260 221 Q280 218 304 219 L680 231Z" fill="#f1c9b0" stroke="#c9977a" strokeWidth="2" />
      <path d="M224 167 Q248 173 256 192 M264 149 Q278 169 272 197 M300 159 Q292 185 302 217 M309 160 Q302 184 311 217" stroke="#d5a083" strokeWidth="1.5" fill="none" />
      <path d="M285 151 Q343 152 407 160" fill="none" stroke="#c6736c" strokeWidth="2" strokeDasharray="5 5" />
    </g>
    {step >= 1 && <g className="teaching-pulse-landmarks">
      <circle cx="295" cy="154" r="8" fill="#fff" stroke="#0c829c" strokeWidth="2" />
      <circle cx="345" cy="155" r="8" fill="#fff" stroke="#0c829c" strokeWidth="2" />
      <circle cx="395" cy="159" r="8" fill="#fff" stroke="#0c829c" strokeWidth="2" />
      <path d="M295 170 L295 269 M345 171 L345 269 M395 175 L395 269" stroke="#96bacd" strokeDasharray="3 4" />
    </g>}
    <DoctorFinger x={295} active={step >= 3} visible={step >= 2} label="医生食指定位寸部" />
    <DoctorFinger x={345} active={step >= 2} visible={step >= 2} label="医生中指先定位关部" />
    <DoctorFinger x={395} active={step >= 4} visible={step >= 2} label="医生无名指定位尺部" />
    <g className="teaching-pulse-labels"><text x="295" y="289" textAnchor="middle" className={step >= 3 ? 'is-active' : ''}>食指 · 寸</text><text x="345" y="307" textAnchor="middle" className={step >= 2 ? 'is-active' : ''}>中指 · 关</text><text x="395" y="289" textAnchor="middle" className={step >= 4 ? 'is-active' : ''}>无名指 · 尺</text></g>
    <text x="24" y="32" className="teaching-canvas-caption">患者掌心向上 · 手腕近景</text>
    <text x="174" y="270" className="teaching-direction">腕端</text><text x="503" y="270" className="teaching-direction">肘端</text><path d="M220 266 L268 266 M447 266 L492 266" stroke="#89adbf" strokeWidth="1.5" />
  </svg>}</TeachingPlayer>
}
