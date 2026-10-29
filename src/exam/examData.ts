export type ExamInstrument = 'monitor' | 'neck-lamp' | 'inspection-lamp' | 'body-scale' | 'respiratory' | 'ecg' | 'neuro' | 'edema' | 'abdomen' | 'percussion' | 'stethoscope'
export type ExamFieldKind = 'number' | 'choice' | 'text'
export type ExamValues = Record<string, string | string[] | undefined>

export interface ExamField {
  id: string
  label: string
  kind: ExamFieldKind
  answer: string
  points: number
  options?: string[]
  placeholder?: string
}

export interface PhysicalExamItem {
  id: string
  label: string
  hint: string
  instrument: ExamInstrument
  report: string
  fields: ExamField[]
  maxScore: 2
}

export interface ExamItemScore {
  score: number
  maxScore: 2
  completed: boolean
  fieldScores: Record<string, number>
}

const choice = (id: string, label: string, answer: string, points: number, options: string[]): ExamField => ({ id, label, kind: 'choice', answer, points, options })
const number = (id: string, label: string, answer: string, points: number, placeholder?: string): ExamField => ({ id, label, kind: 'number', answer, points, placeholder })

export const physicalExamItems: PhysicalExamItem[] = [
  {
    id: 'vitals', label: '基本生命体征', hint: '读取床旁监护仪上的体温、脉搏、呼吸和血压', instrument: 'monitor', report: '体温 37.5℃；脉搏 118 次/分；呼吸 32 次/分；血压 149/92 mmHg。', maxScore: 2,
    fields: [number('temperature', '体温（℃）', '37.5', .5, '例如 37.5'), number('pulse', '脉搏（次/分）', '118', .5), number('respiration', '呼吸（次/分）', '32', .5), number('bloodPressure', '血压（mmHg）', '149/92', .5, '例如 149/92')],
  },
  {
    id: 'nodes', label: '锁骨上淋巴结', hint: '使用颈部检查灯和触诊传感器完成双侧检查', instrument: 'neck-lamp', report: '双侧锁骨上未触及淋巴结肿大。', maxScore: 2,
    fields: [choice('enlargement', '淋巴结肿大', '未及淋巴结肿大', 1, ['未及淋巴结肿大', '左侧肿大', '右侧肿大']), choice('tenderness', '压痛', '无压痛', 1, ['无压痛', '有压痛'])],
  },
  {
    id: 'skin', label: '皮肤及巩膜', hint: '打开检查灯，观察皮肤、手掌和巩膜颜色', instrument: 'inspection-lamp', report: '全身皮肤无黄染，皮肤散在大片白色色素沉着，无肝掌、蜘蛛痣。巩膜无黄染。', maxScore: 2,
    fields: [choice('jaundice', '皮肤黄染', '无黄染', .4, ['无黄染', '有黄染']), choice('pigment', '色素改变', '散在大片白色色素沉着', .4, ['无明显改变', '散在大片白色色素沉着']), choice('liverPalm', '肝掌', '无肝掌', .4, ['无肝掌', '有肝掌']), choice('spider', '蜘蛛痣', '无蜘蛛痣', .4, ['无蜘蛛痣', '有蜘蛛痣']), choice('sclera', '巩膜', '无黄染', .4, ['无黄染', '黄染'])],
  },
  {
    id: 'nutrition', label: '营养状态', hint: '观察患者体型、营养状态、面容和意识', instrument: 'body-scale', report: '中等，体型肥胖，急性面容，神志清楚。', maxScore: 2,
    fields: [choice('nutrition', '营养状态', '中等', .5, ['消瘦', '中等', '肥胖']), choice('body', '体型', '肥胖', .5, ['消瘦', '正常', '肥胖']), choice('face', '面容', '急性面容', .5, ['无特殊面容', '急性面容']), choice('consciousness', '意识', '神志清楚', .5, ['神志清楚', '意识模糊'])],
  },
  {
    id: 'respiration', label: '呼吸', hint: '启动呼吸监测仪并完成双肺听诊', instrument: 'respiratory', report: '胸部无畸形，呼吸运动正常，肋间隙无增宽，呼吸频率增快；双肺呼吸音粗，未闻及明显干湿啰音。', maxScore: 2,
    fields: [choice('rate', '呼吸频率', '呼吸频率增快', .7, ['正常', '呼吸频率增快', '呼吸频率减慢']), choice('sound', '呼吸音', '双肺呼吸音粗', .7, ['正常', '双肺呼吸音粗', '呼吸音减弱']), choice('rales', '干湿啰音', '未闻及明显干湿啰音', .6, ['未闻及明显干湿啰音', '闻及干啰音', '闻及湿啰音'])],
  },
  {
    id: 'heart', label: '心律', hint: '连接心电图并使用听诊器确认心率和心音', instrument: 'ecg', report: '心率 118 次/分，律齐，各瓣膜区未闻及异常杂音，无心包摩擦感。', maxScore: 2,
    fields: [number('rate', '心率（次/分）', '118', .8), choice('rhythm', '节律', '律齐', .4, ['律齐', '律不齐']), choice('murmur', '瓣膜区杂音', '无异常杂音', .4, ['无异常杂音', '有异常杂音']), choice('rub', '心包摩擦感', '无心包摩擦感', .4, ['无心包摩擦感', '有心包摩擦感'])],
  },
  {
    id: 'neuro', label: '神经系统', hint: '使用神经反射检查工具完成肌力和肌张力检查', instrument: 'neuro', report: '肌力、肌张力正常。', maxScore: 2,
    fields: [choice('strength', '肌力', '正常', 1, ['正常', '减弱']), choice('tone', '肌张力', '正常', 1, ['正常', '增高', '降低'])],
  },
  {
    id: 'limbs', label: '下肢', hint: '点击双侧下肢并使用水肿检查仪按压', instrument: 'edema', report: '双下肢无水肿，无静脉显露。', maxScore: 2,
    fields: [choice('edema', '下肢水肿', '双下肢无水肿', 1, ['双下肢无水肿', '双下肢水肿', '左侧水肿', '右侧水肿']), choice('veins', '静脉显露', '无静脉显露', 1, ['无静脉显露', '有静脉显露'])],
  },
  {
    id: 'inspection', label: '腹部视触诊', hint: '观察腹部外形后，使用九区触诊板完成检查', instrument: 'abdomen', report: '全腹膨隆，无胃肠型及蠕动波，腹肌略紧张，左上腹压痛明显，无反跳痛，肝脾肋下未及，Murphy 征阴性。', maxScore: 2,
    fields: [choice('distension', '腹部外形', '全腹膨隆', .3, ['平坦', '全腹膨隆']), choice('pattern', '胃肠型及蠕动波', '无胃肠型及蠕动波', .25, ['无胃肠型及蠕动波', '可见胃肠型', '可见蠕动波']), choice('guarding', '腹肌', '腹肌略紧张', .2, ['腹肌柔软', '腹肌略紧张']), choice('tenderness', '压痛', '左上腹压痛明显', .4, ['无压痛', '左上腹压痛明显', '全腹压痛']), choice('rebound', '反跳痛', '无反跳痛', .25, ['无反跳痛', '有反跳痛']), choice('organ', '肝脾', '肝脾肋下未及', .3, ['肝脾肋下未及', '肝脾肋下可及']), choice('murphy', 'Murphy 征', '阴性', .3, ['阴性', '阳性'])],
  },
  {
    id: 'percussion', label: '腹部叩诊', hint: '使用虚拟叩诊锤检查腹部各区域', instrument: 'percussion', report: '腹部叩诊呈鼓音，肝肾区无叩痛，无移动性浊音。', maxScore: 2,
    fields: [choice('sound', '叩诊音', '鼓音', .8, ['鼓音', '浊音']), choice('costovertebral', '肝肾区叩痛', '无叩痛', .6, ['无叩痛', '有叩痛']), choice('fluid', '移动性浊音', '无移动性浊音', .6, ['无移动性浊音', '有移动性浊音'])],
  },
  {
    id: 'bowel', label: '肠鸣音', hint: '使用听诊器完成 30 秒听诊并读取频率', instrument: 'stethoscope', report: '肠鸣音减弱，2 次/分。', maxScore: 2,
    fields: [choice('strength', '音响强弱', '减弱', 1, ['正常', '减弱', '亢进']), number('count', '频率（次/分）', '2', 1)],
  },
]

