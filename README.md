# no teu cu e atiro

Editor visual local com canvas infinito, biblioteca de boards, conectores, imagens, texto e desenho livre. Identidade em cinza escuro e roxo, com o logo original da marca.

## Executar

Requer Node.js 22 ou mais recente.

```sh
cd app
npm ci
npm run dev
```

No Windows, `TESTAR.cmd` compila e abre a versão de produção em `http://localhost:4173`.

## Aplicativo Windows

Os instaladores e a versão sem instalação ficam em [Releases](https://github.com/bernardomcr/board-studio/releases). O aplicativo Windows x64 funciona offline e usa um perfil local com nome, sem senha ou conta online. A integração com Google Drive está prevista para uma próxima etapa.

O navegador e o executável usam armazenamentos separados. Para levar boards existentes, exporte seus arquivos `.board.json` no navegador e escolha **Importar board de arquivo** na biblioteca do aplicativo. A versão sem instalação também guarda os boards no perfil local do Windows; exportar os arquivos permite transportá-los.

Para compilar no Windows:

```sh
npm --prefix app ci
npm --prefix desktop ci
node desktop/node_modules/electron/install.js
npm --prefix desktop run package
```

Os executáveis ficam em `desktop/dist`. O instalador desta versão não possui assinatura digital de editor; os hashes SHA-256 acompanham o release.

## Recursos

- Biblioteca inicial com projetos, busca, ordenação, grade/lista, favoritos, duplicação e lixeira recuperável.
- Criação de boards em branco, sem templates. O botão de seleção liga/desliga: desligado, arrastar navega pelo canvas; Espaço também permite navegar temporariamente.
- Uma faixa compacta no topo do desktop reúne título, ferramentas e comandos. A identidade usa cinza escuro e roxo, com temas claro/escuro persistentes; o executável começa escuro quando ainda não há preferência. Em janelas estreitas, comandos secundários ficam em Mais opções do board. Menus respeitam a área ocupada pela faixa.
- Notas novas e seus redimensionamentos mantêm a proporção quadrada. O bloco é um objeto físico no quadro: arraste o papel para puxar uma nota independente e use o pegador inferior para mover o bloco.
- Controle Fundo na parte inferior: claro, escuro, cor personalizada, malha pontilhada, quadriculada, de cruzetas ou sem malha, opacidade ajustável da malha, e imagem de fundo com tamanho proporcional e opacidade, salvo por board e no arquivo editável.
- Menu rápido de formas e biblioteca expandida em “Mais formas”, com 77 entradas pesquisáveis, geometrias próprias e exportação SVG.
- Prévia real do objeto somente durante o arraste pressionado; círculos, triângulos, estrelas, notas, quadros e texto usam o mesmo renderizador da criação final.
- Conectores retos, curvos e em cotovelo; portas magnéticas nos objetos próximos, pontos intermediários, seis terminações, inversão da direção e tracejado/pontilhado. Cor, espessura, tipo e pontas ficam memorizados para os próximos conectores, com pontas inicialmente vazias. Ctrl desativa o encaixe; Shift restringe a direção. Uma ponta solta pode criar um objeto conectado ou continuar livre.
- Rótulos de conectores horizontais ou acompanhando a tangente, com posição, tamanho e cor próprios; a linha abre espaço sob o texto centralizado. Arrastar o rótulo muda sua posição ao longo do caminho. T+ ou duplo clique inicia a edição; Escape cancela um rascunho sem consumir Undo. Inserir texto, nota ou forma no meio divide a conexão em duas, preservando os rótulos e o histórico.
- Menu de imagens com baixar original, recorte no próprio quadro, opacidade e bordas/cantos. O recorte aceita área livre, original, círculo, quadrado, 3:4, 4:3, 16:9 e cantos arredondados; arraste a foto dentro da moldura ou ajuste as alças, Enter aplica e Escape cancela. Máscaras ficam dentro de Recortar. O original é preservado.
- Grupos aninhados com formas, imagens, conectores e traços; movimentação, escala, rotação, duplicação e bloqueio.
- Camadas de trabalho: a camada ativa recebe os próximos textos, imagens, formas, conectores e traços. O + cria uma camada vazia transparente; grupos de camadas, visibilidade, bloqueio e ordem são independentes dos grupos de objetos. Camadas começam recolhidas e mostram a quantidade de objetos; expandir revela os detalhes editáveis. Boards antigos migram para uma camada preservando sua composição. O histórico e o arquivo editável preservam camadas, grupos e estados próprios de cada objeto.
- Texto livre sem quebra automática por caixa: arrastar qualquer alça aumenta/reduz as letras e mantém a caixa ajustada ao conteúdo, inclusive em escalas grandes. Texto novo começa no centro da tela com tamanho visual adaptado ao zoom, sem mover a câmera. Duplo clique em formas permite escrever dentro delas. Formas, notas e tópicos ajustam a fonte visual para caber, preservando o tamanho preferido; ao ampliar a caixa, as letras voltam a crescer até esse tamanho.
- Bordas proporcionais com barra de espessura e presets; acompanham o tamanho dos objetos. Pontos de conexão ao passar o mouse e curvas ajustáveis com prévia estável.
- 43 famílias tipográficas locais, incluindo 18 novas opções artísticas/manuscritas, seletor com busca, filtros de estilo e prévia de cada fonte, importação de TTF/OTF/WOFF/WOFF2, formatação de texto, paletas com transparente, seleção por contorno azul e cores da marca locais com adicionar/editar/excluir. As barras de ícones respeitam cada tipo de seleção. Fontes importadas acompanham os arquivos editáveis e o SVG exportado.
- Mapas mentais com tópicos por Tab/Enter, ramos recolhíveis, reorganização automática, arrastar uma subárvore para outro tópico, imagens como ramos, notas, ícones, temas, tipografia e links. Layouts de mapa mental, organograma e lista; linhas curvas, retas ou angulares. A hierarquia permanece editável e tem desfazer/refazer.
- No menu de listas do texto, checkboxes entram como marcadores laterais interativos e riscam as tarefas concluídas. Textos e formas compatíveis conservam fonte, cor e estilo global; formatação rica por trecho fica guardada para retornar ao texto comum, sem ser exibida no modo checklist. Listas também podem voltar a marcadores ou numeração. Tabelas têm título, cabeçalho colorido, texto que acompanha a escala total, linhas/colunas configuráveis e divisórias individuais arrastáveis; Tab/Enter navegam entre células. Converter texto em tabela aproveita as linhas e tabulações existentes.
- Ctrl+K adiciona links ao trecho selecionado ou ao objeto. Um clique curto em uma forma vinculada abre o destino; arrastar continua movimentando. A colagem aceita imagens copiadas em outros aplicativos, inclusive com o título do board em foco: a foto entra no centro do quadro com tamanho inicial ajustado ao zoom. A cópia interna preserva as dimensões dos objetos e os traz para a área visível após navegação distante.
- Áudio local com gravação pelo microfone, importação, cartão com onda sonora, reprodução, pausa, busca e download do original. O player inteiro é redimensionável, com fonte/tempo proporcionais e preferências de cores/estilo memorizadas para os próximos áudios. O arquivo editável e o IndexedDB guardam o áudio incorporado. O navegador pede acesso ao microfone apenas ao iniciar a gravação.
- Pincel vetorial com tamanho, opacidade e precisão ajustável até 1000. Selecionar pincel ou borracha mantém suas opções fechadas; botão direito no quadro abre/fecha o painel junto ao ponteiro sem trocar de ferramenta. Escape, o botão de fechar e iniciar um desenho também fecham o painel. Alt + botão direito (ou esquerdo) ajusta tamanho na horizontal e opacidade na vertical. Borracha comum apaga o traço inteiro; a de precisão subtrai somente a área tocada dos desenhos, preservando o restante, o histórico e o SVG. Desenhos antigos da caneta e do marca-texto continuam compatíveis.
- Zoom de 2% a 2.000%, presets, percentual personalizado e ajuste à tela de todos os tipos de objetos. Fontes são rasterizadas novamente conforme tamanho, zoom e densidade da tela, com filtragem na redução e limites de memória por textura.
- Precisão do pincel ajustável entre mais fiel e mais suave, com tolerância capturada na escala do desenho. Renderização adaptativa reduz segmentos invisíveis em zoom baixo, conservando os pontos e o SVG. Gestos de movimentação/redimensionamento são agrupados por quadro, e alças de objetos minúsculos deixam de capturar cliques de movimento.
- Tamanhos lógicos de fonte, objetos, traços e bordas não têm os antigos tetos artificiais. A espessura dos conectores e das bordas usa barras expansíveis; os limites de arquivos, quantidade de células e memória de renderização continuam protegendo o navegador.
- Navegação com momentum também ao segurar Espaço. A malha retém sua geometria vetorial durante o pan e altera apenas a fase, sem recriar milhares de pontos a cada quadro. Movimentar objetos conserva a geometria local; pintura e layout são reutilizados durante navegação. O autosave captura diretamente no IndexedDB quando a conexão está pronta, com uma cópia isolada de fallback ao abrir o banco; captura, chave e histórico permanecem consistentes. O histórico compacta atualizações intermediárias dos gestos e normaliza históricos antigos ao carregá-los, preservando Undo/Redo. O arraste fino não é quantizado à malha: as guias entre objetos usam atração de 6 pixels de tela, desativada por Alt. Movimentos recebidos entre quadros usam a posição mais recente.
- Navegação com momentum interrompido por novas ações; alças mostram setas de redimensionamento conforme a rotação. Duplo clique em uma camada enquadra seu objeto. A barra superior não tem rolagem e concentra linhas e setas em Formas.
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

As fontes são distribuídas localmente com as licenças upstream em `app/public/fonts`. O manifesto registra as fontes de download e os hashes dos arquivos. Inter é usada na interface; Noto Sans e Figtree também estão disponíveis no canvas. O seletor inclui também as famílias abertas disponíveis na coleção de fontes do Miro.

Os ícones usam Lucide; a licença ISC está em `app/public/licenses/lucide-LICENSE.txt`.

## Estrutura

`app/src/core` contém o modelo, comandos, geometria e persistência. `app/src/render` contém os renderizadores Pixi/SVG. A biblioteca inicial, os painéis contextuais, imagens, fontes e ícones ficam em módulos próprios. Consulte `docs/architecture.md` e `docs/verification.md`.

Este é um aplicativo independente. Bibliotecas especializadas, importação de formatos proprietários, colaboração remota e paridade integral com outros editores não fazem parte desta versão.
