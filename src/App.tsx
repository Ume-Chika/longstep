import { useEffect, useRef, useState } from 'react'
import type { PlanSnapshot } from './models/plan'
import type { Screen } from './types/app'
import { helpTopics } from './constants/helpTopics'
import { Header } from './components/Header'
import { HomeScreen } from './components/screens/HomeScreen'
import { MapScreen } from './components/screens/MapScreen'
import { HelpScreen } from './components/screens/HelpScreen'
import { AppModals } from './components/AppModals'
import { NoticeStack } from './components/NoticeStack'
import { AchievementToast } from './components/AchievementToast'
import { useNotices } from './hooks/useNotices'
import { usePlanPreferences } from './hooks/usePlanPreferences'
import { usePlanStorage } from './hooks/usePlanStorage'
import { usePlanDraft } from './hooks/usePlanDraft'
import { usePlanOperations } from './hooks/usePlanOperations'
import { useCreatePlanModal } from './hooks/useCreatePlanModal'
import { useRenamePlanModal } from './hooks/useRenamePlanModal'
import { usePlanNavigation } from './hooks/usePlanNavigation'
import { useExternalSync } from './hooks/useExternalSync'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { errorMessage } from './utils/planFactory'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [plans, setPlans] = useState<PlanSnapshot[]>([])
  const [activePlan, setActivePlan] = useState<PlanSnapshot | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [helpTopicId, setHelpTopicId] = useState<string | null>(null)
  const [achievement, setAchievement] = useState<string | null>(null)
  const activePlanRef = useRef<PlanSnapshot | null>(null)

  const { notices, setNotice, dismissNotice } = useNotices()
  const prefs = usePlanPreferences({ activePlan, setNotice, errorMessage })
  const { planPreferences, loadPreferencesForPlans, saveViewPosition, toggleFavorite, getSortedPlans } = prefs

  const nav = usePlanNavigation({
    activePlan, activePlanRef, plans, setActivePlan, setPlans, setSelectedNodeId, setScreen,
    setTheme: (t) => planDraft.setTheme(t),
    closeMapMenu: () => planDraft.closeMapMenu(),
    setNotice, loadPreferencesForPlans, errorMessage,
  })

  const storage = usePlanStorage({
    loadPlans: nav.loadPlans, openMostRecentPlan: nav.openMostRecentPlan, setNotice,
    setCreateErrors: (errors) => createModal.setCreateErrors(errors),
    clearCreateError: (field) => createModal.clearCreateError(field),
    activePlan, goHome: nav.goHome, errorMessage,
  })

  const planDraft = usePlanDraft({
    activePlan, activePlanRef, setActivePlan, setPlans, reportSaveError: nav.reportSaveError,
  })

  const operations = usePlanOperations({
    activePlan, setActivePlan, setSelectedNodeId, loadPlans: nav.loadPlans, setNotice, setAchievement,
    reportSaveError: nav.reportSaveError,
  })

  const createModal = useCreatePlanModal({
    longstepDirectory: storage.longstepDirectory,
    projectDirectory: storage.projectDirectory,
    setProjectDirectory: storage.setProjectDirectory,
    directoryPermission: storage.directoryPermission,
    loadPlans: nav.loadPlans,
    openPlan: nav.openPlan,
    setNotice,
    setHelpTopicId,
    errorMessage,
  })

  const renameModal = useRenamePlanModal({
    activePlan,
    setActivePlan,
    loadPlans: nav.loadPlans,
    setNotice,
    reportSaveError: nav.reportSaveError,
  })

  useEffect(() => {
    void storage.restoreSavedPlans().catch((e) => setNotice({ kind: 'error', text: errorMessage(e) }))
    void prefs.loadSitePreferences()
  }, [])
  useEffect(() => { activePlanRef.current = activePlan }, [activePlan])
  useEffect(() => {
    if (!achievement) return
    const timer = window.setTimeout(() => setAchievement(null), 2400)
    return () => window.clearTimeout(timer)
  }, [achievement])

  useExternalSync({ screen, activePlan, setActivePlan, setPlans, setNotice, setAchievement, errorMessage })
  useKeyboardNavigation({
    plans,
    activePlan,
    activeModal: createModal.isOpen ? 'create' : renameModal.renamePlan ? 'rename' : null,
    modalDirty: createModal.isDirty || renameModal.isDirty,
    helpTopicId,
    isMapMenuOpen: planDraft.isMapMenuOpen,
    selectedNodeId,
    onOpenAdjacentPlan: nav.openAdjacentPlan,
    onCloseActiveModal: () => { createModal.closeCreateModal(); renameModal.closeRenameModal() },
    onCloseHelpTopic: () => setHelpTopicId(null),
    onCloseMapMenu: planDraft.closeMapMenu,
  })

  const sortedPlans = getSortedPlans(plans)
  const activePlanIndex = activePlan ? plans.findIndex((p) => p.id === activePlan.id) : -1

  return (
    <div className={`app-shell screen-${screen} theme-${screen === 'map' ? planDraft.theme : 'fire'}`}>
      <Header
        activePlan={activePlan}
        onGoCreate={createModal.openCreateModal}
        onGoHelpList={() => setScreen('help')}
        onGoHome={nav.goHome}
        onOpenPlan={(plan) => void nav.openPlan(plan)}
        onSelectHelpTopic={setHelpTopicId}
        plans={sortedPlans}
        screen={screen}
      />

      <NoticeStack notices={notices} onDismiss={dismissNotice} />

      {screen === 'home' && (
        <HomeScreen
          needsDirectoryPermission={storage.needsDirectoryPermission}
          onDeletePlan={(plan) => void storage.handleDeletePlan(plan)}
          onGoCreate={createModal.openCreateModal}
          onInstallEntry={(plan) => void storage.installEntryForPlan(plan)}
          onOpenPlan={(plan) => void nav.openPlan(plan)}
          onReopenFromDirectory={() => void storage.reopenFromDirectory()}
          onRestoreSavedPlans={() => void storage.restoreSavedPlans(true).catch((e) => setNotice({ kind: 'error', text: errorMessage(e) }))}
          onStartRename={renameModal.startRename}
          onToggleFavorite={(plan) => void toggleFavorite(plan)}
          planPreferences={planPreferences}
          plans={plans}
          sortedPlans={sortedPlans}
        />
      )}

      {screen === 'help' && <HelpScreen onSelectTopic={setHelpTopicId} />}

      {screen === 'map' && activePlan && (
        <MapScreen
          activePlan={activePlan}
          completedNodes={activePlan.nodes.filter((n) => n.status === 'completed').length}
          hasNextPlan={activePlanIndex >= 0 && activePlanIndex < plans.length - 1}
          hasPreviousPlan={activePlanIndex > 0}
          initialViewPosition={planPreferences[activePlan.id]?.viewPosition}
          isMapMenuOpen={planDraft.isMapMenuOpen}
          mapFinalGoalDescription={planDraft.mapFinalGoalDescription}
          mapFinalGoalName={planDraft.mapFinalGoalName}
          mapPlanDeadline={planDraft.mapPlanDeadline}
          mapPlanName={planDraft.mapPlanName}
          mapPlanSaveStatus={planDraft.mapPlanSaveStatus}
          onAddEdge={operations.addEdge}
          onClearSelection={() => setSelectedNodeId(null)}
          onCloseMapMenu={planDraft.closeMapMenu}
          onCreateNode={operations.createNode}
          onDeleteEdge={operations.deleteEdge}
          onDeleteNode={operations.deleteNode}
          onOpenAdjacentPlan={nav.openAdjacentPlan}
          onOpenMapMenu={planDraft.openMapMenu}
          onSelectNode={setSelectedNodeId}
          onSwapEdgeNodes={operations.swapEdgeNodes}
          onUpdateMapPlanDraft={planDraft.updateMapPlanDraft}
          onUpdateNode={operations.updateNode}
          onUpdateTheme={planDraft.updatePlanTheme}
          onViewPositionChange={saveViewPosition}
          selectedNodeId={selectedNodeId}
          showRemainingDays={prefs.showRemainingDays}
          onChangeDateFormat={prefs.updateDateFormat}
          theme={planDraft.theme}
        />
      )}

      <AppModals
        activeHelpTopic={helpTopics.find((t) => t.id === helpTopicId) ?? null}
        createModal={createModal}
        onCloseHelpTopic={() => setHelpTopicId(null)}
        renameModal={renameModal}
        storage={storage}
      />

      <AchievementToast achievement={achievement} />
    </div>
  )
}
