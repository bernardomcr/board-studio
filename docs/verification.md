# Verificação

Execute `npm test` e `npm run build` em `app`.

A suíte Playwright verifica os fluxos reais de biblioteca de boards, catálogo pesquisável, grupos aninhados com entidades mistas, duplicação de âncoras, bloqueio, estilos e rótulos de conectores, coordenadas do pincel em vários níveis de zoom, borracha parcial, carregamento das fontes, texto rico, imagens e persistência após reload.

São 255 cenários na rodada v13. A cobertura inclui recorte circular com bordas pela interface; transparência verificada nos pixels do canvas; seleção individual dentro de grupos; menu nas bordas da viewport; destino vazio de conectores; alternância seleção/navegação; formatação no primeiro clique após editar tamanho; cor e grade por board; imagem de fundo de 6.000 × 3.000 pixels, escalada para 12.000 × 6.000 unidades sem deformação, exportada/reimportada e reaberta após reload. As seções anteriores à v13 registram os resultados históricos das rodadas correspondentes.

As verificações são feitas em um contexto novo do navegador. O servidor de teste usa `127.0.0.1:5174`; o conteúdo pessoal de outras origens não é utilizado. Capturas e traces de falhas ficam em `app/test-results`, fora do Git.

Além da suíte, foram verificadas visualmente telas do catálogo, tipografia, biblioteca inicial e edição de imagens, e comparados os menus observados da referência. A cobertura do catálogo corresponde às 23 entradas básicas e 54 de fluxograma inspecionadas; não representa todas as bibliotecas especializadas de diagramas.

A revisão de menus usa observações da interface original e análise REA CLI de capturas retidas e três scripts originais públicos. Essa análise recuperou 1.571 módulos sem falhas de parsing e confirmou controles separados para recorte, formato, borda, substituição e tamanho original de imagem; pontas, tipo e inversão de conectores; e transações de recorte/grupo. A evidência completa e os scripts da referência ficam apenas em `work`, fora do repositório.

Essa passagem do REA não anexou a sessão atual do Chrome, que não expõe CDP. A análise estática tem grafo limitado e não demonstra execução. Os detalhes exatos do menu de destino vazio e das máscaras não foram estabelecidos por essa análise; a implementação desses fluxos foi verificada no aplicativo local. Não se declara equivalência completa de comportamento com a referência.

A revisão de escala observou também o Miro ativo no Chrome: limite inferior de 2%, superior de 2.000%, ajuste à tela e presets 50%, 70%, 100%, 400%, 1.200% e 2.000%. O conteúdo do board original não foi editado. A implementação local conserva coordenadas e raios ao mudar o zoom, mantém o ponto sob o cursor, aplica percentuais personalizados e adapta a resolução quando muda o DPR. O ajuste à tela é testado também em boards contendo somente traços ou conectores.

Os testes do pincel verificam pixels de laços, curvas grossas de 90 unidades, retornos de 180 graus e cruzamentos com opacidade única; prévia de mais de 400 amostras passando pelas junções dos blocos; Alt + botão esquerdo e opção Precisão; SVG e arquivo editável, incluindo caneta antiga. Um intervalo de 128 segmentos em um traço de 100 mil pontos lê menos de 1.500 amostras. Geometria de traços concluídos é reutilizada e hover distante não varre segmentos. O armazenamento de desenhos extensos e de imagens é verificado sem depender da cópia JSON opcional.

As verificações de fonte consultam as texturas reais do Pixi: mipmaps, filtragem, restauração idêntica dos pixels após ciclos de tamanho/zoom, texto pequeno em 2.000% e orçamento de textura para fonte enorme. A conta acompanha os arredondamentos internos do gerador/pool do Pixi. O limite por trecho é de 4 milhões de texels e 4.096 pixels por lado; palavras muito longas em escalas extremas podem atingir esse limite. Não se mede uma taxa de quadros garantida para todo hardware.

Limites conhecidos: grupos com escala não proporcional e objetos rotacionados são transformados sem cisalhamento; o roteamento automático considera origem/destino e não todos os obstáculos; as fontes de sistema de arquivos antigos dependem de estarem instaladas; imagens animadas são renderizadas como quadro estático. Diferentes navegadores e dispositivos de caneta ainda exigem verificação adicional.

A revisão de composição verifica também o aumento do texto por alças laterais e de canto, texto sem quebra automática, editor em zoom baixo, borda proporcional além de 30 px, criação de quadros e recorte rotacionado, migração de quadros antigos, pontos de conexão por hover, igualdade numérica da curva prévia/final, ajuste sem salto, camadas aninhadas, renomear/ocultar/bloquear e a ordem real dos pixels entre formas, traços e conectores.

