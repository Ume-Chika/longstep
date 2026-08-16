import type { ThemeId } from './theme'

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
  /** 計画の配色。ブラウザをまたいで共有するため、共有JSONに持たせる。 */
  theme: ThemeId
}

export interface PlanSnapshot {
  id: string
  name: string
  goal: PlanGoal
  nodes: PlanNode[]
  meta: PlanMeta
}
