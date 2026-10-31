# Board Studio — aplicativo

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
| Navegar temporariamente | Espaço + arrastar ou botão do meio |
| Pincel / marca-texto / borracha | B (ou P) / H / E |
| Ajustar pincel | Alt + botão esquerdo; horizontal = tamanho, vertical = opacidade |
| Suavizar pincel | Marcar Precisão no painel |
| Laço | L |
| Forma / texto / nota / quadro | R / T / S / F |
| Conector | C ou puxar uma porta de um objeto |
| Mapa mental selecionado | Tab adiciona filho; Enter adiciona irmão; Shift+Enter adiciona irmão acima |
| Editar tópico | Enter confirma; Shift+Enter quebra linha; Escape cancela |
| Recolher um ramo | Espaço com um tópico selecionado ou botão de recolher |
| Lista / tabela / áudio | Botões na barra lateral |
| Link em texto ou objeto | Ctrl+K ou botão de link da seleção |
| Suspender encaixe de conector | Ctrl (Command no macOS) |
| Restringir direção de conector | Shift |
| Redimensionar | Arrastar alças; texto muda o tamanho das letras |
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
