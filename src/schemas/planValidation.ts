import type {
  PlanCustomField,
  GoalLevel,
  PlanNode,
  PlanRecurrence,
  NodePatch,
  PlanPatch,
  PlanPatchOperation,
  PlanSnapshot,
  PlanStatus,
} from '../models/plan'

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
    nodes: inferGoalLevels(root.nodes.map((node, index) => normalizeNode(node, index, deadline))),
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

export type ParsedPlanImport =
  | { kind: 'plan'; plan: PlanSnapshot }
  | { kind: 'plan_patch'; patch: PlanPatch }
  | { kind: 'node_patch'; patch: NodePatch }

function normalizeNodePatch(input: unknown): NodePatch {
  const root = asRecord(input)
  const nodeId = asString(root.nodeId).trim()
  if (!nodeId) throw new Error('目標部分更新JSONにはnodeIdが必要です。')

  const source = asRecord(root.changes)
  const fields = ['name', 'status', 'targetDate', 'description', 'nextAction'] as const
  if (!fields.some((field) => field in source)) {
    throw new Error('適用できる目標情報が見つかりませんでした。')
  }

  const changes: NodePatch['changes'] = {}
  if ('name' in source) changes.name = asString(source.name).trim()
  if ('status' in source) changes.status = asString(source.status) as PlanStatus
  if ('targetDate' in source) changes.targetDate = asString(source.targetDate)
  if ('description' in source) changes.description = asString(source.description)
  if ('nextAction' in source) changes.nextAction = asString(source.nextAction)

  return { kind: 'node_patch', nodeId, changes }
}

function normalizePatch(input: unknown): PlanPatch {
  const root = asRecord(input)
  const planId = asString(root.planId).trim()
  if (!planId) throw new Error('部分更新JSONにはplanIdが必要です。')
  if (!Array.isArray(root.operations) || root.operations.length === 0) {
    throw new Error('部分更新JSONにはoperationsが1件以上必要です。')
  }

  const operations = root.operations.map<PlanPatchOperation>((value) => {
    const operation = asRecord(value)
    if (operation.op === 'update_node') {
      const id = asString(operation.id).trim()
      if (!id) throw new Error('update_nodeには更新対象のidが必要です。')
      const changes = asRecord(operation.changes)
      delete changes.id
      return { op: 'update_node', id, changes: changes as Partial<Omit<PlanNode, 'id'>> }
    }
    if (operation.op === 'add_node') {
      const node = asRecord(operation.node)
      const name = asString(node.name).trim()
      if (!name) throw new Error('add_nodeには目標名が必要です。')
      return { op: 'add_node', node: { ...node, name } as Partial<PlanNode> & Pick<PlanNode, 'name'> }
    }
    throw new Error('operationsのopはupdate_node・add_nodeのいずれかにしてください。')
  })
  const revision = typeof root.baseRevision === 'number' ? Math.floor(root.baseRevision) : Number.NaN
  if (!Number.isFinite(revision)) throw new Error('部分更新JSONには数値のbaseRevisionが必要です。')

  return { formatVersion: 1, kind: 'plan_patch', planId, baseRevision: revision, operations }
}

export function parsePlanImportText(text: string): ParsedPlanImport {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('JSONの形式を読み取れませんでした。')
    throw error
  }
  const root = asRecord(parsed)
  if (root.kind === 'plan_patch') return { kind: 'plan_patch', patch: normalizePatch(root) }
  if (root.kind === 'node_patch') return { kind: 'node_patch', patch: normalizeNodePatch(root) }
  return { kind: 'plan', plan: normalizePlan(root) }
}

export function applyPlanPatch(plan: PlanSnapshot, patch: PlanPatch): PlanSnapshot {
  if (patch.planId !== plan.id) throw new Error('更新対象の計画IDが一致しません。対象の計画を開いてください。')
  if (patch.baseRevision !== plan.meta.revision) {
    throw new Error(`計画が更新されています。最新のJSONを書き出し、baseRevisionを${plan.meta.revision}にして再作成してください。`)
  }

  let nodes = [...plan.nodes]
  patch.operations.forEach((operation, index) => {
    if (operation.op === 'update_node') {
      const targetIndex = nodes.findIndex((node) => node.id === operation.id)
      if (targetIndex < 0) throw new Error(`更新対象「${operation.id}」が見つかりません。対象IDを確認してください。`)
      nodes[targetIndex] = normalizeNode({ ...nodes[targetIndex], ...operation.changes, id: operation.id }, index, plan.goal.deadline)
      return
    }

    const candidate = normalizeNode(operation.node, nodes.length, plan.goal.deadline)
    if (nodes.some((node) => node.id === candidate.id)) {
      throw new Error(`追加する目標ID「${candidate.id}」は使用済みです。別のIDにしてください。`)
    }
    nodes.push(candidate)
  })

  const timestamp = now()
  return {
    ...plan,
    nodes: inferGoalLevels(nodes),
    meta: {
      ...plan.meta,
      revision: plan.meta.revision + 1,
      updatedAt: timestamp,
    },
  }
}

export function applyNodePatch(plan: PlanSnapshot, patch: NodePatch): PlanSnapshot {
  const targetIndex = plan.nodes.findIndex((node) => node.id === patch.nodeId)
  if (targetIndex < 0) {
    throw new Error(`更新対象「${patch.nodeId}」が現在の計画書に見つかりません。`)
  }

  const nodes = [...plan.nodes]
  nodes[targetIndex] = parseNodeUpdateText(JSON.stringify(patch), nodes[targetIndex])

  return {
    ...plan,
    nodes,
    meta: {
      ...plan.meta,
      revision: plan.meta.revision + 1,
      updatedAt: now(),
    },
  }
}

export function parseNodeUpdateText(text: string, currentNode: PlanNode): PlanNode {
  let parsed: unknown

  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('目標情報JSONの形式を読み取れませんでした。')
    }

    throw error
  }

  const root = asRecord(parsed)
  const source = root.changes && typeof root.changes === 'object' && !Array.isArray(root.changes)
    ? asRecord(root.changes)
    : root.node && typeof root.node === 'object' && !Array.isArray(root.node)
      ? asRecord(root.node)
      : root

  if (typeof root.nodeId === 'string' && root.nodeId !== currentNode.id) {
    throw new Error('別の目標のJSONは適用できません。')
  }
  if (typeof source.id === 'string' && source.id !== currentNode.id) {
    throw new Error('別の目標のJSONは適用できません。')
  }

  const fieldNames = [
    'name',
    'status',
    'targetDate',
    'description',
    'nextAction',
  ]
  if (!fieldNames.some((fieldName) => fieldName in source)) {
    throw new Error('適用できる目標情報が見つかりませんでした。')
  }

  const status = source.status === undefined
    ? currentNode.status
    : asString(source.status) as PlanStatus
  if (!statuses.includes(status)) {
    throw new Error('statusはnot_started・completedのいずれかにしてください。')
  }

  const name = source.name === undefined ? currentNode.name : asString(source.name).trim()
  if (!name) {
    throw new Error('nameは空にできません。')
  }

  return {
    ...currentNode,
    name,
    status,
    targetDate: source.targetDate === undefined ? currentNode.targetDate : asString(source.targetDate),
    description: source.description === undefined ? currentNode.description : asString(source.description),
    nextAction: source.nextAction === undefined ? currentNode.nextAction : asString(source.nextAction),
    dependsOn: currentNode.dependsOn,
  }
}
