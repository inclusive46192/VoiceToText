type SavedSession = {
  transcript: string
  language: string
}

const databaseName = 'voice-to-text'
const storeName = 'sessions'
const entryKey = 'latest'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveSession(session: SavedSession): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(session, entryKey)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function loadSavedSession(): Promise<SavedSession | undefined> {
  const database = await openDatabase()
  const session = await new Promise<SavedSession | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(entryKey)
    request.onsuccess = () => resolve(request.result as SavedSession | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return session
}

export async function clearSavedSession(): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(entryKey)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}
