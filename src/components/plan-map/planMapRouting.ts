import type { LayoutEdge, MapEdge, MapPoint } from './planMapTypes.ts'

export const nodePortOffset = 90
export const finalPortOffset = 104
export const rowSpacing = 140

export function routeLayoutEdges(
  layoutEdges: LayoutEdge[],
  itemPositionById: Map<string, MapPoint>
): MapEdge[] {
  return layoutEdges.flatMap<MapEdge>((edge) => {
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
