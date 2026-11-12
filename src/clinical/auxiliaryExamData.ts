import { biochemistryResults, bloodCountResults } from './auxiliaryLabResults'

export interface LaboratoryResult {
  label: string
  code?: string
  value: string
  unit: string
  flag?: 'H' | 'L' | 'N'
  reference?: string
}

// Findings come from case-extracted.txt; laboratory results and CT images use the supplied case materials.
export interface AuxiliaryReport {
  category: string
  title?: string
  findings?: string[]
  image?: { src: string; alt: string }
  values?: LaboratoryResult[]
  note?: string
}

export const auxiliaryReports: Record<string, AuxiliaryReport> = {
  ecg: { category: '功能检查', findings: ['窦性心率，窦速，心电轴不偏。'] },
  ultrasound: { category: '超声检查', findings: ['胰头、体肿胀伴回声改变（考虑胰腺炎）。', '脂肪肝，肝内钙化灶，胆囊壁略毛糙。', '右上腹腹膜后可见少量无回声区，腹腔少量积液。'] },
  'abdomen-ct': { category: '影像学检查', image: { src: '/auxiliary-exam-images/abdomen-ct.png', alt: '腹部 CT' }, findings: ['胰腺炎征象。', '脂肪肝。', '肝右叶钙化灶或胆管结石可能。', '腹腔、盆腔积液。'] },
  'chest-ct': { category: '影像学检查', image: { src: '/auxiliary-exam-images/chest-ct.png', alt: '胸部 CT' }, findings: ['双肺炎症，双侧胸腔积液，双下肺轻度不张。'] },
  enzymes: { category: '实验室检查', values: ['Lipase', 'AMY'].map((code) => biochemistryResults.find((entry) => entry.code === code)!) },
  blood: { category: '实验室检查', values: [...bloodCountResults, { label: '降钙素原', code: 'PCT（降钙素原）', value: '＞100', unit: 'ng/mL' }], note: '血常规数据按提供照片整理。降钙素原数值来自既有病例文本；血小板压积（PCT）与降钙素原（PCT）为不同检验项目。' },
  'liver-kidney': { category: '实验室检查', title: '生化检验报告 · 肝肾功能', values: biochemistryResults, note: '完整保留提供报告中的 26 项生化结果，包含肝肾功能、胰酶、心肌标志物和电解质。' },
}
