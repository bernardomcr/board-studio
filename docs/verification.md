# Verificação

Execute `npm test` e `npm run build` em `app`.

A suíte Playwright verifica os fluxos reais de biblioteca de boards, catálogo pesquisável, grupos aninhados com entidades mistas, duplicação de âncoras, bloqueio, estilos e rótulos de conectores, coordenadas da caneta em vários níveis de zoom, borracha parcial, laço, carregamento das fontes, texto rico, imagens e persistência após reload.

São 18 cenários. A cobertura adicional inclui recorte circular com bordas pela interface; transparência verificada nos pixels do canvas; seleção individual dentro de grupos; menu nas bordas da viewport; destino vazio de conectores; alternância seleção/navegação; formatação no primeiro clique após editar tamanho; cor e grade por board; imagem de fundo de 6.000 × 3.000 pixels, escalada para 12.000 × 6.000 unidades sem deformação, exportada/reimportada e reaberta após reload.

As verificações são feitas em um contexto novo do navegador. O servidor de teste usa `127.0.0.1:5174`; o conteúdo pessoal de outras origens não é utilizado. Capturas e traces de falhas ficam em `app/test-results`, fora do Git.

Além da suíte, foram verificadas visualmente telas do catálogo, tipografia, biblioteca inicial e edição de imagens, e comparados os menus observados da referência. A cobertura do catálogo corresponde às 23 entradas básicas e 54 de fluxograma inspecionadas; não representa todas as bibliotecas especializadas de diagramas.

A revisão de menus usa observações da interface original e análise REA CLI de capturas retidas e três scripts originais públicos. Essa análise recuperou 1.571 módulos sem falhas de parsing e confirmou controles separados para recorte, formato, borda, substituição e tamanho original de imagem; pontas, tipo e inversão de conectores; e transações de recorte/grupo. A evidência completa e os scripts da referência ficam apenas em `work`, fora do repositório.

Essa passagem do REA não anexou a sessão atual do Chrome, que não expõe CDP. A análise estática tem grafo limitado e não demonstra execução. Os detalhes exatos do menu de destino vazio e das máscaras não foram estabelecidos por essa análise; a implementação desses fluxos foi verificada no aplicativo local. Não se declara equivalência completa de comportamento com a referência.

Limites conhecidos: grupos com escala não proporcional e objetos rotacionados são transformados sem cisalhamento; o roteamento automático considera origem/destino e não todos os obstáculos; as fontes de sistema de arquivos antigos dependem de estarem instaladas; imagens animadas são renderizadas como quadro estático. Diferentes navegadores e dispositivos de caneta ainda exigem verificação adicional.
