import { physicalExamItems } from './examData'

export function updateOrderedExamIds(current: string[], selected: string[], locked: string[], items: Array<{ id: string }> = physicalExamItems): string[] {
  const kept = current.filter((id) => locked.includes(id) || selected.includes(id))
  const added = items.map((item) => item.id).filter((id) => selected.includes(id) && !current.includes(id))
  return [...kept, ...added]
}

export function getAvailableExamReports(orderedIds: string[], completedIds: string[]) {
  return physicalExamItems.filter((item) => orderedIds.includes(item.id) && completedIds.includes(item.id))
}

export function getOrderedExamReports<T extends { id: string }>(orderedIds: string[], items: T[]): T[]
export function getOrderedExamReports(orderedIds: string[]): typeof physicalExamItems
export function getOrderedExamReports(orderedIds: string[], items: Array<{ id: string }> = physicalExamItems) {
  return orderedIds.flatMap(id => items.find(item => item.id === id) ?? [])
}
