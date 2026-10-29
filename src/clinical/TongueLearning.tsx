import { useState, type FormEvent } from 'react'
import { Check, Shuffle } from 'lucide-react'
import { isTongueAnswerCorrect, selectTongueQuestion, tongueSamples, type TongueSample } from './tongueSamples'

function TongueExplanation({ sample }: { sample: TongueSample }) {
  return <div className="tongue-explanation">
    <h4>形态特征</h4><ul>{sample.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
    <h4>辨认要点</h4><p>{sample.recognition}</p>
    <details><summary>查看文档中的辨证提示</summary><ul>{sample.interpretation.map((text) => <li key={text}>{text}</li>)}</ul><p>以上为原文教学提示，需结合四诊信息，不作为本病例的诊断结论。</p></details>
    <small>来源：{sample.source} · 第 {sample.sourceParagraph} 段起</small>
  </div>
}

export function TongueLearning() {
  const [mode, setMode] = useState<'study' | 'practice'>('study')
  const [selectedId, setSelectedId] = useState(tongueSamples[0].id)
  const [question, setQuestion] = useState(() => selectTongueQuestion())
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const selected = tongueSamples.find((sample) => sample.id === selectedId)!
  const correct = submitted && isTongueAnswerCorrect(question, answer)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (answer) setSubmitted(true)
  }
  const nextQuestion = () => {
    setQuestion((current) => selectTongueQuestion(current.id))
    setAnswer('')
    setSubmitted(false)
  }

  return <section className="tongue-learning" aria-label="独立舌象学习">
    <div className="tongue-learning-heading"><div><h3>舌象学习</h3><p>13 个教学条目 · 12 张原图 · 不写入王旭病例记录</p></div><div className="tongue-mode-switch" aria-label="舌象学习模式"><button type="button" aria-pressed={mode === 'study'} onClick={() => setMode('study')}>学习图谱</button><button type="button" aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>随机识图</button></div></div>
    {mode === 'study' ? <div className="tongue-study">
      <label className="tongue-entry-select">选择教学条目<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{tongueSamples.map((sample) => <option key={sample.id} value={sample.id}>{sample.group} · {sample.label}</option>)}</select></label>
      <div className="tongue-study-content"><figure><img src={selected.image} alt={`${selected.label}原文教学照片`} /><figcaption>{selected.label}{selected.hasEmbeddedLabel && <span>含文字标注，仅用于学习</span>}</figcaption></figure><TongueExplanation sample={selected} /></div>
      <p className="tongue-material-note">部分原图含文字标注，仅用于学习；正常舌象与薄白苔使用同一原图，随机识图接受这两种标签。</p>
    </div> : <div className="tongue-practice">
      <p>先观察照片并选择名称，提交后查看原文解释。随机练习使用 10 张不含文字标注的独立照片。</p>
      <div className="tongue-practice-content"><figure><img src={question.image} alt={submitted ? `${question.label}教学照片` : '待辨认舌象照片'} /><figcaption>{submitted ? question.label : '观察舌质、舌形、舌苔与润燥情况'}</figcaption></figure><div>
        <form onSubmit={submit}><label className="tongue-entry-select">你的判断<select aria-label="舌象判断" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={submitted}><option value="">请选择舌象名称</option>{tongueSamples.map((sample) => <option key={sample.id} value={sample.label}>{sample.label}</option>)}</select></label><div className="tongue-practice-actions"><button type="submit" disabled={!answer || submitted}><Check size={16} />提交判断</button><button type="button" onClick={nextQuestion}><Shuffle size={16} />下一张</button></div></form>
        {submitted && <div className={`tongue-practice-result ${correct ? 'is-correct' : ''}`} role="status"><strong>{correct ? '标签匹配' : '再对照原图观察'}</strong><p>原文标签：{question.acceptedAnswers.slice(0, question.id === 'tongue-1' ? 2 : 1).join(' / ')}。你的判断：{answer}。</p><TongueExplanation sample={question} /></div>}
      </div></div>
    </div>}
  </section>
}
