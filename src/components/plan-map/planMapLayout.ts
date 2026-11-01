import type { PlanNode } from '../../models/plan'
import type { LayoutEdge, LayoutItem, MapLayout, MapPoint, PositionedNode } from './planMapTypes.ts'
import { rowSpacing, routeLayoutEdges } from './planMapRouting.ts'

export { edgePath, finalPortOffset, nodePortOffset, rowSpacing } from './planMapRouting.ts'

export const minimumMapWidth = 1000
export const mapHeight = 700
export const firstColumnX = 150
export const columnSpacing = 270
export const levelSpacing = 36
export const finalGoalGap = 150
export const mapTopPadding = 104
export const finalGoalMinY = mapTopPadding
export const minMapZoom = 0.2
export const maxMapZoom = 1.5
export const mapZoomStep = 0.2

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
  return new Map(nodes.map((node) => [node.id, maximumDistance - (levels.get(node.id) ?? 0)]))
}

function compareSiblingItems(left: LayoutItem, right: LayoutItem): number {
  if (left.node && right.node) {
    const completedDiff = Number(left.node.status === 'completed') - Number(right.node.status === 'completed')
    if (completedDiff !== 0) return completedDiff
    const leftDate = left.node.targetDate || '9999-99-99'
    const rightDate = right.node.targetDate || '9999-99-99'
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
  }
  return left.originalOrder - right.originalOrder || left.id.localeCompare(right.id)
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
    node.dependsOn.forEach((depId) => {
      if (nodesById.has(depId)) successors.set(depId, [...(successors.get(depId) ?? []), node.id])
    })
  })

  nodes.forEach((node, index) => {
    addItem({ id: node.id, kind: 'node', level: levels.get(node.id) ?? 0, originalOrder: index, node })
  })

  const maximumLevel = Math.max(0, ...levels.values())
  const finalLevel = maximumLevel + 1
  addItem({ id: finalItemId, kind: 'final', level: finalLevel, originalOrder: nodes.length })

  const terminalNodeIds = nodes.filter((n) => (successors.get(n.id) ?? []).length === 0).map((n) => n.id)
  nodes.forEach((node) => {
    node.dependsOn.forEach((depId) => {
      if (nodesById.has(depId)) {
        layoutEdges.push({ id: `${depId}-${node.id}`, fromId: depId, toId: node.id, toFinal: false, itemIds: [depId, node.id] })
      }
    })
  })
  terminalNodeIds.forEach((id) => {
    layoutEdges.push({ id: `${id}-final`, fromId: id, toId: 'final', toFinal: true, itemIds: [id, finalItemId] })
  })

  levelOrders.forEach((items, level) => levelOrders.set(level, [...items].sort(compareSiblingItems)))

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
      .filter((c): c is LayoutItem => c !== undefined)
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
    const focusDeps = item.node?.status !== 'completed' ? depItems.slice(0, Math.max(3, activeCount)) : depItems
    const depYs = focusDeps.map((dep) => yById.get(dep.id)).filter((y): y is number => y !== undefined)
    const desiredY = depYs.length > 0 ? Math.round(depYs.reduce((a, b) => a + b, 0) / depYs.length) : minLevelY
    const y = Math.max(minLevelY, desiredY)
    yById.set(item.id, y)
    minYByLevel.set(item.level, y + rowSpacing)
    nextBandY = Math.max(nextBandY, y + rowSpacing)
    visitingPlace.delete(item.id)
  }

  for (let level = maximumLevel; level >= 0; level -= 1) {
    ;(levelOrders.get(level) ?? []).forEach(placeItem)
  }

  const activeTerminals = terminalNodeIds.filter((id) => nodesById.get(id)?.status !== 'completed')
  const focusTerminalIds = activeTerminals.length > 0 ? activeTerminals : terminalNodeIds.slice(0, 3)
  const terminalYs = focusTerminalIds.map((id) => yById.get(id)).filter((y): y is number => y !== undefined)
  const finalGoalCenterY = terminalYs.length > 0
    ? Math.max(finalGoalMinY, Math.round(terminalYs.reduce((a, b) => a + b, 0) / terminalYs.length))
    : finalGoalMinY
  yById.set(finalItemId, terminalYs.length > 1 ? Math.min(384, finalGoalCenterY) : finalGoalCenterY)

  const layoutHeight = Math.max(mapHeight, Math.max(yById.get(finalItemId)!, ...yById.values()) + 130)
  const positions: PositionedNode[] = []
  const itemPositionById = new Map<string, MapPoint>()
  let nextColumnX = firstColumnX

  for (let level = 0; level <= finalLevel; level += 1) {
    const levelItems = levelOrders.get(level) ?? []
    if (levelItems.length === 0) continue
    const levelStartX = level === finalLevel && nodes.length > 0 ? nextColumnX + finalGoalGap : nextColumnX
    levelItems.forEach((item) => {
      const itemPosition = { x: levelStartX, y: yById.get(item.id) ?? layoutHeight / 2 }
      itemPositionById.set(item.id, itemPosition)
      if (item.kind === 'node' && item.node) positions.push({ node: item.node, ...itemPosition })
    })
    nextColumnX = levelStartX + columnSpacing + levelSpacing
  }

  const finalPosition = nodes.length > 0
    ? itemPositionById.get(finalItemId) ?? { x: minimumMapWidth / 2, y: finalGoalMinY }
    : { x: minimumMapWidth / 2, y: finalGoalMinY }
  const mapWidth = Math.max(minimumMapWidth, finalPosition.x + 200)
  const edges = routeLayoutEdges(layoutEdges, itemPositionById)

  return { positions, edges, width: mapWidth, height: layoutHeight, finalPosition }
}
