import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { PlanMap } from './components/PlanMap'
import { ThemeCrest } from './components/ThemeCrest'
import {
  deletePlan,
  getLastOpenedPlanId,
  getPlanPreferences,
  getPlanTheme,
  listPlans,
  saveLastOpenedPlan,
  savePlan,
  savePlanPreferences,
  savePlanTheme,
} from './db/planStore'
import type { PlanPreferences } from './db/planStore'
import type { NewPlanNodeInput, NodeInsertion, NodePatch, PlanNode, PlanPatch, PlanSnapshot } from './models/plan'
import { themeOptions } from './models/theme'
import type { ThemeId } from './models/theme'
import { buildPlanCreationPrompt } from './prompts/planPrompt'
import { insertPlanNode } from './components/planMapLogic'
import {
  applyNodePatch,
  applyPlanPatch,
  parsePlanImportText,
} from './schemas/planValidation'

type Screen = 'home' | 'create' | 'map' | 'help'
type Notice = { id: number; kind: 'success' | 'error'; text: string }
type AppModal = 'add' | 'create' | 'import' | 'import-confirm' | 'rename'
type PendingImport =
  | { kind: 'plan'; plan: PlanSnapshot }
  | { kind: 'plan_patch'; patch: PlanPatch; plan: PlanSnapshot }
  | { kind: 'node_patch'; patch: NodePatch; plan: PlanSnapshot }

interface CreateForm {
  planName: string
  statement: string
  deadline: string
  successCriteria: string
  currentContext: string
}

