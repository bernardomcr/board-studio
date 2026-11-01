/** Local persistence for boards larger than the browser's localStorage quota. */
const DATABASE = "board-app";
const STORE = "boards";
let database: Promise<IDBDatabase> | undefined;
let connected:IDBDatabase|undefined;

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
      connected=db;
      const invalidate=()=>{if(connected===db){connected=undefined;database=undefined;}};
      db.onversionchange = () => { invalidate();db.close(); };
      db.onclose=invalidate;
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

/** Prepare the optional legacy cache from the SAME synchronous capture as IDB. */
function legacyCacheText(data:unknown):string|undefined {
  // The optional legacy cache is synchronous. Avoid serializing large drawings
  // and embedded images a second time after the durable structured clone.
  // Count references in the journal too: JSON duplicates shared point arrays and
  // original image strings even after those objects were erased from the board.
  let points=0,imageBytes=0,visited=0;const pending:unknown[]=[data];
  while(pending.length){
    const value=pending.pop();if(!value||typeof value!=='object')continue;
    if(++visited>10000)return undefined;
    for(const [field,item]of Object.entries(value)){
      if(field==='points'&&Array.isArray(item)){points+=item.length;if(points>12000)return undefined;}
      else if(typeof item==='string'&&/^data:(?:image|audio|font)\//.test(item)){imageBytes+=item.length;if(imageBytes>1000000)return undefined;}
      else if(item&&typeof item==='object')pending.push(item);
    }
  }
  try{return JSON.stringify(data);}catch{return undefined;}
}

function commit(db:IDBDatabase,key:string,data:unknown,legacy:string|undefined):Promise<void>{
  // IDB.put performs its structured serialization synchronously. Construct the
  // request now, before yielding, so following edits/transitions cannot change
  // either the captured record or its destination. This is the one durable copy.
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),request=tx.objectStore(STORE).put(data,key);
    tx.oncomplete=()=>{if(legacy!==undefined){try{localStorage.setItem(key,legacy);}catch{/* The durable commit succeeded even when this optional cache is full. */}}resolve();};
    tx.onerror=tx.onabort=()=>reject(tx.error??request.error??new Error('Falha ao salvar o board no computador.'));
  });
}

/** Warm connection: serialize directly to IDB in the caller's current stack.
 * Cold connection: freeze exactly once before waiting for the database to open. */
export function writeStoredBoard(key:string,data:unknown):Promise<void>{
  try{
    if(connected)return commit(connected,key,data,legacyCacheText(data));
    const owned=structuredClone(data),legacy=legacyCacheText(owned);
    return openDatabase().then(db=>commit(db,key,owned,legacy));
  }catch(error){return Promise.reject(error);}
}
