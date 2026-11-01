import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  actionableGoalIds,
  collapsibleCompletedIds,
  overflowingPrerequisiteIds,
  relatedNodeIds,
} from './planMapLogic.ts'
import type { NewPlanNodeInput, NodeInsertion } from '../models/plan'
import type { PlanMapProps } from './plan-map/planMapTypes.ts'
import { createMapLayout } from './plan-map/planMapLayout.ts'
import { defaultNewNodeInput } from './plan-map/planMapHelpers.ts'
import { usePlanMapZoom } from '../hooks/usePlanMapZoom.ts'
import { usePlanMapEdgeDrag } from '../hooks/usePlanMapEdgeDrag.ts'
import { usePlanMapNodeDraft } from '../hooks/usePlanMapNodeDraft.ts'
import { PlanMapSvgEdges } from './plan-map/PlanMapSvgEdges.tsx'
import { PlanMapNodeCards } from './plan-map/PlanMapNodeCards.tsx'
import { PlanMapNodeDetail } from './plan-map/PlanMapNodeDetail.tsx'
import { PlanMapEdgeQuickAction } from './plan-map/PlanMapEdgeQuickAction.tsx'
import { PlanMapViewControls } from './plan-map/PlanMapViewControls.tsx'
import { PlanMapZoomDock } from './plan-map/PlanMapZoomDock.tsx'

