import assert from 'node:assert/strict'
import test from 'node:test'
import type { DateFormat } from '../src/types/app.ts'

test('日付表記設定の型と初期値の整合性', () => {
  const defaultFormat: DateFormat = 'deadline'
  assert.equal(defaultFormat, 'deadline')

  const remainingFormat: DateFormat = 'remaining'
  assert.equal(remainingFormat, 'remaining')
})

test('SitePreferencesとPlanPreferencesで日付表記設定を扱える', () => {
  type SitePreferences = { dateFormat: DateFormat }
  type PlanPreferences = { favorite: boolean; dateFormat?: DateFormat }

  const sitePrefs: SitePreferences = { dateFormat: 'remaining' }
  assert.equal(sitePrefs.dateFormat, 'remaining')

  const planPrefs: PlanPreferences = { favorite: true, dateFormat: 'deadline' }
  assert.equal(planPrefs.dateFormat, 'deadline')

  // カスケード優先度: 計画個別設定 > サイト全体設定 > デフォルト('deadline')
  function resolveDateFormat(planPref?: PlanPreferences, sitePref?: SitePreferences): DateFormat {
    return planPref?.dateFormat ?? sitePref?.dateFormat ?? 'deadline'
  }

  assert.equal(resolveDateFormat({ favorite: false, dateFormat: 'remaining' }, { dateFormat: 'deadline' }), 'remaining')
  assert.equal(resolveDateFormat({ favorite: false }, { dateFormat: 'remaining' }), 'remaining')
  assert.equal(resolveDateFormat({ favorite: false }, undefined), 'deadline')
})
