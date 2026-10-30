/**
 * Command bus + histórico.
 *
 * Padrão extraído do Miro: nenhuma mutação acontece fora de um comando.
 *   commander.exec("WIDGET_CREATE" | "WIDGET_UPDATE" | "WIDGET_REMOVE" | ...)
 * Cada comando devolve o seu inverso, e o undo é só executar inversos.
 */

import type { Widget } from "./model";
import {
  resolveEndpoint,
  type Connector,
  type Endpoint,
} from "./connectors";
import type { Stroke } from "./strokes";
import { DEFAULT_BACKGROUND, validateBoardBackground, type BoardBackground, type BackgroundPatch } from "./background";

export type CommandOp =
  | "BATCH"
  | "BACKGROUND_UPDATE"
  | "WIDGET_CREATE"
  | "WIDGET_UPDATE"
  | "WIDGET_REMOVE"
  | "WIDGET_TRANSLATE"
  | "WIDGET_REORDER"
  | "WIDGET_ALIGN"
  | "WIDGET_DISTRIBUTE"
  | "CONNECTOR_CREATE"
  | "CONNECTOR_UPDATE"
  | "CONNECTOR_REMOVE"
  | "STROKE_CREATE"
  | "STROKE_REMOVE"
  | "STROKE_UPDATE"
  | "GROUP_CREATE"
  | "GROUP_REMOVE"
  | "SELECTION_SET";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "x" | "y";

export interface BoardState {
  /** Optional for projects saved before background controls existed. */
  background?: BoardBackground;
  widgets: Map<string, Widget>;
  order: string[];
  connectors: Map<string, Connector>;
  connectorOrder: string[];
  strokes: Map<string, Stroke>;
  strokeOrder: string[];
  /** grupos lógicos: id do grupo → ids dos membros */
  groups: Map<string, string[]>;
  selection: Set<string>;
}

export interface Command<Payload = unknown> {
  op: CommandOp;
  payload: Payload;
}

export interface ExecutedCommand {
  label: string;
  command: Command;
  redo: () => void;
  undo: () => void;
}

function removeGroupMember(state:BoardState,id:string):void {
  let gone=[id];while(gone.length){const next:string[]=[];for(const [gid,members] of state.groups){const remaining=members.filter(m=>!gone.includes(m));if(!remaining.length){state.groups.delete(gid);next.push(gid);}else if(remaining.length!==members.length)state.groups.set(gid,remaining);}gone=next;}
}
export class CommandBus {
  readonly undoStack: ExecutedCommand[] = [];
  readonly redoStack: ExecutedCommand[] = [];
  private prefixApplied: Command[] = [];
  private transaction: { label: string; entries: ExecutedCommand[] } | null = null;

  constructor(
    private readonly state: BoardState,
    private readonly onChange: () => void,
    private readonly limit = 500,
  ) {}

  private topZ(): number {
    let max = 0;
    for (const id of this.state.order) {
      const w = this.state.widgets.get(id);
      if (w) max = Math.max(max, w.z);
    }
    return max;
  }

  exec(command: Command): void {
    const executed = this.execute(command);
    if (!executed) return;
    executed.redo();
    if (this.transaction) this.transaction.entries.push({ ...executed, command });
    else this.pushUndo({ ...executed, command });
    this.redoStack.length = 0;
    this.onChange();
  }

