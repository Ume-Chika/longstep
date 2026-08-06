import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { NodeSprite } from './NodeSprite'
import { ThemeCrest } from './ThemeCrest'
import type { PlanNode, PlanSnapshot } from '../models/plan'
import type { ThemeId } from '../models/theme'

interface PlanMapProps {
  plan: PlanSnapshot
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onClearSelection: () => void
  onUpdateNode: (node: PlanNode) => void
  onAddEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onDeleteEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  theme: ThemeId
}

const statusLabels = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '達成済み',
} as const

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

type LayoutItemKind = 'node' | 'dummy' | 'final'

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

type EdgeEditMode = 'add' | 'delete'

interface DragConnection {
  pointerId: number
  fromNodeId: string
  fromX: number
  fromY: number
  currentX: number
  currentY: number
}

const minimumMapWidth = 1000
const mapHeight = 700
const firstColumnX = 150
const columnSpacing = 270
const levelSpacing = 36
const finalGoalGap = 250
const maximumRowsPerColumn = 4
const rowSpacing = 145
const nodePortOffset = 92
const preferredMapCenterY = mapHeight * 0.42

function getNodeLevels(nodes: PlanNode[]): Map<string, number> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const levels = new Map<string, number>()
  const visiting = new Set<string>()

  function getLevel(nodeId: string): number {
    const cachedLevel = levels.get(nodeId)
    if (cachedLevel !== undefined) return cachedLevel
    if (visiting.has(nodeId)) return 0

    const node = nodesById.get(nodeId)
    if (!node) return 0

    visiting.add(nodeId)
    const dependencyLevels = node.dependsOn
      .filter((dependencyId) => nodesById.has(dependencyId))
      .map(getLevel)
    visiting.delete(nodeId)

    const level = dependencyLevels.length > 0 ? Math.max(...dependencyLevels) + 1 : 0
    levels.set(nodeId, level)
    return level
  }

  nodes.forEach((node) => getLevel(node.id))
  return levels
}

