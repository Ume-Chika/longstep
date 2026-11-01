import type { MouseEvent, RefObject } from 'react'
import type { MapEdge } from './planMapTypes.ts'
import { IconChevronRight, IconMinus, IconSwap } from './PlanMapIcons.tsx'

interface PlanMapEdgeQuickActionProps {
  selectedEdge: MapEdge
  nodeNames: Map<string, string>
  finalGoalStatement: string
  actionRef: RefObject<HTMLDivElement | null>
  onCreateNodeOnEdge: () => void
  onSwapNodes: () => void
  onDeleteEdge: () => void
  onClose: () => void
}

export function PlanMapEdgeQuickAction({
  selectedEdge,
  nodeNames,
  finalGoalStatement,
  actionRef,
  onCreateNodeOnEdge,
  onSwapNodes,
  onDeleteEdge,
  onClose,
}: PlanMapEdgeQuickActionProps) {
  function stopPropagation(event: MouseEvent) {
    event.stopPropagation()
  }

  return (
    <div className="edge-quick-action" onClick={stopPropagation} ref={actionRef}>
      <span className="edge-quick-action-kicker">道筋を選択中</span>
      <strong>
        {nodeNames.get(selectedEdge.fromId) ?? selectedEdge.fromId}
        {' → '}
        {selectedEdge.toFinal ? finalGoalStatement : nodeNames.get(selectedEdge.toId) ?? selectedEdge.toId}
      </strong>
      <button className="edge-quick-action-button" onClick={onCreateNodeOnEdge} type="button">
        新規目標をここに追加 <IconChevronRight />
      </button>
      {!selectedEdge.toFinal && (
        <button className="edge-quick-action-swap" onClick={onSwapNodes} type="button">
          位置を入れ替える <IconSwap />
        </button>
      )}
      {!selectedEdge.toFinal && (
        <button className="edge-quick-action-delete" onClick={onDeleteEdge} type="button">
          道筋を削除 <IconMinus />
        </button>
      )}
      <button className="edge-quick-action-close" onClick={onClose} type="button">閉じる</button>
    </div>
  )
}
