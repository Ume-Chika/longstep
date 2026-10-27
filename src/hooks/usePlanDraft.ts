import { useRef, useState } from 'react'
import { savePlan } from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import type { ThemeId } from '../models/theme'

interface UsePlanDraftOptions {
  activePlan: PlanSnapshot | null
  activePlanRef: React.MutableRefObject<PlanSnapshot | null>
  setActivePlan: (plan: PlanSnapshot) => void
  setPlans: React.Dispatch<React.SetStateAction<PlanSnapshot[]>>
  reportSaveError: (error: unknown, suffix?: string) => void
}

export function usePlanDraft({
  activePlan,
  activePlanRef,
  setActivePlan,
  setPlans,
  reportSaveError,
}: UsePlanDraftOptions) {
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false)
  const [mapPlanName, setMapPlanName] = useState('')
  const [mapFinalGoalName, setMapFinalGoalName] = useState('')
  const [mapFinalGoalDescription, setMapFinalGoalDescription] = useState('')
  const [mapPlanDeadline, setMapPlanDeadline] = useState('')
  const [mapPlanSaveStatus, setMapPlanSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [theme, setTheme] = useState<ThemeId>('fire')

  const mapPlanSaveTimerRef = useRef<number | null>(null)
  const mapPlanSaveVersionRef = useRef(0)
  const mapPlanDraftRef = useRef({
    name: '',
    finalGoalName: '',
    finalGoalDescription: '',
    deadline: '',
    theme: 'fire' as ThemeId,
  })

  function openMapMenu() {
    if (!activePlan) return
    setMapPlanName(activePlan.name)
    setMapFinalGoalName(activePlan.goal.statement)
    setMapFinalGoalDescription(activePlan.goal.description ?? '')
    setMapPlanDeadline(activePlan.goal.deadline)
    mapPlanDraftRef.current = {
      name: activePlan.name,
      finalGoalName: activePlan.goal.statement,
      finalGoalDescription: activePlan.goal.description ?? '',
      deadline: activePlan.goal.deadline,
      theme,
    }
    setMapPlanSaveStatus('saved')
    setIsMapMenuOpen(true)
  }

  function closeMapMenu(): boolean {
    setIsMapMenuOpen(false)
    return true
  }

  async function updatePlanTheme(nextTheme: ThemeId) {
    if (!activePlan) return
    setTheme(nextTheme)
    mapPlanDraftRef.current = { ...mapPlanDraftRef.current, theme: nextTheme }

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
        theme: nextTheme,
      },
    }

    try {
      await savePlan(updatedPlan)
      setPlans((current) => current.map((plan) => plan.id === updatedPlan.id ? updatedPlan : plan))
      activePlanRef.current = updatedPlan
      setActivePlan(updatedPlan)
    } catch (error) {
      reportSaveError(error, 'テーマの保存に失敗しました。')
    }
  }

  function updateMapPlanDraft(changes: Partial<{ name: string; finalGoalName: string; finalGoalDescription: string; deadline: string }>) {
    if (!activePlan) return
    const draft = { ...mapPlanDraftRef.current, ...changes }
    mapPlanDraftRef.current = draft
    setMapPlanName(draft.name)
    setMapFinalGoalName(draft.finalGoalName)
    setMapFinalGoalDescription(draft.finalGoalDescription)
    setMapPlanDeadline(draft.deadline)

    if (mapPlanSaveTimerRef.current !== null) window.clearTimeout(mapPlanSaveTimerRef.current)
    const version = ++mapPlanSaveVersionRef.current
    const name = draft.name.trim()
    const finalGoalName = draft.finalGoalName.trim()
    const finalGoalDescription = draft.finalGoalDescription.trim()
    if (!name) {
      setMapPlanSaveStatus('error')
      return
    }

    setMapPlanSaveStatus('saving')
    const planId = activePlan.id

    mapPlanSaveTimerRef.current = window.setTimeout(() => {
      mapPlanSaveTimerRef.current = null
      const sourcePlan = activePlanRef.current
      if (!sourcePlan || sourcePlan.id !== planId) return

      const nextGoal = {
        ...sourcePlan.goal,
        statement: finalGoalName,
        deadline: draft.deadline,
        ...(finalGoalDescription ? { description: finalGoalDescription } : {}),
      }
      if (!finalGoalDescription) delete nextGoal.description

      const updatedPlan: PlanSnapshot = {
        ...sourcePlan,
        name,
        goal: nextGoal,
        meta: {
          ...sourcePlan.meta,
          revision: sourcePlan.meta.revision + 1,
          updatedAt: new Date().toISOString(),
          theme: draft.theme,
        },
      }

      void savePlan(updatedPlan).then(() => {
        setPlans((current) => current.map((plan) => plan.id === updatedPlan.id ? updatedPlan : plan))
        if (activePlanRef.current?.id === updatedPlan.id) {
          activePlanRef.current = updatedPlan
          setActivePlan(updatedPlan)
          setTheme(draft.theme)
        }
        if (mapPlanSaveVersionRef.current === version) setMapPlanSaveStatus('saved')
      }).catch((error) => {
        if (mapPlanSaveVersionRef.current === version) setMapPlanSaveStatus('error')
        reportSaveError(error, '変更内容を確認して、もう一度入力してください。')
      })
    }, 300)
  }

  return {
    isMapMenuOpen,
    setIsMapMenuOpen,
    mapPlanName,
    mapFinalGoalName,
    mapFinalGoalDescription,
    mapPlanDeadline,
    mapPlanSaveStatus,
    theme,
    setTheme,
    openMapMenu,
    closeMapMenu,
    updatePlanTheme,
    updateMapPlanDraft,
  }
}
