export type PlanStatus = 'not_started' | 'completed'
export type GoalLevel = 'major' | 'middle' | 'minor' | 'loop'

export interface PlanRecurrence {
  enabled: boolean
  cadence: string
  completedCount: number
}

export interface PlanGoal {
  statement: string
  deadline: string
  successCriteria: string[]
}

export interface PlanCustomField {
  id: string
  label: string
  type: string
  value: unknown
  includeInPrompt: boolean
}

export interface PlanNode {
  id: string
  name: string
  status: PlanStatus
  targetDate: string
  description: string
  nextAction: string
  dependsOn: string[]
  goalLevel?: GoalLevel
  recurrence?: PlanRecurrence
}

export interface NewPlanNodeInput {
  name: string
  targetDate: string
  description: string
  nextAction: string
}

export interface NodeInsertionEdge {
  fromId: string
  toId: string
  toFinal: boolean
}

export interface NodeInsertionPrerequisite {
  prerequisiteForId: string
}

export type NodeInsertion = NodeInsertionEdge | NodeInsertionPrerequisite

export interface PlanMeta {
  revision: number
  createdAt: string
  updatedAt: string
}

export interface PlanSnapshot {
  formatVersion: 1
  kind: 'plan'
  id: string
  name: string
  goal: PlanGoal
  customFields: PlanCustomField[]
  nodes: PlanNode[]
  meta: PlanMeta
}

export type PlanPatchOperation =
  | { op: 'update_node'; id: string; changes: Partial<Omit<PlanNode, 'id'>> }
  | { op: 'add_node'; node: Partial<PlanNode> & Pick<PlanNode, 'name'> }

export interface PlanPatch {
  formatVersion: 1
  kind: 'plan_patch'
  planId: string
  baseRevision: number
  operations: PlanPatchOperation[]
}

export interface NodePatch {
  kind: 'node_patch'
  nodeId: string
  changes: Partial<Pick<PlanNode, 'name' | 'status' | 'targetDate' | 'description' | 'nextAction'>>
}
