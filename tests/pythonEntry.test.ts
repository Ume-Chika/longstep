import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPythonEntry } from '../src/python/entry.ts'

test('異なるプロジェクトの入口を別の計画へ固定する', () => {
  const first = buildPythonEntry('/Users/example/Longstep', 'plan-1')
  const second = buildPythonEntry('/Users/example/Longstep', 'plan-2')

  assert.match(first, /_PLAN_ID = "plan-1"/)
  assert.doesNotMatch(first, /plan-2/)
  assert.match(second, /_PLAN_ID = "plan-2"/)
  assert.match(first, /def update_plan\(\*\*changes\):/)
})
