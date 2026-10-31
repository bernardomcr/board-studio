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
- Criação de boards em branco, sem templates. O botão de seleção liga/desliga: desligado, arrastar navega pelo canvas; Espaço também permite navegar temporariamente.
- Controle Fundo na parte inferior: claro, escuro, cor personalizada, grade opcional e imagem de fundo com tamanho proporcional e opacidade, salvo por board e no arquivo editável.
- Menu rápido de formas e biblioteca expandida em “Mais formas”, com 77 entradas pesquisáveis, geometrias próprias e exportação SVG.
- Conectores retos, curvos e em cotovelo; pontos intermediários, seis terminações, inversão da direção, tracejado/pontilhado e múltiplos rótulos posicionáveis. Uma ponta solta pode criar um objeto conectado ou continuar livre.
- Imagens com original preservado, substituição, tamanho original, máscaras retangular/elíptica/arredondada, espelhamento, opacidade e recorte não destrutivo. Recorte circular com prévia e borda personalizada independente da foto.
- Grupos aninhados com formas, imagens, conectores e traços; movimentação, escala, rotação, duplicação e bloqueio.
- Painel Camadas com grupos recolhíveis, nomes, miniaturas, ocultar, bloquear, seleção múltipla e ordenação por arraste ou botões. A ordem visual inclui fotos, texto, formas, traços e conectores.
- Texto livre sem quebra automática por caixa: arrastar as alças aumenta/reduz as letras. Transformação com posição, proporção, tamanho e rotação.
- Bordas proporcionais com barra de espessura e presets; acompanham o tamanho dos objetos. Pontos de conexão ao passar o mouse e curvas ajustáveis com prévia estável.
- 25 famílias tipográficas locais, formatação de texto, paletas com transparente e barras de ícones específicas para cada seleção.
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

Os ícones usam Lucide; a licença ISC está em `app/public/licenses/lucide-LICENSE.txt`.

## Estrutura

`app/src/core` contém o modelo, comandos, geometria e persistência. `app/src/render` contém os renderizadores Pixi/SVG. A biblioteca inicial, os painéis contextuais, imagens, fontes e ícones ficam em módulos próprios. Consulte `docs/architecture.md` e `docs/verification.md`.

Este é um aplicativo independente. Bibliotecas especializadas, importação de formatos proprietários, colaboração remota e paridade integral com outros editores não fazem parte desta versão.
