export type PlanStatus = 'not_started' | 'in_progress' | 'completed'

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
  progress: number
  targetDate: string
  description: string
  nextAction: string
  difficulty: string
  difficultySetAt: string
  dependsOn: string[]
}

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
