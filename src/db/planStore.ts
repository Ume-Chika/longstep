import type { PlanSnapshot } from '../models/plan'
import { isThemeId } from '../models/theme'
import type { ThemeId } from '../models/theme'

const databaseName = 'longstep'
const databaseVersion = 2
const storeName = 'plans'
const planMetaStoreName = 'planMeta'
const lastOpenedPlanMetaId = '__last-opened-plan__'

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('このブラウザではIndexedDBを利用できません。'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: 'id' })
      }
      if (!request.result.objectStoreNames.contains(planMetaStoreName)) {
        request.result.createObjectStore(planMetaStoreName, { keyPath: 'planId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDBを開けませんでした。'))
  })
}

export async function listPlans(): Promise<PlanSnapshot[]> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()

    request.onsuccess = () => {
      const plans = (request.result as PlanSnapshot[]).sort((a, b) =>
        b.meta.updatedAt.localeCompare(a.meta.updatedAt),
      )
      resolve(plans)
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('計画一覧を読み込めませんでした。'))
      database.close()
    }
  })
}

export async function savePlan(plan: PlanSnapshot): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(plan)
    transaction.oncomplete = () => {
      resolve()
      database.close()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('計画を保存できませんでした。'))
      database.close()
    }
  })
}

export async function deletePlan(planId: string): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName, planMetaStoreName], 'readwrite')
    transaction.objectStore(storeName).delete(planId)
    const metaStore = transaction.objectStore(planMetaStoreName)
    metaStore.delete(planId)

    const lastOpenedRequest = metaStore.get(lastOpenedPlanMetaId)
    lastOpenedRequest.onsuccess = () => {
      const lastOpened = lastOpenedRequest.result as { targetPlanId?: unknown } | undefined
      if (lastOpened?.targetPlanId === planId) {
        metaStore.delete(lastOpenedPlanMetaId)
      }
    }
    transaction.oncomplete = () => {
      resolve()
      database.close()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('計画を削除できませんでした。'))
      database.close()
    }
  })
}

export async function getPlanTheme(planId: string): Promise<ThemeId> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(planMetaStoreName, 'readonly')
    const request = transaction.objectStore(planMetaStoreName).get(planId)

    request.onsuccess = () => {
      const theme = request.result?.theme
      resolve(isThemeId(theme) ? theme : 'fire')
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('計画テーマを読み込めませんでした。'))
      database.close()
    }
  })
}

export async function savePlanTheme(planId: string, theme: ThemeId): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(planMetaStoreName, 'readwrite')
    transaction.objectStore(planMetaStoreName).put({
      planId,
      theme,
      updatedAt: new Date().toISOString(),
    })
    transaction.oncomplete = () => {
      resolve()
      database.close()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('計画テーマを保存できませんでした。'))
      database.close()
    }
  })
}

export async function getLastOpenedPlanId(): Promise<string | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(planMetaStoreName, 'readonly')
    const request = transaction.objectStore(planMetaStoreName).get(lastOpenedPlanMetaId)

    request.onsuccess = () => {
      const lastOpened = request.result as { targetPlanId?: unknown } | undefined
      resolve(typeof lastOpened?.targetPlanId === 'string' ? lastOpened.targetPlanId : null)
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('最後に開いた計画を読み込めませんでした。'))
      database.close()
    }
  })
}

export async function saveLastOpenedPlan(planId: string): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(planMetaStoreName, 'readwrite')
    transaction.objectStore(planMetaStoreName).put({
      planId: lastOpenedPlanMetaId,
      targetPlanId: planId,
      updatedAt: new Date().toISOString(),
    })
    transaction.oncomplete = () => {
      resolve()
      database.close()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('最後に開いた計画を保存できませんでした。'))
      database.close()
    }
  })
}
