import type { PlanNode } from '../models/plan'

function parseDate(value: string): number | null {
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(time) ? null : time
}

/**
 * 自身の目標日、またはそれを後続とする最近接の目標日を返す（未設定の場合は '9999-99-99'）。
 */
function nearestEffectiveDate(nodeId: string, nodesById: Map<string, PlanNode>, successors: Map<string, string[]>): string {
  const visited = new Set<string>()
  const resolve = (id: string): string => {
    const current = nodesById.get(id)
    if (current && parseDate(current.targetDate) !== null) return current.targetDate
    if (visited.has(id)) return '9999-99-99'
    visited.add(id)
    const nextDates = (successors.get(id) ?? []).map(resolve).filter((d) => d !== '9999-99-99')
    return nextDates.length > 0 ? nextDates.sort()[0] : '9999-99-99'
  }
  return resolve(nodeId)
}

export function actionableGoalIds(nodes: PlanNode[]): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const successors = new Map<string, string[]>()
  nodes.forEach((node) => node.dependsOn.forEach((id) => {
    if (nodesById.has(id)) successors.set(id, [...(successors.get(id) ?? []), node.id])
  }))

  return nodes
    .filter((node) => node.status === 'not_started' && node.goalLevel !== 'loop')
    .filter((node) => node.dependsOn
      .every((id) => nodesById.get(id)?.status === 'completed'))
    .sort((left, right) => {
      const leftDate = nearestEffectiveDate(left.id, nodesById, successors)
      const rightDate = nearestEffectiveDate(right.id, nodesById, successors)
      return leftDate.localeCompare(rightDate) || nodes.indexOf(left) - nodes.indexOf(right)
    })
    .slice(0, 3)
    .map((node) => node.id)
}

export function relatedNodeIds(nodes: PlanNode[], startId: string): Set<string> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const successors = new Map<string, string[]>()
  nodes.forEach((node) => node.dependsOn.forEach((id) => {
    if (nodesById.has(id)) successors.set(id, [...(successors.get(id) ?? []), node.id])
  }))

  const related = new Set<string>([startId])
  const visit = (first: string, next: (id: string) => string[]) => {
    const pending = [first]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const id = pending.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      related.add(id)
      pending.push(...next(id))
    }
  }
  visit(startId, (id) => nodesById.get(id)?.dependsOn.filter((candidate) => nodesById.has(candidate)) ?? [])
  visit(startId, (id) => successors.get(id) ?? [])
  return related
}

export function collapsibleCompletedIds(nodes: PlanNode[]): Set<string> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const visible = new Set<string>()

  nodes.filter((node) => node.status !== 'completed').forEach((node) => {
    const pending = node.dependsOn.map((id) => ({ id, distance: 1 }))
    const visited = new Map<string, number>()
    while (pending.length > 0) {
      const current = pending.pop()!
      if ((visited.get(current.id) ?? Infinity) <= current.distance) continue
      visited.set(current.id, current.distance)
      const dependency = nodesById.get(current.id)
      if (!dependency) continue
      if (current.distance <= 2 || dependency.status !== 'completed') visible.add(current.id)
      pending.push(...dependency.dependsOn.map((id) => ({ id, distance: current.distance + 1 })))
    }
  })

  return new Set(nodes
    .filter((node) => node.status === 'completed' && !visible.has(node.id))
    .map((node) => node.id))
}

/**
 * 1つの目標にぶら下がる前提目標が`limit`件を超えたとき、優先度の低いものを返す。
 *
 * 優先度は「未着手が先」「目標日が新しいものが先（未設定は新しい扱い）」
 * 「あとから登録したものが先」の順で決める。
 *
 * 終端目標から上位`limit`件（および未着手を含む枝）だけをたどり、
 * 到達しなかった達成済みの前提目標とその上流をまとめて省略対象にする。
 */
export function overflowingPrerequisiteIds(nodes: PlanNode[], limit = 3): Set<string> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const orderById = new Map(nodes.map((node, index) => [node.id, index]))
  const successors = new Map<string, string[]>()
  nodes.forEach((node) => node.dependsOn.forEach((id) => {
    if (nodesById.has(id)) successors.set(id, [...(successors.get(id) ?? []), node.id])
  }))

  const uncompletedUpstream = new Map<string, boolean>()
  const hasUncompletedUpstream = (id: string, visiting = new Set<string>()): boolean => {
    if (uncompletedUpstream.has(id)) return uncompletedUpstream.get(id)!
    const current = nodesById.get(id)
    if (!current || visiting.has(id)) return false
    if (current.status !== 'completed') {
      uncompletedUpstream.set(id, true)
      return true
    }
    visiting.add(id)
    const result = current.dependsOn.some((depId) => hasUncompletedUpstream(depId, visiting))
    visiting.delete(id)
    uncompletedUpstream.set(id, result)
    return result
  }

  const byPriority = (left: PlanNode, right: PlanNode): number => {
    const completed = Number(left.status === 'completed') - Number(right.status === 'completed')
    if (completed !== 0) return completed

    const leftDate = parseDate(left.targetDate)
    const rightDate = parseDate(right.targetDate)
    if (leftDate !== rightDate) {
      if (leftDate === null) return -1
      if (rightDate === null) return 1
      return rightDate - leftDate
    }

    return (orderById.get(right.id) ?? 0) - (orderById.get(left.id) ?? 0)
  }

  const terminals = nodes.filter((node) => (successors.get(node.id) ?? []).length === 0)
  const pending = (terminals.length > 0 ? terminals : nodes).map((node) => node.id)
  const keep = new Set<string>()

  while (pending.length > 0) {
    const id = pending.pop()!
    if (keep.has(id)) continue
    keep.add(id)
    const parent = nodesById.get(id)
    if (!parent) continue
    const children = parent.dependsOn
      .map((depId) => nodesById.get(depId))
      .filter((node): node is PlanNode => Boolean(node))
    const keptChildren = children.length <= limit
      ? children
      : [...children].sort(byPriority).filter((child, idx) => idx < limit || hasUncompletedUpstream(child.id))
    keptChildren.forEach((child) => pending.push(child.id))
  }

  return new Set(nodes.filter((node) => !keep.has(node.id)).map((node) => node.id))
}

export {
  insertPlanNode,
  reduceRedundantDependencies,
  swapNodesOnEdge,
} from './planNodeOperations.ts'

