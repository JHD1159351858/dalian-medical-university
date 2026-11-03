import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Check, Eye, Maximize2, Play, X } from 'lucide-react'
import { isTongueAnswerCorrect, selectTonguePhoto, tongueSamples } from './tongueSamples'
import { createTongueSequence, reduceTongueSequence, tongueFrameBlend } from './tongueSequence'
import './tongueInspection.css'

const actionSteps = [
  { title: '准备', description: '观察患者正面。' },
  { title: '张口', description: '患者自然张口。' },
  { title: '伸舌', description: '患者伸舌，接下来观察老师提供的舌象原图。' },
]

function PatientTongueMotion({ phase, open, tongue }: { phase: number; open: number; tongue: number }) {
  return <svg className="tongue-patient-motion" viewBox="0 0 960 720" role="img" aria-label={`训练患者${actionSteps[phase].title}动作`}>
    <image href="/four-exam-images/tongue-patient-portrait.png" width="960" height="720" />
    <g opacity={open}>
      <path d="M455 422 Q477 407 502 422 Q500 444 479 446 Q457 445 455 422Z" fill="#654049" stroke="#b78179" strokeWidth="2" />
      <path d="M462 422 Q478 414 495 422 L493 426 Q478 429 464 426Z" fill="#fff3ea" />
      <path d="M465 438 Q479 432 492 438 Q488 444 479 444 Q470 444 465 438Z" fill="#a95d64" />
    </g>
    <g opacity={tongue} transform={`translate(0 ${(tongue - 1) * 10})`}>
      <path d="M465 433 Q478 429 492 433 L491 446 Q490 457 479 458 Q468 457 466 446Z" fill="#d98f94" stroke="#b46b74" strokeWidth="1.3" />
      <path d="M479 435 Q478 441 479 447" fill="none" stroke="#bb747c" strokeWidth="1.1" strokeLinecap="round" />
    </g>
  </svg>
}

export function TongueInspectionTrainer() {
  const [state, dispatch] = useReducer(reduceTongueSequence, undefined, () => createTongueSequence(selectTonguePhoto().id))
  const [reducedMotion, setReducedMotion] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [observation, setObservation] = useState('')
  const zoomRef = useRef<HTMLDialogElement>(null)
  const sample = tongueSamples.find((item) => item.id === state.sampleId)!
  const frameBlend = tongueFrameBlend(state.progress)
  const phase = state.progress < .34 ? 0 : state.progress < .67 ? 1 : 2
  const correct = state.submitted && isTongueAnswerCorrect(sample, state.answer)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(media.matches)
      if (media.matches) dispatch({ type: 'complete' })
    }
    setReducedMotion(media.matches)
    dispatch(media.matches ? { type: 'complete' } : { type: 'play' })
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!state.playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const current = performance.now()
      dispatch({ type: 'tick', elapsedMs: current - previous })
      previous = current
    }, 80)
    return () => window.clearInterval(timer)
  }, [state.playing])

  useEffect(() => {
    if (zoomed) zoomRef.current?.showModal()
    else zoomRef.current?.close()
  }, [zoomed])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({ type: 'submit' })
  }
  return <section className="tongue-inspection-trainer" aria-label="舌诊观察实训" data-photo-id={state.sampleId} data-reduced-motion={reducedMotion}>
    <div className="tongue-inspection-grid">
      <div className="tongue-action-player">
        <div className="tongue-action-scene" aria-label={state.photoRevealed ? '资料舌象原图观察' : '患者张口伸舌动作演示'}>
          {state.progress === 1 ? <button className="tongue-observation-photo" type="button" onClick={() => setZoomed(true)} aria-label="放大舌象照片"><img key={sample.id} src={sample.image} alt={state.submitted ? `${sample.label}原文教学照片` : '老师提供的待辨认舌象照片'} /><span><Maximize2 size={14} />点击看大图</span></button> : <>
            <PatientTongueMotion phase={phase} open={frameBlend[1] + frameBlend[2]} tongue={frameBlend[2]} />
            <div className="tongue-scene-caption"><span><Play size={13} />动作演示</span><small>{actionSteps[phase].description}</small></div>
          </>}
        </div>
      </div>

      <aside className="tongue-observation-panel" aria-label="老师原图舌象观察">
        <h3><Eye size={22} />观察老师提供的舌象</h3>
        {!state.photoRevealed && <div className="tongue-observation-waiting"><Eye size={32} /><strong>正在演示张口伸舌</strong><p>动作完成后，自动显示本次抽到的资料原图。</p></div>}
        <p className="tongue-observe-first">每次打开检查窗口，从 12 张资料原图中随机抽取一张，本次观察始终使用这张照片。</p>
        {state.photoRevealed && sample.hasEmbeddedLabel && <p className="tongue-observe-first">本张资料原图含文字标注，可用于对照学习。</p>}
        {state.photoRevealed && <p className="tongue-observe-first">请先观察，再填写你的判断。</p>}
        <form className="tongue-observation-form" onSubmit={submit}>
          <label>舌象判断<select aria-label="舌象判断" value={state.answer} disabled={!state.photoRevealed} onChange={(event) => dispatch({ type: 'answer', answer: event.target.value })}><option value="">请选择舌象名称</option>{tongueSamples.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}</select></label>
          <label className="tongue-observation-notes">你的观察 <small>仅作笔记</small><textarea aria-label="舌象观察笔记" value={observation} maxLength={500} disabled={!state.photoRevealed} placeholder="描述舌色、舌形、舌苔与润燥等特征…" onChange={(event) => setObservation(event.target.value)} /><span>{observation.length}/500</span></label>
          <div className="tongue-observation-actions"><button className="tongue-submit-observation" type="submit" disabled={!state.photoRevealed || !state.answer || state.submitted}><Check size={17} />提交判断</button></div>
        </form>
        {state.submitted && <section className={`tongue-observation-feedback ${correct ? 'is-correct' : ''}`} aria-label="舌象判断反馈"><strong role="status">{correct ? '标签匹配' : '再对照原图观察'}</strong><p>原文标签：{sample.acceptedAnswers.slice(0, sample.id === 'tongue-1' ? 2 : 1).join(' / ')}。</p><h4>形态特征</h4><ul>{sample.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><h4>辨认要点</h4><p>{sample.recognition}</p></section>}
        <details className="tongue-observation-guide"><summary>观察要点：舌色 · 舌形 · 舌苔 · 润燥</summary><p>分别记录可见特征，再选择与原图相符的名称。自由观察笔记不参与自动判定。</p></details>
      </aside>
    </div>

    <div className="tongue-inspection-source"><span>动作示范沿用本实训的虚拟患者。识图照片来自《舌象图片及形态介绍.docx》。</span><span>本次学习不写入王旭病例记录；本病例舌象尚待教师确认。</span></div>
    {zoomed && <dialog ref={zoomRef} className="tongue-photo-zoom" aria-label="舌象原图大图" onCancel={(event) => { event.stopPropagation(); setZoomed(false) }} onClick={(event) => { if (event.target === event.currentTarget) setZoomed(false) }}><header><strong>{state.submitted ? sample.label : '舌象原图观察'}</strong><button type="button" aria-label="关闭舌象大图" onClick={() => setZoomed(false)}><X size={20} /></button></header><img src={sample.image} alt={state.submitted ? `${sample.label}原文照片大图` : '待辨认舌象原图大图'} /><p>来源：{sample.source} · 第 {sample.sourceParagraph} 段起</p></dialog>}
  </section>
}
