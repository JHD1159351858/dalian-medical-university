import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { ArrowLeft, Check, CircleAlert, FilePlus2, Monitor, MousePointer2, RotateCcw, Stethoscope, X } from 'lucide-react'
import { preloadSpeech, speakChinese, stopSpeech } from '../diagnosis/speech'
import { getPatientVoiceProfile } from '../diagnosis/voiceProfiles'
import { useTrainingCase } from '../cases/selectedCase'
import type { BedsideExamEntry } from '../records/types'
import { hisCategories, patientExamItems } from './caseExamItems'
import { useEncounterRecords } from '../records/EncounterRecordsProvider'
import { ExamScene } from './ExamScene'
import { ExamInteractionPanel } from './ExamInteractionPanel'
import { palpationSpeech, resolvePalpationResponse, type PalpationRegion, type PalpationResponse } from './palpation'
import { getOrderedExamReports, updateOrderedExamIds } from './examWorkflow'

type ExamEntry = PalpationResponse & { at: number }

const regions: Array<{ id: PalpationRegion; label: string }> = [
  { id: 'right-upper', label: '右季肋区' }, { id: 'upper', label: '腹上区' }, { id: 'left-upper', label: '左季肋区' },
  { id: 'right-middle', label: '右腰区' }, { id: 'center', label: '脐区' }, { id: 'left-middle', label: '左腰区' },
  { id: 'right-lower', label: '右髂区' }, { id: 'lower', label: '腹下区' }, { id: 'left-lower', label: '左髂区' },
]

interface PhysicalExamPageProps {
  muted: boolean
  onBack: () => void
  onFinish: () => void
  onReset: () => void
}

export function PhysicalExamPage(props: PhysicalExamPageProps) {
  const patient = useTrainingCase()
  return <PatientPhysicalExam key={patient.id} {...props} />
}

