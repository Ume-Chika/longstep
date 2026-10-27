import { getLastOpenedPlanId, listPlans, readPlan, saveLastOpenedPlan, PlanConflictError } from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import type { ThemeId } from '../models/theme'
import type { Notice, Screen } from '../types/app'

interface UsePlanNavigationOptions {
  activePlan: PlanSnapshot | null
  activePlanRef: React.MutableRefObject<PlanSnapshot | null>
  plans: PlanSnapshot[]
  setActivePlan: (plan: PlanSnapshot | null) => void
  setPlans: React.Dispatch<React.SetStateAction<PlanSnapshot[]>>
  setSelectedNodeId: (id: string | null) => void
  setScreen: (screen: Screen) => void
  setTheme: (theme: ThemeId) => void
  closeMapMenu: () => boolean
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  loadPreferencesForPlans: (plans: PlanSnapshot[]) => Promise<void>
  errorMessage: (error: unknown) => string
}

export function usePlanNavigation({
  activePlan,
  activePlanRef,
  plans,
  setActivePlan,
  setPlans,
  setSelectedNodeId,
  setScreen,
  setTheme,
  closeMapMenu,
  setNotice,
  loadPreferencesForPlans,
  errorMessage,
}: UsePlanNavigationOptions) {
  async function loadPlans(): Promise<PlanSnapshot[]> {
    try {
      const loadedPlans = await listPlans()
      setPlans(loadedPlans)
      await loadPreferencesForPlans(loadedPlans)
      return loadedPlans
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return []
    }
  }

  async function openPlan(plan: PlanSnapshot, successMessage?: string) {
    try {
      await saveLastOpenedPlan(plan.id)
    } catch {
      // メタ保存失敗時も開く操作は継続
    }
    setActivePlan(plan)
    setSelectedNodeId(null)
    setTheme(plan.meta.theme)
    setScreen('map')
    setNotice(successMessage ? { kind: 'success', text: successMessage } : null)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  async function openMostRecentPlan(): Promise<boolean> {
    const loadedPlans = await loadPlans()
    if (loadedPlans.length === 0) return false
    let lastId: string | null = null
    try {
      lastId = await getLastOpenedPlanId()
    } catch {
      // 保存済みIDを読めない場合は一覧の先頭を開く
    }
    await openPlan(loadedPlans.find((plan) => plan.id === lastId) ?? loadedPlans[0])
    return true
  }

  async function refreshActivePlan() {
    const planId = activePlanRef.current?.id
    if (!planId) return
    try {
      const latest = await readPlan(planId)
      activePlanRef.current = latest
      setActivePlan(latest)
      setPlans((current) => current.map((plan) => plan.id === latest.id ? latest : plan))
    } catch {
      // 読み直せない場合は自動同期に委ねる
    }
  }

  function reportSaveError(error: unknown, suffix?: string) {
    if (error instanceof PlanConflictError) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      void refreshActivePlan()
      return
    }
    setNotice({ kind: 'error', text: suffix ? `${errorMessage(error)} ${suffix}` : errorMessage(error) })
  }

  function goHome() {
    setScreen('home')
    setSelectedNodeId(null)
    closeMapMenu()
    setNotice(null)
    void loadPlans()
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  function openAdjacentPlan(offset: -1 | 1) {
    if (!activePlan) return
    const currentIndex = plans.findIndex((plan) => plan.id === activePlan.id)
    const nextPlan = plans[currentIndex + offset]
    if (nextPlan) void openPlan(nextPlan)
  }

  return {
    loadPlans,
    openPlan,
    openMostRecentPlan,
    refreshActivePlan,
    reportSaveError,
    goHome,
    openAdjacentPlan,
  }
}
