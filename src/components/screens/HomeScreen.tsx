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

function StarIcon() {
  return (
    <svg aria-hidden="true" className="plan-favorite-star" fill="currentColor" height="14" viewBox="0 0 16 16" width="14">
      <path d="M8 1.5l2.06 4.18 4.62.67-3.34 3.26.79 4.6L8 12.04l-4.13 2.17.79-4.6L1.32 6.35l4.62-.67L8 1.5z" />
    </svg>
  )
}

function MoreVerticalIcon() {
  return (
    <svg aria-hidden="true" className="plan-more-icon" fill="currentColor" height="16" viewBox="0 0 16 16" width="16">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  )
}

function CompassIcon() {
  return (
    <svg aria-hidden="true" className="empty-icon-svg" fill="none" height="40" viewBox="0 0 40 40" width="40">
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2" />
      <polygon fill="currentColor" points="20,8 24,18 20,16 16,18" />
      <polygon fill="none" points="20,32 24,22 20,24 16,22" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" fill="currentColor" r="2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="button-icon-plus" fill="none" height="14" viewBox="0 0 14 14" width="14">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
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
            <PlusIcon />
            新規計画書を作成
          </button>
        </div>

        {needsDirectoryPermission ? (
          <div className="empty-plans">
            <CompassIcon />
            <strong>保存先へのアクセス許可が必要です</strong>
            <p>ブラウザを開き直すとフォルダへのアクセス許可がリセットされます。許可すると前回までの計画書を読み込みます。</p>
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
            <CompassIcon />
            <strong>保存された計画書はありません</strong>
            <p>新しい計画書を作成するか、既存の保存先フォルダ（書類 / Longstep）を選んで計画を再開できます。</p>
            <div className="empty-plan-actions">
              <button
                className="rpg-button rpg-button-primary"
                onClick={onGoCreate}
                type="button"
              >
                <PlusIcon />
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
                  <strong>
                    {planPreferences[plan.id]?.favorite && <StarIcon />}
                    {plan.name}
                  </strong>
                  <span>{plan.nodes.length}個の中間目標 · {formatUpdatedAt(plan.meta.updatedAt)}更新</span>
                </button>
                <div className="saved-plan-actions">
                  <button
                    aria-label={`${plan.name}のメニュー`}
                    className="plan-menu-button"
                    onClick={() => setPlanMenuId(planMenuId === plan.id ? null : plan.id)}
                    type="button"
                  >
                    <MoreVerticalIcon />
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
