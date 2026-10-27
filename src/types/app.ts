import type { ReactNode } from 'react'

export type Screen = 'home' | 'map' | 'help'

export type DateFormat = 'deadline' | 'remaining'

export type Notice = {
  id: number
  kind: 'success' | 'error'
  text: string
}

export type AppModal = 'create' | 'rename'

export interface CreateForm {
  planName: string
}

export type CreateErrorField = 'planName' | 'longstepDirectory'

export type CreateErrors = Partial<Record<CreateErrorField, string>>

export interface HelpStep {
  title: string
  body: ReactNode
}

export interface HelpTopic {
  id: string
  label: string
  summary: string
  heading: string
  steps: HelpStep[]
}
