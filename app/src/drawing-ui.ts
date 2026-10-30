export interface DrawingSettings {
  color: string;
  /** Total stroke diameter in board/world units. */
  width: number;
  pressure: boolean;
}

interface DrawingUIOptions {
  getTool(): string;
  setTool(tool: string): void;
}

type DrawingTool = "pen" | "highlighter" | "eraser";
const isDrawingTool = (tool: string): tool is DrawingTool => ["pen", "highlighter", "eraser"].includes(tool);

/** A single contextual palette; stroke settings are copied at gesture start. */
export function installDrawingUI(options: DrawingUIOptions): {
  refresh(): void;
  settings(tool: "pen" | "highlighter"): DrawingSettings;
  eraserRadius(): number;
  eraserMode():"stroke"|"partial";
} {
  let eraseMode:"stroke"|"partial"="stroke";
  const preferences = {
    pen: { color: "#191812", width: 3, pressure: false },
    highlighter: { color: "#f5d128", width: 18, pressure: false },
    eraser: 12,
  };
  try {
    const stored = JSON.parse(localStorage.getItem("board-app:drawing-settings") ?? "null");
    for (const tool of ["pen", "highlighter"] as const) {
      const value = stored?.[tool];
      if (value && /^#[0-9a-f]{6}$/i.test(value.color)) preferences[tool].color = value.color;
      if (Number.isFinite(value?.width)) preferences[tool].width = Math.max(1, Math.min(24, value.width));
      if (typeof value?.pressure === "boolean") preferences[tool].pressure = value.pressure;
    }
    if (Number.isFinite(stored?.eraser)) preferences.eraser = Math.max(4, Math.min(48, stored.eraser));
  } catch { /* Defaults remain usable if saved preferences are unavailable. */ }

  const style = document.createElement("style");
  style.textContent = `
    #drawing-palette{position:fixed;left:78px;top:50%;transform:translateY(-40%);width:244px;box-sizing:border-box;z-index:35;background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 6px 24px #0002;padding:14px;font:13px Arial,Helvetica,sans-serif;color:#222}
    #drawing-palette[hidden]{display:none}
    #drawing-palette .drawing-tabs{display:flex;gap:4px;padding-bottom:12px;border-bottom:1px solid #eee;margin-bottom:14px}
    #drawing-palette button{font:inherit;cursor:pointer;color:inherit;background:#fff;border:1px solid transparent;border-radius:6px;min-height:34px}
    #drawing-palette button:focus-visible,#drawing-palette input:focus-visible{outline:2px solid #4262ff;outline-offset:2px}
    #drawing-palette .drawing-tabs button{flex:1;font-size:11px;padding:5px 3px;white-space:nowrap}
    #drawing-palette .drawing-tabs button[aria-pressed=true]{background:#eef0ff;color:#3859ff}
    #drawing-palette .drawing-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:12px}
    #drawing-palette output{font-variant-numeric:tabular-nums;color:#555}
    #drawing-palette .drawing-presets{display:flex;gap:7px;margin-bottom:12px}
    #drawing-palette .drawing-presets button{flex:1;height:37px;border-color:#e4e4e4;display:grid;place-items:center}
    #drawing-palette .drawing-presets button[aria-pressed=true]{border-color:#4262ff;background:#f5f6ff}
    #drawing-palette .drawing-dot{display:block;border-radius:50%;background:currentColor}
    #drawing-palette input[type=range]{width:100%;margin:0 0 16px;accent-color:#4262ff;cursor:pointer}
    #drawing-palette .drawing-colors{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0 15px}
    #drawing-palette .drawing-color{width:25px;height:25px;min-height:25px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #ddd;padding:0}
    #drawing-palette .drawing-color[aria-pressed=true]{box-shadow:0 0 0 2px #4262ff}
    #drawing-palette .drawing-custom{width:28px;height:28px;padding:0;border:0;background:transparent;cursor:pointer}
    #drawing-palette .drawing-pressure{display:flex;align-items:center;gap:7px;font-size:12px;color:#444}
    #drawing-palette .drawing-pressure input{accent-color:#4262ff}
    #drawing-palette .drawing-note{font-size:11px;line-height:1.5;color:#777;margin:12px 0 0}
    @media(max-width:520px){#drawing-palette{left:68px;width:218px}}
  `;
  document.head.appendChild(style);
  const panel = document.createElement("section");
  panel.id = "drawing-palette";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Opções de desenho");
  panel.innerHTML = `
    <div class="drawing-tabs" role="group" aria-label="Ferramenta de desenho">
      <button type="button" data-drawing-tool="pen">Caneta</button>
      <button type="button" data-drawing-tool="highlighter">Marca-texto</button>
      <button type="button" data-drawing-tool="eraser">Borracha</button>
    </div>
    <div class="drawing-heading"><label for="drawing-width">Espessura</label><output id="drawing-width-value" for="drawing-width"></output></div>
    <div class="drawing-presets" role="group" aria-label="Espessuras predefinidas"></div>
    <input id="drawing-width" type="range" min="1" max="24" step="1" aria-label="Espessura do traço">
    <label class="eraser-mode" hidden style="display:block;margin:10px 0">Modo da borracha<select aria-label="Modo da borracha"><option value="stroke">Traço inteiro</option><option value="partial">Precisão — apagar só a área</option></select></label>
    <div class="drawing-ink">
      <span style="font-size:12px">Cor</span>
      <div class="drawing-colors" role="group" aria-label="Cor do traço"></div>
      <label class="drawing-pressure"><input type="checkbox" id="drawing-pressure"> Pressão da caneta</label>
    </div>
    <p class="drawing-note"></p>
  `;
  document.body.appendChild(panel);
  const eraserMode=panel.querySelector<HTMLSelectElement>(".eraser-mode select")!;eraserMode.onchange=()=>{eraseMode=eraserMode.value as "stroke"|"partial";};
  // Let form controls receive their native interactions without reaching the board.
  panel.addEventListener("pointerdown", event => event.stopPropagation());
  panel.addEventListener("wheel", event => event.stopPropagation());
  panel.addEventListener("keydown", event => event.stopPropagation());

  const width = panel.querySelector<HTMLInputElement>("#drawing-width")!;
  const value = panel.querySelector<HTMLOutputElement>("output")!;
  const label = panel.querySelector<HTMLLabelElement>("label[for=drawing-width]")!;
  const pressure = panel.querySelector<HTMLInputElement>("#drawing-pressure")!;
  const presets = panel.querySelector<HTMLDivElement>(".drawing-presets")!;
  const colors = panel.querySelector<HTMLDivElement>(".drawing-colors")!;
  const ink = panel.querySelector<HTMLDivElement>(".drawing-ink")!;
  const note = panel.querySelector<HTMLParagraphElement>(".drawing-note")!;
  const swatches = [
    ["#191812", "Preto"], ["#e34545", "Vermelho"], ["#4262ff", "Azul"],
    ["#2d9d67", "Verde"], ["#9254c8", "Violeta"], ["#f5d128", "Amarelo"],
  ];
  for (const [color, name] of swatches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "drawing-color";
    button.dataset.color = color!;
    button.style.background = color!;
    button.title = name!;
    button.setAttribute("aria-label", name!);
    button.addEventListener("click", () => changeColor(color!));
    colors.appendChild(button);
  }
  const custom = document.createElement("input");
  custom.type = "color";
  custom.className = "drawing-custom";
  custom.title = "Cor personalizada";
  custom.setAttribute("aria-label", "Cor personalizada do traço");
  custom.addEventListener("input", () => changeColor(custom.value));
  colors.appendChild(custom);

  const save = (): void => { try { localStorage.setItem("board-app:drawing-settings", JSON.stringify(preferences)); } catch { /* Settings still work in memory. */ } };
  function activeTool(): DrawingTool { const tool = options.getTool(); return isDrawingTool(tool) ? tool : "pen"; }
  function changeColor(color: string): void {
    const tool = activeTool();
    if (tool === "eraser") return;
    preferences[tool].color = color;
    save();
    refresh();
  }
  width.addEventListener("input", () => {
    const tool = activeTool();
    if (tool === "eraser") preferences.eraser = Number(width.value);
    else preferences[tool].width = Number(width.value);
    save();
    updateValues();
  });
  pressure.addEventListener("change", () => {
    const tool = activeTool();
    if (tool !== "eraser") preferences[tool].pressure = pressure.checked;
    save();
  });
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-drawing-tool]")) {
    button.addEventListener("click", () => { options.setTool(button.dataset.drawingTool!); refresh(); });
  }

  let previousTool = "";
  function updateValues(): void {
    const tool = activeTool();
    const selectedWidth = tool === "eraser" ? preferences.eraser : preferences[tool].width;
    width.value = String(selectedWidth);
    value.value = tool === "eraser" ? `${selectedWidth} px` : `${selectedWidth}`;
    for (const button of presets.querySelectorAll<HTMLButtonElement>("button")) button.setAttribute("aria-pressed", String(Number(button.dataset.width) === selectedWidth));
    if (tool !== "eraser") {
      pressure.checked = preferences[tool].pressure;
      custom.value = preferences[tool].color;
      for (const button of colors.querySelectorAll<HTMLButtonElement>("[data-color]")) button.setAttribute("aria-pressed", String(button.dataset.color === preferences[tool].color));
    }
  }
  function refresh(): void {
    const modeLabel=panel.querySelector<HTMLElement>(".eraser-mode")!;modeLabel.hidden=options.getTool()!=="eraser";modeLabel.style.display=modeLabel.hidden?"none":"block";
    const tool = options.getTool();
    panel.hidden = !isDrawingTool(tool);
    if (!isDrawingTool(tool)) { previousTool = ""; return; }
    for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-drawing-tool]")) button.setAttribute("aria-pressed", String(button.dataset.drawingTool === tool));
    ink.hidden = tool === "eraser";
    label.textContent = tool === "eraser" ? "Raio da borracha" : "Espessura";
    width.min = tool === "eraser" ? "4" : "1";
    width.max = tool === "eraser" ? "48" : "24";
    width.setAttribute("aria-label", tool === "eraser" ? "Raio da borracha em pixels" : "Espessura do traço");
    note.textContent = tool === "eraser" ? "Apaga os traços por onde você passar." : tool === "highlighter" ? "Traço translúcido. Arraste no board para destacar." : "Arraste no board para desenhar. Pressão disponível com caneta digital.";
    if (previousTool !== tool) {
      previousTool = tool;
      presets.replaceChildren();
      const sizes = tool === "eraser" ? [6, 12, 24] : tool === "highlighter" ? [8, 18, 24] : [1, 3, 8];
      for (const size of sizes) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.width = String(size);
        button.title = `${tool === "eraser" ? "Raio" : "Espessura"}: ${size}`;
        button.setAttribute("aria-label", button.title);
        button.innerHTML = `<span class="drawing-dot" style="width:${Math.max(3, Math.min(20, size))}px;height:${Math.max(3, Math.min(20, size))}px"></span>`;
        button.addEventListener("click", () => {
          if (tool === "eraser") preferences.eraser = size;
          else preferences[tool].width = size;
          save(); updateValues();
        });
        presets.appendChild(button);
      }
    }
    updateValues();
  }
  refresh();
  return {
    refresh,
    settings: tool => ({ ...preferences[tool] }),
    eraserMode:()=>eraseMode,
    eraserRadius: () => preferences.eraser,
  };
}