A passagem MindMeister usa REA CLI 6.8.0 nos scripts públicos carregados pelo editor. Evidência principal: `ev_591c64d55b59dace040e8fe39b03f7292b8769be209f27114df9d78d9ba43bdb`. Foram analisados três scripts selecionados, 953.127 bytes, sem falhas de parsing. A cobertura do grafo é parcial, com limites semânticos declarados; não representa execução nem recuperação integral do editor. A interface autenticada foi observada separadamente, corroborando Tab/Enter e os layouts. Fontes, hashes, posições e limitações ficam no ledger local em `work/mindmeister-v10-behavior-findings.json`, fora do Git. O Chrome não expôs a conexão CDP exigida pelo REA para uma observação direta da sessão.

A cobertura adicional verifica prévias com silhuetas reais e igualdade ao posicionar; colagem nativa e HTML sem substituir imagens por seleções antigas; fontes, bordas e traços além dos antigos limites; barras de espessura expansíveis; mapas com layouts, cores, notas, ícones, imagens, recolhimento, reparentear, cópia, validação de ciclos e desfazer. Links de trechos preservam a seleção através do diálogo e links de formas distinguem clique de arraste. Listas e tabelas têm verificações de pixels, edição, rotação, SVG, importação e persistência.

A gravação é testada com MediaRecorder real e uma faixa de áudio gerada por oscilador, sem acesso ao microfone físico. Os testes verificam o momento da solicitação, finalização de todas as faixas, cancelamento, recusa de permissão, reprodução de WAV, download byte a byte, alinhamento dos controles e arquivo editável. A confirmação de funcionamento no microfone físico depende da permissão e do dispositivo do usuário.

Os testes de precisão comparam o ruído do mesmo gesto em 2%, 100% e 2.000%, incluindo uma interação real no canvas em 2% com a barra no máximo. A redução dos segmentos de exibição é verificada contra erro em pixels, preservando pontos originais e SVG. Uma rajada de 120 eventos de movimento no mesmo quadro gera uma transformação, mantém o último ponto e desfaz em uma etapa. Objetos minúsculos em 2% continuam movendo sem iniciar redimensionamento por sobreposição de alças.

## Checkup final e duas revisões independentes — 31/10/2026

Depois da auditoria inicial, dois revisores diferentes, iniciados sem o histórico da implementação, compararam código e comportamento com as referências retidas do Miro, MindMeister e os documentos do repositório `storytold/photocraft`. As correções da primeira rodada precederam a segunda. Os relatórios frios, hashes e reproduções ficam em `work/independent-review-round1.md` e `work/independent-review-round2.md`, fora do Git; este documento registra o resultado publicável, sem scripts originais nem boards pessoais.

| Rodada | Defeitos confirmados e corrigidos | Verificação adicionada |
| --- | --- | --- |
| 1 | Colagem assíncrona no board errado; Escape salvando tópico; Enter/Shift+Enter com ações incorretas; reorganização movendo tópico bloqueado; clique discordando do raio da máscara da imagem. | Trocas reais A→B e A→B→A; decodificação/substituição/recorte com bloqueio ou remoção; atalhos e histórico; cantos visíveis/transparentes em 2% e 100%. |
| 2 | Partes cortadas por quadro ainda capturando cliques; Shift+clique fragmentando grupo; rótulos/reset de vários conectores em múltiplos Undo; áudio tocando na biblioteca; piso de densidade elevando a textura além de 4096px. | Quadros rotacionados/aninhados em 2/100/2000%; checkbox parcialmente visível e editor de célula; grupos mistos por forma/conector/traço; ações com dois/três conectores; playback nativo; fontes finitas de 1e9/1e10 no helper real, sem alocação GPU extrema. |

A checagem suplementar percorreu o ciclo de projetos/boards: criar, renomear, duplicar com conteúdo independente, mover, favoritar, excluir e restaurar; busca, três ordenações e visualização em grade/lista. Verificou também links por teclado, cancelamento, foco dos diálogos, preferências do pincel/marca-texto/borracha e interrupção das barras de espessura. Corrigiu comandos escapando da ajuda, Tab fora de diálogos, preferência de borracha não restaurada, sliders deixando histórico intermediário e limites dos pickers na viewport.

