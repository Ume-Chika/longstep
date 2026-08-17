import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlanNode } from '../src/models/plan.ts'
import {
  actionableGoalIds,
  collapsibleCompletedIds,
  coversAtLeastHalfTarget,
  effectiveTargetDate,
  insertPlanNode,
  overflowingPrerequisiteIds,
  relatedNodeIds,
  swapNodesInColumn,
  swapNodesOnEdge,
} from '../src/components/planMapLogic.ts'

const node = (id: string, overrides: Partial<PlanNode> = {}): PlanNode => ({
  id,
  name: id,
  status: 'not_started',
  targetDate: '2026-08-20',
  description: '',
  nextAction: '',
  dependsOn: [],
  goalLevel: 'minor',
  recurrence: { enabled: false, cadence: '', completedCount: 0 },
  ...overrides,
})

test('着手可能な小・中・大目標から期日順に3件だけ返す', () => {
  const nodes = [
    node('done', { status: 'completed', targetDate: '2026-08-01' }),
    node('late', { dependsOn: ['done'], targetDate: '2026-08-10' }),
    node('soon', { dependsOn: ['done'], targetDate: '2026-08-11' }),
    node('third', { dependsOn: ['done'], targetDate: '2026-08-12' }),
    node('fourth', { dependsOn: ['done'], targetDate: '2026-08-13' }),
    node('major', { goalLevel: 'major', dependsOn: ['done'], targetDate: '2026-08-09' }),
    node('middle', { goalLevel: 'middle', dependsOn: ['done'], targetDate: '2026-08-11' }),
    node('loop', { goalLevel: 'loop', dependsOn: ['done'], targetDate: '2026-08-08' }),
  ]
  assert.deepEqual(actionableGoalIds(nodes, '2026-08-08'), ['major', 'late', 'soon'])
})

test('前提が未達成または見つからない大目標はハイライトしない', () => {
  const nodes = [
    node('done', { status: 'completed' }),
    node('pending', { goalLevel: 'loop' }),
    node('ready-major', { goalLevel: 'major', dependsOn: ['done'], targetDate: '2026-08-10' }),
    node('blocked-major', { goalLevel: 'major', dependsOn: ['pending'], targetDate: '2026-08-08' }),
    node('orphan-major', { goalLevel: 'major', dependsOn: ['missing'], targetDate: '2026-08-09' }),
  ]

  assert.deepEqual(actionableGoalIds(nodes, '2026-08-08'), ['ready-major'])
})

test('期限未設定は最も遅い前提日の翌日を目安にする', () => {
  const dependencies = [node('a', { targetDate: '2026-08-10' }), node('b', { targetDate: '2026-08-12' })]
  const target = node('target', { targetDate: '', dependsOn: ['a', 'b'] })
  const result = effectiveTargetDate(target, new Map([...dependencies, target].map((item) => [item.id, item])), '2026-08-01')
  assert.deepEqual(result, { date: '2026-08-13', estimated: true })
})

test('期限未設定が連続する場合も前提日の翌日を順に見積もる', () => {
  const first = node('first', { targetDate: '', dependsOn: [] })
  const second = node('second', { targetDate: '', dependsOn: ['first'] })
  const nodes = new Map([first, second].map((item) => [item.id, item]))
  assert.deepEqual(effectiveTargetDate(second, nodes, '2026-08-01'), { date: '2026-08-03', estimated: true })
})

test('ホバー対象の前後経路全体を返す', () => {
  const nodes = [node('a'), node('b', { dependsOn: ['a'] }), node('c', { dependsOn: ['b'] }), node('x')]
  assert.deepEqual([...relatedNodeIds(nodes, 'b')].sort(), ['a', 'b', 'c'])
})

test('未達成目標から3件以上前の達成済み目標を折りたたむ', () => {
  const nodes = [
    node('a', { status: 'completed' }),
    node('b', { status: 'completed', dependsOn: ['a'] }),
    node('c', { status: 'completed', dependsOn: ['b'] }),
    node('d', { dependsOn: ['c'] }),
  ]
  assert.deepEqual([...collapsibleCompletedIds(nodes)], ['a'])
})

test('目標左側からの追加は既存の前提と並列に対象目標へ合流する', () => {
  const first = node('a')
  const target = node('b', { dependsOn: ['a'], goalLevel: 'middle' })
  const next = node('c', { dependsOn: ['b'] })
  const added = node('d')
  const result = insertPlanNode([first, target, next], added, { prerequisiteForId: target.id })
  assert.deepEqual(result.map((item) => item.id), ['a', 'd', 'b', 'c'])
  assert.deepEqual(result.find((item) => item.id === 'b')?.dependsOn, ['a', 'd'])
  assert.deepEqual(result.find((item) => item.id === 'd')?.dependsOn, [])
  assert.deepEqual(result.find((item) => item.id === 'c')?.dependsOn, ['b'])
})

