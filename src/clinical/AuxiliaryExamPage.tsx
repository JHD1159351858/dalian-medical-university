import { useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardList, FileText, FlaskConical, Maximize2, ScanLine, Stethoscope } from 'lucide-react'
import { useTrainingCase } from '../cases/selectedCase'
import { PatientPortrait } from '../exam/ExamScene'
import { clinicalModules, type ClinicalModuleId } from './caseData'
import { getAuxiliaryExams } from './auxiliaryExamData'
import { AuxiliaryReportViewer, AuxiliaryReportContent } from './AuxiliaryReportViewer'

export interface AuxiliaryExamPageProps {
  records: Record<string, string>
  orderedIds?: string[]
  onOrderChange?: (ids: string[]) => void
  onRecordChange: (id: string, value: string) => void
  onBack: () => void
  onNext: () => void
  onNavigate: (module: ClinicalModuleId) => void
}

export function AuxiliaryExamPage({ records, orderedIds, onOrderChange, onRecordChange, onBack, onNext, onNavigate }: AuxiliaryExamPageProps) {
  const patient = useTrainingCase()
  const items = getAuxiliaryExams(patient)
  const note = (item: { id: string; label: string }) => records[item.id] ?? records[item.label] ?? ''
  const recorded = items.filter((item) => note(item).trim())
  const [localOrders, setLocalOrders] = useState<string[]>([])
  const orders = orderedIds ?? localOrders
  const hasOrder = (item: { id: string; label: string }) => orders.includes(item.id) || Boolean(note(item).trim())
  const orderedCount = items.filter(hasOrder).length
  const [selectedId, setSelected] = useState(() => items.find(hasOrder)?.id ?? items[0].id)
  const [viewingReport, setViewingReport] = useState(false)
  const activeItem = items.find((item) => item.id === selectedId) ?? items[0]
  const { id: selected, report } = activeItem
  const ordered = hasOrder(activeItem)
  const pendingReport = report.unavailable
  const Icon = selected === 'ecg' ? Activity : report.category === '实验室检查' ? FlaskConical : ScanLine

  function orderCurrentExam() {
    const next = items.filter((item) => item.id === selected || hasOrder(item)).map((item) => item.id)
    setLocalOrders(next)
    onOrderChange?.(next)
  }

  return <section className="aux-workspace" aria-label="辅助检查训练台">
    <aside className="four-rail">
      <div className="four-rail-heading"><strong>接诊流程</strong><span>CASE {patient.number}</span></div>
      <nav aria-label="病例模块">{clinicalModules.map((module, index) => <button key={module.id} type="button" className={module.id === 'auxiliaryExam' ? 'is-active' : ''} aria-current={module.id === 'auxiliaryExam' ? 'step' : undefined} onClick={() => onNavigate(module.id)}><b>{module.short}</b><span>{module.label}</span>{index < 3 && <Check size={18} />}</button>)}</nav>
      <div className="four-rail-caption"><ClipboardList size={20} /><span>临床综合实训</span></div>
    </aside>

    <div className="aux-main">
      <header className="four-heading"><div className="four-title"><h1>辅助检查</h1><p>检查开单 · 报告判读</p></div><div className="four-patient-identity">{patient.name} <span>· {patient.sex} · {patient.age} 岁 · 门诊初诊</span></div><div className="four-progress"><span>已开 {orderedCount} 项 · 已记录 {recorded.length} 项</span><div role="progressbar" aria-label="已开辅助检查记录进度" aria-valuemin={0} aria-valuemax={Math.max(1, orderedCount)} aria-valuenow={recorded.length}><i style={{ width: `${recorded.length / Math.max(1, orderedCount) * 100}%` }} /></div></div></header>

      <div className="aux-report-workbench">
        <section className="aux-exam-list" aria-label="辅助检查项目"><div className="aux-list-heading"><strong>检查项目</strong><span>{items.length} 项</span></div><div role="tablist" aria-label="辅助检查报告">{items.map((item, index) => <button key={item.id} id={`aux-exam-${item.id}`} type="button" role="tab" aria-selected={selected === item.id} aria-controls="aux-current-report" className={selected === item.id ? 'is-active' : ''} onClick={() => { setSelected(item.id); setViewingReport(false) }}><span className="aux-exam-number">{note(item).trim() ? <Check size={18} aria-label="已记录" /> : String(index + 1).padStart(2, '0')}</span><span><strong>{item.label}</strong><small>{item.report.category} · {hasOrder(item) ? '已开单' : '待开单'}</small></span><ChevronRight size={18} /></button>)}</div></section>

        <section className="aux-report" id="aux-current-report" role="tabpanel" aria-labelledby={`aux-exam-${selected}`}>
          <header className="aux-report-heading"><div className="aux-report-icon"><Icon size={26} /></div><div><span>{report.category}</span><h2>{activeItem.label}</h2></div><span className="aux-report-status"><i />{ordered ? (pendingReport ? '暂无报告' : report.simulated ? '教学模拟报告' : '病例报告') : '待开单'}</span></header>
          <div className="aux-report-patient"><span>患者 <b>{patient.name}</b></span><span>性别 <b>{patient.sex}</b></span><span>年龄 <b>{patient.age} 岁</b></span></div>
          {ordered ? <div className="aux-report-content">
            {report.image && <button type="button" className="aux-image-preview" onClick={() => setViewingReport(true)}><img src={report.image.src} alt={`${report.image.alt} 缩略图`} /><span><small>原始病例影像 · 1 张</small><strong><Maximize2 size={19} />查看{report.image.alt}影像</strong><span>点击展开，查看完整影像</span></span></button>}
            <div className="aux-report-section-heading"><FileText size={19} /><h3>{report.values ? '检验结果' : pendingReport ? '执行情况' : '检查所见'}</h3>{!report.image && <button type="button" className="aux-view-report" onClick={() => setViewingReport(true)}><Maximize2 size={17} />{report.values ? '展开检验报告' : pendingReport ? '查看执行情况' : '展开检查报告'}</button>}</div>
            <AuxiliaryReportContent report={report} />
          </div> : <div className="aux-report-content">
            <p>结合当前患者的病情，决定是否开具这项检查。</p>
            <button type="button" className="aux-view-report" onClick={orderCurrentExam}><ClipboardList size={17} />开具{activeItem.label}</button>
          </div>}
          {ordered && <div className="aux-report-caption"><ClipboardList size={17} /><span>{pendingReport ? '可记录本病例的检查执行情况。' : '根据报告内容，记录关键检查所见。'}</span></div>}
        </section>
      </div>

      <section className="four-record" aria-label="辅助检查记录"><div><h2>检查记录</h2><span>{activeItem.label}</span><small className="aux-record-status">{note(activeItem).trim() ? '已记录' : '待填写'}</small></div><textarea aria-label="检查记录" disabled={!ordered} placeholder={ordered ? "记录本项检查的关键结果及你的判断…" : "开具本项检查后可填写记录"} value={note(activeItem)} onChange={(event) => onRecordChange(selected, event.target.value)} /></section>
    </div>

    <aside className="aux-summary" aria-label="患者与检查记录">
      <header className="aux-summary-heading"><h2>当前患者</h2><span>SP {patient.number}</span></header>
      <section className="aux-patient-card"><div className="aux-patient-model"><PatientPortrait /></div><div className="aux-patient-caption"><strong>{patient.name}</strong><span>{patient.sex} · {patient.age} 岁 · 门诊初诊</span><small><i />患者在场</small></div></section>
      <section className="aux-summary-section"><h3>主诉</h3><p>{patient.chiefComplaint}</p></section>
      <section className="aux-summary-section aux-records-summary"><div><h3>检查记录</h3><span>{recorded.length} 项</span></div>{recorded.length ? <ul>{recorded.map((item) => <li key={item.id}><Check size={17} /><div><strong>{item.label}</strong><p>{note(item)}</p></div></li>)}</ul> : <div className="aux-summary-empty"><ClipboardList size={26} /><p>填写检查记录后，已记录的项目会显示在这里。</p></div>}</section>
      <div className="aux-summary-tip"><Stethoscope size={20} /><p>选择项目并开单，查看结果后填写记录。</p></div>
    </aside>

    <footer className="four-footer"><button type="button" className="four-back" onClick={onBack}><ArrowLeft size={21} />返回上一步</button><span>整理检查结果，继续临床诊断</span><button type="button" className="four-next" onClick={onNext}>进入诊断<ArrowRight size={22} /></button></footer>
    {ordered && viewingReport && <AuxiliaryReportViewer title={activeItem.label} report={report} onClose={() => setViewingReport(false)} />}
  </section>
}
