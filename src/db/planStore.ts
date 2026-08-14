import type { PlanNode, PlanSnapshot } from '../models/plan'
import { isThemeId } from '../models/theme'
import type { ThemeId } from '../models/theme'

const databaseName = 'longstep'
const databaseVersion = 3
const storeName = 'plans'
const planMetaStoreName = 'planMeta'
const lastOpenedPlanMetaId = '__last-opened-plan__'

export interface PlanPreferences {
  favorite: boolean
  viewPosition?: { left: number; top: number }
}

async function updatePlanMeta(planId: string, changes: Record<string, unknown>): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(planMetaStoreName, 'readwrite')
    const store = transaction.objectStore(planMetaStoreName)
    const request = store.get(planId)
    request.onsuccess = () => store.put({
      ...(request.result ?? {}),
      planId,
      ...changes,
      updatedAt: new Date().toISOString(),
    })
    transaction.oncomplete = () => {
      resolve()
      database.close()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('計画の表示設定を保存できませんでした。'))
      database.close()
    }
  })
}

function stripRemovedNodeFields(plan: PlanSnapshot): PlanSnapshot {
  return {
    ...plan,
    nodes: plan.nodes.map((node) => {
      const sanitizedNode = { ...node } as PlanNode & Record<string, unknown>
      delete sanitizedNode.progress
      delete sanitizedNode.difficulty
      delete sanitizedNode.difficultySetAt

      if ((sanitizedNode.status as string) === 'in_progress') {
        sanitizedNode.status = 'not_started'
      }

      return sanitizedNode
    }),
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('このブラウザではIndexedDBを利用できません。'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = (event) => {
      const database = request.result
      const transaction = request.transaction
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(planMetaStoreName)) {
        database.createObjectStore(planMetaStoreName, { keyPath: 'planId' })
      }

      if (oldVersion < 3 && transaction) {
        const plansStore = transaction.objectStore(storeName)
        const cursorRequest = plansStore.openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return

          cursor.update(stripRemovedNodeFields(cursor.value as PlanSnapshot))
          cursor.continue()
        }
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
      const plans = (request.result as PlanSnapshot[]).map(stripRemovedNodeFields).sort((a, b) =>
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
  return updatePlanMeta(planId, { theme })
}

export async function getPlanPreferences(planId: string): Promise<PlanPreferences> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(planMetaStoreName, 'readonly').objectStore(planMetaStoreName).get(planId)
    request.onsuccess = () => {
      const result = request.result as { favorite?: unknown; viewPosition?: unknown } | undefined
      const position = result?.viewPosition && typeof result.viewPosition === 'object'
        ? result.viewPosition as { left?: unknown; top?: unknown }
        : undefined
      resolve({
        favorite: result?.favorite === true,
        viewPosition: typeof position?.left === 'number' && typeof position.top === 'number'
          ? { left: position.left, top: position.top }
          : undefined,
      })
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('計画の表示設定を読み込めませんでした。'))
      database.close()
    }
  })
}

export function savePlanPreferences(planId: string, preferences: Partial<PlanPreferences>): Promise<void> {
  return updatePlanMeta(planId, preferences)
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
