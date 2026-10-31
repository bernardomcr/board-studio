# Verificação

Execute `npm test` e `npm run build` em `app`.

A suíte Playwright verifica os fluxos reais de biblioteca de boards, catálogo pesquisável, grupos aninhados com entidades mistas, duplicação de âncoras, bloqueio, estilos e rótulos de conectores, coordenadas do pincel em vários níveis de zoom, borracha parcial, laço, carregamento das fontes, texto rico, imagens e persistência após reload.

São 50 cenários. A cobertura inclui recorte circular com bordas pela interface; transparência verificada nos pixels do canvas; seleção individual dentro de grupos; menu nas bordas da viewport; destino vazio de conectores; alternância seleção/navegação; formatação no primeiro clique após editar tamanho; cor e grade por board; imagem de fundo de 6.000 × 3.000 pixels, escalada para 12.000 × 6.000 unidades sem deformação, exportada/reimportada e reaberta após reload.

As verificações são feitas em um contexto novo do navegador. O servidor de teste usa `127.0.0.1:5174`; o conteúdo pessoal de outras origens não é utilizado. Capturas e traces de falhas ficam em `app/test-results`, fora do Git.

Além da suíte, foram verificadas visualmente telas do catálogo, tipografia, biblioteca inicial e edição de imagens, e comparados os menus observados da referência. A cobertura do catálogo corresponde às 23 entradas básicas e 54 de fluxograma inspecionadas; não representa todas as bibliotecas especializadas de diagramas.

A revisão de menus usa observações da interface original e análise REA CLI de capturas retidas e três scripts originais públicos. Essa análise recuperou 1.571 módulos sem falhas de parsing e confirmou controles separados para recorte, formato, borda, substituição e tamanho original de imagem; pontas, tipo e inversão de conectores; e transações de recorte/grupo. A evidência completa e os scripts da referência ficam apenas em `work`, fora do repositório.

Essa passagem do REA não anexou a sessão atual do Chrome, que não expõe CDP. A análise estática tem grafo limitado e não demonstra execução. Os detalhes exatos do menu de destino vazio e das máscaras não foram estabelecidos por essa análise; a implementação desses fluxos foi verificada no aplicativo local. Não se declara equivalência completa de comportamento com a referência.

A revisão de escala observou também o Miro ativo no Chrome: limite inferior de 2%, superior de 2.000%, ajuste à tela e presets 50%, 70%, 100%, 400%, 1.200% e 2.000%. O conteúdo do board original não foi editado. A implementação local conserva coordenadas e raios ao mudar o zoom, mantém o ponto sob o cursor, aplica percentuais personalizados e adapta a resolução quando muda o DPR. O ajuste à tela é testado também em boards contendo somente traços ou conectores.

Os testes do pincel verificam pixels de laços, curvas grossas de 90 unidades, retornos de 180 graus e cruzamentos com opacidade única; prévia de mais de 400 amostras passando pelas junções dos blocos; Alt + botão esquerdo e opção Precisão; SVG e arquivo editável, incluindo caneta antiga. Um intervalo de 128 segmentos em um traço de 100 mil pontos lê menos de 1.500 amostras. Geometria de traços concluídos é reutilizada e hover distante não varre segmentos. O armazenamento de desenhos extensos e de imagens é verificado sem depender da cópia JSON opcional.

As verificações de fonte consultam as texturas reais do Pixi: mipmaps, filtragem, restauração idêntica dos pixels após ciclos de tamanho/zoom, texto pequeno em 2.000% e orçamento de textura para fonte enorme. A conta acompanha os arredondamentos internos do gerador/pool do Pixi. O limite por trecho é de 4 milhões de texels e 4.096 pixels por lado; palavras muito longas em escalas extremas podem atingir esse limite. Não se mede uma taxa de quadros garantida para todo hardware.

Limites conhecidos: grupos com escala não proporcional e objetos rotacionados são transformados sem cisalhamento; o roteamento automático considera origem/destino e não todos os obstáculos; as fontes de sistema de arquivos antigos dependem de estarem instaladas; imagens animadas são renderizadas como quadro estático. Diferentes navegadores e dispositivos de caneta ainda exigem verificação adicional.

A revisão de composição verifica também o aumento do texto por alças laterais e de canto, texto sem quebra automática, editor em zoom baixo, borda proporcional além de 30 px, criação de quadros e recorte rotacionado, migração de quadros antigos, pontos de conexão por hover, igualdade numérica da curva prévia/final, ajuste sem salto, camadas aninhadas, renomear/ocultar/bloquear e a ordem real dos pixels entre formas, traços e conectores.