Essas revisões encontraram defeitos reais e propuseram melhorias; não constituem certificação de paridade integral com os originais nem prova de todas as combinações possíveis de menus. O contrato usa a prioridade das escolhas explícitas do usuário sobre os produtos de referência. Saltos em cruzamentos de conectores, desvio completo por obstáculos, formatação completa dos rótulos e recorte/redimensionamento de imagens em lote continuam diferenças conhecidas. Criar por clique em zoom muito baixo conserva os tamanhos do mundo; use arrastar para definir uma área ou aproxime a câmera para editar objetos pequenos.

Validação após as duas rodadas: `npm test` executou os **162 cenários, todos aprovados em 2,8 minutos**, em um worker e contextos isolados do Chrome. `npm run build` aprovou TypeScript e Vite; bundle final `index-BQadA9dQ.js`. A validação cobre também as regressões de integração encontradas enquanto as correções eram reunidas; falhas de preparação dos testes foram corrigidas e os casos repetidos antes da execução completa.

## Estresse de produção em 2%

Dois contextos novos executaram cenas normal e pesada, com gestos nativos de mouse solicitados a 60 Hz e intervalos de requestAnimationFrame medidos separadamente. A cena pesada contém 402 widgets, 200 conectores, 150 traços/240 mil pontos, 40 grupos e 20 imagens, incluindo metadados de mapa mental, lista, tabela, áudio e fundo. O arquivo capturado tem aproximadamente 21,1 MB. Os dados iniciais têm o mesmo digest antes/depois. Hardware: Ryzen 5 5600, 15,9 GB RAM, RTX 4060 Ti/D3D11; viewport 1600×1000, DPR 1. A flag que permite SwiftShader não forçou software: o renderer real foi registrado.

| Cena pesada em 2% | Antes | Build final |
| --- | ---: | ---: |
| Navegação: intervalo de quadro p95 | 33,3 ms | 8,4 ms |
| Navegação: entrada efetivamente processada | 37,1 Hz | 60,0 Hz |
| Arraste da seleção: entrada processada | 19,2 Hz | 32,7 Hz |
| Colagem da cena inteira, execução síncrona | 72.399 ms | 685 ms |
| Copiar/colar até os primeiros quadros | 74,8 s | 1,91 s |
| Texels de texto ativos | 189.696.512 | 15.138 |
| Salvar | 488 ms | 280 ms |
| Reabrir | 1,75 s | 1,93 s |

Os pontos de cada traço copiado, raios, âncoras, grupos e metadados passaram por comparação; desfazer e reabrir restauraram digests idênticos. O pincel recebeu 241 amostras, conservou o ponto final e a janela de precisão em escala. Não houve erro de página/console nos harnesses finais. Uma checagem separada da interface compilada passou por importação real de PNG pelo seletor, colagem de File por ClipboardEvent, recorte circular, link, ajuda, Enter/Escape de mapa mental e reload. O ClipboardEvent não substituiu a área de transferência pessoal do sistema.

Limites medidos: o arraste dessa seleção extrema ainda processa aproximadamente 33 Hz; a cópia completa teve uma long task de 954 ms, e salvar a cena duplicada levou 1,06 s. O tempo de reabertura é uma amostra, sem conclusão estatística de regressão. A queda de texels corresponde a texto, não à memória total da cena; pontos vetoriais, imagens, geometria e histórico continuam consumindo memória. Os números descrevem esse cenário/hardware e não garantem FPS universal. Resultados completos e capturas ficam em `work/qa-final-final-results`, fora do Git.

## Texto, fontes e menus — refinamento de 31/10/2026

A criação de texto livre agora usa o canto superior esquerdo no centro da viewport, com fonte inicial de 24 pixels de tela em 2%, 100% e 2000%. A câmera permanece inalterada. O texto livre conserva a área natural em todos os comandos e no carregamento; foram verificadas 40 ampliações consecutivas e tamanhos lógicos além da saturação de fontes CSS. Formas mantêm caixas fixas, editáveis por duplo clique, com quebra por palavras e grafemas e os mesmos trechos ricos no canvas e SVG.

Uma medição específica encontrou uma transição de 27 pixels de cinza ao ampliar a textura de uma letra com fonte lógica 1 milhão em 2%; o Canvas2D nativo tinha transição de 1 pixel. A correção pinta apenas a parte visível de trechos gigantes, com fonte normalizada e transformação nativa. A regressão exige bordas de até 3 pixels em 2/100/2000%, mantém o limite de 4096 por dimensão e 4 milhões de pixels, verifica movimento, rotação, máscara e descarte. O retorno ao tamanho original e a recarga preservam geometria e cobertura de tinta. Em cinco recargas, uma variou um único canal alfa de 154 para 153 em um pixel; a comparação admite diferença máxima de 1 em até 2 pixels e exige a mesma cobertura.

