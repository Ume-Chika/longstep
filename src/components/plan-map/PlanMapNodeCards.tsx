import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { PlanSnapshot } from '../../models/plan'
import type { MapLayout, PositionedNode } from './planMapTypes.ts'
import { IconPlus, IconPen } from './PlanMapIcons.tsx'
import {
  daysFromToday,
  formatDate,
  formatRemainingDays,
  getNodeTypeIcon,
  isActionableGoal,
} from './planMapHelpers.ts'

interface PlanMapNodeCardsProps {
  layout: MapLayout
  plan: PlanSnapshot
  visiblePositions: PositionedNode[]
  selectedNodeId: string | null
  hoveredNodeId: string | null
  relatedIds: Set<string> | null
  actionableIds: string[]
  dragOverNodeId: string | null
  dragFromNodeId: string | null
  showRemainingDays?: boolean
  onSelectNode: (event: MouseEvent<HTMLButtonElement>, nodeId: string) => void
  onHoverNode: (nodeId: string | null) => void
  onCreateChildNode: (event: MouseEvent | KeyboardEvent, parentNodeId: string) => void
  onCreateFreeNode: () => void
  onBeginEdgeDrag: (event: ReactPointerEvent<HTMLSpanElement>, fromNodeId: string) => void
  onMoveEdgeDrag: (event: ReactPointerEvent<HTMLSpanElement>) => void
  onFinishEdgeDrag: (event: ReactPointerEvent<HTMLSpanElement>) => void
  onCancelEdgeDrag: (event: ReactPointerEvent<HTMLSpanElement>) => void
  onOpenPlanMenu: () => void
}

