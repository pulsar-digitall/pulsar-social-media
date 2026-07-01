// ==========================================================================
// DADOS MOCK (FICTICIOS) - apenas para visualizar o layout do app.
// Serao SUBSTITUIDOS quando a skill processar videos reais
// (storage.regenerar_cards_js reescreve este arquivo a partir dos card.json).
// Todo card aqui tem "mock": true.
//
// Schema unico (serve Espiao e Swipe, sem duplicar):
//   origem:        "espiao" | "manual"
//   salvo_no_swipe: true | false   -> aparece no Swipe quando true
//   concorrente:   nome usado para agrupar no Espiao (vazio em cards manuais)
// ==========================================================================
window.CARDS = [
  {
    "id": "mock-estetica-botox",
    "mock": true,
    "origem": "espiao",
    "salvo_no_swipe": true,
    "concorrente": "Clinica Vitalis",
    "fonte": "",
    "nicho": "estetica",
    "formato": "Reel vertical 9:16 falando para a camera",
    "duracao": "00:34",
    "video": "",
    "hook": "Voce ainda acha que botox deixa o rosto travado?",
    "tipo_hook": "Pergunta",
    "hook_visual": "Close no rosto da profissional levantando a sobrancelha de forma natural",
    "body": "Quebra a objecao do rosto congelado, explica aplicacao em pontos estrategicos e mostra resultado natural com expressao preservada.",
    "cta": "Chama no link da bio e agenda sua avaliacao",
    "direcao_edicao": "Cortes rapidos a cada 2s, legenda amarela centralizada, musica de fundo discreta",
    "transcricao": "Voce ainda acha que botox deixa o rosto travado? Entao deixa eu te mostrar uma coisa. Quando a aplicacao e feita em pontos certos, a sua expressao continua natural, so as linhas de tensao somem. Olha aqui o antes e o depois dessa paciente. Naturalidade total. Se voce quer esse resultado, chama no link da bio.",
    "por_que_escalou": "Ataca a objecao numero um do publico de estetica logo no primeiro segundo e entrega prova visual rapida, mantendo o espectador ate o CTA.",
    "analise_visual": {
      "primeiros_3s": "Rosto em close, contato visual direto e pergunta na legenda",
      "ritmo_corte": "rapido, cortes a cada 2 segundos",
      "formato": "vertical",
      "legenda": "true",
      "musica": "true",
      "texto_na_tela": "true",
      "tom_expressao": "Confiante, proximo, didatico"
    },
    "variacoes": [
      { "titulo": "Variacao 1", "hook": "Tem medo de ficar com cara de assustada depois do botox?", "body": "Mostra que o segredo esta na dosagem e no mapeamento facial individual.", "cta": "Agenda sua avaliacao pelo link da bio", "direcao_visual": "Close no rosto, gesto suave apontando os pontos de aplicacao" },
      { "titulo": "Variacao 2", "hook": "Botox natural existe e eu vou te provar em 30 segundos", "body": "Antes e depois de tres pacientes diferentes para mostrar consistencia.", "cta": "Chama no direct para tirar suas duvidas", "direcao_visual": "Sequencia de antes e depois com transicao limpa" },
      { "titulo": "Variacao 3", "hook": "O erro que deixa o botox artificial nao e o que voce pensa", "body": "Explica que o problema e a tecnica e nao o produto.", "cta": "Marque sua consulta de avaliacao", "direcao_visual": "Profissional falando em frente a um fundo escuro e limpo" }
    ],
    "criado_em": "2026-06-19"
  },
  {
    "id": "mock-estetica-preenchimento",
    "mock": true,
    "origem": "espiao",
    "salvo_no_swipe": false,
    "concorrente": "Clinica Vitalis",
    "fonte": "",
    "nicho": "estetica",
    "formato": "Reel vertical 9:16 com antes e depois",
    "duracao": "00:26",
    "video": "",
    "hook": "Preenchimento labial nao precisa parecer artificial",
    "tipo_hook": "Declaracao polemica",
    "hook_visual": "Antes e depois em tela dividida nos labios",
    "body": "Mostra que volume na medida certa respeita a proporcao do rosto e quebra o medo do exagero.",
    "cta": "Agende sua avaliacao de harmonizacao",
    "direcao_edicao": "Tela dividida, zoom suave, legenda branca, musica calma",
    "transcricao": "Preenchimento labial nao precisa parecer artificial. O segredo e respeitar a proporcao do seu rosto. Olha a diferenca: volume na medida certa, contorno definido, e continua sendo voce. Vem fazer sua avaliacao.",
    "por_que_escalou": "Usa prova visual imediata e ataca o medo do resultado exagerado, principal trava de quem considera preenchimento.",
    "analise_visual": {
      "primeiros_3s": "Tela dividida com labios antes e depois",
      "ritmo_corte": "medio",
      "formato": "vertical",
      "legenda": "true",
      "musica": "true",
      "texto_na_tela": "true",
      "tom_expressao": "Acolhedor e seguro"
    },
    "variacoes": [
      { "titulo": "Variacao 1", "hook": "Da pra fazer preenchimento e ninguem perceber?", "body": "Explica a tecnica de volumizacao natural ponto a ponto.", "cta": "Chama no link da bio", "direcao_visual": "Close nos labios com legenda explicativa" },
      { "titulo": "Variacao 2", "hook": "O que ninguem te conta sobre preenchimento labial", "body": "Lista tres mitos e derruba cada um.", "cta": "Agende sua avaliacao", "direcao_visual": "Profissional falando com texto de apoio" },
      { "titulo": "Variacao 3", "hook": "Labios naturais em 20 minutos, sem exagero", "body": "Mostra o passo a passo do procedimento rapido.", "cta": "Marque seu horario", "direcao_visual": "B-roll do procedimento com ritmo calmo" }
    ],
    "criado_em": "2026-06-19"
  },
  {
    "id": "mock-odonto-lentes",
    "mock": true,
    "origem": "espiao",
    "salvo_no_swipe": true,
    "concorrente": "OdontoExcellence",
    "fonte": "",
    "nicho": "odonto",
    "formato": "Reel vertical 9:16 com B-roll de procedimento",
    "duracao": "00:41",
    "video": "",
    "hook": "Lente de resina ou porcelana? O erro de escolha custa caro",
    "tipo_hook": "Erro comum",
    "hook_visual": "Comparacao lado a lado de dois sorrisos na tela",
    "body": "Explica a diferenca de durabilidade e estetica entre os dois materiais e ajuda o paciente a entender quando cada um vale a pena.",
    "cta": "Agende uma avaliacao para descobrir a melhor opcao para o seu sorriso",
    "direcao_edicao": "B-roll do procedimento intercalado com a fala, legendas grandes, ritmo medio",
    "transcricao": "Lente de resina ou porcelana? Muita gente escolhe pelo preco e se arrepende depois. A resina e mais barata mas mancha e dura menos. A porcelana custa mais mas mantem o brilho por muito mais tempo. A escolha certa depende do seu caso. Vem fazer uma avaliacao com a gente.",
    "por_que_escalou": "Educa e gera autoridade ao mesmo tempo, transformando uma duvida comum de compra em motivo para agendar avaliacao.",
    "analise_visual": {
      "primeiros_3s": "Texto comparativo na tela e dois sorrisos lado a lado",
      "ritmo_corte": "medio, alterna fala e B-roll",
      "formato": "vertical",
      "legenda": "true",
      "musica": "true",
      "texto_na_tela": "true",
      "tom_expressao": "Tecnico e acolhedor"
    },
    "variacoes": [
      { "titulo": "Variacao 1", "hook": "Quem te vendeu lente de resina nao te contou isso", "body": "Lista tres pontos sobre manutencao e durabilidade que costumam ser omitidos.", "cta": "Agende sua avaliacao e veja o que cabe no seu caso", "direcao_visual": "Profissional falando com B-roll de boca em fechamento" },
      { "titulo": "Variacao 2", "hook": "Antes de fazer lente, assista isso por 30 segundos", "body": "Checklist do que avaliar antes de escolher o material.", "cta": "Chama no link da bio para uma avaliacao", "direcao_visual": "Lista aparecendo na tela item a item" },
      { "titulo": "Variacao 3", "hook": "Lente barata pode sair mais cara do que voce imagina", "body": "Mostra o custo de troca e manutencao no longo prazo.", "cta": "Marque sua avaliacao hoje", "direcao_visual": "Grafico simples de custo no tempo" }
    ],
    "criado_em": "2026-06-19"
  },
  {
    "id": "mock-odonto-implante",
    "mock": true,
    "origem": "espiao",
    "salvo_no_swipe": false,
    "concorrente": "OdontoExcellence",
    "fonte": "",
    "nicho": "odonto",
    "formato": "Reel vertical 9:16 depoimento de paciente",
    "duracao": "00:38",
    "video": "",
    "hook": "Perdi um dente e achei que ia ficar assim para sempre",
    "tipo_hook": "Historia pessoal",
    "hook_visual": "Paciente sorrindo e tocando o rosto com emocao",
    "body": "Conta a jornada do paciente do constrangimento ate recuperar o sorriso com implante, focando no impacto emocional.",
    "cta": "Agende sua avaliacao de implante",
    "direcao_edicao": "Depoimento direto, cortes suaves, musica emotiva, legenda branca",
    "transcricao": "Perdi um dente e achei que ia ficar assim para sempre. Tinha vergonha de sorrir, de falar. Ai conheci a clinica e fiz o implante. Hoje eu sorrio sem pensar duas vezes. Mudou minha vida. Se voce esta passando por isso, vem conversar com eles.",
    "por_que_escalou": "Depoimento real com carga emocional alta gera identificacao e confianca, dois gatilhos fortes no nicho de implante.",
    "analise_visual": {
      "primeiros_3s": "Paciente em close com expressao emocionada",
      "ritmo_corte": "lento, cortes suaves",
      "formato": "vertical",
      "legenda": "true",
      "musica": "true",
      "texto_na_tela": "false",
      "tom_expressao": "Emotivo e verdadeiro"
    },
    "variacoes": [
      { "titulo": "Variacao 1", "hook": "Sorrir de novo depois de perder um dente e possivel", "body": "Mostra a transformacao com foco na autoestima.", "cta": "Agende sua avaliacao", "direcao_visual": "Depoimento com antes e depois do sorriso" },
      { "titulo": "Variacao 2", "hook": "A vergonha de sorrir tem solucao", "body": "Explica como o implante devolve funcao e confianca.", "cta": "Chama no link da bio", "direcao_visual": "Paciente falando direto para a camera" },
      { "titulo": "Variacao 3", "hook": "O dia que ela voltou a sorrir sem medo", "body": "Narrativa da jornada da paciente em primeira pessoa.", "cta": "Marque sua consulta", "direcao_visual": "Sequencia emotiva com trilha suave" }
    ],
    "criado_em": "2026-06-19"
  },
  {
    "id": "mock-medica-emagrecimento",
    "mock": true,
    "origem": "espiao",
    "salvo_no_swipe": true,
    "concorrente": "Instituto Lumina",
    "fonte": "",
    "nicho": "medica",
    "formato": "Reel vertical 9:16 falando para a camera no consultorio",
    "duracao": "00:28",
    "video": "",
    "hook": "Voce nao engorda por falta de forca de vontade",
    "tipo_hook": "Declaracao polemica",
    "hook_visual": "Medico olhando direto para a camera, expressao serena",
    "body": "Tira a culpa do paciente, fala de fatores hormonais e metabolicos e posiciona o acompanhamento medico como caminho.",
    "cta": "Agende sua consulta de avaliacao metabolica",
    "direcao_edicao": "Plano fixo, fala direta, legenda branca, sem trilha forte",
    "transcricao": "Voce nao engorda por falta de forca de vontade. Existem fatores hormonais e metabolicos que pesam muito mais do que a dieta da moda. Quando a gente entende o seu metabolismo, o emagrecimento deixa de ser uma luta. Vem fazer uma avaliacao comigo.",
    "por_que_escalou": "Quebra a crenca de culpa do publico e gera identificacao imediata, abrindo espaco para a autoridade medica conduzir ao agendamento.",
    "analise_visual": {
      "primeiros_3s": "Medico em plano fixo falando direto para a camera",
      "ritmo_corte": "lento, plano unico",
      "formato": "vertical",
      "legenda": "true",
      "musica": "false",
      "texto_na_tela": "true",
      "tom_expressao": "Calmo, seguro e acolhedor"
    },
    "variacoes": [
      { "titulo": "Variacao 1", "hook": "Pare de se culpar por nao emagrecer", "body": "Explica o papel dos hormonios e do metabolismo de forma simples.", "cta": "Agende sua avaliacao metabolica", "direcao_visual": "Plano fixo no consultorio, fala calma e direta" },
      { "titulo": "Variacao 2", "hook": "A dieta da moda esta sabotando o seu corpo", "body": "Mostra por que dietas restritivas falham no longo prazo.", "cta": "Marque uma consulta de avaliacao", "direcao_visual": "Medico falando com texto de apoio na tela" },
      { "titulo": "Variacao 3", "hook": "Existe um motivo medico para voce nao emagrecer", "body": "Apresenta os exames que ajudam a entender o quadro.", "cta": "Chama no link da bio e agende sua avaliacao", "direcao_visual": "Plano fixo, expressao serena" }
    ],
    "criado_em": "2026-06-19"
  },
  {
    "id": "mock-medica-checkup",
    "mock": true,
    "origem": "espiao",
    "salvo_no_swipe": false,
    "concorrente": "Instituto Lumina",
    "fonte": "",
    "nicho": "medica",
    "formato": "Reel vertical 9:16 educativo",
    "duracao": "00:31",
    "video": "",
    "hook": "Esse exame que ninguem pede pode salvar sua vida",
    "tipo_hook": "Numero/dado",
    "hook_visual": "Medico segurando um resultado de exame em destaque",
    "body": "Explica a importancia do check-up preventivo e por que esperar sintoma e tarde demais.",
    "cta": "Agende seu check-up completo",
    "direcao_edicao": "Fala direta com inserts de exames, legenda branca, ritmo medio",
    "transcricao": "Esse exame que ninguem pede pode salvar a sua vida. A maioria das pessoas so procura o medico quando sente algo, mas muita coisa silenciosa so aparece no check-up. Prevenir custa muito menos do que tratar. Vem fazer o seu.",
    "por_que_escalou": "Usa gatilho de urgencia e medo com responsabilidade, posicionando a prevencao como decisao inteligente.",
    "analise_visual": {
      "primeiros_3s": "Medico segurando um exame com texto de impacto na tela",
      "ritmo_corte": "medio, com inserts",
      "formato": "vertical",
      "legenda": "true",
      "musica": "true",
      "texto_na_tela": "true",
      "tom_expressao": "Serio e responsavel"
    },
    "variacoes": [
      { "titulo": "Variacao 1", "hook": "Voce so vai ao medico quando ja doi?", "body": "Mostra o valor da prevencao com exemplos simples.", "cta": "Agende seu check-up", "direcao_visual": "Medico falando com inserts de exames" },
      { "titulo": "Variacao 2", "hook": "O exame que pode mudar o seu ano", "body": "Lista o que um check-up completo cobre.", "cta": "Chama no link da bio", "direcao_visual": "Lista na tela item a item" },
      { "titulo": "Variacao 3", "hook": "Prevenir custa menos do que tratar", "body": "Compara o custo de prevencao e de tratamento tardio.", "cta": "Marque seu check-up hoje", "direcao_visual": "Comparativo visual simples" }
    ],
    "criado_em": "2026-06-19"
  }
];
