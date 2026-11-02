import { readStoredBoard, writeStoredBoard } from "./core/board-storage";
import type { Widget } from "./core/model";
import type { Connector } from "./core/connectors";

interface HomeAPI {
  beforeTransition?():void;
  afterTransition?():void;
  /** Return an owned, isolated snapshot; storage adds metadata without cloning
   * the media/history graph a second time. */
  capture(): unknown;
  open(data: unknown, id: string): Promise<void> | void;
  thumbnail(): Promise<string>;
  importFile?(): void;
  exportCurrent?(): void;
}
interface BoardMeta { id: string; title: string; createdAt: number; editedAt: number; starred: boolean; project: string | null; trashedAt: number | null; thumbnail: string }
interface ProjectMeta { id: string; title: string }
interface HomeIndex { version: 1; migratedLegacy: boolean; boards: BoardMeta[]; projects: ProjectMeta[]; view: "grid" | "list"; sort: "edited" | "created" | "title" }
const INDEX_KEY = "board-app:home:v1";
const boardKey = (id: string) => `board-app:board:${id}`;
const escapeHTML = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const titleOf = (value: unknown, fallback = "Board sem título") => typeof value === "string" && value.trim() ? value.trim().slice(0, 140) : fallback;
const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : Date.now();
function icon(name: string, size = 20): string {
  const paths: Record<string, string> = {
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    folder: '<path d="M3 6h7l2 3h9v11H3z"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h4v4H8zM15 13h3v3h-3"/>',
    edit: '<path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    restore: '<path d="M4 5v5h5M4 10a8 8 0 1 1 1 8"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.board}</svg>`;
}

/** Local dashboard, independent of the canvas renderer and its currently open board. */
export function installBoardHome(api: HomeAPI) {
  let index: HomeIndex = { version: 1, migratedLegacy: false, boards: [], projects: [], view: "grid", sort: "edited" };
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null");
    if (raw?.version === 1 && Array.isArray(raw.boards) && Array.isArray(raw.projects)) {
      index = { ...index, migratedLegacy: raw.migratedLegacy === true, view: raw.view === "list" ? "list" : "grid", sort: ["edited", "created", "title"].includes(raw.sort) ? raw.sort : "edited",
        projects: raw.projects.filter((p: unknown) => p && typeof p === "object" && typeof (p as ProjectMeta).id === "string").map((p: ProjectMeta) => ({ id: p.id, title: titleOf(p.title, "Projeto") })),
        boards: raw.boards.filter((b: unknown) => b && typeof b === "object" && typeof (b as BoardMeta).id === "string").map((b: BoardMeta) => ({ id: b.id, title: titleOf(b.title), createdAt: timestamp(b.createdAt), editedAt: timestamp(b.editedAt), starred: b.starred === true, project: typeof b.project === "string" ? b.project : null, trashedAt: typeof b.trashedAt === "number" ? b.trashedAt : null, thumbnail: typeof b.thumbnail === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.thumbnail) ? b.thumbnail : "" })) };
    }
  } catch { /* The board bodies remain in IndexedDB even if an index is unavailable. */ }
  let activeId: string | null = null, section = "home", search = "", modal: HTMLElement | null = null, busy = false, transitioning=false;
  const inertBefore=new Map<HTMLElement,boolean>();let transitionFocus:HTMLElement|null=null;
  const loading=document.createElement('div');loading.id='board-transition';loading.hidden=true;loading.tabIndex=-1;loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');loading.textContent='Carregando board…';loading.style.cssText='position:fixed;inset:0;z-index:2000;background:#f8f9fb99;align-items:center;justify-content:center;cursor:progress;color:#5b6372;font:14px Inter,Segoe UI,sans-serif';document.body.append(loading);
  const loadingStyle=document.createElement('style');loadingStyle.textContent='#board-transition{display:flex}#board-transition[hidden]{display:none!important}';document.head.append(loadingStyle);
  function beginTransition(){
    // Reentry is blocked by busy, but the old board is still writable while its
    // last queued gesture/editor value is committed by this hook.
    api.beforeTransition?.();transitioning=true;transitionFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.body.classList.add('board-transitioning');for(const child of document.body.children)if(child instanceof HTMLElement&&child!==loading){inertBefore.set(child,child.inert);child.inert=true;}
    loading.hidden=false;loading.focus({preventScroll:true});
  }
  function endTransition(){
    for(const [element,inert]of inertBefore)if(element.isConnected)element.inert=inert;inertBefore.clear();loading.hidden=true;document.body.classList.remove('board-transitioning');transitioning=false;api.afterTransition?.();
    if(transitionFocus?.isConnected&&transitionFocus.getClientRects().length&&!transitionFocus.closest('[inert]'))transitionFocus.focus({preventScroll:true});transitionFocus=null;
  }
  let modalReturnFocus:HTMLElement|null=null,menuReturnFocus:HTMLElement|null=null;
  const style = document.createElement("style");
  style.textContent = `
    body.home-visible #app{visibility:hidden;pointer-events:none}
    body.home-visible #topbar,body.home-visible #toolbar,body.home-visible #zoombar,body.home-visible #alignbar,body.home-visible #hud,body.home-visible .editor-panel,body.home-visible #drawing-palette,body.home-visible #tool-hint{display:none!important}
    #board-home{position:fixed;inset:0;z-index:100;background:#f8f8f7;color:#25252b;font:14px Inter,'Segoe UI',Arial,sans-serif;display:grid;grid-template-columns:238px minmax(0,1fr)}
    #board-home[hidden],.bh-modal[hidden],.bh-menu[hidden]{display:none!important}
    #board-home button,.bh-modal button,.bh-menu button{font:inherit;cursor:pointer;color:inherit;border:0;background:none}
    #board-home button:focus-visible,.bh-modal button:focus-visible,.bh-modal input:focus-visible,.bh-modal select:focus-visible,.bh-menu button:focus-visible{outline:2px solid #4262ff;outline-offset:2px}
    .bh-side{background:#fff;border-right:1px solid #e7e7e7;display:flex;flex-direction:column;padding:28px 16px 18px;min-height:0}
    .bh-brand{display:flex;align-items:center;gap:10px;margin:0 8px 34px;font-size:19px;font-weight:750;letter-spacing:-.6px}
    .bh-brand-mark{display:grid;place-items:center;background:#ffdd33;width:34px;height:34px;border-radius:10px;color:#25252b}
    .bh-workspace{display:flex;align-items:center;gap:10px;padding:10px 10px 20px;border-bottom:1px solid #eee;margin-bottom:18px}
    .bh-avatar{background:#eef0ff;border-radius:9px;width:36px;height:36px;display:grid;place-items:center;color:#4262ff;font-weight:700}
    .bh-workspace strong{font-size:13px;display:block}.bh-workspace small{font-size:11px;display:block;color:#85858a;margin-top:3px}
    .bh-nav{display:flex;flex-direction:column;gap:4px}.bh-nav button,.bh-project{display:flex;align-items:center;gap:11px;text-align:left;width:100%;min-height:42px;padding:10px 12px;border-radius:7px!important;color:#64646c!important}
    .bh-nav button:hover,.bh-project:hover{background:#f5f5f7!important}.bh-nav button[aria-current=page],.bh-project[aria-current=page]{background:#eef0ff!important;color:#3859ff!important;font-weight:600}
    .bh-project-heading{display:flex;align-items:center;justify-content:space-between;margin:26px 12px 10px;color:#85858a;font-size:11px;letter-spacing:.5px;text-transform:uppercase}
    .bh-project-heading button{display:grid;place-items:center;border-radius:5px;padding:3px}.bh-project-row{display:flex;align-items:center}.bh-project-row .bh-project{min-width:0;flex:1}.bh-project span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bh-project-more{padding:8px 4px!important;color:#999!important}
    .bh-projects{overflow:auto;min-height:0}
    .bh-main{overflow:auto;min-width:0}.bh-top{height:82px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 42px;border-bottom:1px solid #e7e7e7;background:#fff}
    .bh-search{width:min(430px,60%);position:relative;display:flex;align-items:center;color:#909098}.bh-search svg{position:absolute;left:13px}.bh-search input{font:inherit;width:100%;height:39px;border:1px solid #e4e4e8;background:#fafafb;border-radius:7px;padding:0 12px 0 42px;outline:none}.bh-search input:focus{border-color:#4262ff;background:#fff}
    .bh-offline{font-size:12px;color:#7b7b84;display:flex;align-items:center;gap:7px;white-space:nowrap}.bh-offline i{width:7px;height:7px;border-radius:50%;background:#4ba57c}
    .bh-content{padding:28px 42px 40px;max-width:1560px;margin:auto}.bh-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.bh-heading h1{font-size:22px;font-weight:650;letter-spacing:-.4px;margin:0}
    .bh-primary{height:42px;padding:0 17px!important;border-radius:7px!important;background:#4262ff!important;color:#fff!important;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600!important;font-size:13px!important;white-space:nowrap}.bh-primary:hover{background:#304ce8!important}
    .bh-tools{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 18px}.bh-section-label{font-size:15px;font-weight:600}.bh-sort-view{display:flex;align-items:center;gap:12px}.bh-sort-view label{font-size:12px;color:#85858e}.bh-sort-view select{font:12px Inter,'Segoe UI',sans-serif;border:0;background:transparent;color:#5c5c67;cursor:pointer;padding:7px 4px}.bh-view{display:flex;border:1px solid #dedee5;border-radius:7px;padding:3px;background:#fff}.bh-view button{display:grid;place-items:center;padding:5px 7px!important;border-radius:4px}.bh-view button[aria-pressed=true]{background:#eef0ff!important;color:#4262ff!important}
    .bh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}.bh-card{background:#fff;border:1px solid #e1e1e7;border-radius:10px;overflow:hidden;position:relative;transition:box-shadow .15s,border-color .15s;min-width:0}.bh-card:hover{box-shadow:0 4px 18px #2424460c;border-color:#b9bfe6}.bh-card-open{display:block!important;width:100%;padding:0!important;text-align:left}.bh-cover{height:153px;background:#f0f1f5;display:grid;place-items:center;position:relative;overflow:hidden}.bh-cover img{width:100%;height:100%;object-fit:cover}.bh-cover-empty{color:#b2b9ce}.bh-cover-empty svg{width:56px;height:56px;stroke-width:1}.bh-card-body{display:block;padding:17px 46px 18px 17px;min-height:78px}.bh-card-title{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.bh-card-meta{font-size:11px;color:#95959d;display:block;margin-top:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bh-card-actions{position:absolute;right:9px;bottom:17px;display:flex;align-items:center;gap:2px}.bh-card-actions button{display:grid;place-items:center;padding:6px!important;border-radius:5px}.bh-card-actions button:hover{background:#eef0ff!important;color:#4262ff!important}.bh-card-star{position:absolute;right:10px;top:10px;background:#fff!important;border:1px solid #e9e9ed!important;border-radius:6px!important;padding:5px!important;color:#a5a5ae!important;display:grid;place-items:center}.bh-card-star[aria-pressed=true]{color:#b08c12!important}.bh-card-star[aria-pressed=true] svg{fill:#ffdd55}
    .bh-grid.bh-list{display:flex;flex-direction:column;gap:8px}.bh-list .bh-card-open{display:flex!important;align-items:center}.bh-list .bh-cover{width:108px;height:78px;flex-shrink:0}.bh-list .bh-cover-empty svg{width:35px;height:35px}.bh-list .bh-card-body{min-height:0;flex:1;padding:16px 110px 16px 20px}.bh-list .bh-card-star{top:23px;right:48px}.bh-list .bh-card-actions{bottom:22px}
    .bh-empty{border:1px dashed #d8d9e2;border-radius:10px;min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;color:#92929c}.bh-empty h2{font-size:14px;color:#555564;font-weight:500;margin:12px 0 0}.bh-empty svg{width:30px;height:30px;color:#b1b5c7}
    .bh-menu{position:fixed;z-index:180;width:228px;padding:6px;background:#fff;border:1px solid #e4e4e9;border-radius:9px;box-shadow:0 8px 30px #20203a25;font:13px Inter,'Segoe UI',sans-serif;color:#373743}.bh-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:10px 11px!important;text-align:left;border-radius:5px!important}.bh-menu button:hover{background:#f1f3ff!important}.bh-menu button.danger{color:#b74949}.bh-menu .bh-menu-sep{height:1px;background:#eee;margin:5px}
    .bh-modal{position:fixed;inset:0;background:#20203366;z-index:160;display:grid;place-items:center;padding:20px;font:14px Inter,'Segoe UI',sans-serif;color:#31313d}.bh-modal-card{width:min(480px,100%);max-height:90vh;overflow:auto;border:1px solid #eee;border-radius:13px;padding:26px;background:#fff;box-shadow:0 20px 80px #16162e44}.bh-modal h2{margin:0 0 22px;font-size:21px;letter-spacing:-.4px}.bh-modal label{display:block;color:#6d6d79;font-size:12px;margin:16px 0 6px}.bh-modal input,.bh-modal select{font:14px Inter,'Segoe UI',sans-serif;width:100%;height:42px;border:1px solid #dcdce4;border-radius:6px;padding:0 11px;color:#343442;background:#fff}.bh-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:26px}.bh-secondary{border:1px solid #ddddE5!important;border-radius:7px!important;padding:10px 15px!important;font-size:13px!important;background:#fff!important}.bh-modal-note{font-size:12px;color:#858590;line-height:1.5;margin:18px 0 0}.bh-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 18px;border-radius:8px;background:#252535;color:white;box-shadow:0 4px 18px #0002;z-index:220;font:13px Inter,'Segoe UI',sans-serif;max-width:90vw}
    .bh-project-card{display:flex;align-items:center;gap:14px;width:100%;padding:22px!important;background:white!important;border:1px solid #e1e1e7!important;border-radius:10px!important;text-align:left}.bh-project-card svg{color:#8691bd}.bh-project-card strong{display:block;font-size:14px}.bh-project-card small{display:block;color:#92929d;margin-top:6px;font-size:12px}
    @media(min-width:1450px){.bh-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    @media(max-width:1050px){#board-home{grid-template-columns:205px minmax(0,1fr)}.bh-content{padding:28px 24px}.bh-top{padding:0 24px}}
    @media(max-width:740px){#board-home{grid-template-columns:64px minmax(0,1fr)}.bh-side{padding:22px 8px}.bh-brand{margin:0 6px 28px}.bh-brand>span:last-child,.bh-workspace,.bh-nav button span,.bh-project-heading,.bh-projects,.bh-local-note{display:none}.bh-nav button{justify-content:center;padding:12px!important}.bh-top{height:66px;padding:0 18px}.bh-search{width:100%}.bh-offline{display:none}.bh-content{padding:24px 18px}.bh-heading h1{font-size:24px}.bh-grid{grid-template-columns:repeat(auto-fill,minmax(215px,1fr))}.bh-sort-view label{display:none}}
  `;
  document.head.append(style);
  const root = document.createElement("section"); root.id = "board-home"; root.hidden = true; root.setAttribute("aria-label", "Biblioteca de boards");
  root.innerHTML = `<aside class="bh-side"><div class="bh-brand"><span class="bh-brand-mark">${icon("board", 23)}</span><span>no teu cu e atiro</span></div><div class="bh-workspace"><span class="bh-avatar">B</span><div><strong>Meu espaço</strong></div></div><nav class="bh-nav" aria-label="Navegação da biblioteca">${[["home", "home", "Início"], ["recent", "recent", "Recentes"], ["starred", "star", "Favoritos"], ["projects", "folder", "Projetos"], ["trash", "trash", "Lixeira"]].map(([id, glyph, text]) => `<button data-section="${id}" aria-label="${text}" title="${text}">${icon(glyph!)}<span>${text}</span></button>`).join("")}</nav><div class="bh-project-heading"><span>Meus projetos</span><button data-action="new-project" aria-label="Criar projeto">${icon("plus", 17)}</button></div><div class="bh-projects"></div></aside><main class="bh-main"><header class="bh-top"><label class="bh-search">${icon("search", 18)}<input type="search" aria-label="Buscar boards" placeholder="Buscar boards" autocomplete="off"></label></header><div class="bh-content"></div></main>`;
  document.body.append(root);
  const menu = document.createElement("div"); menu.className = "bh-menu"; menu.hidden = true; menu.setAttribute("role", "menu"); document.body.append(menu);
  const homeButton = document.createElement("button"); homeButton.id = "board-home-trigger"; homeButton.title = "Voltar para a biblioteca"; homeButton.setAttribute("aria-label", "Início"); homeButton.innerHTML = icon("home", 18); homeButton.style.cssText = "width:40px;height:40px;display:grid;place-items:center;border:1px solid #e7e7e5;background:white;color:#42413a;cursor:pointer;border-radius:8px;box-shadow:var(--shadow-1)";
  document.getElementById("topbar")?.prepend(homeButton);
  homeButton.onclick = () => { void show().catch(report); };
  function toast(message: string) { for(const previous of document.querySelectorAll(".bh-toast"))previous.remove();const element = document.createElement("div"); element.className = "bh-toast"; element.textContent = message; element.setAttribute("role", "status"); document.body.append(element); setTimeout(() => element.remove(), 4500); }
  function report(error: unknown) { toast(error instanceof Error ? error.message : "Não foi possível concluir esta ação."); }
  function saveIndex() { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); }
  function meta(id = activeId): BoardMeta | undefined { return index.boards.find(board => board.id === id); }
  function groupName(id: string | null) { return index.projects.find(project => project.id === id)?.title ?? "Sem projeto"; }
  function editedLabel(time: number) {
    const days = Math.floor((Date.now() - time) / 86400000);
    if (days < 1) return "Editado hoje";
    if (days === 1) return "Editado ontem";
    return `Editado em ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(time)}`;
  }
  async function smallThumbnail(): Promise<string> {
    try {
      const source = await api.thumbnail(); if (!/^data:image\/(jpeg|png|webp|svg\+xml);base64,/.test(source)) return "";
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 420; canvas.height = 240;
      const context = canvas.getContext("2d")!; context.fillStyle = "#fbfaf7"; context.fillRect(0, 0, 420, 240);
      const scale = Math.min(420 / image.naturalWidth, 240 / image.naturalHeight);
      context.drawImage(image, (420 - image.naturalWidth * scale) / 2, (240 - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      return canvas.toDataURL("image/jpeg", .65);
    } catch { return ""; }
  }
  function dataWithTitle(value: unknown, title: string) { if (!value || typeof value !== "object") throw new Error("O conteúdo do board não pôde ser salvo."); return { ...value, title, savedAt: Date.now() }; }
  async function saveActive() {
    const board = meta(); if (!board) return;
    const captured = api.capture(); const title = titleOf((captured as { title?: unknown })?.title, board.title);
    await writeStoredBoard(boardKey(board.id), dataWithTitle(captured, title));
    board.title = title; board.editedAt = Date.now(); const thumb = await smallThumbnail(); if (thumb) board.thumbnail = thumb; saveIndex();
  }
  async function openBoard(id: string, changeHash = true) {
    if (busy) return; const board = meta(id); if (!board || board.trashedAt !== null) return;
    busy = true;
    try {
      beginTransition();
      if(activeId && activeId !== id) await saveActive();
      const value = await readStoredBoard(boardKey(id)); if (!value) throw new Error("O conteúdo deste board não foi encontrado neste navegador.");
      const previous = activeId; activeId = id;
      try { await api.open(dataWithTitle(value, board.title), id); } catch (error) { activeId = previous; throw error; }
      root.hidden = true; document.body.classList.remove("home-visible"); closeMenu();
      if (changeHash) history.pushState(null, "", `${location.pathname}${location.search}#board/${encodeURIComponent(id)}`);
      board.editedAt = Date.now(); saveIndex();
    } finally { try{endTransition();}finally{busy = false;} }
  }
  async function show() {
    if (busy) return; busy = true;
    try { beginTransition();await saveActive(); activeId = null; root.hidden = false; document.body.classList.add("home-visible"); history.replaceState(null, "", location.pathname + location.search); render(); }
    finally { try{endTransition();}finally{busy = false;} }
  }
  function updateCurrent(change: { title?: string } = {}) {
    if(transitioning)return;
    const board = meta(); if (!board) return;
    // A supplied name is metadata only. Capturing the complete board here
    // would clone embedded media and the journal just to read its title.
    const currentTitle = change.title ?? (api.capture() as { title?: unknown })?.title;
    board.title = titleOf(currentTitle, board.title); board.editedAt = Date.now();
    try { saveIndex(); } catch (error) { report(error); }
  }
  async function adoptCurrent(title?: string) {
    const captured=api.capture(),name=titleOf(title ?? (captured as {title?:unknown})?.title),id=crypto.randomUUID();
    await writeStoredBoard(boardKey(id),dataWithTitle(captured,name));
    const project=section.startsWith("project:")?section.slice(8):null;
    index.boards.unshift({id,title:name,createdAt:Date.now(),editedAt:Date.now(),starred:false,project:index.projects.some(p=>p.id===project)?project:null,trashedAt:null,thumbnail:await smallThumbnail()});
    saveIndex();await openBoard(id);
  }
  function restoreFocus(target:HTMLElement|null){
    let next=target?.isConnected&&!target.closest('[hidden]')?target:null;
    if(!next&&target){
      for(const attribute of ['data-more','data-project-more','aria-label','data-action']){const value=target.getAttribute(attribute);if(value){next=root.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]`);if(next)break;}}
    }
    next?.focus({preventScroll:true});
  }
  function closeMenu(restore=false) { menu.hidden = true;if(restore)restoreFocus(menuReturnFocus); }
  function closeModal(restore=true) { const target=modalReturnFocus;modal?.remove();modal=null;modalReturnFocus=null;if(restore)queueMicrotask(()=>restoreFocus(target)); }
  function openModal(title: string, content: string, submitLabel: string, submit: (form: HTMLFormElement) => Promise<void> | void) {
    const focused=document.activeElement as HTMLElement|null,target=focused&&menu.contains(focused)?menuReturnFocus:focused;
    closeModal(false);closeMenu();modalReturnFocus=target;const backdrop = document.createElement("div"); modal = backdrop; backdrop.className = "bh-modal"; backdrop.setAttribute("role", "dialog"); backdrop.setAttribute("aria-modal", "true"); backdrop.setAttribute("aria-label", title);
    backdrop.innerHTML = `<form class="bh-modal-card"><h2>${escapeHTML(title)}</h2>${content}<div class="bh-modal-actions"><button type="button" class="bh-secondary" data-cancel>Cancelar</button><button type="submit" class="bh-primary">${escapeHTML(submitLabel)}</button></div></form>`;
    const form = backdrop.querySelector("form")!; form.onsubmit = async event => { event.preventDefault(); const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!; button.disabled = true; try { await submit(form); closeModal(); } catch (error) { button.disabled = false; report(error); } };
    backdrop.querySelector<HTMLElement>("[data-cancel]")!.onclick = () => closeModal(); backdrop.onclick = event => { if (event.target === backdrop) closeModal(); }; document.body.append(backdrop);
    const input = form.querySelector<HTMLInputElement>("input");(input??form.querySelector<HTMLElement>('select,button,textarea'))?.focus();input?.select();
  }
  function projectOptions(selected: string | null = null) { return `<option value="">Sem projeto</option>${index.projects.map(project => `<option value="${escapeHTML(project.id)}" ${selected === project.id ? "selected" : ""}>${escapeHTML(project.title)}</option>`).join("")}`; }
  function buildBoard(title: string) {
    const widgets: Widget[] = [], connectors: Connector[] = [];
    return { title, widgets, order: [], connectors, connectorOrder: [], strokes: [], strokeOrder: [], groups: [], journal: { applied: [], undone: [] }, camera: { x: 0, y: 0, scale: 1 }, savedAt: Date.now() };
  }
  function createDialog() {
    const project = section.startsWith("project:") ? section.slice(8) : null;
    openModal("Criar board", `<label for="bh-board-name">Nome do board</label><input id="bh-board-name" name="title" maxlength="140" value="Board sem título" required><label for="bh-board-project">Projeto</label><select id="bh-board-project" name="project">${projectOptions(project)}</select>`, "Criar board", async form => {
      const fields = new FormData(form), title = titleOf(fields.get("title")), id = crypto.randomUUID(), value = buildBoard(title);
      const projectId = String(fields.get("project") ?? ""); const board: BoardMeta = { id, title, createdAt: Date.now(), editedAt: Date.now(), starred: false, project: index.projects.some(p => p.id === projectId) ? projectId : null, trashedAt: null, thumbnail: "" };
      await writeStoredBoard(boardKey(id), value); index.boards.unshift(board); saveIndex(); await openBoard(id);
    });
  }
  function projectDialog(project?: ProjectMeta) {
    openModal(project ? "Renomear projeto" : "Criar projeto", `<label for="bh-project-name">Nome do projeto</label><input id="bh-project-name" name="title" maxlength="140" value="${escapeHTML(project?.title ?? "Novo projeto")}" required>`, project ? "Salvar" : "Criar projeto", form => {
      const title = titleOf(new FormData(form).get("title"), "Projeto"); if (project) project.title = title; else index.projects.push({ id: crypto.randomUUID(), title }); saveIndex(); render();
    });
  }
  function renameBoard(board: BoardMeta) {
    openModal("Renomear board", `<label for="bh-rename">Nome do board</label><input id="bh-rename" name="title" maxlength="140" value="${escapeHTML(board.title)}" required>`, "Salvar", async form => {
      const title = titleOf(new FormData(form).get("title")); const data = await readStoredBoard(boardKey(board.id)); if (!data) throw new Error("Board não encontrado."); await writeStoredBoard(boardKey(board.id), dataWithTitle(data, title)); board.title = title; board.editedAt = Date.now(); saveIndex(); render();
    });
  }
  function moveBoard(board: BoardMeta) {
    openModal("Mover para projeto", `<label for="bh-move-project">Projeto</label><select id="bh-move-project" name="project">${projectOptions(board.project)}</select>`, "Mover board", form => { board.project = String(new FormData(form).get("project") ?? "") || null; saveIndex(); render(); });
  }
  async function duplicateBoard(board: BoardMeta) {
    const data = await readStoredBoard(boardKey(board.id)); if (!data) throw new Error("Board não encontrado."); const id = crypto.randomUUID(), title = `${board.title} — cópia`;
    await writeStoredBoard(boardKey(id), dataWithTitle(data, title)); index.boards.unshift({ ...board, id, title, starred: false, createdAt: Date.now(), editedAt: Date.now(), trashedAt: null }); saveIndex(); render(); toast("Board duplicado");
  }
  function toggleStar(board: BoardMeta) { board.starred = !board.starred; saveIndex(); render(); }
  function trashBoard(board: BoardMeta) { board.trashedAt = Date.now(); saveIndex(); render(); toast("Board movido para a lixeira. Você pode restaurá-lo."); }
  function restoreBoard(board: BoardMeta) { board.trashedAt = null; saveIndex(); render(); toast("Board restaurado"); }
  function openMenu(board: BoardMeta, x: number, y: number) {
    menuReturnFocus=root.querySelector<HTMLElement>(`[data-more="${CSS.escape(board.id)}"]`);
    const items = board.trashedAt !== null ? [["restore", "restore", "Restaurar board"]] : [["open", "board", "Abrir board"], ["rename", "edit", "Renomear"], ["duplicate", "copy", "Duplicar"], ["star", "star", board.starred ? "Remover dos favoritos" : "Adicionar aos favoritos"], ["move", "folder", "Mover para projeto"], ["trash", "trash", "Mover para a lixeira"]];
    menu.innerHTML = items.map(([action, glyph, label]) => `<button role="menuitem" data-board-action="${action}" ${action === "trash" ? 'class="danger"' : ""}>${icon(glyph!, 17)}<span>${label}</span></button>`).join("");
    menu.hidden = false; menu.style.left = `${Math.max(8, Math.min(innerWidth - 240, x))}px`; menu.style.top = `${Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, y))}px`;
    menu.onclick = event => { const action = (event.target as HTMLElement).closest<HTMLElement>("[data-board-action]")?.dataset.boardAction; closeMenu(); try { if (action === "open") void openBoard(board.id).catch(report); if (action === "rename") renameBoard(board); if (action === "duplicate") void duplicateBoard(board).catch(report); if (action === "star") toggleStar(board); if (action === "move") moveBoard(board); if (action === "trash") trashBoard(board); if (action === "restore") restoreBoard(board); } catch (error) { report(error); } };
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }
  function render() {
    closeMenu(); const projectId = section.startsWith("project:") ? section.slice(8) : null;
    for (const button of root.querySelectorAll<HTMLElement>("[data-section]")) button.setAttribute("aria-current", button.dataset.section === section ? "page" : "false");
    root.querySelector(".bh-projects")!.innerHTML = index.projects.map(project => `<div class="bh-project-row"><button class="bh-project" data-project="${escapeHTML(project.id)}" aria-current="${projectId === project.id ? "page" : "false"}">${icon("folder", 18)}<span>${escapeHTML(project.title)}</span></button><button class="bh-project-more" data-project-more="${escapeHTML(project.id)}" aria-label="Opções do projeto ${escapeHTML(project.title)}">${icon("more", 17)}</button></div>`).join("");
    const labels: Record<string, string> = { home: "Boards", recent: "Boards recentes", starred: "Favoritos", trash: "Lixeira", projects: "Projetos" };
    const title = projectId ? groupName(projectId) : labels[section] ?? labels.home!;
    const isTrash = section === "trash";
    let boards = index.boards.filter(board => isTrash ? board.trashedAt !== null : board.trashedAt === null);
    if (section === "starred") boards = boards.filter(board => board.starred);
    if (projectId) boards = boards.filter(board => board.project === projectId);
    const term = search.trim().toLocaleLowerCase("pt-BR"); if (term) boards = boards.filter(board => `${board.title} ${groupName(board.project)}`.toLocaleLowerCase("pt-BR").includes(term));
    boards.sort(index.sort === "title" ? (a, b) => a.title.localeCompare(b.title, "pt-BR") : index.sort === "created" ? (a, b) => b.createdAt - a.createdAt : (a, b) => b.editedAt - a.editedAt);
    let content = `<div class="bh-heading"><h1>${escapeHTML(title)}</h1>${!isTrash ? `<button class="bh-primary" data-action="${section === "projects" ? "new-project" : "new-board"}">${icon("plus", 18)}${section === "projects" ? "Criar projeto" : "Criar board"}</button>` : ""}</div>`;
    if (section === "projects") {
      const projects = index.projects.filter(project => !term || project.title.toLocaleLowerCase("pt-BR").includes(term));
      content += projects.length ? `<div class="bh-grid">${projects.map(project => `<button class="bh-project-card" data-project="${escapeHTML(project.id)}">${icon("folder", 34)}<span><strong>${escapeHTML(project.title)}</strong><small>${index.boards.filter(board => board.project === project.id && board.trashedAt === null).length} boards</small></span></button>`).join("")}</div>` : `<div class="bh-empty">${icon("folder")}<h2>Nenhum projeto</h2></div>`;
    } else {
      content += `<div class="bh-tools"><span class="bh-section-label">${term ? `${boards.length} resultados` : isTrash ? `${boards.length} boards na lixeira` : projectId ? `${boards.length} boards` : `${boards.length} ${boards.length === 1 ? "board" : "boards"}`}</span><div class="bh-sort-view"><label for="bh-sort">Ordenar por</label><select id="bh-sort" aria-label="Ordenar boards"><option value="edited" ${index.sort === "edited" ? "selected" : ""}>Última edição</option><option value="created" ${index.sort === "created" ? "selected" : ""}>Data de criação</option><option value="title" ${index.sort === "title" ? "selected" : ""}>Nome</option></select><span class="bh-view"><button data-view="grid" aria-label="Visualização em grade" aria-pressed="${index.view === "grid"}">${icon("grid", 16)}</button><button data-view="list" aria-label="Visualização em lista" aria-pressed="${index.view === "list"}">${icon("list", 16)}</button></span></div></div>`;
      content += boards.length ? `<div class="bh-grid ${index.view === "list" ? "bh-list" : ""}">${boards.map(board => `<article class="bh-card" data-card="${escapeHTML(board.id)}"><button class="bh-card-open" data-open="${escapeHTML(board.id)}" aria-label="${isTrash ? "Ver na lixeira" : "Abrir"} ${escapeHTML(board.title)}"><span class="bh-cover">${board.thumbnail ? `<img src="${escapeHTML(board.thumbnail)}" alt="" loading="lazy">` : `<span class="bh-cover-empty">${icon("board", 54)}</span>`}</span><span class="bh-card-body"><strong class="bh-card-title">${escapeHTML(board.title)}</strong><span class="bh-card-meta">${escapeHTML(groupName(board.project))} · ${isTrash ? "Na lixeira" : editedLabel(board.editedAt)}</span></span></button>${!isTrash ? `<button class="bh-card-star" data-star="${escapeHTML(board.id)}" aria-label="${board.starred ? "Remover dos favoritos" : "Favoritar"} ${escapeHTML(board.title)}" aria-pressed="${board.starred}">${icon("star", 16)}</button>` : ""}<span class="bh-card-actions"><button data-more="${escapeHTML(board.id)}" aria-label="Opções de ${escapeHTML(board.title)}">${icon("more", 18)}</button></span></article>`).join("")}</div>` : `<div class="bh-empty">${icon(term ? "search" : isTrash ? "trash" : section === "starred" ? "star" : "board")}<h2>${term ? "Nenhum board encontrado" : isTrash ? "Lixeira vazia" : section === "starred" ? "Nenhum favorito" : "Nenhum board"}</h2></div>`;
    }
    if (api.importFile && section !== "trash") content += `<button class="bh-secondary" style="margin-top:22px" data-action="import" aria-label="Importar board de arquivo" title="Importar board de arquivo">${icon("download", 15)} Importar</button>`;
    root.querySelector(".bh-content")!.innerHTML = content;
  }
  root.addEventListener("click", event => {
    const target = event.target as HTMLElement, button = target.closest<HTMLElement>("button"); if (!button) return;
    try {
      if (button.dataset.section) { section = button.dataset.section; render(); }
      if (button.dataset.project) { section = `project:${button.dataset.project}`; render(); }
      if (button.dataset.projectMore) {
        const project = index.projects.find(p => p.id === button.dataset.projectMore); if (!project) return;
        openModal("Gerenciar projeto", `<label for="bh-edit-project">Nome do projeto</label><input id="bh-edit-project" name="title" maxlength="140" value="${escapeHTML(project.title)}" required><label><input type="checkbox" name="remove" aria-label="Remover projeto e manter os boards fora dele" style="width:auto;height:auto;margin-right:7px">Remover projeto, mantendo os boards</label>`, "Salvar", form => { const fields = new FormData(form); if (fields.get("remove")) { index.projects = index.projects.filter(p => p.id !== project.id); for (const board of index.boards) if (board.project === project.id) board.project = null; if (section === `project:${project.id}`) section = "home"; } else project.title = titleOf(fields.get("title"), "Projeto"); saveIndex(); render(); });
      }
      if (button.dataset.view) { index.view = button.dataset.view === "list" ? "list" : "grid"; saveIndex(); render(); }
      if (button.dataset.action === "new-board") createDialog();
      if (button.dataset.action === "new-project") projectDialog();
      if (button.dataset.action === "import") api.importFile?.();
      if (button.dataset.open) { const board = meta(button.dataset.open); if (board?.trashedAt !== null && board) { const rect = button.getBoundingClientRect(); openMenu(board, rect.left + 20, rect.top + 25); } else void openBoard(button.dataset.open).catch(report); }
      if (button.dataset.star) { const board = meta(button.dataset.star); if (board) toggleStar(board); }
      if (button.dataset.more) { const board = meta(button.dataset.more); if (board) { const rect = button.getBoundingClientRect(); openMenu(board, rect.right - 220, rect.bottom + 5); } }
    } catch (error) { report(error); }
  });
  root.querySelector<HTMLInputElement>('[aria-label="Buscar boards"]')!.addEventListener("input", event => { search = (event.target as HTMLInputElement).value; render(); });
  root.addEventListener("change", event => { const input = event.target as HTMLSelectElement; if (input.id === "bh-sort") { index.sort = input.value as HomeIndex["sort"]; try { saveIndex(); render(); } catch (error) { report(error); } } });
  root.addEventListener("contextmenu", event => { const card = (event.target as HTMLElement).closest<HTMLElement>("[data-card]"); if (!card) return; event.preventDefault(); const board = meta(card.dataset.card); if (board) openMenu(board, event.clientX, event.clientY); });
  document.addEventListener("pointerdown", event => { if (!menu.contains(event.target as Node)) closeMenu(); });
  document.addEventListener("keydown", event => {
    if(root.hidden&&!modal)return;
    const externalDialog=(event.target as Element|null)?.closest?.('dialog[open],[role="dialog"][aria-modal="true"]');if(externalDialog&&externalDialog!==modal)return;
    if(event.key==='Escape'){event.preventDefault();if(modal)closeModal();else closeMenu(true);event.stopPropagation();return;}
    if(modal&&event.key==='Tab'){
      const controls=[...modal.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(control=>control.getClientRects().length>0),index=controls.indexOf(document.activeElement as HTMLElement);
      if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&(index<0||index===controls.length-1)){event.preventDefault();controls[0]?.focus();}
    }
    if(!root.hidden||modal)event.stopPropagation();
  }, true);
  window.addEventListener("hashchange", () => { const match = location.hash.match(/^#board\/(.+)$/); if (match) { let id: string; try { id = decodeURIComponent(match[1]!); } catch { return; } if (id !== activeId) void openBoard(id, false).catch(report); } else if (activeId) void show().catch(report); });

  async function start() {
    root.hidden = false; document.body.classList.add("home-visible"); render();
    if (!index.migratedLegacy) {
      try {
        const legacy = await readStoredBoard("board-app:v1");
        if (legacy && !meta("legacy")) {
          const title = titleOf((legacy as { title?: unknown }).title, "Meu board anterior");
          await writeStoredBoard(boardKey("legacy"), dataWithTitle(legacy, title));
          index.boards.unshift({ id: "legacy", title, createdAt: Date.now(), editedAt: Date.now(), starred: false, project: null, trashedAt: null, thumbnail: "" });
        }
        index.migratedLegacy = true; saveIndex();
      } catch (error) { report(error); }
    }
    const match = location.hash.match(/^#board\/(.+)$/);
    if (match) {
      try { const id = decodeURIComponent(match[1]!); if (meta(id)?.trashedAt === null) { await openBoard(id, false); return; } } catch (error) { report(error); }
      history.replaceState(null, "", location.pathname + location.search);
    }
    render();
  }
  return { start, show, adoptCurrent, transitioning:()=>transitioning,currentKey: () => activeId ? boardKey(activeId) : "board-app:v1", currentId: () => activeId, updateCurrent };
}
