import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  actionableGoalIds,
  collapsibleCompletedIds,
  coversAtLeastHalfTarget,
  effectiveTargetDate,
  overflowingPrerequisiteIds,
  relatedNodeIds,
  swapNodesInColumn,
} from './planMapLogic'
import { backdropCloseHandlers } from './backdropClose'
import type { NewPlanNodeInput, NodeInsertion, PlanNode, PlanSnapshot } from '../models/plan'

interface PlanMapProps {
  plan: PlanSnapshot
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onClearSelection: () => void
  onUpdateNode: (node: PlanNode) => Promise<boolean>
  onReorderNodes: (nodes: PlanNode[]) => Promise<boolean>
  onOpenPlanMenu: () => void
  onCreateNode: (input: NewPlanNodeInput, insertion?: NodeInsertion) => Promise<boolean>
  onAddEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onDeleteEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onSwapEdgeNodes: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onDeleteNode: (nodeId: string) => Promise<boolean>
  initialViewPosition?: { left: number; top: number }
  onViewPositionChange?: (position: { left: number; top: number }) => void
}

const statusLabels = {
  not_started: '未着手',
  completed: '達成済み',
} as const

const goalLevelLabels = {
  minor: '小目標',
  middle: '中目標',
  major: '大目標',
  loop: 'ループ',
} as const

const goalLevelOptions = [
  ['minor', goalLevelLabels.minor],
  ['middle', goalLevelLabels.middle],
  ['major', goalLevelLabels.major],
  ['loop', goalLevelLabels.loop],
] as const

function getStatusLabel(status: PlanNode['status']): string {
  return status === 'completed' ? statusLabels.completed : statusLabels.not_started
}

function isActionableGoal(node: PlanNode, attention?: string): boolean {
  return node.status === 'not_started'
    && node.goalLevel !== 'loop'
    && (attention === 'focus' || attention === 'available')
}

interface PositionedNode {
  node: PlanNode
  x: number
  y: number
}

interface MapEdge {
  id: string
  fromId: string
  toId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  toFinal: boolean
  routePoints?: MapPoint[]
}

interface MapPoint {
  x: number
  y: number
}

type LayoutItemKind = 'node' | 'final'

interface LayoutItem {
  id: string
  kind: LayoutItemKind
  level: number
  originalOrder: number
  node?: PlanNode
}

interface LayoutEdge {
  id: string
  fromId: string
  toId: string
  toFinal: boolean
  itemIds: string[]
}

interface MapLayout {
  positions: PositionedNode[]
  edges: MapEdge[]
  width: number
  height: number
  finalPosition: { x: number; y: number }
}

type EdgeEditMode = 'add'
interface DragConnection {
  pointerId: number
  fromNodeId: string
  fromX: number
  fromY: number
  currentX: number
  currentY: number
}

interface ReorderDrag {
  pointerId: number
  nodeId: string
  columnNodeIds: string[]
  startTop: number
  height: number
  startClientY: number
  offsetPx: number
  moved: boolean
}

function todayIsoDate(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function defaultNewNodeInput(deadline: string): NewPlanNodeInput {
  return {
    name: '新しい目標',
    targetDate: deadline,
    description: 'この目標の説明を入力',
    nextAction: '次の行動を入力',
  }
}

const minimumMapWidth = 1000
const mapHeight = 700
const firstColumnX = 150
const columnSpacing = 270
const levelSpacing = 36
const finalGoalGap = 160
const rowSpacing = 145
const nodePortOffset = 92
const mapTopPadding = 78

function getNodeLevels(nodes: PlanNode[]): Map<string, number> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const successors = new Map<string, string[]>()
  const levels = new Map<string, number>()
  const visiting = new Set<string>()

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyId) => {
      if (!nodesById.has(dependencyId)) return
      successors.set(dependencyId, [...(successors.get(dependencyId) ?? []), node.id])
    })
  })

  function getDistanceToTerminal(nodeId: string): number {
    const cachedDistance = levels.get(nodeId)
    if (cachedDistance !== undefined) return cachedDistance
    if (visiting.has(nodeId)) return 0

    const node = nodesById.get(nodeId)
    if (!node) return 0

    visiting.add(nodeId)
    const successorDistances = (successors.get(node.id) ?? []).map(getDistanceToTerminal)
    visiting.delete(nodeId)

    const distance = successorDistances.length > 0 ? Math.max(...successorDistances) + 1 : 0
    levels.set(nodeId, distance)
    return distance
  }

  nodes.forEach((node) => getDistanceToTerminal(node.id))
  const maximumDistance = Math.max(0, ...levels.values())

  return new Map(nodes.map((node) => [
    node.id,
    maximumDistance - (levels.get(node.id) ?? 0),
  ]))
}

