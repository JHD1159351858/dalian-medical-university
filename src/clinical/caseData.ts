export type ClinicalModuleId = 'diagnosis' | 'physicalExam' | 'fourDiagnosis' | 'auxiliaryExam' | 'clinicalDiagnosis' | 'treatment'

export interface ClinicalItem { id: string; label: string; detail: string; result?: string }

export const CASE_CHIEF_COMPLAINT = '左上腹痛'
// 王旭原病例记载「舌红苔黄燥腻」，选用资料中的黄腻苔作为固定教学配图。
export const CASE_TONGUE_SAMPLE_ID = 'tongue-10'
export const PATIENT_OPENING = `医生，我${CASE_CHIEF_COMPLAINT}，您帮我看看。`

export const clinicalModules: Array<{ id: ClinicalModuleId; label: string; short: string }> = [
  { id: 'diagnosis', label: '问诊', short: '01' },
  { id: 'physicalExam', label: '体格检查', short: '02' },
  { id: 'fourDiagnosis', label: '中医四诊', short: '03' },
  { id: 'auxiliaryExam', label: '辅助检查', short: '04' },
  { id: 'clinicalDiagnosis', label: '诊断', short: '05' },
  { id: 'treatment', label: '处置', short: '06' },
]

export const moduleItems: Record<Exclude<ClinicalModuleId, 'diagnosis' | 'physicalExam'>, ClinicalItem[]> = {
  fourDiagnosis: [
    { id: 'look', label: '望诊', detail: '神色、形态、舌质与舌苔' },
    { id: 'listen', label: '闻诊', detail: '声音、呼吸与异常气味' },
    { id: 'ask', label: '问诊', detail: '寒热、汗出、饮食与二便' },
    { id: 'feel', label: '切诊', detail: '脉象与腹部按诊' },
    { id: 'summary', label: '四诊总结', detail: '整理中医证候依据' },
  ],
  auxiliaryExam: [
    { id: 'ecg', label: '心电图', detail: '心律、心率与心电轴', result: '已完成' },
    { id: 'ultrasound', label: '腹部 B 超', detail: '肝胆胰脾及双肾超声检查' },
    { id: 'abdomen-ct', label: '腹部 CT', detail: '评估腹部脏器与急腹症征象' },
    { id: 'chest-ct', label: '胸部 CT', detail: '排除胸部相关疾病' },
    { id: 'enzymes', label: '脂肪酶 / 淀粉酶', detail: '胰腺相关实验室检查' },
    { id: 'blood', label: '血常规 / PCT', detail: '感染与炎症指标' },
    { id: 'liver-kidney', label: '肝肾功能', detail: '评估脏器功能状态' },
  ],
  clinicalDiagnosis: [
    { id: 'primary', label: '西医主要诊断', detail: '根据问诊、查体和检查结果填写' },
    { id: 'secondary', label: '西医次要诊断', detail: '补充并存疾病或危险因素' },
    { id: 'tcm', label: '中医诊断', detail: '填写病名、证型与证候依据' },
    { id: 'summary', label: '诊断总结', detail: '形成完整临床判断' },
  ],
  treatment: [
    { id: 'nursing', label: '护理与观察', detail: '体位、禁食、疼痛与病情观察' },
    { id: 'nutrition', label: '饮食营养', detail: '饮食分级与营养支持' },
    { id: 'monitoring', label: '监测支持', detail: '生命体征、出入量与复查' },
    { id: 'intervention', label: '介入 / 手术', detail: '评估手术与介入治疗指征' },
    { id: 'tcm-treatment', label: '中医治疗', detail: '辨证施治、针灸或中药方案' },
    { id: 'medication', label: '药物治疗', detail: '填写药物、剂量与疗程' },
  ],
}
