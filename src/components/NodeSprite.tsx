import type { CSSProperties } from 'react'
import type { PlanStatus } from '../models/plan'
import type { ThemeId } from '../models/theme'

interface NodeSpriteProps {
  status: PlanStatus
  progress: number
  theme: ThemeId
}

export function NodeSprite({ status, progress, theme }: NodeSpriteProps) {
  return (
    <span
      aria-hidden="true"
      className={`node-sprite node-sprite-${theme} sprite-${status}`}
      style={{ '--sprite-progress': `${progress}%` } as CSSProperties}
    >
      <span className="sprite-spark sprite-spark-one" />
      <span className="sprite-spark sprite-spark-two" />
      <span className="sprite-hero">
        <span className="sprite-head" />
        <span className="sprite-body" />
        <span className="sprite-book" />
      </span>
      <span className="sprite-ground" />
      <span className="sprite-progress"><span /></span>
    </span>
  )
}
