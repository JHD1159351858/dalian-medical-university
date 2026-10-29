import { physicalExamItems } from './examData'

export function updateOrderedExamIds(current: string[], selected: string[], locked: string[]): string[] {
  const kept = current.filter((id) => locked.includes(id) || selected.includes(id))
  const added = physicalExamItems.map((item) => item.id).filter((id) => selected.includes(id) && !current.includes(id))
  return [...kept, ...added]
}

export function getAvailableExamReports(orderedIds: string[], completedIds: string[]) {
  return physicalExamItems.filter((item) => orderedIds.includes(item.id) && completedIds.includes(item.id))
}

export function getOrderedExamReports(orderedIds: string[]) {
  return orderedIds
    .map((id) => physicalExamItems.find((item) => item.id === id))
    .filter((item): item is (typeof physicalExamItems)[number] => Boolean(item))
}