function createMapLayout(nodes: PlanNode[]): MapLayout {
  const levels = getNodeLevels(nodes)
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const successors = new Map<string, string[]>()
  const levelOrders = new Map<number, LayoutItem[]>()
  const layoutEdges: LayoutEdge[] = []
  const yById = new Map<string, number>()
  const finalItemId = '__final-goal__'

  function addItem(item: LayoutItem) {
    levelOrders.set(item.level, [...(levelOrders.get(item.level) ?? []), item])
  }

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyId) => {
      if (!nodesById.has(dependencyId)) return
      successors.set(dependencyId, [...(successors.get(dependencyId) ?? []), node.id])
    })
  })

  nodes.forEach((node, index) => {
    const level = levels.get(node.id) ?? 0
    addItem({ id: node.id, kind: 'node', level, originalOrder: index, node })
  })

  const maximumLevel = Math.max(0, ...levels.values())
  const finalLevel = maximumLevel + 1

  addItem({
    id: finalItemId,
    kind: 'final',
    level: finalLevel,
    originalOrder: nodes.length,
  })

  const terminalNodeIds = nodes
    .filter((node) => (successors.get(node.id) ?? []).length === 0)
    .map((node) => node.id)

  function addLayoutEdge(fromId: string, toId: string, toFinal: boolean) {
    const edgeId = toFinal ? `${fromId}-final` : `${fromId}-${toId}`
    const itemIds = [fromId]

    itemIds.push(toFinal ? finalItemId : toId)
    layoutEdges.push({ id: edgeId, fromId, toId, toFinal, itemIds })
  }

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyId) => {
      if (nodesById.has(dependencyId)) addLayoutEdge(dependencyId, node.id, false)
    })
  })
  terminalNodeIds.forEach((nodeId) => addLayoutEdge(nodeId, 'final', true))

  levelOrders.forEach((levelItems, level) => {
    levelOrders.set(level, [...levelItems].sort((left, right) => (
      left.originalOrder - right.originalOrder || left.id.localeCompare(right.id)
    )))
  })

  function packedY(rowIndex: number): number {
    return mapTopPadding + rowIndex * rowSpacing
  }

  function assignPackedPositions(levelItems: LayoutItem[]) {
    levelItems.forEach((item, rowIndex) => {
      yById.set(item.id, packedY(rowIndex))
    })
  }

  levelOrders.forEach(assignPackedPositions)
  const maximumRowCount = Math.max(1, ...[...levelOrders.values()].map((items) => items.length))
  const layoutHeight = Math.max(mapHeight, mapTopPadding * 2 + (maximumRowCount - 1) * rowSpacing + 50)

  const positions: PositionedNode[] = []
  const itemPositionById = new Map<string, MapPoint>()
  let nextColumnX = firstColumnX

  for (let level = 0; level <= finalLevel; level += 1) {
    const levelItems = levelOrders.get(level) ?? []
    if (levelItems.length === 0) continue
    const levelStartX = level === finalLevel && nodes.length > 0
      ? nextColumnX + finalGoalGap
      : nextColumnX

    levelItems.forEach((item) => {
      const itemPosition = {
        x: levelStartX,
        y: yById.get(item.id) ?? layoutHeight / 2,
      }
      itemPositionById.set(item.id, itemPosition)

      if (item.kind === 'node' && item.node) {
        const position = { node: item.node, ...itemPosition }
        positions.push(position)
      }
    })

    nextColumnX = levelStartX + columnSpacing + levelSpacing
  }

  const finalPosition = nodes.length > 0
    ? itemPositionById.get(finalItemId) ?? { x: minimumMapWidth / 2, y: mapTopPadding }
    : { x: minimumMapWidth / 2, y: mapTopPadding }
  const mapWidth = Math.max(minimumMapWidth, finalPosition.x + 150)

  const edges = layoutEdges.flatMap<MapEdge>((edge) => {
    const rawPoints = edge.itemIds
      .map((itemId) => itemPositionById.get(itemId))
      .filter((point): point is MapPoint => point !== undefined)
    if (rawPoints.length < 2) return []

    const startPoint = {
      x: rawPoints[0].x + nodePortOffset,
      y: rawPoints[0].y,
    }
    const endPoint = {
      x: rawPoints.at(-1)!.x - nodePortOffset,
      y: rawPoints.at(-1)!.y,
    }
    const isNearlyStraight = Math.abs(startPoint.y - endPoint.y) < 8
    const bendX = Math.max(
      startPoint.x + 32,
      Math.min(endPoint.x - 32, startPoint.x + (endPoint.x - startPoint.x) * 0.72),
    )
    const routePoints = isNearlyStraight
      ? [startPoint, endPoint]
      : [startPoint, { x: bendX, y: endPoint.y }, endPoint]
    const firstPoint = routePoints[0]
    const lastPoint = routePoints.at(-1)!

    return [{
      id: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      fromX: firstPoint.x,
      fromY: firstPoint.y,
      toX: lastPoint.x,
      toY: lastPoint.y,
      toFinal: edge.toFinal,
      routePoints,
    }]
  })

  return { positions, edges, width: mapWidth, height: layoutHeight, finalPosition }
}

