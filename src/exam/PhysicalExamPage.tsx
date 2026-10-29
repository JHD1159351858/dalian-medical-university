import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ArrowLeft, Check, CircleAlert, FilePlus2, Monitor, MousePointer2, RotateCcw, Stethoscope, X } from 'lucide-react'
import { playCachedSpeech, preloadSpeech, stopSpeech } from '../diagnosis/speech'
import { PATIENT_VOICE_PROFILE } from '../diagnosis/voiceProfiles'
import { ExamScene } from './ExamScene'
import { ExamInteractionPanel } from './ExamInteractionPanel'
import { palpationSpeech, resolvePalpationResponse, type PalpationRegion, type PalpationResponse } from './palpation'
import { physicalExamItems } from './examData'
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

export function PhysicalExamPage({ muted, onBack, onFinish, onReset }: PhysicalExamPageProps) {
  const [selectedRegion, setSelectedRegion] = useState<PalpationRegion>('left-upper')
  const [selectedItem, setSelectedItem] = useState('')
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [orderSelection, setOrderSelection] = useState<string[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submittedNotes, setSubmittedNotes] = useState<Record<string, string>>({})
  const [orderOpen, setOrderOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [hisCategory, setHisCategory] = useState('')
  const [finishOpen, setFinishOpen] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [lastResponse, setLastResponse] = useState<PalpationResponse | null>(null)
  const [history, setHistory] = useState<ExamEntry[]>([])
  const [teachingDemo, setTeachingDemo] = useState(false)
  const pointerId = useRef<number | null>(null)
  const pressStartedAt = useRef(0)
  const pressRegion = useRef<PalpationRegion>(selectedRegion)

  const selectedLabel = useMemo(() => regions.find((region) => region.id === selectedRegion)?.label ?? '腹部区域', [selectedRegion])
  const selectedExam = physicalExamItems.find((item) => item.id === selectedItem && orderedIds.includes(item.id))
  const orderedReports = useMemo(() => getOrderedExamReports(orderedIds), [orderedIds])
  const visibleReports = useMemo(() => {
    const categories: Record<string, string[]> = {
      '一般情况': ['nutrition'],
      '头颈部': ['nodes', 'skin'],
      '胸部': ['respiration'],
      '心血管': ['heart', 'vitals'],
      '腹部': ['inspection', 'percussion', 'bowel'],
      '四肢': ['limbs'],
      '神经系统': ['neuro'],
      '专科检查': [],
    }
    return hisCategory ? orderedReports.filter((item) => categories[hisCategory]?.includes(item.id)) : orderedReports
  }, [hisCategory, orderedReports])

  useEffect(() => {
    const options = { ...PATIENT_VOICE_PROFILE }
    const reactions = [
      palpationSpeech(resolvePalpationResponse('left-upper', 240)),
      palpationSpeech(resolvePalpationResponse('left-upper', 1200, true)),
      palpationSpeech(resolvePalpationResponse('center', 240)),
    ]
    void Promise.all(reactions.map((reaction) => preloadSpeech(reaction.text, { ...options, emotion: reaction.emotion })))
  }, [])

  const announce = useCallback((response: PalpationResponse) => {
    if (muted) return
    const reaction = palpationSpeech(response)
    const options = { ...PATIENT_VOICE_PROFILE, emotion: reaction.emotion }
    if (playCachedSpeech(reaction.text, options)) return
    void preloadSpeech(reaction.text, options).then(() => playCachedSpeech(reaction.text, options))
  }, [muted])

  const finishPress = useCallback((event?: PointerEvent<HTMLButtonElement>) => {
    if (event && event.pointerId !== pointerId.current) return
    if (pointerId.current === null) return
    const duration = Math.max(0, performance.now() - pressStartedAt.current)
    const response = resolvePalpationResponse(pressRegion.current, duration, teachingDemo)
    setPressing(false)
    pointerId.current = null
    setLastResponse(response)
    setHistory((items) => [...items, { ...response, at: Date.now() }])
    announce(response)
  }, [announce, teachingDemo])

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
      if (selectedItem !== 'inspection' || !orderedIds.includes('inspection')) return
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

  const openOrder = () => {
    setOrderSelection(orderedIds)
    setOrderOpen(true)
  }

  const confirmOrder = () => {
    const next = updateOrderedExamIds(orderedIds, orderSelection, [])
    setOrderedIds(next)
    if (!next.includes(selectedItem)) setSelectedItem(next[0] ?? '')
    setOrderOpen(false)
  }

  const responseCopy = lastResponse?.type === 'rebound'
    ? lastResponse.result === 'rebound-positive' ? '松开瞬间剧烈疼痛 · 阳性教学示例' : '松开时无明显反跳痛'
    : lastResponse?.result === 'tender' && lastResponse.region === 'left-upper' ? '左上腹压痛明显 · 按压时诉疼' : lastResponse ? '按压时未诉明显疼痛' : '请选择腹部区域开始触诊'

  return <section className="exam-page" aria-label="体格检查训练台">
    <header className="exam-header">
      <button className="exam-back" type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> 返回问诊记录</button>
      <div className="exam-title"><span>OUTPATIENT · CASE 01</span><strong>体格检查</strong><small>检查开单 · 查看电脑 · 填写记录</small></div>
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
        {orderedIds.length === 0 ? <p className="exam-checklist-empty">还没有开具检查</p> : <div className="exam-checklist-list">{orderedIds.map((id) => {
          const item = physicalExamItems.find((candidate) => candidate.id === id)!
          return <button key={item.id} type="button" className={`exam-check-item ${selectedItem === item.id ? 'is-active' : ''}`} onClick={() => setSelectedItem(item.id)}><i>{orderedIds.indexOf(id) + 1}</i><span>{item.label}<small>已开单 · 可查看报告并填写</small></span><b>›</b></button>
        })}</div>}
        <button className="exam-order-again" type="button" onClick={openOrder}><FilePlus2 size={15} /> {orderedIds.length ? '追加检查项目' : '选择检查项目'}</button>
      </aside>
      <section className="exam-stage">
        <div className="exam-stage-title"><strong>{selectedExam?.label ?? '请选择检查项目'}</strong><span>{selectedExam?.hint ?? '从左侧开单后，在此查看病例结果并填写记录'}</span></div>
        <div className="exam-canvas-wrap"><ExamScene response={lastResponse} pressing={pressing} /></div>
        {selectedExam && <div className="exam-note-entry"><div><strong>{selectedExam.label}记录</strong><span>{submittedNotes[selectedExam.id] ? '本项记录已提交，可继续修改后再次提交' : '查看电脑中的病例结果后，在这里描述你的检查发现'}</span></div><textarea aria-label={`${selectedExam.label}记录`} value={notes[selectedExam.id] ?? ''} placeholder="根据检查结果填写描述…" onChange={(event) => setNotes((current) => ({ ...current, [selectedExam.id]: event.target.value }))} /><button className="exam-note-submit" type="button" disabled={!notes[selectedExam.id]?.trim()} onClick={() => setSubmittedNotes((current) => ({ ...current, [selectedExam.id]: notes[selectedExam.id].trim() }))}>{submittedNotes[selectedExam.id] ? '重新提交本项记录' : '提交本项记录'}</button></div>}
        {selectedExam?.id === 'inspection' && <div className="exam-instruction"><MousePointer2 size={14} aria-hidden="true" /> 按压后突然松开，可检查反跳痛</div>}
        {!selectedExam && <div className="exam-stage-empty"><FilePlus2 size={22} /><strong>请先开具体格检查项目</strong><span>点击“查看电脑”即可查看已开项目的病例结果</span></div>}
      </section>
      <aside className="exam-sidebar">
        <div className="exam-patient-summary"><div className="exam-patient-avatar" aria-hidden="true">王</div><div><small>当前接诊患者</small><h2>王旭</h2><p>48 岁 · 男 · 门诊初诊</p></div></div>
        <ExamInteractionPanel key={selectedItem} itemId={selectedItem} enabled={Boolean(selectedExam)} selectedRegion={selectedLabel} onOpenComputer={(category) => { setHisCategory(category); setComputerOpen(true) }}>
          {regions.map((region) => <button key={region.id} type="button" disabled={!selectedExam} className={`${selectedRegion === region.id ? 'is-selected' : ''} ${lastResponse?.region === region.id ? 'has-result' : ''}`} aria-label={region.label} {...pressHandlers(region.id)}>{region.label}</button>)}
        </ExamInteractionPanel>
        <div className="exam-card exam-feedback-card"><div className="exam-card-label">患者反应 <span>{selectedItem === 'inspection' && orderedIds.includes('inspection') ? '触诊中' : '待操作'}</span></div><h3>{selectedItem === 'inspection' ? responseCopy : selectedExam?.label ?? '体格检查'}</h3><p>{selectedItem === 'inspection' ? '患者的实时反应用于辅助判断；检查结论请根据电脑报告填写。' : selectedExam ? '先查看电脑中的病例结果，再在患者画面下方填写检查描述。' : '开具项目后可选择检查项目。'}</p>{selectedItem === 'inspection' && <div className="exam-pressure"><span>持续按压</span><b>{pressing ? '进行中' : lastResponse?.type === 'rebound' ? '已松开' : '0.0 / 1.0 秒'}</b><i><em className={pressing ? 'is-pressing' : ''} /></i></div>}</div>
        <div className="exam-guide"><h3>检查流程</h3><p><FilePlus2 size={17} /> <span><b>开具所需检查</b><small>可追加多个检查项目</small></span></p><p><Monitor size={17} /> <span><b>查看电脑并记录</b><small>报告按开单项目逐项显示</small></span></p></div>
        <div className="exam-record"><h3>腹部触诊记录</h3>{history.length === 0 ? <p className="exam-empty-record">还没有触诊记录</p> : history.slice(-4).reverse().map((entry, index) => <p key={`${entry.at}-${index}`}><span>{regions.find((region) => region.id === entry.region)?.label} · {entry.type === 'rebound' ? '反跳痛' : '压痛'}</span><b>{entry.result === 'tender' ? '明显' : entry.result === 'no-rebound' ? '阴性' : entry.result === 'rebound-positive' ? '阳性示例' : '未见'}</b></p>)}</div>
        <button className={`exam-demo ${teachingDemo ? 'is-active' : ''}`} type="button" onClick={() => setTeachingDemo((value) => !value)}><CircleAlert size={14} aria-hidden="true" /> {teachingDemo ? '正在演示阳性反跳痛 · 再次关闭' : '查看阳性反跳痛示例（教学演示）'}</button>
      </aside>
    </div>
    <footer className="exam-footer"><span><b>体格检查</b>　已开具 {orderedIds.length} 项 · 已填写 {Object.values(notes).filter((value) => value.trim()).length} 项</span><div><button type="button" onClick={onBack}>返回问诊</button><button className="exam-primary" type="button" onClick={() => setFinishOpen(true)}><Check size={15} aria-hidden="true" /> 完成检查</button></div></footer>

    {orderOpen && <div className="exam-workflow-backdrop"><section className="exam-workflow-dialog" role="dialog" aria-modal="true" aria-label="开具体格检查"><header><div><small>王旭 · 门诊体格检查</small><h2>开具检查</h2></div><button type="button" aria-label="关闭开单" onClick={() => setOrderOpen(false)}><X size={18} /></button></header><p className="exam-dialog-subtitle">选择需要查看的检查项目，确认后可在电脑中查看对应病例结果。</p><div className="exam-order-list">{physicalExamItems.map((item) => <label key={item.id}><input type="checkbox" aria-label={item.label} checked={orderSelection.includes(item.id)} onChange={(event) => setOrderSelection((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><b>{item.label}</b><small>{item.hint}</small></span>{orderedIds.includes(item.id) && <em>已开单</em>}</label>)}</div><footer><button type="button" className="exam-dialog-secondary" onClick={() => setOrderOpen(false)}>取消</button><button type="button" className="exam-dialog-primary" onClick={confirmOrder}>确认开单</button></footer></section></div>}

    {computerOpen && <div className="exam-workflow-backdrop exam-his-backdrop"><section className="exam-workflow-dialog exam-his-dialog" role="dialog" aria-modal="true" aria-label="医院信息系统">
      <header className="his-window-head"><div className="his-window-title"><span className="his-window-icon"><Monitor size={24} /></span><div><h2>医院信息系统 (HIS)</h2><p>查看患者病历、检查检验结果、影像资料等信息</p></div></div><button type="button" aria-label="关闭医院信息系统" onClick={() => setComputerOpen(false)}><X size={20} /></button></header>
      <div className="his-desktop">
        <div className="his-system-bar"><div className="his-brand"><span className="his-brand-mark">✚</span><span><b>XX大学附属医院</b><small>HOSPITAL INFORMATION SYSTEM</small></span></div><div className="his-search">⌕　搜索患者姓名 / 住院号 / 检查项目...</div><div className="his-system-actions"><span>●</span><b>3</b><span>♙ 医生工作站</span><span>↪ 退出</span></div></div>
        <div className="his-patient-strip"><div className="his-patient-avatar">王</div><div className="his-patient-main"><strong>王旭</strong><b>男</b><b>48岁</b><small>住院号：20250923001　 门诊号：MZ20250923</small><small>主诉：上腹部不适2周</small></div><div className="his-patient-meta"><span>就诊日期：2025-09-23</span><span>科室：消化内科（门诊）</span><span>过敏史　无　　既往史　高血压（5年）</span></div></div>
        <nav className="his-tabs" aria-label="医院信息系统模块"><button className="is-active" type="button">体格检查</button><button type="button">检验结果</button><button type="button">影像检查</button><button type="button">心电图</button><button type="button">历史病历</button><button type="button">医嘱记录</button></nav>
        <div className="his-workspace"><aside className="his-section-nav"><b>检查分类</b>{['一般情况', '头颈部', '胸部', '心血管', '腹部', '四肢', '神经系统', '专科检查'].map((section) => <button aria-pressed={hisCategory === section} className={hisCategory === section ? 'is-active' : ''} key={section} type="button" onClick={() => setHisCategory((current) => current === section ? '' : section)}>{section}</button>)}</aside><main className="his-record-main"><div className="his-record-heading"><div><h3>体格检查记录</h3><span>病例检查结果 · 共 {visibleReports.length} 项</span></div><span>检查时间：2025-09-23 10:15</span><button type="button">＋ 新增记录</button></div>{visibleReports.length === 0 ? <div className="exam-his-empty"><Monitor size={25} /><strong>{hisCategory ? `${hisCategory}暂无已开具的检查结果` : '暂无已开具的检查结果'}</strong><span>先开具该类检查项目，病例结果会显示在这里。</span></div> : <div className="exam-his-reports his-table"><div className="his-table-head"><b>检查项目</b><b>检查结果</b><b>医生备注</b></div>{visibleReports.map((item) => <article key={item.id}><strong>{item.label}</strong><p>{item.report}</p><span>{item.id === 'vitals' ? '体温轻度升高，心率偏快' : item.id === 'inspection' ? '结合腹部症状评估' : '无特殊'}</span></article>)}</div>}</main></div>
      </div>
      <footer className="his-window-foot"><button type="button" className="exam-dialog-primary" onClick={() => setComputerOpen(false)}>关闭电脑</button></footer>
    </section></div>}

    {finishOpen && <div className="exam-workflow-backdrop"><section className="exam-workflow-dialog exam-finish-dialog" role="dialog" aria-modal="true" aria-label="体格检查已记录"><header><div><small>PHYSICAL EXAMINATION · CASE 01</small><h2>体格检查已记录</h2></div><button type="button" aria-label="关闭完成提示" onClick={() => setFinishOpen(false)}><X size={18} /></button></header><p>已开具 {orderedIds.length} 项检查，已填写 {Object.values(notes).filter((value) => value.trim()).length} 项记录。可继续补充未填写的项目。</p>{orderedIds.length > Object.values(notes).filter((value) => value.trim()).length && <div className="exam-incomplete-list"><b>尚未填写</b><span>{orderedIds.filter((id) => !notes[id]?.trim()).map((id) => physicalExamItems.find((item) => item.id === id)?.label).join('、')}</span></div>}<footer><button type="button" className="exam-dialog-secondary" onClick={() => setFinishOpen(false)}>继续检查</button><button type="button" className="exam-dialog-primary" onClick={onFinish}>进入中医四诊 <ArrowLeft size={15} /></button></footer></section></div>}
  </section>
}
