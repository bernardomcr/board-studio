import type { BoardState, Command } from './commands';
import type { Widget } from './model';
import type { Connector } from './connectors';
import type { Stroke } from './strokes';
import { SHAPE_OPTIONS } from './model';
import { groupLeaves } from './groups';

export type LayerEntity = (Widget | Connector | Stroke) & { name?: string; hidden?: boolean };
export type LayerDestination = 'front' | 'back' | 'forward' | 'backward' | { targetId: string; position: 'before' | 'after' };
export interface LayerNode { id: string; children?: LayerNode[]; z: number }

export function layerEntity(state: BoardState, id: string): LayerEntity | undefined {
  return state.widgets.get(id) ?? state.connectors.get(id) ?? state.strokes.get(id);
}

/** Bottom to top, matching the global z values used by the canvas. */
export function orderEntities(state: BoardState): string[] {
  const ids = [...state.strokeOrder, ...state.connectorOrder, ...state.order];
  const ordered = [...new Set(ids)].filter(id => !!layerEntity(state, id));
  return ordered.sort((a, b) => layerEntity(state, a)!.z - layerEntity(state, b)!.z);
}

export function layerLabel(state: BoardState, id: string): string {
  if (state.groups.has(id)) return 'Grupo';
  const item = layerEntity(state, id);
  if (!item) return 'Camada';
  if (item.name?.trim()) return item.name.trim();
  if (item.type === 'connector') return item.captions?.find(text => text.trim())?.trim().slice(0, 80) ?? 'Conector';
  if (item.type === 'stroke') return item.tool === 'highlighter' ? 'Marca-texto' : 'Traço';
  if (item.type === 'frame') return item.title.trim() || 'Quadro';
  if (item.type === 'image') return 'Imagem';
  const text = item.content.replace(/[*_~`]/g, '').trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 80);
  if (item.type === 'shape') return SHAPE_OPTIONS.find(shape => shape.id === item.shape)?.label ?? 'Forma';
  return item.type === 'text' ? 'Texto' : 'Nota adesiva';
}

/** Top to bottom. Groups are a display hierarchy; members retain their own identity. */
export function layerTree(state: BoardState): LayerNode[] {
  const parented = new Set([...state.groups.values()].flat());
  const seen = new Set<string>();
  const node = (id: string): LayerNode | null => {
    if (seen.has(id)) return null;
    seen.add(id);
    const members = state.groups.get(id);
    if (members) {
      const children = members.map(node).filter((item): item is LayerNode => !!item).sort((a, b) => b.z - a.z);
      return children.length ? { id, children, z: Math.max(...children.map(item => item.z)) } : null;
    }
    const entity = layerEntity(state, id);
    return entity ? { id, z: entity.z } : null;
  };
  return [...state.groups.keys(), ...orderEntities(state)]
    .filter(id => !parented.has(id))
    .map(node).filter((item): item is LayerNode => !!item).sort((a, b) => b.z - a.z);
}

export function layerUpdateCommand(state: BoardState, id: string, patch: Record<string, unknown>): Command {
  return { op: state.widgets.has(id) ? 'WIDGET_UPDATE' : state.connectors.has(id) ? 'CONNECTOR_UPDATE' : 'STROKE_UPDATE', payload: { id, patch } };
}

/** Build one reversible z-order action for every entity kind, including complete groups. */
export function reorderLayerCommands(state: BoardState, ids: string[], destination: LayerDestination): Command[] {
  const selected = new Set(ids.flatMap(id => groupLeaves(state, id)));
  if (!selected.size || [...selected].some(id => layerEntity(state, id)?.locked)) return [];
  const order = orderEntities(state), moved = order.filter(id => selected.has(id));
  const remaining = order.filter(id => !selected.has(id));
  if (!moved.length || !remaining.length) return [];
  let at: number;
  if (destination === 'front') at = remaining.length;
  else if (destination === 'back') at = 0;
  else if (destination === 'forward') {
    const highest = Math.max(...moved.map(id => order.indexOf(id)));
    const next = order.slice(highest + 1).find(id => !selected.has(id));
    if (!next) return [];
    at = remaining.indexOf(next) + 1;
  } else if (destination === 'backward') {
    const lowest = Math.min(...moved.map(id => order.indexOf(id)));
    const previous = order.slice(0, lowest).reverse().find(id => !selected.has(id));
    if (!previous) return [];
    at = remaining.indexOf(previous);
  } else {
    const target = groupLeaves(state, destination.targetId).filter(id => !selected.has(id));
    if (!target.length) return [];
    const positions = target.map(id => remaining.indexOf(id)).filter(index => index >= 0);
    if (!positions.length) return [];
    at = destination.position === 'after' ? Math.max(...positions) + 1 : Math.min(...positions);
  }
  const next = [...remaining.slice(0, at), ...moved, ...remaining.slice(at)];
  if (next.every((id, index) => id === order[index])) return [];
  return next.flatMap((id, index) => layerEntity(state, id)!.z === index + 1 ? [] : [layerUpdateCommand(state, id, { z: index + 1 })]);
}
