# Board — F0 + F1

Board local (sem nuvem, sem IA) construído a partir do comportamento observado no Miro.
Câmera, grid com LOD e snap usam **as tabelas e fórmulas extraídas do bundle**; o design usa os
**tokens reais** (`blue-500`, `cloud-*`, raios e espaçamentos).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + bundle
```

Sem terminal: clique duas vezes em `../TESTAR.cmd` — ele instala (na primeira vez),
compila e abre o navegador. Dentro do app, tecla `?` abre o painel de atalhos.

## Controles

| Ação | Gesto |
|---|---|
| Selecionar | V ou clique (Shift+clique soma/remove) |
| Marquee | arrastar em �rea vazia |
| Selecionar todos | Ctrl+A |
| Resize | arrastar handles (Shift mant�m propor��o) |
| Rota��o | al�a acima do topo (Shift trava em 15�) |
| Z-order | Ctrl+] / Ctrl+[ (com Shift = topo/fundo) |
| Duplicar | Ctrl+D |
| Copiar / colar | Ctrl+C / Ctrl+V |
| Quadro (frame) | F, arrastar o quadro move os filhos |
| Agrupar / desagrupar | Ctrl+G / Ctrl+Shift+G (Alt+clique isola, duplo clique entra) |
| Mover fino | setas (Shift = 10 u) |
| Exportar PNG / SVG | botões na topbar |
| Negrito/itálico no editor | Ctrl+B / Ctrl+I / Ctrl+U (editor WYSIWYG) |
| Abrir link | clique na palavra-link (abre em nova aba) |
| Ajustar � tela | Shift+1 ou bot�o da barra de zoom |
| Nota adesiva | S + clique |
| Forma | R + clique |
| Texto | T + clique |
| Mover tela | espaço + arrastar, botão do meio/direito, ferramenta mão |
| Mover objeto | arrastar (snap em bordas/centros de outros objetos + guias; **Alt** desliga) |
| Editar conteúdo | duplo clique ou Enter (edição inline; Ctrl+Enter confirma, Esc cancela) |
| Texto rico | `**negrito**`, `*itálico*`, `~~riscado~~`, `[link](url)` |
| Clip de quadro | objeto com centro dentro do frame é cortado na borda |
| Apagar | Delete |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z (ou botões) |
| Caneta / marca-texto | P / H, arrastar
| Borracha | E, arrastar sobre o traço
| Zoom | roda no cursor, botões, Ctrl+0
| HUD de depuração | tecla **I** |

## Arquitetura

```
src/
  core/camera.ts     mundo ↔ tela, zoom ancorado no cursor, fit, culling
  core/grid.ts       SNAP_MODULE_CONFIG / VISUAL_MODULE_CONFIG, currentSize, snapThreshold
  core/model.ts      21 tipos do Miro reduzidos a 3 (sticky, shape, text) + defaults literais
  core/geometry.ts   rota��o, AABB, hit-test, handles, resize com �ncora oposta
  core/snapping.ts   snap entre objetos + guias (toler�ncia em px de tela)
  core/connectors.ts �ncoras [0,1], roteamento (reto/cotovelo/curvo), hit-test
  core/commands.ts   command bus + undo/redo por inverso (WIDGET_CREATE/UPDATE/REMOVE/TRANSLATE)
  render/scene.ts    sync incremental do modelo → grafo de cena PixiJS
  main.ts            ferramentas, seleção, arraste com snap, atalhos, chrome
```

Todo estado muda por comando — nada muta o modelo direto. É o padrão do Miro
(`commander.exec("WIDGET_UPDATE", ...)`), e é o que faz undo/redo e persistência serem triviais.

## Validação executada

| Teste | Resultado |
|---|---|
| criar objeto | 3 → 4 |
| undo / redo | 4 → 3 → 4 |
| mover +100 px e desfazer | +100 → 0 |
| remover e desfazer | 4 → 3 → 4 |
| grid 200% / 100% / 50% / 25% / 10% | 20/20/40/80/160 u — idêntico à tabela do Miro |
| alinhar / distribuir | gaps 70/70, undo restaurando |
| conector + reconectar ponta | B → C |
| traço livre + borracha | 1 → 0, undo → 1 |
| recarregar página | 4 formas, 3 conectores, 2 traços restaurados |
| frame + filhos | quadro andou 120 e levou os 2 filhos; objeto fora ficou |
| grupo | clique em 1 membro seleciona 2 |
| clipboard | Ctrl+C/V: 4 → 5 objetos |

## Próximo

F2 (câmera: inércia, fit, culling) e F3 (seleção múltipla, handles, rotação).
Ver `../docs/02-plano.md`.

## Estado

Ver `../docs/14-estado-final.md` para o mapa completo do que está implementado,
a origem de cada peça (observado / derivado / assumido) e o que ficou fora de escopo.

## Qualidade

Última varredura: 8 bugs corrigidos (ver `../docs/18-varredura-final.md`), build limpo,
0 exceções em runtime e a matriz de QA cobrindo criar/undo/redo, grupo, quadro com filhos,
apagar quadro, journal após reload, export PNG e SVG.
