import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { PlanMap } from './components/PlanMap'
import { ThemeCrest } from './components/ThemeCrest'
import {
  addPlanProjectDirectory,
  deletePlan,
  PlanConflictError,
  getLastOpenedPlanId,
  getPlanDirectoryHandle,
  getPlanPreferences,
  getPlanProjectDirectories,
  listPlans,
  readPlan,
  saveLastOpenedPlan,
  savePlan,
  savePlanDirectoryHandle,
  savePlanPreferences,
} from './db/planStore'
import type { PlanPreferences } from './db/planStore'
import type { NewPlanNodeInput, NodeInsertion, PlanNode, PlanSnapshot } from './models/plan'
import { themeOptions } from './models/theme'
import type { ThemeId } from './models/theme'
import { buildPythonEntry, isPythonEntryForPlan, LONGSTEP_DIRECTORY_LABEL, LONGSTEP_DIRECTORY_NAME } from './python/entry'
import { insertPlanNode, swapNodesOnEdge } from './components/planMapLogic'
import { backdropCloseHandlers } from './components/backdropClose'

type Screen = 'home' | 'map' | 'help'
type Notice = { id: number; kind: 'success' | 'error'; text: string }
type AppModal = 'add' | 'create' | 'rename'

interface CreateForm {
  planName: string
}

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

type DirectoryPickerOptions = {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>
}

const initialCreateForm: CreateForm = {
  planName: '',
}

interface HelpStep {
  title: string
  body: ReactNode
}

interface HelpTopic {
  id: string
  label: string
  summary: string
  heading: string
  steps: HelpStep[]
}

