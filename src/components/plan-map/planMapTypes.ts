import type { NewPlanNodeInput, NodeInsertion, PlanNode, PlanSnapshot } from '../../models/plan'
import type { ThemeId } from '../../models/theme'
import type { DateFormat } from '../../types/app'

export interface PlanMapProps {
  plan: PlanSnapshot
  theme: ThemeId
  selectedNodeId: string | null
  showRemainingDays?: boolean
  onChangeDateFormat?: (format: DateFormat) => void
  onSelectNode: (nodeId: string) => void
  onClearSelection: () => void
  onUpdateNode: (node: PlanNode) => Promise<boolean>
  onUpdateTheme: (theme: ThemeId) => void
  onOpenPlanMenu: () => void
  onCreateNode: (input: NewPlanNodeInput, insertion?: NodeInsertion) => Promise<boolean>
  onAddEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onDeleteEdge: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onSwapEdgeNodes: (fromNodeId: string, toNodeId: string) => Promise<boolean>
  onDeleteNode: (nodeId: string) => Promise<boolean>
  initialViewPosition?: { left: number; top: number }
  onViewPositionChange?: (position: { left: number; top: number }) => void
}

export interface PositionedNode {
  node: PlanNode
  x: number
  y: number
}

export interface MapEdge {
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

export interface MapPoint {
  x: number
  y: number
}

export type LayoutItemKind = 'node' | 'final'

export interface LayoutItem {
  id: string
  kind: LayoutItemKind
  level: number
  originalOrder: number
  node?: PlanNode
}

export interface LayoutEdge {
  id: string
  fromId: string
  toId: string
  toFinal: boolean
  itemIds: string[]
}

export interface MapLayout {
  positions: PositionedNode[]
  edges: MapEdge[]
  width: number
  height: number
  finalPosition: { x: number; y: number }
}

export interface DragConnection {
  pointerId: number
  fromNodeId: string
  fromX: number
  fromY: number
  currentX: number
  currentY: number
}
