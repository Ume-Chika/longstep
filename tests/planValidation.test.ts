import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parsePlanText } from '../src/schemas/planValidation.ts'

test('共有Schemaが最小の骨組みJSONと一致する', () => {
  const schema = JSON.parse(readFileSync(
    new URL('../src/schemas/plan-snapshot.schema.json', import.meta.url),
    'utf8',
  )) as { required: string[]; properties: Record<string, unknown> }

  assert.deepEqual(schema.required, ['id', 'name', 'goal', 'nodes', 'meta'])
  assert.equal('formatVersion' in schema.properties, false)
  assert.equal('kind' in schema.properties, false)
  assert.equal('customFields' in schema.properties, false)
})

test('計画名だけの骨組みJSONを読み込む', () => {
  const timestamp = '2026-08-16T00:00:00.000Z'
  const parsed = parsePlanText(JSON.stringify({
    id: 'plan-empty',
    name: '新しい計画',
    goal: { statement: '', deadline: '', successCriteria: [] },
    nodes: [],
    meta: { revision: 0, createdAt: timestamp, updatedAt: timestamp },
  }))

  assert.equal(parsed.name, '新しい計画')
  assert.equal(parsed.goal.statement, '')
  assert.deepEqual(parsed.nodes, [])
  assert.equal(parsed.meta.revision, 0)
  assert.equal(parsed.meta.updatedAt, timestamp)
  assert.equal('customFields' in parsed, false)
})

test('計画名またはnodesがないJSONを拒否する', () => {
  assert.throws(() => parsePlanText(JSON.stringify({
    id: 'plan-invalid',
    name: '',
    goal: { statement: '', deadline: '', successCriteria: [] },
    nodes: [],
    meta: { revision: 0, createdAt: '', updatedAt: '' },
  })), /計画名/)

  assert.throws(() => parsePlanText(JSON.stringify({
    id: 'plan-invalid',
    name: '不正な計画',
    goal: { statement: '', deadline: '', successCriteria: [] },
    meta: { revision: 0, createdAt: '', updatedAt: '' },
  })), /nodes/)
})
