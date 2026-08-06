import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { PlanMap } from './components/PlanMap'
import { ThemeCrest } from './components/ThemeCrest'
import {
  deletePlan,
  getLastOpenedPlanId,
  getPlanTheme,
  listPlans,
  saveLastOpenedPlan,
  savePlan,
  savePlanTheme,
} from './db/planStore'
import type { PlanNode, PlanSnapshot } from './models/plan'
import { themeOptions } from './models/theme'
import type { ThemeId } from './models/theme'
import { buildPlanCreationPrompt } from './prompts/planPrompt'
import { normalizePlan, parsePlanText } from './schemas/planValidation'

type Screen = 'home' | 'create' | 'map'
type Notice = { kind: 'success' | 'error'; text: string }
type TransitionKind = 'fade' | 'shutter'

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

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [plans, setPlans] = useState<PlanSnapshot[]>([])
  const [planThemes, setPlanThemes] = useState<Record<string, ThemeId>>({})
  const [activePlan, setActivePlan] = useState<PlanSnapshot | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [createForm, setCreateForm] = useState<CreateForm>(initialCreateForm)
  const [createTheme, setCreateTheme] = useState<ThemeId>('fire')
  const [pendingPlanTheme, setPendingPlanTheme] = useState<ThemeId | null>(null)
  const [isPromptVisible, setIsPromptVisible] = useState(false)
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [theme, setTheme] = useState<ThemeId>('fire')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionKind, setTransitionKind] = useState<TransitionKind>('fade')
  const [achievement, setAchievement] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transitionTimersRef = useRef<number[]>([])

  const prompt = useMemo(
    () => buildPlanCreationPrompt(createForm),
    [createForm],
  )

  async function loadPlans() {
    try {
      const loadedPlans = await listPlans()
      setPlans(loadedPlans)

      const loadedThemes = await Promise.all(
        loadedPlans.map(async (plan) => [plan.id, await getPlanTheme(plan.id)] as const),
      )
      setPlanThemes(Object.fromEntries(loadedThemes))
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  useEffect(() => {
    void loadPlans()
  }, [])

  useEffect(() => {
    if (!notice || notice.kind !== 'success') {
      return
    }

    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!achievement) {
      return
    }

    const timer = window.setTimeout(() => setAchievement(null), 2400)
    return () => window.clearTimeout(timer)
  }, [achievement])

  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

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

  function runTransition(action: () => void, kind: TransitionKind = 'fade') {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    setTransitionKind(kind)
    setIsTransitioning(true)

    const actionTimer = window.setTimeout(action, 210)
    const finishTimer = window.setTimeout(() => setIsTransitioning(false), 620)
    transitionTimersRef.current = [actionTimer, finishTimer]
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
      setNotice({ kind: 'error', text: 'JSONテキストを入力してください。' })
      return
    }

    try {
      const plan = normalizePlan(parsePlanText(rawText))
      await savePlan(plan)
      if (pendingPlanTheme) {
        await savePlanTheme(plan.id, pendingPlanTheme)
        setPendingPlanTheme(null)
      }
      await loadPlans()
      setImportText('')
      await openPlan(plan, '冒険の書を保存しました。')
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  async function importFile(file: File) {
    try {
      await importPlanText(await file.text())
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
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
    const hasCriteria = createForm.successCriteria.split('\n').some((line) => line.trim())

    if (!createForm.planName.trim() || !createForm.statement.trim() || !createForm.deadline || !hasCriteria) {
      setNotice({
        kind: 'error',
        text: '計画名・最終目標・期限・達成条件を入力してください。',
      })
      return
    }

    setIsPromptVisible(true)
    setPendingPlanTheme(createTheme)
    setCopied(false)
    setNotice({ kind: 'success', text: 'AIに渡す巻物を作成しました。' })
    window.setTimeout(() => document.querySelector('.prompt-card')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setNotice({ kind: 'success', text: '巻物の内容をコピーしました。' })
    } catch {
      setNotice({ kind: 'error', text: 'コピーできませんでした。テキストを選択してコピーしてください。' })
    }
  }

  async function updateNode(node: PlanNode) {
    if (!activePlan) {
      return
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
      setSelectedNodeId(node.id)
      await loadPlans()
      setNotice({ kind: 'success', text: '中間目標を記録しました。' })

      if (previousNode?.status !== 'completed' && node.status === 'completed') {
        setAchievement(node.name)
      }
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
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

  async function handleThemeChange(nextTheme: ThemeId) {
    if (!activePlan || nextTheme === theme) {
      return
    }

    try {
      await savePlanTheme(activePlan.id, nextTheme)
      setPlanThemes((current) => ({ ...current, [activePlan.id]: nextTheme }))
      runTransition(() => setTheme(nextTheme), 'shutter')
      setNotice({ kind: 'success', text: '冒険の書のデザインを変更しました。' })
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  function randomizeTheme() {
    const candidates = themeOptions.filter((option) => option.id !== theme)
    const nextTheme = candidates[Math.floor(Math.random() * candidates.length)]

    if (nextTheme) {
      void handleThemeChange(nextTheme.id)
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
      setNotice({ kind: 'success', text: '冒険の書を削除しました。' })
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

  function goCreate() {
    runTransition(() => {
      setScreen('create')
      setNotice(null)
      window.scrollTo({ top: 0, behavior: 'auto' })
    })
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

  return (
    <div className={`app-shell screen-${screen} theme-${shellTheme}`}>
      <div aria-hidden="true" className="ambient-grain" />
      <header className={`site-header ${screen === 'map' ? 'map-site-header' : ''} ${screen === 'create' ? 'create-site-header' : ''} ${isMapMenuOpen ? 'is-menu-open' : ''}`}>
        <button aria-label="冒険の書へ戻る" className="brand" onClick={goHome} type="button">
          <ThemeCrest className="brand-crest" theme={shellTheme} />
          <span>
            <strong>LONGSTEP</strong>
            <small>THE CHRONICLE OF YOUR QUEST</small>
          </span>
        </button>
        {screen === 'map' && activePlan ? (
          <>
            <div className="map-header-title">
              <span>CURRENT CHRONICLE</span>
              <strong>{activePlan.name}</strong>
            </div>
            <button
              aria-controls="map-command-menu"
              aria-expanded={isMapMenuOpen}
              aria-label={isMapMenuOpen ? 'マップメニューを閉じる' : 'マップメニューを開く'}
              className={`hamburger-button ${isMapMenuOpen ? 'is-open' : ''}`}
              onClick={() => setIsMapMenuOpen((current) => !current)}
              type="button"
            >
              <span /><span /><span />
            </button>
          </>
        ) : screen !== 'home' ? (
          <button className="rpg-button rpg-button-quiet" onClick={goHome} type="button">
            <span aria-hidden="true">◀</span> 冒険の書へ
          </button>
        ) : null}
      </header>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span className="notice-glyph" aria-hidden="true">{notice.kind === 'success' ? '✦' : '!'}</span>
          <span>{notice.text}</span>
          <button aria-label="通知を閉じる" onClick={() => setNotice(null)} type="button">×</button>
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
                <button className="command-button" onClick={goCreate} type="button">
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
              <span className="heading-rune" aria-hidden="true">Ⅰ</span>
              <div>
                <p className="pixel-kicker">CONTINUE YOUR QUEST</p>
                <h2>計画を再開する</h2>
              </div>
              <span className="record-count">{String(plans.length).padStart(2, '0')} BOOKS</span>
            </div>
            {plans.length === 0 ? (
              <div className="empty-plans">
                <span className="empty-icon" aria-hidden="true">◇</span>
                <strong>白紙の冒険譚</strong>
                <p>「はじめから」で目標を立てるか、下の復活の呪文から計画を読み込んでください。</p>
              </div>
            ) : (
              <div className="saved-list">
                {plans.map((plan, index) => {
                  const planTheme = planThemes[plan.id] ?? 'fire'
                  const completed = plan.nodes.filter((node) => node.status === 'completed').length
                  const progress = plan.nodes.length > 0 ? Math.round((completed / plan.nodes.length) * 100) : 0

                  return (
                    <article className="saved-plan" key={plan.id}>
                      <span className="save-slot">SLOT {String(index + 1).padStart(2, '0')}</span>
                      <ThemeCrest className="saved-plan-crest" theme={planTheme} />
                      <button className="saved-plan-main" onClick={() => void openPlan(plan)} type="button">
                        <strong>{plan.name}</strong>
                        <span>{plan.nodes.length}個の中間目標 · {formatUpdatedAt(plan.meta.updatedAt)}更新</span>
                        <span className="save-progress" aria-label={`達成率 ${progress}%`}>
                          <span style={{ width: `${progress}%` }} />
                        </span>
                      </button>
                      <div className="saved-plan-actions">
                        <button className="rpg-button rpg-button-small" onClick={() => void openPlan(plan)} type="button">冒険を再開</button>
                        <button className="danger-button" onClick={() => void handleDeletePlan(plan)} type="button">削除</button>
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
                <button className="rpg-button rpg-button-primary" onClick={goCreate} type="button">はじめから <span>▶</span></button>
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
            onClick={() => setIsMapMenuOpen(false)}
            tabIndex={isMapMenuOpen ? 0 : -1}
            type="button"
          />
          <aside
            aria-hidden={!isMapMenuOpen}
            className={`map-command-menu ${isMapMenuOpen ? 'is-open' : ''}`}
            id="map-command-menu"
            inert={!isMapMenuOpen}
          >
            <div className="map-menu-heading">
              <div>
                <span>ADVENTURE MENU</span>
                <strong>{activePlan.name}</strong>
              </div>
            </div>
            <div className="map-menu-progress">
              <span><small>達成済み</small><strong>{completedNodes}/{activePlan.nodes.length}</strong></span>
              <span><small>期限</small><strong>{activePlan.goal.deadline || '未設定'}</strong></span>
            </div>
            <label className="plan-switcher">
              <span>冒険の書を切替</span>
              <select
                onChange={(event) => {
                  const nextPlan = plans.find((plan) => plan.id === event.target.value)
                  if (nextPlan) void openPlan(nextPlan)
                }}
                value={activePlan.id}
              >
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
            </label>
            <div aria-label="デザインを変更" className="theme-picker random-theme-picker">
              <button aria-label="デザインを変更" className="theme-random-button" onClick={randomizeTheme} type="button">
                <ThemeCrest className="theme-random-crest" theme={theme} />
                <span className="theme-random-copy">
                  <strong>デザインを変更</strong>
                </span>
                <span aria-hidden="true" className="theme-random-glyph">✦</span>
              </button>
            </div>
            <div className="map-menu-actions">
              <button className="rpg-button rpg-button-quiet full-width" onClick={exportPlan} type="button">JSONを書き出す ⇩</button>
              <button className="rpg-button rpg-button-quiet full-width" onClick={goHome} type="button">冒険の書へ戻る ◀</button>
            </div>
          </aside>

          <PlanMap
            onAddEdge={addEdge}
            onClearSelection={() => setSelectedNodeId(null)}
            onDeleteEdge={deleteEdge}
            onSelectNode={setSelectedNodeId}
            onUpdateNode={(node) => { void updateNode(node) }}
            plan={activePlan}
            selectedNodeId={selectedNodeId}
            theme={theme}
          />
        </main>
      )}

      {isTutorialOpen && (
        <div className="modal-backdrop" onMouseDown={() => setIsTutorialOpen(false)}>
          <section aria-labelledby="tutorial-heading" className="tutorial-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button aria-label="チュートリアルを閉じる" className="modal-close" onClick={() => setIsTutorialOpen(false)} type="button">×</button>
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
          <ThemeCrest className="achievement-crest" theme={theme} />
          <div><span>QUEST COMPLETE</span><strong>{achievement}</strong><small>新しい一歩が刻まれました</small></div>
        </div>
      )}

      <div aria-hidden="true" className={`screen-transition transition-${transitionKind} ${isTransitioning ? 'is-active' : ''}`}>
        <span className="shutter-top" />
        <span className="shutter-bottom" />
        <strong>LONGSTEP</strong>
      </div>
    </div>
  )
}

export default App
