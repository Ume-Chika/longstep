import type { FormEvent } from 'react'
import type { CreateErrors, CreateForm } from '../../types/app'
import { LONGSTEP_DIRECTORY_NAME } from '../../python/entry'
import { backdropCloseHandlers } from '../backdropClose'

interface CreatePlanModalProps {
  form: CreateForm
  errors: CreateErrors
  longstepDirectory: FileSystemDirectoryHandle | null
  projectDirectory: FileSystemDirectoryHandle | null
  isBusy: boolean
  onChangeField: (field: keyof CreateForm, value: string) => void
  onSelectLongstepDir: () => void
  onSelectProjectDir: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function CreatePlanModal({
  form,
  errors,
  longstepDirectory,
  projectDirectory,
  isBusy,
  onChangeField,
  onSelectLongstepDir,
  onSelectProjectDir,
  onSubmit,
  onClose,
}: CreatePlanModalProps) {
  return (
    <div className="modal-backdrop app-modal-backdrop" {...backdropCloseHandlers(onClose)}>
      <section aria-labelledby="app-modal-heading" aria-modal="true" className="app-modal common-modal" role="dialog">
        <button aria-label="モーダルを閉じる" className="modal-close" onClick={onClose} type="button">
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 14 14" width="14">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>

        <form className="app-modal-form create-form" noValidate onSubmit={onSubmit}>
          <h2 id="app-modal-heading">新規計画書</h2>

          <div className="form-field">
            <label htmlFor="create-plan-name">計画名<span className="field-required">必須</span></label>
            <input
              aria-describedby={errors.planName ? 'create-plan-name-error' : undefined}
              aria-invalid={errors.planName ? true : undefined}
              autoFocus
              id="create-plan-name"
              onChange={(event) => onChangeField('planName', event.target.value)}
              placeholder="例：ポートフォリオサイトを公開する"
              value={form.planName}
            />
            {errors.planName && (
              <p className="field-error" id="create-plan-name-error" role="alert">
                {errors.planName}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="create-longstep-dir">保存先フォルダ<span className="field-required">必須</span></label>
            <div className="path-field">
              <input
                aria-describedby={errors.longstepDirectory ? 'create-longstep-dir-error' : 'create-longstep-dir-help'}
                aria-invalid={errors.longstepDirectory ? true : undefined}
                id="create-longstep-dir"
                placeholder="未選択"
                readOnly
                value={longstepDirectory ? `書類 / ${longstepDirectory.name}` : ''}
              />
              <button className="path-field-button" disabled={isBusy} onClick={onSelectLongstepDir} type="button">
                参照…
              </button>
            </div>
            <p className="field-help" id="create-longstep-dir-help">
              計画JSONと共通ツール（<code>longstep.pyz</code>）の置き場所は<strong>書類フォルダ内の「{LONGSTEP_DIRECTORY_NAME}」</strong>に固定です。Pythonツールが同じ場所を自動で参照します。フォルダがなければ、選択ダイアログで新規作成してください。
            </p>
            {errors.longstepDirectory && (
              <p className="field-error" id="create-longstep-dir-error" role="alert">
                {errors.longstepDirectory}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="create-project-dir">AI連携ファイルの置き場所<span className="field-optional">任意</span></label>
            <div className="path-field">
              <input
                id="create-project-dir"
                placeholder="未選択"
                readOnly
                value={projectDirectory?.name ?? ''}
              />
              <button className="path-field-button" disabled={isBusy} onClick={onSelectProjectDir} type="button">
                参照…
              </button>
            </div>
            <p className="field-help">
              AIエージェントがこの計画を読み書きするための<code>longstep.py</code>を、このフォルダへ置きます。あとからホームで計画を右クリックして追加でき、複数のプロジェクトへ追加できます。
            </p>
          </div>

          <div className="form-submit">
            <button className="is-primary" disabled={isBusy} type="submit">
              {isBusy ? '作成中…' : '計画書を作成する'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
