export interface PatientInfo {
  name: string
  sex: string
  age: number
  maritalStatus: string
  occupation: string
  location: string
}

export interface CaseData {
  patient: PatientInfo
  chiefComplaint: string
  presentIllness: string
  history: string
  objectiveBoundary: string
}

export const caseData: CaseData = {
  patient: {
    name: '王旭',
    sex: '男',
    age: 48,
    maritalStatus: '已婚',
    occupation: '物流仓库工作人员',
    location: '大连金州',
  },
  chiefComplaint: '油腻饮食后腹痛2天，加重伴呼吸困难3小时。',
  presentIllness: '腹痛位于左上腹，程度重，不能缓解，无放射痛，伴腹胀。否认明显发热、恶心、呕吐、腹泻、便血、胸闷、胸痛、咳嗽、咳痰。曾至金州第一人民医院行腹部CT，提示急性胰腺炎；禁食和静脉补液后仍未缓解。',
  history: '2012年10月、2019年2月曾患胰腺炎。白癜风14年。否认高血压、糖尿病、心脏病、乙肝、结核；否认过敏史、手术史、外伤史、输血史。吸烟20余年，约1包/日，偶尔饮酒。',
  objectiveBoundary: '体温37.5℃仅供病情背景使用；患者不得在未被告知的情况下主动声称检查、化验或其他医学测量结果。',
}

export const PATIENT_OPENING = '医生，我身体不舒服。左上腹疼了两天，今天早上突然喘不过气，很难受。'

export type ClinicalModuleId = 'diagnosis' | 'physicalExam' | 'fourDiagnosis' | 'auxiliaryExam' | 'clinicalDiagnosis' | 'treatment'
