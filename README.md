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
- Prévia real do objeto antes do clique e durante o arraste; círculos, triângulos, estrelas, notas, quadros e texto usam o mesmo renderizador da criação final.
- Conectores retos, curvos e em cotovelo; portas magnéticas nos objetos próximos, pontos intermediários, seis terminações, inversão da direção, tracejado/pontilhado e múltiplos rótulos posicionáveis. Ctrl desativa o encaixe; Shift restringe a direção. Uma ponta solta pode criar um objeto conectado ou continuar livre.
- Imagens com original preservado, substituição, tamanho original, máscaras retangular/elíptica/arredondada, espelhamento, opacidade e recorte não destrutivo. Recorte circular com prévia e borda personalizada independente da foto.
- Grupos aninhados com formas, imagens, conectores e traços; movimentação, escala, rotação, duplicação e bloqueio.
- Painel Camadas com grupos recolhíveis, nomes, miniaturas, ocultar, bloquear, seleção múltipla e ordenação por arraste ou botões. A ordem visual inclui fotos, texto, formas, traços e conectores.
- Texto livre sem quebra automática por caixa: arrastar as alças aumenta/reduz as letras. Transformação com posição, proporção, tamanho e rotação.
- Bordas proporcionais com barra de espessura e presets; acompanham o tamanho dos objetos. Pontos de conexão ao passar o mouse e curvas ajustáveis com prévia estável.
- 25 famílias tipográficas locais, formatação de texto, paletas com transparente e barras de ícones específicas para cada seleção.
- Mapas mentais com tópicos por Tab/Enter, ramos recolhíveis, reorganização automática, arrastar uma subárvore para outro tópico, imagens como ramos, notas, ícones, temas, tipografia e links. Layouts de mapa mental, organograma e lista; linhas curvas, retas ou angulares. A hierarquia permanece editável e tem desfazer/refazer.
- Listas de tarefas com checkbox independente em cada linha e conversão de texto existente. Tabelas com título, cabeçalho colorido, linhas/colunas configuráveis e células editáveis com Tab/Enter.
- Ctrl+K adiciona links ao trecho selecionado ou ao objeto. Um clique curto em uma forma vinculada abre o destino; arrastar continua movimentando. A colagem aceita imagens copiadas em outros aplicativos e mantém a cópia interna separada.
- Áudio local com gravação pelo microfone, importação, cartão com onda sonora, reprodução, pausa, busca e download do original. O arquivo editável e o IndexedDB guardam o áudio incorporado. O navegador pede acesso ao microfone apenas ao iniciar a gravação.
- Pincel vetorial com precisão opcional, opacidade e ajuste por Alt + botão esquerdo: horizontal altera tamanho, vertical altera opacidade. Prévia incremental, cruzamentos sem retalhos, marca-texto, borracha de traço inteiro/precisão e seleção com laço. Desenhos antigos da caneta continuam compatíveis.
- Zoom de 2% a 2.000%, presets, percentual personalizado e ajuste à tela de todos os tipos de objetos. Fontes são rasterizadas novamente conforme tamanho, zoom e densidade da tela, com filtragem na redução e limites de memória por textura.
- Precisão do pincel ajustável entre mais fiel e mais suave, com tolerância capturada na escala do desenho. Renderização adaptativa reduz segmentos invisíveis em zoom baixo, conservando os pontos e o SVG. Gestos de movimentação/redimensionamento são agrupados por quadro, e alças de objetos minúsculos deixam de capturar cliques de movimento.
- Tamanhos lógicos de fonte, objetos, traços e bordas não têm os antigos tetos artificiais. A espessura dos conectores e das bordas usa barras expansíveis; os limites de arquivos, quantidade de células e memória de renderização continuam protegendo o navegador.
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
