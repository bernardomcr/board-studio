# Revisão de interação — v0.19.0

Referência: Miro aberto no Chrome em 2 de novembro de 2026. A comparação usa observação ao vivo, capturas anteriores e testes do aplicativo local. “Equivalente” descreve o fluxo observado; não significa reprodução integral de todos os estados do Miro.

## Correções desta rodada

- O contato de conectores considera o contorno visível, a borda proporcional, as máscaras de imagem e a rotação. Pontas abertas, preenchidas, círculos e losangos permanecem fora do objeto conectado. GPU e SVG usam a mesma geometria.
- A seleção por área testa a linha e seus marcadores, em vez de selecionar qualquer região do seu retângulo envolvente.
- Objetos bloqueados são ignorados no clique, hover e seleção por área do canvas. O botão direito considera o objeto visualmente acima; quando encontra o bloqueado, oferece somente manter pressionado para desbloquear. O painel de camadas é outro caminho explícito.
- A proteção também existe nos comandos: propriedades, exclusão, transformação, substituição por ID e ações em grupos não podem contornar o bloqueio. Bloqueios herdados sobrevivem à reorganização de camadas. Excluir um tópico com ramo bloqueado é uma operação vetada por inteiro.
- Ferramentas voltaram à lateral. O cabeçalho de documento continua compacto. Formas, notas, áudio, pincel e recorte respeitam o espaço ocupado pela lateral.
- Ao terminar de criar um objeto, o aplicativo volta a Selecionar (V). Outra criação exige escolher a ferramenta novamente; pincel e borracha continuam sendo ferramentas contínuas de desenho.
- A Home perdeu o banner, a marca gigante e os textos decorativos. Busca, criação, importação, projetos, preferências e perfil permanecem disponíveis, inclusive em largura estreita.
- “Organizar” está disponível também para traços e conectores. Imagens têm apenas uma entrada de recorte; os formatos ficam dentro dela. O menu de áudio ganhou foco inicial, navegação por setas e retorno de foco com Escape.
- A borracha de precisão deixou de reconstruir toda a máscara em cada atualização: reutiliza trechos de 32 segmentos e atualiza a cauda. O teste de interseção reaproveita a análise dos recortes antigos, rejeita regiões distantes e verifica áreas visíveis antes do cálculo exato. As amostras originais e o SVG persistido permanecem iguais.

## Comparação por funcionalidade

| Grupo | Miro / referência | Aplicativo nesta revisão | Avaliação |
| --- | --- | --- | --- |
| Home e perfil | Biblioteca e conta com serviços online | Biblioteca local, identidade pequena e interface limpa | Adaptado ao produto local |
| Seleção | Clique simples em membro de uma seleção múltipla mantém o conjunto | Mesmo fluxo; área vazia de curvas deixa de selecionar conectores | Equivalente no fluxo observado |
| Bloqueio | Controles de manter pressionado; clique curto não desbloqueia | Manter pressionado, com cancelamento e proteção nos comandos; canvas ignora o objeto | Adaptado à preferência de trabalho sobre fundos |
| Formas | Opções principais antes do catálogo completo | Opções principais, pesquisa e “Mais formas” | Equivalente na organização do fluxo |
| Notas | Paleta de cores e acesso ao bloco | Notas quadradas e bloco dispensador posicionável | Adaptado ao comportamento solicitado |
| Texto livre | Tipografia e alças de transformação | Escala do texto, dimensões naturais e criação ajustada ao zoom | Coberto por testes de escala; sem afirmar paridade universal |
| Texto dentro de objetos | Conteúdo e alinhamento na forma | Ajuste ao espaço disponível, preservando o tamanho de fonte desejado | Adaptado e testado |
| Fontes | Prévia, catálogo e recursos de marca | Catálogo local licenciado, prévias e carregamento de fontes próprias | Adaptado; sem copiar catálogo premium |
| Estilos e listas | Estilos, alinhamento, recuos e links | Controles por ícones; checklist interativo acrescentado ao texto | Adaptado |
| Cores e bordas | Transparência, espessura, padrões, opacidade e cores da marca | Mesmos grupos principais; amplitude e espessura proporcional próprias | Adaptado por preferência |
| Contato de conectores | Ligação entre objetos por suas extremidades | Limite no contorno real, incluindo imagens mascaradas | Corrigido nesta rodada |
| Curvas e pontas | Linha reta, ortogonal, curva, marcadores e troca de extremidades | Mesmos grupos, memória de estilo e extremidade sem seta por padrão | Adaptado; roteamento não declarado idêntico em todos os obstáculos |
| Rótulos e inserção na linha | Texto e inserção de forma no conector | Rótulos orientáveis e divisão transacional com preservação de conexões | Coberto por testes; alguns estados de edição não foram repetidos ao vivo |
| Imagens | Edição no quadro e formatos de recorte | Recorte no quadro, baixar, borda, cantos e opacidade; sem tratamento fotográfico | Subconjunto solicitado |
| Grupos e organização | Agrupar, desagrupar e alterar sobreposição | Grupos mistos/aninhados e organização consistente nos menus | Adaptado; bloqueios preservados |
| Camadas | Organização própria do Miro | Camadas de trabalho no modelo solicitado, inspirado em editores gráficos | Diferença intencional |
| Pincel e borrachas | Desenho à mão livre | Pincel com precisão, ajuste por gesto e borracha parcial apenas em desenhos | Diferença intencional |
| Mapa mental | Não é a referência principal escolhida | Modelo inspirado em MindMeister; criação, organização e proteção de ramos | Testado no app; MindMeister não foi reaberto nesta rodada |
| Tabela e áudio | Fluxos do produto original não são o alvo dessas extensões | Tabela com trilhas ajustáveis; player e gravação/importação local | Extensões próprias |
| Fundo, zoom e navegação | Grade, enquadramento e controles de zoom | Malhas, opacidade, fundo personalizado, zoom e inércia | Adaptado; desempenho depende do cenário |

