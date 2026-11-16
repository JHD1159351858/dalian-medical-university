import { getStudentIdentity, RecordsError } from './studentSession'
import type { EncounterList, EncounterRecord } from './types'

async function request(owner: string, path: string, record?: EncounterRecord) {
  const identity = await getStudentIdentity()
  if (!identity || identity.userId !== owner) throw new RecordsError('请先登录后查看和保存自己的接诊记录。', 401)
  const response = await fetch(path, {
    method: record ? 'PUT' : 'GET',
    headers: { authorization: `Bearer ${identity.token}`, ...(record ? { 'content-type': 'application/json' } : {}) },
    ...(record ? { body: JSON.stringify(record) } : {}),
  })
  if (!response.ok) {
    const failure: { error?: unknown } | null = await response.json().catch(() => null)
    throw new RecordsError(typeof failure?.error === 'string' ? failure.error : '接诊记录暂时无法同步，请重试。', response.status)
  }
  return response
}

export async function saveEncounter(owner: string, record: EncounterRecord): Promise<void> {
  await request(owner, '/api/encounters', record)
}

export async function listEncounters(owner: string, offset = 0): Promise<EncounterList> {
  const response = await request(owner, `/api/encounters?offset=${offset}`)
  return response.json() as Promise<EncounterList>
}

export async function loadEncounter(owner: string, id: string): Promise<EncounterRecord> {
  const response = await request(owner, `/api/encounters?id=${encodeURIComponent(id)}`)
  const data: { record: EncounterRecord } = await response.json()
  return data.record
}
