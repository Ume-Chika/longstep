import type { NodeInsertion, PlanNode } from '../models/plan'

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

/**
 * 選択した道筋（fromNodeId -> toNodeId）の2つの目標の位置（前後関係・依存関係）を入れ替える。
 */
export function reduceRedundantDependencies(nodes: PlanNode[]): PlanNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const canReach = (startId: string, endId: string, visited = new Set<string>()): boolean => {
    if (startId === endId) return true
    visited.add(startId)
    const current = nodesById.get(startId)
    if (!current) return false
    return current.dependsOn.some((depId) => !visited.has(depId) && canReach(depId, endId, visited))
  }

  return nodes.map((node) => {
    const uniqueDeps = Array.from(new Set(node.dependsOn.filter((id) => id !== node.id && nodesById.has(id))))
    const cleaned = uniqueDeps.filter((u) => !uniqueDeps.some((v) => v !== u && canReach(v, u)))
    return cleaned.length === node.dependsOn.length ? node : { ...node, dependsOn: cleaned }
  })
}

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

  const updatedNodes = reduceRedundantDependencies(nodes.map((node) => {
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
  }))

  const indexA = updatedNodes.findIndex((n) => n.id === fromNodeId)
  const indexB = updatedNodes.findIndex((n) => n.id === toNodeId)
  if (indexA >= 0 && indexB >= 0) {
    const result = [...updatedNodes]
    ;[result[indexA], result[indexB]] = [result[indexB], result[indexA]]
    return result
  }

  return updatedNodes
}
