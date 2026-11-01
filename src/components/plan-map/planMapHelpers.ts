import type { NewPlanNodeInput, PlanNode } from '../../models/plan'

export const statusLabels = {
  not_started: '未着手',
  completed: '達成済み',
} as const

export const goalLevelLabels = {
  minor: '小目標',
  middle: '中目標',
  major: '大目標',
  loop: 'ループ',
} as const

export const goalLevelOptions = [
  ['minor', goalLevelLabels.minor],
  ['middle', goalLevelLabels.middle],
  ['major', goalLevelLabels.major],
  ['loop', goalLevelLabels.loop],
] as const

export function getStatusLabel(status: PlanNode['status']): string {
  return status === 'completed' ? statusLabels.completed : statusLabels.not_started
}

export function getNodeTypeIcon(node: PlanNode): { label: string; glyph: string } {
  if (node.goalLevel === 'loop' || node.recurrence?.enabled) {
    return { label: `繰り返し目標、${node.recurrence?.completedCount ?? 0}回達成`, glyph: '↻' }
  }
  if (node.goalLevel === 'major') return { label: goalLevelLabels.major, glyph: '◆' }
  if (node.goalLevel === 'minor') return { label: goalLevelLabels.minor, glyph: '·' }
  return { label: goalLevelLabels.middle, glyph: '✦' }
}

export function isActionableGoal(node: PlanNode, attention?: string): boolean {
  return node.status === 'not_started'
    && node.goalLevel !== 'loop'
    && (attention === 'focus' || attention === 'available')
}

export function todayIsoDate(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

export function defaultNewNodeInput(): NewPlanNodeInput {
  return {
    name: '新しい目標',
    targetDate: '',
    description: '',
    nextAction: '',
  }
}

export function formatDate(date: string): string {
  if (!date) return '期限未設定'
  const parsedDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return '日付未設定'

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}

export type NodeAttention = 'focus' | 'available' | 'upcoming' | 'distant' | 'completed' | 'completed-distant'

export function daysFromToday(date: string): number | null {
  if (!date) return null
  const target = Date.parse(`${date}T00:00:00Z`)
  const current = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(target) || Number.isNaN(current)) return null
  return Math.ceil((target - current) / 86_400_000)
}

export function formatRemainingDays(date: string): string {
  const days = daysFromToday(date)
  if (days === null) return '残り不明'
  if (days < 0) return `期限超過${Math.abs(days)}日`
  return `残り${days}日`
}

export function buildNodeAttention(nodes: PlanNode[], actionableIds: string[]): Map<string, NodeAttention> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map<string, string[]>()

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyId) => {
      if (!nodesById.has(dependencyId)) return
      adjacency.set(node.id, [...(adjacency.get(node.id) ?? []), dependencyId])
      adjacency.set(dependencyId, [...(adjacency.get(dependencyId) ?? []), node.id])
    })
  })

  const focusIds = actionableIds

  function distanceFromFocus(nodeId: string): number {
    if (focusIds.includes(nodeId)) return 0
    const queue = focusIds.map((id) => ({ id, distance: 0 }))
    const visited = new Set(focusIds)

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      for (const neighborId of adjacency.get(current.id) ?? []) {
        if (neighborId === nodeId) return current.distance + 1
        if (visited.has(neighborId)) continue
        visited.add(neighborId)
        queue.push({ id: neighborId, distance: current.distance + 1 })
      }
    }

    return Number.POSITIVE_INFINITY
  }

  return new Map(nodes.map((node) => {
    const graphDistance = distanceFromFocus(node.id)
    const dateDistance = daysFromToday(node.targetDate)

    if (node.status === 'completed') {
      const isFarAway = graphDistance >= 3 || (dateDistance !== null && dateDistance > 30)
      return [node.id, isFarAway ? 'completed-distant' : 'completed']
    }
    if (focusIds.includes(node.id)) return [node.id, 'focus']
    if (graphDistance >= 3 && (dateDistance === null || dateDistance > 45)) {
      return [node.id, 'distant']
    }
    return [node.id, 'upcoming']
  }))
}
