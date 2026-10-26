import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlanNode } from '../src/models/plan.ts'
import {
  actionableGoalIds,
  collapsibleCompletedIds,
  insertPlanNode,
  overflowingPrerequisiteIds,
  relatedNodeIds,
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
  assert.deepEqual(actionableGoalIds(nodes), ['major', 'late', 'soon'])
})

test('前提が未達成または見つからない大目標はハイライトしない', () => {
  const nodes = [
    node('done', { status: 'completed' }),
    node('pending', { goalLevel: 'loop' }),
    node('ready-major', { goalLevel: 'major', dependsOn: ['done'], targetDate: '2026-08-10' }),
    node('blocked-major', { goalLevel: 'major', dependsOn: ['pending'], targetDate: '2026-08-08' }),
    node('orphan-major', { goalLevel: 'major', dependsOn: ['missing'], targetDate: '2026-08-09' }),
  ]

  assert.deepEqual(actionableGoalIds(nodes), ['ready-major'])
})

test('期限未設定の目標は後続目標の期日を引き継いで優先順を決める', () => {
  const parentSoon = node('parent-soon', { targetDate: '2026-08-10', dependsOn: ['child-soon'] })
  const parentLate = node('parent-late', { targetDate: '2026-08-20', dependsOn: ['child-late'] })
  const childLate = node('child-late', { targetDate: '' })
  const childSoon = node('child-soon', { targetDate: '' })
  const childOrphan = node('child-orphan', { targetDate: '' })
  assert.deepEqual(
    actionableGoalIds([childOrphan, childLate, childSoon, parentSoon, parentLate]),
    ['child-soon', 'child-late', 'child-orphan'],
  )
})

test('ホバー対象の前後経路全体を返す', () => {
  const nodes = [node('a'), node('b', { dependsOn: ['a'] }), node('c', { dependsOn: ['b'] }), node('x')]
  assert.deepEqual([...relatedNodeIds(nodes, 'b')].sort(), ['a', 'b', 'c'])
})

test('未達成目標から3件以上前の達成済み目標（大・中・小）を折りたたむ', () => {
  const nodes = [
    node('a', { status: 'completed', goalLevel: 'middle' }),
    node('b', { status: 'completed', goalLevel: 'major', dependsOn: ['a'] }),
    node('c', { status: 'completed', goalLevel: 'minor', dependsOn: ['b'] }),
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

test('4件目以降の達成済み目標は上流の達成済み前提ごと省略し、未達成を含む枝は残す', () => {
  const leaf = (id: string, status: PlanNode['status'] = 'completed'): PlanNode => ({
    id, name: id, status, targetDate: '', description: '', nextAction: '', dependsOn: [],
  })
  const nodes: PlanNode[] = [
    leaf('done-leaf'),
    leaf('todo-leaf', 'not_started'),
    { id: 'done-mid', name: 'done-mid', status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: ['done-leaf'] },
    { id: 'active-mid', name: 'active-mid', status: 'completed', targetDate: '', description: '', nextAction: '', dependsOn: ['todo-leaf'] },
    leaf('b'),
    leaf('c'),
    leaf('d'),
    { id: 'p', name: 'p', status: 'not_started', targetDate: '', description: '', nextAction: '', dependsOn: ['done-mid', 'active-mid', 'b', 'c', 'd'] },
  ]

  const omitted = overflowingPrerequisiteIds(nodes)
  assert.equal(omitted.has('done-mid'), true)
  assert.equal(omitted.has('done-leaf'), true)
  assert.equal(omitted.has('active-mid'), false)
  assert.equal(omitted.has('todo-leaf'), false)
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

