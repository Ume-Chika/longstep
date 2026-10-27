import { useState } from 'react'
import { savePlan } from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import type { Notice } from '../types/app'

interface UseRenamePlanModalOptions {
  activePlan: PlanSnapshot | null
  setActivePlan: (plan: PlanSnapshot) => void
  loadPlans: () => Promise<PlanSnapshot[]>
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  reportSaveError: (error: unknown, suffix?: string) => void
}

export function useRenamePlanModal({
  activePlan,
  setActivePlan,
  loadPlans,
  setNotice,
  reportSaveError,
}: UseRenamePlanModalOptions) {
  const [renamePlan, setRenamePlan] = useState<PlanSnapshot | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  function startRename(plan: PlanSnapshot) {
    setRenamePlan(plan)
    setRenameValue(plan.name)
    setIsDirty(false)
  }

  function closeRenameModal(force = false) {
    if (!force && isDirty && !window.confirm('未保存の入力があります。閉じてもよいですか？')) return
    setRenamePlan(null)
    setRenameValue('')
    setIsDirty(false)
  }

  function updateRenameValue(value: string) {
    setRenameValue(value)
    setIsDirty(true)
  }

  async function confirmRename() {
    const name = renameValue.trim()
    if (!renamePlan || !name) {
      setNotice({ kind: 'error', text: '新しい計画名を入力してください。' })
      return
    }
    const updated: PlanSnapshot = {
      ...renamePlan,
      name,
      meta: {
        ...renamePlan.meta,
        revision: renamePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }
    setIsBusy(true)
    try {
      await savePlan(updated)
      if (activePlan?.id === updated.id) setActivePlan(updated)
      await loadPlans()
      closeRenameModal(true)
      setNotice({ kind: 'success', text: '計画名を変更しました。' })
    } catch (error) {
      reportSaveError(error, 'もう一度変更してください。')
    } finally {
      setIsBusy(false)
    }
  }

  return {
    renamePlan,
    renameValue,
    isBusy,
    isDirty,
    startRename,
    updateRenameValue,
    closeRenameModal,
    confirmRename,
  }
}
