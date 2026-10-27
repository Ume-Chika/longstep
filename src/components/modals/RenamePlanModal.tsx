import { backdropCloseHandlers } from '../backdropClose'

interface RenamePlanModalProps {
  currentName: string
  value: string
  isBusy: boolean
  onChangeValue: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function RenamePlanModal({
  value,
  isBusy,
  onChangeValue,
  onConfirm,
  onClose,
}: RenamePlanModalProps) {
  return (
    <div className="modal-backdrop app-modal-backdrop" {...backdropCloseHandlers(onClose)}>
      <section aria-labelledby="app-modal-heading" aria-modal="true" className="app-modal common-modal" role="dialog">
        <button aria-label="モーダルを閉じる" className="modal-close" onClick={onClose} type="button">
          <span aria-hidden="true" className="button-glyph">×</span>
        </button>
        <div className="app-modal-form">
          <h2 id="app-modal-heading">計画名を変更</h2>
          <label>
            <span>新しい計画名</span>
            <input
              autoFocus
              onChange={(event) => onChangeValue(event.target.value)}
              value={value}
            />
          </label>
          <button disabled={isBusy} onClick={onConfirm} type="button">
            {isBusy ? '変更中…' : '変更する'}
          </button>
        </div>
      </section>
    </div>
  )
}