| Área | Contrato verificado |
| --- | --- |
| Fontes | Nomes com prévia, busca por teclado, foco após reconstrução da barra, importação real, restauração local e transporte do arquivo em contexto novo, incorporação no SVG e rejeição de dados danificados. |
| Criação | Ausência de prévia antes de pressionar; prévia durante o gesto; repetição da forma exata e um Undo por criação; duplo clique sem objetos extras. |
| Menus | Estilos, alinhamento, listas/recuos, paletas circulares com transparente, conversão de tipo, notas, estilos de conectores, máscaras, copiar/colar estilo e barras de opacidade com histórico e foco preservados. |
| Links | Popover compacto ancorado, endereço validado, salvar/remover/cancelar, foco e Tab, seleção de trecho de texto preservada ao cancelar. |
| Troca de board | Carregamento real de fonte atrasado durante A→B; Delete, Ctrl+K, colagem de PNG, comandos pendentes e salvamento bloqueados até o destino estar pronto; conteúdo de origem e destino preservado. |
| Cena | ID reutilizado de texto com link para imagem e depois forma não conserva glifos, links nem textura anteriores. |

A comparação visual usa as capturas fornecidas e inspeção da interface original. O endpoint CDP do Chrome não estava disponível para uma nova captura REA; a análise semântica da evidência retida foi parcial e não encontrou sementes para `fontSize`. Ela não foi tratada como prova de comportamento. A revisão adicional de código está em `work/v12-final-review.md`, fora do Git. Funcionalidades de IA, colaboração em nuvem e serviços de marca não foram acrescentadas aos menus.

Validação integrada: **208 testes passaram em 3,9 minutos**, sem testes pulados, retentativas ou falhas. O alvo específico de texto também passou nos 20 cenários antes da execução completa. TypeScript e Vite aprovaram o build `index-m9QCQC42.js`. A suíte usa um worker e contextos isolados do Chrome; dados pessoais e assets dos produtos de referência ficam fora do repositório.

O build de produção repetiu os cenários normal e pesado em 2%, além da cópia da cena inteira e dois percursos de interface. Na cena pesada, navegação processou 59,8 Hz, pincel de precisão 59,9 Hz e arraste 31,2 Hz; o p95 de quadro na navegação foi 24,9 ms. Colagem síncrona levou 824 ms, copiar/colar até os primeiros quadros 2,13 s, salvar 670 ms e reabrir 2,31 s. A maior long task da cópia foi 1,18 s. São amostras deste hardware, e o arraste pesado continua sendo um limite conhecido. A normalização das caixas de texto mudou o estado inicial em relação ao ensaio v11; estes números não são uma comparação controlada entre versões.

Movimentos, pontos finais, grupos, âncoras, metadados, Undo e reload passaram nas comparações de integridade. Não houve erro de página/console nos percursos finais. A interface compilada passou por importação via seletor, colagem de File, recorte circular, link, ajuda, edição de tópico, texto com origem centralizada, prévias tipográficas, submenu B/I/U/tachado, edição dentro de forma e persistência. As capturas foram inspecionadas visualmente. Relatórios e imagens ficam em `work/qa-v12-final`, fora do Git; o ClipboardEvent de teste não substituiu a área de transferência pessoal do sistema.

## Rodada v13 — caixas, pincel, navegação e menus

O perfil separado do Chrome tornou o endpoint CDP acessível ao REA. A inspeção passiva do SFC registrou ouvintes do canvas e 202 fontes de scripts, entre 461 scripts inventariados, com aproximadamente 33,55 MB de código. Foram examinados os componentes de cálculo de linhas, formas e notas e o registro de cursores. O limite de captura não equivale a cobertura completa do Miro. Registro de evento e inspeção estática não provam execução de cada cursor ou de cada ramo do código. Assets originais e capturas com URLs de recursos ficam somente em `work/`, fora do Git; nenhuma credencial, corpo de requisição ou código original foi incluído no aplicativo.

