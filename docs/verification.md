# Verificação

Execute `npm test` e `npm run build` em `app`.

A suíte Playwright verifica os fluxos reais de biblioteca de boards, catálogo pesquisável, grupos aninhados com entidades mistas, duplicação de âncoras, bloqueio, estilos e rótulos de conectores, coordenadas da caneta em vários níveis de zoom, borracha parcial, laço, carregamento das fontes, texto rico, imagens e persistência após reload.

As verificações são feitas em um contexto novo do navegador. O servidor de teste usa `127.0.0.1:5174`; o conteúdo pessoal de outras origens não é utilizado. Capturas e traces de falhas ficam em `app/test-results`, fora do Git.

Além da suíte, foram verificadas visualmente telas do catálogo, tipografia, biblioteca inicial e edição de imagens, e comparados os menus observados da referência. A cobertura do catálogo corresponde às 23 entradas básicas e 54 de fluxograma inspecionadas; não representa todas as bibliotecas especializadas de diagramas.

Limites conhecidos: grupos com escala não proporcional e objetos rotacionados são transformados sem cisalhamento; o roteamento automático considera origem/destino e não todos os obstáculos; as fontes de sistema de arquivos antigos dependem de estarem instaladas; imagens animadas são renderizadas como quadro estático. Diferentes navegadores e dispositivos de caneta ainda exigem verificação adicional.