export function PlanMapNodeCards({
  layout,
  plan,
  visiblePositions,
  selectedNodeId,
  hoveredNodeId,
  relatedIds,
  actionableIds,
  dragOverNodeId,
  dragFromNodeId,
  showRemainingDays,
  onSelectNode,
  onHoverNode,
  onCreateChildNode,
  onCreateFreeNode,
  onBeginEdgeDrag,
  onMoveEdgeDrag,
  onFinishEdgeDrag,
  onCancelEdgeDrag,
  onOpenPlanMenu,
}: PlanMapNodeCardsProps) {
  return (
    <>
      {visiblePositions.map(({ node, x, y }) => {
        const isActionable = isActionableGoal(node, actionableIds.includes(node.id) ? 'focus' : undefined)
        const isSelected = selectedNodeId === node.id
        const isHovered = hoveredNodeId === node.id
        const isRelated = relatedIds ? relatedIds.has(node.id) : true
        const isDropTarget = dragOverNodeId === node.id
        const isEdgeStart = dragFromNodeId === node.id

        const classNames = [
          'node-card',
          `goal-level-${node.goalLevel ?? 'middle'}`,
          `attention-${node.status === 'completed' ? 'completed' : actionableIds.includes(node.id) ? 'focus' : 'upcoming'}`,
          isActionable ? 'is-actionable-goal' : '',
          isSelected ? 'is-selected' : '',
          isHovered ? 'is-hovered' : '',
          isRelated ? 'is-related' : 'is-unrelated',
          isDropTarget ? 'is-drop-target' : '',
          isEdgeStart ? 'is-edge-start' : '',
          node.recurrence?.enabled ? `is-repeat repeat-count-${Math.min(node.recurrence.completedCount, 5)}` : '',
        ].filter(Boolean).join(' ')

        return (
          <button
            aria-label={`${node.name}、${node.status === 'completed' ? '達成済み' : '未着手'}`}
            className={classNames}
            data-node-id={node.id}
            key={node.id}
            onClick={(event) => onSelectNode(event, node.id)}
            onMouseEnter={() => onHoverNode(node.id)}
            onMouseLeave={() => onHoverNode(null)}
            role="listitem"
            style={{
              '--node-x': `${(x / layout.width) * 100}%`,
              '--node-y': `${(y / layout.height) * 100}%`,
            } as CSSProperties}
            title={node.name}
            type="button"
          >
            <span
              aria-label={`「${node.name}」の前提に目標を追加`}
              className="node-add-handle"
              onClick={(event) => onCreateChildNode(event, node.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onCreateChildNode(event, node.id)
              }}
              role="button"
              tabIndex={0}
              title="この目標の前提に目標を追加"
            ><IconPlus /></span>
            <span
              aria-label={`「${node.name}」から道筋を追加`}
              className="node-edge-handle"
              onClick={(event) => event.stopPropagation()}
              onPointerCancel={onCancelEdgeDrag}
              onPointerDown={(event) => onBeginEdgeDrag(event, node.id)}
              onPointerMove={onMoveEdgeDrag}
              onPointerUp={onFinishEdgeDrag}
              role="button"
              tabIndex={0}
              title="ドラッグして道筋を追加"
            ><IconPen /></span>
            <span
              aria-label={getNodeTypeIcon(node).label}
              className={`node-type-mark goal-level-${node.goalLevel ?? 'middle'} ${node.recurrence?.enabled ? 'is-repeat' : ''}`}
              title={getNodeTypeIcon(node).label}
            >
              <span className="node-type-glyph">{getNodeTypeIcon(node).glyph}</span>
            </span>
            <span className="node-card-body">
              <strong>{node.name}</strong>
              {node.targetDate && (
                <time className={node.status !== 'completed' && (daysFromToday(node.targetDate) ?? 99) <= 7 ? 'is-urgent' : undefined}>
                  {showRemainingDays
                    ? formatRemainingDays(node.targetDate)
                    : formatDate(node.targetDate)}
                </time>
              )}
            </span>
            {hoveredNodeId === node.id && node.description && (
              <span className={`node-hover-description ${layout.height - y < 220 ? 'is-above' : ''} ${x < 170 ? 'is-left' : layout.width - x < 170 ? 'is-right' : ''}`} role="tooltip">
                {node.description.length > 120 ? `${node.description.slice(0, 120)}…` : node.description}
              </span>
            )}
            {node.recurrence?.enabled && (
              <span className="node-repeat-mark" aria-label={`繰り返し達成${node.recurrence.completedCount}回`}>
                ↻ {node.recurrence.completedCount}
              </span>
            )}
          </button>
        )
      })}

      <button
        aria-label={`最終目標の設定を開く：${plan.goal.statement}`}
        className="final-goal-node"
        onClick={onOpenPlanMenu}
        onMouseEnter={() => onHoverNode('__final-goal__')}
        onMouseLeave={() => onHoverNode(null)}
        style={{
          '--node-x': `${(layout.finalPosition.x / layout.width) * 100}%`,
          '--node-y': `${(layout.finalPosition.y / layout.height) * 100}%`,
        } as CSSProperties}
        title={plan.goal.description || plan.goal.statement}
        type="button"
      >
        <span
          aria-label="新しい目標を追加"
          className="node-add-handle final-goal-add-handle"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreateFreeNode() }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            onCreateFreeNode()
          }}
          role="button"
          tabIndex={0}
          title="新しい目標を追加"
        ><IconPlus /></span>
        <span className="final-goal-label">最終目標</span>
        <strong>{plan.goal.statement}</strong>
        {plan.goal.deadline && (
          <span>{showRemainingDays ? formatRemainingDays(plan.goal.deadline) : formatDate(plan.goal.deadline)}</span>
        )}
        {hoveredNodeId === '__final-goal__' && (plan.goal.description || plan.goal.statement.length > 24) && (
          <span className={`node-hover-description is-right ${layout.height - layout.finalPosition.y < 220 ? 'is-above' : ''}`} role="tooltip">
            {(plan.goal.description || plan.goal.statement).length > 120
              ? `${(plan.goal.description || plan.goal.statement).slice(0, 120)}…`
              : (plan.goal.description || plan.goal.statement)}
          </span>
        )}
      </button>
    </>
  )
}
