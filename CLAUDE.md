# Pulsar Social Media Agente — frontend da PULSAR CENTRAL OPERACIONAL

Projeto standalone. NÃO faz parte do Agency OS e não depende dele.

## Regras da Central (espelham o CLAUDE.md do backend PULSAR GESTOR DE TRÁFEGO)

1. Este frontend NUNCA fala direto com a Meta API: todo dado passa pela API do
   backend (`config.js` → API_BASE_URL). Nenhum token ou chave vive no navegador
   (a chave da Central fica só no localStorage do usuário, nunca no código).
2. Alterações reais em campanha só existem via fluxo DRY_RUN + "Confirmo
   executar" do backend — a UI nunca ganha atalho que pule essa confirmação.
3. Mock nunca vira entregável: telas podem mostrar "Dados de exemplo" com selo,
   mas relatório/PDF/link público só saem com dados reais.
4. UI em português SEM acentos nas strings do app; sem console.log; sempre
   esc() em conteúdo dinâmico; cores só via tokens de central/tema.css.
5. Se uma tarefa parecer exigir contornar essas regras: PARAR e perguntar.

O projeto É o agente de social media da Pulsar. Ele tem várias habilidades (skills).
A primeira é `swipe-criativos`. Outras skills (criação de post e carrossel, calendário
editorial, agendamento) entram depois em `skills/`, reusando `core/`, sem reescrever nada.

## Regras de comportamento

### Idioma e estilo
- Responder sempre em português.
- Não usar travessões em nenhum output (texto, código, arquivos gerados).

### Dados e veracidade
- Não inventar a fonte (agência ou conta de origem). Se não souber, deixar o campo vazio.
- Não inventar o tom da Pulsar. Usar o `brand.md`.
- Se o `brand.md` estiver sem conteúdo (ainda com marcadores `[PREENCHER]`), a skill
  deve PARAR e pedir o conteúdo antes de gerar qualquer variação de roteiro.
- Não inventar informações sobre clientes, campanhas ou resultados.

### Processamento
- Não processar em lote ainda. Rodar em UM vídeo de teste, mostrar o card, as variações
  e o viewer, e esperar validação do schema antes de seguir.
- Ao copiar o vídeo para `swipe/[nicho]/[slug]/`, não copiar de novo se já existir lá
  (evitar duplicar ao reprocessar).

### Arquitetura
- Cada skill nova vira uma pasta em `skills/` e reusa `core/`.
- A etapa de transcrição fica isolada em `core/transcription.py`, para trocar Gemini por
  Whisper local depois sem mexer no resto.
- O `swipe/cards.js` é GERADO pela skill (formato `window.CARDS = [...]`), nunca editado
  à mão depois que houver cards reais. O `card.json` de cada criativo é a fonte de verdade.
- O `swipe/viewer.html` é desacoplado: lê apenas o `cards.js` via `<script>`, sem fetch,
  sem framework, sem build, sem backend.

### Segurança e ações destrutivas
- Perguntar antes de qualquer ação destrutiva ou irreversível.
- Mostrar o que vai mudar antes de sobrescrever um arquivo.
- Não rodar comandos de deploy sem confirmação explícita.

## Identidade visual (aplicar no que for visual)
- Fundo escuro / preto.
- Acento principal `#29ABE2`.
- Tipografia limpa.
- Detalhes completos de tom e vocabulário ficam no `brand.md`.
