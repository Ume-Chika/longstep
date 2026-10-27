import { useState } from 'react'
import {
  addPlanProjectDirectory,
  deletePlan,
  getPlanDirectoryHandle,
  getPlanProjectDirectories,
  savePlanDirectoryHandle,
} from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import { isPythonEntryForPlan, LONGSTEP_DIRECTORY_NAME } from '../python/entry'
import {
  checkOrRequestDirectoryPermission,
  installProjectEntry,
  installSharedTool,
  pickDirectory,
} from '../services/fileStorage'
import type { CreateErrorField, Notice } from '../types/app'

interface UsePlanStorageParams {
  loadPlans: () => Promise<PlanSnapshot[]>
  openMostRecentPlan: () => Promise<boolean>
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  setCreateErrors: React.Dispatch<React.SetStateAction<Partial<Record<CreateErrorField, string>>>>
  clearCreateError: (field: CreateErrorField) => void
  activePlan: PlanSnapshot | null
  goHome: () => void
  errorMessage: (error: unknown) => string
}

export function usePlanStorage({
  loadPlans,
  openMostRecentPlan,
  setNotice,
  setCreateErrors,
  clearCreateError,
  activePlan,
  goHome,
  errorMessage,
}: UsePlanStorageParams) {
  const [longstepDirectory, setLongstepDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [projectDirectory, setProjectDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [needsDirectoryPermission, setNeedsDirectoryPermission] = useState(false)

  async function selectLongstepDirectory() {
    try {
      const handle = await pickDirectory({ id: 'longstep-home', mode: 'readwrite', startIn: 'documents' })
      if (handle.name !== LONGSTEP_DIRECTORY_NAME) {
        setCreateErrors((current) => ({
          ...current,
          longstepDirectory: `「${handle.name}」が選ばれました。書類フォルダの中に「${LONGSTEP_DIRECTORY_NAME}」フォルダを作り、それを選んでください。`,
        }))
        return
      }
      if (await checkOrRequestDirectoryPermission(handle, true) !== 'granted') {
        throw new Error('Longstep保存先への読み書きが許可されませんでした。')
      }
      await savePlanDirectoryHandle(handle)
      setLongstepDirectory(handle)
      clearCreateError('longstepDirectory')
      await loadPlans()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice({ kind: 'error', text: `${errorMessage(error)} 保存先をもう一度選択してください。` })
    }
  }

  async function selectProjectDirectory() {
    try {
      const handle = await pickDirectory({ id: 'longstep-project', mode: 'readwrite' })
      if (await checkOrRequestDirectoryPermission(handle, true) !== 'granted') {
        throw new Error('プロジェクト設置先への読み書きが許可されませんでした。')
      }
      setProjectDirectory(handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice({ kind: 'error', text: `${errorMessage(error)} 設置先をもう一度選択してください。` })
    }
  }

  async function restoreSavedPlans(requestPermissionFromUserGesture = false) {
    const handle = await getPlanDirectoryHandle()
    if (!handle) return
    setLongstepDirectory(handle)

    if (await checkOrRequestDirectoryPermission(handle, requestPermissionFromUserGesture) !== 'granted') {
      setNeedsDirectoryPermission(true)
      return
    }
    setNeedsDirectoryPermission(false)
    await openMostRecentPlan()
  }

  async function reopenFromDirectory() {
    try {
      const handle = await pickDirectory({ id: 'longstep-home', mode: 'readwrite', startIn: 'documents' })
      if (handle.name !== LONGSTEP_DIRECTORY_NAME) {
        throw new Error(`「${handle.name}」が選ばれました。書類フォルダの中の「${LONGSTEP_DIRECTORY_NAME}」フォルダを選んでください。`)
      }
      if (await checkOrRequestDirectoryPermission(handle, true) !== 'granted') {
        throw new Error('Longstep保存先への読み書きが許可されませんでした。')
      }
      await savePlanDirectoryHandle(handle)
      setLongstepDirectory(handle)
      setNeedsDirectoryPermission(false)
      const currentPlans = await loadPlans()
      if (currentPlans.length > 0) {
        await openMostRecentPlan()
      } else {
        setNotice({ kind: 'success', text: `「${LONGSTEP_DIRECTORY_NAME}」フォルダを接続しました。まだ計画書がありません。新規作成してください。` })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice({ kind: 'error', text: `${errorMessage(error)} 保存先をもう一度選択してください。` })
    }
  }

  async function removePythonEntries(planId: string): Promise<{ removed: number; skipped: number }> {
    const result = { removed: 0, skipped: 0 }
    for (const projectDir of await getPlanProjectDirectories(planId)) {
      if (await checkOrRequestDirectoryPermission(projectDir, true) !== 'granted') {
        result.skipped += 1
        continue
      }
      try {
        const handle = await projectDir.getFileHandle('longstep.py')
        const text = await (await handle.getFile()).text()
        if (!isPythonEntryForPlan(text, planId)) continue
        await projectDir.removeEntry('longstep.py')
        result.removed += 1
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') continue
        result.skipped += 1
      }
    }
    return result
  }

  async function installEntryForPlan(plan: PlanSnapshot) {
    try {
      const longstepHandle = longstepDirectory ?? await getPlanDirectoryHandle()
      if (!longstepHandle || await checkOrRequestDirectoryPermission(longstepHandle, true) !== 'granted') {
        throw new Error('Longstep保存先への権限が必要です。')
      }
      const projectHandle = await pickDirectory({ id: 'longstep-project', mode: 'readwrite' })
      if (await checkOrRequestDirectoryPermission(projectHandle, true) !== 'granted') {
        throw new Error('プロジェクト設置先への読み書きが許可されませんでした。')
      }
      await installSharedTool(longstepHandle)
      await installProjectEntry(projectHandle, plan.id)
      await addPlanProjectDirectory(plan.id, projectHandle)
      setNotice({ kind: 'success', text: `「${projectHandle.name}」へ「${plan.name}」のAI連携ファイルを追加しました。` })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  async function handleDeletePlan(plan: PlanSnapshot) {
    const confirmed = window.confirm(`「${plan.name}」を削除しますか？\nこの計画のAI連携ファイルもあわせて削除します。\nこの操作は取り消せません。`)
    if (!confirmed) return

    try {
      const { removed, skipped } = await removePythonEntries(plan.id)
      await deletePlan(plan.id)
      const remainingPlans = await loadPlans()
      if (activePlan?.id === plan.id) {
        goHome()
      }
      const skippedNotice = skipped > 0 ? `（権限のない${skipped}箇所のファイルは残りました）` : ''
      setNotice({
        kind: 'success',
        text: `「${plan.name}」と連携ファイル${removed}件を削除しました。${skippedNotice}`,
      })
      if (remainingPlans.length === 0) {
        goHome()
      }
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} 削除を確認して、もう一度やり直してください。` })
    }
  }

  return {
    longstepDirectory,
    projectDirectory,
    setProjectDirectory,
    needsDirectoryPermission,
    selectLongstepDirectory,
    selectProjectDirectory,
    restoreSavedPlans,
    reopenFromDirectory,
    installEntryForPlan,
    handleDeletePlan,
    directoryPermission: checkOrRequestDirectoryPermission,
  }
}
