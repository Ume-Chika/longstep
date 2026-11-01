import type { KeyboardEvent, MouseEvent } from 'react'
import type { DragConnection, MapEdge, MapLayout, PositionedNode } from './planMapTypes.ts'
import { edgePath } from './planMapLayout.ts'

interface PlanMapSvgEdgesProps {
  layout: MapLayout
  positionById: Map<string, PositionedNode>
  nodeNames: Map<string, string>
  selectedEdgeId: string | null
  relatedIds: Set<string> | null
  dragConnection: DragConnection | null
  onSelectEdge: (event: MouseEvent, edge: MapEdge) => void
  onSelectEdgeByKeyboard: (event: KeyboardEvent, edge: MapEdge) => void
}

export function PlanMapSvgEdges({
  layout,
  positionById,
  nodeNames,
  selectedEdgeId,
  relatedIds,
  dragConnection,
  onSelectEdge,
  onSelectEdgeByKeyboard,
}: PlanMapSvgEdgesProps) {
  return (
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
          onClick={(event) => onSelectEdge(event, edge)}
          onKeyDown={(event) => onSelectEdgeByKeyboard(event, edge)}
          role="button"
          tabIndex={0}
        >
          <path className="map-edge-hit-area" d={edgePath(edge)} />
          <path className={`map-edge ${edge.toFinal && positionById.get(edge.fromId)?.node.status !== 'completed' ? 'to-final' : ''}`} d={edgePath(edge)} />
        </g>
      ))}
      {dragConnection && (
        <path
          className="map-edge map-edge-preview"
          d={`M ${dragConnection.fromX} ${dragConnection.fromY} C ${(dragConnection.fromX + dragConnection.currentX) / 2} ${dragConnection.fromY}, ${(dragConnection.fromX + dragConnection.currentX) / 2} ${dragConnection.currentY}, ${dragConnection.currentX} ${dragConnection.currentY}`}
        />
      )}
    </svg>
  )
}
