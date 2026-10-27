import type { NewPlanNodeInput, NodeInsertion, PlanNode, PlanSnapshot } from '../../models/plan'
import type { ThemeId } from '../../models/theme'
import type { DateFormat } from '../../types/app'
import { FinalGoalModal } from '../modals/FinalGoalModal'
import { PlanMap } from '../PlanMap'

interface MapScreenProps {
  activePlan: PlanSnapshot
  hasPreviousPlan: boolean
  hasNextPlan: boolean
  onOpenAdjacentPlan: (offset: -1 | 1) => void
  completedNodes: number
  isMapMenuOpen: boolean
  mapPlanName: string
  mapFinalGoalName: string
  mapFinalGoalDescription: string
  mapPlanDeadline: string
  mapPlanSaveStatus: 'saved' | 'saving' | 'error'
  onUpdateMapPlanDraft: (changes: Partial<{
    name: string
    finalGoalName: string
    finalGoalDescription: string
    deadline: string
  }>) => void
  onCloseMapMenu: () => void
  onOpenMapMenu: () => void
  initialViewPosition?: { left: number; top: number }
  onViewPositionChange: (pos: { left: number; top: number }) => void
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onClearSelection: () => void
  theme: ThemeId
  onUpdateTheme: (theme: ThemeId) => void
  showRemainingDays: boolean
  onChangeDateFormat: (format: DateFormat) => void
  onAddEdge: (from: string, to: string) => Promise<boolean>
  onDeleteEdge: (from: string, to: string) => Promise<boolean>
  onSwapEdgeNodes: (from: string, to: string) => Promise<boolean>
  onCreateNode: (input: NewPlanNodeInput, insertion?: NodeInsertion) => Promise<boolean>
  onDeleteNode: (id: string) => Promise<boolean>
  onUpdateNode: (node: PlanNode, options?: { silent?: boolean }) => Promise<boolean>
}

export function MapScreen({
  activePlan,
  hasPreviousPlan,
  hasNextPlan,
  onOpenAdjacentPlan,
  completedNodes,
  isMapMenuOpen,
  mapPlanName,
  mapFinalGoalName,
  mapFinalGoalDescription,
  mapPlanDeadline,
  mapPlanSaveStatus,
  onUpdateMapPlanDraft,
  onCloseMapMenu,
  onOpenMapMenu,
  initialViewPosition,
  onViewPositionChange,
  selectedNodeId,
  onSelectNode,
  onClearSelection,
  theme,
  onUpdateTheme,
  showRemainingDays,
  onChangeDateFormat,
  onAddEdge,
  onDeleteEdge,
  onSwapEdgeNodes,
  onCreateNode,
  onDeleteNode,
  onUpdateNode,
}: MapScreenProps) {
  return (
    <main className="page map-page">
      <button
        aria-label="前の計画へ"
        className="plan-edge-navigation plan-edge-previous"
        disabled={!hasPreviousPlan}
        onClick={() => onOpenAdjacentPlan(-1)}
        type="button"
      >
        <svg aria-hidden="true" className="plan-edge-icon" viewBox="0 0 4 5">
          <path d="M2 0h2v1H2zM1 1h2v1H1zM0 2h2v1H0zM1 3h2v1H1zM2 4h2v1H2z" fill="currentColor" shapeRendering="crispEdges" />
        </svg>
      </button>
      <button
        aria-label="次の計画へ"
        className="plan-edge-navigation plan-edge-next"
        disabled={!hasNextPlan}
        onClick={() => onOpenAdjacentPlan(1)}
        type="button"
      >
        <svg aria-hidden="true" className="plan-edge-icon" viewBox="0 0 4 5">
          <path d="M0 0h2v1H0zM1 1h2v1H1zM2 2h2v1H2zM1 3h2v1H1zM0 4h2v1H0z" fill="currentColor" shapeRendering="crispEdges" />
        </svg>
      </button>

      <FinalGoalModal
        completedNodes={completedNodes}
        deadline={activePlan.goal.deadline}
        draftDeadline={mapPlanDeadline}
        draftFinalGoalDescription={mapFinalGoalDescription}
        draftFinalGoalName={mapFinalGoalName}
        draftName={mapPlanName}
        isOpen={isMapMenuOpen}
        onChangeDraft={onUpdateMapPlanDraft}
        onClose={onCloseMapMenu}
        planName={activePlan.name}
        saveStatus={mapPlanSaveStatus}
        totalNodes={activePlan.nodes.length}
      />

      <PlanMap
        initialViewPosition={initialViewPosition}
        onAddEdge={onAddEdge}
        onClearSelection={onClearSelection}
        onCreateNode={onCreateNode}
        onDeleteEdge={onDeleteEdge}
        onSwapEdgeNodes={onSwapEdgeNodes}
        onDeleteNode={onDeleteNode}
        onOpenPlanMenu={onOpenMapMenu}
        onSelectNode={onSelectNode}
        onUpdateNode={(node) => onUpdateNode(node, { silent: true })}
        onUpdateTheme={onUpdateTheme}
        onViewPositionChange={onViewPositionChange}
        plan={activePlan}
        selectedNodeId={selectedNodeId}
        showRemainingDays={showRemainingDays}
        onChangeDateFormat={onChangeDateFormat}
        theme={theme}
      />
    </main>
  )
}
