import { useCallback, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { DragConnection, MapLayout, PositionedNode } from '../components/plan-map/planMapTypes.ts'

export function usePlanMapEdgeDrag(
  canvasRef: RefObject<HTMLDivElement | null>,
  layout: MapLayout,
  positionById: Map<string, PositionedNode>,
  onAddEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>,
) {
  const [dragConnection, setDragConnection] = useState<DragConnection | null>(null)
  const [edgeDropTargetId, setEdgeDropTargetId] = useState<string | null>(null)

  const pointerPosition = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * layout.width,
      y: ((event.clientY - bounds.top) / bounds.height) * layout.height,
    }
  }, [canvasRef, layout.height, layout.width])

  const beginEdgeDrag = useCallback((event: ReactPointerEvent<HTMLElement>, nodeId: string) => {
    const pos = positionById.get(nodeId)
    const pointer = pointerPosition(event)
    if (!pos || !pointer) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setEdgeDropTargetId(null)
    setDragConnection({
      pointerId: event.pointerId,
      fromNodeId: nodeId,
      fromX: pos.x + 90,
      fromY: pos.y,
      currentX: pointer.x,
      currentY: pointer.y,
    })
  }, [pointerPosition, positionById])

  const moveEdgeDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    const pointer = pointerPosition(event)
    if (!pointer) return
    event.preventDefault()
    setDragConnection((curr) => curr ? { ...curr, currentX: pointer.x, currentY: pointer.y } : curr)
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-node-id]')
    const targetId = targetElement?.dataset.nodeId
    setEdgeDropTargetId(targetId && targetId !== dragConnection.fromNodeId ? targetId : null)
  }, [dragConnection, pointerPosition])

  const finishEdgeDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragConnection || dragConnection.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-node-id]')
    const candidateId = targetElement?.dataset.nodeId
    const targetNodeId = edgeDropTargetId ?? (candidateId && candidateId !== dragConnection.fromNodeId ? candidateId : null)
    const fromNodeId = dragConnection.fromNodeId
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDragConnection(null)
    setEdgeDropTargetId(null)
    if (targetNodeId) void onAddEdge(fromNodeId, targetNodeId)
  }, [dragConnection, edgeDropTargetId, onAddEdge])

  const cancelEdgeDrag = useCallback(() => {
    setDragConnection(null)
    setEdgeDropTargetId(null)
  }, [])

  return {
    dragConnection,
    edgeDropTargetId,
    beginEdgeDrag,
    moveEdgeDrag,
    finishEdgeDrag,
    cancelEdgeDrag,
  }
}
