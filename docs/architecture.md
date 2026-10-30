# Arquitetura

O aplicativo usa TypeScript, Vite e PixiJS. O canvas tem camadas para fundo, quadros, traços, conectores, objetos e seleção. A câmera converte coordenadas entre tela e board; a prévia de desenho utiliza a mesma geometria final.

O estado contém widgets, conectores, traços, grupos e seleção. Comandos reversíveis registram alterações; transações agregam gestos em uma única etapa de histórico. Grupos formam uma árvore de referências, com folhas resolvidas para seleção e transformação. A duplicação remapeia IDs de objetos, ligações e subgrupos.

Cada board tem uma chave independente no IndexedDB. A biblioteca inicial mantém metadados, projetos e miniaturas em um índice local. Dados da versão anterior são migrados sem excluir a cópia original. Arquivos importados passam por validação de tipos, limites numéricos, referências e ciclos de grupos antes de substituir o board ativo.

As formas compartilham contornos entre canvas, hit-test, ícones e SVG. Conectores compartilham geometria de trajetórias, padrões e terminações. Imagens preservam bytes originais e armazenam recorte e transformação separadamente. O SVG inclui máscaras e fontes locais incorporadas quando exportado pela interface.

O projeto não contém endpoints de sincronização, autenticação ou armazenamento remoto. Publicar o código no GitHub não publica os boards mantidos no navegador.