## Diferenças que continuam explícitas

- O controle de saltos de linha aparece no Miro. Não há saltos gráficos automáticos nos cruzamentos do nosso app; sua disponibilidade no plano original não foi testada.
- Comentários colaborativos, presença, permissões de equipe, templates, assistentes de IA, integrações e bibliotecas de diagramas especializados não estão reproduzidos. Parte desses recursos foi excluída expressamente do escopo.
- Não há importação de pacotes de formas SVG como biblioteca editável do Miro. A importação de imagens é um fluxo separado.
- Perfil e boards continuam locais. Login online e sincronização com Google Drive ficaram para uma etapa posterior, por decisão do usuário.
- Não se declara comportamento idêntico em toda combinação de modificadores, encaixes e obstáculos de roteamento. Foram comparados os menus principais e verificados os fluxos implementados.
- Uma revisão não transforma o editor em garantia de 60 FPS em qualquer máquina. A pausa de serialização de um board pesado, medida na v0.18.0, não foi eliminada por esta rodada de interface.
- A máscara ainda percorre e desenha seus trechos existentes. Uniões de muitos cortes distintos podem exigir o cálculo geométrico exato; a otimização reduz a repetição desse cálculo, sem estabelecer desempenho constante para qualquer desenho.

## Borracha: medição antes e depois

Mesmo computador, Chromium 145 headless, builds de produção, seis traços com 10.800 amostras e 100 segmentos de borracha, incluindo a volta sobre a região já apagada. Tempo de execução do apagamento, atualização da cena e envio da renderização; não é uma medição de FPS da tela.

| Zoom | p95 anterior | p95 corrigido | Maior atualização anterior / corrigida |
| --- | ---: | ---: | ---: |
| 100% | 90,1 ms | 20,4 ms | 119,4 / 23,3 ms |
| 2% | 91,6 ms | 20,4 ms | 119,8 / 30,3 ms |

O teste preservou os seis traços, todas as 10.800 amostras e o desfazer/refazer. As máscaras foram comparadas com Canvas 2D em três escalas, inclusive com mais de 256 sobreposições. A revisão independente confirmou a união do stencil e a liberação dos recursos dos trechos descartados.

## Evidência e validação

REA via CLI 6.8.0, Chrome 156; o MCP do REA não estava conectado nesta sessão. O depurador foi aberto pelo usuário após a abertura automática ser bloqueada. Leituras passivas não executaram os cliques: menus e gestos foram inspecionados pela automação de interface.

- Descoberta ao vivo: `ev_a02eba026c4402e8a3fbadc2a474f403559b933f27e1a9db325fc65b2fc2652e`.
- Inspeção geral: `ev_1afeba93c9f21963b1c9f6606b806a8631a696af954bb47d9099436e2ce6ea51`.
- Recorte e formatos: `ev_5e7dfb2a0b038fa4d722e14b36426fd3441a7bf89749508c7e65b063156f0f6b`.
- Conector e opções de linha: `ev_619245c82b2d772435e4b8e7a74c69b2dc7922ec48a9974cc3934ee276a8a26d`.

As capturas privadas, relatórios de navegador e arquivos de trabalho permanecem em `work/`, fora do repositório. A observação começou na conexão do REA; não recupera atividade anterior nem demonstra execução de todo o código do Miro.

- Geometria: seis casos CPU, 972 combinações, e um caso GPU/SVG com 108 combinações de máscara, ponta, rotação e zoom.
- Bloqueio: 18 verificações CPU do autor e 40 verificações independentes; os dois caminhos adicionais encontrados na revisão foram corrigidos e revalidados.
- Foco de bloqueio/camadas/mapa mental: 34 cenários aprovados.
- Foco de compatibilidade e menus: 45 cenários aprovados, preservando verificações de estado, sincronização de cena, contenção e Undo/Redo.
- Após os ajustes finais, 108 cenários de criação, colagem, menus, notas, imagens, tabelas e bloqueios passaram sem falhas, repetições ou casos ignorados. TypeScript também passou.
- Na revisão adicional da borracha, quatro testes CPU e 65 cenários de navegador passaram, sem falhas ou casos ignorados. Também foram feitas 600 comparações determinísticas com o cálculo exato anterior.
- A suíte completa desta revisão contém 472 cenários de navegador e quatro testes CPU. O resultado integral deve ser conferido no relatório de publicação e no workflow do commit liberado.

Os testes usaram dados sintéticos. Não leram a área de transferência real nem gravaram o microfone do usuário. No Miro, o teste de manter pressionado alternou o bloqueio de uma forma vazia e a devolveu ao estado desbloqueado; conteúdo, geometria, cores e conexões não foram editados.
