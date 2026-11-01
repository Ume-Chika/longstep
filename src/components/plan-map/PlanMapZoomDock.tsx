import type { MouseEvent } from 'react'
import { maxMapZoom, minMapZoom } from './planMapLayout.ts'
import { IconMinus, IconPlus } from './PlanMapIcons.tsx'

interface PlanMapZoomDockProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onFitMap: () => void
}

export function PlanMapZoomDock({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitMap,
}: PlanMapZoomDockProps) {
  function stopPropagation(event: MouseEvent) {
    event.stopPropagation()
  }

  return (
    <div aria-label="マップの拡大縮小" className="map-zoom-dock" onClick={stopPropagation} role="group">
      <button
        aria-label="マップを縮小"
        className="map-zoom-button"
        disabled={zoom <= minMapZoom}
        onClick={onZoomOut}
        title="縮小"
        type="button"
      >
        <IconMinus />
      </button>
      <button
        aria-label={`拡大率${Math.round(zoom * 100)}パーセント、等倍に戻す`}
        className="map-zoom-reset"
        onClick={onResetZoom}
        title="等倍（100%）に戻す"
        type="button"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        aria-label="マップを拡大"
        className="map-zoom-button"
        disabled={zoom >= maxMapZoom}
        onClick={onZoomIn}
        title="拡大"
        type="button"
      >
        <IconPlus />
      </button>
      <button
        aria-label="マップ全体を画面に収める"
        className="map-zoom-fit"
        onClick={onFitMap}
        title="全体を画面に収める"
        type="button"
      >
        全体
      </button>
    </div>
  )
}
