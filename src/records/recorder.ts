import type { EncounterRecord, EncounterSnapshot, SubmissionKind } from './types'

type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function createEncounterRecorder(save: (owner: string, record: EncounterRecord) => Promise<void>) {
  let owner: string | null = null
  let active: EncounterRecord | null = null
  const pending = new Map<string, { owner: string; record: EncounterRecord }>()
  let running: Promise<void> | null = null
  let storage: PendingStorage | null = null
  const cacheKey = (student: string) => `hospital.encounters.pending.v1:${student}`
  const cached = (student: string): EncounterRecord[] => {
    try {
      const value: unknown = JSON.parse(storage?.getItem(cacheKey(student)) ?? '[]')
      return Array.isArray(value) ? value.filter((record: unknown): record is EncounterRecord => Boolean(record && typeof record === 'object' && 'id' in record && typeof record.id === 'string' && 'snapshot' in record && 'submissions' in record && Array.isArray(record.submissions))) : []
    } catch { return [] }
  }
  const cache = (student: string, records: EncounterRecord[]) => {
    try {
      if (records.length) storage?.setItem(cacheKey(student), JSON.stringify(records))
      else storage?.removeItem(cacheKey(student))
    } catch { /* Cloud writes still proceed; pending records retain the leave-page guard. */ }
  }

  const queue = () => {
    if (active && owner) {
      pending.set(active.id, { owner, record: structuredClone(active) })
      cache(owner, [...cached(owner).filter((record) => record.id !== active!.id), structuredClone(active)])
    }
  }

  return {
    useStorage(value: PendingStorage | null) { storage = value },
    setOwner(next: string | null) {
      if (owner === next) return
      owner = next
      active = null
      pending.clear()
      if (owner) for (const record of cached(owner)) pending.set(record.id, { owner, record })
    },
    current: () => active,
    begin(snapshot: EncounterSnapshot) {
      if (!owner) return null
      if (active) return active
      active = {
        id: crypto.randomUUID(), caseId: 'wang-xu', patient: { name: '王旭', age: 48, sex: '男' },
        startedAt: new Date().toISOString(), endedAt: null, status: 'in_progress',
        snapshot: structuredClone(snapshot), submissions: [],
      }
      queue()
      return active
    },
    update(snapshot: EncounterSnapshot) {
      if (!active) return
      active = { ...active, snapshot: structuredClone(snapshot) }
      queue()
    },
    submit(kind: SubmissionKind, payload: Record<string, unknown>) {
      if (!active) return
      active = { ...active, submissions: [...active.submissions, { id: crypto.randomUUID(), kind, at: new Date().toISOString(), payload: structuredClone(payload) }] }
      queue()
    },
    finish(status: 'completed' | 'ended') {
      if (!active) return
      active = { ...active, status, endedAt: new Date().toISOString() }
      queue()
      active = null
    },
    hasPending: () => pending.size > 0,
    flush(): Promise<void> {
      if (running) return running
      running = (async () => {
        while (pending.size) {
          const [id, entry] = pending.entries().next().value!
          await save(entry.owner, entry.record)
          if (pending.get(id) === entry) pending.delete(id)
          cache(entry.owner, cached(entry.owner).filter((record) => record.id !== id || JSON.stringify(record) !== JSON.stringify(entry.record)))
        }
      })().finally(() => { running = null })
      return running
    },
  }
}
