export type PatientVoiceProfile = {
  patientId: string
  voiceId: string
  speed: number
  contextText?: string
}

// Use the same delivery in the opening, examination and interview; the transcript stays verbatim.
const conversation = '像面对面回答医生一样，按意思把词连起来说，在换意时稍停。只说原文。'

export const PATIENT_VOICE_PROFILE: PatientVoiceProfile = {
  patientId: 'case-01-wang-xu',
  voiceId: '7568423452617588790',
  speed: 0.94,
  contextText: '48岁男性，声线沉稳。腹痛不适时声音略收紧，普通回答放松些，请求帮助时语气放轻。' + conversation,
}

const caseVoices: Record<string, Omit<PatientVoiceProfile, 'patientId'>> = {
  'lin-yue': {
    voiceId: '7620288417930297386', speed: 0.96,
    contextText: '28岁女性，声音轻柔。说到右边肋骨下疼时语气略紧，其他回答自然平稳。' + conversation,
  },
  'chen-yang': {
    voiceId: '7568423452617506870', speed: 1.03,
    contextText: '23岁男性，说话直接。下腹不适让他回答时略有停顿，尽量把话说清。' + conversation,
  },
  'zhou-ning': {
    voiceId: '7568423452617572406', speed: 0.98,
    contextText: '32岁女性，声音稍轻，把自己的情况说清楚。提到不舒服的感觉时略微放慢，句尾轻轻落下。' + conversation,
  },
  'zhao-hang': {
    voiceId: '7568423452617637942', speed: 1.01,
    contextText: '21岁男性，直接、坦率。腹痛起伏时语气短促，间歇能平稳交谈。' + conversation,
  },
  'sun-lan': {
    voiceId: '7568423452617670710', speed: 0.93,
    contextText: '62岁女性，嗓音温和，提到腰腹疼痛时声音略收紧，按短语自然停顿。' + conversation,
  },
}

export function getPatientVoiceProfile(patient: { id: string; age: number; sex: string; chiefComplaint: string }): PatientVoiceProfile {
  if (patient.id === 'wang-xu') return PATIENT_VOICE_PROFILE
  const voice = caseVoices[patient.id] ?? {
    voiceId: '', speed: 0.98,
    contextText: `用${patient.age}岁${patient.sex}性患者平常说话的声音。` + conversation,
  }
  return { patientId: patient.id, ...voice }
}

// Device voices expose a display name and locale, but no gender or quality fields.
const maleVoice = /yun(?:yang|jian|xi|xia)|云[扬健希夏]|kangkang|康康/i
const femaleVoice = /xiao(?:yi|xiao|zhen|rui|mo)|[晓曉][伊晓曉臻睿墨]|ting.?ting|婷婷|huihui|慧慧|yaoyao|瑶瑶/i
const deviceVoiceNames: Record<string, [RegExp, RegExp]> = {
  'case-01-wang-xu': [maleVoice, /yunyang|云扬/i],
  'chen-yang': [maleVoice, /yunjian|云健/i],
  'zhao-hang': [maleVoice, /yunxi|云希/i],
  'lin-yue': [femaleVoice, /xiaoyi|晓伊/i],
  'zhou-ning': [femaleVoice, /xiaoxiao|晓晓/i],
  'sun-lan': [femaleVoice, /xiaorui|晓睿/i],
}

export function selectMandarinVoice(voices: SpeechSynthesisVoice[], patientId?: string): SpeechSynthesisVoice | undefined {
  const preferred = deviceVoiceNames[patientId ?? '']
  const mandarin = voices.filter(({ lang }) => /^(?:cmn|zh(?:$|[-_](?:cn|sg|hans|tw)|[-_]hant(?:$|[-_]tw)))/i.test(lang))
  const score = (voice: SpeechSynthesisVoice) =>
    (preferred?.[0].test(voice.name) ? 16 : 0) +
    (/natural|neural|premium|enhanced|自然|神经|优质|高品质/i.test(voice.name) ? 4 : 0) +
    (preferred?.[1].test(voice.name) ? 2 : 0) +
    (/[-_](?:cn|hans|sg)\b/i.test(voice.lang) ? 1 : 0) +
    Number(voice.default)
  return mandarin.sort((a, b) => score(b) - score(a))[0]
}
