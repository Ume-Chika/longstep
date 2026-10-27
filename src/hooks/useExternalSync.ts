import { useEffect, useRef } from 'react'
import { readPlan } from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import type { Notice, Screen } from '../types/app'

interface UseExternalSyncParams {
  screen: Screen
  activePlan: PlanSnapshot | null
  setActivePlan: (plan: PlanSnapshot) => void
  setPlans: React.Dispatch<React.SetStateAction<PlanSnapshot[]>>
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  setAchievement: (text: string | null) => void
  errorMessage: (error: unknown) => string
}

export function useExternalSync({
  screen,
  activePlan,
  setActivePlan,
  setPlans,
  setNotice,
  setAchievement,
  errorMessage,
}: UseExternalSyncParams) {
  const activePlanRef = useRef<PlanSnapshot | null>(null)
  const externalSyncErrorRef = useRef(false)

  useEffect(() => {
    activePlanRef.current = activePlan
  }, [activePlan])

  const activePlanId = activePlan?.id ?? null

  useEffect(() => {
    if (screen !== 'map' || !activePlanId) return
    const planId = activePlanId
    let timer: number | null = null

    async function checkForExternalUpdate() {
      if (document.visibilityState !== 'visible' || !activePlanRef.current) return
      try {
        const latest = await readPlan(planId)
        externalSyncErrorRef.current = false
        if (latest.meta.revision <= activePlanRef.current.meta.revision) return

        const previousNodesById = new Map(activePlanRef.current.nodes.map((node) => [node.id, node]))
        const newlyCompleted = latest.nodes.filter((node) => {
          const prev = previousNodesById.get(node.id)
          return prev && prev.status !== 'completed' && node.status === 'completed'
        })

        activePlanRef.current = latest
        setActivePlan(latest)
        setPlans((current) => current.map((plan) => (plan.id === latest.id ? latest : plan)))

        if (newlyCompleted.length > 0) {
          setAchievement(newlyCompleted[newlyCompleted.length - 1].name)
        } else {
          setNotice({ kind: 'success', text: 'Pythonツールの更新を反映しました。' })
        }
      } catch (error) {
        if (externalSyncErrorRef.current) return
        externalSyncErrorRef.current = true
        setNotice({ kind: 'error', text: `${errorMessage(error)} 保存先と計画JSONを確認してください。` })
      }
    }

    function start() {
      if (document.visibilityState !== 'visible' || timer !== null) return
      void checkForExternalUpdate()
      timer = window.setInterval(() => void checkForExternalUpdate(), 1000)
    }

    function stop() {
      if (timer !== null) window.clearInterval(timer)
      timer = null
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    start()
    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [screen, activePlanId, setActivePlan, setPlans, setNotice, setAchievement, errorMessage])
}
