import { useMemo, useState } from 'react'
import { ArrowLeft, Check, ClipboardList, FileText, RotateCcw, Stethoscope } from 'lucide-react'
import { PatientPortrait } from '../exam/ExamScene'
import { clinicalModules, moduleItems, type ClinicalItem, type ClinicalModuleId } from './caseData'
import { FourDiagnosisPage, type FourDiagnosisPageProps } from './FourDiagnosisPage'
import { AuxiliaryExamPage, type AuxiliaryExamPageProps } from './AuxiliaryExamPage'
import { ClinicalDiagnosisPage, type ClinicalDiagnosisPageProps } from './ClinicalDiagnosisPage'
import { TreatmentPage, type TreatmentPageProps } from './TreatmentPage'

interface ClinicalModulePageProps {
  module: Exclude<ClinicalModuleId, 'diagnosis' | 'physicalExam'>
  onBack: () => void
  onNext: () => void
  onReset: () => void
  onNavigate?: (module: ClinicalModuleId) => void
  fourDiagnosis?: FourDiagnosisPageProps
  auxiliaryExam?: AuxiliaryExamPageProps
  clinicalDiagnosis?: ClinicalDiagnosisPageProps
  treatment?: TreatmentPageProps
}

const nextLabel: Record<ClinicalModulePageProps['module'], string> = {
  fourDiagnosis: '进入辅助检查',
  auxiliaryExam: '进入诊断',
  clinicalDiagnosis: '进入处置',
  treatment: '完成病例',
}

export function ClinicalModulePage({ module, onBack, onNext, onReset, onNavigate, fourDiagnosis, auxiliaryExam, clinicalDiagnosis, treatment }: ClinicalModulePageProps) {
  const [selected, setSelected] = useState(moduleItems[module][0]?.id ?? '')
  const [checked, setChecked] = useState<string[]>([])
  const items = moduleItems[module]
  const activeItem = useMemo(() => items.find((item) => item.id === selected) ?? items[0], [items, selected])
  const toggle = (item: ClinicalItem) => {
    setSelected(item.id)
    setChecked((current) => current.includes(item.id) ? current : [...current, item.id])
  }
  const moduleIndex = clinicalModules.findIndex((entry) => entry.id === module)

  if (module === 'fourDiagnosis' && fourDiagnosis) return <FourDiagnosisPage {...fourDiagnosis} />
  if (module === 'auxiliaryExam' && auxiliaryExam) return <AuxiliaryExamPage {...auxiliaryExam} />
  if (module === 'clinicalDiagnosis' && clinicalDiagnosis) return <ClinicalDiagnosisPage {...clinicalDiagnosis} />
  if (module === 'treatment' && treatment) return <TreatmentPage {...treatment} />

  return <section className="clinical-workspace" aria-label={`${clinicalModules[moduleIndex].label}训练台`}>
    <header className="clinical-topbar">
      <div className="clinical-brand"><span className="clinical-brand-mark"><Stethoscope size={19} /></span><div><strong>大连医科大学</strong><span>临床问诊实训</span></div></div>
      <div className="clinical-case-title"><span>OUTPATIENT · CASE 01</span><strong>{clinicalModules[moduleIndex].label}</strong><small>王旭 · 48 岁 · 门诊初诊</small></div>
      <div className="clinical-top-actions"><span className="clinical-online"><i /> 教学模拟环境</span><button type="button" className="clinical-reset" onClick={onReset}><RotateCcw size={14} /> 重置训练</button></div>
    </header>
    <div className="clinical-body">
      <aside className="clinical-rail">
        <div className="clinical-rail-caption">接诊流程 <span>CASE 01</span></div>
        <nav aria-label="病例模块">
          {clinicalModules.map((entry, index) => <button key={entry.id} type="button" className={`${entry.id === module ? 'is-active' : ''} ${index < moduleIndex ? 'is-done' : ''}`} onClick={() => onNavigate?.(entry.id)} disabled={!onNavigate}><b>{entry.short}</b><span>{entry.label}</span>{index < moduleIndex && <Check size={14} />}</button>)}
        </nav>
        <div className="clinical-rail-note"><ClipboardList size={16} /><span>已完成项目<strong>{checked.length} 项</strong></span></div>
      </aside>
      <main className="clinical-main">
        <div className="clinical-main-heading"><div><span>当前模块 · {String(moduleIndex + 1).padStart(2, '0')}</span><h1>{clinicalModules[moduleIndex].label}</h1></div><div className="clinical-progress"><i style={{ width: `${((moduleIndex + 1) / clinicalModules.length) * 100}%` }} /></div></div>
        <div className="clinical-content-grid">
          <section className="clinical-patient-stage">
            <div className="patient-stage-copy"><span>标准化病人</span><strong>王旭</strong><small>请根据病例完成本模块评估</small></div>
            <div className="clinical-patient-canvas"><PatientPortrait /></div>
            <div className="patient-stage-footer"><span>男 · 48 岁</span><span>意识清楚</span><span className="stage-live"><i />患者在场</span></div>
          </section>
          <section className="clinical-detail-panel">
            <div className="clinical-panel-kicker"><span>检查项目</span><b>{checked.length}/{items.length} 已记录</b></div>
            <div className="clinical-item-list">{items.map((item) => <button key={item.id} type="button" className={`clinical-item ${selected === item.id ? 'is-selected' : ''} ${checked.includes(item.id) ? 'is-checked' : ''}`} onClick={() => toggle(item)}><span className="clinical-item-index">{checked.includes(item.id) ? <Check size={15} /> : item.id === selected ? '●' : '○'}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><FileText size={15} /></button>)}</div>
            <div className="clinical-selected-result"><span>当前记录</span><strong>{activeItem?.label}</strong><p>{activeItem?.detail}</p><textarea aria-label="检查记录" placeholder="补充你的检查所见或判断…" /></div>
          </section>
        </div>
        <footer className="clinical-footer"><button type="button" className="clinical-back" onClick={onBack}><ArrowLeft size={16} /> 返回上一步</button><div><span>完成当前项目后继续下一模块</span><button type="button" className="clinical-next" onClick={onNext}>{nextLabel[module]} <ArrowLeft size={16} /></button></div></footer>
      </main>
      <aside className="clinical-summary">
        <div className="summary-heading"><span>患者信息</span><b>SP 01</b></div>
        <div className="summary-patient"><div className="summary-avatar"><span>王</span></div><div><strong>王旭</strong><span>48 岁 · 男</span><small>门诊初诊</small></div></div>
        <div className="summary-section"><span>病例摘要</span><p>医生我身体不舒服</p></div>
        <div className="summary-section"><span>模块记录</span>{checked.length ? checked.slice(-4).map((id) => <p className="summary-check" key={id}><Check size={13} />{items.find((item) => item.id === id)?.label}</p>) : <p className="summary-empty">完成项目后会显示在这里</p>}</div>
        <div className="summary-tip"><Stethoscope size={16} /><span>操作提示<strong>请选择左侧项目开始记录</strong></span></div>
      </aside>
    </div>
  </section>
}