const initialCreateForm: CreateForm = {
  planName: '',
  statement: '',
  deadline: '',
  successCriteria: '',
  currentContext: '',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '予期しないエラーが発生しました。'
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '更新日不明'
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function hasDependencyPath(nodes: PlanNode[], startNodeId: string, targetNodeId: string): boolean {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const visited = new Set<string>()
  const pending = [startNodeId]

  while (pending.length > 0) {
    const nodeId = pending.pop()
    if (!nodeId || visited.has(nodeId)) continue
    if (nodeId === targetNodeId) return true

    visited.add(nodeId)
    const node = nodesById.get(nodeId)
    if (node) pending.push(...node.dependsOn)
  }

  return false
}

function dateAfter(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function createEmptyPlan(): PlanSnapshot {
  const timestamp = new Date().toISOString()
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
  return {
    formatVersion: 1,
    kind: 'plan',
    id: `plan-${id}`,
    name: 'ここに計画名を入力',
    goal: {
      statement: '最終目標をここに記入',
      deadline: dateAfter(100),
      successCriteria: ['ここに達成条件を入力'],
    },
    customFields: [{
      id: 'current-context',
      label: '現在地',
      type: 'text',
      value: 'ここに現状を入力',
      includeInPrompt: true,
    }],
    nodes: [
      { id: `node-${id}-minor`, name: '1日でできる目標をここに記入', status: 'not_started', targetDate: dateAfter(3), description: 'この目標の説明を記入', nextAction: '次の行動を記入', dependsOn: [], goalLevel: 'minor', recurrence: { enabled: false, cadence: '', completedCount: 0 } },
      { id: `node-${id}-middle`, name: '1週間でできる目標をここに記入', status: 'not_started', targetDate: dateAfter(10), description: 'この目標の説明を記入', nextAction: '次の行動を記入', dependsOn: [`node-${id}-minor`], goalLevel: 'middle', recurrence: { enabled: false, cadence: '', completedCount: 0 } },
      { id: `node-${id}-major`, name: '1ヶ月でできる目標をここに記入', status: 'not_started', targetDate: dateAfter(40), description: 'この目標の説明を記入', nextAction: '次の行動を記入', dependsOn: [`node-${id}-middle`], goalLevel: 'major', recurrence: { enabled: false, cadence: '', completedCount: 0 } },
    ],
    meta: { revision: 1, createdAt: timestamp, updatedAt: timestamp },
  }
}

function randomTheme(): ThemeId {
  return themeOptions[Math.floor(Math.random() * themeOptions.length)].id
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [plans, setPlans] = useState<PlanSnapshot[]>([])
  const [planPreferences, setPlanPreferences] = useState<Record<string, PlanPreferences>>({})
  const [activePlan, setActivePlan] = useState<PlanSnapshot | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [createForm, setCreateForm] = useState<CreateForm>(initialCreateForm)
  const [createTheme, setCreateTheme] = useState<ThemeId>('fire')
  const [createWithoutDeadline, setCreateWithoutDeadline] = useState(false)
  const [pendingPlanTheme, setPendingPlanTheme] = useState<ThemeId | null>(null)
  const [isPromptVisible, setIsPromptVisible] = useState(false)
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false)
  const [mapPlanName, setMapPlanName] = useState('')
  const [mapFinalGoalName, setMapFinalGoalName] = useState('')
  const [mapPlanDeadline, setMapPlanDeadline] = useState('')
  const [mapPlanTheme, setMapPlanTheme] = useState<ThemeId>('fire')
  const [mapPlanSaveStatus, setMapPlanSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const noticeIdRef = useRef(0)
  const [activeModal, setActiveModal] = useState<AppModal | null>(null)
  const [previousModal, setPreviousModal] = useState<AppModal | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [modalDirty, setModalDirty] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [planMenuId, setPlanMenuId] = useState<string | null>(null)
  const [renamePlan, setRenamePlan] = useState<PlanSnapshot | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [theme, setTheme] = useState<ThemeId>('fire')
  const isTransitioning = false
  const [achievement, setAchievement] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewSaveTimerRef = useRef<number | null>(null)
  const mapPlanSaveTimerRef = useRef<number | null>(null)
  const mapPlanSaveVersionRef = useRef(0)
  const activePlanRef = useRef<PlanSnapshot | null>(null)
  const mapPlanDraftRef = useRef({ name: '', finalGoalName: '', deadline: '', theme: 'fire' as ThemeId })

  const prompt = useMemo(
    () => buildPlanCreationPrompt(createForm),
    [createForm],
  )

  function setNotice(notice: Omit<Notice, 'id'> | null) {
    if (!notice) {
      setNotices([])
      return
    }
    const id = ++noticeIdRef.current
    const text = notice.kind === 'error' && !notice.text.includes('ください')
      ? `${notice.text} 内容を確認して、もう一度操作してください。`
      : notice.text
    setNotices((current) => [...current, { ...notice, id, text }])
    if (notice.kind === 'success') {
      window.setTimeout(() => setNotices((current) => current.filter((item) => item.id !== id)), 3000)
    }
  }

  async function loadPlans(): Promise<PlanSnapshot[]> {
    try {
      const loadedPlans = await listPlans()
      setPlans(loadedPlans)

      const loadedPreferences = await Promise.all(
        loadedPlans.map(async (plan) => [plan.id, await getPlanPreferences(plan.id)] as const),
      )
      setPlanPreferences(Object.fromEntries(loadedPreferences))
      return loadedPlans
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return []
    }
  }

  useEffect(() => {
    void loadPlans().then(async (loadedPlans) => {
      if (loadedPlans.length === 0) return
      let lastOpenedPlanId: string | null = null
      try {
        lastOpenedPlanId = await getLastOpenedPlanId()
      } catch {
        // 保存済みIDを読めない場合は、更新日の新しい計画を開く。
      }
      await openPlan(loadedPlans.find((plan) => plan.id === lastOpenedPlanId) ?? loadedPlans[0])
    })
  }, [])

  useEffect(() => {
    activePlanRef.current = activePlan
  }, [activePlan])

  useEffect(() => {
    if (!achievement) {
      return
    }

    const timer = window.setTimeout(() => setAchievement(null), 2400)
    return () => window.clearTimeout(timer)
  }, [achievement])

  useEffect(() => {
    if (!isMapMenuOpen) {
      return
    }

    function closeMenu(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMapMenuOpen(false)
      }
    }

    window.addEventListener('keydown', closeMenu)
    return () => window.removeEventListener('keydown', closeMenu)
  }, [isMapMenuOpen])

  useEffect(() => {
    if (!planMenuId) return

    function closePlanMenu(event: PointerEvent) {
      if (!(event.target as Element).closest('.saved-plan-actions')) {
        setPlanMenuId(null)
      }
    }

    window.addEventListener('pointerdown', closePlanMenu)
    return () => window.removeEventListener('pointerdown', closePlanMenu)
  }, [planMenuId])

  useEffect(() => {
    if (!activeModal) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (modalDirty && !window.confirm('未保存の入力があります。閉じてもよいですか？')) return
      setActiveModal(null)
      setPreviousModal(null)
      setPendingImport(null)
      setModalDirty(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [activeModal, modalDirty])

  useEffect(() => {
    if (!isTutorialOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTutorialOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isTutorialOpen])

  function runTransition(action: () => void, _kind = 'fade') {
    action()
  }

  async function openPlan(plan: PlanSnapshot, successMessage?: string) {
    let nextTheme: ThemeId = 'fire'

    try {
      nextTheme = await getPlanTheme(plan.id)
    } catch {
      nextTheme = 'fire'
    }

    try {
      await saveLastOpenedPlan(plan.id)
    } catch {
      // 計画を開く操作は、メタ情報の保存に失敗しても継続する。
    }

    runTransition(() => {
      setActivePlan(plan)
      setSelectedNodeId(null)
      setIsMapMenuOpen(false)
      setTheme(nextTheme)
      setScreen('map')
      setNotice(successMessage ? { kind: 'success', text: successMessage } : null)
      window.scrollTo({ top: 0, behavior: 'auto' })
    }, 'fade')
  }

  async function importPlanText(rawText: string) {
    if (!rawText.trim()) {
      setNotice({ kind: 'error', text: 'JSONテキストを入力するか、JSONファイルを選んでください。' })
      return
    }

    setIsBusy(true)
    try {
      const parsed = parsePlanImportText(rawText)
      if (parsed.kind === 'plan') {
        setPendingImport({ kind: 'plan', plan: parsed.plan })
      } else if (parsed.kind === 'plan_patch') {
        const target = (activePlan?.id === parsed.patch.planId ? activePlan : null)
          ?? plans.find((plan) => plan.id === parsed.patch.planId)
        if (!target) throw new Error('部分更新の対象計画が見つかりません。対象の計画を読み込むか、planIdを確認してください。')
        setPendingImport({ kind: 'plan_patch', patch: parsed.patch, plan: applyPlanPatch(target, parsed.patch) })
      } else {
        if (!activePlan) throw new Error('目標部分更新JSONを反映する計画書を開いてください。')
        setPendingImport({ kind: 'node_patch', patch: parsed.patch, plan: applyNodePatch(activePlan, parsed.patch) })
      }
      setActiveModal('import-confirm')
      setModalDirty(false)
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    } finally {
      setIsBusy(false)
    }
  }

  async function confirmImport() {
    if (!pendingImport) return
    setIsBusy(true)
    try {
      await savePlan(pendingImport.plan)
      const importedTheme = pendingPlanTheme
        ?? (pendingImport.kind === 'plan' && !plans.some((plan) => plan.id === pendingImport.plan.id) ? randomTheme() : null)
      if (importedTheme) {
        await savePlanTheme(pendingImport.plan.id, importedTheme)
        setPendingPlanTheme(null)
      }
      await loadPlans()
      setImportText('')
      setPendingImport(null)
      setActiveModal(null)
      await openPlan(pendingImport.plan, pendingImport.kind === 'plan' ? '計画を読み込みました。' : '部分更新を反映しました。')
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} 入力内容を確認して、もう一度反映してください。` })
    } finally {
      setIsBusy(false)
    }
  }

  async function importFile(file: File) {
    try {
      const text = await file.text()
      setImportText(text)
      setModalDirty(true)
      await importPlanText(text)
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  function openModal(modal: AppModal, from: AppModal | null = null) {
    setPreviousModal(from)
    setActiveModal(modal)
    setModalDirty(false)
  }

  function closeModal(force = false) {
    if (!force && modalDirty && !window.confirm('未保存の入力があります。閉じてもよいですか？')) return
    setActiveModal(null)
    setPreviousModal(null)
    setPendingImport(null)
    setModalDirty(false)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (file) {
      void importFile(file)
    }

    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]

    if (file) {
      void importFile(file)
    }
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!createForm.statement.trim() || (!createWithoutDeadline && !createForm.deadline)) {
      setNotice({
        kind: 'error',
        text: '最終目標と期限を入力してください。期限を決めない場合はチェックを外してください。',
      })
      return
    }

    setIsPromptVisible(true)
    setPendingPlanTheme(createTheme)
    setCopied(false)
    setNotice({ kind: 'success', text: 'AIに渡す計画作成プロンプトを作成しました。' })
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setNotice({ kind: 'success', text: '計画作成プロンプトをコピーしました。' })
    } catch {
      setNotice({ kind: 'error', text: 'コピーできませんでした。テキストを選択してコピーしてください。' })
    }
  }

  async function updateNode(node: PlanNode, options: { silent?: boolean } = {}): Promise<boolean> {
    if (!activePlan) {
      return false
    }

    const previousNode = activePlan.nodes.find((currentNode) => currentNode.id === node.id)
    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes: activePlan.nodes.map((currentNode) => (
        currentNode.id === node.id ? node : currentNode
      )),
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      await loadPlans()
      if (!options.silent) {
        setNotice({ kind: 'success', text: '中間目標を記録しました。' })
      }

      if (previousNode?.status !== 'completed' && node.status === 'completed') {
        setAchievement(node.name)
      }
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return false
    }
  }

  async function reorderNodes(nodes: PlanNode[]): Promise<boolean> {
    if (!activePlan) return false

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes,
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      await loadPlans()
      setNotice({ kind: 'success', text: '目標の並び順を保存しました。' })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return false
    }
  }

  function createNodeId(nodes: PlanNode[]): string {
    const baseId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `node-${crypto.randomUUID()}`
      : `node-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const existingIds = new Set(nodes.map((node) => node.id))
    return existingIds.has(baseId) ? `${baseId}-new` : baseId
  }

  async function createNode(input: NewPlanNodeInput, insertion?: NodeInsertion): Promise<boolean> {
    if (!activePlan) return false
    if (!input.name.trim()) {
      setNotice({ kind: 'error', text: '新しい中間目標の名前を入力してください。' })
      return false
    }

    const nodesById = new Map(activePlan.nodes.map((node) => [node.id, node]))
    const newNode: PlanNode = {
      id: createNodeId(activePlan.nodes),
      name: input.name.trim(),
      status: 'not_started',
      targetDate: input.targetDate || activePlan.goal.deadline,
      description: input.description.trim(),
      nextAction: input.nextAction.trim(),
      dependsOn: [],
      goalLevel: insertion ? 'minor' : 'major',
      recurrence: {
        enabled: false,
        cadence: '',
        completedCount: 0,
      },
    }

    if (insertion && 'prerequisiteForId' in insertion) {
      if (!nodesById.has(insertion.prerequisiteForId)) {
        setNotice({ kind: 'error', text: '追加対象の目標が見つかりませんでした。' })
        return false
      }
    } else if (insertion) {
      const fromNode = nodesById.get(insertion.fromId)
      if (!fromNode) {
        setNotice({ kind: 'error', text: '道筋の始点が見つかりませんでした。' })
        return false
      }

      if (!insertion.toFinal) {
        const toNode = nodesById.get(insertion.toId)
        if (!toNode || !toNode.dependsOn.includes(insertion.fromId)) {
          setNotice({ kind: 'error', text: '道筋の接続先が見つかりませんでした。' })
          return false
        }
      }
    }

    const nextNodes = insertPlanNode(activePlan.nodes, newNode, insertion)

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes: nextNodes,
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      setSelectedNodeId(newNode.id)
      await loadPlans()
      setNotice({ kind: 'success', text: `「${newNode.name}」を作成しました。` })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return false
    }
  }

  async function deleteNode(nodeId: string): Promise<boolean> {
    if (!activePlan) return false
    if (activePlan.nodes.length <= 1) {
      setNotice({ kind: 'error', text: '中間目標は1件以上必要です。' })
      return false
    }

    const targetNode = activePlan.nodes.find((node) => node.id === nodeId)
    if (!targetNode) {
      setNotice({ kind: 'error', text: '削除する中間目標が見つかりませんでした。' })
      return false
    }

    const nodeIds = new Set(activePlan.nodes.map((node) => node.id))
    const predecessorIds = targetNode.dependsOn.filter((dependencyId) => nodeIds.has(dependencyId))
    const updatedNodes = activePlan.nodes
      .filter((node) => node.id !== nodeId)
      .map((node) => {
        if (!node.dependsOn.includes(nodeId)) return node

        const dependsOn = node.dependsOn.filter((dependencyId) => dependencyId !== nodeId)
        predecessorIds.forEach((predecessorId) => {
          if (!dependsOn.includes(predecessorId)) dependsOn.push(predecessorId)
        })
        return { ...node, dependsOn }
      })

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes: updatedNodes,
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      setSelectedNodeId(null)
      await loadPlans()
      setNotice({ kind: 'success', text: `「${targetNode.name}」を削除し、前後の道筋をつなぎ直しました。` })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return false
    }
  }

  async function addEdge(fromNodeId: string, toNodeId: string): Promise<boolean> {
    if (!activePlan) return false

    const fromNode = activePlan.nodes.find((node) => node.id === fromNodeId)
    const toNode = activePlan.nodes.find((node) => node.id === toNodeId)

    if (!fromNode || !toNode) {
      setNotice({ kind: 'error', text: '接続する中間目標が見つかりませんでした。' })
      return false
    }
    if (fromNodeId === toNodeId) {
      setNotice({ kind: 'error', text: '同じ中間目標同士は接続できません。' })
      return false
    }
    if (toNode.dependsOn.includes(fromNodeId)) {
      setNotice({ kind: 'error', text: 'その道筋はすでに登録されています。' })
      return false
    }
    // ponytail: 既存の依存関係探索を逆向きに再利用し、迂回路専用のグラフ処理を増やさない。
    if (hasDependencyPath(activePlan.nodes, toNodeId, fromNodeId)) {
      setNotice({ kind: 'error', text: '迂回路の追加はできません。既存の道筋でつながっています。' })
      return false
    }
    if (hasDependencyPath(activePlan.nodes, fromNodeId, toNodeId)) {
      setNotice({ kind: 'error', text: '目標が循環する接続は追加できません。' })
      return false
    }

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes: activePlan.nodes.map((node) => (
        node.id === toNodeId
          ? { ...node, dependsOn: [...node.dependsOn, fromNodeId] }
          : node
      )),
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      await loadPlans()
      setNotice({ kind: 'success', text: `「${fromNode.name}」から「${toNode.name}」へ道筋を追加しました。` })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return false
    }
  }

  async function deleteEdge(fromNodeId: string, toNodeId: string): Promise<boolean> {
    if (!activePlan) return false

    const fromNode = activePlan.nodes.find((node) => node.id === fromNodeId)
    const toNode = activePlan.nodes.find((node) => node.id === toNodeId)

    if (!fromNode || !toNode || !toNode.dependsOn.includes(fromNodeId)) {
      setNotice({ kind: 'error', text: '削除する道筋が見つかりませんでした。' })
      return false
    }

    const updatedPlan: PlanSnapshot = {
      ...activePlan,
      nodes: activePlan.nodes.map((node) => (
        node.id === toNodeId
          ? { ...node, dependsOn: node.dependsOn.filter((dependencyId) => dependencyId !== fromNodeId) }
          : node
      )),
      meta: {
        ...activePlan.meta,
        revision: activePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    try {
      await savePlan(updatedPlan)
      setActivePlan(updatedPlan)
      await loadPlans()
      setNotice({ kind: 'success', text: `「${fromNode.name}」から「${toNode.name}」への道筋を削除しました。` })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      return false
    }
  }

  function randomizeCreateTheme() {
    const candidates = themeOptions.filter((option) => option.id !== createTheme)
    const nextTheme = candidates[Math.floor(Math.random() * candidates.length)]

    if (nextTheme) {
      setCreateTheme(nextTheme.id)
    }
  }

  async function handleDeletePlan(plan: PlanSnapshot) {
    const confirmed = window.confirm(`「${plan.name}」を削除しますか？\nこの操作は取り消せません。`)

    if (!confirmed) {
      return
    }

    try {
      await deletePlan(plan.id)
      await loadPlans()
      setNotice({ kind: 'success', text: '計画書を削除しました。' })
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  function exportPlan() {
    if (!activePlan) {
      return
    }

    const blob = new Blob([JSON.stringify(activePlan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activePlan.name || 'longstep-plan'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function updateForm(field: keyof CreateForm, value: string) {
    setCreateForm((current) => ({ ...current, [field]: value }))
    setModalDirty(true)
  }

  function goHome() {
    runTransition(() => {
      setScreen('home')
      setSelectedNodeId(null)
      setIsMapMenuOpen(false)
      setNotice(null)
      void loadPlans()
      window.scrollTo({ top: 0, behavior: 'auto' })
    })
  }

  function openMapMenu() {
    if (!activePlan) return
    setMapPlanName(activePlan.name)
    setMapFinalGoalName(activePlan.goal.statement)
    setMapPlanDeadline(activePlan.goal.deadline)
    setMapPlanTheme(theme)
    mapPlanDraftRef.current = { name: activePlan.name, finalGoalName: activePlan.goal.statement, deadline: activePlan.goal.deadline, theme }
    setMapPlanSaveStatus('saved')
    setIsMapMenuOpen(true)
  }

  function closeMapMenu(): boolean {
    setIsMapMenuOpen(false)
    return true
  }

  function toggleMapMenu() {
    if (isMapMenuOpen) closeMapMenu()
    else openMapMenu()
  }

  function updateMapPlanDraft(changes: Partial<{ name: string; finalGoalName: string; deadline: string; theme: ThemeId }>) {
    if (!activePlan) return
    const draft = { ...mapPlanDraftRef.current, ...changes }
    mapPlanDraftRef.current = draft
    setMapPlanName(draft.name)
    setMapFinalGoalName(draft.finalGoalName)
    setMapPlanDeadline(draft.deadline)
    setMapPlanTheme(draft.theme)

    if (mapPlanSaveTimerRef.current !== null) window.clearTimeout(mapPlanSaveTimerRef.current)
    const version = ++mapPlanSaveVersionRef.current
    const name = draft.name.trim()
    const finalGoalName = draft.finalGoalName.trim()
    if (!name || !finalGoalName) {
      setMapPlanSaveStatus('error')
      return
    }

    setMapPlanSaveStatus('saving')
    const sourcePlan = activePlan
    const updatedPlan: PlanSnapshot = {
      ...sourcePlan,
      name,
      goal: { ...sourcePlan.goal, statement: finalGoalName, deadline: draft.deadline },
      meta: {
        ...sourcePlan.meta,
        revision: sourcePlan.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    }

    mapPlanSaveTimerRef.current = window.setTimeout(() => {
      mapPlanSaveTimerRef.current = null
      void Promise.all([savePlan(updatedPlan), savePlanTheme(updatedPlan.id, draft.theme)]).then(() => {
        setPlans((current) => current.map((plan) => plan.id === updatedPlan.id ? updatedPlan : plan))
        if (activePlanRef.current?.id === updatedPlan.id) {
          activePlanRef.current = updatedPlan
          setActivePlan(updatedPlan)
          setTheme(draft.theme)
        }
        if (mapPlanSaveVersionRef.current === version) setMapPlanSaveStatus('saved')
      }).catch((error) => {
        if (mapPlanSaveVersionRef.current === version) setMapPlanSaveStatus('error')
        setNotice({ kind: 'error', text: `${errorMessage(error)} 変更内容を確認して、もう一度入力してください。` })
      })
    }, 300)
  }

  function goCreate(from: AppModal | null = null) {
    setCreateForm(initialCreateForm)
    setCreateWithoutDeadline(false)
    setIsPromptVisible(false)
    setCopied(false)
    setCreateTheme(randomTheme())
    openModal('create', from)
  }

  async function createBlankPlan() {
    const plan = createEmptyPlan()
    const planTheme = randomTheme()
    setIsBusy(true)
    try {
      await savePlan(plan)
      await savePlanTheme(plan.id, planTheme)
      await loadPlans()
      closeModal(true)
      await openPlan(plan)
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} もう一度作成してください。` })
    } finally {
      setIsBusy(false)
    }
  }

  async function toggleFavorite(plan: PlanSnapshot) {
    const favorite = !(planPreferences[plan.id]?.favorite ?? false)
    try {
      await savePlanPreferences(plan.id, { favorite })
      setPlanPreferences((current) => ({
        ...current,
        [plan.id]: { ...(current[plan.id] ?? { favorite: false }), favorite },
      }))
      setPlanMenuId(null)
      setNotice({ kind: 'success', text: favorite ? 'お気に入りに登録しました。' : 'お気に入りを解除しました。' })
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} もう一度操作してください。` })
    }
  }

  function startRename(plan: PlanSnapshot) {
    setRenamePlan(plan)
    setRenameValue(plan.name)
    setPlanMenuId(null)
    openModal('rename')
  }

  async function confirmRename() {
    const name = renameValue.trim()
    if (!renamePlan || !name) {
      setNotice({ kind: 'error', text: '新しい計画名を入力してください。' })
      return
    }
    const updated = { ...renamePlan, name, meta: { ...renamePlan.meta, revision: renamePlan.meta.revision + 1, updatedAt: new Date().toISOString() } }
    setIsBusy(true)
    try {
      await savePlan(updated)
      if (activePlan?.id === updated.id) setActivePlan(updated)
      await loadPlans()
      closeModal(true)
      setNotice({ kind: 'success', text: '計画名を変更しました。' })
    } catch (error) {
      setNotice({ kind: 'error', text: `${errorMessage(error)} もう一度変更してください。` })
    } finally {
      setIsBusy(false)
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

  async function continueFromHome() {
    let availablePlans = plans

    if (availablePlans.length === 0) {
      try {
        availablePlans = await listPlans()
      } catch {
        availablePlans = []
      }
    }

    let lastOpenedPlanId: string | null = null

    try {
      lastOpenedPlanId = await getLastOpenedPlanId()
    } catch {
      lastOpenedPlanId = null
    }

    const lastOpenedPlan = availablePlans.find((plan) => plan.id === lastOpenedPlanId)
    const planToOpen = lastOpenedPlan ?? availablePlans[0]

    if (planToOpen) {
      void openPlan(planToOpen)
      return
    }

    runTransition(() => {
      const savedPlans = document.getElementById('saved-adventures')
      if (savedPlans) {
        window.scrollTo({
          top: savedPlans.getBoundingClientRect().top + window.scrollY,
          behavior: 'auto',
        })
      }
    }, 'fade')
  }

  function openAdjacentPlan(offset: -1 | 1) {
    if (!activePlan || isTransitioning) {
      return
    }

    const currentIndex = plans.findIndex((plan) => plan.id === activePlan.id)
    const nextPlan = plans[currentIndex + offset]
    if (nextPlan) {
      void openPlan(nextPlan)
    }
  }

  const shellTheme = screen === 'map' ? theme : screen === 'create' ? createTheme : 'fire'
  const completedNodes = activePlan?.nodes.filter((node) => node.status === 'completed').length ?? 0
  const activePlanIndex = activePlan ? plans.findIndex((plan) => plan.id === activePlan.id) : -1
  const hasPreviousPlan = activePlanIndex > 0
  const hasNextPlan = activePlanIndex >= 0 && activePlanIndex < plans.length - 1
  const sortedPlans = [...plans].sort((left, right) => {
    const favoriteDifference = Number(planPreferences[right.id]?.favorite ?? false) - Number(planPreferences[left.id]?.favorite ?? false)
    return favoriteDifference || right.meta.updatedAt.localeCompare(left.meta.updatedAt)
  })

  return (
    <div className={`app-shell screen-${screen} theme-${shellTheme}`}>
      <header className="site-header common-header">
        <button className="header-link" onClick={goHome} type="button">ホーム</button>
        <div className="header-menu">
          <button className="header-link" type="button">▶ 計画書</button>
          <div className="header-submenu">
            {sortedPlans.length === 0
              ? <span>計画書はありません</span>
              : sortedPlans.map((plan) => <button key={plan.id} onClick={() => void openPlan(plan)} type="button">{plan.name}</button>)}
          </div>
        </div>
        <div className="header-menu">
          <button className="header-link" onClick={() => setScreen('help')} type="button">▶ ヘルプ</button>
          <div className="header-submenu">
            <button onClick={() => setScreen('help')} type="button">ヘルプ</button>
          </div>
        </div>
        {activePlan && screen === 'map' && (
          <div className="header-current-plan">
            <strong>{activePlan.name}</strong>
            <button aria-label="計画メニュー" onClick={toggleMapMenu} type="button">…</button>
          </div>
        )}
      </header>

      {notices.length > 0 && (
        <div className="notice-stack">
          {notices.map((notice) => (
            <div className={`notice notice-${notice.kind}`} key={notice.id} role={notice.kind === 'error' ? 'alert' : 'status'}>
              <span className="notice-glyph" aria-hidden="true">{notice.kind === 'success' ? '✦' : '!'}</span>
              <span>{notice.text}</span>
              <button aria-label="通知を閉じる" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} type="button">×</button>
            </div>
          ))}
        </div>
      )}

      {screen === 'home' && (
        <main className="page home-page">
          <section className="title-screen" aria-labelledby="longstep-title">
            <div className="title-screen-inner">
              <div className="title-crest-row" aria-hidden="true">
                <ThemeCrest className="title-crest title-crest-side" theme="water" />
                <ThemeCrest className="title-crest title-crest-main" theme="fire" />
                <ThemeCrest className="title-crest title-crest-side" theme="wind" />
              </div>
              <p className="pixel-kicker">LONG-TERM GOAL SUPPORTER</p>
              <h1 id="longstep-title">LONGSTEP</h1>
              <p className="title-jp">遠い目標を、今日の一歩に。</p>
              <div className="title-divider"><span>◆</span></div>
              <nav className="main-command" aria-label="メインメニュー">
                <button className="command-button" onClick={() => goCreate()} type="button">
                  <span className="command-cursor" aria-hidden="true">▶</span>
                  <span><strong>はじめから</strong><small>新しい長期目標を立てる</small></span>
                </button>
                <button className="command-button" onClick={() => void continueFromHome()} type="button">
                  <span className="command-cursor" aria-hidden="true">▶</span>
                  <span><strong>つづきから</strong><small>{plans.length > 0 ? `${plans.length}件の冒険の書` : 'まだ冒険の書はありません'}</small></span>
                </button>
              </nav>
              <p className="press-start">SELECT A COMMAND</p>
            </div>
          </section>

          <section className="book-section saved-section-top" id="saved-adventures">
            <div className="ornament-heading">
              <h2>計画を再開する</h2>
              <span className="record-count">{plans.length}件</span>
            </div>
            {plans.length === 0 ? (
              <div className="empty-plans">
                <span className="empty-icon" aria-hidden="true">◇</span>
                <strong>まだ計画書がないようです</strong>
                <p>右下の追加ボタンから、計画書を作成するかJSONを読み込んでください。</p>
              </div>
            ) : (
              <div className="saved-list">
                {sortedPlans.map((plan, index) => {
                  return (
                    <article
                      className="saved-plan"
                      key={plan.id}
                      onContextMenu={(event) => { event.preventDefault(); setPlanMenuId(plan.id) }}
                      onDoubleClick={() => void openPlan(plan)}
                    >
                      <span className="save-slot">{index + 1}</span>
                      <button className="saved-plan-main" type="button">
                        <strong>{planPreferences[plan.id]?.favorite ? '★ ' : ''}{plan.name}</strong>
                        <span>{plan.nodes.length}個の中間目標 · {formatUpdatedAt(plan.meta.updatedAt)}更新</span>
                      </button>
                      <div className="saved-plan-actions">
                        <button aria-label={`${plan.name}のメニュー`} className="plan-menu-button" onClick={() => setPlanMenuId((current) => current === plan.id ? null : plan.id)} type="button">…</button>
                        {planMenuId === plan.id && (
                          <div className="plan-context-menu">
                            <button onClick={() => void toggleFavorite(plan)} type="button">{planPreferences[plan.id]?.favorite ? 'お気に入り解除' : 'お気に入り登録'}</button>
                            <button onClick={() => startRename(plan)} type="button">名前変更</button>
                            <button onClick={() => void handleDeletePlan(plan)} type="button">削除</button>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="entry-grid" aria-label="新しい計画を始める方法">
            <article className="entry-card new-plan-card">
              <span className="corner-rune" aria-hidden="true">✦</span>
              <p className="pixel-kicker">NEW CHRONICLE</p>
              <h2>新しい長期目標を立てる</h2>
              <p>目標の輪郭を書き、使い慣れたAIと一緒に道のりをつくります。</p>
              <div className="card-actions">
                <button className="rpg-button rpg-button-quiet" onClick={() => setIsTutorialOpen(true)} type="button">遊び方</button>
                <button className="rpg-button rpg-button-primary" onClick={() => goCreate()} type="button">はじめから <span>▶</span></button>
              </div>
            </article>

            <article className="entry-card resume-card">
              <span className="corner-rune" aria-hidden="true">Ⅱ</span>
              <p className="pixel-kicker">RESTORE A CHRONICLE</p>
              <h2>復活の呪文を読み込む</h2>
              <p>AIから受け取ったJSONファイル、またはJSONテキストから冒険を再開します。</p>
              <div
                className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <span className="drop-icon" aria-hidden="true">⇩</span>
                <strong>JSONファイルをここにドロップ</strong>
                <span>または</span>
                <button className="text-button" onClick={() => fileInputRef.current?.click()} type="button">ファイルを選ぶ</button>
                <input
                  accept=".json,application/json,text/plain"
                  className="visually-hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  type="file"
                />
              </div>
              <label className="field-label" htmlFor="plan-json-text">JSONテキストを貼り付け</label>
              <textarea
                className="compact-textarea"
                id="plan-json-text"
                onChange={(event) => setImportText(event.target.value)}
                placeholder={'```json\n{ ... }\n```'}
                rows={5}
                value={importText}
              />
              <button className="rpg-button rpg-button-primary full-width" onClick={() => void importPlanText(importText)} type="button">読み込んで再開 <span>▶</span></button>
            </article>
          </section>
        </main>
      )}

      {screen === 'help' && (
        <main className="page help-page">
          <section className="book-section">
            <h1>ヘルプ</h1>
            <p>ヘルプは準備中です</p>
          </section>
        </main>
      )}

      {screen === 'create' && (
        <main className="page create-page">
          <section className="page-heading spellbook-heading">
            <p className="pixel-kicker">CHAPTER I · THE FIRST OATH</p>
            <h1>目標の輪郭を<br />魔導書に記す。</h1>
            <p>ここで集めた情報を、使い慣れたチャットAIに渡す「計画作成の巻物」へ変換します。</p>
          </section>

          <form className="form-card grimoire-card" onSubmit={handleCreateSubmit}>
            <div className="grimoire-spine" aria-hidden="true" />
            <div className="form-card-heading">
              <ThemeCrest className="form-crest" theme={createTheme} />
              <div><span>QUEST REGISTRATION</span><strong>新しい冒険の書</strong></div>
              <span className="page-number">PAGE 01</span>
            </div>
            <div className="form-grid">
              <label className="field full-field">
                <span>冒険の書の名前 <small>計画名</small></span>
                <input onChange={(event) => updateForm('planName', event.target.value)} placeholder="例：TOEIC 600点への道" value={createForm.planName} />
              </label>
              <label className="field full-field">
                <span>最後にたどり着く場所 <small>最終目標</small></span>
                <textarea onChange={(event) => updateForm('statement', event.target.value)} placeholder="例：2027年4月までにTOEIC600点取る" rows={3} value={createForm.statement} />
              </label>
              <label className="field">
                <span>旅の期限</span>
                <input onChange={(event) => updateForm('deadline', event.target.value)} type="date" value={createForm.deadline} />
              </label>
              <label className="field">
                <span>達成の証 <small>1行に1項目</small></span>
                <textarea onChange={(event) => updateForm('successCriteria', event.target.value)} placeholder="公式スコアで600点以上を取得する" rows={3} value={createForm.successCriteria} />
              </label>
              <label className="field full-field">
                <span>現在地・持ち物・制約 <small>任意</small></span>
                <textarea onChange={(event) => updateForm('currentContext', event.target.value)} placeholder="今の状態、使える時間、気になっていることなど" rows={4} value={createForm.currentContext} />
              </label>
            </div>
            <div className="create-theme-picker">
              <button aria-label="デザインを変更" className="theme-random-button" onClick={randomizeCreateTheme} type="button">
                <ThemeCrest className="theme-random-crest" theme={createTheme} />
                <span className="theme-random-copy"><strong>デザインを変更</strong></span>
                <span aria-hidden="true" className="theme-random-glyph">✦</span>
              </button>
            </div>
            <div className="form-actions">
              <span className="form-hint">必須の印をすべて埋めると巻物を作れます</span>
              <button className="rpg-button rpg-button-primary" type="submit">計画作成の巻物をつくる <span>▶</span></button>
            </div>
          </form>

          {isPromptVisible && (
            <section className="prompt-card scroll-card">
              <div className="ornament-heading compact-heading">
                <span className="heading-rune" aria-hidden="true">Ⅱ</span>
                <div>
                  <p className="pixel-kicker">THE SCROLL IS READY</p>
                  <h2>この巻物をチャットAIに渡してください</h2>
                </div>
                <span className="record-count">STEP 02</span>
              </div>
              <p>AIから返ってきた全体JSONを、冒険の書にある「復活の呪文」へ貼り付けます。</p>
              <textarea className="prompt-output" readOnly value={prompt} />
              <div className="prompt-actions">
                <button className="rpg-button rpg-button-quiet" onClick={() => void copyPrompt()} type="button">{copied ? '✓ コピーしました' : '巻物をコピー'}</button>
                <button className="rpg-button rpg-button-primary" onClick={goHome} type="button">冒険の書へ戻る <span>▶</span></button>
              </div>
            </section>
          )}
        </main>
      )}

      {screen === 'map' && activePlan && (
        <main className={`page map-page ${selectedNodeId ? 'has-node-detail' : ''}`}>
          <button
            aria-label="前の計画へ"
            className="plan-edge-navigation plan-edge-previous"
            disabled={!hasPreviousPlan || isTransitioning}
            onClick={() => openAdjacentPlan(-1)}
            type="button"
          >‹</button>
          <button
            aria-label="次の計画へ"
            className="plan-edge-navigation plan-edge-next"
            disabled={!hasNextPlan || isTransitioning}
            onClick={() => openAdjacentPlan(1)}
            type="button"
          >›</button>

          <button
            aria-label="マップメニューを閉じる"
            className={`map-menu-scrim ${isMapMenuOpen ? 'is-open' : ''}`}
            onClick={() => closeMapMenu()}
            tabIndex={isMapMenuOpen ? 0 : -1}
            type="button"
          />
          <aside
            aria-labelledby="map-command-menu-heading"
            aria-hidden={!isMapMenuOpen}
            aria-modal="true"
            className={`map-command-menu common-modal ${isMapMenuOpen ? 'is-open' : ''}`}
            id="map-command-menu"
            inert={!isMapMenuOpen}
            role="dialog"
          >
            <button aria-label="計画メニューを閉じる" className="modal-close" onClick={() => closeMapMenu()} type="button"><span aria-hidden="true" className="button-glyph">×</span></button>
            <div className="map-menu-heading">
              <div>
                <h2 id="map-command-menu-heading">計画メニュー</h2>
                <strong>{activePlan.name}</strong>
              </div>
            </div>
            <div className="map-menu-progress">
              <span><small>達成済み</small><strong>{completedNodes}/{activePlan.nodes.length}</strong></span>
              <span><small>期限</small><strong>{activePlan.goal.deadline || '未設定'}</strong></span>
            </div>
            <div className="map-plan-settings">
              <label>
                <span>計画書名</span>
                <input onChange={(event) => updateMapPlanDraft({ name: event.target.value })} value={mapPlanName} />
              </label>
              <label>
                <span>最終目標名</span>
                <input onChange={(event) => updateMapPlanDraft({ finalGoalName: event.target.value })} value={mapFinalGoalName} />
              </label>
              <label>
                <span>最終期限</span>
                <input onInput={(event) => updateMapPlanDraft({ deadline: event.currentTarget.value })} type="date" value={mapPlanDeadline} />
              </label>
              <label>
                <span>計画書の色</span>
                <select onChange={(event) => updateMapPlanDraft({ theme: event.target.value as ThemeId })} value={mapPlanTheme}>
                  {themeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <p className={`map-plan-save-status is-${mapPlanSaveStatus}`} role="status">
                {mapPlanSaveStatus === 'saving'
                  ? '保存中…'
                  : mapPlanSaveStatus === 'error'
                    ? !mapPlanName.trim()
                      ? '計画書名を入力してください'
                      : !mapFinalGoalName.trim()
                        ? '最終目標名を入力してください'
                        : '保存できませんでした'
                    : '保存済み'}
              </p>
            </div>
            <label className="plan-switcher">
              <span>計画書を切替</span>
              <select
                onChange={(event) => {
                  const nextPlan = plans.find((plan) => plan.id === event.target.value)
                  if (nextPlan && closeMapMenu()) void openPlan(nextPlan)
                  else event.target.value = activePlan.id
                }}
                value={activePlan.id}
              >
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
            </label>
            <div className="map-menu-actions">
              <button className="rpg-button rpg-button-quiet full-width" onClick={exportPlan} type="button">現在の計画書全体のJSONを書き出す</button>
              <button className="rpg-button rpg-button-quiet full-width" onClick={() => { if (closeMapMenu()) goHome() }} type="button">ホームへ戻る</button>
            </div>
          </aside>

          <PlanMap
            initialViewPosition={planPreferences[activePlan.id]?.viewPosition}
            onAddEdge={addEdge}
            onClearSelection={() => setSelectedNodeId(null)}
            onCreateNode={createNode}
            onDeleteEdge={deleteEdge}
            onDeleteNode={deleteNode}
            onNotify={(kind, text) => setNotice({ kind, text })}
            onOpenPlanMenu={openMapMenu}
            onOpenJsonImport={() => { setSelectedNodeId(null); openModal('import') }}
            onReorderNodes={reorderNodes}
            onSelectNode={setSelectedNodeId}
            onUpdateNode={(node) => updateNode(node, { silent: true })}
            onViewPositionChange={saveViewPosition}
            plan={activePlan}
            selectedNodeId={selectedNodeId}
          />
        </main>
      )}

      <button aria-label="追加" className="global-add-button" onClick={() => openModal('add')} type="button"><span aria-hidden="true" className="button-glyph">＋</span></button>

      {activeModal && (
        <div className="modal-backdrop app-modal-backdrop" onMouseDown={() => closeModal()}>
          <section aria-labelledby="app-modal-heading" aria-modal="true" className="app-modal common-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="モーダルを閉じる" className="modal-close" onClick={() => closeModal()} type="button"><span aria-hidden="true" className="button-glyph">×</span></button>

            {activeModal === 'add' && (
              <>
                <h2 id="app-modal-heading">追加するものを選ぶ</h2>
                <div className="app-modal-actions">
                  <button onClick={() => goCreate('add')} type="button">チャットAIを使い新規計画書を作成する</button>
                  <button disabled={isBusy} onClick={() => void createBlankPlan()} type="button">空の新規計画書を作成する</button>
                  {screen === 'map' && activePlan && (
                    <button
                      onClick={() => void createNode({
                        name: '新しい目標',
                        targetDate: activePlan.goal.deadline,
                        description: 'この目標の説明を入力',
                        nextAction: '次の行動を入力',
                      }).then((created) => { if (created) closeModal(true) })}
                      type="button"
                    >新規目標を追加する</button>
                  )}
                  <button onClick={() => openModal('import', 'add')} type="button">JSONを読み込む</button>
                  <button onClick={() => closeModal(true)} type="button">閉じる</button>
                </div>
              </>
            )}

            {activeModal === 'create' && (
              <form className="app-modal-form" onSubmit={handleCreateSubmit}>
                <h2 id="app-modal-heading">新規計画書</h2>
                <label>
                  <span>最終目標（必須）</span>
                  <textarea onChange={(event) => updateForm('statement', event.target.value)} rows={3} value={createForm.statement} />
                </label>
                <label className="modal-date-toggle">
                  <input
                    checked={!createWithoutDeadline}
                    onChange={(event) => {
                      setCreateWithoutDeadline(!event.target.checked)
                      if (!event.target.checked) setCreateForm((current) => ({ ...current, deadline: '' }))
                      setModalDirty(true)
                    }}
                    type="checkbox"
                  />
                  期限を設定する
                </label>
                <input
                  disabled={createWithoutDeadline}
                  onChange={(event) => updateForm('deadline', event.target.value)}
                  type="date"
                  value={createWithoutDeadline ? '' : createForm.deadline}
                />
                <label>
                  <span>成し遂げたいこと（できるだけ詳細に）</span>
                  <textarea onChange={(event) => updateForm('successCriteria', event.target.value)} rows={4} value={createForm.successCriteria} />
                </label>
                <label>
                  <span>取り組むにあたって今の現状</span>
                  <textarea onChange={(event) => updateForm('currentContext', event.target.value)} rows={4} value={createForm.currentContext} />
                </label>
                <button disabled={isBusy} type="submit">プロンプトを作成する</button>
                {isPromptVisible && (
                  <>
                    <textarea className="modal-prompt-output" readOnly rows={10} value={prompt} />
                    <button onClick={() => void copyPrompt()} type="button">{copied ? 'コピーしました' : 'プロンプトをコピー'}</button>
                  </>
                )}
                <button
                  aria-disabled={!isPromptVisible}
                  className={!isPromptVisible ? 'is-disabled' : ''}
                  onClick={() => {
                    if (!isPromptVisible) {
                      setNotice({ kind: 'error', text: '先にプロンプトを作成しJSONを入手してください。' })
                      return
                    }
                    openModal('import', 'create')
                  }}
                  type="button"
                >JSONを反映させる</button>
                {previousModal && <button onClick={() => { setActiveModal(previousModal); setPreviousModal(null) }} type="button">前の画面に戻る</button>}
              </form>
            )}

            {activeModal === 'import' && (
              <div className="app-modal-form">
                <h2 id="app-modal-heading">JSONを読み込む</h2>
                <p>全体JSONまたは部分更新JSONを入力し、内容を確認してから反映します。</p>
                <button onClick={() => fileInputRef.current?.click()} type="button">JSONファイルを選ぶ</button>
                <input accept=".json,application/json,text/plain" className="visually-hidden" onChange={handleFileChange} ref={fileInputRef} type="file" />
                <label>
                  <span>JSONテキスト</span>
                  <textarea
                    onChange={(event) => { setImportText(event.target.value); setModalDirty(true) }}
                    placeholder={'```json\n{ ... }\n```'}
                    rows={12}
                    value={importText}
                  />
                </label>
                <button disabled={isBusy} onClick={() => void importPlanText(importText)} type="button">
                  {isBusy ? '解析中…' : '内容を確認する'}
                </button>
                {previousModal && <button onClick={() => { setActiveModal(previousModal); setPreviousModal(null) }} type="button">前の画面に戻る</button>}
              </div>
            )}

            {activeModal === 'import-confirm' && pendingImport && (
              <div className="app-modal-form">
                <h2 id="app-modal-heading">以下の変更を受け入れますか？</h2>
                <div className="import-preview">
                  {pendingImport.kind === 'plan' ? (
                    <>
                      <strong>対象計画：{pendingImport.plan.name}</strong>
                      <p>最終目標：{pendingImport.plan.goal.statement}</p>
                      <p>期限：{pendingImport.plan.goal.deadline || '未設定'}</p>
                      {pendingImport.plan.nodes.map((node) => (
                        <article key={node.id}>
                          <strong>{node.name}</strong>
                          <span>状態：{node.status}／期日：{node.targetDate || '未設定'}／粒度：{node.goalLevel}</span>
                          <span>説明：{node.description || 'なし'}</span>
                          <span>次の行動：{node.nextAction || 'なし'}</span>
                          <span>前提：{node.dependsOn.join('、') || 'なし'}</span>
                        </article>
                      ))}
                    </>
                  ) : pendingImport.kind === 'plan_patch' ? (
                    <>
                      <strong>対象計画：{pendingImport.plan.name}</strong>
                      {pendingImport.patch.operations.map((operation, index) => operation.op === 'add_node' ? (
                        <article key={`add-${index}`}><strong>追加：{operation.node.name}</strong><span>{JSON.stringify(operation.node)}</span></article>
                      ) : (
                        <article key={`update-${operation.id}-${index}`}><strong>更新：{operation.id}</strong><span>更新項目：{Object.keys(operation.changes).join('、')}</span><span>{JSON.stringify(operation.changes)}</span></article>
                      ))}
                    </>
                  ) : (
                    <>
                      <strong>対象計画：{pendingImport.plan.name}</strong>
                      <article>
                        <strong>更新：{pendingImport.plan.nodes.find((node) => node.id === pendingImport.patch.nodeId)?.name ?? pendingImport.patch.nodeId}</strong>
                        <span>更新項目：{Object.keys(pendingImport.patch.changes).join('、')}</span>
                        <span>{JSON.stringify(pendingImport.patch.changes)}</span>
                      </article>
                    </>
                  )}
                </div>
                <div className="app-modal-confirm-actions">
                  <button disabled={isBusy} onClick={() => void confirmImport()} type="button">{isBusy ? '反映中…' : 'はい（変更反映）'}</button>
                  <button onClick={() => { setActiveModal('import'); setPendingImport(null) }} type="button">いいえ（JSON読み込みへ戻る）</button>
                </div>
              </div>
            )}

            {activeModal === 'rename' && renamePlan && (
              <div className="app-modal-form">
                <h2 id="app-modal-heading">計画名を変更</h2>
                <label>
                  <span>新しい計画名</span>
                  <input onChange={(event) => { setRenameValue(event.target.value); setModalDirty(true) }} value={renameValue} />
                </label>
                <button disabled={isBusy} onClick={() => void confirmRename()} type="button">{isBusy ? '変更中…' : '変更する'}</button>
              </div>
            )}
          </section>
        </div>
      )}

      {isTutorialOpen && (
        <div className="modal-backdrop" onMouseDown={() => setIsTutorialOpen(false)}>
          <section aria-labelledby="tutorial-heading" className="tutorial-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button aria-label="チュートリアルを閉じる" className="modal-close" onClick={() => setIsTutorialOpen(false)} type="button"><span aria-hidden="true" className="button-glyph">×</span></button>
            <ThemeCrest className="tutorial-crest" theme="fire" />
            <p className="pixel-kicker">HOW TO BEGIN</p>
            <h2 id="tutorial-heading">冒険の書は、AIと一緒につくります。</h2>
            <ol className="tutorial-list">
              <li><span>01</span><div><strong>目標の輪郭を記す</strong><p>期限・達成条件・現在地をLongstepに入力します。</p></div></li>
              <li><span>02</span><div><strong>巻物をAIへ渡す</strong><p>コピーしたプロンプトを、普段使うチャットAIへ渡します。</p></div></li>
              <li><span>03</span><div><strong>復活の呪文を読む</strong><p>AIが作った全体JSONをLongstepへ戻すと、冒険が始まります。</p></div></li>
            </ol>
            <button className="rpg-button rpg-button-primary full-width" onClick={() => { setIsTutorialOpen(false); goCreate() }} type="button">冒険をはじめる <span>▶</span></button>
          </section>
        </div>
      )}

      {achievement && (
        <div className="achievement" role="status">
          <div className="achievement-rays" aria-hidden="true" />
          <div><span>目標を達成しました</span><strong>{achievement}</strong><small>次に取り組める目標を確認しましょう</small></div>
        </div>
      )}

    </div>
  )
}

export default App
