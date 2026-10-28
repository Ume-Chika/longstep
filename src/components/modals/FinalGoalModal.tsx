import { backdropCloseHandlers } from '../backdropClose'

interface FinalGoalModalProps {
  isOpen: boolean
  planName: string
  completedNodes: number
  totalNodes: number
  deadline: string
  draftName: string
  draftFinalGoalName: string
  draftFinalGoalDescription: string
  draftDeadline: string
  saveStatus: 'saved' | 'saving' | 'error'
  onChangeDraft: (changes: Partial<{
    name: string
    finalGoalName: string
    finalGoalDescription: string
    deadline: string
  }>) => void
  onClose: () => void
}

export function FinalGoalModal({
  isOpen,
  planName,
  completedNodes,
  totalNodes,
  deadline,
  draftName,
  draftFinalGoalName,
  draftFinalGoalDescription,
  draftDeadline,
  saveStatus,
  onChangeDraft,
  onClose,
}: FinalGoalModalProps) {
  return (
    <>
      <button
        aria-label="最終目標の設定を閉じる"
        className={`map-menu-scrim ${isOpen ? 'is-open' : ''}`}
        {...backdropCloseHandlers(onClose)}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />
      <aside
        aria-labelledby="map-command-menu-heading"
        aria-hidden={!isOpen}
        aria-modal="true"
        className={`map-command-menu common-modal ${isOpen ? 'is-open' : ''}`}
        id="map-command-menu"
        inert={!isOpen}
        role="dialog"
      >
        <button aria-label="最終目標の設定を閉じる" className="modal-close" onClick={onClose} type="button">
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 14 14" width="14">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
        <div className="map-menu-heading">
          <div>
            <h2 id="map-command-menu-heading">最終目標</h2>
            <strong>{planName}</strong>
          </div>
        </div>
        <div className="map-menu-progress">
          <span><small>達成済み</small><strong>{completedNodes}/{totalNodes}</strong></span>
          <span><small>期限</small><strong>{deadline || '未設定'}</strong></span>
        </div>
        <div className="map-plan-settings">
          <label>
            <span>計画書名</span>
            <input
              onChange={(event) => onChangeDraft({ name: event.target.value })}
              value={draftName}
            />
          </label>
          <label>
            <span>最終目標名</span>
            <input
              onChange={(event) => onChangeDraft({ finalGoalName: event.target.value })}
              value={draftFinalGoalName}
            />
          </label>
          <label>
            <span>最終目標の説明</span>
            <textarea
              onChange={(event) => onChangeDraft({ finalGoalDescription: event.target.value })}
              rows={2}
              value={draftFinalGoalDescription}
            />
          </label>
          <label>
            <span>最終期限</span>
            <input
              onInput={(event) => onChangeDraft({ deadline: event.currentTarget.value })}
              type="date"
              value={draftDeadline}
            />
          </label>
          <p className={`map-plan-save-status is-${saveStatus}`} role="status">
            {saveStatus === 'saving'
              ? '保存中…'
              : saveStatus === 'error'
                ? !draftName.trim()
                  ? '計画書名を入力してください'
                  : '保存できませんでした'
                : '保存済み'}
          </p>
        </div>
      </aside>
    </>
  )
}