  private pushUndo(entry: ExecutedCommand): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.prefixApplied.push(this.undoStack.shift()!.command);
  }

  /** Groups a pointer gesture into one undo step while preserving live previews. */
  beginTransaction(label = "edit"): void {
    this.endTransaction();
    this.transaction = { label, entries: [] };
  }

  endTransaction(): void {
    const pending = this.transaction;
    this.transaction = null;
    if (!pending?.entries.length) return;
    const entries = pending.entries;
    this.pushUndo({
      label: pending.label,
      command: { op: "BATCH", payload: { label: pending.label, commands: entries.map(entry => entry.command) } },
      redo: () => { for (const entry of entries) entry.redo(); },
      undo: () => { for (const entry of [...entries].reverse()) entry.undo(); },
    });
    this.onChange();
  }

  /** Constrói o par redo/undo sem mutar o estado. Quem aplica é o chamador. */
  private execute(command: Command): ExecutedCommand | null {
    const s = this.state;

    switch (command.op) {
      case "BACKGROUND_UPDATE": {
        const before = s.background ? structuredClone(s.background) : undefined;
        const after = validateBoardBackground({ ...(s.background ?? DEFAULT_BACKGROUND), ...(command.payload as BackgroundPatch) });
        if (!after) return null;
        return { command, label: "Alterar fundo", redo: () => { s.background = structuredClone(after); }, undo: () => { if (before) s.background = structuredClone(before); else delete s.background; } };
      }
      case "BATCH": {
        const { label, commands } = command.payload as { label?: string; commands: Command[] };
        let entries: ExecutedCommand[] | null = null;
        return {
          command,
          label: label ?? "edit",
          redo: () => {
            if (entries) {
              for (const entry of entries) entry.redo();
            } else {
              entries = [];
              for (const child of commands) {
                const entry = this.execute(child);
                if (entry) { entry.redo(); entries.push(entry); }
              }
            }
          },
          undo: () => { for (const entry of [...(entries ?? [])].reverse()) entry.undo(); },
        };
      }
      case "WIDGET_CREATE": {
        const widget = command.payload as Widget;
        const placed: Widget = { ...widget, z: this.topZ() + 1 };
        const index = s.order.length;
        return {
          command,
          label: `create ${placed.type}`,
          redo: () => {
            s.widgets.set(placed.id, placed);
            if (!s.order.includes(placed.id)) s.order.push(placed.id);
          },
          undo: () => {
            s.widgets.delete(placed.id);
            s.order = s.order.filter((id) => id !== placed.id);
            s.selection.delete(placed.id);
          },
        };
      }

      case "WIDGET_REMOVE": {
        const id = command.payload as string;
        const groupsBefore=[...s.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
        const widget = s.widgets.get(id);
        if (!widget) return null;
        const index = s.order.indexOf(id);

        // conectores presos a este objeto viram pontas soltas (não somem)
        const detached: Array<{ connector: Connector; endpoint: Endpoint }> = [];
        for (const connector of s.connectors.values()) {
          for (const endpoint of [connector.start, connector.end]) {
            if (endpoint.kind === "anchor" && endpoint.widgetId === id) {
              const resolved = resolveEndpoint(endpoint, s.widgets);
              if (resolved) {
                detached.push({
                  connector,
                  endpoint: { kind: "point", x: resolved.x, y: resolved.y },
                });
              }
            }
          }
        }
        const before = detached.map(({ connector }) => ({ id: connector.id, start: connector.start, end: connector.end }));

        return {
          command,
          label: `remove ${widget.type}`,
          redo: () => {
            for (const { connector, endpoint } of detached) {
              const current = s.connectors.get(connector.id);
              if (!current) continue;
              const patch =
                connector.start.kind === "anchor" && connector.start.widgetId === id
                  ? { start: endpoint }
                  : { end: endpoint };
              s.connectors.set(connector.id, { ...current, ...patch });
            }
            s.widgets.delete(id);
            s.order = s.order.filter((x) => x !== id);
            s.selection.delete(id);removeGroupMember(s,id);
          },
          undo: () => {
            s.groups=new Map(groupsBefore.map(([gid,members])=>[gid,[...members]]));
            s.widgets.set(id, widget);
            s.order.splice(Math.max(0, index), 0, id);
            for (const snapshot of before) {
              const current = s.connectors.get(snapshot.id);
              if (!current) continue;
              s.connectors.set(snapshot.id, { ...current, start: snapshot.start, end: snapshot.end });
            }
          },
        };
      }

      case "CONNECTOR_CREATE": {
        const connector = command.payload as Connector;
        const z = this.topZ() + 1;
        const placed: Connector = { ...connector, z };
        return {
          command,
          label: "create connector",
          redo: () => {
            s.connectors.set(placed.id, placed);
            if (!s.connectorOrder.includes(placed.id)) s.connectorOrder.push(placed.id);
          },
          undo: () => {
            s.connectors.delete(placed.id);
            s.connectorOrder = s.connectorOrder.filter((id) => id !== placed.id);
            s.selection.delete(placed.id);
          },
        };
      }

      case "CONNECTOR_UPDATE": {
        const { id, patch } = command.payload as { id: string; patch: Partial<Connector> };
        const connector = s.connectors.get(id);
        if (!connector) return null;
        const before = { ...connector };
        const after = { ...connector, ...patch };
        return {
          command,
          label: "update connector",
          redo: () => void s.connectors.set(id, { ...after }),
          undo: () => void s.connectors.set(id, { ...before }),
        };
      }

      case "GROUP_CREATE": {
        const { id, items } = command.payload as { id: string; items: string[] };
        const before=s.groups.get(id);
        return {
          command,
          label: `group ${items.length}`,
          redo: () => void s.groups.set(id, [...items]),
          undo: () => {if(before)s.groups.set(id,[...before]);else s.groups.delete(id);},
        };
      }

      case "GROUP_REMOVE": {
        const id = command.payload as string;
        const items = s.groups.get(id);
        if (!items) return null;
        const parents=[...s.groups].filter(([,members])=>members.includes(id)).map(([gid,members])=>[gid,[...members]] as const);
        return {
          command,
          label: "ungroup",
          redo: () => {s.groups.delete(id);for(const [gid,members] of parents)s.groups.set(gid,[...new Set(members.flatMap(m=>m===id?items:[m]))]);},
          undo: () => {s.groups.set(id,[...items]);for(const [gid,members] of parents)s.groups.set(gid,[...members]);},
        };
      }

      case "STROKE_UPDATE": {
        const {id,patch}=command.payload as {id:string;patch:Partial<Stroke>};const before=s.strokes.get(id);if(!before)return null;const after={...before,...patch};
        return {command,label:'update stroke',redo:()=>void s.strokes.set(id,after),undo:()=>void s.strokes.set(id,before)};
      }
      case "STROKE_CREATE": {
        const stroke = command.payload as Stroke;
        const placed: Stroke = { ...stroke, z: this.topZ() + 1 };
        return {
          command,
          label: "create stroke",
          redo: () => {
            s.strokes.set(placed.id, placed);
            if (!s.strokeOrder.includes(placed.id)) s.strokeOrder.push(placed.id);
          },
          undo: () => {
            s.strokes.delete(placed.id);
            s.strokeOrder = s.strokeOrder.filter((id) => id !== placed.id);
            s.selection.delete(placed.id);
          },
        };
      }

      case "STROKE_REMOVE": {
        const id = command.payload as string;
        const groupsBefore=[...s.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
        const stroke = s.strokes.get(id);
        if (!stroke) return null;
        const index = s.strokeOrder.indexOf(id);
        return {
          command,
          label: "remove stroke",
          redo: () => {
            s.strokes.delete(id);
            s.strokeOrder = s.strokeOrder.filter((x) => x !== id);
            s.selection.delete(id);removeGroupMember(s,id);
          },
          undo: () => {
            s.groups=new Map(groupsBefore.map(([gid,members])=>[gid,[...members]]));
            s.strokes.set(id, stroke);
            s.strokeOrder.splice(Math.max(0, index), 0, id);
          },
        };
      }

      case "CONNECTOR_REMOVE": {
        const id = command.payload as string;
        const groupsBefore=[...s.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
        const connector = s.connectors.get(id);
        if (!connector) return null;
        const index = s.connectorOrder.indexOf(id);
        return {
          command,
          label: "remove connector",
          redo: () => {
            s.connectors.delete(id);
            s.connectorOrder = s.connectorOrder.filter((x) => x !== id);
            s.selection.delete(id);removeGroupMember(s,id);
          },
          undo: () => {
            s.groups=new Map(groupsBefore.map(([gid,members])=>[gid,[...members]]));
            s.connectors.set(id, connector);
            s.connectorOrder.splice(Math.max(0, index), 0, id);
          },
        };
      }

      case "WIDGET_UPDATE": {
        const { id, patch } = command.payload as { id: string; patch: Partial<Widget> };
        const widget = s.widgets.get(id);
        if (!widget) return null;
        const before = { ...widget } as Widget;
        const after = { ...widget, ...patch } as Widget;
        return {
          command,
          label: `update ${widget.type}`,
          redo: () => void s.widgets.set(id, { ...after }),
          undo: () => void s.widgets.set(id, { ...before }),
        };
      }

      case "WIDGET_TRANSLATE": {
        const { ids, dx, dy } = command.payload as { ids: string[]; dx: number; dy: number };
        return {
          command,
          label: `move ${ids.length}`,
          redo: () => {
            for (const id of ids) {
              const w = s.widgets.get(id);
              if (w) s.widgets.set(id, { ...w, x: w.x + dx, y: w.y + dy });
            }
          },
          undo: () => {
            for (const id of ids) {
              const w = s.widgets.get(id);
              if (w) s.widgets.set(id, { ...w, x: w.x - dx, y: w.y - dy });
            }
          },
        };
      }

      case "WIDGET_REORDER": {
        const { ids, direction } = command.payload as {
          ids: string[];
          direction: "front" | "back" | "forward" | "backward";
        };
        const before = [...s.order];
        const after = reorder(before, ids, direction);
        const beforeZ = new Map(before.map(id => [id, s.widgets.get(id)?.z ?? 0]));
        const apply = (order: string[], restoreZ = false): void => {
          s.order = [...order];
          order.forEach((id, index) => {
            const widget = s.widgets.get(id);
            if (widget) s.widgets.set(id, { ...widget, z: restoreZ ? beforeZ.get(id)! : index + 1 });
          });
        };
        return {
          command,
          label: `reorder ${direction}`,
          redo: () => {
            apply(after);
          },
          undo: () => {
            apply(before, true);
          },
        };
      }

      case "WIDGET_ALIGN": {
        const { ids, mode } = command.payload as { ids: string[]; mode: AlignMode };
        const widgets = ids.map((id) => s.widgets.get(id)).filter((w): w is Widget => Boolean(w));
        if (widgets.length < 2) return null;

        const minX = Math.min(...widgets.map((w) => w.x));
        const maxX = Math.max(...widgets.map((w) => w.x + w.width));
        const minY = Math.min(...widgets.map((w) => w.y));
        const maxY = Math.max(...widgets.map((w) => w.y + w.height));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const before = widgets.map((w) => ({ id: w.id, x: w.x, y: w.y }));
        const after = widgets.map((w) => {
          switch (mode) {
            case "left":
              return { id: w.id, x: minX, y: w.y };
            case "right":
              return { id: w.id, x: maxX - w.width, y: w.y };
            case "hcenter":
              return { id: w.id, x: centerX - w.width / 2, y: w.y };
            case "top":
              return { id: w.id, x: w.x, y: minY };
            case "bottom":
              return { id: w.id, x: w.x, y: maxY - w.height };
            case "vcenter":
              return { id: w.id, x: w.x, y: centerY - w.height / 2 };
            default:
              return { id: w.id, x: w.x, y: w.y };
          }
        });

        const apply = (positions: Array<{ id: string; x: number; y: number }>) => {
          for (const p of positions) {
            const w = s.widgets.get(p.id);
            if (w) s.widgets.set(p.id, { ...w, x: p.x, y: p.y });
          }
        };

        return {
          command,
          label: `align ${mode}`,
          redo: () => apply(after),
          undo: () => apply(before),
        };
      }

      case "WIDGET_DISTRIBUTE": {
        const { ids, axis } = command.payload as { ids: string[]; axis: DistributeAxis };
        const widgets = ids.map((id) => s.widgets.get(id)).filter((w): w is Widget => Boolean(w));
        if (widgets.length < 3) return null;

        const key = axis === "x" ? "x" : "y";
        const size = axis === "x" ? "width" : "height";
        const sorted = [...widgets].sort((a, b) => a[key] - b[key]);
        const first = sorted[0]!;
        const last = sorted[sorted.length - 1]!;

        const span = last[key] + last[size] - first[key];
        const totalSize = sorted.reduce((acc, w) => acc + w[size], 0);
        const gap = (span - totalSize) / (sorted.length - 1);

        const before = widgets.map((w) => ({ id: w.id, x: w.x, y: w.y }));
        let cursor = first[key];
        const after = sorted.map((w) => {
          const position = cursor;
          cursor += w[size] + gap;
          return axis === "x"
            ? { id: w.id, x: position, y: w.y }
            : { id: w.id, x: w.x, y: position };
        });

        const apply = (positions: Array<{ id: string; x: number; y: number }>) => {
          for (const p of positions) {
            const w = s.widgets.get(p.id);
            if (w) s.widgets.set(p.id, { ...w, x: p.x, y: p.y });
          }
        };

        return {
          command,
          label: `distribute ${axis}`,
          redo: () => apply(after),
          undo: () => apply(before),
        };
      }

      case "SELECTION_SET": {
        const next = command.payload as string[];
        const before = [...s.selection];
        return {
          command,
          label: "selection",
          redo: () => {
            s.selection = new Set(next);
          },
          undo: () => {
            s.selection = new Set(before);
          },
        };
      }

      default:
        return null;
    }
  }

  undo(): void {
    this.endTransaction();
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange();
  }

  redo(): void {
    this.endTransaction();
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    this.onChange();
  }

  /** Journal serializável: o que foi aplicado e o que foi desfeito. */
  snapshot(): { applied: Command[]; undone: Command[] } {
    return {
      // seleção não é conteúdo: não polui o journal persistido
      applied: [
        ...this.prefixApplied,
        ...this.undoStack.map((entry) => entry.command),
        ...(this.transaction?.entries.length ? [{ op: "BATCH" as const, payload: { label: this.transaction.label, commands: this.transaction.entries.map(entry => entry.command) } }] : []),
      ].filter((c) => c.op !== "SELECTION_SET"),
      undone: this.redoStack.map((entry) => entry.command).filter((c) => c.op !== "SELECTION_SET"),
    };
  }

  /** Reconstrói estado e pilhas executando o journal do zero. */
  restore(applied: Command[], undone: Command[]): void {
    this.transaction = null;
    this.prefixApplied = [];
    this.undoStack.length = 0;
    this.redoStack.length = 0;

    for (const command of applied) {
      const executed = this.execute(command);
      if (!executed) continue;
      executed.redo();
      this.pushUndo({ ...executed, command });
    }

    const replayed: ExecutedCommand[] = [];
    // The end of the redo stack is the next command, so replay in reverse order
    // to reconstruct every inverse against its actual preceding state.
    for (const command of [...undone].reverse()) {
      const executed = this.execute(command);
      if (!executed) continue;
      executed.redo();
      replayed.push({ ...executed, command });
    }
    for (const executed of [...replayed].reverse()) executed.undo();
    this.redoStack.push(...replayed.reverse());
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

/** Reordena o array de z-order mantendo os não selecionados no lugar. */
export function reorder(
  order: string[],
  ids: string[],
  direction: "front" | "back" | "forward" | "backward",
): string[] {
  const moving = new Set(ids.filter((id) => order.includes(id)));
  if (moving.size === 0) return order;

  if (direction === "front" || direction === "back") {
    const rest = order.filter((id) => !moving.has(id));
    const picked = order.filter((id) => moving.has(id));
    return direction === "front" ? [...rest, ...picked] : [...picked, ...rest];
  }

  const out = [...order];
  if (direction === "forward") {
    for (let i = out.length - 2; i >= 0; i--) {
      if (moving.has(out[i]!) && !moving.has(out[i + 1]!)) {
        [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
      }
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (moving.has(out[i]!) && !moving.has(out[i - 1]!)) {
        [out[i], out[i - 1]] = [out[i - 1]!, out[i]!];
      }
    }
  }
  return out;
}
