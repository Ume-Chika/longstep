import { useEffect } from 'react'
import type { PlanSnapshot } from '../models/plan'
import type { AppModal } from '../types/app'

interface UseKeyboardNavigationParams {
  plans: PlanSnapshot[]
  activePlan: PlanSnapshot | null
  activeModal: AppModal | null
  modalDirty: boolean
  helpTopicId: string | null
  isMapMenuOpen: boolean
  selectedNodeId: string | null
  onOpenAdjacentPlan: (offset: -1 | 1) => void
  onCloseActiveModal: () => void
  onCloseHelpTopic: () => void
  onCloseMapMenu: () => void
}

export function useKeyboardNavigation({
  plans,
  activePlan,
  activeModal,
  modalDirty,
  helpTopicId,
  isMapMenuOpen,
  selectedNodeId,
  onOpenAdjacentPlan,
  onCloseActiveModal,
  onCloseHelpTopic,
  onCloseMapMenu,
}: UseKeyboardNavigationParams) {
  useEffect(() => {
    if (!isMapMenuOpen) return
    function closeMenu(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseMapMenu()
    }
    window.addEventListener('keydown', closeMenu)
    return () => window.removeEventListener('keydown', closeMenu)
  }, [isMapMenuOpen, onCloseMapMenu])

  useEffect(() => {
    if (!activeModal) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (modalDirty && !window.confirm('未保存の入力があります。閉じてもよいですか？')) return
      onCloseActiveModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [activeModal, modalDirty, onCloseActiveModal])

  useEffect(() => {
    if (!helpTopicId) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseHelpTopic()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [helpTopicId, onCloseHelpTopic])

  useEffect(() => {
    function handleArrowKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (activeModal || helpTopicId || isMapMenuOpen || selectedNodeId) return

      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return
      }

      if (plans.length <= 1) return
      onOpenAdjacentPlan(event.key === 'ArrowRight' ? 1 : -1)
    }

    window.addEventListener('keydown', handleArrowKey)
    return () => window.removeEventListener('keydown', handleArrowKey)
  }, [activeModal, helpTopicId, isMapMenuOpen, selectedNodeId, plans, activePlan, onOpenAdjacentPlan])
}