const helpTopics: HelpTopic[] = [
  {
    id: 'how-to-use',
    label: '1. 基本的な使い方',
    summary: '計画の作成からAIエージェントと一緒に進めるまでの全体フロー。',
    heading: 'Longstepの基本的な使い方',
    steps: [
      {
        title: '計画を作成する',
        body: <>ホーム画面の<strong>「はじめから」</strong>ボタンまたは右下の<strong>「＋」</strong>ボタンから、計画名と保存先を指定して新しい計画を作成します。</>,
      },
      {
        title: '目標を書き込む',
        body: <>計画マップで最終目標に向かう中間目標を追加し、道筋をつなぎます。何から書けばよいか迷うときは、まずAIに相談しながら決めても構いません。</>,
      },
      {
        title: 'AI連携ファイルを置く',
        body: <>ホーム画面で計画のメニュー（右クリックまたは「…」ボタン）から<strong>「AI連携ファイルを追加」</strong>を選び、作業フォルダを指定すると<code>longstep.py</code>が設置されます。</>,
      },
      {
        title: 'AIエージェントに頼む',
        body: <>作業フォルダで動くAIエージェントに「<code>longstep.py</code>で今の計画を確認して進めて」と伝えます。AIの進捗更新はマップへ1秒以内に反映されます。</>,
      },
    ],
  },
  {
    id: 'map-operations',
    label: '2. 計画マップの操作方法',
    summary: '目標の追加、道筋の編集、並べ替え、省略表示などの操作。',
    heading: '計画マップの操作と編集',
    steps: [
      {
        title: '目標の追加',
        body: <>目標カードの左側にある<strong>「＋」</strong>を押すと、その前提となる目標を追加できます。また、右下の「＋」ボタンや、道筋をクリックして<strong>「新規目標をここに追加」</strong>からも挿入できます。</>,
      },
      {
        title: '道筋の追加・入れ替え・削除',
        body: <>目標カードの右端から別の目標へドラッグすると道筋をつなげます。道筋をクリックすると、目標同士の<strong>「位置を入れ替える」</strong>や<strong>「道筋を削除」</strong>が行えます。</>,
      },
      {
        title: '目標の並べ替え',
        body: <>目標カード上部のドラッグハンドル（<code>⋮⋮</code>）を上下にドラッグすると、同じ列の中で目標の上下位置を直感的に入れ替えられます。</>,
      },
      {
        title: '過去の達成済み目標の表示',
        body: <>過去の達成済み目標は自動的に折りたたまれます。左下の<strong>「省略された目標を表示」</strong>ボタンを押すと、すべての過去目標を一度に展開できます。</>,
      },
    ],
  },
  {
    id: 'goal-levels',
    label: '3. 目標の種類とハイライト',
    summary: '大目標・中目標・小目標・繰り返し目標と着手可能目標の強調。',
    heading: '目標のレベルと優先度の見方',
    steps: [
      {
        title: '目標の3つのレベル',
        body: <>目標は重要度や期間に応じて<strong>大目標</strong>（長期的な節目）、<strong>中目標</strong>（中期的なまとまり）、<strong>小目標</strong>（今すぐ取り組むタスク）の3段階に設定できます。</>,
      },
      {
        title: '繰り返し目標',
        body: <>日課や定期的なタスクには<strong>「繰り返し」</strong>を設定できます。達成するたびに達成回数がカウントアップされます。</>,
      },
      {
        title: '着手可能目標の自動ハイライト',
        body: <>前提となる目標がすべて達成されている未達成目標の中から、目標期日の早い順に最大3件が自動的に明るくハイライトされます。今何に取り組むべきかが一目で分かります。</>,
      },
    ],
  },
  {
    id: 'ai-agent',
    label: '4. AIエージェントとの連携',
    summary: 'longstep.pyを使ったAIとの共同作業手順とプロンプト例。',
    heading: 'AIエージェントと一緒に進める',
    steps: [
      {
        title: '連携ツールの配置',
        body: <>計画作成時またはホームのメニューから、プロジェクトフォルダへ<code>longstep.py</code>を設置します。Python 3.12標準ライブラリのみで動作し、追加パッケージは不要です。</>,
      },
      {
        title: 'AIへの指示プロンプト例',
        body: (
          <>
            作業フォルダで動くAIエージェント（Claude、ChatGPT、Cursor、Cline等）に、目的に応じて以下のように指示します。
            <ul className="help-prompt-list">
              <li className="help-prompt-item">
                <small>次の目標を進めたいとき</small>
                「<code>longstep.py</code>で計画書を確認し、次の小目標に着手してください」
              </li>
              <li className="help-prompt-item">
                <small>新しい目標を立てたいとき</small>
                「<code>longstep.py</code>で次にするべき小目標を立ててください」
              </li>
              <li className="help-prompt-item">
                <small>作業が一段落したとき</small>
                「<code>longstep.py</code>で各目標の達成度を判定し、計画書を更新してください」
              </li>
              <li className="help-prompt-item">
                <small>計画を整理・見直したいとき</small>
                「<code>longstep.py</code>で現在の計画を確認し、目標の並びや内容を整理してください」
              </li>
            </ul>
          </>
        ),
      },
      {
        title: 'リアルタイム自動同期',
        body: <>AIエージェントが<code>longstep.py</code>を通じて計画を更新すると、ブラウザの計画マップは再読み込み操作なしで1秒以内に自動更新されます。</>,
      },
    ],
  },
  {
    id: 'data-storage',
    label: '5. データの保存とプライバシー',
    summary: 'ローカル保存の仕組み、セキュリティ、キャッシュ削除時の復元。',
    heading: '安心の完全ローカル保存',
    steps: [
      {
        title: 'ローカル完結で安全',
        body: <>計画データの正本JSONは、お使いの端末の書類フォルダ内（<code>~/Documents/Longstep/</code>）にのみ保存されます。計画データが外部サーバーへ送信されることは一切ありません。</>,
      },
      {
        title: 'ブラウザ再読み込み時の復元',
        body: <>初回にフォルダを選択した後は、ブラウザを再読み込みしても前回の計画が自動で再開されます。</>,
      },
      {
        title: 'キャッシュ削除時も安心',
        body: <>ブラウザのキャッシュやIndexedDBがクリアされても、書類フォルダ内のJSONは安全に残ります。再度同じフォルダを選択するだけで、すべての計画を瞬時に復元できます。</>,
      },
    ],
  },
  {
    id: 'faq',
    label: '6. よくある質問（FAQ）',
    summary: 'マップの作り方、複数計画の管理、AI連携、同期に関する疑問。',
    heading: 'よくある質問（FAQ）',
    steps: [
      {
        title: '道筋はどう繋ぐのが正しい？',
        body: <>同時に進められる作業は上下に<strong>「分岐」</strong>させ、両方が終わってから進む目標へ<strong>「合流」</strong>させます。カード右端のドラッグで自由に道筋を繋げられます。</>,
      },
      {
        title: '黄色い枠やカードの記号の意味は？',
        body: <>黄色い枠は<strong>「前提が完了し今すぐ着手できる目標」</strong>です。カード左の「＋」で前提追加、上部の「⋮⋮」で上下入れ替え、「◆ / ◇ / ・」は大中小の目標レベルを表します。</>,
      },
      {
        title: '複数のプロジェクトを管理できる？',
        body: <>はい。1つの計画書につき最終目標は1つです。別のプロジェクトは左上の<strong>「ホーム」</strong>から新規計画書を作成し、一覧からワンクリックで切り替えて管理できます。</>,
      },
      {
        title: 'AIは目標の追加や道筋の接続もできる？',
        body: <>はい。進捗の更新だけでなく、「この目標を達成するための小目標を作って繋げて」と指示すれば、目標の細分化や道筋の接続までAIが自動で構築します。</>,
      },
      {
        title: '別の作業フォルダでも同じ計画を操作できる？',
        body: <>はい。ホーム画面で計画の「…」メニューから作業したい各プロジェクトフォルダへ<code>longstep.py</code>を追加設置すれば、複数の開発環境から同じ計画を共有・操作できます。</>,
      },
      {
        title: '複数のPC間で同じ計画を同期するには？',
        body: <>保存先フォルダ（<code>~/Documents/Longstep/</code>）を iCloud Drive や Dropbox、Git 等で同期し、別PCの Longstep でそのフォルダを選択するだけで共有・同期できます。</>,
      },
    ],
  },
]

