import type {
  PlanCustomField,
  PlanNode,
  PlanSnapshot,
  PlanStatus,
} from '../models/plan'

type RecordValue = Record<string, unknown>

const statuses: PlanStatus[] = ['not_started', 'in_progress', 'completed']

function asRecord(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSONのルートはオブジェクトである必要があります。')
  }

  return value as RecordValue
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function now(): string {
  return new Date().toISOString()
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  throw new Error('JSONオブジェクトを見つけられませんでした。')
}

function normalizeCustomFields(value: unknown): PlanCustomField[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const field = asRecord(item)

    return {
      id: asString(field.id, createId('field')),
      label: asString(field.label, 'カスタム項目'),
      type: asString(field.type, 'text'),
      value: field.value ?? '',
      includeInPrompt: field.includeInPrompt !== false,
    }
  })
}

function normalizeNode(value: unknown, index: number, deadline: string): PlanNode {
  const node = asRecord(value)
  const rawStatus = asString(node.status, 'not_started') as PlanStatus
  const status = statuses.includes(rawStatus) ? rawStatus : 'not_started'
  const rawProgress = typeof node.progress === 'number' ? node.progress : 0

  return {
    id: asString(node.id, createId(`node-${index + 1}`)),
    name: asString(node.name, `中間目標${index + 1}`),
    status,
    progress: Math.min(100, Math.max(0, Math.round(rawProgress))),
    targetDate: asString(node.targetDate, deadline),
    description: asString(node.description),
    nextAction: asString(node.nextAction),
    difficulty: asString(node.difficulty, '未設定'),
    difficultySetAt: asString(node.difficultySetAt, today()),
    dependsOn: Array.isArray(node.dependsOn)
      ? node.dependsOn.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

export function normalizePlan(input: unknown): PlanSnapshot {
  const root = asRecord(input)
  const rawGoal = asRecord(root.goal)
  const statement = asString(rawGoal.statement).trim()

  if (!statement) {
    throw new Error('最終目標（goal.statement）が必要です。')
  }

  if (!Array.isArray(root.nodes) || root.nodes.length === 0) {
    throw new Error('中間目標ノード（nodes）が1件以上必要です。')
  }

  const deadline = asString(rawGoal.deadline)
  const timestamp = now()
  const rawMeta = root.meta && typeof root.meta === 'object'
    ? root.meta as RecordValue
    : {}
  const rawRevision = typeof rawMeta.revision === 'number' ? rawMeta.revision : 1

  return {
    formatVersion: 1,
    kind: 'plan',
    id: asString(root.id, createId('plan')),
    name: asString(root.name, '名称未設定の計画'),
    goal: {
      statement,
      deadline,
      successCriteria: Array.isArray(rawGoal.successCriteria)
        ? rawGoal.successCriteria.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0,
          )
        : [],
    },
    customFields: normalizeCustomFields(root.customFields),
    nodes: root.nodes.map((node, index) => normalizeNode(node, index, deadline)),
    meta: {
      revision: Math.max(1, Math.floor(rawRevision)),
      createdAt: asString(rawMeta.createdAt, timestamp),
      updatedAt: timestamp,
    },
  }
}

export function parsePlanText(text: string): PlanSnapshot {
  let parsed: unknown

  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('JSONの形式を読み取れませんでした。')
    }

    throw error
  }

  return normalizePlan(parsed)
}