export function PlanMap({
  plan,
  theme,
  selectedNodeId,
  showRemainingDays = false,
  onChangeDateFormat,
  onSelectNode,
  onClearSelection,
  onUpdateNode,
  onUpdateTheme,
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
  const collapsibleIds = useMemo(() => new Set([
    ...collapsibleCompletedIds(plan.nodes),
    ...overflowingPrerequisiteIds(plan.nodes),
  ]), [plan.nodes])
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const visibleNodes = useMemo(() => isHistoryExpanded ? plan.nodes : plan.nodes.filter((node) => !collapsibleIds.has(node.id)), [collapsibleIds, isHistoryExpanded, plan.nodes])
  const layout = useMemo(() => createMapLayout(visibleNodes), [visibleNodes])
  const canvasRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const focusedPlanRef = useRef<string | null>(null)
  const edgeQuickActionRef = useRef<HTMLDivElement>(null)
  const viewOptionsRef = useRef<HTMLDivElement>(null)
  const selectedNode = plan.nodes.find((node) => node.id === selectedNodeId)
  const nodeNames = new Map(plan.nodes.map((node) => [node.id, node.name]))
  const positionById = new Map(layout.positions.map((pos) => [pos.node.id, pos]))
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [isViewOptionsOpen, setIsViewOptionsOpen] = useState(false)
  const selectedEdge = layout.edges.find((edge) => edge.id === selectedEdgeId)
  const relatedIds = useMemo(() => hoveredNodeId ? relatedNodeIds(plan.nodes, hoveredNodeId) : null, [hoveredNodeId, plan.nodes])

  const { zoom, zoomIn, zoomOut, resetZoom, fitMapToViewport, resetToInitial } = usePlanMapZoom(mapRef, layout)
  const { dragConnection, edgeDropTargetId, beginEdgeDrag, moveEdgeDrag, finishEdgeDrag, cancelEdgeDrag } = usePlanMapEdgeDrag(canvasRef, layout, positionById, onAddEdge)
  const { draftNode, autoSaveStatus, flushDraft, updateDraft, toggleCompletion, closeDetail } = usePlanMapNodeDraft(selectedNode, onUpdateNode, onClearSelection)

  useEffect(() => {
    if (focusedPlanRef.current === plan.id) return
    const map = mapRef.current
    if (map && initialViewPosition) {
      map.scrollTo({ left: initialViewPosition.left, top: initialViewPosition.top, behavior: 'auto' })
      focusedPlanRef.current = plan.id
      return
    }
    const focus = actionableIds.map((id) => layout.positions.find((pos) => pos.node.id === id)).find(Boolean)
    if (!map || !focus) return
    map.scrollTo({ left: Math.max(0, (focus.x / layout.width) * map.scrollWidth - map.clientWidth / 2), behavior: 'auto' })
    focusedPlanRef.current = plan.id
  }, [actionableIds, initialViewPosition, layout.positions, layout.width, plan.id])

  useEffect(() => {
    cancelEdgeDrag()
    setSelectedEdgeId(null)
    setIsHistoryExpanded(false)
    resetToInitial()
  }, [cancelEdgeDrag, plan.goal.deadline, plan.id, resetToInitial])

  function createNodeFromInput(input: NewPlanNodeInput, insertion?: NodeInsertion) {
    void onCreateNode(input, insertion).then((created) => {
      if (created) setSelectedEdgeId(null)
    })
  }

  return (
    <div className={`map-layout ${selectedNode ? 'has-detail' : ''}`} onClick={closeDetail}>
      <section className="map-panel" aria-label="計画マップ">
        <div
          className="node-map"
          onScroll={(event) => onViewPositionChange?.({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}
          ref={mapRef}
          role="list"
          aria-label="目標マップ"
        >
          <div className="node-map-stage" style={{ height: `${Math.round(layout.height * zoom)}px`, width: `${Math.round(layout.width * zoom)}px` }}>
            <div className="node-map-canvas" ref={canvasRef} style={{ '--map-min-height': `${layout.height}px`, '--map-min-width': `${layout.width}px`, transform: zoom === 1 ? undefined : `scale(${zoom})` } as CSSProperties}>
              <PlanMapSvgEdges
                dragConnection={dragConnection}
                layout={layout}
                nodeNames={nodeNames}
                onSelectEdge={(event, edge) => { event.stopPropagation(); setSelectedEdgeId(edge.id); closeDetail() }}
                onSelectEdgeByKeyboard={(event, edge) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setSelectedEdgeId(edge.id); closeDetail() } }}
                positionById={positionById}
                relatedIds={relatedIds}
                selectedEdgeId={selectedEdgeId}
              />
              <PlanMapNodeCards
                actionableIds={actionableIds}
                dragFromNodeId={dragConnection?.fromNodeId ?? null}
                dragOverNodeId={edgeDropTargetId}
                hoveredNodeId={hoveredNodeId}
                layout={layout}
                onBeginEdgeDrag={beginEdgeDrag}
                onCancelEdgeDrag={cancelEdgeDrag}
                onCreateChildNode={(event, nodeId) => { event.preventDefault(); event.stopPropagation(); createNodeFromInput(defaultNewNodeInput(), { prerequisiteForId: nodeId }) }}
                onCreateFreeNode={() => createNodeFromInput(defaultNewNodeInput())}
                onFinishEdgeDrag={finishEdgeDrag}
                onHoverNode={setHoveredNodeId}
                onMoveEdgeDrag={moveEdgeDrag}
                onOpenPlanMenu={() => { setSelectedEdgeId(null); closeDetail(); onOpenPlanMenu() }}
                onSelectNode={(event, nodeId) => { event.stopPropagation(); setSelectedEdgeId(null); onSelectNode(nodeId) }}
                plan={plan}
                relatedIds={relatedIds}
                selectedNodeId={selectedNodeId}
                showRemainingDays={showRemainingDays}
                visiblePositions={layout.positions}
              />
            </div>
          </div>
        </div>
      </section>

      {selectedEdge && (
        <PlanMapEdgeQuickAction
          actionRef={edgeQuickActionRef}
          finalGoalStatement={plan.goal.statement}
          nodeNames={nodeNames}
          onClose={() => setSelectedEdgeId(null)}
          onCreateNodeOnEdge={() => createNodeFromInput(defaultNewNodeInput(), { fromId: selectedEdge.fromId, toId: selectedEdge.toId, toFinal: selectedEdge.toFinal })}
          onDeleteEdge={() => { if (!selectedEdge.toFinal) void onDeleteEdge(selectedEdge.fromId, selectedEdge.toId).then((del) => { if (del) setSelectedEdgeId(null) }) }}
          onSwapNodes={() => { if (!selectedEdge.toFinal) void onSwapEdgeNodes(selectedEdge.fromId, selectedEdge.toId).then((swap) => { if (swap) setSelectedEdgeId(null) }) }}
          selectedEdge={selectedEdge}
        />
      )}

      <PlanMapViewControls
        collapsibleCount={collapsibleIds.size}
        controlsRef={viewOptionsRef}
        isHistoryExpanded={isHistoryExpanded}
        isOpen={isViewOptionsOpen}
        onChangeDateFormat={onChangeDateFormat}
        onClose={() => setIsViewOptionsOpen(false)}
        onToggleHistory={setIsHistoryExpanded}
        onToggleOpen={() => setIsViewOptionsOpen((c) => !c)}
        onUpdateTheme={onUpdateTheme}
        showRemainingDays={showRemainingDays}
        theme={theme}
      />

      <PlanMapZoomDock
        onFitMap={fitMapToViewport}
        onResetZoom={resetZoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        zoom={zoom}
      />

      {selectedNode && draftNode && (
        <PlanMapNodeDetail
          autoSaveStatus={autoSaveStatus}
          draftNode={draftNode}
          nodeNames={nodeNames}
          onClose={closeDetail}
          onDeleteNode={() => {
            if (!window.confirm(`「${selectedNode.name}」を削除しますか？\n前後の道筋をつなぎ直して削除します。`)) return
            void onDeleteNode(selectedNode.id).then((del) => { if (del) onClearSelection() })
          }}
          onFlushDraft={flushDraft}
          onToggleCompletion={toggleCompletion}
          onUpdateDraft={updateDraft}
          plan={plan}
        />
      )}
    </div>
  )
}
