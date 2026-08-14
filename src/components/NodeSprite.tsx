import type { GoalLevel, PlanRecurrence, PlanStatus } from '../models/plan'
import type { ThemeId } from '../models/theme'

interface NodeSpriteProps {
  status: PlanStatus
  theme: ThemeId
  goalLevel?: GoalLevel
  recurrence?: PlanRecurrence
  isActive?: boolean
}

export function NodeSprite({ status, theme, goalLevel = 'middle', recurrence, isActive = false }: NodeSpriteProps) {
  const repeatCount = recurrence?.enabled ? Math.min(5, recurrence.completedCount) : 0

  return (
    <span
      aria-hidden="true"
      className={`node-sprite node-sprite-${theme} sprite-${status} ${isActive ? 'sprite-active' : ''} goal-level-${goalLevel} ${recurrence?.enabled ? 'is-repeat' : ''} repeat-count-${repeatCount}`}
    >
      <span className="sprite-spark sprite-spark-one" />
      <span className="sprite-spark sprite-spark-two" />
      <span className="sprite-hero">
        <span className="sprite-head" />
      <span className="sprite-body" />
      <span className="sprite-book" />
      </span>
      <span className="sprite-ground" />
    </span>
  )
}
