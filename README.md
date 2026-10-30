# Board Studio

Editor visual local com canvas infinito, biblioteca de boards e ferramentas para diagramas, imagens, texto e desenho livre.

## Executar

Requer Node.js 22 ou mais recente.

```sh
cd app
npm ci
npm run dev
```

No Windows, `TESTAR.cmd` compila e abre a versão de produção em `http://localhost:4173`.

## Recursos

- Biblioteca inicial com projetos, busca, ordenação, grade/lista, favoritos, duplicação e lixeira recuperável.
- 77 entradas de formas básicas e fluxograma, com busca, geometrias próprias e exportação SVG.
- Conectores retos, curvos e em cotovelo; pontos intermediários, seis terminações, tracejado/pontilhado e múltiplos rótulos posicionáveis.
- Imagens com original preservado, substituição, máscaras retangular/elíptica/arredondada, espelhamento, opacidade e recorte não destrutivo.
- Grupos aninhados com formas, imagens, conectores e traços; movimentação, escala, rotação, duplicação e bloqueio.
- 25 famílias tipográficas locais, formatação de texto, cores, bordas e menus junto à seleção.
- Caneta, marca-texto, borracha de traço inteiro/precisão e seleção com laço.
- Desfazer/refazer, exportação PNG/SVG e arquivos editáveis `.board.json`.

Os boards ficam no IndexedDB do navegador. O aplicativo não possui backend, sincronização em nuvem ou upload de conteúdo. O armazenamento é separado por navegador e origem: use sempre o mesmo endereço/porta e exporte arquivos para transportar seus boards. Limpar os dados do navegador remove o armazenamento local.

## Testes

```sh
cd app
npm ci
npx playwright install chromium
npm test
npm run build
```

No Windows, os testes também podem usar o Chrome instalado. `CHROME_PATH` permite indicar outro executável. A suíte usa contextos isolados e não acessa boards pessoais.

## Fontes e licenças

As fontes são distribuídas localmente com as licenças upstream em `app/public/fonts`. O manifesto registra as fontes de download e os hashes dos arquivos. Noto Sans é usada na interface; Inter e Figtree são alternativas disponíveis. O seletor inclui também as famílias abertas disponíveis na coleção de fontes do Miro.

## Estrutura

`app/src/core` contém o modelo, comandos, geometria e persistência. `app/src/render` contém os renderizadores Pixi/SVG. A biblioteca inicial, os painéis contextuais, imagens, fontes e ícones ficam em módulos próprios. Consulte `docs/architecture.md` e `docs/verification.md`.

Este é um aplicativo independente. Bibliotecas especializadas, importação de formatos proprietários, colaboração remota e paridade integral com outros editores não fazem parte desta versão.

