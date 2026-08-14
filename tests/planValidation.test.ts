import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlanSnapshot } from '../src/models/plan.ts'
import { applyNodePatch, applyPlanPatch, parsePlanImportText } from '../src/schemas/planValidation.ts'

const plan: PlanSnapshot = {
  formatVersion: 1,
  kind: 'plan',
  id: 'plan-1',
  name: '確認用計画',
  goal: { statement: '目標', deadline: '2026-12-31', successCriteria: ['完了'] },
  customFields: [],
  nodes: [{
    id: 'node-1',
    name: '開始',
    status: 'not_started',
    targetDate: '2026-09-01',
    description: '',
    nextAction: '',
    dependsOn: [],
    goalLevel: 'minor',
    recurrence: { enabled: false, cadence: '', completedCount: 0 },
  }],
  meta: { revision: 2, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
}

test('全体JSONを前置き文章とコードブロックから読み込む', () => {
  const parsed = parsePlanImportText(`回答です。\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)
  assert.equal(parsed.kind, 'plan')
  if (parsed.kind === 'plan') assert.equal(parsed.plan.id, 'plan-1')
})

test('部分更新JSONの更新と追加を反映する', () => {
  const parsed = parsePlanImportText(JSON.stringify({
    kind: 'plan_patch',
    planId: 'plan-1',
    baseRevision: 2,
    operations: [
      { op: 'update_node', id: 'node-1', changes: { status: 'completed' } },
      { op: 'add_node', node: { id: 'node-2', name: '次の目標', dependsOn: ['node-1'], goalLevel: 'minor' } },
    ],
  }))
  assert.equal(parsed.kind, 'plan_patch')
  if (parsed.kind !== 'plan_patch') return
  const updated = applyPlanPatch(plan, parsed.patch)
  assert.equal(updated.nodes[0].status, 'completed')
  assert.equal(updated.nodes[1].name, '次の目標')
  assert.equal(updated.meta.revision, 3)
})

test('部分更新JSONのrevision不一致を拒否する', () => {
  const parsed = parsePlanImportText(JSON.stringify({
    kind: 'plan_patch',
    planId: 'plan-1',
    baseRevision: 1,
    operations: [{ op: 'update_node', id: 'node-1', changes: { status: 'completed' } }],
  }))
  if (parsed.kind !== 'plan_patch') return
  assert.throws(() => applyPlanPatch(plan, parsed.patch), /baseRevisionを2/)
})

test('相談プロンプトが生成する目標部分更新JSONを反映する', () => {
  const parsed = parsePlanImportText(JSON.stringify({
    kind: 'node_patch',
    nodeId: 'node-1',
    changes: {
      name: '主要導線の検証結果をMVP仕様へ反映',
      targetDate: '2026-08-18',
      description: 'MVP仕様の修正が必要な項目と未決事項が整理されている。',
      nextAction: '検証記録からMVP仕様に影響する問題を1件抽出する。',
    },
  }))

  assert.equal(parsed.kind, 'node_patch')
  if (parsed.kind !== 'node_patch') return
  const updated = applyNodePatch(plan, parsed.patch)
  assert.equal(updated.nodes[0].name, '主要導線の検証結果をMVP仕様へ反映')
  assert.equal(updated.nodes[0].targetDate, '2026-08-18')
  assert.deepEqual(updated.nodes[0].dependsOn, [])
  assert.equal(updated.meta.revision, 3)
})