function PatientPhysicalExam({ muted, onBack, onFinish, onReset }: PhysicalExamPageProps) {
  const patient = useTrainingCase()
  const wang = patient.id === 'wang-xu'
  const items = useMemo(() => patientExamItems(patient), [patient])
  const { physicalExam, updatePhysicalExam, recordSubmission } = useEncounterRecords()
  const [selectedRegion, setSelectedRegion] = useState<PalpationRegion>(wang ? 'left-upper' : 'center')
  const [selectedItem, setSelectedItem] = useState(() => physicalExam?.orderedIds[0] ?? '')
  const [orderedIds, setOrderedIds] = useState<string[]>(() => physicalExam?.orderedIds ?? [])
  const [notes, setNotes] = useState<Record<string, string>>(() => physicalExam?.notes ?? {})
  const [submittedNotes, setSubmittedNotes] = useState<Record<string, string>>(() => physicalExam?.submittedNotes ?? {})
  const [orderOpen, setOrderOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [hisCategory, setHisCategory] = useState('')
  const [finishOpen, setFinishOpen] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [lastResponse, setLastResponse] = useState<PalpationResponse | null>(null)
  const [history, setHistory] = useState<ExamEntry[]>(() => physicalExam?.history ?? [])
  const [bedsideHistory, setBedsideHistory] = useState<BedsideExamEntry[]>(() => physicalExam?.bedsideHistory ?? [])
  const [lastAction, setLastAction] = useState<BedsideExamEntry | null>(null)
  const [teachingDemo, setTeachingDemo] = useState(false)
  const pointerId = useRef<number | null>(null)
  const pressStartedAt = useRef(0)
  const pressRegion = useRef<PalpationRegion>(selectedRegion)

  useEffect(() => {
    updatePhysicalExam({ orderedIds, notes, submittedNotes, history, ...(bedsideHistory.length ? { bedsideHistory } : {}) })
  }, [orderedIds, notes, submittedNotes, history, bedsideHistory, updatePhysicalExam])

  const selectedLabel = useMemo(() => regions.find((region) => region.id === selectedRegion)?.label ?? '腹部区域', [selectedRegion])
  const selectedExam = items.find((item) => item.id === selectedItem && orderedIds.includes(item.id))
  const orderedReports = useMemo(() => getOrderedExamReports(orderedIds, items), [orderedIds, items])
  const visibleReports = hisCategory ? orderedReports.filter(item => item.category === hisCategory) : orderedReports
  const currentAction = lastAction?.examId === selectedItem ? lastAction : null
  const palpation = items.find(item => item.id === 'inspection')?.palpation
  const voice = useMemo(() => getPatientVoiceProfile(patient), [patient])
  const filledCount = orderedReports.filter(item => notes[item.id]?.trim()).length

  const observe = (action: string) => {
    if (!selectedExam) return
    const entry = { examId: selectedExam.id, action, finding: selectedExam.report, at: Date.now() }
    setLastAction(entry)
    setBedsideHistory(previous => [...previous, entry])
  }

  useEffect(() => {
    if (muted || !palpation) return
    void preloadSpeech(palpation.painSpeech, { ...voice, emotion: 'sad' })
    void preloadSpeech('这里没有明显不适。', { ...voice, emotion: 'neutral' })
    void preloadSpeech(palpation.releaseSpeech ?? '松开时剧烈疼痛。', { ...voice, emotion: 'sad' })
  }, [muted, palpation, voice])

  const announce = useCallback((response: PalpationResponse) => {
    if (muted || !palpation) return
    const reaction = palpationSpeech(response, palpation)
    speakChinese(reaction.text, undefined, reaction.emotion, voice)
  }, [muted, palpation, voice])

  const finishPress = useCallback((event?: PointerEvent<HTMLButtonElement>) => {
    if (event && event.pointerId !== pointerId.current) return
    if (pointerId.current === null || !palpation) return
    const duration = Math.max(0, performance.now() - pressStartedAt.current)
    const response = resolvePalpationResponse(pressRegion.current, duration, teachingDemo, palpation)
    setPressing(false)
    pointerId.current = null
    setLastResponse(response)
    setHistory((items) => [...items, { ...response, at: Date.now() }])
    announce(response)
  }, [announce, teachingDemo, palpation])

  const cancelPress = useCallback(() => {
    pointerId.current = null
    setPressing(false)
  }, [])

  useEffect(() => {
    window.addEventListener('blur', cancelPress)
    return () => { window.removeEventListener('blur', cancelPress); stopSpeech() }
  }, [cancelPress])

  const pressHandlers = (region: PalpationRegion) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (!palpation || selectedItem !== 'inspection' || !orderedIds.includes('inspection')) return
      event.preventDefault()
      setSelectedRegion(region)
      pressRegion.current = region
      pointerId.current = event.pointerId
      pressStartedAt.current = performance.now()
      setPressing(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finishPress(event),
    onPointerCancel: cancelPress,
    onLostPointerCapture: cancelPress,
  })

  const openOrder = () => setOrderOpen(true)

  const confirmOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const selected = new FormData(event.currentTarget).getAll('exam').map(String)
    const next = updateOrderedExamIds(orderedIds, selected, [], items)
    setOrderedIds(next)
    if (!next.includes(selectedItem)) setSelectedItem(next[0] ?? '')
    setOrderOpen(false)
  }

  const submitNote = () => {
    if (!selectedExam) return
    const note = notes[selectedExam.id]?.trim()
    if (!note) return
    setSubmittedNotes((current) => ({ ...current, [selectedExam.id]: note }))
    recordSubmission('physical-exam', { examId: selectedExam.id, label: selectedExam.label, note })
  }

  const examinedRegion = regions.find(region => region.id === lastResponse?.region)?.label ?? ''
  const responseCopy = lastResponse?.type === 'rebound'
    ? lastResponse.result === 'rebound-positive'
      ? lastResponse.isTeachingDemo ? '松开瞬间剧烈疼痛 · 阳性教学示例' : examinedRegion + '松手时疼痛加重 · 反跳痛阳性'
      : '松开时无明显反跳痛'
    : lastResponse?.result === 'tender' ? (wang ? '左上腹压痛明显 · 按压时诉疼' : examinedRegion + '压痛 · 按压时诉疼')
      : lastResponse ? '按压时未诉明显疼痛' : '请选择腹部区域开始触诊'

  return <section className="exam-page" aria-label="体格检查训练台">
    <header className="exam-header">
      <button className="exam-back" type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> 返回问诊记录</button>
      <div className="exam-title"><span>OUTPATIENT · CASE {patient.number}</span><strong>体格检查</strong><small>检查开单 · 查看电脑 · 填写记录</small></div>
      <div className="exam-header-actions">
        <button className="exam-workflow-button" type="button" title="开具检查" onClick={openOrder}><FilePlus2 size={15} /> 开具检查</button>
        <button className="exam-workflow-button" type="button" title="查看电脑" onClick={() => setComputerOpen(true)}><Monitor size={15} /> 查看电脑</button>
        <button className="exam-reset" type="button" onClick={onReset} aria-label="重置体格检查"><RotateCcw size={14} /></button>
      </div>
    </header>
    <div className="exam-intro"><span className="exam-intro-icon"><Stethoscope size={27} /></span><div><h1>体格检查</h1><p>先开具检查，再到电脑查看病例结果，最后在当前项目下填写你的检查描述。</p></div><span className="exam-intro-wave">⌁⌁⌁</span></div>
    <div className="exam-layout">
      <aside className="exam-checklist">
        <div className="exam-checklist-title">已开具检查 <b>{orderedIds.length} 项</b></div>
        {orderedIds.length === 0 ? <p className="exam-checklist-empty">还没有开具检查</p> : <div className="exam-checklist-list">{orderedReports.map((item, index) => {
          return <button key={item.id} type="button" className={`exam-check-item ${selectedItem === item.id ? 'is-active' : ''}`} onClick={() => { setSelectedItem(item.id); setLastAction(null) }}><i>{index + 1}</i><span>{item.label}<small>已开单 · 可查看报告并填写</small></span><b>›</b></button>
        })}</div>}
        <button className="exam-order-again" type="button" onClick={openOrder}><FilePlus2 size={15} /> {orderedIds.length ? '追加检查项目' : '选择检查项目'}</button>
      </aside>
      <section className="exam-stage">
        <div className="exam-stage-title"><strong>{selectedExam?.label ?? '请选择检查项目'}</strong><span>{selectedExam?.hint ?? '从左侧开单后，在此查看病例结果并填写记录'}</span></div>
        <div className="exam-canvas-wrap"><ExamScene response={selectedItem === 'inspection' ? lastResponse : null} pressing={pressing} region={selectedRegion} /></div>
        {selectedExam && <div className="exam-note-entry"><div><strong>{selectedExam.label}记录</strong><span>{submittedNotes[selectedExam.id] ? '本项记录已提交，可继续修改后再次提交' : '查看电脑中的病例结果后，在这里描述你的检查发现'}</span></div><textarea aria-label={`${selectedExam.label}记录`} value={notes[selectedExam.id] ?? ''} placeholder="根据检查结果填写描述…" onChange={(event) => setNotes((current) => ({ ...current, [selectedExam.id]: event.target.value }))} /><button className="exam-note-submit" type="button" disabled={!notes[selectedExam.id]?.trim()} onClick={submitNote}>{submittedNotes[selectedExam.id] ? '重新提交本项记录' : '提交本项记录'}</button></div>}
        {selectedExam?.id === 'inspection' && <div className="exam-instruction"><MousePointer2 size={14} aria-hidden="true" /> 按压后突然松开，可检查反跳痛</div>}
        {!selectedExam && <div className="exam-stage-empty"><FilePlus2 size={22} /><strong>请先开具体格检查项目</strong><span>点击“查看电脑”即可查看已开项目的病例结果</span></div>}
      </section>
      <aside className="exam-sidebar">
        <div className="exam-patient-summary"><div className="exam-patient-avatar" aria-hidden="true">{patient.name.slice(0, 1)}</div><div><small>当前接诊患者</small><h2>{patient.name}</h2><p>{patient.age} 岁 · {patient.sex} · 门诊初诊</p></div></div>
        <ExamInteractionPanel key={selectedItem} itemId={selectedItem} vitals={selectedExam?.vitals} patientName={patient.name} onObserve={observe} enabled={Boolean(selectedExam)} selectedRegion={selectedLabel} onOpenComputer={(category) => { setHisCategory(category); setComputerOpen(true) }}>
          {regions.map((region) => <button key={region.id} type="button" disabled={!selectedExam || !palpation} className={`${selectedRegion === region.id ? 'is-selected' : ''} ${lastResponse?.region === region.id ? 'has-result' : ''}`} aria-label={region.label} {...pressHandlers(region.id)}>{region.label}</button>)}
        </ExamInteractionPanel>
        <div className="exam-card exam-feedback-card"><div className="exam-card-label">患者反应 <span>{selectedItem === 'inspection' && orderedIds.includes('inspection') ? '触诊中' : currentAction ? '已检查' : '待操作'}</span></div><h3>{selectedItem === 'inspection' ? responseCopy : currentAction?.finding ?? selectedExam?.label ?? '体格检查'}</h3><p>{selectedItem === 'inspection' ? '患者的实时反应用于辅助判断；检查结论请根据电脑报告填写。' : selectedExam ? '请结合床旁检查和电脑报告，在患者画面下方填写检查描述。' : '开具项目后可选择检查项目。'}</p>{selectedItem === 'inspection' && <div className="exam-pressure"><span>持续按压</span><b>{pressing ? '进行中' : lastResponse?.type === 'rebound' ? '已松开' : '0.0 / 1.0 秒'}</b><i><em className={pressing ? 'is-pressing' : ''} /></i></div>}</div>
        <div className="exam-guide"><h3>检查流程</h3><p><FilePlus2 size={17} /> <span><b>开具所需检查</b><small>可追加多个检查项目</small></span></p><p><Monitor size={17} /> <span><b>查看电脑并记录</b><small>报告按开单项目逐项显示</small></span></p></div>
        <div className="exam-record"><h3>腹部触诊记录</h3>{history.length === 0 ? <p className="exam-empty-record">还没有触诊记录</p> : history.slice(-4).reverse().map((entry, index) => <p key={`${entry.at}-${index}`}><span>{regions.find((region) => region.id === entry.region)?.label} · {entry.type === 'rebound' ? '反跳痛' : '压痛'}</span><b>{entry.result === 'tender' ? (wang ? '明显' : '有压痛') : entry.result === 'no-rebound' ? '阴性' : entry.result === 'rebound-positive' ? (entry.isTeachingDemo ? '阳性示例' : '阳性') : '未见'}</b></p>)}</div>
          <button className={`exam-demo ${teachingDemo ? 'is-active' : ''}`} type="button" onClick={() => setTeachingDemo((value) => !value)}><CircleAlert size={14} aria-hidden="true" /> {teachingDemo ? '正在演示阳性反跳痛 · 再次关闭' : '查看阳性反跳痛示例（教学演示）'}</button>
        {bedsideHistory.length > 0 && <div className="exam-record"><h3>床旁检查记录</h3>{bedsideHistory.slice(-4).reverse().map((entry, index) => <p key={`${entry.at}-${index}`}><span>{entry.action}</span><b>{entry.finding}</b></p>)}</div>}

      </aside>
    </div>
    <footer className="exam-footer"><span><b>体格检查</b>　已开具 {orderedIds.length} 项 · 已填写 {filledCount} 项</span><div><button type="button" onClick={onBack}>返回问诊</button><button className="exam-primary" type="button" onClick={() => setFinishOpen(true)}><Check size={15} aria-hidden="true" /> 完成检查</button></div></footer>

    {orderOpen && <div className="exam-workflow-backdrop"><form onSubmit={confirmOrder} className="exam-workflow-dialog" role="dialog" aria-modal="true" aria-label="开具体格检查"><header><div><small>{patient.name} · 门诊体格检查</small><h2>开具检查</h2></div><button type="button" aria-label="关闭开单" onClick={() => setOrderOpen(false)}><X size={18} /></button></header><p className="exam-dialog-subtitle">选择需要查看的检查项目，确认后可在电脑中查看对应病例结果。</p><div className="exam-order-list">{items.map((item) => <label key={item.id}><input type="checkbox" aria-label={item.label} name="exam" value={item.id} defaultChecked={orderedIds.includes(item.id)} /><span><b>{item.label}</b><small>{item.hint}</small></span>{orderedIds.includes(item.id) && <em>已开单</em>}</label>)}</div><footer><button type="button" className="exam-dialog-secondary" onClick={() => setOrderOpen(false)}>取消</button><button type="submit" className="exam-dialog-primary">确认开单</button></footer></form></div>}

    {computerOpen && <div className="exam-workflow-backdrop exam-his-backdrop"><section className="exam-workflow-dialog exam-his-dialog" role="dialog" aria-modal="true" aria-label="医院信息系统">
      <header className="his-window-head"><div className="his-window-title"><span className="his-window-icon"><Monitor size={24} /></span><div><h2>医院信息系统 (HIS)</h2><p>查看患者病历、检查检验结果、影像资料等信息</p></div></div><button type="button" aria-label="关闭医院信息系统" onClick={() => setComputerOpen(false)}><X size={20} /></button></header>
      <div className="his-desktop">
        <div className="his-system-bar"><div className="his-brand"><span className="his-brand-mark">✚</span><span><b>XX大学附属医院</b><small>HOSPITAL INFORMATION SYSTEM</small></span></div><div className="his-search">⌕　搜索患者姓名 / 住院号 / 检查项目...</div><div className="his-system-actions"><span>●</span><b>3</b><span>♙ 医生工作站</span><span>↪ 退出</span></div></div>
        <div className="his-patient-strip"><div className="his-patient-avatar">{patient.name.slice(0, 1)}</div><div className="his-patient-main"><strong>{patient.name}</strong><b>{patient.sex}</b><b>{patient.age}岁</b><small>{wang ? '住院号：20250923001　 门诊号：MZ20250923' : `门诊教学病例：${patient.number}`}</small><small>主诉：{patient.chiefComplaint}</small></div><div className="his-patient-meta">{wang ? <><span>就诊日期：2025-09-23</span><span>科室：消化内科（门诊）</span><span>过敏史　无　　既往史　曾患胰腺炎</span></> : <span>综合门诊 · 初诊</span>}</div></div>
        <nav className="his-tabs" aria-label="医院信息系统模块"><button className="is-active" type="button">体格检查</button><button type="button">检验结果</button><button type="button">影像检查</button><button type="button">心电图</button><button type="button">历史病历</button><button type="button">医嘱记录</button></nav>
        <div className="his-workspace"><aside className="his-section-nav"><b>检查分类</b>{hisCategories.map((section) => <button aria-pressed={hisCategory === section} className={hisCategory === section ? 'is-active' : ''} key={section} type="button" onClick={() => setHisCategory((current) => current === section ? '' : section)}>{section}</button>)}</aside><main className="his-record-main"><div className="his-record-heading"><div><h3>体格检查记录</h3><span>病例检查结果 · 共 {visibleReports.length} 项</span></div>{wang && <span>检查时间：2025-09-23 10:15</span>}<button type="button">＋ 新增记录</button></div>{visibleReports.length === 0 ? <div className="exam-his-empty"><Monitor size={25} /><strong>{hisCategory ? `${hisCategory}暂无已开具的检查结果` : '暂无已开具的检查结果'}</strong><span>先开具该类检查项目，病例结果会显示在这里。</span></div> : <div className="exam-his-reports his-table"><div className="his-table-head"><b>检查项目</b><b>检查结果</b><b>医生备注</b></div>{visibleReports.map((item) => <article key={item.id}><strong>{item.label}</strong><p>{item.report}</p><span>{wang && item.id === 'vitals' ? '体温轻度升高，心率偏快' : item.id === 'inspection' ? '结合腹部症状评估' : wang ? '无特殊' : '—'}</span></article>)}</div>}</main></div>
      </div>
      <footer className="his-window-foot"><button type="button" className="exam-dialog-primary" onClick={() => setComputerOpen(false)}>关闭电脑</button></footer>
    </section></div>}

    {finishOpen && <div className="exam-workflow-backdrop"><section className="exam-workflow-dialog exam-finish-dialog" role="dialog" aria-modal="true" aria-label="体格检查已记录"><header><div><small>PHYSICAL EXAMINATION · CASE {patient.number}</small><h2>体格检查已记录</h2></div><button type="button" aria-label="关闭完成提示" onClick={() => setFinishOpen(false)}><X size={18} /></button></header><p>已开具 {orderedIds.length} 项检查，已填写 {filledCount} 项记录。可继续补充未填写的项目。</p>{orderedIds.length > filledCount && <div className="exam-incomplete-list"><b>尚未填写</b><span>{orderedIds.filter((id) => !notes[id]?.trim()).map((id) => items.find((item) => item.id === id)?.label).join('、')}</span></div>}<footer><button type="button" className="exam-dialog-secondary" onClick={() => setFinishOpen(false)}>继续检查</button><button type="button" className="exam-dialog-primary" onClick={onFinish}>进入中医四诊 <ArrowLeft size={15} /></button></footer></section></div>}
  </section>
}
