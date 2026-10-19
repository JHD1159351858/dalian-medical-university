'use client';

import { ArrowLeft, RotateCcw, Stethoscope } from 'lucide-react';
import { caseData, type ClinicalModuleId } from './caseData';
import { createInitialTreatmentPlan, type TreatmentPlan } from './treatmentPlan';

interface ClinicalModulePageProps {
  module: 'physicalExam' | 'fourDiagnosis' | 'auxiliaryExam' | 'clinicalDiagnosis' | 'treatment';
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
  records?: Record<string, string>;
  onRecordChange?: (id: string, value: string) => void;
  plan?: TreatmentPlan;
  onPlanChange?: (plan: TreatmentPlan) => void;
}

const moduleConfig: Record<ClinicalModulePageProps['module'], { title: string; subtitle: string; fields: { id: string; label: string; placeholder: string }[] }> = {
  physicalExam: {
    title: '体格检查',
    subtitle: '视、触、叩、听，记录阳性体征与关键阴性体征。',
    fields: [
      { id: 'general', label: '一般情况', placeholder: '精神状态、体位、步态…' },
      { id: 'vitals', label: '生命体征', placeholder: '体温、脉搏、呼吸、血压…' },
      { id: 'abdominal', label: '腹部检查', placeholder: '视诊、触诊、叩诊、听诊…' },
      { id: 'respiratory', label: '呼吸系统', placeholder: '胸廓、呼吸音、叩诊…' },
    ],
  },
  fourDiagnosis: {
    title: '中医四诊',
    subtitle: '望、闻、问、切，收集辨证资料。',
    fields: [
      { id: 'inspection', label: '望诊', placeholder: '神色、形态、舌象…' },
      { id: 'auscultation', label: '闻诊', placeholder: '声音、气味…' },
      { id: 'inquiry', label: '问诊', placeholder: '寒热、汗出、饮食、二便…' },
      { id: 'palpation', label: '切诊', placeholder: '脉象、按诊…' },
    ],
  },
  auxiliaryExam: {
    title: '辅助检查',
    subtitle: '根据病情需要，选择并记录辅助检查。',
    fields: [
      { id: 'lab', label: '实验室检查', placeholder: '血常规、生化、淀粉酶…' },
      { id: 'imaging', label: '影像学检查', placeholder: '超声、CT、MRI…' },
      { id: 'ecg', label: '心电图', placeholder: '心率、心律、ST-T 改变…' },
      { id: 'others', label: '其他检查', placeholder: '其他特殊检查…' },
    ],
  },
  clinicalDiagnosis: {
    title: '临床诊断',
    subtitle: '根据病史、查体与辅助检查，形成诊断思路。',
    fields: [
      { id: 'primary', label: '主要诊断', placeholder: '首要考虑的诊断…' },
      { id: 'differential', label: '鉴别诊断', placeholder: '需要鉴别的疾病…' },
      { id: 'basis', label: '诊断依据', placeholder: '支持诊断的关键点…' },
      { id: 'plan', label: '进一步处理', placeholder: '下一步检查或处理…' },
    ],
  },
  treatment: {
    title: '处置方案',
    subtitle: '制定治疗与护理计划。',
    fields: [
      { id: 'nursing', label: '护理', placeholder: '护理级别与要点…' },
      { id: 'diet', label: '饮食及营养', placeholder: '禁食、流质、营养支持…' },
      { id: 'monitoring', label: '监测及支持', placeholder: '生命体征监测、补液…' },
      { id: 'medication', label: '药物治疗', placeholder: '药物名称、剂量、用法…' },
    ],
  },
};

export default function ClinicalModulePage({
  module,
  onBack,
  onNext,
  onReset,
  records = {},
  onRecordChange,
  plan,
  onPlanChange,
}: ClinicalModulePageProps) {
  const config = moduleConfig[module];

  return (
    <section className="clinical-module-page flex min-h-screen flex-col bg-[#e9f1f2] text-[#173d49]">
      <header className="clinical-header flex items-center justify-between border-b border-[#d4e4e6] bg-white px-6 py-4">
        <button className="text-button inline-flex items-center gap-2 text-sm text-[#19758a] hover:text-[#0d4d66]" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={17} /> 返回
        </button>
        <div className="clinical-title text-center">
          <span className="block text-xs tracking-widest text-[#70878f]">CASE 01 · {module.toUpperCase()}</span>
          <strong className="block text-lg">{config.title}</strong>
        </div>
        <div className="clinical-actions flex items-center gap-3">
          <button className="text-button danger-button inline-flex items-center gap-1.5 text-sm text-[#a64747] hover:text-[#7a3535]" type="button" onClick={onReset}>
            <RotateCcw aria-hidden="true" size={16} /> 重置训练
          </button>
        </div>
      </header>

      <div className="clinical-workspace mx-auto grid w-full max-w-6xl flex-1 gap-6 p-6 lg:grid-cols-[300px_1fr]">
        <aside className="patient-summary rounded-xl border border-[#d4e4e6] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#dceff1] text-sm font-bold text-[#19758a]">SP</span>
            <div>
              <strong className="block">{caseData.patient.name}，{caseData.patient.age} 岁</strong>
              <span className="text-xs text-[#70878f]">{caseData.patient.sex} · {caseData.patient.occupation}</span>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-[#70878f]">主诉</span>
              <p className="mt-0.5">{caseData.chiefComplaint}</p>
            </div>
            <div>
              <span className="text-xs text-[#70878f]">现病史</span>
              <p className="mt-0.5 line-clamp-6 text-[#70878f]">{caseData.presentIllness}</p>
            </div>
          </div>
        </aside>

        <main className="clinical-form rounded-xl border border-[#d4e4e6] bg-white p-6 shadow-sm">
          <h1 className="font-serif text-2xl font-semibold text-[#0d4d66]">{config.title}</h1>
          <p className="mt-1 text-sm text-[#70878f]">{config.subtitle}</p>

          <div className="mt-6 grid gap-5">
            {config.fields.map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="mb-1.5 block text-sm font-semibold text-[#234865]">{field.label}</label>
                <textarea
                  id={field.id}
                  rows={3}
                  value={records[field.id] ?? ''}
                  onChange={(event) => onRecordChange?.(field.id, event.target.value)}
                  placeholder={field.placeholder}
                  className="w-full resize-none rounded-lg border border-[#cfe5f3] bg-white px-3 py-2 text-sm text-[#2b526e] placeholder:text-[#94a7bb] focus:border-[#19758a] focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end gap-3 border-t border-[#d4e4e6] pt-5">
            <button type="button" onClick={onBack} className="rounded-lg border border-[#d4e4e6] bg-white px-5 py-2 text-sm text-[#70878f] hover:bg-[#eef6f6]">返回</button>
            <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-lg bg-[#0d4d66] px-5 py-2 text-sm text-white hover:bg-[#19758a]">
              <Stethoscope aria-hidden="true" size={15} /> 下一步
            </button>
          </div>
        </main>
      </div>
    </section>
  );
}