test('道筋上への追加は従来どおり始点と終点の間へ挿入する', () => {
  const start = node('a')
  const end = node('c', { dependsOn: ['a'] })
  const added = node('b')
  const result = insertPlanNode([start, end], added, { fromId: 'a', toId: 'c', toFinal: false })
  assert.deepEqual(result.map((item) => item.id), ['a', 'b', 'c'])
  assert.deepEqual(result.find((item) => item.id === 'b')?.dependsOn, ['a'])
  assert.deepEqual(result.find((item) => item.id === 'c')?.dependsOn, ['b'])
})

test('移動ノードが移動先の半分以上を覆った場合だけ判定する', () => {
  assert.equal(coversAtLeastHalfTarget(50, 150, 100, 200), true)
  assert.equal(coversAtLeastHalfTarget(49, 149, 100, 200), false)
})

test('同じ列の移動元と移動先だけを入れ替える', () => {
  const nodes = [node('a'), node('outside'), node('b'), node('c')]
  const result = swapNodesInColumn(nodes, ['a', 'b', 'c'], 'c', 'a')
  assert.deepEqual(result.map((item) => item.id), ['c', 'outside', 'b', 'a'])
  assert.equal(result[1], nodes[1])
})

test('1つの目標に4件以上ぶら下がったら優先度の低いものを省略する', () => {
  const child = (id: string, status: PlanNode['status'], targetDate = ''): PlanNode => ({
    id, name: id, status, targetDate, description: '', nextAction: '', dependsOn: [],
  })
  const nodes: PlanNode[] = [
    child('done-old', 'completed', '2026-01-01'),
    child('done-new', 'completed', '2026-05-01'),
    child('todo-old', 'not_started', '2026-02-01'),
    child('todo-new', 'not_started', '2026-06-01'),
    child('todo-undated', 'not_started'),
    {
      id: 'parent', name: 'parent', status: 'not_started', targetDate: '', description: '', nextAction: '',
      dependsOn: ['done-old', 'done-new', 'todo-old', 'todo-new', 'todo-undated'],
    },
  ]

  // 未着手が先、そのうち日付なし→新しい順。上位3件だけ残る。
  assert.deepEqual([...overflowingPrerequisiteIds(nodes)].sort(), ['done-new', 'done-old'])
})

test('3件までなら省略しない', () => {
  const nodes: PlanNode[] = [
    { id: 'a', name: 'a', status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: [] },
    { id: 'b', name: 'b', status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: [] },
    { id: 'c', name: 'c', status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: [] },
    { id: 'p', name: 'p', status: 'not_started', targetDate: '', description: '', nextAction: '', dependsOn: ['a', 'b', 'c'] },
  ]

  assert.equal(overflowingPrerequisiteIds(nodes).size, 0)
})

test('前提を持つ目標は省略しない', () => {
  const leaf = (id: string): PlanNode => ({ id, name: id, status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: [] })
  const nodes: PlanNode[] = [
    leaf('a'), leaf('b'), leaf('c'), leaf('d'),
    { id: 'e', name: 'e', status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: ['a'] },
    { id: 'p', name: 'p', status: 'not_started', targetDate: '', description: '', nextAction: '', dependsOn: ['b', 'c', 'd', 'e'] },
  ]

  assert.equal(overflowingPrerequisiteIds(nodes).has('e'), false)
})

test('選択した道筋の2つの目標の位置を入れ替える', () => {
  const nodes = [
    node('x', { dependsOn: [] }),
    node('a', { dependsOn: ['x'] }),
    node('b', { dependsOn: ['a'] }),
    node('y', { dependsOn: ['b'] }),
  ]

  const swapped = swapNodesOnEdge(nodes, 'a', 'b')

  const swappedMap = new Map(swapped.map((n) => [n.id, n]))
  assert.deepEqual(swappedMap.get('b')?.dependsOn, ['x'])
  assert.deepEqual(swappedMap.get('a')?.dependsOn, ['b'])
  assert.deepEqual(swappedMap.get('y')?.dependsOn, ['a'])
  assert.deepEqual(swapped.map((n) => n.id), ['x', 'b', 'a', 'y'])
})

test('分岐と合流がある道筋でも前後の接続を保って入れ替える', () => {
  const nodes = [
    node('x', { dependsOn: [] }),
    node('z', { dependsOn: [] }),
    node('a', { dependsOn: ['x'] }),
    node('b', { dependsOn: ['a', 'z'] }),
    node('c', { dependsOn: ['a'] }),
    node('y', { dependsOn: ['b'] }),
  ]

  const swapped = swapNodesOnEdge(nodes, 'a', 'b')
  const swappedMap = new Map(swapped.map((n) => [n.id, n]))

  // bの前提: 元のz + aの前提x
  assert.deepEqual(swappedMap.get('b')?.dependsOn.sort(), ['x', 'z'])
  // aの前提: b
  assert.deepEqual(swappedMap.get('a')?.dependsOn, ['b'])
  // cの前提: a（aの後続なのでそのまま）
  assert.deepEqual(swappedMap.get('c')?.dependsOn, ['a'])
  // yの前提: a（bの後続だったのでaの後続に付け替え）
  assert.deepEqual(swappedMap.get('y')?.dependsOn, ['a'])
})