| Área | Regressões da rodada |
| --- | --- |
| Texto em caixa | Fonte preferida preservada, diminuição e recuperação até o teto, Undo/reload, tópicos sem expansão involuntária, conteúdo rico e itálico, espaços pendurados, editor sem rolagem e preferência de 1e50 em 2/100/2000%. |
| Contornos | Proporções internas observadas nas formas; tinta de glifos dentro de círculo, triângulo e losango; conversão retângulo→triângulo invalida o ajuste. A leitura de pixels usa o stride retornado e desfaz a premultiplicação alfa para distinguir a borda amarela da tinta escura. |
| Pincel | Painel sem presets, marca-texto ou borracha duplicada; tamanho/opacidade e suavização ampliada; amostras densas com curvas, reversões e cruzamentos em 2/100/2000%, sem cortes na cobertura interior. |
| Borrachas | Comum por desenho inteiro e precisão por área tocada, inclusive passagem rápida entre eventos; opacidade 0,4, SVG, grupos, transformações, duplicação, arquivo editável, Undo/reload e descarte de recursos. |
| Conectores | Controles numéricos de referência para tangentes regulares e de mapa mental, pontas livres, junções tangentes, curvas em escala macro, rotações, pontos repetidos, decorações e Undo. Barras se expandem além de 2000 unidades. |
| Menus | Paletas sem check, borda em anel, ações específicas por tipo, Mais aninhado, cores da marca com CRUD/persistência, sem recolorir objetos implicitamente. Barra lateral sem conector dedicado ou laço e sem rolagem em viewports baixas. |
| Navegação | Momentum em unidades de tela, desaceleração e interrupção, Alt+botão direito, oito direções de resize conforme rotação, enquadramento por camada e seleção sem consumir Undo/eliminar Redo. |
| Fundo | Quatro malhas com pixels distintos, ancoragem no mundo, encaixe inalterado, arquivos, Undo/reload, isolamento entre boards e compatibilidade com a antiga propriedade booleana. |

Duas revisões independentes adicionais foram realizadas nesta rodada. A primeira encontrou falsos positivos da borracha em traços afunilados e em buracos formados pela união de cortes sobrepostos. A interseção agora considera a cobertura real e a união das áreas removidas; regressões incluem controles positivos de tinta restante e escalas 0,001/1/1 milhão. A segunda encontrou momentum ainda ativo ao usar controles de zoom ou Shift+1; novos eventos de ponteiro e teclado cancelam a inércia antes dessas ações. Os relatórios privados são `work/v13-independent-review-1.md` e `work/v13-independent-review-2.md`.

A integração também corrigiu a reconstrução da linha de camada entre os dois cliques, o atributo do cursor que colidia com seletores dos botões, a remoção assíncrona de um diálogo fechado que ainda capturava Ctrl+Z e a distinção entre seleção isolada e seleção incluída em uma ação de conteúdo. Selecionar outro objeto conserva Redo; desfazer um checkbox ainda restaura conteúdo e seleção anteriores em conjunto.

Validação final: **255 testes passaram em 4,4 minutos**, sem falhas, testes pulados ou retentativas. TypeScript e Vite aprovaram `index-tJwYUvvt.js`, e o servidor local foi conferido contra esse marcador. Os testes cobrem os problemas encontrados nas revisões e na integração; ajustes de fixtures respeitam mudanças intencionais de menu, fonte normalizada e toggle do pincel.

| Cena pesada em 2%, build v13 | Medição |
| --- | ---: |
| Navegação, entrada processada | 60,4 Hz |
| Navegação, quadro p95 | 16,7 ms |
| Pincel com precisão máxima, entrada processada | 60,1 Hz |
| Arraste, entrada processada | 32,2 Hz |
| Colagem síncrona da cena inteira | 743 ms |
| Copiar/colar até os primeiros quadros | 1,78 s |
| Maior long task durante a cópia | 1,08 s |
| Salvar / reabrir | 547 ms / 1,89 s |

As cenas normal e pesada conservaram movimentos, pontos finais, Undo, grupos, âncoras, metadados e digest após reload. O ensaio de navegação verifica a posição durante o arraste e a continuação após soltar; a inércia é interrompida antes de iniciar o próximo cenário. A cena pesada continua com 402 widgets, 200 conectores, 150 traços/240 mil amostras, 40 grupos e 20 imagens. Estes números não são uma comparação controlada com v12: houve mudanças de layout, geometria e método de navegação. O arraste extremo em torno de 32 Hz e a pausa de aproximadamente um segundo ao copiar toda a cena permanecem limites medidos.

Dois percursos de produção passaram por arquivos de imagem e colagem, recorte circular, link, ajuda, tópicos, texto ajustado mantendo preferência 72, paleta sem check, fundo escuro quadriculado, suavização máxima, Alt+botão direito, desenho nativo, fechamento do painel e persistência. Não houve erro de página/console. As capturas dos menus, fundo e pincel foram inspecionadas. Relatórios e imagens ficam em `work/qa-v13-final`, fora do Git.
