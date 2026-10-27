import type { PlanSnapshot } from '../models/plan'
import { themeOptions } from '../models/theme'
import type { ThemeId } from '../models/theme'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '予期しないエラーが発生しました。'
}

export function randomTheme(): ThemeId {
  return themeOptions[Math.floor(Math.random() * themeOptions.length)].id
}

export function createEmptyPlan(name = '名称未設定の計画', theme: ThemeId = 'fire'): PlanSnapshot {
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