type CreateErrorField = 'planName' | 'longstepDirectory'
type CreateErrors = Partial<Record<CreateErrorField, string>>

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

async function writeFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  contents: string | ArrayBuffer,
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(contents)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

async function installSharedTool(longstepDirectory: FileSystemDirectoryHandle): Promise<void> {
  const response = await fetch(new URL(`${import.meta.env.BASE_URL}longstep.pyz`, window.location.href))
  if (!response.ok) throw new Error('Python共通ツールを取得できませんでした。')
  await writeFile(longstepDirectory, 'longstep.pyz', await response.arrayBuffer())
}

async function installProjectEntry(projectDirectory: FileSystemDirectoryHandle, planId: string): Promise<void> {
  try {
    const existing = await projectDirectory.getFileHandle('longstep.py')
    const existingText = await (await existing.getFile()).text()
    if (!existingText.startsWith('# Generated by Longstep')) {
      throw new Error('設置先にLongstep以外が作成したlongstep.pyがあります。別の設置先を選択してください。')
    }
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
  }

  await writeFile(projectDirectory, 'longstep.py', buildPythonEntry(planId))
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

function createEmptyPlan(name = '名称未設定の計画', theme: ThemeId = 'fire'): PlanSnapshot {
  const timestamp = new Date().toISOString()
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
  return {
    id: `plan-${id}`,
    name,
    goal: {
      statement: '',
      deadline: '',
      successCriteria: [],
    },
    nodes: [],
    meta: { revision: 0, createdAt: timestamp, updatedAt: timestamp, theme },
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
  const [createForm, setCreateForm] = useState<CreateForm>(initialCreateForm)
  const [longstepDirectory, setLongstepDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [projectDirectory, setProjectDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [createErrors, setCreateErrors] = useState<CreateErrors>({})
  const [needsDirectoryPermission, setNeedsDirectoryPermission] = useState(false)
  const [helpTopicId, setHelpTopicId] = useState<string | null>(null)
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false)
  const [mapPlanName, setMapPlanName] = useState('')
  const [mapFinalGoalName, setMapFinalGoalName] = useState('')
  const [mapPlanDeadline, setMapPlanDeadline] = useState('')
  const [mapPlanTheme, setMapPlanTheme] = useState<ThemeId>('fire')
  const [mapPlanSaveStatus, setMapPlanSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [notices, setNotices] = useState<Notice[]>([])
  const noticeIdRef = useRef(0)
  const [activeModal, setActiveModal] = useState<AppModal | null>(null)
  const [previousModal, setPreviousModal] = useState<AppModal | null>(null)
  const [modalDirty, setModalDirty] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [planMenuId, setPlanMenuId] = useState<string | null>(null)
  const [renamePlan, setRenamePlan] = useState<PlanSnapshot | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [theme, setTheme] = useState<ThemeId>('fire')
  const isTransitioning = false
  const [achievement, setAchievement] = useState<string | null>(null)
  const viewSaveTimerRef = useRef<number | null>(null)
  const mapPlanSaveTimerRef = useRef<number | null>(null)
  const mapPlanSaveVersionRef = useRef(0)
  const externalSyncErrorRef = useRef(false)
  const activePlanRef = useRef<PlanSnapshot | null>(null)
  const mapPlanDraftRef = useRef({ name: '', finalGoalName: '', deadline: '', theme: 'fire' as ThemeId })

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

  async function directoryPermission(handle: FileSystemDirectoryHandle, request = false): Promise<PermissionState> {
    const permissionHandle = handle as PermissionDirectoryHandle
    if (typeof permissionHandle.queryPermission !== 'function') return 'granted'
    const current = await permissionHandle.queryPermission({ mode: 'readwrite' })
    if (current === 'granted' || !request) return current
    return permissionHandle.requestPermission({ mode: 'readwrite' })
  }

  async function pickDirectory(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) {
      // BraveはFile System Access APIを既定で無効にしている（brave://flagsで有効化できる）。
      const isBrave = 'brave' in navigator
      throw new Error(isBrave
        ? 'Braveはフォルダ選択機能を既定で無効にしています。brave://flags を開き「File System Access API」を Enabled にして再起動してください。'
        : 'フォルダ選択に対応したブラウザ（Chrome・Edge・Braveなど）で開いてください。')
    }
    return picker.call(window, options)
  }

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
      if (await directoryPermission(handle, true) !== 'granted') {
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
      if (await directoryPermission(handle, true) !== 'granted') {
        throw new Error('プロジェクト設置先への読み書きが許可されませんでした。')
      }
      setProjectDirectory(handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice({ kind: 'error', text: `${errorMessage(error)} 設置先をもう一度選択してください。` })
    }
  }

  // 保存済みハンドルの権限は再訪時に'prompt'へ戻ることがある。
  // requestPermission()はユーザー操作からしか呼べないため、
  // 権限がない場合はホームに再許可の導線を出す。
  async function restoreSavedPlans(requestPermissionFromUserGesture = false) {
    const handle = await getPlanDirectoryHandle()
    if (!handle) return
    setLongstepDirectory(handle)

    if (await directoryPermission(handle, requestPermissionFromUserGesture) !== 'granted') {
      setNeedsDirectoryPermission(true)
      return
    }
    setNeedsDirectoryPermission(false)
    await openMostRecentPlan()
  }

  // 別のブラウザやプロファイルからでも、保存先を選び直すだけで再開できる。
  async function reopenFromDirectory() {
    try {
      const handle = await pickDirectory({ id: 'longstep-home', mode: 'readwrite', startIn: 'documents' })
      if (handle.name !== LONGSTEP_DIRECTORY_NAME) {
        throw new Error(`「${handle.name}」が選ばれました。書類フォルダの中の「${LONGSTEP_DIRECTORY_NAME}」フォルダを選んでください。`)
      }
      if (await directoryPermission(handle, true) !== 'granted') {
        throw new Error('Longstep保存先への読み書きが許可されませんでした。')
      }
      await savePlanDirectoryHandle(handle)
      setLongstepDirectory(handle)
      setNeedsDirectoryPermission(false)
      const opened = await openMostRecentPlan()
      if (!opened) setNotice({ kind: 'error', text: 'このフォルダに計画書が見つかりませんでした。保存先を確認してください。' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  async function openMostRecentPlan(): Promise<boolean> {
    const loadedPlans = await loadPlans()
    if (loadedPlans.length === 0) return false
    let lastOpenedPlanId: string | null = null
    try {
      lastOpenedPlanId = await getLastOpenedPlanId()
    } catch {
      // 保存済みIDを読めない場合は、更新日の新しい計画を開く。
    }
    await openPlan(loadedPlans.find((plan) => plan.id === lastOpenedPlanId) ?? loadedPlans[0])
    return true
  }

  useEffect(() => {
    void restoreSavedPlans().catch((error) => setNotice({ kind: 'error', text: errorMessage(error) }))
  }, [])

  useEffect(() => {
    activePlanRef.current = activePlan
  }, [activePlan])

  const activePlanId = activePlan?.id ?? null
  const activeHelpTopic = helpTopics.find((topic) => topic.id === helpTopicId) ?? null

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
        activePlanRef.current = latest
        setActivePlan(latest)
        setPlans((current) => current.map((plan) => plan.id === latest.id ? latest : plan))
        setNotice({ kind: 'success', text: 'Pythonツールの更新を反映しました。' })
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
  }, [screen, activePlanId])

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
      setModalDirty(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [activeModal, modalDirty])

  useEffect(() => {
    if (!helpTopicId) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpTopicId(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [helpTopicId])

  function runTransition(action: () => void, _kind = 'fade') {
    action()
  }

  // 競合時はPythonツール側の更新が正。Web側の変更は破棄し、最新の内容へ即時に切り替える。
  function reportSaveError(error: unknown, suffix?: string) {
    if (error instanceof PlanConflictError) {
      setNotice({ kind: 'error', text: errorMessage(error) })
      void refreshActivePlan()
      return
    }
    setNotice({ kind: 'error', text: suffix ? `${errorMessage(error)} ${suffix}` : errorMessage(error) })
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
      // 読み直せない場合は、1秒ごとの自動同期に任せる。
    }
  }

  async function openPlan(plan: PlanSnapshot, successMessage?: string) {
    const nextTheme: ThemeId = plan.meta.theme

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

  function openModal(modal: AppModal, from: AppModal | null = null) {
    setPreviousModal(from)
    setActiveModal(modal)
    setModalDirty(false)
  }

  function closeModal(force = false) {
    if (!force && modalDirty && !window.confirm('未保存の入力があります。閉じてもよいですか？')) return
    setActiveModal(null)
    setPreviousModal(null)
    setModalDirty(false)
  }

  function clearCreateError(field: CreateErrorField) {
    setCreateErrors((current) => (field in current ? { ...current, [field]: undefined } : current))
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
      closeModal(true)
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
      reportSaveError(error)
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
      reportSaveError(error)
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
      reportSaveError(error)
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
      reportSaveError(error)
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
      reportSaveError(error)
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
      reportSaveError(error)
      return false
    }
  }

  async function swapEdgeNodes(fromNodeId: string, toNodeId: string): Promise<boolean> {
    if (!activePlan) return false

    const fromNode = activePlan.nodes.find((node) => node.id === fromNodeId)
    const toNode = activePlan.nodes.find((node) => node.id === toNodeId)

    if (!fromNode || !toNode || !toNode.dependsOn.includes(fromNodeId)) {
      setNotice({ kind: 'error', text: '入れ替え対象の道筋が見つかりませんでした。' })
      return false
    }

    const nextNodes = swapNodesOnEdge(activePlan.nodes, fromNodeId, toNodeId)
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
      await loadPlans()
      setNotice({ kind: 'success', text: `「${fromNode.name}」と「${toNode.name}」の位置を入れ替えました。` })
      return true
    } catch (error) {
      reportSaveError(error)
      return false
    }
  }

  // 計画を削除したら、その計画専用の入口も片付ける。
  // 権限が切れている場合や、設置先が別計画の入口へ差し替わっている場合は手を触れない。
  async function removePythonEntries(planId: string): Promise<{ removed: number; skipped: number }> {
    const result = { removed: 0, skipped: 0 }

    for (const projectDirectory of await getPlanProjectDirectories(planId)) {
      if (await directoryPermission(projectDirectory, true) !== 'granted') {
        result.skipped += 1
        continue
      }
      try {
        const handle = await projectDirectory.getFileHandle('longstep.py')
        const text = await (await handle.getFile()).text()
        if (!isPythonEntryForPlan(text, planId)) continue
        await projectDirectory.removeEntry('longstep.py')
        result.removed += 1
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') continue
        result.skipped += 1
      }
    }

    return result
  }

  // AI連携ファイルは計画作成時だけでなく、あとから何度でも追加できる。
  async function installEntryForPlan(plan: PlanSnapshot) {
    setPlanMenuId(null)
    try {
      const longstepHandle = longstepDirectory ?? await getPlanDirectoryHandle()
      if (!longstepHandle || await directoryPermission(longstepHandle, true) !== 'granted') {
        throw new Error('Longstep保存先への権限が必要です。')
      }
      const projectHandle = await pickDirectory({ id: 'longstep-project', mode: 'readwrite' })
      if (await directoryPermission(projectHandle, true) !== 'granted') {
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

    if (!confirmed) {
      return
    }

    try {
      const { removed, skipped } = await removePythonEntries(plan.id)
      await deletePlan(plan.id)
      await loadPlans()
      setNotice({
        kind: 'success',
        text: skipped > 0
          ? `計画書を削除しました。${skipped}件のAI連携ファイルは削除できなかったため、手動で削除してください。`
          : removed > 0
            ? `計画書と${removed}件のAI連携ファイルを削除しました。`
            : '計画書を削除しました。',
      })
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  function updateForm(field: keyof CreateForm, value: string) {
    setCreateForm((current) => ({ ...current, [field]: value }))
    setModalDirty(true)
    clearCreateError(field)
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
    const planId = activePlan.id

    mapPlanSaveTimerRef.current = window.setTimeout(() => {
      mapPlanSaveTimerRef.current = null

      // 保存の直前に最新のrevisionを取り直す。連続入力では前回の保存結果が
      // まだstateへ反映されておらず、古いrevisionのままだと自分自身と競合する。
      const sourcePlan = activePlanRef.current
      if (!sourcePlan || sourcePlan.id !== planId) return

      const updatedPlan: PlanSnapshot = {
        ...sourcePlan,
        name,
        goal: { ...sourcePlan.goal, statement: finalGoalName, deadline: draft.deadline },
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

  function goCreate(from: AppModal | null = null) {
    setCreateForm(initialCreateForm)
    setProjectDirectory(null)
    setCreateErrors({})
    openModal('create', from)
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
      reportSaveError(error, 'もう一度変更してください。')
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

    // 開ける計画がないのは、権限が切れたか、保存先をまだ選んでいない場合。
    // 「つづきから」はユーザー操作なので、その場で権限要求とフォルダ選択を出せる。
    if (needsDirectoryPermission) {
      void restoreSavedPlans(true).catch((error) => setNotice({ kind: 'error', text: errorMessage(error) }))
      return
    }
    if (!longstepDirectory) {
      void reopenFromDirectory()
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

  const shellTheme = screen === 'map' ? theme : 'fire'
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
            {helpTopics.map((topic) => (
              <button key={topic.id} onClick={() => setHelpTopicId(topic.id)} type="button">{topic.label}</button>
            ))}
            <button onClick={() => setScreen('help')} type="button">ヘルプ一覧</button>
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
            {needsDirectoryPermission ? (
              <div className="empty-plans">
                <span className="empty-icon" aria-hidden="true">◇</span>
                <strong>保存先へのアクセス許可が必要です</strong>
                <p>ブラウザを開き直すと、フォルダへのアクセス許可がリセットされます。許可すると、前回までの計画書を読み込みます。</p>
                <button
                  className="rpg-button rpg-button-primary"
                  onClick={() => void restoreSavedPlans(true).catch((error) => setNotice({ kind: 'error', text: errorMessage(error) }))}
                  type="button"
                >
                  保存先へのアクセスを許可する
                </button>
              </div>
            ) : plans.length === 0 ? (
              <div className="empty-plans">
                <span className="empty-icon" aria-hidden="true">◇</span>
                <strong>まだ計画書がないようです</strong>
                <p>右下の追加ボタンから新しい計画書を作成できます。別のブラウザやPCで作った計画書がある場合は、保存先フォルダを選ぶと再開できます。</p>
                <button
                  className="rpg-button rpg-button-primary"
                  onClick={() => void reopenFromDirectory()}
                  type="button"
                >
                  保存先を選んで再開する
                </button>
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
                            <button onClick={() => void installEntryForPlan(plan)} type="button">AI連携ファイルを追加</button>
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
              <p>保存先と計画名を指定し、AIエージェントと共有する計画を作ります。</p>
              <div className="card-actions">
                <button className="rpg-button rpg-button-quiet" onClick={() => setHelpTopicId('how-to-use')} type="button">遊び方</button>
                <button className="rpg-button rpg-button-primary" onClick={() => goCreate()} type="button">はじめから <span>▶</span></button>
              </div>
            </article>
          </section>
        </main>
      )}

      {screen === 'help' && (
        <main className="page help-page">
          <section className="book-section">
            <div className="ornament-heading">
              <h2>ヘルプ</h2>
            </div>
            <div className="help-topic-list">
              {helpTopics.map((topic) => (
                <button className="help-topic" key={topic.id} onClick={() => setHelpTopicId(topic.id)} type="button">
                  <strong>{topic.label}</strong>
                  <span className="help-topic-summary">{topic.summary}</span>
                </button>
              ))}
            </div>
          </section>
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
            {...backdropCloseHandlers(() => closeMapMenu())}
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
              <button className="rpg-button rpg-button-quiet full-width" onClick={() => { if (closeMapMenu()) goHome() }} type="button">ホームへ戻る</button>
            </div>
          </aside>

          <PlanMap
            initialViewPosition={planPreferences[activePlan.id]?.viewPosition}
            onAddEdge={addEdge}
            onClearSelection={() => setSelectedNodeId(null)}
            onCreateNode={createNode}
            onDeleteEdge={deleteEdge}
            onSwapEdgeNodes={swapEdgeNodes}
            onDeleteNode={deleteNode}
            onOpenPlanMenu={openMapMenu}
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
        <div className="modal-backdrop app-modal-backdrop" {...backdropCloseHandlers(() => closeModal())}>
          <section aria-labelledby="app-modal-heading" aria-modal="true" className="app-modal common-modal" role="dialog">
            <button aria-label="モーダルを閉じる" className="modal-close" onClick={() => closeModal()} type="button"><span aria-hidden="true" className="button-glyph">×</span></button>

            {activeModal === 'add' && (
              <>
                <h2 id="app-modal-heading">追加するものを選ぶ</h2>
                <div className="app-modal-actions">
                  <button onClick={() => goCreate('add')} type="button">新規計画書を作成する</button>
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
                  <button onClick={() => closeModal(true)} type="button">閉じる</button>
                </div>
              </>
            )}

            {activeModal === 'create' && (
              <form className="app-modal-form create-form" noValidate onSubmit={handleCreateSubmit}>
                <h2 id="app-modal-heading">新規計画書</h2>

                <div className="form-field">
                  <label htmlFor="create-plan-name">計画名<span className="field-required">必須</span></label>
                  <input
                    aria-describedby={createErrors.planName ? 'create-plan-name-error' : undefined}
                    aria-invalid={createErrors.planName ? true : undefined}
                    autoFocus
                    id="create-plan-name"
                    onChange={(event) => updateForm('planName', event.target.value)}
                    placeholder="例：ポートフォリオサイトを公開する"
                    value={createForm.planName}
                  />
                  {createErrors.planName && <p className="field-error" id="create-plan-name-error" role="alert">{createErrors.planName}</p>}
                </div>

                <div className="form-field">
                  <label htmlFor="create-longstep-dir">保存先フォルダ<span className="field-required">必須</span></label>
                  <div className="path-field">
                    <input
                      aria-describedby={createErrors.longstepDirectory ? 'create-longstep-dir-error' : 'create-longstep-dir-help'}
                      aria-invalid={createErrors.longstepDirectory ? true : undefined}
                      id="create-longstep-dir"
                      placeholder="未選択"
                      readOnly
                      value={longstepDirectory ? `書類 / ${longstepDirectory.name}` : ''}
                    />
                    <button className="path-field-button" disabled={isBusy} onClick={() => void selectLongstepDirectory()} type="button">参照…</button>
                  </div>
                  <p className="field-help" id="create-longstep-dir-help">計画JSONと共通ツール（<code>longstep.pyz</code>）の置き場所は<strong>書類フォルダ内の「{LONGSTEP_DIRECTORY_NAME}」</strong>に固定です。Pythonツールが同じ場所を自動で参照します。フォルダがなければ、選択ダイアログで新規作成してください。</p>
                  {createErrors.longstepDirectory && <p className="field-error" id="create-longstep-dir-error" role="alert">{createErrors.longstepDirectory}</p>}
                </div>

                <div className="form-field">
                  <label htmlFor="create-project-dir">AI連携ファイルの置き場所<span className="field-optional">任意</span></label>
                  <div className="path-field">
                    <input
                      id="create-project-dir"
                      placeholder="未選択"
                      readOnly
                      value={projectDirectory?.name ?? ''}
                    />
                    <button className="path-field-button" disabled={isBusy} onClick={() => void selectProjectDirectory()} type="button">参照…</button>
                  </div>
                  <p className="field-help">AIエージェントがこの計画を読み書きするための<code>longstep.py</code>を、このフォルダへ置きます。あとからホームで計画を右クリックして追加でき、複数のプロジェクトへ追加できます。</p>
                </div>

                <div className="form-submit">
                  <button className="is-primary" disabled={isBusy} type="submit">{isBusy ? '作成中…' : '計画書を作成する'}</button>
                  {previousModal && <button onClick={() => { setActiveModal(previousModal); setPreviousModal(null) }} type="button">前の画面に戻る</button>}
                </div>
              </form>
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

      {activeHelpTopic && (
        <div className="modal-backdrop" {...backdropCloseHandlers(() => setHelpTopicId(null))}>
          <section aria-labelledby="help-modal-heading" className="help-modal">
            <button aria-label="閉じる" className="modal-close" onClick={() => setHelpTopicId(null)} type="button"><span aria-hidden="true" className="button-glyph">×</span></button>
            <h2 id="help-modal-heading">{activeHelpTopic.heading}</h2>
            <ol className="help-steps">
              {activeHelpTopic.steps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button className="rpg-button rpg-button-primary full-width" onClick={() => setHelpTopicId(null)} type="button">とじる</button>
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
