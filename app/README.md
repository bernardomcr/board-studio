# no teu cu e atiro — aplicativo

Editor local independente, feito com TypeScript, Vite e PixiJS. Consulte o [README principal](../README.md) para recursos, armazenamento e licenças.

```sh
npm ci
npm run dev
npm test
npm run build
```

No Windows, `../TESTAR.cmd` compila e abre `http://localhost:4173`. Os boards ficam neste navegador e origem. Use Salvar arquivo para transportar uma cópia editável.

## Controles

| Ação | Gesto |
|---|---|
| Selecionar / navegar | V; clicar novamente no botão de seleção ativa a mão |
| Navegar temporariamente | Espaço + arrastar ou botão do meio, com momentum ao soltar |
| Pincel / borracha | B (ou P) / E; clicar novamente fecha o painel e ativa a mão |
| Ajustar pincel | Alt + botão direito (ou esquerdo); horizontal = tamanho, vertical = opacidade |
| Suavizar pincel | Marcar Precisão no painel |
| Forma / texto / nota / quadro | R / T / S / F |
| Repetir uma forma | Desenhar mantém a mesma ferramenta; V volta à seleção |
| Escrever dentro de uma forma | Duplo clique; a fonte se adapta à área sem alterar o tamanho preferido |
| Texto novo | Canto superior esquerdo no centro da tela; tamanho inicial adaptado ao zoom |
| Fontes próprias | Abrir o seletor de fonte e escolher Adicionar fontes |
| Conector | Formas e linhas, C ou puxar uma porta de um objeto |
| Estilo do próximo conector | Cor, espessura, tipo e pontas permanecem até nova alteração |
| Texto em conector | T+ na barra ou duplo clique na linha; Enter confirma e Escape cancela o rascunho |
| Inserir objeto no conector | Ícone de formas na barra; divide a ligação e abre o texto do novo objeto |
| Imagens | Baixar original, máscara, recorte, opacidade e estilo da borda |
| Mapa mental selecionado | Tab adiciona filho; Enter adiciona irmão; Shift+Enter adiciona irmão acima |
| Editar tópico | Enter confirma; Shift+Enter quebra linha; Escape cancela |
| Recolher um ramo | Espaço com um tópico selecionado ou botão de recolher |
| Lista / tabela / áudio | Botões na barra lateral |
| Link em texto ou objeto | Ctrl+K ou botão de link da seleção |
| Suspender encaixe de conector | Ctrl (Command no macOS) |
| Restringir direção de conector | Shift |
| Redimensionar | Arrastar alças; texto muda o tamanho das letras |
| Focar uma camada | Duplo clique no objeto listado; F2 renomeia |
| Agrupar / desagrupar | Ctrl+G / Ctrl+Shift+G |
| Entrar em grupo | Duplo clique; Alt+clique seleciona um membro |
| Ampliar/reduzir seleção | Shift+clique; grupos mistos entram e saem como uma unidade |
| Duplicar | Ctrl+D |
| Copiar / colar | Ctrl+C / Ctrl+V |
| Ajustar à tela | Shift+1 |
| Zoom | Roda ancorada no cursor; percentual abre presets e valor personalizado |
| Voltar a 100% | Ctrl+0 |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z |
| Ajuda de atalhos | ? |

Os testes usam contextos isolados em `127.0.0.1:5174`. Capturas e arquivos temporários ficam fora do Git. A arquitetura e os limites de validação estão em [architecture.md](../docs/architecture.md) e [verification.md](../docs/verification.md).
