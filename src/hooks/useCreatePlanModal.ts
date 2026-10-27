import { useState } from 'react'
import type { FormEvent } from 'react'
import { addPlanProjectDirectory, savePlan } from '../db/planStore'
import type { PlanSnapshot } from '../models/plan'
import { LONGSTEP_DIRECTORY_LABEL } from '../python/entry'
import { installProjectEntry, installSharedTool } from '../services/fileStorage'
import type { CreateErrorField, CreateErrors, CreateForm, Notice } from '../types/app'
import { createEmptyPlan, randomTheme } from '../utils/planFactory'

const initialCreateForm: CreateForm = {
  planName: '',
}

interface UseCreatePlanModalOptions {
  longstepDirectory: FileSystemDirectoryHandle | null
  projectDirectory: FileSystemDirectoryHandle | null
  setProjectDirectory: (dir: FileSystemDirectoryHandle | null) => void
  directoryPermission: (handle: FileSystemHandle, write?: boolean) => Promise<PermissionState>
  loadPlans: () => Promise<PlanSnapshot[]>
  openPlan: (plan: PlanSnapshot, successMessage?: string) => Promise<void>
  setNotice: (notice: Omit<Notice, 'id'> | null) => void
  setHelpTopicId: (id: string | null) => void
  errorMessage: (error: unknown) => string
}

export function useCreatePlanModal({
  longstepDirectory,
  projectDirectory,
  setProjectDirectory,
  directoryPermission,
  loadPlans,
  openPlan,
  setNotice,
  setHelpTopicId,
  errorMessage,
}: UseCreatePlanModalOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(initialCreateForm)
  const [createErrors, setCreateErrors] = useState<CreateErrors>({})

  function clearCreateError(field: CreateErrorField) {
    setCreateErrors((current) => (field in current ? { ...current, [field]: undefined } : current))
  }

  function openCreateModal() {
    setCreateForm(initialCreateForm)
    setProjectDirectory(null)
    setCreateErrors({})
    setIsDirty(false)
    setIsOpen(true)
  }

  function closeCreateModal(force = false) {
    if (!force && isDirty && !window.confirm('未保存の入力があります。閉じてもよいですか？')) return
    setIsOpen(false)
    setIsDirty(false)
  }

  function updateForm(field: keyof CreateForm, value: string) {
    setCreateForm((current) => ({ ...current, [field]: value }))
    setIsDirty(true)
    clearCreateError(field)
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = createForm.planName.trim()
    const errors: CreateErrors = {}

    if (!name) errors.planName = '計画名を入力してください。'
    if (!longstepDirectory) errors.longstepDirectory = `「参照…」から${LONGSTEP_DIRECTORY_LABEL}フォルダを選んでください。`

    setCreateErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstField = (['planName', 'longstepDirectory'] as const).find((field) => errors[field])
      const elementId = {
        planName: 'create-plan-name',
        longstepDirectory: 'create-longstep-dir',
      }[firstField ?? 'planName']
      document.getElementById(elementId)?.focus()
      return
    }
    if (!longstepDirectory) return

    setIsBusy(true)
    try {
      if (await directoryPermission(longstepDirectory, true) !== 'granted') {
        throw new Error('Longstep保存先への権限が必要です。')
      }
      if (projectDirectory && await directoryPermission(projectDirectory, true) !== 'granted') {
        throw new Error('プロジェクト設置先への権限が必要です。')
      }
      const plan = createEmptyPlan(name, randomTheme())
      await installSharedTool(longstepDirectory)
      await savePlan(plan)
      if (projectDirectory) {
        await installProjectEntry(projectDirectory, plan.id)
        await addPlanProjectDirectory(plan.id, projectDirectory)
      }
      await loadPlans()
      closeCreateModal(true)
      await openPlan(plan, projectDirectory
        ? '計画書とAI連携ファイルを作成しました。'
        : '計画書を作成しました。AI連携ファイルは、ホームで計画を右クリックしていつでも追加できます。')
      setHelpTopicId('how-to-use')
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} 保存先を確認して、もう一度作成してください。` })
    } finally {
      setIsBusy(false)
    }
  }

  return {
    isOpen,
    isDirty,
    isBusy,
    createForm,
    createErrors,
    setCreateErrors,
    clearCreateError,
    openCreateModal,
    closeCreateModal,
    updateForm,
    handleCreateSubmit,
  }
}
