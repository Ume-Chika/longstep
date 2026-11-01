import type { DateFormat } from '../types/app'

const databaseName = 'longstep'
const databaseVersion = 3
const storeName = 'plans'
export const planMetaStoreName = 'planMeta'
export const directoryHandleMetaId = '__plan-directory-handle__'
export const lastOpenedPlanMetaId = '__last-opened-plan__'
const sitePreferencesMetaId = '__site-preferences__'

let selectedDirectoryHandle: FileSystemDirectoryHandle | null = null

export interface SitePreferences {
  dateFormat: DateFormat
}

export interface PlanPreferences {
  favorite: boolean
  viewPosition?: { left: number; top: number }
  dateFormat?: DateFormat
}

export async function updatePlanMeta(planId: string, changes: Record<string, unknown>): Promise<void> {
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

export function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('このブラウザではIndexedDBを利用できません。'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(planMetaStoreName)) {
        database.createObjectStore(planMetaStoreName, { keyPath: 'planId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDBを開けませんでした。'))
  })
}

export function setPlanDirectoryHandle(handle: FileSystemDirectoryHandle | null): void {
  selectedDirectoryHandle = handle
}

export async function savePlanDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  selectedDirectoryHandle = handle
  await updatePlanMeta(directoryHandleMetaId, { handle })
}

export async function getPlanDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (selectedDirectoryHandle) return selectedDirectoryHandle

  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(planMetaStoreName, 'readonly')
      .objectStore(planMetaStoreName)
      .get(directoryHandleMetaId)
    request.onsuccess = () => {
      const handle = request.result?.handle
      selectedDirectoryHandle = handle?.kind === 'directory' && typeof handle.values === 'function'
        ? handle as FileSystemDirectoryHandle
        : null
      resolve(selectedDirectoryHandle)
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Longstep保存先を読み込めませんでした。'))
      database.close()
    }
  })
}


export {
  addPlanProjectDirectory,
  deletePlan,
  getPlanProjectDirectories,
  listPlans,
  PlanConflictError,
  readPlan,
  savePlan,
} from '../services/planFileStorage.ts'

export async function getPlanPreferences(planId: string): Promise<PlanPreferences> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(planMetaStoreName, 'readonly').objectStore(planMetaStoreName).get(planId)
    request.onsuccess = () => {
      const result = request.result as { favorite?: unknown; viewPosition?: unknown; dateFormat?: unknown } | undefined
      const position = result?.viewPosition && typeof result.viewPosition === 'object'
        ? result.viewPosition as { left?: unknown; top?: unknown }
        : undefined
      const dateFormat = result?.dateFormat === 'remaining' || result?.dateFormat === 'deadline'
        ? result.dateFormat
        : undefined
      resolve({
        favorite: result?.favorite === true,
        viewPosition: typeof position?.left === 'number' && typeof position.top === 'number'
          ? { left: position.left, top: position.top }
          : undefined,
        dateFormat,
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

export async function getSitePreferences(): Promise<SitePreferences> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(planMetaStoreName, 'readonly').objectStore(planMetaStoreName).get(sitePreferencesMetaId)
    request.onsuccess = () => {
      const result = request.result as { dateFormat?: unknown } | undefined
      resolve({
        dateFormat: result?.dateFormat === 'remaining' ? 'remaining' : 'deadline',
      })
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('サイト表示設定を読み込めませんでした。'))
      database.close()
    }
  })
}

export function saveSitePreferences(preferences: Partial<SitePreferences>): Promise<void> {
  return updatePlanMeta(sitePreferencesMetaId, preferences)
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