function createMapLayout(nodes: PlanNode[]): MapLayout {
  const levels = getNodeLevels(nodes)
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const successors = new Map<string, string[]>()
  const levelOrders = new Map<number, LayoutItem[]>()
  const layoutEdges: LayoutEdge[] = []
  const previousItemIds = new Map<string, string[]>()
  const nextItemIds = new Map<string, string[]>()
  const yById = new Map<string, number>()
  const maximumLevel = Math.max(0, ...levels.values())
  const finalLevel = maximumLevel + 1
  const finalItemId = '__final-goal__'

  function addItem(item: LayoutItem) {
    levelOrders.set(item.level, [...(levelOrders.get(item.level) ?? []), item])
  }

  nodes.forEach((node, index) => {
    const level = levels.get(node.id) ?? 0
    addItem({ id: node.id, kind: 'node', level, originalOrder: index, node })
    node.dependsOn.forEach((dependencyId) => {
      if (!nodesById.has(dependencyId)) return
      successors.set(dependencyId, [...(successors.get(dependencyId) ?? []), node.id])
    })
  })

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
    const fromLevel = levels.get(fromId) ?? 0
    const toLevel = toFinal ? finalLevel : levels.get(toId) ?? fromLevel + 1
    const edgeId = toFinal ? `${fromId}-final` : `${fromId}-${toId}`
    const itemIds = [fromId]

    // 長辺を隣接層ごとの短辺へ分ける。仮想ノードは表示・保存しない。
    for (let level = fromLevel + 1; level < toLevel; level += 1) {
      const dummyId = `__dummy__:${edgeId}:${level}`
      addItem({
        id: dummyId,
        kind: 'dummy',
        level,
        originalOrder: nodes.length + layoutEdges.length,
      })
      itemIds.push(dummyId)
    }

    itemIds.push(toFinal ? finalItemId : toId)
    layoutEdges.push({ id: edgeId, fromId, toId, toFinal, itemIds })
  }

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyId) => {
      if (nodesById.has(dependencyId)) addLayoutEdge(dependencyId, node.id, false)
    })
  })
  terminalNodeIds.forEach((nodeId) => addLayoutEdge(nodeId, 'final', true))

  layoutEdges.forEach((edge) => {
    for (let index = 0; index < edge.itemIds.length - 1; index += 1) {
      const fromItemId = edge.itemIds[index]
      const toItemId = edge.itemIds[index + 1]
      nextItemIds.set(fromItemId, [...(nextItemIds.get(fromItemId) ?? []), toItemId])
      previousItemIds.set(toItemId, [...(previousItemIds.get(toItemId) ?? []), fromItemId])
    }
  })

  levelOrders.forEach((levelItems, level) => {
    levelOrders.set(level, [...levelItems].sort((left, right) => (
      left.originalOrder - right.originalOrder || left.id.localeCompare(right.id)
    )))
  })

  function centeredY(rowIndex: number, rowCount: number): number {
    const occupiedHeight = (rowCount - 1) * rowSpacing
    return preferredMapCenterY - occupiedHeight / 2 + rowIndex * rowSpacing
  }

  function assignCenteredPositions(levelItems: LayoutItem[]) {
    for (let start = 0; start < levelItems.length; start += maximumRowsPerColumn) {
      const columnItems = levelItems.slice(start, start + maximumRowsPerColumn)
      columnItems.forEach((item, rowIndex) => {
        yById.set(item.id, centeredY(rowIndex, columnItems.length))
      })
    }
  }

  levelOrders.forEach(assignCenteredPositions)

  function averageNeighborY(nodeIds: string[], fallback: number): number {
    const values = nodeIds
      .map((nodeId) => yById.get(nodeId))
      .filter((value): value is number => value !== undefined)
    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : fallback
  }

  function reorderLevel(level: number, direction: 'predecessors' | 'successors') {
    const levelItems = levelOrders.get(level)
    if (!levelItems || levelItems.length < 2) return
    const previousIndex = new Map(levelItems.map((item, index) => [item.id, index]))

    const reordered = [...levelItems].sort((left, right) => {
      const neighborIds = (item: LayoutItem) => direction === 'predecessors'
        ? previousItemIds.get(item.id) ?? []
        : nextItemIds.get(item.id) ?? []
      const leftCenter = averageNeighborY(neighborIds(left), yById.get(left.id) ?? mapHeight / 2)
      const rightCenter = averageNeighborY(neighborIds(right), yById.get(right.id) ?? mapHeight / 2)
      const difference = leftCenter - rightCenter
      if (Math.abs(difference) > 0.5) return difference
      return (previousIndex.get(left.id) ?? 0) - (previousIndex.get(right.id) ?? 0)
    })

    levelOrders.set(level, reordered)
    assignCenteredPositions(reordered)
  }

  // 前提側からと接続先側からの重心を交互に反映し、極端な折れを減らす。
  for (let iteration = 0; iteration < 6; iteration += 1) {
    for (let level = 1; level <= finalLevel; level += 1) {
      reorderLevel(level, 'predecessors')
    }
    for (let level = finalLevel - 1; level >= 0; level -= 1) {
      reorderLevel(level, 'successors')
    }
  }

  function assignBalancedPositions(levelItems: LayoutItem[]) {
    for (let start = 0; start < levelItems.length; start += maximumRowsPerColumn) {
      const columnItems = levelItems.slice(start, start + maximumRowsPerColumn)
      const minimumY = 70
      const maximumY = mapHeight - 70
      const desiredY = columnItems.map((item, rowIndex) => {
        const neighborIds = [
          ...(previousItemIds.get(item.id) ?? []),
          ...(nextItemIds.get(item.id) ?? []),
        ]
        return averageNeighborY(neighborIds, centeredY(rowIndex, columnItems.length))
      })
      const positions = desiredY.map((value) => Math.min(maximumY, Math.max(minimumY, value)))

      for (let index = 1; index < positions.length; index += 1) {
        positions[index] = Math.max(positions[index], positions[index - 1] + rowSpacing)
      }
      if (positions.at(-1)! > maximumY) {
        const overflow = positions.at(-1)! - maximumY
        positions.forEach((value, index) => { positions[index] = value - overflow })
      }
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        positions[index] = Math.min(positions[index], positions[index + 1] - rowSpacing)
      }
      if (positions[0] < minimumY) {
        const underflow = minimumY - positions[0]
        positions.forEach((value, index) => { positions[index] = value + underflow })
      }

      columnItems.forEach((item, rowIndex) => yById.set(item.id, positions[rowIndex]))
    }
  }

  // 並び順を固定した後、前後両方の重心へ近づけながら最小間隔を維持する。
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let level = 0; level <= finalLevel; level += 1) {
      const levelItems = levelOrders.get(level)
      if (levelItems) assignBalancedPositions(levelItems)
    }
    for (let level = finalLevel; level >= 0; level -= 1) {
      const levelItems = levelOrders.get(level)
      if (levelItems) assignBalancedPositions(levelItems)
    }
  }

  // グラフ全体が画面下へ引っ張られないよう、相対配置を保ったまま重心だけを上寄せする。
  if (yById.size > 0) {
    const yValues = [...yById.values()]
    const currentCenterY = yValues.reduce((sum, value) => sum + value, 0) / yValues.length
    const minimumY = Math.min(...yValues)
    const maximumY = Math.max(...yValues)
    const desiredShift = preferredMapCenterY - currentCenterY
    const minimumShift = 70 - minimumY
    const maximumShift = mapHeight - 70 - maximumY
    const verticalShift = Math.min(maximumShift, Math.max(minimumShift, desiredShift))

    yById.forEach((value, nodeId) => {
      yById.set(nodeId, value + verticalShift)
    })
  }

  const positions: PositionedNode[] = []
  const itemPositionById = new Map<string, MapPoint>()
  let nextColumnX = firstColumnX

  for (let level = 0; level <= finalLevel; level += 1) {
    const levelItems = levelOrders.get(level) ?? []
    if (levelItems.length === 0) continue
    const columnCount = Math.max(1, Math.ceil(levelItems.length / maximumRowsPerColumn))
    const levelStartX = level === finalLevel && nodes.length > 0
      ? nextColumnX + finalGoalGap
      : nextColumnX

    levelItems.forEach((item, index) => {
      const columnIndex = Math.floor(index / maximumRowsPerColumn)
      const itemPosition = {
        x: levelStartX + columnIndex * columnSpacing,
        y: yById.get(item.id) ?? mapHeight / 2,
      }
      itemPositionById.set(item.id, itemPosition)

      if (item.kind === 'node' && item.node) {
        const position = { node: item.node, ...itemPosition }
        positions.push(position)
      }
    })

    nextColumnX = levelStartX + columnCount * columnSpacing + levelSpacing
  }

  const finalPosition = nodes.length > 0
    ? itemPositionById.get(finalItemId) ?? { x: minimumMapWidth / 2, y: preferredMapCenterY }
    : { x: minimumMapWidth / 2, y: preferredMapCenterY }
  const mapWidth = Math.max(minimumMapWidth, finalPosition.x + 150)

  const edges = layoutEdges.flatMap<MapEdge>((edge) => {
    const rawPoints = edge.itemIds
      .map((itemId) => itemPositionById.get(itemId))
      .filter((point): point is MapPoint => point !== undefined)
    if (rawPoints.length < 2) return []

    const routePoints = rawPoints.map((point, index) => ({
      x: index === 0
        ? point.x + nodePortOffset
        : index === rawPoints.length - 1
          ? point.x - nodePortOffset
          : point.x,
      y: point.y,
    }))
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

  return { positions, edges, width: mapWidth, height: mapHeight, finalPosition }
}

function edgePath(edge: MapEdge): string {
  const points = edge.routePoints && edge.routePoints.length >= 2
    ? edge.routePoints
    : [{ x: edge.fromX, y: edge.fromY }, { x: edge.toX, y: edge.toY }]

  return points.slice(1).reduce((path, point, index) => {
    const previousPoint = points[index]
    const distance = point.x - previousPoint.x
    const direction = distance >= 0 ? 1 : -1
    const handle = Math.min(150, Math.max(28, Math.abs(distance) * 0.42))
    return `${path} C ${previousPoint.x + handle * direction} ${previousPoint.y}, ${point.x - handle * direction} ${point.y}, ${point.x} ${point.y}`
  }, `M ${points[0].x} ${points[0].y}`)
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

export function PlanMap({
  plan,
  selectedNodeId,
  onSelectNode,
  onClearSelection,
  onUpdateNode,
  onAddEdge,
  onDeleteEdge,
  theme,
}: PlanMapProps) {
  const layout = useMemo(() => createMapLayout(plan.nodes), [plan.nodes])
  const canvasRef = useRef<HTMLDivElement>(null)
  const selectedNode = plan.nodes.find((node) => node.id === selectedNodeId)
  const nodeNames = new Map(plan.nodes.map((node) => [node.id, node.name]))
  const positionById = new Map(layout.positions.map((position) => [position.node.id, position]))
  const [draftNode, setDraftNode] = useState<PlanNode | undefined>(selectedNode)
  const [isEdgeEditorOpen, setIsEdgeEditorOpen] = useState(false)
  const [edgeEditMode, setEdgeEditMode] = useState<EdgeEditMode | null>(null)
  const [dragConnection, setDragConnection] = useState<DragConnection | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [edgeEditMessage, setEdgeEditMessage] = useState('追加または削除を選んでください。')
  const selectedEdge = layout.edges.find((edge) => edge.id === selectedEdgeId && !edge.toFinal)

  useEffect(() => {
    setDraftNode(selectedNode)
  }, [selectedNode])

  useEffect(() => {
    setIsEdgeEditorOpen(false)
    setEdgeEditMode(null)
    setDragConnection(null)
    setSelectedEdgeId(null)
    setEdgeEditMessage('追加または削除を選んでください。')
  }, [plan.id])

  useEffect(() => {
    if (selectedEdgeId && !layout.edges.some((edge) => edge.id === selectedEdgeId && !edge.toFinal)) {
      setSelectedEdgeId(null)
    }
  }, [layout.edges, selectedEdgeId])

  function updateDraft(
    field: 'name' | 'status' | 'progress' | 'targetDate' | 'difficulty' | 'description' | 'nextAction',
    value: string,
  ) {
    setDraftNode((current) => {
      if (!current) return current

      if (field === 'progress') {
        return { ...current, progress: Math.min(100, Math.max(0, Number(value) || 0)) }
      }
      if (field === 'status') {
        return { ...current, status: value as PlanNode['status'] }
      }
      return { ...current, [field]: value }
    })
  }

  function selectNode(event: MouseEvent<HTMLButtonElement>, nodeId: string) {
    event.stopPropagation()

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
    setEdgeEditMessage('追加または削除を選んでください。')
    onClearSelection()
  }

  function chooseEdgeEditMode(mode: EdgeEditMode) {
    setEdgeEditMode(mode)
    setDragConnection(null)
    setSelectedEdgeId(null)
    setEdgeEditMessage(mode === 'add'
      ? '始点から接続先までドラッグしてください。'
      : '削除する道筋を選んでください。')
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

  function beginEdgeDrag(event: ReactPointerEvent<HTMLButtonElement>, nodeId: string) {
    if (edgeEditMode !== 'add') return
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
    setEdgeEditMessage('接続先の中間目標上で離してください。')
  }

  function moveEdgeDrag(event: ReactPointerEvent<HTMLButtonElement>) {
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

  function finishEdgeDrag(event: ReactPointerEvent<HTMLButtonElement>) {
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

  function cancelEdgeDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    setDragConnection(null)
    setEdgeEditMessage('ドラッグを中止しました。')
  }

  function chooseEdge(edge: MapEdge) {
    if (edgeEditMode !== 'delete' || edge.toFinal) return
    setSelectedEdgeId(edge.id)
    setEdgeEditMessage('選択した道筋を削除できます。')
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
    if (!selectedEdge) return
    void onDeleteEdge(selectedEdge.fromId, selectedEdge.toId).then((deleted) => {
      if (!deleted) return
      setSelectedEdgeId(null)
      setEdgeEditMessage('道筋を削除しました。配置を更新しました。')
    })
  }

  return (
    <div className={`map-layout ${selectedNode ? 'has-detail' : ''}`} onClick={onClearSelection}>
      <section className="map-panel" aria-labelledby="map-heading">
        <div className="map-stage-hud">
          <div>
            <p className="pixel-kicker">QUEST MAP</p>
            <h1 id="map-heading">{plan.goal.statement}</h1>
          </div>
          <div className="map-legend" aria-label="ノード状態の凡例">
            <span><i className="legend-dot is-sleeping" />未着手</span>
            <span><i className="legend-dot is-active" />進行中</span>
            <span><i className="legend-dot is-cleared" />達成</span>
          </div>
        </div>

        <div className="node-map" role="list" aria-label="中間目標のスキルツリー">
          <div
            className={`node-map-canvas ${edgeEditMode === 'add' ? 'is-edge-adding' : ''} ${edgeEditMode === 'delete' ? 'is-edge-deleting' : ''}`}
            ref={canvasRef}
            style={{ '--map-min-width': `${layout.width}px` } as CSSProperties}
          >
          <svg aria-label="目標間の道筋" className="map-edge-layer" preserveAspectRatio="none" viewBox={`0 0 ${layout.width} ${layout.height}`}>
            {layout.edges.map((edge) => (
              <g
                aria-label={edge.toFinal ? undefined : `${nodeNames.get(edge.fromId) ?? edge.fromId}から${nodeNames.get(edge.toId) ?? edge.toId}への道筋`}
                className={`map-edge-group ${edgeEditMode === 'delete' && !edge.toFinal ? 'is-deletable' : ''} ${selectedEdgeId === edge.id ? 'is-selected' : ''}`}
                data-edge-id={edge.id}
                data-from-id={edge.fromId}
                data-route-point-count={edge.routePoints?.length ?? 2}
                data-to-id={edge.toId}
                key={edge.id}
                onClick={(event) => selectEdge(event, edge)}
                onKeyDown={(event) => selectEdgeByKeyboard(event, edge)}
                role={edgeEditMode === 'delete' && !edge.toFinal ? 'button' : undefined}
                tabIndex={edgeEditMode === 'delete' && !edge.toFinal ? 0 : -1}
              >
                {!edge.toFinal && <path className="map-edge-hit-area" d={edgePath(edge)} />}
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

          <span aria-hidden="true" className="map-origin-rune">START</span>

          {layout.positions.map(({ node, x, y }) => (
            <button
              aria-label={`${node.name}、${statusLabels[node.status]}、進捗${node.progress}%`}
              className={`node-card status-${node.status} ${node.id === selectedNode?.id ? 'is-selected' : ''} ${node.id === dragConnection?.fromNodeId ? 'is-edge-start' : ''}`}
              data-node-id={node.id}
              key={node.id}
              onClick={(event) => selectNode(event, node.id)}
              onPointerCancel={cancelEdgeDrag}
              onPointerDown={(event) => beginEdgeDrag(event, node.id)}
              onPointerMove={moveEdgeDrag}
              onPointerUp={finishEdgeDrag}
              role="listitem"
              style={{
                '--node-progress': `${node.progress}%`,
                '--node-x': `${(x / layout.width) * 100}%`,
                '--node-y': `${(y / layout.height) * 100}%`,
              } as CSSProperties}
              title={node.name}
              type="button"
            >
              <span className="node-stage-number">{String(plan.nodes.indexOf(node) + 1).padStart(2, '0')}</span>
              <NodeSprite progress={node.progress} status={node.status} theme={theme} />
              <span className="node-card-body">
                <strong>{node.name}</strong>
                <time>{formatDate(node.targetDate)}</time>
                <span className="node-progress-track"><span /></span>
              </span>
              {node.status === 'completed' && <span className="node-clear-mark" aria-hidden="true">CLEAR!</span>}
            </button>
          ))}

          <div
            className="final-goal-node"
            role="img"
            style={{
              '--node-x': `${(layout.finalPosition.x / layout.width) * 100}%`,
              '--node-y': `${(layout.finalPosition.y / layout.height) * 100}%`,
            } as CSSProperties}
            title={plan.goal.statement}
          >
            <span className="final-goal-label">FINAL QUEST</span>
            <ThemeCrest className="final-goal-crest" theme={theme} />
            <strong>{plan.goal.statement}</strong>
            <span>{formatDate(plan.goal.deadline)}</span>
          </div>
          </div>
        </div>
      </section>

      <div className={`edge-edit-controls ${isEdgeEditorOpen ? 'is-open' : ''}`} onClick={(event) => event.stopPropagation()}>
        {isEdgeEditorOpen && (
          <div className="edge-edit-panel">
            <strong className="edge-edit-title">道筋の編集</strong>
            <div className="edge-edit-mode-list" aria-label="編集方法を選択">
              <button
                aria-pressed={edgeEditMode === 'add'}
                onClick={() => chooseEdgeEditMode('add')}
                type="button"
              >＋ 道筋を追加</button>
              <button
                aria-pressed={edgeEditMode === 'delete'}
                onClick={() => chooseEdgeEditMode('delete')}
                type="button"
              >− 道筋を削除</button>
            </div>
            <div className="edge-edit-guide" role="status">
              <span>{edgeEditMessage}</span>
            </div>
            {edgeEditMode === 'delete' && selectedEdge && (
              <div className="edge-delete-confirmation">
                <span>{nodeNames.get(selectedEdge.fromId)} → {nodeNames.get(selectedEdge.toId)}</span>
                <button onClick={deleteSelectedEdge} type="button">選択した道筋を削除</button>
              </div>
            )}
          </div>
        )}
        <button
          aria-expanded={isEdgeEditorOpen}
          className="edge-edit-button"
          onClick={toggleEdgeEditor}
          type="button"
        >
          <span aria-hidden="true">{isEdgeEditorOpen ? '×' : '✎'}</span>
          {isEdgeEditorOpen ? '編集を終了' : '編集'}
        </button>
      </div>

      {selectedNode && draftNode && (
        <>
          <button aria-label="ノード詳細を閉じる" className="detail-scrim" onClick={onClearSelection} type="button" />
          <aside className="node-detail" aria-labelledby="node-detail-heading" onClick={(event) => event.stopPropagation()}>
            <div className="detail-topline">
              <span>QUEST DETAIL</span>
              <button aria-label="ノード詳細を閉じる" className="detail-close" onClick={onClearSelection} type="button">×</button>
            </div>
            <div className="detail-hero">
              <NodeSprite progress={draftNode.progress} status={draftNode.status} theme={theme} />
              <div>
                <span className={`status-label status-${draftNode.status}`}>{statusLabels[draftNode.status]}</span>
                <h2 id="node-detail-heading">{draftNode.name}</h2>
              </div>
            </div>
            <div className="detail-progress">
              <span>PROGRESS</span>
              <strong>{draftNode.progress}%</strong>
              <div><span style={{ width: `${draftNode.progress}%` }} /></div>
            </div>

            <form className="node-edit-form" onSubmit={(event) => { event.preventDefault(); onUpdateNode(draftNode) }}>
              <label className="node-edit-field">
                <span>目標名</span>
                <input onChange={(event) => updateDraft('name', event.target.value)} value={draftNode.name} />
              </label>

              <div className="node-edit-grid">
                <label className="node-edit-field">
                  <span>状態</span>
                  <select onChange={(event) => updateDraft('status', event.target.value)} value={draftNode.status}>
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="node-edit-field">
                  <span>進捗（%）</span>
                  <input max="100" min="0" onChange={(event) => updateDraft('progress', event.target.value)} type="number" value={draftNode.progress} />
                </label>
              </div>

              <label className="node-edit-field">
                <span>目標日</span>
                <input onChange={(event) => updateDraft('targetDate', event.target.value)} type="date" value={draftNode.targetDate} />
              </label>
              <label className="node-edit-field">
                <span>難易度</span>
                <input onChange={(event) => updateDraft('difficulty', event.target.value)} placeholder="例：やや難しい" value={draftNode.difficulty} />
              </label>
              <label className="node-edit-field">
                <span>説明</span>
                <textarea onChange={(event) => updateDraft('description', event.target.value)} rows={4} value={draftNode.description} />
              </label>
              <label className="node-edit-field next-action-field">
                <span>次の行動</span>
                <textarea onChange={(event) => updateDraft('nextAction', event.target.value)} rows={3} value={draftNode.nextAction} />
              </label>

              <div className="node-readonly">
                <span>前提となる目標</span>
                <strong>{draftNode.dependsOn.length > 0 ? draftNode.dependsOn.map((id) => nodeNames.get(id) ?? id).join('、') : 'なし'}</strong>
              </div>

              <button className="rpg-button rpg-button-primary full-width" type="submit">この記録を保存 <span>▶</span></button>
            </form>
          </aside>
        </>
      )}
    </div>
  )
}
