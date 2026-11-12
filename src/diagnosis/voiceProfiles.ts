export type PatientVoiceProfile = {
  patientId: string
  voiceId: string
  speed: number
  contextText?: string
}

export const PATIENT_VOICE_PROFILE: PatientVoiceProfile = {
  patientId: 'case-01-wang-xu',
  voiceId: '7568423452617588790', // 儒雅逸辰，支持语气指令的 2.0 男声。
  speed: 0.94,
  contextText: '以一位48岁男性患者的自然口语说话，音色沉稳。带轻度腹痛不适，语气略紧绷，句间适度停顿，咬字清楚；普通回答平静自然，谈到疼痛时稍显吃力。保持同一音色，不夸张呻吟、不哭腔，不添加喘息、咳嗽或额外词句。',
}
