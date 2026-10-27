import { useRef, useState } from 'react'
import {
  getPlanPreferences,
  getSitePreferences,
  savePlanPreferences,
  saveSitePreferences,
  type PlanPreferences,
  type SitePreferences,
} from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import type { DateFormat, Notice } from '../types/app'

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
  const [sitePreferences, setSitePreferences] = useState<SitePreferences>({ dateFormat: 'deadline' })
  const viewSaveTimerRef = useRef<number | null>(null)

  async function loadPreferencesForPlans(plans: PlanSnapshot[]) {
    const loadedPreferences = await Promise.all(
      plans.map(async (plan) => [plan.id, await getPlanPreferences(plan.id)] as const),
    )
    setPlanPreferences(Object.fromEntries(loadedPreferences))
  }

  async function loadSitePreferences() {
    try {
      const prefs = await getSitePreferences()
      setSitePreferences(prefs)
    } catch {
      // 読み込めない場合は初期値を使用
    }
  }

  async function updateDateFormat(nextFormat: DateFormat) {
    setSitePreferences({ dateFormat: nextFormat })
    try {
      await saveSitePreferences({ dateFormat: nextFormat })
      if (activePlan) {
        await savePlanPreferences(activePlan.id, { dateFormat: nextFormat })
        setPlanPreferences((current) => ({
          ...current,
          [activePlan.id]: { ...(current[activePlan.id] ?? { favorite: false }), dateFormat: nextFormat },
        }))
      }
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} 表示設定を保存できませんでした。` })
    }
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

  const currentDateFormat: DateFormat = (activePlan && planPreferences[activePlan.id]?.dateFormat) ?? sitePreferences.dateFormat
  const showRemainingDays = currentDateFormat === 'remaining'

  return {
    planPreferences,
    sitePreferences,
    currentDateFormat,
    showRemainingDays,
    setPlanPreferences,
    loadPreferencesForPlans,
    loadSitePreferences,
    updateDateFormat,
    saveViewPosition,
    toggleFavorite,
    getSortedPlans,
  }
}
