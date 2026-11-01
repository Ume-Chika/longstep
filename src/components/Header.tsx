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
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="header-icon-chevron" fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="header-icon-plus" fill="none" height="14" viewBox="0 0 14 14" width="14">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

export function Header({
  screen,
  activePlan,
  plans,
  onGoHome,
  onGoCreate,
  onOpenPlan,
  onSelectHelpTopic,
}: HeaderProps) {
  return (
    <header className="site-header common-header">
      <button className="header-link" onClick={onGoHome} type="button">
        ホーム
      </button>

      <div className="header-menu">
        <button aria-haspopup="menu" className="header-link" type="button">
          計画書
          <ChevronDownIcon />
        </button>
        <div className="header-submenu" role="menu">
          <button className="header-submenu-create" onClick={onGoCreate} role="menuitem" type="button">
            <PlusIcon />
            新規計画書を作成
          </button>
          {plans.length === 0 ? (
            <span>計画書はありません</span>
          ) : (
            plans.map((plan) => (
              <button key={plan.id} onClick={() => onOpenPlan(plan)} role="menuitem" type="button">
                {plan.name}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="header-menu">
        <button aria-haspopup="menu" className="header-link" type="button">
          ヘルプ
          <ChevronDownIcon />
        </button>
        <div className="header-submenu" role="menu">
          {helpTopics.map((topic) => (
            <button key={topic.id} onClick={() => onSelectHelpTopic(topic.id)} role="menuitem" type="button">
              {topic.label}
            </button>
          ))}
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
