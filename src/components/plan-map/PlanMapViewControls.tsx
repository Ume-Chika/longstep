import type { MouseEvent, RefObject } from 'react'
import { themeOptions } from '../../models/theme'
import type { ThemeId } from '../../models/theme'
import type { DateFormat } from '../../types/app'

interface PlanMapViewControlsProps {
  controlsRef: RefObject<HTMLDivElement | null>
  isOpen: boolean
  onToggleOpen: () => void
  onClose: () => void
  theme: ThemeId
  onUpdateTheme: (theme: ThemeId) => void
  showRemainingDays?: boolean
  onChangeDateFormat?: (format: DateFormat) => void
  collapsibleCount: number
  isHistoryExpanded: boolean
  onToggleHistory: (expanded: boolean) => void
}

export function PlanMapViewControls({
  controlsRef,
  isOpen,
  onToggleOpen,
  onClose,
  theme,
  onUpdateTheme,
  showRemainingDays,
  onChangeDateFormat,
  collapsibleCount,
  isHistoryExpanded,
  onToggleHistory,
}: PlanMapViewControlsProps) {
  function stopPropagation(event: MouseEvent) {
    event.stopPropagation()
  }

  return (
    <div className="map-view-controls" onClick={stopPropagation} ref={controlsRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="マップの表示設定"
        className={`map-view-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={onToggleOpen}
        type="button"
      >
        <span className="view-trigger-label">表示</span>
        <svg aria-hidden="true" className="view-trigger-arrow" viewBox="0 0 5 3">
          {isOpen ? (
            <path d="M2 0h1v1H2zM1 1h3v1H1zM0 2h5v1H0z" fill="currentColor" shapeRendering="crispEdges" />
          ) : (
            <path d="M0 0h5v1H0zM1 1h3v1H1zM2 2h1v1H2z" fill="currentColor" shapeRendering="crispEdges" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div aria-label="マップの表示設定" className="map-view-popover" role="dialog">
          <div className="view-popover-title">
            <span>表示設定</span>
            <button aria-label="表示設定を閉じる" className="view-popover-close" onClick={onClose} type="button">×</button>
          </div>

          <div className="view-popover-item">
            <label className="view-item-label" htmlFor="plan-theme-select">計画書の色</label>
            <select
              className="view-item-select"
              id="plan-theme-select"
              onChange={(event) => onUpdateTheme(event.target.value as ThemeId)}
              value={theme}
            >
              {themeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="view-popover-item">
            <span className="view-item-label">目標の日付表記</span>
            <div aria-label="目標の日付表記" className="view-item-segmented" role="group">
              <button
                aria-pressed={!showRemainingDays}
                className={!showRemainingDays ? 'is-active' : ''}
                onClick={() => onChangeDateFormat?.('deadline')}
                type="button"
              >締切り日</button>
              <button
                aria-pressed={showRemainingDays}
                className={showRemainingDays ? 'is-active' : ''}
                onClick={() => onChangeDateFormat?.('remaining')}
                type="button"
              >残り日数</button>
            </div>
          </div>

          {collapsibleCount > 0 && (
            <div className="view-popover-item">
              <span className="view-item-label">過去の目標（{collapsibleCount}件）</span>
              <div aria-label="過去の達成済み目標の表示" className="view-item-segmented" role="group">
                <button
                  aria-pressed={!isHistoryExpanded}
                  className={!isHistoryExpanded ? 'is-active' : ''}
                  onClick={() => onToggleHistory(false)}
                  type="button"
                >省略する</button>
                <button
                  aria-pressed={isHistoryExpanded}
                  className={isHistoryExpanded ? 'is-active' : ''}
                  onClick={() => onToggleHistory(true)}
                  type="button"
                >全て表示</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
