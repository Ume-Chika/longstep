import { useEffect, useState } from 'react'
import type { PlanPreferences } from '../../db/planStore'
import type { PlanSnapshot } from '../../models/plan'

interface HomeScreenProps {
  plans: PlanSnapshot[]
  sortedPlans: PlanSnapshot[]
  planPreferences: Record<string, PlanPreferences>
  needsDirectoryPermission: boolean
  onGoCreate: () => void
  onRestoreSavedPlans: () => void
  onReopenFromDirectory: () => void
  onOpenPlan: (plan: PlanSnapshot) => void
  onToggleFavorite: (plan: PlanSnapshot) => void
  onStartRename: (plan: PlanSnapshot) => void
  onInstallEntry: (plan: PlanSnapshot) => void
  onDeletePlan: (plan: PlanSnapshot) => void
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '更新日不明'
  }
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function HomeScreen({
  plans,
  sortedPlans,
  planPreferences,
  needsDirectoryPermission,
  onGoCreate,
  onRestoreSavedPlans,
  onReopenFromDirectory,
  onOpenPlan,
  onToggleFavorite,
  onStartRename,
  onInstallEntry,
  onDeletePlan,
}: HomeScreenProps) {
  const [planMenuId, setPlanMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!planMenuId) return

    function closePlanMenu(event: PointerEvent) {
      if (!(event.target as Element).closest('.saved-plan-actions')) {
        setPlanMenuId(null)
      }
    }

    window.addEventListener('pointerdown', closePlanMenu)
    return () => window.removeEventListener('pointerdown', closePlanMenu)
  }, [planMenuId])
  return (
    <main className="page home-page">
      <section className="book-section saved-section-top" id="saved-adventures">
        <div className="ornament-heading">
          <h2>計画を再開する</h2>
          <span className="record-count">{plans.length}件</span>
          <button className="rpg-button rpg-button-primary home-create-button" onClick={onGoCreate} type="button">
            ＋ 新規計画書
          </button>
        </div>

        {needsDirectoryPermission ? (
          <div className="empty-plans">
            <span className="empty-icon" aria-hidden="true">◇</span>
            <strong>保存先へのアクセス許可が必要です</strong>
            <p>ブラウザを開き直すと、フォルダへのアクセス許可がリセットされます。許可すると、前回までの計画書を読み込みます。</p>
            <button
              className="rpg-button rpg-button-primary"
              onClick={onRestoreSavedPlans}
              type="button"
            >
              保存先へのアクセスを許可する
            </button>
          </div>
        ) : plans.length === 0 ? (
          <div className="empty-plans">
            <span className="empty-icon" aria-hidden="true">◇</span>
            <strong>まだ計画書がないようです</strong>
            <p>新しい計画書を作成するか、既存の保存先フォルダ（書類 / Longstep）を選んで計画を再開できます。</p>
            <div className="empty-plan-actions">
              <button
                className="rpg-button rpg-button-primary"
                onClick={onGoCreate}
                type="button"
              >
                新規計画書を作成する
              </button>
              <button
                className="rpg-button"
                onClick={onReopenFromDirectory}
                type="button"
              >
                保存先を選んで再開する
              </button>
            </div>
          </div>
        ) : (
          <div className="saved-list">
            {sortedPlans.map((plan, index) => (
              <article
                className="saved-plan"
                key={plan.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setPlanMenuId(plan.id)
                }}
                onDoubleClick={() => onOpenPlan(plan)}
              >
                <span className="save-slot">{index + 1}</span>
                <button className="saved-plan-main" onClick={() => onOpenPlan(plan)} type="button">
                  <strong>{planPreferences[plan.id]?.favorite ? '★ ' : ''}{plan.name}</strong>
                  <span>{plan.nodes.length}個の中間目標 · {formatUpdatedAt(plan.meta.updatedAt)}更新</span>
                </button>
                <div className="saved-plan-actions">
                  <button
                    aria-label={`${plan.name}のメニュー`}
                    className="plan-menu-button"
                    onClick={() => setPlanMenuId(planMenuId === plan.id ? null : plan.id)}
                    type="button"
                  >
                    …
                  </button>
                  {planMenuId === plan.id && (
                    <div className="plan-context-menu">
                      <button onClick={() => onToggleFavorite(plan)} type="button">
                        {planPreferences[plan.id]?.favorite ? 'お気に入り解除' : 'お気に入り登録'}
                      </button>
                      <button onClick={() => onStartRename(plan)} type="button">名前変更</button>
                      <button onClick={() => onInstallEntry(plan)} type="button">AI連携ファイルを追加</button>
                      <button onClick={() => onDeletePlan(plan)} type="button">削除</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
