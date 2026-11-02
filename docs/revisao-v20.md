# Revisão de interface e mapa mental — v0.20.0

## Referência e alcance

O mapa mental segue a referência inicial do MindMeister capturada nesta máquina. A evidência REA `ev_591c64d55b59dace040e8fe39b03f7292b8769be209f27114df9d78d9ba43bdb` analisa três scripts selecionados; não demonstra execução de todos os caminhos. A referência inclui observações anteriores da interface e os controles de teclado, hierarquia, níveis e reordenação encontrados no código. Não houve nova sessão autenticada nesta rodada, por escolha do usuário.

Os limiares de arrasto são próprios do editor: faixa de inserção de até 14 pixels e tolerância de 10 pixels em tela. Não se declara equivalência matemática com todos os gestos do serviço original.

## Melhorias

| Área | Resultado |
| --- | --- |
| Tema | Campos numéricos, busca, seleção e diálogos mantêm fundo, texto e foco consistentes nos temas claro e escuro. O campo de fonte acomoda valores como 1039. |
| Ferramentas | Lateral em cápsula de altura intrínseca, com margens e adaptação em colunas nas telas baixas. O canvas fica acessível acima e abaixo. |
| Fundo | Botão e painel acessíveis, sem cobertura pela lateral. Menus usam a geometria real da barra. |
| Criação de mapas | Fontes, caixas, margens, espaçamento e linhas são proporcionais ao zoom de criação. A unidade do mapa é preservada em arquivo e ao redimensionar uma árvore completa. |
| Herança visual | Novos irmãos usam a aparência do tópico equivalente; filhos de um ramo usam a aparência do pai. Cor e paleta seguem o ramo e o tema. Conteúdo, notas e ícones não são duplicados. |
| Arrasto | Prévia distingue filho, irmão anterior/posterior e lado da raiz. Layouts fixos impõem a mesma orientação na prévia e no resultado. Ciclos e ramos bloqueados são rejeitados. |
| Ramos | Mostrar níveis 1–9 ou todos, recolher/expandir e selecionar subtópicos visíveis. As ações preservam a visibilidade manual e o histórico. |
| Menus | Aparência e alinhamento do tópico, comandos de ramos e opções gerais do mapa ficam em grupos próprios, com ícones e prévias. |
| Bloqueio | Tópico bloqueado oferece apenas manter pressionado para desbloquear; bloqueio herdado deve ser resolvido na camada. |

Caixas de tópicos existentes conservam suas dimensões e o ajuste automático de texto solicitado pelo usuário. Mover um ramo entre mapas com escalas distintas conserva a aparência dos tópicos e usa o espaçamento da raiz de destino. Arquivos antigos sem a nova unidade de layout mantêm o comportamento anterior.

Tópicos flutuantes e reprodução integral das animações, apresentação, colaboração e integrações do MindMeister não foram acrescentados nesta rodada.

## Validação

- Dez testes CPU aprovados, incluindo escala, herança, níveis, reordenação, bloqueios, Undo/Redo, cópia, importação e legado.
- Primeiro foco de navegador: 108 cenários aprovados, sem falhas ou casos ignorados.
- Foco após a revisão independente: 72 cenários aprovados, incluindo as quatro orientações de drop e os valores de fonte 1039/1040/1041.
- Interface verificada em 1600×1000, 390×844 e 800×460; criação e arrasto de mapas em 2%, 100% e 2000%.
- Os controles foram verificados por hit-test real e as relações do mapa por estado e histórico; os testes não leem a área de transferência real nem gravam o microfone.

A suíte completa contém 492 cenários de navegador, além dos dez testes CPU. O resultado integral e a validação do instalador devem ser conferidos no workflow do commit publicado. As capturas privadas e os relatórios de trabalho ficam fora do repositório.
