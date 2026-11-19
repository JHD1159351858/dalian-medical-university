export function patientModelUrl(caseId = 'wang-xu') {
  return caseId === 'wang-xu' ? '/models/patient.glb' : `/models/patients/${encodeURIComponent(caseId)}.glb`;
}
