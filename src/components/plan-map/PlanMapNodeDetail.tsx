import type { PlanNode, PlanSnapshot } from '../../models/plan'
import { backdropCloseHandlers } from '../backdropClose.ts'
import { getStatusLabel, goalLevelOptions, todayIsoDate } from './planMapHelpers.ts'

interface PlanMapNodeDetailProps {
  draftNode: PlanNode
  plan: PlanSnapshot
  nodeNames: Map<string, string>
  autoSaveStatus: 'saved' | 'saving' | 'error'
  onClose: () => void
  onUpdateDraft: <K extends keyof PlanNode>(key: K, value: PlanNode[K], flushImmediately?: boolean) => void
  onFlushDraft: () => void
  onToggleCompletion: () => void
  onDeleteNode: () => void
}

export function PlanMapNodeDetail({
  draftNode,
  plan,
  nodeNames,
  autoSaveStatus,
  onClose,
  onUpdateDraft,
  onFlushDraft,
  onToggleCompletion,
  onDeleteNode,
}: PlanMapNodeDetailProps) {
  return (
    <>
      <button aria-label="目標詳細を閉じる" className="detail-scrim" {...backdropCloseHandlers(onClose)} type="button" />
      <aside aria-labelledby="node-detail-heading" aria-modal="true" className="node-detail common-modal" role="dialog">
        <div className="detail-topline">
          <h2 id="node-detail-heading">目標詳細</h2>
          <button aria-label="目標詳細を閉じる" className="detail-close" onClick={onClose} type="button">
            <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 14 14" width="14">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>
        <div className="detail-hero">
          <div>
            <span className={`status-label status-${draftNode.status}`}>{getStatusLabel(draftNode.status)}</span>
            <h3>{draftNode.name}</h3>
          </div>
        </div>

        <div className="node-edit-form">
          <label className="node-edit-field">
            <span>目標名</span>
            <input
              onBlur={() => onFlushDraft()}
              onChange={(event) => onUpdateDraft('name', event.target.value)}
              value={draftNode.name}
            />
          </label>

          <button
            className="node-completion-button"
            onClick={onToggleCompletion}
            type="button"
          >
            {draftNode.status === 'completed' ? 'この目標を未達成にする' : 'この目標を達成済みにする'}
          </button>

          <div className="node-toggle-section">
            <span className="node-toggle-label">目標の粒度</span>
            <div aria-label="目標の粒度" className="node-level-toggle" role="group">
              {goalLevelOptions.map(([value, label]) => (
                <button
                  aria-pressed={(draftNode.goalLevel ?? 'middle') === value}
                  className={(draftNode.goalLevel ?? 'middle') === value ? 'is-active' : ''}
                  key={value}
                  onClick={() => onUpdateDraft('goalLevel', value as PlanNode['goalLevel'], true)}
                  type="button"
                >{label}</button>
              ))}
            </div>
          </div>

          <div className="node-edit-field node-date-field">
            <label>
              <input
                checked={Boolean(draftNode.targetDate)}
                onChange={(event) => onUpdateDraft('targetDate', event.target.checked ? (plan.goal.deadline || todayIsoDate()) : '', true)}
                type="checkbox"
              />
              目標日を設定する
            </label>
            <input
              disabled={!draftNode.targetDate}
              onBlur={() => onFlushDraft()}
              onChange={(event) => onUpdateDraft('targetDate', event.target.value)}
              type="date"
              value={draftNode.targetDate}
            />
          </div>
          <label className="node-edit-field">
            <span>説明</span>
            <textarea
              onBlur={() => onFlushDraft()}
              onChange={(event) => onUpdateDraft('description', event.target.value)}
              placeholder="この目標の要点や参考ファイルパスを入力"
              rows={4}
              value={draftNode.description}
            />
          </label>

          <p className="node-autosave-note" role="status">
            {autoSaveStatus === 'saving' ? '保存中…' : autoSaveStatus === 'error' ? '保存できませんでした' : '保存済み'}
          </p>
          <div className="node-readonly">
            <span>前提となる目標</span>
            <strong>{draftNode.dependsOn.length > 0 ? draftNode.dependsOn.map((id) => nodeNames.get(id) ?? id).join('、') : 'なし'}</strong>
          </div>
        </div>
        <div className="node-detail-danger-zone">
          <button className="node-delete-button" onClick={onDeleteNode} type="button">この目標を削除</button>
        </div>
      </aside>
    </>
  )
}
