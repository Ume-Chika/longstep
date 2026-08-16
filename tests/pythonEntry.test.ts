import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPythonEntry, isPythonEntryForPlan } from '../src/python/entry.ts'

test('異なるプロジェクトの入口を別の計画へ固定する', () => {
  const first = buildPythonEntry('plan-1')
  const second = buildPythonEntry('plan-2')

  assert.match(first, /_PLAN_ID = "plan-1"/)
  assert.doesNotMatch(first, /plan-2/)
  assert.match(second, /_PLAN_ID = "plan-2"/)
  assert.match(first, /def update_plan\(\*\*changes\):/)
})

test('保存先を書類フォルダ内のLongstepへ固定する', () => {
  const entry = buildPythonEntry('plan-1')

  assert.match(entry, /_LONGSTEP_DIR = Path\.home\(\) \/ "Documents" \/ "Longstep"/)
  assert.doesNotMatch(entry, /\/Users\//)
})

test('VM実行時の事前確認をAIエージェント向けに案内する', () => {
  const entry = buildPythonEntry('plan-1')

  assert.match(entry, /【AIエージェントへ：実行前に必ず確認すること】/)
  assert.match(entry, /\(Path\.home\(\) \/ "Documents" \/ "Longstep"\)\.is_dir\(\)/)
})

test('入口が対象計画のものかを判定する', () => {
  const entry = buildPythonEntry('plan-1')

  assert.equal(isPythonEntryForPlan(entry, 'plan-1'), true)
  assert.equal(isPythonEntryForPlan(entry, 'plan-2'), false)
  assert.equal(isPythonEntryForPlan(buildPythonEntry('plan-2'), 'plan-1'), false)
  assert.equal(isPythonEntryForPlan('print("hello")\n', 'plan-1'), false)
})
