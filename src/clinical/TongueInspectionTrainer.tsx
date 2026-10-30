import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Check, Eye, Maximize2, Pause, Play, RotateCcw, Shuffle, X } from 'lucide-react'
import { isTongueAnswerCorrect, selectTonguePhoto, tongueSamples } from './tongueSamples'
import { createTongueSequence, reduceTongueSequence, tongueFrameBlend, TONGUE_DURATION_MS } from './tongueSequence'
import './tongueInspection.css'

const actionFrames = [
  { image: '/four-exam-images/realistic/tongue-ready.png', title: '准备' },
  { image: '/four-exam-images/realistic/tongue-open.png', title: '张口' },
  { image: '/four-exam-images/realistic/tongue-extended.png', title: '伸舌' },
]

const actionSteps = [
  { title: '准备', progress: 0, description: '观察患者正面，开始张口伸舌演示。' },
  { title: '张口', progress: .5, description: '患者自然张口，保持同一观察视角。' },
  { title: '伸舌', progress: 1, description: '伸舌后保持，接下来观察老师提供的舌象原图。' },
]

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
  const elapsed = Math.round(state.progress * TONGUE_DURATION_MS / 1000)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(media.matches)
      if (media.matches) dispatch({ type: 'pause' })
    }
    update()
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
  const nextPhoto = () => {
    dispatch({ type: 'next-photo', sampleId: selectTonguePhoto(state.sampleId).id })
    setObservation('')
    setZoomed(false)
  }
  const play = () => {
    if (reducedMotion) dispatch({ type: 'seek', progress: state.progress < .5 ? .5 : 1 })
    else dispatch({ type: state.playing ? 'pause' : 'play' })
  }

  return <section className="tongue-inspection-trainer" aria-label="舌诊观察实训" data-photo-id={state.sampleId} data-reduced-motion={reducedMotion}>
    <div className="tongue-inspection-grid">
      <div className="tongue-action-player">
        <div className="tongue-action-scene" aria-label={state.progress === 1 ? '资料舌象原图观察' : '患者张口伸舌写实演示'}>
          {state.progress === 1 ? <button className="tongue-observation-photo" type="button" onClick={() => setZoomed(true)} aria-label="放大舌象照片"><img key={sample.id} src={sample.image} alt={state.submitted ? `${sample.label}原文教学照片` : '老师提供的待辨认舌象照片'} /><span><Maximize2 size={14} />点击看大图</span></button> : <>
            {actionFrames.map((frame, index) => <img key={frame.image} src={frame.image} alt={index === phase ? `患者${frame.title}动作演示` : ''} aria-hidden={index !== phase} draggable={false} style={{ opacity: reducedMotion ? Number(index === phase) : frameBlend[index], transform: reducedMotion ? 'none' : `scale(${1 + state.progress * .012}) translateY(${-state.progress * .15}%)` }} />)}
            <div className="tongue-scene-caption"><span><Play size={13} />动作演示</span><small>{actionSteps[phase].description}</small></div>
          </>}
        </div>
        <div className="tongue-action-controls">
          <ol className="tongue-action-steps" aria-label="舌诊动作步骤">{actionSteps.map((step, index) => <li key={step.title}><button type="button" aria-current={phase === index ? 'step' : undefined} onClick={() => dispatch({ type: 'seek', progress: step.progress })}><b>{index + 1}</b>{step.title}</button></li>)}</ol>
          <div className="tongue-playback-row"><button className="tongue-main-play" type="button" onClick={play} aria-label={reducedMotion ? '逐步查看舌诊动作' : state.playing ? '暂停舌诊演示' : '播放舌诊演示'}>{state.playing ? <Pause size={20} /> : <Play size={20} />}<span>{reducedMotion ? '逐步查看' : state.playing ? '暂停' : '播放'}</span></button><button className="tongue-replay" type="button" onClick={() => dispatch({ type: 'replay', autoPlay: !reducedMotion })} aria-label="重播舌诊演示"><RotateCcw size={21} /></button><input type="range" min={0} max={100} step={1} value={Math.round(state.progress * 100)} aria-label="舌诊动作进度" aria-valuetext={`${Math.round(state.progress * 100)}%，${actionSteps[phase].title}`} onChange={(event) => dispatch({ type: 'seek', progress: Number(event.target.value) / 100 })} /><time>{`0:${String(elapsed).padStart(2, '0')} / 0:08`}</time></div>
          {reducedMotion && <small className="tongue-reduced-note">已减少动态效果，可点击动作步骤或拖动进度完成观察。</small>}
        </div>
      </div>

      <aside className="tongue-observation-panel" aria-label="老师原图舌象观察">
        <h3><Eye size={22} />观察老师提供的舌象</h3>
        {!state.photoRevealed && <div className="tongue-observation-waiting"><Eye size={32} /><strong>先完成张口伸舌演示</strong><p>动作完成后，随机显示一张资料原图。</p><button type="button" onClick={() => dispatch({ type: 'seek', progress: 1 })}>直接进入舌象观察</button></div>}
        <p className="tongue-observe-first">从所提供资料的 12 张原图中随机抽取，每次只展示一张。点击“换一张”重新抽取。</p>
        {state.photoRevealed && sample.hasEmbeddedLabel && <p className="tongue-observe-first">本张资料原图含文字标注，可用于对照学习。</p>}
        <p className="tongue-observe-first">{state.photoRevealed ? '请先观察，再填写你的判断。' : '也可点击“伸舌”步骤，手动完成演示。'}</p>
        <form className="tongue-observation-form" onSubmit={submit}>
          <label>舌象判断<select aria-label="舌象判断" value={state.answer} disabled={!state.photoRevealed} onChange={(event) => dispatch({ type: 'answer', answer: event.target.value })}><option value="">请选择舌象名称</option>{tongueSamples.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}</select></label>
          <label className="tongue-observation-notes">你的观察 <small>仅作笔记</small><textarea aria-label="舌象观察笔记" value={observation} maxLength={500} disabled={!state.photoRevealed} placeholder="描述舌色、舌形、舌苔与润燥等特征…" onChange={(event) => setObservation(event.target.value)} /><span>{observation.length}/500</span></label>
          <div className="tongue-observation-actions"><button className="tongue-submit-observation" type="submit" disabled={!state.photoRevealed || !state.answer || state.submitted}><Check size={17} />提交判断</button><button type="button" disabled={!state.photoRevealed} onClick={nextPhoto}><Shuffle size={17} />换一张</button></div>
        </form>
        {state.submitted && <section className={`tongue-observation-feedback ${correct ? 'is-correct' : ''}`} aria-label="舌象判断反馈"><strong role="status">{correct ? '标签匹配' : '再对照原图观察'}</strong><p>原文标签：{sample.acceptedAnswers.slice(0, sample.id === 'tongue-1' ? 2 : 1).join(' / ')}。</p><h4>形态特征</h4><ul>{sample.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><h4>辨认要点</h4><p>{sample.recognition}</p></section>}
        <details className="tongue-observation-guide"><summary>观察要点：舌色 · 舌形 · 舌苔 · 润燥</summary><p>分别记录可见特征，再选择与原图相符的名称。自由观察笔记不参与自动判定。</p></details>
      </aside>
    </div>

    <div className="tongue-inspection-source"><span>动作影像为生成的教学示范；识图照片来自《舌象图片及形态介绍.docx》。</span><span>本次学习不写入王旭病例记录；本病例舌象尚待教师确认。</span></div>
    {zoomed && <dialog ref={zoomRef} className="tongue-photo-zoom" aria-label="舌象原图大图" onCancel={(event) => { event.stopPropagation(); setZoomed(false) }} onClick={(event) => { if (event.target === event.currentTarget) setZoomed(false) }}><header><strong>{state.submitted ? sample.label : '舌象原图观察'}</strong><button type="button" aria-label="关闭舌象大图" onClick={() => setZoomed(false)}><X size={20} /></button></header><img src={sample.image} alt={state.submitted ? `${sample.label}原文照片大图` : '待辨认舌象原图大图'} /><p>来源：{sample.source} · 第 {sample.sourceParagraph} 段起</p></dialog>}
  </section>
}
