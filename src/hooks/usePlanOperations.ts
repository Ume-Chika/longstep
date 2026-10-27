import { savePlan } from '../db/planStore'
import type { NewPlanNodeInput, NodeInsertion, PlanNode, PlanSnapshot } from '../models/plan'
import { insertPlanNode, swapNodesOnEdge } from '../components/planMapLogic'
import { createNodeId, hasDependencyPath, removeNodeAndReconnect } from '../utils/graph'
import type { Notice } from '../types/app'

interface UsePlanOperationsParams {
  activePlan: PlanSnapshot | null
  setActivePlan: (plan: PlanSnapshot) => void
  setSelectedNodeId: (id: string | null) => void
  loadPlans: () => Promise<PlanSnapshot[]>
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  setAchievement: (text: string | null) => void
  reportSaveError: (error: unknown, suffix?: string) => void
}

export function usePlanOperations({
  activePlan,
  setActivePlan,
  setSelectedNodeId,
  loadPlans,
  setNotice,
  setAchievement,
  reportSaveError,
}: UsePlanOperationsParams) {
  async function applyNodesUpdate(nextNodes: PlanNode[], successMessage?: string): Promise<boolean> {
    if (!activePlan) return false

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes: nextNodes,
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      await loadPlans()
      if (successMessage) setNotice({ kind: 'success', text: successMessage })
      return true
    } catch (error) {
      reportSaveError(error)
      return false
    }
  }

  async function updateNode(node: PlanNode, options: { silent?: boolean } = {}): Promise<boolean> {
    if (!activePlan) return false
    const previousNode = activePlan.nodes.find((currentNode) => currentNode.id === node.id)
    const nextNodes = activePlan.nodes.map((currentNode) => (currentNode.id === node.id ? node : currentNode))

    const success = await applyNodesUpdate(nextNodes, options.silent ? undefined : '中間目標を記録しました。')
    if (success && previousNode?.status !== 'completed' && node.status === 'completed') {
      setAchievement(node.name)
    }
    return success
  }

  async function createNode(input: NewPlanNodeInput, insertion?: NodeInsertion): Promise<boolean> {
    if (!activePlan) return false
    if (!input.name.trim()) {
      setNotice({ kind: 'error', text: '新しい中間目標の名前を入力してください。' })
      return false
    }

    const nodesById = new Map(activePlan.nodes.map((node) => [node.id, node]))
    const newNode: PlanNode = {
      id: createNodeId(activePlan.nodes),
      name: input.name.trim(),
      status: 'not_started',
      targetDate: input.targetDate,
      description: input.description.trim(),
      nextAction: input.nextAction.trim(),
      dependsOn: [],
      goalLevel: insertion ? 'minor' : 'major',
      recurrence: { enabled: false, cadence: '', completedCount: 0 },
    }

    if (insertion && 'prerequisiteForId' in insertion) {
      if (!nodesById.has(insertion.prerequisiteForId)) {
        setNotice({ kind: 'error', text: '追加対象の目標が見つかりませんでした。' })
        return false
      }
    } else if (insertion) {
      const fromNode = nodesById.get(insertion.fromId)
      if (!fromNode) {
        setNotice({ kind: 'error', text: '道筋の始点が見つかりませんでした。' })
        return false
      }
      if (!insertion.toFinal) {
        const toNode = nodesById.get(insertion.toId)
        if (!toNode || !toNode.dependsOn.includes(insertion.fromId)) {
          setNotice({ kind: 'error', text: '道筋の接続先が見つかりませんでした。' })
          return false
        }
      }
    }

    const nextNodes = insertPlanNode(activePlan.nodes, newNode, insertion)
    const success = await applyNodesUpdate(nextNodes, `「${newNode.name}」を作成しました。`)
    if (success) {
      setSelectedNodeId(newNode.id)
    }
    return success
  }

  async function deleteNode(nodeId: string): Promise<boolean> {
    if (!activePlan) return false
    const targetNode = activePlan.nodes.find((node) => node.id === nodeId)
    if (!targetNode) {
      setNotice({ kind: 'error', text: '削除する中間目標が見つかりませんでした。' })
      return false
    }

    const updatedNodes = removeNodeAndReconnect(activePlan.nodes, targetNode)
    const success = await applyNodesUpdate(updatedNodes, `「${targetNode.name}」を削除し、前後の道筋をつなぎ直しました。`)
    if (success) {
      setSelectedNodeId(null)
    }
    return success
  }

  async function addEdge(fromNodeId: string, toNodeId: string): Promise<boolean> {
    if (!activePlan) return false
    const fromNode = activePlan.nodes.find((node) => node.id === fromNodeId)
    const toNode = activePlan.nodes.find((node) => node.id === toNodeId)

    if (!fromNode || !toNode) {
      setNotice({ kind: 'error', text: '接続する中間目標が見つかりませんでした。' })
      return false
    }
    if (fromNodeId === toNodeId) {
      setNotice({ kind: 'error', text: '同じ中間目標同士は接続できません。' })
      return false
    }
    if (toNode.dependsOn.includes(fromNodeId)) {
      setNotice({ kind: 'error', text: 'その道筋はすでに登録されています。' })
      return false
    }
    if (hasDependencyPath(activePlan.nodes, toNodeId, fromNodeId)) {
      setNotice({ kind: 'error', text: '迂回路の追加はできません。既存の道筋でつながっています。' })
      return false
    }
    if (hasDependencyPath(activePlan.nodes, fromNodeId, toNodeId)) {
      setNotice({ kind: 'error', text: '目標が循環する接続は追加できません。' })
      return false
    }

    const nextNodes = activePlan.nodes.map((node) => (
      node.id === toNodeId ? { ...node, dependsOn: [...node.dependsOn, fromNodeId] } : node
    ))
    return applyNodesUpdate(nextNodes, `「${fromNode.name}」から「${toNode.name}」へ道筋を追加しました。`)
  }

  async function deleteEdge(fromNodeId: string, toNodeId: string): Promise<boolean> {
    if (!activePlan) return false
    const fromNode = activePlan.nodes.find((node) => node.id === fromNodeId)
    const toNode = activePlan.nodes.find((node) => node.id === toNodeId)

    if (!fromNode || !toNode || !toNode.dependsOn.includes(fromNodeId)) {
      setNotice({ kind: 'error', text: '削除する道筋が見つかりませんでした。' })
      return false
    }

    const nextNodes = activePlan.nodes.map((node) => (
      node.id === toNodeId
        ? { ...node, dependsOn: node.dependsOn.filter((dependencyId) => dependencyId !== fromNodeId) }
        : node
    ))
    return applyNodesUpdate(nextNodes, `「${fromNode.name}」から「${toNode.name}」への道筋を削除しました。`)
  }

  async function swapEdgeNodes(fromNodeId: string, toNodeId: string): Promise<boolean> {
    if (!activePlan) return false
    const fromNode = activePlan.nodes.find((node) => node.id === fromNodeId)
    const toNode = activePlan.nodes.find((node) => node.id === toNodeId)

    if (!fromNode || !toNode || !toNode.dependsOn.includes(fromNodeId)) {
      setNotice({ kind: 'error', text: '入れ替え対象の道筋が見つかりませんでした。' })
      return false
    }

    const nextNodes = swapNodesOnEdge(activePlan.nodes, fromNodeId, toNodeId)
    return applyNodesUpdate(nextNodes, `「${fromNode.name}」と「${toNode.name}」の位置を入れ替えました。`)
  }

  return {
    updateNode,
    createNode,
    deleteNode,
    addEdge,
    deleteEdge,
    swapEdgeNodes,
  }
}
