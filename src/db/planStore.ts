import type { PlanSnapshot } from '../models/plan'
import { parsePlanText } from '../schemas/planValidation.ts'

const databaseName = 'longstep'
const databaseVersion = 3
const storeName = 'plans'
const planMetaStoreName = 'planMeta'
const directoryHandleMetaId = '__plan-directory-handle__'
const lastOpenedPlanMetaId = '__last-opened-plan__'

let selectedDirectoryHandle: FileSystemDirectoryHandle | null = null

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

function planFileName(planId: string): string {
  if (!planId || planId.includes('/') || planId.includes('\\')) {
    throw new Error('計画IDをファイル名として使用できません。')
  }
  return `${planId}.json`
}

function openDatabase(): Promise<IDBDatabase> {
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
      selectedDirectoryHandle = handle?.kind === 'directory' ? handle as FileSystemDirectoryHandle : null
      resolve(selectedDirectoryHandle)
      database.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Longstep保存先を読み込めませんでした。'))
      database.close()
    }
  })
}


async function requirePlanDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await getPlanDirectoryHandle()
  if (!handle) {
    throw new Error('Longstep保存先が未設定です。保存先を選択してください。')
  }
  return handle
}

async function readPlanFromDirectory(directory: FileSystemDirectoryHandle, planId: string): Promise<PlanSnapshot> {
  const handle = await directory.getFileHandle(planFileName(planId))
  const file = await handle.getFile()
  return parsePlanText(await file.text())
}

export async function readPlan(planId: string): Promise<PlanSnapshot> {
  return readPlanFromDirectory(await requirePlanDirectory(), planId)
}

export async function listPlans(): Promise<PlanSnapshot[]> {
  const directory = await requirePlanDirectory()
  const plans: PlanSnapshot[] = []

  for await (const handle of directory.values()) {
    if (handle.kind !== 'file' || !handle.name.endsWith('.json')) continue
    try {
      const file = await (handle as FileSystemFileHandle).getFile()
      plans.push(parsePlanText(await file.text()))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSONを読み取れませんでした。'
      throw new Error(`${handle.name}を読み込めませんでした。${message}`)
    }
  }

  return plans.sort((a, b) => b.meta.updatedAt.localeCompare(a.meta.updatedAt))
}

/** ディスク上の計画がWeb側の編集より新しいときに投げる。Pythonツール側の更新を優先する。 */
export class PlanConflictError extends Error {
  constructor() {
    super('Pythonツール側の更新の方が新しいため、この変更は保存していません。最新の内容へ切り替えたので、必要ならもう一度編集してください。')
    this.name = 'PlanConflictError'
  }
}

export async function savePlan(plan: PlanSnapshot): Promise<void> {
  const directory = await requirePlanDirectory()
  try {
    const current = await readPlanFromDirectory(directory, plan.id)
    if (current.meta.revision >= plan.meta.revision) {
      throw new PlanConflictError()
    }
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
  }
  const fileHandle = await directory.getFileHandle(planFileName(plan.id), { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(`${JSON.stringify(plan, null, 2)}\n`)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

/** 計画削除時に入口も片付けられるよう、`longstep.py`の設置先を計画ごとに覚えておく。 */
export async function addPlanProjectDirectory(planId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const current = await getPlanProjectDirectories(planId)
  const known = await Promise.all(current.map((entry) => entry.isSameEntry(handle)))
  if (known.some(Boolean)) return
  await updatePlanMeta(planId, { projectDirectories: [...current, handle] })
}

export async function getPlanProjectDirectories(planId: string): Promise<FileSystemDirectoryHandle[]> {
  const database = await openDatabase()
  return new Promise((resolve) => {
    const request = database.transaction(planMetaStoreName, 'readonly')
      .objectStore(planMetaStoreName)
      .get(planId)
    request.onsuccess = () => {
      const handles = request.result?.projectDirectories
      resolve(Array.isArray(handles)
        ? handles.filter((handle): handle is FileSystemDirectoryHandle => handle?.kind === 'directory')
        : [])
      database.close()
    }
    // 片付けは補助的な処理なので、読み取れない場合は「記録なし」として扱う。
    request.onerror = () => {
      resolve([])
      database.close()
    }
  })
}

export async function deletePlan(planId: string): Promise<void> {
  const directory = await requirePlanDirectory()
  await directory.removeEntry(planFileName(planId))
  let database: IDBDatabase
  try {
    database = await openDatabase()
  } catch {
    return
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(planMetaStoreName, 'readwrite')
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
      reject(transaction.error ?? new Error('計画の表示設定を削除できませんでした。'))
      database.close()
    }
  })
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