function isBlank(value: string | string[] | undefined): boolean {
  return value === undefined || (Array.isArray(value) ? value.length === 0 : value.trim() === '')
}

function matches(field: ExamField, value: string | string[]): boolean {
  const actual = Array.isArray(value) ? value.join(',') : value.trim()
  if (field.kind === 'number') {
    const expectedNumber = Number(field.answer)
    return Number.isFinite(expectedNumber) ? Number(actual) === expectedNumber : actual === field.answer
  }
  return actual === field.answer
}

export function scoreExamItem(item: PhysicalExamItem, values: ExamValues): ExamItemScore {
  const fieldScores: Record<string, number> = {}
  let score = 0
  for (const field of item.fields) {
    const value = values[field.id]
    const fieldScore = !isBlank(value) && matches(field, value as string | string[]) ? field.points : 0
    fieldScores[field.id] = fieldScore
    score += fieldScore
  }
  const completed = item.fields.every((field) => !isBlank(values[field.id]))
  return { score, maxScore: item.maxScore, completed, fieldScores }
}

export function scoreExamSession(values: Record<string, ExamValues>) {
  return physicalExamItems.reduce((summary, item) => {
    const result = scoreExamItem(item, values[item.id] ?? {})
    return { score: summary.score + result.score, maxScore: summary.maxScore + item.maxScore, completed: summary.completed + (result.completed ? 1 : 0) }
  }, { score: 0, maxScore: 0, completed: 0 })
}
