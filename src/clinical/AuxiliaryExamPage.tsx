import { useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardList, FileText, FlaskConical, Maximize2, ScanLine, Stethoscope } from 'lucide-react'
import { PatientPortrait } from '../exam/ExamScene'
import { CASE_CHIEF_COMPLAINT, clinicalModules, moduleItems, type ClinicalModuleId } from './caseData'
import { auxiliaryReports } from './auxiliaryExamData'
import { AuxiliaryReportViewer, LaboratoryTable } from './AuxiliaryReportViewer'

export interface AuxiliaryExamPageProps {
  records: Record<string, string>
  onRecordChange: (id: string, value: string) => void
  onBack: () => void
  onNext: () => void
  onNavigate: (module: ClinicalModuleId) => void
}

export function AuxiliaryExamPage({ records, onRecordChange, onBack, onNext, onNavigate }: AuxiliaryExamPageProps) {
  const [selected, setSelected] = useState('abdomen-ct')
  const [viewingReport, setViewingReport] = useState(false)
  const items = moduleItems.auxiliaryExam
  const activeItem = items.find((item) => item.id === selected)!
  const report = auxiliaryReports[selected]
  const recorded = items.filter((item) => records[item.id]?.trim())
  const Icon = selected === 'ecg' ? Activity : report.values ? FlaskConical : ScanLine

  return <section className="aux-workspace" aria-label="辅助检查训练台">
    <aside className="four-rail">
      <div className="four-rail-heading"><strong>接诊流程</strong><span>CASE 01</span></div>
      <nav aria-label="病例模块">{clinicalModules.map((module, index) => <button key={module.id} type="button" className={module.id === 'auxiliaryExam' ? 'is-active' : ''} aria-current={module.id === 'auxiliaryExam' ? 'step' : undefined} onClick={() => onNavigate(module.id)}><b>{module.short}</b><span>{module.label}</span>{index < 3 && <Check size={18} />}</button>)}</nav>
      <div className="four-rail-caption"><ClipboardList size={20} /><span>临床综合实训</span></div>
    </aside>

    <div className="aux-main">
      <header className="four-heading"><div className="four-title"><h1>辅助检查</h1><p>检查报告 · 临床证据</p></div><div className="four-patient-identity">王旭 <span>· 男 · 48 岁 · 门诊初诊</span></div><div className="four-progress"><span>{recorded.length}/{items.length} 已记录</span><div role="progressbar" aria-label="辅助检查记录进度" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={recorded.length}><i style={{ width: `${recorded.length / items.length * 100}%` }} /></div></div></header>

      <div className="aux-report-workbench">
        <section className="aux-exam-list" aria-label="辅助检查项目"><div className="aux-list-heading"><strong>检查项目</strong><span>{items.length} 项</span></div><div role="tablist" aria-label="辅助检查报告">{items.map((item, index) => <button key={item.id} id={`aux-exam-${item.id}`} type="button" role="tab" aria-selected={selected === item.id} aria-controls="aux-current-report" className={selected === item.id ? 'is-active' : ''} onClick={() => setSelected(item.id)}><span className="aux-exam-number">{records[item.id]?.trim() ? <Check size={18} aria-label="已记录" /> : String(index + 1).padStart(2, '0')}</span><span><strong>{item.label}</strong><small>{auxiliaryReports[item.id].category}</small></span><ChevronRight size={18} /></button>)}</div></section>

        <section className="aux-report" id="aux-current-report" role="tabpanel" aria-labelledby={`aux-exam-${selected}`}>
          <header className="aux-report-heading"><div className="aux-report-icon"><Icon size={26} /></div><div><span>{report.category}</span><h2>{activeItem.label}</h2></div><span className="aux-report-status"><i />病例报告</span></header>
          <div className="aux-report-patient"><span>患者 <b>王旭</b></span><span>性别 <b>男</b></span><span>年龄 <b>48 岁</b></span></div>
          <div className="aux-report-content">
            {report.image && <button type="button" className="aux-image-preview" onClick={() => setViewingReport(true)}><img src={report.image.src} alt={`${report.image.alt} 缩略图`} /><span><small>原始病例影像 · 1 张</small><strong><Maximize2 size={19} />查看{report.image.alt}影像</strong><span>点击展开，查看完整影像</span></span></button>}
            <div className="aux-report-section-heading"><FileText size={19} /><h3>{report.values ? '检验结果' : '检查所见'}</h3>{report.values && <button type="button" className="aux-view-report" onClick={() => setViewingReport(true)}><Maximize2 size={17} />展开检验报告</button>}</div>
            {report.values ? <LaboratoryTable values={report.values} /> : <ol className="aux-report-findings">{report.findings?.map((finding, index) => <li key={finding}><span>{String(index + 1).padStart(2, '0')}</span><p>{finding}</p></li>)}</ol>}
            {report.note && <p className="aux-report-note">{report.note}</p>}
          </div>
          <div className="aux-report-caption"><ClipboardList size={17} /><span>根据报告内容，记录关键检查所见。</span></div>
        </section>
      </div>

      <section className="four-record" aria-label="辅助检查记录"><div><h2>检查记录</h2><span>{activeItem.label}</span><small className="aux-record-status">{records[selected]?.trim() ? '已记录' : '待填写'}</small></div><textarea aria-label="检查记录" placeholder="记录本项检查的关键结果及你的判断…" value={records[selected] ?? ''} onChange={(event) => onRecordChange(selected, event.target.value)} /></section>
    </div>

    <aside className="aux-summary" aria-label="患者与检查记录">
      <header className="aux-summary-heading"><h2>当前患者</h2><span>SP 01</span></header>
      <section className="aux-patient-card"><div className="aux-patient-model"><PatientPortrait /></div><div className="aux-patient-caption"><strong>王旭</strong><span>男 · 48 岁 · 门诊初诊</span><small><i />患者在场</small></div></section>
      <section className="aux-summary-section"><h3>主诉</h3><p>{CASE_CHIEF_COMPLAINT}</p></section>
      <section className="aux-summary-section aux-records-summary"><div><h3>检查记录</h3><span>{recorded.length}/{items.length}</span></div>{recorded.length ? <ul>{recorded.map((item) => <li key={item.id}><Check size={17} /><div><strong>{item.label}</strong><p>{records[item.id]}</p></div></li>)}</ul> : <div className="aux-summary-empty"><ClipboardList size={26} /><p>填写检查记录后，已记录的项目会显示在这里。</p></div>}</section>
      <div className="aux-summary-tip"><Stethoscope size={20} /><p>先查看报告，再记录所见，完成后进入诊断。</p></div>
    </aside>

    <footer className="four-footer"><button type="button" className="four-back" onClick={onBack}><ArrowLeft size={21} />返回上一步</button><span>整理检查结果，继续临床诊断</span><button type="button" className="four-next" onClick={onNext}>进入诊断<ArrowRight size={22} /></button></footer>
    {viewingReport && <AuxiliaryReportViewer title={activeItem.label} report={report} onClose={() => setViewingReport(false)} />}
  </section>
}
