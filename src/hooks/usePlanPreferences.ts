import { useRef, useState } from 'react'
import { getPlanPreferences, savePlanPreferences } from '../db/planStore'
import type { PlanPreferences } from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import type { Notice } from '../types/app'

interface UsePlanPreferencesOptions {
  activePlan: PlanSnapshot | null
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  errorMessage: (error: unknown) => string
}

export function usePlanPreferences({
  activePlan,
  setNotice,
  errorMessage,
}: UsePlanPreferencesOptions) {
  const [planPreferences, setPlanPreferences] = useState<Record<string, PlanPreferences>>({})
  const viewSaveTimerRef = useRef<number | null>(null)

  async function loadPreferencesForPlans(plans: PlanSnapshot[]) {
    const loadedPreferences = await Promise.all(
      plans.map(async (plan) => [plan.id, await getPlanPreferences(plan.id)] as const),
    )
    setPlanPreferences(Object.fromEntries(loadedPreferences))
  }

  function saveViewPosition(position: { left: number; top: number }) {
    if (!activePlan) return
    if (viewSaveTimerRef.current !== null) window.clearTimeout(viewSaveTimerRef.current)

    viewSaveTimerRef.current = window.setTimeout(() => {
      void savePlanPreferences(activePlan.id, { viewPosition: position }).then(() => {
        setPlanPreferences((current) => ({
          ...current,
          [activePlan.id]: { ...(current[activePlan.id] ?? { favorite: false }), viewPosition: position },
        }))
      })
    }, 180)
  }

  async function toggleFavorite(plan: PlanSnapshot) {
    const favorite = !(planPreferences[plan.id]?.favorite ?? false)
    try {
      await savePlanPreferences(plan.id, { favorite })
      setPlanPreferences((current) => ({
        ...current,
        [plan.id]: { ...(current[plan.id] ?? { favorite: false }), favorite },
      }))
      setNotice({ kind: 'success', text: favorite ? 'お気に入りに登録しました。' : 'お気に入りを解除しました。' })
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} もう一度操作してください。` })
    }
  }

  function getSortedPlans(plans: PlanSnapshot[]): PlanSnapshot[] {
    return [...plans].sort((left, right) => {
      const favoriteDifference = Number(planPreferences[right.id]?.favorite ?? false) - Number(planPreferences[left.id]?.favorite ?? false)
      return favoriteDifference || right.meta.updatedAt.localeCompare(left.meta.updatedAt)
    })
  }

  return {
    planPreferences,
    setPlanPreferences,
    loadPreferencesForPlans,
    saveViewPosition,
    toggleFavorite,
    getSortedPlans,
  }
}
