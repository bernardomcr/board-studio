# Verificação

Execute `npm test` e `npm run build` em `app`.

A suíte Playwright verifica os fluxos reais de biblioteca de boards, catálogo pesquisável, grupos aninhados com entidades mistas, duplicação de âncoras, bloqueio, estilos e rótulos de conectores, coordenadas do pincel em vários níveis de zoom, borracha parcial, laço, carregamento das fontes, texto rico, imagens e persistência após reload.

São 162 cenários. A cobertura inclui recorte circular com bordas pela interface; transparência verificada nos pixels do canvas; seleção individual dentro de grupos; menu nas bordas da viewport; destino vazio de conectores; alternância seleção/navegação; formatação no primeiro clique após editar tamanho; cor e grade por board; imagem de fundo de 6.000 × 3.000 pixels, escalada para 12.000 × 6.000 unidades sem deformação, exportada/reimportada e reaberta após reload.

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
