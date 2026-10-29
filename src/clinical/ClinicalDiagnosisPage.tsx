import { ArrowLeft, ArrowRight, Check, Circle, ClipboardList, FileText, Stethoscope } from 'lucide-react'
import { PatientPortrait } from '../exam/ExamScene'
import { clinicalModules, moduleItems, type ClinicalModuleId } from './caseData'

export interface ClinicalDiagnosisPageProps {
  records: Record<string, string>
  onRecordChange: (id: string, value: string) => void
  onBack: () => void
  onNext: () => void
  onNavigate: (module: ClinicalModuleId) => void
}

const placeholders: Record<string, string> = {
  primary: '填写主要诊断，并说明问诊、查体及辅助检查中的诊断依据…',
  secondary: '填写次要诊断、并存疾病或危险因素及相关依据…',
  tcm: '填写中医病名、证型，并结合望闻问切记录说明证候依据…',
  summary: '综合各项临床证据，整理诊断结论与仍需鉴别的问题…',
}

export function ClinicalDiagnosisPage({ records, onRecordChange, onBack, onNext, onNavigate }: ClinicalDiagnosisPageProps) {
  const items = moduleItems.clinicalDiagnosis
  const completed = items.filter((item) => records[item.id]?.trim()).length

  return <section className="clinical-diagnosis-workspace" aria-label="诊断训练台">
    <aside className="four-rail">
      <div className="four-rail-heading"><strong>接诊流程</strong><span>CASE 01</span></div>
      <nav aria-label="病例模块">{clinicalModules.map((module, index) => <button key={module.id} type="button" className={module.id === 'clinicalDiagnosis' ? 'is-active' : ''} aria-current={module.id === 'clinicalDiagnosis' ? 'step' : undefined} onClick={() => onNavigate(module.id)}><b>{module.short}</b><span>{module.label}</span>{index < 4 && <Check size={18} />}</button>)}</nav>
      <div className="four-rail-caption"><ClipboardList size={20} /><span>临床综合实训</span></div>
    </aside>

    <div className="clinical-diagnosis-main">
      <header className="four-heading"><div className="four-title"><h1>诊断</h1><p>临床判断 · 四诊合参</p></div><div className="four-patient-identity">王旭 <span>· 男 · 48 岁 · 门诊初诊</span></div><div className="four-progress"><span>{completed}/{items.length} 已填写</span><div role="progressbar" aria-label="诊断填写进度" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={completed}><i style={{ width: `${completed / items.length * 100}%` }} /></div></div></header>

      <div className="clinical-diagnosis-grid">
        {items.map((item, index) => <section key={item.id} className="clinical-diagnosis-card" aria-labelledby={`clinical-diagnosis-title-${item.id}`}>
          <header><span className="clinical-diagnosis-number">{String(index + 1).padStart(2, '0')}</span><h2 id={`clinical-diagnosis-title-${item.id}`}><label htmlFor={`clinical-diagnosis-input-${item.id}`}>{item.label}</label></h2><span className={`clinical-diagnosis-card-status${records[item.id]?.trim() ? ' is-complete' : ''}`}>{records[item.id]?.trim() ? <><Check size={15} />已填写</> : '待填写'}</span></header>
          <p>{item.detail}</p>
          <textarea id={`clinical-diagnosis-input-${item.id}`} aria-label={item.label} placeholder={placeholders[item.id]} value={records[item.id] ?? ''} onChange={(event) => onRecordChange(item.id, event.target.value)} />
        </section>)}
      </div>
    </div>

    <aside className="clinical-diagnosis-summary" aria-label="患者与诊断填写状态">
      <header className="clinical-diagnosis-summary-heading"><h2>当前患者</h2><span>SP 01</span></header>
      <section className="clinical-diagnosis-patient-card"><div className="clinical-diagnosis-patient-model"><PatientPortrait /></div><div className="clinical-diagnosis-patient-caption"><strong>王旭</strong><span>男 · 48 岁 · 门诊初诊</span><small><i />患者在场</small></div></section>
      <section className="clinical-diagnosis-summary-section"><h3>主诉</h3><p>油腻饮食后腹痛 2 天，加重伴呼吸困难 3 小时。</p></section>
      <section className="clinical-diagnosis-summary-section clinical-diagnosis-completion"><div><h3><FileText size={18} />诊断填写状态</h3><span>{completed}/{items.length}</span></div><ul>{items.map((item) => <li key={item.id} className={records[item.id]?.trim() ? 'is-complete' : ''}>{records[item.id]?.trim() ? <Check size={18} /> : <Circle size={18} />}<strong>{item.label}</strong><span>{records[item.id]?.trim() ? '已填写' : '待填写'}</span></li>)}</ul></section>
      <div className="clinical-diagnosis-tip"><Stethoscope size={20} /><p>结合问诊、四诊与检查结果，填写诊断及依据，完成后进入处置。</p></div>
    </aside>

    <footer className="four-footer"><button type="button" className="four-back" onClick={onBack}><ArrowLeft size={21} />返回上一步</button><span>完善诊断信息，继续制定处置方案</span><button type="button" className="four-next" onClick={onNext}>进入处置<ArrowRight size={22} /></button></footer>
  </section>
}
