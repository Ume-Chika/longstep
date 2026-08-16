import type {
  GoalLevel,
  PlanNode,
  PlanRecurrence,
  PlanSnapshot,
  PlanStatus,
} from '../models/plan'
import { isThemeId } from '../models/theme.ts'

type RecordValue = Record<string, unknown>

const statuses: PlanStatus[] = ['not_started', 'completed']
const goalLevels: GoalLevel[] = ['major', 'middle', 'minor', 'loop']

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

function now(): string {
  return new Date().toISOString()
}

function isGoalLevel(value: unknown): value is GoalLevel {
  return typeof value === 'string' && goalLevels.includes(value as GoalLevel)
}

function normalizeRecurrence(value: unknown): PlanRecurrence {
  const recurrence = value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : {}
  const rawCompletedCount = typeof recurrence.completedCount === 'number'
    ? recurrence.completedCount
    : Number(recurrence.completedCount)

  return {
    enabled: recurrence.enabled === true,
    cadence: asString(recurrence.cadence),
    completedCount: Number.isFinite(rawCompletedCount)
      ? Math.max(0, Math.floor(rawCompletedCount))
      : 0,
  }
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

function normalizeNode(value: unknown, index: number, deadline: string): PlanNode {
  const node = asRecord(value)
  const rawStatus = asString(node.status, 'not_started') as PlanStatus
  const status = statuses.includes(rawStatus) ? rawStatus : 'not_started'

  return {
    id: asString(node.id, createId(`node-${index + 1}`)),
    name: asString(node.name, `中間目標${index + 1}`),
    status,
    targetDate: asString(node.targetDate, deadline),
    description: asString(node.description),
    nextAction: asString(node.nextAction),
    dependsOn: Array.isArray(node.dependsOn)
      ? node.dependsOn.filter((id): id is string => typeof id === 'string')
      : [],
    goalLevel: isGoalLevel(node.goalLevel) ? node.goalLevel : undefined,
    recurrence: normalizeRecurrence(node.recurrence),
  }
}

function inferGoalLevels(nodes: PlanNode[]): PlanNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const depths = new Map<string, number>()
  const visiting = new Set<string>()

  function getDepth(nodeId: string): number {
    const cached = depths.get(nodeId)
    if (cached !== undefined) return cached
    if (visiting.has(nodeId)) return 0

    const node = nodesById.get(nodeId)
    if (!node) return 0

    visiting.add(nodeId)
    const dependencyDepths = node.dependsOn
      .filter((dependencyId) => nodesById.has(dependencyId))
      .map(getDepth)
    visiting.delete(nodeId)

    const depth = dependencyDepths.length > 0 ? Math.max(...dependencyDepths) + 1 : 0
    depths.set(nodeId, depth)
    return depth
  }

  nodes.forEach((node) => getDepth(node.id))
  const maximumDepth = Math.max(0, ...depths.values())
  const hasExplicitLevel = nodes.some((node) => node.goalLevel !== undefined)

  return nodes.map((node) => {
    if (hasExplicitLevel && node.goalLevel) return node

    const depth = depths.get(node.id) ?? 0
    const goalLevel: GoalLevel = maximumDepth === 0 || depth === 0
      ? 'major'
      : depth === maximumDepth
        ? 'minor'
        : 'middle'

    return { ...node, goalLevel }
  })
}

export function normalizePlan(input: unknown): PlanSnapshot {
  const root = asRecord(input)
  const rawGoal = asRecord(root.goal)
  const statement = asString(rawGoal.statement).trim()
  const name = asString(root.name).trim()

  if (!name) {
    throw new Error('計画名（name）が必要です。')
  }

  if (!Array.isArray(root.nodes)) {
    throw new Error('中間目標ノード（nodes）は配列である必要があります。')
  }

  const deadline = asString(rawGoal.deadline)
  const timestamp = now()
  const rawMeta = root.meta && typeof root.meta === 'object'
    ? root.meta as RecordValue
    : {}
  const rawRevision = typeof rawMeta.revision === 'number' ? rawMeta.revision : 0

  return {
    id: asString(root.id, createId('plan')),
    name,
    goal: {
      statement,
      deadline,
      successCriteria: Array.isArray(rawGoal.successCriteria)
        ? rawGoal.successCriteria.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0,
          )
        : [],
    },
    nodes: inferGoalLevels(root.nodes.map((node, index) => normalizeNode(node, index, deadline))),
    meta: {
      revision: Math.max(0, Math.floor(rawRevision)),
      createdAt: asString(rawMeta.createdAt, timestamp),
      updatedAt: asString(rawMeta.updatedAt, timestamp),
      theme: isThemeId(rawMeta.theme) ? rawMeta.theme : 'fire',
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
