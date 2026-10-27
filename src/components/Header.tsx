import type { PlanSnapshot } from '../models/plan'
import type { Screen } from '../types/app'
import { helpTopics } from '../constants/helpTopics'

interface HeaderProps {
  screen: Screen
  activePlan: PlanSnapshot | null
  plans: PlanSnapshot[]
  onGoHome: () => void
  onGoCreate: () => void
  onOpenPlan: (plan: PlanSnapshot) => void
  onSelectHelpTopic: (topicId: string) => void
  onGoHelpList: () => void
}

export function Header({
  screen,
  activePlan,
  plans,
  onGoHome,
  onGoCreate,
  onOpenPlan,
  onSelectHelpTopic,
  onGoHelpList,
}: HeaderProps) {
  return (
    <header className="site-header common-header">
      <button className="header-link" onClick={onGoHome} type="button">
        ホーム
      </button>

      <div className="header-menu">
        <button className="header-link" type="button">
          ▶ 計画書
        </button>
        <div className="header-submenu">
          <button onClick={onGoCreate} type="button">
            ＋ 新規計画書を作成
          </button>
          {plans.length === 0 ? (
            <span>計画書はありません</span>
          ) : (
            plans.map((plan) => (
              <button key={plan.id} onClick={() => onOpenPlan(plan)} type="button">
                {plan.name}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="header-menu">
        <button className="header-link" type="button">
          ▶ ヘルプ
        </button>
        <div className="header-submenu">
          {helpTopics.map((topic) => (
            <button key={topic.id} onClick={() => onSelectHelpTopic(topic.id)} type="button">
              {topic.label}
            </button>
          ))}
          <button onClick={onGoHelpList} type="button">
            ヘルプ一覧
          </button>
        </div>
      </div>

      {activePlan && screen === 'map' && (
        <div className="header-current-plan">
          <strong>{activePlan.name}</strong>
        </div>
      )}
    </header>
  )
}
