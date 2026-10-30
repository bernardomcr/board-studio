import type { BoardState, CommandBus } from "./core/commands";
import type { Camera } from "./core/camera";
import { facingAnchor, resolveEndpoint, type Connector, type Endpoint } from "./core/connectors";
import { createWidget, type ShapeWidget, type Widget } from "./core/model";
import { shapeIconSvg } from "./core/shapes";

interface CompletionOptions {
  state: BoardState;
  bus: CommandBus;
  camera: Camera;
  onContinue?: (endpoint: Endpoint) => void;
}

type Choice = "rectangle" | "circle" | "triangle" | "rhombus" | "sticky_note" | "text";
const choices: Array<{ id: Choice; label: string; icon: string }> = [
  { id: "rectangle", label: "Retângulo", icon: shapeIconSvg("rectangle") },
  { id: "circle", label: "Elipse / círculo", icon: shapeIconSvg("circle") },
  { id: "triangle", label: "Triângulo", icon: shapeIconSvg("triangle") },
  { id: "rhombus", label: "Losango", icon: shapeIconSvg("rhombus") },
  { id: "sticky_note", label: "Nota adesiva", icon: '<svg viewBox="0 0 36 32" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2h30v20l-8 8H3Z M25 30v-8h8"/></svg>' },
  { id: "text", label: "Texto", icon: '<svg viewBox="0 0 36 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4h24M18 4v24M12 28h12"/></svg>' },
];

/** Offers a real destination object after dragging a connector onto empty space. */
export function installConnectorCompletion(options: CompletionOptions): { show(connectorId: string): void; close(): void } {
  const { state, bus, camera } = options;
  const style = document.createElement("style");
  style.textContent = `
    #connector-completion{position:fixed;z-index:38;width:246px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:12px;background:#fff;border:1px solid #e7e7e5;border-radius:12px;box-shadow:0 5px 20px #19181224;color:#292823;font:12px Inter,'Segoe UI',sans-serif}
    #connector-completion[hidden]{display:none}
    #connector-completion header{display:flex;align-items:center;justify-content:space-between;margin:0 0 9px;font-weight:600}
    #connector-completion button{font:inherit;cursor:pointer;color:inherit;background:none;border:1px solid transparent;border-radius:6px}
    #connector-completion button:hover{background:#f2f4fc;color:#3859ff;border-color:#dde2ff}
    #connector-completion button:focus-visible{outline:2px solid #3859ff;outline-offset:1px}
    #connector-completion .completion-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
    #connector-completion .completion-choice{height:59px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10px;padding:4px}
    #connector-completion svg{width:31px;height:27px}
    #connector-completion [data-completion-close]{padding:1px 5px;font-size:17px}
    #connector-completion [data-completion-continue]{margin-top:10px;padding:7px 8px;width:100%;border-top-color:#e7e7e5}
    #connector-completion .completion-note{margin:9px 0 0;color:#73726c;font-size:10px;line-height:1.4}
  `;
  document.head.append(style);
  const panel = document.createElement("section");
  panel.id = "connector-completion";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Adicionar objeto conectado");
  panel.innerHTML = `<header>Adicionar objeto conectado<button data-completion-close aria-label="Fechar opções de destino">×</button></header><div class="completion-choices">${choices.map(choice => `<button class="completion-choice" data-completion-shape="${choice.id}" aria-label="Conectar a ${choice.label}">${choice.icon}<span>${choice.label}</span></button>`).join("")}</div>${options.onContinue ? '<button data-completion-continue>Continuar conexão →</button>' : ''}<p class="completion-note">Escolha um objeto ou clique fora para manter a ponta livre.</p>`;
  document.body.append(panel);
  let currentId: string | null = null;
  let currentWhich: "start" | "end" = "end";

  function close(): void { panel.hidden = true; currentId = null; }

  function current(): { connector: Connector; free: Extract<Endpoint, { kind: "point" }>; other: Endpoint; which: "start" | "end" } | null {
    const connector = currentId ? state.connectors.get(currentId) : undefined;
    if (!connector || connector.locked) return null;
    const free = connector[currentWhich];
    return free.kind === "point" ? { connector, free, other: connector[currentWhich === "start" ? "end" : "start"], which: currentWhich } : null;
  }

  function show(connectorId: string): void {
    const connector = state.connectors.get(connectorId);
    if (!connector || connector.locked || (connector.end.kind !== "point" && connector.start.kind !== "point")) { close(); return; }
    currentId = connectorId;
    currentWhich = connector.end.kind === "point" ? "end" : "start";
    const endpoint = connector[currentWhich];
    const point = camera.worldToScreen(endpoint);
    panel.hidden = false;
    const width = panel.offsetWidth, height = panel.offsetHeight;
    // Prefer the right of the destination, then flip to the left near the edge.
    const left = point.x + width + 20 < window.innerWidth ? point.x + 16 : point.x - width - 16;
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, left))}px`;
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, point.y - 30))}px`;
  }

  function createDestination(choice: Choice): void {
    const pending = current();
    if (!pending) { close(); return; }
    const source = pending.other.kind === "anchor" ? state.widgets.get(pending.other.widgetId) : undefined;
    const type = choice === "sticky_note" || choice === "text" ? choice : "shape";
    const width = type === "text" ? 200 : type === "sticky_note" ? 160 : source?.type === "shape" ? source.width : 180;
    const height = type === "text" ? 48 : type === "sticky_note" ? 160 : source?.type === "shape" ? source.height : 110;
    const widget = createWidget(type, {
      x: pending.free.x - width / 2, y: pending.free.y - height / 2,
      width, height, shape: choice as ShapeWidget["shape"], content: type === "text" ? "Texto" : "",
    });
    inheritStyle(widget, source);
    const towards = resolveEndpoint(pending.other, state.widgets) ?? { x: pending.free.x - width, y: pending.free.y };
    const anchor: Endpoint = { kind: "anchor", widgetId: widget.id, ...facingAnchor(widget, towards) };
    // One serialized action: undo removes the destination and restores the free endpoint.
    bus.exec({ op: "BATCH", payload: { label: "Criar objeto conectado", commands: [
      { op: "WIDGET_CREATE", payload: widget },
      { op: "CONNECTOR_UPDATE", payload: { id: pending.connector.id, patch: { [pending.which]: anchor } } },
      { op: "SELECTION_SET", payload: [widget.id] },
    ] } });
    close();
  }

  panel.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.hasAttribute("data-completion-close")) { close(); return; }
    if (button.hasAttribute("data-completion-continue")) {
      const pending = current(); const endpoint = pending ? { ...pending.free } : null;
      close(); if (endpoint) options.onContinue?.(endpoint); return;
    }
    const choice = button.dataset.completionShape;
    if (choices.some(item => item.id === choice)) createDestination(choice as Choice);
  });
  document.addEventListener("pointerdown", event => { if (!panel.hidden && !panel.contains(event.target as Node)) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) {event.preventDefault();event.stopPropagation();close();} });
  window.addEventListener("resize", close);
  return { show, close };
}

function inheritStyle(widget: Widget, source: Widget | undefined): void {
  if (!source) return;
  if (widget.type === "shape" && source.type === "shape") widget.style = { ...source.style };
  else {
    const { color, fontFamily, fontSize, fontWeight, fontStyle, textDecoration, textAlign, textAlignVertical } = source.style;
    widget.style = { ...widget.style, color, fontFamily, fontSize, fontWeight, fontStyle, textDecoration, textAlign, textAlignVertical };
    if (widget.type === "sticky_note" && source.type === "sticky_note") widget.style = { ...source.style };
  }
}
