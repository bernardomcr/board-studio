/** Local persistence for boards larger than the browser's localStorage quota. */
const DATABASE = "board-app";
const STORE = "boards";
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento do board."));
    request.onblocked = () => reject(new Error("Outra janela está impedindo a atualização do armazenamento do board."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  }).catch(error => { database = undefined; throw error; });
  return database;
}

function timestamp(value: unknown): number {
  const savedAt = value && typeof value === "object" ? (value as { savedAt?: unknown }).savedAt : undefined;
  return typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : 0;
}

async function readDatabase(key: string): Promise<unknown | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    let value: unknown = null;
    request.onsuccess = () => { value = request.result ?? null; };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Falha ao ler o board salvo."));
  });
}

/** Reads legacy JSON too; among stored copies, the newest savedAt wins. */
export async function readStoredBoard(localKey: string): Promise<unknown | null> {
  let legacy: unknown = null;
  try { const text = localStorage.getItem(localKey); if (text) legacy = JSON.parse(text); } catch { /* The IndexedDB copy remains authoritative when localStorage is unavailable. */ }
  let durable: unknown;
  try { durable = await readDatabase(localKey); }
  catch (error) { if (legacy !== null) return legacy; throw error; }
  if (durable === null) return legacy;
  if (legacy === null) return durable;
  // With equal timestamps prefer IndexedDB, including legacy records without savedAt.
  return timestamp(legacy) > timestamp(durable) ? legacy : durable;
}

/** Commits a structured-clone record before attempting the optional JSON cache. */
export async function writeStoredBoard(key: string, data: unknown): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Falha ao salvar o board no computador."));
  });
  // The optional legacy cache is synchronous. Avoid serializing large drawings
  // and embedded images a second time after the durable structured clone.
  // Count references in the journal too: JSON duplicates shared point arrays and
  // original image strings even after those objects were erased from the board.
  let points=0,imageBytes=0,visited=0;const pending:unknown[]=[data];
  while(pending.length){
    const value=pending.pop();if(!value||typeof value!=='object')continue;
    if(++visited>10000)return;
    for(const [field,item]of Object.entries(value)){
      if(field==='points'&&Array.isArray(item)){points+=item.length;if(points>12000)return;}
      else if(typeof item==='string'&&/^data:(?:image|audio|font)\//.test(item)){imageBytes+=item.length;if(imageBytes>1000000)return;}
      else if(item&&typeof item==='object')pending.push(item);
    }
  }
  // A full browser quota must not make a successfully committed board look unsaved.
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* IndexedDB contains the complete record. */ }
}
