import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanNode } from '../models/plan'

export function usePlanMapNodeDraft(
  selectedNode: PlanNode | undefined,
  onUpdateNode: (node: PlanNode) => Promise<boolean>,
  onClearSelection: () => void,
) {
  const [draftNode, setDraftNode] = useState<PlanNode | undefined>(selectedNode)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const draftDirtyRef = useRef(false)

  const flushDraft = useCallback((immediateDraft?: PlanNode) => {
    const nodeToSave = immediateDraft ?? draftNode
    if (!nodeToSave || !draftDirtyRef.current) return
    draftDirtyRef.current = false
    setAutoSaveStatus('saving')
    void onUpdateNode(nodeToSave).then((saved) => setAutoSaveStatus(saved ? 'saved' : 'error'))
  }, [draftNode, onUpdateNode])

  useEffect(() => {
    draftDirtyRef.current = false
    setDraftNode(selectedNode)
    setAutoSaveStatus('saved')
  }, [selectedNode])

  useEffect(() => {
    if (!draftNode || !draftDirtyRef.current) return
    const timer = window.setTimeout(() => flushDraft(), 1500)
    return () => window.clearTimeout(timer)
  }, [draftNode, flushDraft])

  const updateDraft = useCallback(<K extends keyof PlanNode>(key: K, value: PlanNode[K], flushImmediately = false) => {
    if (!draftNode) return
    const next = { ...draftNode, [key]: value }
    draftDirtyRef.current = true
    setAutoSaveStatus('saving')
    setDraftNode(next)
    if (flushImmediately) flushDraft(next)
  }, [draftNode, flushDraft])

  const toggleCompletion = useCallback(() => {
    if (!draftNode) return
    if (draftNode.status === 'completed') {
      draftDirtyRef.current = true
      setDraftNode({ ...draftNode, status: 'not_started' })
      flushDraft({ ...draftNode, status: 'not_started' })
    } else {
      draftDirtyRef.current = false
      void onUpdateNode({ ...draftNode, status: 'completed' })
      onClearSelection()
    }
  }, [draftNode, flushDraft, onClearSelection, onUpdateNode])

  const closeDetail = useCallback(() => {
    flushDraft()
    onClearSelection()
  }, [flushDraft, onClearSelection])

  return {
    draftNode,
    autoSaveStatus,
    flushDraft,
    updateDraft,
    toggleCompletion,
    closeDetail,
  }
}
