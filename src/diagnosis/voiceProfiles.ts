export type PatientVoiceProfile = {
  patientId: string
  voiceId: string
  speed: number
}

export const PATIENT_VOICE_PROFILE: PatientVoiceProfile = {
  patientId: 'case-01-wang-xu',
  voiceId: process.env.NEXT_PUBLIC_PATIENT_VOICE_ID || '7524987545197838355',
  speed: 0.95,
}
