import type { PlanNode } from '../../models/plan'
import type { LayoutEdge, LayoutItem, MapEdge, MapLayout, MapPoint, PositionedNode } from './planMapTypes.ts'

export const minMapZoom = 0.2
export const maxMapZoom = 1.5
export const mapZoomStep = 0.2

const minimumMapWidth = 1000
const mapHeight = 700
const firstColumnX = 150
const columnSpacing = 270
const finalGoalGap = 150
const rowSpacing = 140
const nodePortOffset = 90
const finalPortOffset = 104
const mapTopPadding = 104
const finalGoalMinY = mapTopPadding

export function clampZoom(value: number): number {
  return Math.min(maxMapZoom, Math.max(minMapZoom, Math.round(value * 100) / 100))
}

export function getNodeLevels(nodes: PlanNode[]): Map<string, number> {
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

export function createMapLayout(nodes: PlanNode[]): MapLayout {
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

  nodes.forEach((node, originalOrder) => {
    addItem({ id: node.id, kind: 'node', level: levels.get(node.id) ?? 0, originalOrder, node })
  })

  const maximumNodeLevel = Math.max(-1, ...levels.values())
  const finalLevel = maximumNodeLevel + 1
  addItem({ id: finalItemId, kind: 'final', level: finalLevel, originalOrder: Number.MAX_SAFE_INTEGER })

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyId) => {
      if (!nodesById.has(dependencyId)) return
      layoutEdges.push({
        id: `${dependencyId}->${node.id}`,
        fromId: dependencyId,
        toId: node.id,
        toFinal: false,
        itemIds: [dependencyId, node.id],
      })
    })

    if ((successors.get(node.id) ?? []).length === 0) {
      layoutEdges.push({
        id: `${node.id}->${finalItemId}`,
        fromId: node.id,
        toId: finalItemId,
        toFinal: true,
        itemIds: [node.id, finalItemId],
      })
    }
  })

  const positions: PositionedNode[] = []
  let finalPosition = { x: 0, y: 0 }

  Array.from(levelOrders.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([level, items]) => {
      const x = firstColumnX + level * columnSpacing
      const columnHeight = items.length * rowSpacing
      const yOffset = mapTopPadding + Math.max(0, (mapHeight - mapTopPadding - columnHeight) / 2)

      items.forEach((item, index) => {
        const y = yOffset + index * rowSpacing
        yById.set(item.id, y)
        if (item.kind === 'node' && item.node) {
          positions.push({ node: item.node, x, y })
        } else if (item.kind === 'final') {
          finalPosition = { x: Math.max(x, firstColumnX + maximumNodeLevel * columnSpacing + finalGoalGap), y }
        }
      })
    })

  finalPosition.y = Math.max(finalPosition.y, finalGoalMinY)
  const maxNodeX = positions.reduce((max, pos) => Math.max(max, pos.x), 0)
  const mapWidth = Math.max(minimumMapWidth, finalPosition.x + finalGoalGap, maxNodeX + columnSpacing)
  const maxY = Math.max(...positions.map((pos) => pos.y), finalPosition.y)
  const layoutHeight = Math.max(mapHeight, maxY + rowSpacing)

  const edges: MapEdge[] = layoutEdges.flatMap((edge) => {
    const fromPos = positions.find((pos) => pos.node.id === edge.fromId)
    const toPos = edge.toFinal ? null : positions.find((pos) => pos.node.id === edge.toId)
    if (!fromPos) return []
    const toX = edge.toFinal ? finalPosition.x : toPos?.x
    const toY = edge.toFinal ? finalPosition.y : toPos?.y
    if (toX === undefined || toY === undefined) return []

    const startPoint: MapPoint = { x: fromPos.x + nodePortOffset, y: fromPos.y }
    const endPoint: MapPoint = { x: toX - (edge.toFinal ? finalPortOffset : nodePortOffset), y: toY }
    const midX = (startPoint.x + endPoint.x) / 2
    const routePoints: MapPoint[] = Math.abs(startPoint.y - endPoint.y) < 1
      ? [startPoint, endPoint]
      : [startPoint, { x: midX, y: startPoint.y }, { x: midX, y: endPoint.y }, endPoint]

    return [{
      id: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      fromX: startPoint.x,
      fromY: startPoint.y,
      toX: endPoint.x,
      toY: endPoint.y,
      toFinal: edge.toFinal,
      routePoints,
    }]
  })

  return { positions, edges, width: mapWidth, height: layoutHeight, finalPosition }
}

export function edgePath(edge: MapEdge): string {
  const points = edge.routePoints && edge.routePoints.length >= 2
    ? edge.routePoints
    : [{ x: edge.fromX, y: edge.fromY }, { x: edge.toX, y: edge.toY }]

  const cornerRadius = 18
  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const inLen = Math.hypot(current.x - previous.x, current.y - previous.y)
    const outLen = Math.hypot(next.x - current.x, next.y - current.y)
    const radius = Math.min(cornerRadius, inLen / 2, outLen / 2)
    const before = { x: current.x + (previous.x - current.x) * (radius / inLen), y: current.y + (previous.y - current.y) * (radius / inLen) }
    const after = { x: current.x + (next.x - current.x) * (radius / outLen), y: current.y + (next.y - current.y) * (radius / outLen) }
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`
  }

  const lastPoint = points.at(-1)!
  return `${path} L ${lastPoint.x} ${lastPoint.y}`
}
