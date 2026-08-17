import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlanSnapshot } from '../src/models/plan.ts'
import { deletePlan, listPlans, PlanConflictError, savePlan, setPlanDirectoryHandle } from '../src/db/planStore.ts'

class MemoryFileHandle {
  readonly kind = 'file'
  readonly name: string
  private files: Map<string, string>

  constructor(name: string, files: Map<string, string>) {
    this.name = name
    this.files = files
  }

  async getFile(): Promise<File> {
    return new File([this.files.get(this.name) ?? ''], this.name)
  }

  async createWritable() {
    let value = ''
    return {
      write: async (data: string) => { value = data },
      close: async () => { this.files.set(this.name, value) },
      abort: async () => undefined,
    }
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory'
  readonly name = 'Longstep'
  private files = new Map<string, string>()

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandle> {
    if (!options?.create && !this.files.has(name)) throw new DOMException('Not found', 'NotFoundError')
    return new MemoryFileHandle(name, this.files)
  }

  async removeEntry(name: string): Promise<void> {
    this.files.delete(name)
  }

  async *values(): AsyncIterableIterator<MemoryFileHandle> {
    for (const name of this.files.keys()) yield new MemoryFileHandle(name, this.files)
  }
}

function createPlan(id: string, revision = 0): PlanSnapshot {
  const timestamp = `2026-08-17T00:00:0${revision}.000Z`
  return {
    id,
    name: id,
    goal: { statement: '', deadline: '', successCriteria: [] },
    nodes: [],
    meta: { revision, createdAt: timestamp, updatedAt: timestamp, theme: 'fire' },
  }
}

test('選択フォルダ内で複数計画を作成・一覧表示・更新・削除できる', async () => {
  const directory = new MemoryDirectoryHandle()
  setPlanDirectoryHandle(directory as unknown as FileSystemDirectoryHandle)

  await savePlan(createPlan('plan-1'))
  await savePlan(createPlan('plan-2'))
  await savePlan(createPlan('plan-1', 1))

  assert.deepEqual((await listPlans()).map((plan) => [plan.id, plan.meta.revision]), [
    ['plan-1', 1],
    ['plan-2', 0],
  ])

  await assert.rejects(
    savePlan({ ...createPlan('plan-1', 1), name: '古いWeb編集' }),
    PlanConflictError,
  )
  assert.equal((await listPlans())[0].name, 'plan-1')

  await deletePlan('plan-2')
  assert.deepEqual((await listPlans()).map((plan) => plan.id), ['plan-1'])

  setPlanDirectoryHandle(null)
  setPlanDirectoryHandle(directory as unknown as FileSystemDirectoryHandle)
  assert.deepEqual((await listPlans()).map((plan) => plan.id), ['plan-1'])
})
