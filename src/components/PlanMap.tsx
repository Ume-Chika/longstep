import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  actionableGoalIds,
  collapsibleCompletedIds,
  overflowingPrerequisiteIds,
  relatedNodeIds,
} from './planMapLogic'
import { backdropCloseHandlers } from './backdropClose'
import type { NewPlanNodeInput, NodeInsertion, PlanNode, PlanSnapshot } from '../models/plan'

interface PlanMapProps {
  plan: PlanSnapshot
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onClearSelection: () => void
  onUpdateNode: (node: PlanNode) => Promise<boolean>
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

interface DragConnection {
  pointerId: number
  fromNodeId: string
  fromX: number
  fromY: number
  currentX: number
  currentY: number
}

function todayIsoDate(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function defaultNewNodeInput(): NewPlanNodeInput {
  return {
    name: '新しい目標',
    targetDate: '',
    description: '',
    nextAction: '',
  }
}

const minimumMapWidth = 1000
const mapHeight = 700
const firstColumnX = 150
const columnSpacing = 270
const levelSpacing = 36
const finalGoalGap = 150
const rowSpacing = 140
const nodePortOffset = 90
const finalPortOffset = 104
const mapTopPadding = 104
const finalGoalMinY = mapTopPadding
const minMapZoom = 0.2
const maxMapZoom = 1.5
const mapZoomStep = 0.2

function clampZoom(value: number): number {
  return Math.min(maxMapZoom, Math.max(minMapZoom, Math.round(value * 100) / 100))
}

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

  const compareSiblingItems = (left: LayoutItem, right: LayoutItem): number => {
    if (left.node && right.node) {
      const completedDiff = Number(left.node.status === 'completed') - Number(right.node.status === 'completed')
      if (completedDiff !== 0) return completedDiff
      const leftDate = left.node.targetDate || '9999-99-99'
      const rightDate = right.node.targetDate || '9999-99-99'
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    }
    return left.originalOrder - right.originalOrder || left.id.localeCompare(right.id)
  }

  levelOrders.forEach((levelItems, level) => {
    levelOrders.set(level, [...levelItems].sort(compareSiblingItems))
  })

  // 右（終端）から左へ、接続先の後続ノードの行位置に合わせて並べ替えて枝の交差を防ぐ（同じ親を持つ兄弟同士は未着手・目標日順で整列）
  const rankById = new Map<string, number>()
  for (let level = finalLevel; level >= 0; level -= 1) {
    const items = levelOrders.get(level) ?? []
    if (level < maximumLevel) {
      items.sort((left, right) => {
        const leftSuccs = (successors.get(left.id) ?? []).map((id) => rankById.get(id)).filter((r): r is number => r !== undefined)
        const rightSuccs = (successors.get(right.id) ?? []).map((id) => rankById.get(id)).filter((r): r is number => r !== undefined)
        const leftRank = leftSuccs.length > 0 ? leftSuccs.reduce((a, b) => a + b, 0) / leftSuccs.length : Infinity
        const rightRank = rightSuccs.length > 0 ? rightSuccs.reduce((a, b) => a + b, 0) / rightSuccs.length : Infinity
        if (Math.abs(leftRank - rightRank) > 0.01) return leftRank - rightRank
        return compareSiblingItems(left, right)
      })
      levelOrders.set(level, items)
    }
    items.forEach((item, index) => rankById.set(item.id, index))
  }

  const itemById = new Map<string, LayoutItem>()
  levelOrders.forEach((items) => items.forEach((item) => itemById.set(item.id, item)))
  const minYByLevel = new Map<number, number>()
  let nextBandY = mapTopPadding
  const visitingPlace = new Set<string>()

  function placeItem(item: LayoutItem) {
    if (yById.has(item.id) || visitingPlace.has(item.id)) return
    visitingPlace.add(item.id)
    const minLevelY = minYByLevel.get(item.level) ?? mapTopPadding
    const depItems = (item.node?.dependsOn ?? [])
      .map((id) => itemById.get(id))
      .filter((candidate): candidate is LayoutItem => candidate !== undefined)
      .sort((a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0))

    if (depItems.length === 0) {
      const y = Math.max(nextBandY, minLevelY)
      yById.set(item.id, y)
      minYByLevel.set(item.level, y + rowSpacing)
      nextBandY = Math.max(nextBandY, y + rowSpacing)
      visitingPlace.delete(item.id)
      return
    }

    nextBandY = Math.max(nextBandY, minLevelY)
    depItems.forEach(placeItem)

    const activeCount = depItems.filter((dep) => dep.node?.status !== 'completed').length
    const focusDeps = item.node?.status !== 'completed'
      ? depItems.slice(0, Math.max(3, activeCount))
      : depItems
    const depYs = focusDeps
      .map((dep) => yById.get(dep.id))
      .filter((y): y is number => y !== undefined)
    const desiredY = depYs.length > 0
      ? Math.round(depYs.reduce((a, b) => a + b, 0) / depYs.length)
      : minLevelY
    const y = Math.max(minLevelY, desiredY)
    yById.set(item.id, y)
    minYByLevel.set(item.level, y + rowSpacing)
    nextBandY = Math.max(nextBandY, y + rowSpacing)
    visitingPlace.delete(item.id)
  }

  for (let level = maximumLevel; level >= 0; level -= 1) {
    ;(levelOrders.get(level) ?? []).forEach(placeItem)
  }

  // 最終目標は未着手（なければ上位3件）の終端ノード群のY中心に配置する
  const activeTerminals = terminalNodeIds.filter((id) => nodesById.get(id)?.status !== 'completed')
  const focusTerminalIds = activeTerminals.length > 0 ? activeTerminals : terminalNodeIds.slice(0, 3)
  const terminalYs = focusTerminalIds
    .map((id) => yById.get(id))
    .filter((y): y is number => y !== undefined)
  const finalGoalCenterY = terminalYs.length > 0
    ? Math.max(finalGoalMinY, Math.round(terminalYs.reduce((a, b) => a + b, 0) / terminalYs.length))
    : finalGoalMinY
  const finalGoalY = terminalYs.length > 1 ? Math.min(384, finalGoalCenterY) : finalGoalCenterY
  yById.set(finalItemId, finalGoalY)

  const maxAssignedY = Math.max(finalGoalY, ...yById.values())
  const layoutHeight = Math.max(mapHeight, maxAssignedY + 130)

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
    ? itemPositionById.get(finalItemId) ?? { x: minimumMapWidth / 2, y: finalGoalMinY }
    : { x: minimumMapWidth / 2, y: finalGoalMinY }
  const mapWidth = Math.max(minimumMapWidth, finalPosition.x + 200)

  const edges = layoutEdges.flatMap<MapEdge>((edge) => {
    const rawPoints = edge.itemIds
      .map((itemId) => itemPositionById.get(itemId))
      .filter((point): point is MapPoint => point !== undefined)
    if (rawPoints.length < 2) return []

    const startPoint = {
      x: rawPoints[0].x + nodePortOffset,
      y: rawPoints[0].y,
    }
    const endPortOffset = edge.toFinal ? finalPortOffset : nodePortOffset
    const endPoint = {
      x: rawPoints.at(-1)!.x - endPortOffset,
      y: rawPoints.at(-1)!.y,
    }
    const isNearlyStraight = Math.abs(startPoint.y - endPoint.y) < 8
    const isLongVerticalSpan = Math.abs(startPoint.y - endPoint.y) > rowSpacing * 1.8
    const dx = Math.max(60, endPoint.x - startPoint.x)
    const exitStub = Math.max(20, Math.min(34, Math.round(dx * 0.22)))
    const entryStub = Math.max(24, Math.min(40, Math.round(dx * 0.26)))
    const trunkX = endPoint.x - entryStub
    const routePoints = isNearlyStraight
      ? [startPoint, endPoint]
      : isLongVerticalSpan
        ? [
            startPoint,
            { x: trunkX, y: startPoint.y },
            { x: trunkX, y: endPoint.y },
            endPoint,
          ]
        : [
            startPoint,
            { x: startPoint.x + exitStub, y: startPoint.y },
            { x: endPoint.x - entryStub, y: endPoint.y },
            endPoint,
          ]
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
  const edgeQuickActionRef = useRef<HTMLDivElement>(null)
  const draftDirtyRef = useRef(false)
  const selectedNode = plan.nodes.find((node) => node.id === selectedNodeId)
  const nodeNames = new Map(plan.nodes.map((node) => [node.id, node.name]))
  const positionById = new Map(layout.positions.map((position) => [position.node.id, position]))
  const [draftNode, setDraftNode] = useState<PlanNode | undefined>(selectedNode)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [dragConnection, setDragConnection] = useState<DragConnection | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [showRemainingDays, setShowRemainingDays] = useState(false)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [edgeDropTargetId, setEdgeDropTargetId] = useState<string | null>(null)
  const [isViewOptionsOpen, setIsViewOptionsOpen] = useState(false)
  const viewOptionsRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom
  const detailPressStartedInsideRef = useRef(false)
  const selectedEdge = layout.edges.find((edge) => edge.id === selectedEdgeId)
  const relatedIds = useMemo(() => hoveredNodeId
    ? relatedNodeIds(plan.nodes, hoveredNodeId)
    : null, [hoveredNodeId, plan.nodes])

  const applyZoom = useCallback((targetZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const nextZoom = clampZoom(targetZoom)
    const prevZoom = zoomRef.current
    if (nextZoom === prevZoom) return
    const map = mapRef.current
    if (map) {
      const rect = map.getBoundingClientRect()
      const offsetX = anchor ? anchor.clientX - rect.left : map.clientWidth / 2
      const offsetY = anchor ? anchor.clientY - rect.top : map.clientHeight / 2
      const mapX = (map.scrollLeft + offsetX) / prevZoom
      const mapY = (map.scrollTop + offsetY) / prevZoom
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      requestAnimationFrame(() => {
        map.scrollLeft = Math.max(0, mapX * nextZoom - offsetX)
        map.scrollTop = Math.max(0, mapY * nextZoom - offsetY)
      })
      return
    }
    zoomRef.current = nextZoom
    setZoom(nextZoom)
  }, [])

  function fitMapToViewport() {
    const map = mapRef.current
    if (!map) return
    const fitScale = Math.min(
      1,
      (map.clientWidth - 24) / layout.width,
      (map.clientHeight - 24) / layout.height,
    )
    const nextZoom = clampZoom(fitScale)
    zoomRef.current = nextZoom
    setZoom(nextZoom)
    requestAnimationFrame(() => {
      map.scrollTo({ left: 0, top: 0, behavior: 'auto' })
    })
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const step = Math.max(-0.2, Math.min(0.2, -event.deltaY * 0.006))
      applyZoom(zoomRef.current + step, { clientX: event.clientX, clientY: event.clientY })
    }
    map.addEventListener('wheel', handleWheel, { passive: false })
    return () => map.removeEventListener('wheel', handleWheel)
  }, [applyZoom])

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

  const selectedNodeIdRef = useRef<string | null>(null)

  const flushDraft = useCallback((immediateDraft?: PlanNode) => {
    const nodeToSave = immediateDraft ?? draftNode
    if (!nodeToSave || !draftDirtyRef.current) return
    draftDirtyRef.current = false
    setAutoSaveStatus('saving')
    void onUpdateNode(nodeToSave).then((saved) => setAutoSaveStatus(saved ? 'saved' : 'error'))
  }, [draftNode, onUpdateNode])

  useEffect(() => {
    if (selectedNode?.id !== selectedNodeIdRef.current) {
      selectedNodeIdRef.current = selectedNode?.id ?? null
      draftDirtyRef.current = false
      setDraftNode(selectedNode)
      setAutoSaveStatus('saved')
    }
  }, [selectedNode])

  useEffect(() => {
    if (!draftNode || !draftDirtyRef.current) return

    const timer = window.setTimeout(() => {
      flushDraft()
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [draftNode, flushDraft])

  useEffect(() => {
    setDragConnection(null)
    setEdgeDropTargetId(null)
    setSelectedEdgeId(null)
    setShowRemainingDays(false)
    setIsHistoryExpanded(false)
    zoomRef.current = 1
    setZoom(1)
  }, [plan.goal.deadline, plan.id])

  useEffect(() => {
    if (selectedEdgeId && !layout.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null)
    }
  }, [layout.edges, selectedEdgeId])

  useEffect(() => {
    if (!selectedEdgeId) return

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target && edgeQuickActionRef.current?.contains(target)) {
        return
      }
      setDragConnection(null)
      setSelectedEdgeId(null)
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [selectedEdgeId])

  useEffect(() => {
    if (!isViewOptionsOpen) return
    const handleOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && viewOptionsRef.current?.contains(target)) return
      setIsViewOptionsOpen(false)
    }
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsViewOptionsOpen(false)
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isViewOptionsOpen])

  useEffect(() => {
    if (!selectedNode) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      flushDraft()
      onClearSelection()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [flushDraft, onClearSelection, selectedNode])

  function updateDraft(
    field: 'name' | 'status' | 'targetDate' | 'description' | 'goalLevel',
    value: string,
    immediate = false,
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

    if (immediate) {
      flushDraft(nextNode)
    }
  }

  function closeNodeDetail() {
    flushDraft()
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
    setSelectedEdgeId(null)
    onSelectNode(nodeId)
  }

  function createNodeFromInput(input: NewPlanNodeInput, insertion?: NodeInsertion) {
    void onCreateNode(input, insertion).then((created) => {
      if (!created) return
      setSelectedEdgeId(null)
    })
  }

  function createFreeNode() {
    createNodeFromInput(defaultNewNodeInput())
  }

  function createChildNode(event: { preventDefault: () => void; stopPropagation: () => void }, nodeId: string) {
    event.preventDefault()
    event.stopPropagation()
    createNodeFromInput(defaultNewNodeInput(), {
      prerequisiteForId: nodeId,
    })
  }

  function createNodeOnSelectedEdge() {
    if (!selectedEdge) return

    createNodeFromInput(defaultNewNodeInput(), {
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

  function beginEdgeDrag(event: ReactPointerEvent<HTMLElement>, nodeId: string) {
    const position = positionById.get(nodeId)
    const pointer = pointerPosition(event)
    if (!position || !pointer) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedEdgeId(null)
    setEdgeDropTargetId(null)
    setDragConnection({
      pointerId: event.pointerId,
      fromNodeId: nodeId,
      fromX: position.x + nodePortOffset,
      fromY: position.y,
      currentX: pointer.x,
      currentY: pointer.y,
    })
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

    const targetElement = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-node-id]')
    const targetId = targetElement?.dataset.nodeId
    setEdgeDropTargetId(targetId && targetId !== dragConnection.fromNodeId ? targetId : null)
  }

  function finishEdgeDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    const targetElement = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-node-id]')
    const candidateId = targetElement?.dataset.nodeId
    const targetNodeId = edgeDropTargetId ?? (candidateId && candidateId !== dragConnection.fromNodeId ? candidateId : null)
    const fromNodeId = dragConnection.fromNodeId

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragConnection(null)
    setEdgeDropTargetId(null)

    if (!targetNodeId) return
    void onAddEdge(fromNodeId, targetNodeId)
  }

  function cancelEdgeDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    setDragConnection(null)
    setEdgeDropTargetId(null)
  }

  function chooseEdge(edge: MapEdge) {
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
      if (deleted) setSelectedEdgeId(null)
    })
  }

  function swapSelectedEdgeNodes() {
    if (!selectedEdge || selectedEdge.toFinal) return
    void onSwapEdgeNodes(selectedEdge.fromId, selectedEdge.toId).then((swapped) => {
      if (swapped) setSelectedEdgeId(null)
    })
  }

  function confirmDeleteSelectedNode() {
    if (!selectedNode || !window.confirm(`「${selectedNode.name}」を削除しますか？\n前後の道筋をつなぎ直して削除します。`)) return
    void onDeleteNode(selectedNode.id).then((deleted) => {
      if (deleted) onClearSelection()
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
      <section className="map-panel" aria-label="計画マップ">
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
            className="node-map-stage"
            style={{
              height: `${Math.round(layout.height * zoom)}px`,
              width: `${Math.round(layout.width * zoom)}px`,
            }}
          >
          <div
            className="node-map-canvas"
            ref={canvasRef}
            style={{
              '--map-min-height': `${layout.height}px`,
              '--map-min-width': `${layout.width}px`,
              transform: zoom === 1 ? undefined : `scale(${zoom})`,
            } as CSSProperties}
          >
          <svg aria-label="目標間の道筋" className="map-edge-layer" preserveAspectRatio="none" viewBox={`0 0 ${layout.width} ${layout.height}`}>
            {layout.edges.map((edge) => (
              <g
                aria-label={edge.toFinal ? undefined : `${nodeNames.get(edge.fromId) ?? edge.fromId}から${nodeNames.get(edge.toId) ?? edge.toId}への道筋`}
                className={`map-edge-group is-selectable ${selectedEdgeId === edge.id ? 'is-selected' : ''} ${relatedIds && relatedIds.has(edge.fromId) && (edge.toFinal || relatedIds.has(edge.toId)) ? 'is-related' : relatedIds ? 'is-unrelated' : ''}`}
                data-edge-id={edge.id}
                data-from-id={edge.fromId}
                data-route-point-count={edge.routePoints?.length ?? 2}
                data-to-id={edge.toId}
                key={edge.id}
                onClick={(event) => selectEdge(event, edge)}
                onKeyDown={(event) => selectEdgeByKeyboard(event, edge)}
                role="button"
                tabIndex={0}
              >
                <path className="map-edge-hit-area" d={edgePath(edge)} />
                <path className={`map-edge ${edge.toFinal && positionById.get(edge.fromId)?.node.status !== 'completed' ? 'to-final' : ''}`} d={edgePath(edge)} />
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

          {layout.positions.map(({ node, x, y }) => (
            <button
              aria-label={`${node.name}、${getStatusLabel(node.status)}、${goalLevelLabels[node.goalLevel ?? 'middle']}`}
              className={`node-card status-${node.status} goal-level-${node.goalLevel ?? 'middle'} attention-${nodeAttention.get(node.id) ?? 'upcoming'} ${isActionableGoal(node, nodeAttention.get(node.id)) ? 'is-actionable-goal' : ''} ${node.recurrence?.enabled ? 'is-repeat' : ''} repeat-count-${Math.min(5, node.recurrence?.completedCount ?? 0)} ${node.id === selectedNode?.id ? 'is-selected' : ''} ${node.id === hoveredNodeId ? 'is-hovered' : ''} ${node.id === dragConnection?.fromNodeId ? 'is-edge-start' : ''} ${node.id === edgeDropTargetId ? 'is-drop-target' : ''} ${relatedIds?.has(node.id) ? 'is-related' : relatedIds ? 'is-unrelated' : ''}`}
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
                {node.targetDate && (
                  <time className={node.status !== 'completed' && (daysFromToday(node.targetDate) ?? 99) <= 7 ? 'is-urgent' : undefined}>
                    {showRemainingDays
                      ? formatRemainingDays(node.targetDate)
                      : formatDate(node.targetDate)}
                  </time>
                )}
              </span>
              {hoveredNodeId === node.id && node.description && (
                <span className={`node-hover-description ${layout.height - y < 220 ? 'is-above' : ''} ${x < 170 ? 'is-left' : layout.width - x < 170 ? 'is-right' : ''}`} role="tooltip">
                  {node.description.length > 120 ? `${node.description.slice(0, 120)}…` : node.description}
                </span>
              )}
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
            onClick={(event) => { event.stopPropagation(); setSelectedEdgeId(null); closeNodeDetail(); onOpenPlanMenu() }}
            onMouseEnter={() => setHoveredNodeId('__final-goal__')}
            onMouseLeave={() => setHoveredNodeId(null)}
            style={{
              '--node-x': `${(layout.finalPosition.x / layout.width) * 100}%`,
              '--node-y': `${(layout.finalPosition.y / layout.height) * 100}%`,
            } as CSSProperties}
            title={plan.goal.description || plan.goal.statement}
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
            {plan.goal.deadline && (
              <span>{showRemainingDays ? formatRemainingDays(plan.goal.deadline) : formatDate(plan.goal.deadline)}</span>
            )}
            {hoveredNodeId === '__final-goal__' && (plan.goal.description || plan.goal.statement.length > 24) && (
              <span className={`node-hover-description is-right ${layout.height - layout.finalPosition.y < 220 ? 'is-above' : ''}`} role="tooltip">
                {(plan.goal.description || plan.goal.statement).length > 120
                  ? `${(plan.goal.description || plan.goal.statement).slice(0, 120)}…`
                  : (plan.goal.description || plan.goal.statement)}
              </span>
            )}
          </button>
          </div>
          </div>
        </div>
      </section>

      {selectedEdge && (
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

      <div className="map-view-controls" onClick={(event) => event.stopPropagation()} ref={viewOptionsRef}>
        <button
          aria-expanded={isViewOptionsOpen}
          aria-haspopup="dialog"
          aria-label="マップの表示設定"
          className={`map-view-trigger ${isViewOptionsOpen ? 'is-open' : ''}`}
          onClick={() => setIsViewOptionsOpen((current) => !current)}
          type="button"
        >
          <span className="view-trigger-label">表示</span>
          <svg aria-hidden="true" className="view-trigger-arrow" viewBox="0 0 5 3">
            {isViewOptionsOpen ? (
              <path d="M2 0h1v1H2zM1 1h3v1H1zM0 2h5v1H0z" fill="currentColor" shapeRendering="crispEdges" />
            ) : (
              <path d="M0 0h5v1H0zM1 1h3v1H1zM2 2h1v1H2z" fill="currentColor" shapeRendering="crispEdges" />
            )}
          </svg>
        </button>

        {isViewOptionsOpen && (
          <div aria-label="マップの表示設定" className="map-view-popover" role="dialog">
            <div className="view-popover-title">
              <span>◆ 表示設定</span>
              <button aria-label="表示設定を閉じる" className="view-popover-close" onClick={() => setIsViewOptionsOpen(false)} type="button">×</button>
            </div>

            <div className="view-popover-item">
              <span className="view-item-label">目標の日付表記</span>
              <div aria-label="目標の日付表記" className="view-item-segmented" role="group">
                <button
                  aria-pressed={!showRemainingDays}
                  className={!showRemainingDays ? 'is-active' : ''}
                  onClick={() => { if (showRemainingDays) toggleDateDisplay() }}
                  type="button"
                >締切り日</button>
                <button
                  aria-pressed={showRemainingDays}
                  className={showRemainingDays ? 'is-active' : ''}
                  onClick={() => { if (!showRemainingDays) toggleDateDisplay() }}
                  type="button"
                >残り日数</button>
              </div>
            </div>

            {collapsibleIds.size > 0 && (
              <div className="view-popover-item">
                <span className="view-item-label">過去の目標（{collapsibleIds.size}件）</span>
                <div aria-label="過去の達成済み目標の表示" className="view-item-segmented" role="group">
                  <button
                    aria-pressed={!isHistoryExpanded}
                    className={!isHistoryExpanded ? 'is-active' : ''}
                    onClick={() => { if (isHistoryExpanded) setIsHistoryExpanded(false) }}
                    type="button"
                  >省略する</button>
                  <button
                    aria-pressed={isHistoryExpanded}
                    className={isHistoryExpanded ? 'is-active' : ''}
                    onClick={() => { if (!isHistoryExpanded) setIsHistoryExpanded(true) }}
                    type="button"
                  >全て表示</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div aria-label="マップの拡大縮小" className="map-zoom-dock" onClick={(event) => event.stopPropagation()} role="group">
        <button
          aria-label="マップを縮小"
          className="map-zoom-button"
          disabled={zoom <= minMapZoom}
          onClick={() => applyZoom(zoomRef.current - mapZoomStep)}
          title="縮小"
          type="button"
        >−</button>
        <button
          aria-label={`拡大率${Math.round(zoom * 100)}パーセント、等倍に戻す`}
          className="map-zoom-reset"
          onClick={() => applyZoom(1)}
          title="等倍（100%）に戻す"
          type="button"
        >{Math.round(zoom * 100)}%</button>
        <button
          aria-label="マップを拡大"
          className="map-zoom-button"
          disabled={zoom >= maxMapZoom}
          onClick={() => applyZoom(zoomRef.current + mapZoomStep)}
          title="拡大"
          type="button"
        >＋</button>
        <button
          aria-label="マップ全体を画面に収める"
          className="map-zoom-fit"
          onClick={fitMapToViewport}
          title="全体を画面に収める"
          type="button"
        >全体</button>
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
                <input
                  onBlur={() => flushDraft()}
                  onChange={(event) => updateDraft('name', event.target.value)}
                  value={draftNode.name}
                />
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
                      onClick={() => updateDraft('goalLevel', value, true)}
                      type="button"
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div className="node-edit-field node-date-field">
                <label>
                  <input
                    checked={Boolean(draftNode.targetDate)}
                    onChange={(event) => updateDraft('targetDate', event.target.checked ? (plan.goal.deadline || todayIsoDate()) : '', true)}
                    type="checkbox"
                  />
                  目標日を設定する
                </label>
                <input
                  disabled={!draftNode.targetDate}
                  onBlur={() => flushDraft()}
                  onChange={(event) => updateDraft('targetDate', event.target.value)}
                  type="date"
                  value={draftNode.targetDate}
                />
              </div>
              <label className="node-edit-field">
                <span>説明</span>
                <textarea
                  onBlur={() => flushDraft()}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  placeholder="この目標の要点や参考ファイルパスを入力"
                  rows={4}
                  value={draftNode.description}
                />
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
