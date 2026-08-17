import type { NodeInsertion, PlanNode } from '../models/plan'

const dayMs = 86_400_000

function parseDate(value: string): number | null {
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(time) ? null : time
}

export function effectiveTargetDate(
  node: PlanNode,
  nodesById: Map<string, PlanNode>,
  today = new Date().toISOString().slice(0, 10),
): { date: string; estimated: boolean } {
  const resolve = (current: PlanNode, visiting: Set<string>): { date: string; estimated: boolean } => {
    if (parseDate(current.targetDate) !== null) return { date: current.targetDate, estimated: false }
    if (visiting.has(current.id)) return { date: today, estimated: true }

    const nextVisiting = new Set(visiting).add(current.id)
    const dependencyDates = current.dependsOn
      .map((id) => nodesById.get(id))
      .filter((dependency): dependency is PlanNode => dependency !== undefined)
      .map((dependency) => parseDate(resolve(dependency, nextVisiting).date))
      .filter((date): date is number => date !== null)
    const base = dependencyDates.length > 0
      ? Math.max(...dependencyDates)
      : parseDate(today) ?? Date.now()

    return { date: new Date(base + dayMs).toISOString().slice(0, 10), estimated: true }
  }

  return resolve(node, new Set())
}

export function actionableGoalIds(nodes: PlanNode[], today?: string): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  return nodes
    .filter((node) => node.status === 'not_started' && node.goalLevel !== 'loop')
    .filter((node) => node.dependsOn
      .every((id) => nodesById.get(id)?.status === 'completed'))
    .sort((left, right) => {
      const leftDate = effectiveTargetDate(left, nodesById, today).date
      const rightDate = effectiveTargetDate(right, nodesById, today).date
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
    .filter((node) => node.status === 'completed' && node.goalLevel === 'minor' && !visible.has(node.id))
    .map((node) => node.id))
}

/**
 * 1つの目標にぶら下がる前提目標が`limit`件を超えたとき、優先度の低いものを返す。
 *
 * 優先度は「未着手が先」「目標日が新しいものが先（未設定は新しい扱い）」
 * 「あとから登録したものが先」の順で決める。
 *
 * 前提を持つ目標を隠すと、その先の目標が宙に浮いてしまうため、
 * 前提を持たない目標だけを対象にする。複数の目標にぶら下がっている場合は、
 * どこか1つでも上位に入っていれば表示したままにする。
 */
export function overflowingPrerequisiteIds(nodes: PlanNode[], limit = 3): Set<string> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const orderById = new Map(nodes.map((node, index) => [node.id, index]))
  const keep = new Set<string>()
  const candidates = new Set<string>()

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

  nodes.forEach((parent) => {
    const children = parent.dependsOn
      .map((id) => nodesById.get(id))
      .filter((node): node is PlanNode => Boolean(node))

    if (children.length <= limit) {
      children.forEach((child) => keep.add(child.id))
      return
    }

    const sorted = [...children].sort(byPriority)
    sorted.slice(0, limit).forEach((child) => keep.add(child.id))
    sorted.slice(limit).forEach((child) => {
      if (child.dependsOn.length > 0) keep.add(child.id)
      else candidates.add(child.id)
    })
  })

  return new Set([...candidates].filter((id) => !keep.has(id)))
}

export function insertPlanNode(nodes: PlanNode[], newNode: PlanNode, insertion?: NodeInsertion): PlanNode[] {
  if (!insertion) return [...nodes, newNode]

  if ('prerequisiteForId' in insertion) {
    const targetIndex = nodes.findIndex((node) => node.id === insertion.prerequisiteForId)
    const target = nodes[targetIndex]
    if (!target) throw new Error('追加対象の目標が見つかりませんでした。')
    const inserted = { ...newNode, dependsOn: [] }
    const nextNodes = [...nodes]
    nextNodes[targetIndex] = { ...target, dependsOn: [...target.dependsOn, inserted.id] }
    nextNodes.splice(targetIndex, 0, inserted)
    return nextNodes
  }

  const inserted = { ...newNode, dependsOn: [insertion.fromId] }
  const nextNodes = nodes.map((node) => !insertion.toFinal && node.id === insertion.toId
    ? {
        ...node,
        dependsOn: node.dependsOn.map((id) => id === insertion.fromId ? inserted.id : id),
      }
    : node)
  const targetIndex = insertion.toFinal
    ? nextNodes.length
    : nextNodes.findIndex((node) => node.id === insertion.toId)
  nextNodes.splice(targetIndex < 0 ? nextNodes.length : targetIndex, 0, inserted)
  return nextNodes
}

export function coversAtLeastHalfTarget(
  movingTop: number,
  movingBottom: number,
  targetTop: number,
  targetBottom: number,
): boolean {
  const targetHeight = targetBottom - targetTop
  const overlap = Math.max(0, Math.min(movingBottom, targetBottom) - Math.max(movingTop, targetTop))
  return targetHeight > 0 && overlap >= targetHeight / 2
}

export function swapNodesInColumn(
  nodes: PlanNode[],
  columnNodeIds: string[],
  draggedNodeId: string,
  targetNodeId: string,
): PlanNode[] {
  const draggedIndex = columnNodeIds.indexOf(draggedNodeId)
  const targetIndex = columnNodeIds.indexOf(targetNodeId)
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return nodes

  const nextIds = [...columnNodeIds]
  ;[nextIds[draggedIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[draggedIndex]]

  const columnIdSet = new Set(columnNodeIds)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  if (nextIds.some((id) => !nodeById.has(id))) return nodes

  let nextIndex = 0
  return nodes.map((node) => columnIdSet.has(node.id) ? nodeById.get(nextIds[nextIndex++])! : node)
}

/**
 * 選択した道筋（fromNodeId -> toNodeId）の2つの目標の位置（前後関係・依存関係）を入れ替える。
 */
export function swapNodesOnEdge(
  nodes: PlanNode[],
  fromNodeId: string,
  toNodeId: string,
): PlanNode[] {
  const fromNode = nodes.find((node) => node.id === fromNodeId)
  const toNode = nodes.find((node) => node.id === toNodeId)
  if (!fromNode || !toNode || !toNode.dependsOn.includes(fromNodeId)) {
    return nodes
  }

  const aPredecessors = fromNode.dependsOn.filter((id) => id !== toNodeId)
  const bPredecessors = toNode.dependsOn.filter((id) => id !== fromNodeId)

  const nextBDependsOn = Array.from(new Set([...bPredecessors, ...aPredecessors]))
  const nextADependsOn = [toNodeId]

  const updatedNodes = nodes.map((node) => {
    if (node.id === fromNodeId) {
      return { ...node, dependsOn: nextADependsOn }
    }
    if (node.id === toNodeId) {
      return { ...node, dependsOn: nextBDependsOn }
    }
    if (node.dependsOn.includes(toNodeId)) {
      const nextDepends = node.dependsOn.map((id) => id === toNodeId ? fromNodeId : id)
      return { ...node, dependsOn: Array.from(new Set(nextDepends)) }
    }
    return node
  })

  const indexA = updatedNodes.findIndex((n) => n.id === fromNodeId)
  const indexB = updatedNodes.findIndex((n) => n.id === toNodeId)
  if (indexA >= 0 && indexB >= 0) {
    const result = [...updatedNodes]
    ;[result[indexA], result[indexB]] = [result[indexB], result[indexA]]
    return result
  }

  return updatedNodes
}

