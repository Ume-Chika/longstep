import { CreatePlanModal } from './modals/CreatePlanModal'
import { RenamePlanModal } from './modals/RenamePlanModal'
import { HelpModal } from './modals/HelpModal'
import type { HelpTopic } from '../types/app'
import type { useCreatePlanModal } from '../hooks/useCreatePlanModal'
import type { useRenamePlanModal } from '../hooks/useRenamePlanModal'
import type { usePlanStorage } from '../hooks/usePlanStorage'

interface AppModalsProps {
  createModal: ReturnType<typeof useCreatePlanModal>
  renameModal: ReturnType<typeof useRenamePlanModal>
  storage: ReturnType<typeof usePlanStorage>
  activeHelpTopic: HelpTopic | null
  onCloseHelpTopic: () => void
}

export function AppModals({
  createModal,
  renameModal,
  storage,
  activeHelpTopic,
  onCloseHelpTopic,
}: AppModalsProps) {
  return (
    <>
      {createModal.isOpen && (
        <CreatePlanModal
          errors={createModal.createErrors}
          form={createModal.createForm}
          isBusy={createModal.isBusy}
          longstepDirectory={storage.longstepDirectory}
          onChangeField={createModal.updateForm}
          onClose={() => createModal.closeCreateModal()}
          onSelectLongstepDir={() => void storage.selectLongstepDirectory()}
          onSelectProjectDir={() => void storage.selectProjectDirectory()}
          onSubmit={createModal.handleCreateSubmit}
          projectDirectory={storage.projectDirectory}
        />
      )}

      {renameModal.renamePlan && (
        <RenamePlanModal
          currentName={renameModal.renamePlan.name}
          isBusy={renameModal.isBusy}
          onChangeValue={renameModal.updateRenameValue}
          onClose={() => renameModal.closeRenameModal()}
          onConfirm={() => void renameModal.confirmRename()}
          value={renameModal.renameValue}
        />
      )}

      {activeHelpTopic && (
        <HelpModal onClose={onCloseHelpTopic} topic={activeHelpTopic} />
      )}
    </>
  )
}
