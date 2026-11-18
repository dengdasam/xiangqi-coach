/**
 * IndexedDB 持久化层 —— 棋谱、着法树、错题本、能力画像历史。
 * 无依赖的极简封装；Web 与 Capacitor WebView 均可用。
 */
import type { Game, MoveNode } from './model'

const DB_NAME = 'xiangqi-coach'
const DB_VERSION = 1
const STORES = ['games', 'moves', 'profiles', 'drills'] as const

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('moves')) {
        const s = db.createObjectStore('moves', { keyPath: 'id' })
        s.createIndex('gameId', 'gameId', { unique: false })
        s.createIndex('parentId', 'parentId', { unique: false })
      }
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('drills')) db.createObjectStore('drills', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export const store = {
  async saveGame(g: Game) { return tx('games', 'readwrite', (s) => s.put(g)) },
  async getGames(): Promise<Game[]> { return tx('games', 'readonly', (s) => s.getAll()) },

  async saveMove(n: MoveNode) { return tx('moves', 'readwrite', (s) => s.put(n)) },
  async getMoves(gameId: string): Promise<MoveNode[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const t = db.transaction('moves', 'readonly')
      const idx = t.objectStore('moves').index('gameId')
      const req = idx.getAll(gameId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async saveProfile(p: { id: string; date: string; data: any }) { return tx('profiles', 'readwrite', (s) => s.put(p)) },
  async getProfiles(): Promise<any[]> { return tx('profiles', 'readonly', (s) => s.getAll()) },

  async addDrill(d: { id: string; fen: string; played: string; best: string; note: string; createdAt: number }) {
    return tx('drills', 'readwrite', (s) => s.put(d))
  },
  async getDrills(): Promise<any[]> { return tx('drills', 'readonly', (s) => s.getAll()) },
  async deleteDrill(id: string) { return tx('drills', 'readwrite', (s) => s.delete(id)) }
}