function edgePath(edge: MapEdge): string {
  const points = edge.routePoints && edge.routePoints.length >= 2
    ? edge.routePoints
    : [{ x: edge.fromX, y: edge.fromY }, { x: edge.toX, y: edge.toY }]

  // ponytail: 既存の経路点を使った角丸折れ線。自動配線が必要になったらELKへ置き換える。
  const cornerRadius = 18
  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y)
    const radius = Math.min(cornerRadius, incomingLength / 2, outgoingLength / 2)
    const before = {
      x: current.x + (previous.x - current.x) * (radius / incomingLength),
      y: current.y + (previous.y - current.y) * (radius / incomingLength),
    }
    const after = {
      x: current.x + (next.x - current.x) * (radius / outgoingLength),
      y: current.y + (next.y - current.y) * (radius / outgoingLength),
    }

    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`
  }

  const lastPoint = points.at(-1)!
  return `${path} L ${lastPoint.x} ${lastPoint.y}`
}

function formatDate(date: string): string {
  if (!date) return '期限未設定'
  const parsedDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return '日付未設定'

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}

type NodeAttention = 'focus' | 'available' | 'upcoming' | 'distant' | 'completed' | 'completed-distant'

function daysFromToday(date: string): number | null {
  if (!date) return null
  const target = Date.parse(`${date}T00:00:00Z`)
  const current = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(target) || Number.isNaN(current)) return null
  return Math.ceil((target - current) / 86_400_000)
}

function formatRemainingDays(date: string): string {
  const days = daysFromToday(date)
  if (days === null) return '残り不明'
  if (days < 0) return `期限超過${Math.abs(days)}日`
  return `残り${days}日`
}

function buildNodeAttention(nodes: PlanNode[], actionableIds: string[]): Map<string, NodeAttention> {
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

export function PlanMap({
  plan,
  selectedNodeId,
  onSelectNode,
  onClearSelection,
  onUpdateNode,
  onReorderNodes,
  onOpenPlanMenu,
  onCreateNode,
  onAddEdge,
  onDeleteEdge,
  onSwapEdgeNodes,
  onDeleteNode,
  initialViewPosition,
  onViewPositionChange,
}: PlanMapProps) {
  const actionableIds = useMemo(() => actionableGoalIds(plan.nodes), [plan.nodes])
  // 折りたたむ対象は2種類。古い達成済みの連なりと、1つの目標に4件以上ぶら下がったときの下位。
  const collapsibleIds = useMemo(() => new Set([
    ...collapsibleCompletedIds(plan.nodes),
    ...overflowingPrerequisiteIds(plan.nodes),
  ]), [plan.nodes])
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const visibleNodes = useMemo(() => isHistoryExpanded
    ? plan.nodes
    : plan.nodes.filter((node) => !collapsibleIds.has(node.id)), [collapsibleIds, isHistoryExpanded, plan.nodes])
  const layout = useMemo(() => createMapLayout(visibleNodes), [visibleNodes])
  const nodeAttention = useMemo(() => buildNodeAttention(plan.nodes, actionableIds), [actionableIds, plan.nodes])
  const canvasRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const focusedPlanRef = useRef<string | null>(null)
  const edgeEditorRef = useRef<HTMLDivElement>(null)
  const edgeQuickActionRef = useRef<HTMLDivElement>(null)
  const draftDirtyRef = useRef(false)
  const selectedNode = plan.nodes.find((node) => node.id === selectedNodeId)
  const nodeNames = new Map(plan.nodes.map((node) => [node.id, node.name]))
  const positionById = new Map(layout.positions.map((position) => [position.node.id, position]))
  const [draftNode, setDraftNode] = useState<PlanNode | undefined>(selectedNode)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [isEdgeEditorOpen, setIsEdgeEditorOpen] = useState(false)
  const [edgeEditMode, setEdgeEditMode] = useState<EdgeEditMode | null>(null)
  const [dragConnection, setDragConnection] = useState<DragConnection | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [edgeEditMessage, setEdgeEditMessage] = useState('道筋の追加または目標の追加を選んでください。')
  const [showRemainingDays, setShowRemainingDays] = useState(false)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [reorderDrag, setReorderDrag] = useState<ReorderDrag | null>(null)
  const [reorderTargetNodeId, setReorderTargetNodeId] = useState<string | null>(null)
  const reorderDragRef = useRef<ReorderDrag | null>(null)
  const lastTargetNodeIdRef = useRef<string | null>(null)
  const reorderElementRef = useRef<HTMLElement | null>(null)
  const reorderFrameRef = useRef<number | null>(null)
  const reorderMovedRef = useRef(false)
  const reorderSavingRef = useRef(false)
  const suppressNodeClickRef = useRef(false)
  const detailPressStartedInsideRef = useRef(false)
  const selectedEdge = layout.edges.find((edge) => edge.id === selectedEdgeId)
  const relatedIds = useMemo(() => hoveredNodeId
    ? relatedNodeIds(plan.nodes, hoveredNodeId)
    : null, [hoveredNodeId, plan.nodes])
  const nodesById = useMemo(() => new Map(plan.nodes.map((node) => [node.id, node])), [plan.nodes])

  useEffect(() => {
    if (focusedPlanRef.current === plan.id) return
    const map = mapRef.current
    if (map && initialViewPosition) {
      map.scrollTo({ left: initialViewPosition.left, top: initialViewPosition.top, behavior: 'auto' })
      focusedPlanRef.current = plan.id
      return
    }
    const focus = actionableIds
      .map((id) => layout.positions.find((position) => position.node.id === id))
      .find(Boolean)
    if (!map || !focus) return
    const target = (focus.x / layout.width) * map.scrollWidth - map.clientWidth / 2
    map.scrollTo({ left: Math.max(0, target), behavior: 'auto' })
    focusedPlanRef.current = plan.id
  }, [actionableIds, initialViewPosition, layout.positions, layout.width, plan.id])

  useEffect(() => () => {
    if (reorderFrameRef.current !== null) {
      window.cancelAnimationFrame(reorderFrameRef.current)
    }
    reorderElementRef.current?.style.setProperty('--node-drag-y', '0px')
    reorderElementRef.current = null
    reorderDragRef.current = null
  }, [])

  useEffect(() => {
    draftDirtyRef.current = false
    setDraftNode(selectedNode)
    setAutoSaveStatus('saved')
  }, [selectedNode])

  useEffect(() => {
    if (!draftNode || !draftDirtyRef.current) return

    const timer = window.setTimeout(() => {
      draftDirtyRef.current = false
      setAutoSaveStatus('saving')
      void onUpdateNode(draftNode).then((saved) => setAutoSaveStatus(saved ? 'saved' : 'error'))
    }, 250)

    return () => window.clearTimeout(timer)
  }, [draftNode, onUpdateNode])

  useEffect(() => {
    setIsEdgeEditorOpen(false)
    setEdgeEditMode(null)
    setDragConnection(null)
    setSelectedEdgeId(null)
    setEdgeEditMessage('道筋の追加または目標の追加を選んでください。')
    setShowRemainingDays(false)
    setIsHistoryExpanded(false)
    setReorderDrag(null)
  }, [plan.goal.deadline, plan.id])

  useEffect(() => {
  }, [selectedNodeId])

  useEffect(() => {
    if (selectedEdgeId && !layout.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null)
    }
  }, [layout.edges, selectedEdgeId])

  useEffect(() => {
    if (!isEdgeEditorOpen && !selectedEdgeId) return

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target && (edgeEditorRef.current?.contains(target) || edgeQuickActionRef.current?.contains(target))) {
        return
      }

      setIsEdgeEditorOpen(false)
      setEdgeEditMode(null)
      setDragConnection(null)
      setSelectedEdgeId(null)
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [isEdgeEditorOpen, selectedEdgeId])

  useEffect(() => {
    if (!selectedNode) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (draftNode && draftDirtyRef.current) {
        draftDirtyRef.current = false
        void onUpdateNode(draftNode)
      }
      onClearSelection()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [draftNode, onClearSelection, onUpdateNode, selectedNode])

  function updateDraft(
    field: 'name' | 'status' | 'targetDate' | 'description' | 'goalLevel',
    value: string,
  ) {
    if (!draftNode) return

    const nextNode: PlanNode = field === 'status'
      ? { ...draftNode, status: value as PlanNode['status'] }
      : field === 'goalLevel'
        ? { ...draftNode, goalLevel: value as PlanNode['goalLevel'] }
        : { ...draftNode, [field]: value }

    draftDirtyRef.current = true
    setAutoSaveStatus('saving')
    setDraftNode(nextNode)
  }

  function closeNodeDetail() {
    if (draftNode && draftDirtyRef.current) {
      draftDirtyRef.current = false
      void onUpdateNode(draftNode)
    }
    onClearSelection()
  }

  function toggleNodeCompletion() {
    if (!draftNode) return
    if (draftNode.status === 'completed') {
      updateDraft('status', 'not_started')
      return
    }

    draftDirtyRef.current = false
    void onUpdateNode({ ...draftNode, status: 'completed' })
    onClearSelection()
  }

  function toggleDateDisplay() {
    setShowRemainingDays((current) => !current)
  }

  function getNodeTypeIcon(node: PlanNode): { label: string; glyph: string } {
    if (node.goalLevel === 'loop' || node.recurrence?.enabled) {
      return { label: `繰り返し目標、${node.recurrence?.completedCount ?? 0}回達成`, glyph: '↻' }
    }

    if (node.goalLevel === 'major') return { label: goalLevelLabels.major, glyph: '◆' }
    if (node.goalLevel === 'minor') return { label: goalLevelLabels.minor, glyph: '·' }
    return { label: goalLevelLabels.middle, glyph: '✦' }
  }

  function selectNode(event: MouseEvent<HTMLButtonElement>, nodeId: string) {
    event.stopPropagation()

    if (suppressNodeClickRef.current) {
      event.preventDefault()
      suppressNodeClickRef.current = false
      return
    }

    if (edgeEditMode) return

    onSelectNode(nodeId)
  }

  function toggleEdgeEditor(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const nextOpen = !isEdgeEditorOpen
    setIsEdgeEditorOpen(nextOpen)
    setEdgeEditMode(null)
    setDragConnection(null)
    setSelectedEdgeId(null)
    setEdgeEditMessage('道筋の追加または目標の追加を選んでください。')
    closeNodeDetail()
  }

  function chooseEdgeEditMode() {
    setEdgeEditMode('add')
    setDragConnection(null)
    setSelectedEdgeId(null)
    setEdgeEditMessage('始点から接続先までドラッグしてください。')
  }

  function createNodeFromInput(input: NewPlanNodeInput, insertion?: NodeInsertion) {
    void onCreateNode(input, insertion).then((created) => {
      if (!created) return
      setSelectedEdgeId(null)
      setEdgeEditMessage('新しい目標を追加しました。目標詳細から具体化できます。')
    })
  }

  function createFreeNode() {
    setEdgeEditMode(null)
    createNodeFromInput(defaultNewNodeInput(plan.goal.deadline))
  }

  function createChildNode(event: { preventDefault: () => void; stopPropagation: () => void }, nodeId: string) {
    event.preventDefault()
    event.stopPropagation()
    createNodeFromInput(defaultNewNodeInput(plan.goal.deadline), {
      prerequisiteForId: nodeId,
    })
  }

  function createNodeOnSelectedEdge() {
    if (!selectedEdge) return

    createNodeFromInput(defaultNewNodeInput(plan.goal.deadline), {
      fromId: selectedEdge.fromId,
      toId: selectedEdge.toId,
      toFinal: selectedEdge.toFinal,
    })
  }

  function pointerPosition(event: ReactPointerEvent<HTMLElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * layout.width,
      y: ((event.clientY - bounds.top) / bounds.height) * layout.height,
    }
  }

  function beginReorderDrag(event: ReactPointerEvent<HTMLElement>, nodeId: string) {
    if (edgeEditMode || reorderSavingRef.current) return
    const position = positionById.get(nodeId)
    const element = event.currentTarget.closest('.node-card') as HTMLElement | null
    const bounds = element?.getBoundingClientRect()
    if (!position || !element || !bounds || bounds.height === 0) return

    const columnNodeIds = layout.positions
      .filter((candidate) => candidate.x === position.x)
      .sort((left, right) => left.y - right.y)
      .map((candidate) => candidate.node.id)
    if (columnNodeIds.length < 2) return

    event.preventDefault()
    reorderMovedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextDrag: ReorderDrag = {
      pointerId: event.pointerId,
      nodeId,
      columnNodeIds,
      startTop: bounds.top,
      height: bounds.height,
      startClientY: event.clientY,
      offsetPx: 0,
      moved: false,
    }
    reorderDragRef.current = nextDrag
    reorderElementRef.current = element
    lastTargetNodeIdRef.current = null
    setReorderDrag(nextDrag)
    setReorderTargetNodeId(null)
  }

  function findReorderTargetNodeId(currentDrag: ReorderDrag): string | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const movingTop = currentDrag.startTop + currentDrag.offsetPx
    const movingBottom = movingTop + currentDrag.height
    const cardsById = new Map([...canvas.querySelectorAll<HTMLElement>('[data-node-id]')]
      .map((element) => [element.dataset.nodeId, element] as const))

    return currentDrag.columnNodeIds
      .filter((id) => id !== currentDrag.nodeId)
      .map((id) => ({ id, bounds: cardsById.get(id)?.getBoundingClientRect() }))
      .filter((candidate) => candidate.bounds
        && coversAtLeastHalfTarget(movingTop, movingBottom, candidate.bounds.top, candidate.bounds.bottom))
      .sort((left, right) => {
        const movingCenter = (movingTop + movingBottom) / 2
        const leftCenter = (left.bounds!.top + left.bounds!.bottom) / 2
        const rightCenter = (right.bounds!.top + right.bounds!.bottom) / 2
        return Math.abs(movingCenter - leftCenter) - Math.abs(movingCenter - rightCenter)
      })[0]?.id ?? null
  }

  function moveReorderDrag(event: ReactPointerEvent<HTMLElement>) {
    const currentDrag = reorderDragRef.current
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return

    const offsetPx = event.clientY - currentDrag.startClientY
    const moved = reorderMovedRef.current || Math.abs(offsetPx) > 4
    if (moved) {
      event.preventDefault()
      reorderMovedRef.current = true
    }
    currentDrag.offsetPx = offsetPx
    currentDrag.moved = moved

    const targetNodeId = moved ? findReorderTargetNodeId(currentDrag) : null
    lastTargetNodeIdRef.current = targetNodeId
    setReorderTargetNodeId(targetNodeId)

    if (reorderFrameRef.current !== null) return
    reorderFrameRef.current = window.requestAnimationFrame(() => {
      reorderFrameRef.current = null
      const element = reorderElementRef.current
      const drag = reorderDragRef.current
      if (element && drag) {
        element.style.setProperty('--node-drag-y', `${drag.offsetPx}px`)
      }
    })
  }

  function finishReorderDrag(event: ReactPointerEvent<HTMLElement>) {
    const currentDrag = reorderDragRef.current
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return

    const moved = reorderMovedRef.current || currentDrag.moved
    const targetNodeId = findReorderTargetNodeId(currentDrag) ?? lastTargetNodeIdRef.current

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (reorderFrameRef.current !== null) {
      window.cancelAnimationFrame(reorderFrameRef.current)
      reorderFrameRef.current = null
    }
    reorderElementRef.current?.style.setProperty('--node-drag-y', '0px')
    reorderElementRef.current = null
    reorderDragRef.current = null
    lastTargetNodeIdRef.current = null
    setReorderDrag(null)
    setReorderTargetNodeId(null)

    if (!moved && !targetNodeId) return

    event.preventDefault()
    event.stopPropagation()
    suppressNodeClickRef.current = true
    window.setTimeout(() => {
      suppressNodeClickRef.current = false
    }, 0)

    if (!targetNodeId) return

    const reorderedNodes = swapNodesInColumn(
      plan.nodes,
      currentDrag.columnNodeIds,
      currentDrag.nodeId,
      targetNodeId,
    )
    if (reorderedNodes === plan.nodes) return

    reorderSavingRef.current = true
    void onReorderNodes(reorderedNodes).finally(() => {
      reorderSavingRef.current = false
    })
  }

  function cancelReorderDrag(event: ReactPointerEvent<HTMLElement>) {
    const currentDrag = reorderDragRef.current
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (reorderFrameRef.current !== null) {
      window.cancelAnimationFrame(reorderFrameRef.current)
      reorderFrameRef.current = null
    }
    reorderElementRef.current?.style.setProperty('--node-drag-y', '0px')
    reorderElementRef.current = null
    reorderDragRef.current = null
    lastTargetNodeIdRef.current = null
    setReorderDrag(null)
    setReorderTargetNodeId(null)
    reorderMovedRef.current = false
  }

  function beginEdgeDrag(event: ReactPointerEvent<HTMLElement>, nodeId: string) {
    const position = positionById.get(nodeId)
    const pointer = pointerPosition(event)
    if (!position || !pointer) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedEdgeId(null)
    setDragConnection({
      pointerId: event.pointerId,
      fromNodeId: nodeId,
      fromX: position.x + nodePortOffset,
      fromY: position.y,
      currentX: pointer.x,
      currentY: pointer.y,
    })
    setEdgeEditMessage('接続先の目標上で離してください。')
  }

  function moveEdgeDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    const pointer = pointerPosition(event)
    if (!pointer) return
    event.preventDefault()
    setDragConnection((current) => current ? {
      ...current,
      currentX: pointer.x,
      currentY: pointer.y,
    } : current)
  }

  function finishEdgeDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    const targetElement = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-node-id]')
    const targetNodeId = targetElement?.dataset.nodeId
    const fromNodeId = dragConnection.fromNodeId

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragConnection(null)

    if (!targetNodeId) {
      setEdgeEditMessage('接続先が選ばれませんでした。もう一度ドラッグしてください。')
      return
    }

    void onAddEdge(fromNodeId, targetNodeId).then((added) => {
      setEdgeEditMessage(added
        ? '道筋を追加しました。配置を更新しました。'
        : '追加できませんでした。別の接続先を選んでください。')
    })
  }

  function cancelEdgeDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    setDragConnection(null)
    setEdgeEditMessage('ドラッグを中止しました。')
  }

  function chooseEdge(edge: MapEdge) {
    if (edgeEditMode) return

    setSelectedEdgeId(edge.id)
    closeNodeDetail()
  }

  function selectEdge(event: MouseEvent<SVGGElement>, edge: MapEdge) {
    event.stopPropagation()
    chooseEdge(edge)
  }

  function selectEdgeByKeyboard(event: KeyboardEvent<SVGGElement>, edge: MapEdge) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    chooseEdge(edge)
  }

  function deleteSelectedEdge() {
    if (!selectedEdge || selectedEdge.toFinal) return
    void onDeleteEdge(selectedEdge.fromId, selectedEdge.toId).then((deleted) => {
      if (!deleted) return
      setSelectedEdgeId(null)
      setEdgeEditMessage('道筋を削除しました。配置を更新しました。')
    })
  }

  function swapSelectedEdgeNodes() {
    if (!selectedEdge || selectedEdge.toFinal) return
    void onSwapEdgeNodes(selectedEdge.fromId, selectedEdge.toId).then((swapped) => {
      if (!swapped) return
      setSelectedEdgeId(null)
      setEdgeEditMessage('目標の位置を入れ替えました。配置を更新しました。')
    })
  }

  function confirmDeleteSelectedNode() {
    if (!selectedNode || !window.confirm(`「${selectedNode.name}」を削除しますか？\n前後の道筋をつなぎ直して削除します。`)) return
    void onDeleteNode(selectedNode.id).then((deleted) => {
      if (!deleted) return
      onClearSelection()
      setEdgeEditMessage('目標を削除し、前後の道筋をつなぎ直しました。')
    })
  }

  return (
    <div
      className={`map-layout ${selectedNode ? 'has-detail' : ''}`}
      onClick={(event) => {
        // モーダル内から始まったドラッグ（テキスト選択など）では閉じない。
        // clickイベントは押した要素と離した要素の共通祖先で発火するため、
        // 詳細の外で離しただけでこのハンドラへ届いてしまう。
        if (detailPressStartedInsideRef.current) {
          detailPressStartedInsideRef.current = false
          return
        }
        if ((event.target as HTMLElement | null)?.closest('.node-detail')) return
        closeNodeDetail()
      }}
      onMouseDown={(event) => {
        detailPressStartedInsideRef.current = Boolean((event.target as HTMLElement | null)?.closest('.node-detail'))
      }}
    >
      <section className="map-panel" aria-labelledby="map-heading">
        <div className="map-stage-hud">
          <div>
            <p className="pixel-kicker">計画マップ</p>
            <h1 id="map-heading">{plan.goal.statement}</h1>
          </div>
          <div className="map-legend" aria-label="目標の状態の凡例">
            <span><i className="legend-dot is-sleeping" />未着手</span>
            <span><i className="legend-dot is-cleared" />達成</span>
          </div>
        </div>

        <div
          className="node-map"
          onScroll={(event) => onViewPositionChange?.({
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          })}
          ref={mapRef}
          role="list"
          aria-label="目標マップ"
        >
          <div
            className={`node-map-canvas ${edgeEditMode === 'add' ? 'is-edge-adding' : ''}`}
            ref={canvasRef}
            style={{ '--map-min-height': `${layout.height}px`, '--map-min-width': `${layout.width}px` } as CSSProperties}
          >
          <svg aria-label="目標間の道筋" className="map-edge-layer" preserveAspectRatio="none" viewBox={`0 0 ${layout.width} ${layout.height}`}>
            {layout.edges.map((edge) => (
              <g
                aria-label={edge.toFinal ? undefined : `${nodeNames.get(edge.fromId) ?? edge.fromId}から${nodeNames.get(edge.toId) ?? edge.toId}への道筋`}
                className={`map-edge-group ${!edgeEditMode ? 'is-selectable' : ''} ${selectedEdgeId === edge.id ? 'is-selected' : ''} ${relatedIds && relatedIds.has(edge.fromId) && (edge.toFinal || relatedIds.has(edge.toId)) ? 'is-related' : relatedIds ? 'is-unrelated' : ''}`}
                data-edge-id={edge.id}
                data-from-id={edge.fromId}
                data-route-point-count={edge.routePoints?.length ?? 2}
                data-to-id={edge.toId}
                key={edge.id}
                onClick={(event) => selectEdge(event, edge)}
                onKeyDown={(event) => selectEdgeByKeyboard(event, edge)}
                role={!edgeEditMode ? 'button' : undefined}
                tabIndex={!edgeEditMode ? 0 : -1}
              >
                <path className="map-edge-hit-area" d={edgePath(edge)} />
                <path className={`map-edge ${edge.toFinal ? 'to-final' : ''}`} d={edgePath(edge)} />
                <circle className="map-edge-joint" cx={edge.toX} cy={edge.toY} r="4" />
              </g>
            ))}
            {dragConnection && (
              <path
                className="map-edge map-edge-preview"
                d={edgePath({
                  id: 'preview',
                  fromId: dragConnection.fromNodeId,
                  toId: 'preview',
                  fromX: dragConnection.fromX,
                  fromY: dragConnection.fromY,
                  toX: dragConnection.currentX,
                  toY: dragConnection.currentY,
                  toFinal: false,
                })}
              />
            )}
          </svg>

          <span aria-hidden="true" className="map-origin-rune">開始</span>

          {layout.positions.map(({ node, x, y }) => (
            <button
              aria-label={`${node.name}、${getStatusLabel(node.status)}、${goalLevelLabels[node.goalLevel ?? 'middle']}`}
              className={`node-card status-${node.status} goal-level-${node.goalLevel ?? 'middle'} attention-${nodeAttention.get(node.id) ?? 'upcoming'} ${isActionableGoal(node, nodeAttention.get(node.id)) ? 'is-actionable-goal' : ''} ${node.recurrence?.enabled ? 'is-repeat' : ''} repeat-count-${Math.min(5, node.recurrence?.completedCount ?? 0)} ${node.id === selectedNode?.id ? 'is-selected' : ''} ${node.id === dragConnection?.fromNodeId ? 'is-edge-start' : ''} ${node.id === reorderDrag?.nodeId ? 'is-reordering' : ''} ${node.id === reorderTargetNodeId ? 'is-drop-target' : ''} ${relatedIds?.has(node.id) ? 'is-related' : relatedIds ? 'is-unrelated' : ''}`}
              data-node-id={node.id}
              key={node.id}
              onClick={(event) => selectNode(event, node.id)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              role="listitem"
              style={{
                '--node-x': `${(x / layout.width) * 100}%`,
                '--node-y': `${(y / layout.height) * 100}%`,
              } as CSSProperties}
              title={node.name}
              type="button"
            >
              <span
                aria-label="ドラッグして同じ列の目標を並べ替える"
                className="node-drag-handle"
                onClick={(event) => event.stopPropagation()}
                onPointerCancel={cancelReorderDrag}
                onPointerDown={(event) => { event.stopPropagation(); beginReorderDrag(event, node.id) }}
                onPointerMove={moveReorderDrag}
                onPointerUp={finishReorderDrag}
                role="button"
                tabIndex={0}
                title="ドラッグして並べ替え"
              >⋮⋮</span>
              <span
                aria-label={`「${node.name}」の前提に目標を追加`}
                className="node-add-handle"
                onClick={(event) => createChildNode(event, node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') createChildNode(event, node.id)
                }}
                role="button"
                tabIndex={0}
                title="この目標の前提に目標を追加"
              >＋</span>
              <span
                aria-label={`「${node.name}」から道筋を追加`}
                className="node-edge-handle"
                onClick={(event) => event.stopPropagation()}
                onPointerCancel={cancelEdgeDrag}
                onPointerDown={(event) => beginEdgeDrag(event, node.id)}
                onPointerMove={moveEdgeDrag}
                onPointerUp={finishEdgeDrag}
                role="button"
                tabIndex={0}
                title="ドラッグして道筋を追加"
              >✎</span>
              <span
                aria-label={getNodeTypeIcon(node).label}
                className={`node-type-mark goal-level-${node.goalLevel ?? 'middle'} ${node.recurrence?.enabled ? 'is-repeat' : ''}`}
                title={getNodeTypeIcon(node).label}
              >
                <span className="node-type-glyph">{getNodeTypeIcon(node).glyph}</span>
              </span>
              <span className="node-card-body">
                <strong>{node.name}</strong>
                <time className={node.status !== 'completed' && (daysFromToday(effectiveTargetDate(node, nodesById).date) ?? 99) <= 7 ? 'is-urgent' : undefined}>
                  {showRemainingDays
                    ? formatRemainingDays(effectiveTargetDate(node, nodesById).date)
                    : `${formatDate(effectiveTargetDate(node, nodesById).date)}${effectiveTargetDate(node, nodesById).estimated ? '（目安）' : ''}`}
                </time>
              </span>
              {hoveredNodeId === node.id && node.description && <span className="node-hover-description" role="tooltip">{node.description}</span>}
              {node.recurrence?.enabled && (
                <span className="node-repeat-mark" aria-label={`繰り返し達成${node.recurrence.completedCount}回`}>
                  ↻ {node.recurrence.completedCount}
                </span>
              )}
            </button>
          ))}

          <button
            aria-label={`計画メニューを開く：${plan.goal.statement}`}
            className="final-goal-node"
            onClick={(event) => { event.stopPropagation(); onOpenPlanMenu() }}
            style={{
              '--node-x': `${(layout.finalPosition.x / layout.width) * 100}%`,
              '--node-y': `${(layout.finalPosition.y / layout.height) * 100}%`,
            } as CSSProperties}
            title={plan.goal.statement}
            type="button"
          >
            <span
              aria-label="新しい目標を追加"
              className="node-add-handle final-goal-add-handle"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); createFreeNode() }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                createFreeNode()
              }}
              role="button"
              tabIndex={0}
              title="新しい目標を追加"
            >＋</span>
            <span className="final-goal-label">最終目標</span>
            <strong>{plan.goal.statement}</strong>
            <span>{formatDate(plan.goal.deadline)}</span>
          </button>
          </div>
        </div>
      </section>

      {selectedEdge && !edgeEditMode && (
        <div className="edge-quick-action" onClick={(event) => event.stopPropagation()} ref={edgeQuickActionRef}>
          <span className="edge-quick-action-kicker">道筋を選択中</span>
          <strong>
            {nodeNames.get(selectedEdge.fromId) ?? selectedEdge.fromId}
            {' → '}
            {selectedEdge.toFinal ? plan.goal.statement : nodeNames.get(selectedEdge.toId) ?? selectedEdge.toId}
          </strong>
          <button className="edge-quick-action-button" onClick={createNodeOnSelectedEdge} type="button">新規目標をここに追加 <span>▶</span></button>
          {!selectedEdge.toFinal && (
            <button className="edge-quick-action-swap" onClick={swapSelectedEdgeNodes} type="button">位置を入れ替える <span>⇄</span></button>
          )}
          {!selectedEdge.toFinal && (
            <button className="edge-quick-action-delete" onClick={deleteSelectedEdge} type="button">道筋を削除 <span>−</span></button>
          )}
          <button className="edge-quick-action-close" onClick={() => setSelectedEdgeId(null)} type="button">閉じる</button>
        </div>
      )}

      <div className={`edge-edit-controls ${isEdgeEditorOpen ? 'is-open' : ''}`} onClick={(event) => event.stopPropagation()} ref={edgeEditorRef}>
        {isEdgeEditorOpen && (
          <div className="edge-edit-panel">
            <strong className="edge-edit-title">マップの編集</strong>
            <div className="edge-edit-mode-list" aria-label="編集方法を選択">
              <button
                aria-pressed={edgeEditMode === 'add'}
                onClick={chooseEdgeEditMode}
                type="button"
              >＋ 道筋を追加</button>
              <button onClick={createFreeNode} type="button">＋ 新規目標の追加</button>
            </div>
            <div className="edge-edit-guide" role="status">
              <span>{edgeEditMessage}</span>
            </div>
          </div>
        )}
        {collapsibleIds.size > 0 && (
          <button
            className="collapsed-history"
            onClick={(event) => { event.stopPropagation(); setIsHistoryExpanded((current) => !current) }}
            type="button"
          >
            <span className="stable-toggle-label">{isHistoryExpanded ? '省略できる目標を隠す' : '省略された目標を表示'}</span>
            <span aria-hidden="true" className="stable-toggle-measure">{isHistoryExpanded ? '省略された目標を表示' : '省略できる目標を隠す'}</span>
          </button>
        )}
        <div className="map-bottom-actions">
          <button
            aria-label={showRemainingDays ? 'マップ全体を締切り日に切り替え' : 'マップ全体を残り日数に切り替え'}
            className="map-date-toggle"
            onClick={toggleDateDisplay}
            type="button"
          >
            <span className="stable-toggle-label">{showRemainingDays ? '締切り日' : '残り日数'}</span>
            <span aria-hidden="true" className="stable-toggle-measure">{showRemainingDays ? '残り日数' : '締切り日'}</span>
          </button>
          <button
            aria-expanded={isEdgeEditorOpen}
            className="edge-edit-button"
            hidden
            onClick={toggleEdgeEditor}
            type="button"
          >
            <span aria-hidden="true">{isEdgeEditorOpen ? '×' : '✎'}</span>
            {isEdgeEditorOpen ? '編集を終了' : '編集'}
          </button>
        </div>
      </div>

      {selectedNode && draftNode && (
        <>
          <button aria-label="目標詳細を閉じる" className="detail-scrim" {...backdropCloseHandlers(closeNodeDetail)} type="button" />
          <aside aria-modal="true" className="node-detail common-modal" aria-labelledby="node-detail-heading" role="dialog">
            <div className="detail-topline">
              <h2 id="node-detail-heading">目標詳細</h2>
              <button aria-label="目標詳細を閉じる" className="detail-close" onClick={closeNodeDetail} type="button"><span aria-hidden="true" className="button-glyph">×</span></button>
            </div>
            <div className="detail-hero">
              <div>
                <span className={`status-label status-${draftNode.status}`}>{getStatusLabel(draftNode.status)}</span>
                <h3>{draftNode.name}</h3>
              </div>
            </div>

            <div className="node-edit-form">
              <label className="node-edit-field">
                <span>目標名</span>
                <input onChange={(event) => updateDraft('name', event.target.value)} value={draftNode.name} />
              </label>

              <button
                className="node-completion-button"
                onClick={toggleNodeCompletion}
                type="button"
              >
                {draftNode.status === 'completed' ? 'この目標を未達成にする' : 'この目標を達成済みにする'}
              </button>

              <div className="node-toggle-section">
                <span className="node-toggle-label">目標の粒度</span>
                <div className="node-level-toggle" role="group" aria-label="目標の粒度">
                  {goalLevelOptions.map(([value, label]) => (
                    <button
                      aria-pressed={(draftNode.goalLevel ?? 'middle') === value}
                      className={(draftNode.goalLevel ?? 'middle') === value ? 'is-active' : ''}
                      key={value}
                      onClick={() => updateDraft('goalLevel', value)}
                      type="button"
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div className="node-edit-field node-date-field">
                <label>
                  <input
                    checked={Boolean(draftNode.targetDate)}
                    onChange={(event) => updateDraft('targetDate', event.target.checked ? (plan.goal.deadline || todayIsoDate()) : '')}
                    type="checkbox"
                  />
                  目標日を設定する
                </label>
                <input
                  disabled={!draftNode.targetDate}
                  onChange={(event) => updateDraft('targetDate', event.target.value)}
                  type="date"
                  value={draftNode.targetDate}
                />
              </div>
              <label className="node-edit-field">
                <span>説明</span>
                <textarea onChange={(event) => updateDraft('description', event.target.value)} rows={4} value={draftNode.description} />
              </label>

              <p className="node-autosave-note" role="status">
                {autoSaveStatus === 'saving' ? '保存中…' : autoSaveStatus === 'error' ? '保存できませんでした' : '保存済み'}
              </p>
              <div className="node-readonly">
                <span>前提となる目標</span>
                <strong>{draftNode.dependsOn.length > 0 ? draftNode.dependsOn.map((id) => nodeNames.get(id) ?? id).join('、') : 'なし'}</strong>
              </div>
            </div>
            <div className="node-detail-danger-zone">
              <button className="node-delete-button" onClick={confirmDeleteSelectedNode} type="button">この目標を削除</button>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
