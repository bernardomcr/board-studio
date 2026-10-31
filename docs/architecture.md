# Arquitetura

O aplicativo usa TypeScript, Vite e PixiJS. O canvas tem camadas para fundo, quadros, traços, conectores, objetos e seleção. A câmera converte coordenadas entre tela e board; a prévia de desenho utiliza a mesma geometria final.

O estado contém widgets, conectores, traços, grupos e seleção. Comandos reversíveis registram alterações; transações agregam gestos em uma única etapa de histórico. Grupos formam uma árvore de referências, com folhas resolvidas para seleção e transformação. A duplicação remapeia IDs de objetos, ligações e subgrupos.

Objetos, conectores e traços compartilham uma ordem global por `z`, refletida no canvas, no painel Camadas e no SVG. Nome e visibilidade são propriedades persistidas por entidade. Objetos ocultos continuam disponíveis no painel, mas não participam da seleção no canvas ou da exportação. Quadros novos começam atrás do conteúdo; a migração preserva o comportamento de quadros de arquivos antigos. A máscara dos quadros acompanha sua rotação.

Cada board tem uma chave independente no IndexedDB. A biblioteca inicial mantém metadados, projetos e miniaturas em um índice local. Dados da versão anterior são migrados sem excluir a cópia original. Arquivos importados passam por validação de tipos, limites numéricos, referências e ciclos de grupos antes de substituir o board ativo.

As formas compartilham contornos entre canvas, hit-test, ícones e SVG. Conectores compartilham geometria de trajetórias, padrões e terminações. Imagens preservam bytes originais e armazenam recorte e transformação separadamente. O SVG inclui máscaras e fontes locais incorporadas quando exportado pela interface.

Texto solto usa área natural, sem quebra automática, e redimensiona fonte e geometria juntas ao arrastar qualquer alça. As dimensões concretas são registradas no journal após medir a fonte carregada. `borderScale` armazena a espessura da borda como proporção da menor dimensão; renderizadores resolvem a largura final, mantendo compatibilidade com bordas antigas em `borderWidth`.

Os menus são construídos por capacidade da seleção: texto, forma, imagem, quadro, conector, traço ou seleção mista. Cada barra tem estrutura própria de ícones e um submenu aberto por vez; posição e limites são calculados a partir da seleção e da viewport. Organizar transforma as raízes da seleção, preservando a estrutura interna dos grupos.

O módulo `connector-completion.ts` oferece um destino após criar ou reconectar uma ponta no vazio. Criar o objeto e anexar a ponta usa um comando composto reversível; dispensar o menu mantém a ponta livre. Prévia e confirmação usam a mesma escolha de âncoras. O recorte de imagem mantém o original e registra máscara, região e geometria em uma única ação.

O fundo é um campo do board, separado dos objetos selecionáveis. Um comando reversível altera cor, grade e imagem posicionada no mundo. A camada de cenário fica atrás do conteúdo; salvamento e arquivos editáveis preservam o original incorporado. SVG usa o fundo por padrão, e a opção `background: 'none'` o exclui da geometria e da exportação. O botão de seleção desativado usa navegação com mão, mantendo os objetos intactos.

O projeto não contém endpoints de sincronização, autenticação ou armazenamento remoto. Publicar o código no GitHub não publica os boards mantidos no navegador.
