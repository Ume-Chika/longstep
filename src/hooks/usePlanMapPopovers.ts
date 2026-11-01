import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

export function usePlanMapPopovers(
  edgeQuickActionRef: RefObject<HTMLElement | null>,
  viewOptionsRef: RefObject<HTMLElement | null>,
) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isViewOptionsOpen, setIsViewOptionsOpen] = useState(false)

  useEffect(() => {
    if (!selectedEdgeId) return

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target && (edgeQuickActionRef.current?.contains(target) || target.closest('.map-edge-group'))) {
        return
      }
      setSelectedEdgeId(null)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedEdgeId(null)
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [edgeQuickActionRef, selectedEdgeId])

  useEffect(() => {
    if (!isViewOptionsOpen) return

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target && viewOptionsRef.current?.contains(target)) return
      setIsViewOptionsOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsViewOptionsOpen(false)
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isViewOptionsOpen, viewOptionsRef])

  return {
    selectedEdgeId,
    setSelectedEdgeId,
    isViewOptionsOpen,
    setIsViewOptionsOpen,
  }
}
