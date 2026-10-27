import type { PlanNode } from '../models/plan'
import { reduceRedundantDependencies } from '../components/planMapLogic'

export function createNodeId(nodes: PlanNode[]): string {
  const baseId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `node-${crypto.randomUUID()}`
    : `node-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const existingIds = new Set(nodes.map((node) => node.id))
  return existingIds.has(baseId) ? `${baseId}-new` : baseId
}

export function hasDependencyPath(nodes: PlanNode[], startNodeId: string, targetNodeId: string): boolean {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const visited = new Set<string>()
  const pending = [startNodeId]

  while (pending.length > 0) {
    const nodeId = pending.pop()
    if (!nodeId || visited.has(nodeId)) continue
    if (nodeId === targetNodeId) return true

    visited.add(nodeId)
    const node = nodesById.get(nodeId)
    if (!node) continue
    node.dependsOn.forEach((dependencyId) => {
      if (!visited.has(dependencyId)) pending.push(dependencyId)
    })
  }
  return false
}

export function removeNodeAndReconnect(nodes: PlanNode[], targetNode: PlanNode): PlanNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const predecessorIds = targetNode.dependsOn.filter((id) => nodeIds.has(id))
  return reduceRedundantDependencies(nodes
    .filter((node) => node.id !== targetNode.id)
    .map((node) => {
      if (!node.dependsOn.includes(targetNode.id)) return node
      const dependsOn = node.dependsOn.filter((id) => id !== targetNode.id)
      predecessorIds.forEach((id) => {
        if (!dependsOn.includes(id)) dependsOn.push(id)
      })
      return { ...node, dependsOn }
    }))
}
