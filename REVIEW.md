# Review da sessao (Espiao com dados reais)

Resumo do que avancei sozinho enquanto voce estava fora. Tudo que dependia de voce ficou
parado e marcado, sem dado inventado.

## O que ficou PRONTO

### 1. Ambiente instalado
- Python 3.12.10 + pip (em `%LOCALAPPDATA%\Programs\Python\Python312`).
- Playwright 1.60.0. O Chromium empacotado do Playwright quebra nesta maquina (erro
  "side-by-side"), entao o scraper usa o **Google Chrome ja instalado** (`channel="chrome"`).
- Visual C++ Redistributable (dependencia do navegador) instalado.

### 2. Scraper do Espiao (rota de producao, sem extensao, sem prompts)
- `scripts/listar_ativos.py`: recebe um page_id ou link da Ad Library e lista os anuncios
  ATIVOS do concorrente (id, formato video/imagem, url da midia, texto). Roda sozinho,
  headless, rola e acumula vencendo a virtualizacao da pagina.
- Rodado no concorrente **AMV Seu Sucesso Digital** (page_id 105263212060030):
  **69 anuncios coletados** (35 video, 34 imagem). Saida em
  `scripts/out/anuncios_105263212060030.json`.

### 3. Espiao ligado aos dados reais
- `scripts/gerar_cards_espiao.py`: converte a saida do scraper em cards no schema do app
  e gera `swipe/cards_espiao.js` (`window.CARDS_ESPIAO`).
- O `index.html` agora, quando existe `cards_espiao.js`, mostra no Espiao os **anuncios reais**
  agrupados por concorrente, cada card com midia, texto, formato e os botoes
  "Salvar no Swipe" e "Dissecar". Marcados como "Nao dissecado".
- O Dashboard reflete os numeros reais: anuncios ativos monitorados e concorrentes.
- Os mocks continuam existindo (Swipe e fallback do Espiao) e nada foi destruido.

### Como ver
Servidor: `serve.bat` na raiz (precisa do Python; ja instalado) ou o no-de temporario.
Abra **http://localhost:8000/** e va em **Espiao**.

## Correcoes e melhorias (rodada extra, sem tocar em brand/Gemini)

- **Bug de custo na pipeline**: a transcricao re-rodava a analise inteira (2 chamadas iguais
  ao Gemini). Separei em prompts distintos: `prompts/analise.txt` (analise + campos do card,
  sem transcricao) e `prompts/transcricao.txt` (so verbatim). Agora a transcricao e uma
  chamada propria e fica de fato isolada para trocar por Whisper depois.
- **SDK do Gemini atualizado**: `google.generativeai` foi descontinuado; migrei o
  `core/gemini_client.py` para o novo `google-genai`. Imports validados.
- **Espiao duravel**: o scraper agora baixa as miniaturas localmente
  (`swipe/espiao_midia/<page_id>/`), entao o Espiao nao fica em branco quando o token do
  Facebook expira. 69/69 miniaturas baixadas.
- **Viewer**: miniatura local com selo de play em videos, fallback elegante se a midia
  faltar, favicon (some o 404 do console) e o botao Dissecar avisa que precisa do Gemini.
- **Dependencias instaladas**: `pip install -r requirements.txt` rodado (google-genai,
  python-dotenv, playwright). Sintaxe e imports de todos os modulos validados.

## Rodada autonoma (full autonomy)

- **5 concorrentes monitorados**, 283 anuncios reais no total (AMV 70, Growth Odonto 132,
  Ideweb 44, Assessoria Ilha Odonto 24, Hp Odonto 11, + variacoes). Scroll do scraper
  melhorado (jiggles escalonados) para fechar mais perto do total.
- **Dashboard clicavel**: clicar num concorrente em "Em alta agora" abre o Espiao ja
  filtrado nele.
- **Filtro de Concorrente + busca por texto** no Espiao (modo real).
- **Swipe funcional de verdade**: "Salvar no Swipe" agora persiste em localStorage; o Swipe
  mostra os anuncios reais salvos + os mocks dissecados. Botao re-salvar/remover atualiza na
  hora. (O card.json segue como fonte para o Supabase quando migrar.)
- **Link "Ver na Ad Library"** em cada anuncio (abre o anuncio original pelo ad_id).
- Verificado por automacao headless: clique, busca, persistencia e link OK, sem erro no console.

## Rodada autonoma 3 (play + download)

- **Diagnostico**: o play nao funcionava porque o card mostrava so a miniatura (poster) e
  ~65% dos videos tinham URL "blob" (streaming) nao baixavel. Resolvido capturando o
  `currentSrc` real (https) dos `<video>` com scroll lento e atualizacao continua no coletor
  (cobertura ~100% dos videos).
- **Download dos criativos**: o scraper agora tem `--video` e baixa os mp4 localmente
  (`swipe/espiao_midia/`). 217 videos baixados (~487 MB). Tokens do Facebook nao importam mais.
- **Player no app (inline)**: clicar num card de video troca a miniatura pelo `<video>`
  DENTRO do proprio card (player no fluxo, sem sobreposicao). Isso evita o bug de
  empilhamento que cobria o modal no Chrome do usuario. Imagens/sem-arquivo abrem em aba nova.
  Video servido com range/206.
- **Botao de download**: "Baixar" em cada card e "Baixar criativo" no modal; salva o arquivo
  local com nome `concorrente_adid`.
- Verificado por automacao: modal abre/fecha, player usa caminho local, mp4 serve 200/206,
  download presente, sem erro no console.
- Obs: `swipe/espiao_midia/` esta no .gitignore (regeneravel pelo scraper).

## O que esta PARADO esperando voce (nao fiz de proposito, exige sua decisao/insumo)

1. **`brand.md` vazio** (marcadores `[PREENCHER]`). Sem o tom da Pulsar, a area Copywriter
   e a geracao de variacoes nao saem. Cole seu Editorial Brain ali.
2. **Chave do Gemini** em `.env` (`GEMINI_API_KEY`). Sem ela, o botao "Dissecar" (analise do
   criativo) e a pipeline de video nao rodam. Hoje "Dissecar" e so visual.
3. **Video de teste** pra validar a pipeline `swipe-criativos`.
4. **Mais concorrentes**: so rodei um. Pra adicionar, veja abaixo.

## Limitacoes honestas

- **Peguei 69 de 78** que a Ad Library mostra. A diferenca provavelmente sao "resultados"
  que agrupam variacoes/carrossel contados como um so. Da pra investigar depois.
- **Midia**: as miniaturas agora sao baixadas localmente, entao o Espiao continua mostrando
  os criativos mesmo depois do token expirar. O link remoto do video em si (para reproducao
  em alta) ainda expira; na fase de disseccao o video deve ser baixado na hora.
- O **Chromium empacotado do Playwright** nao funciona nesta maquina; dependemos do Chrome
  instalado. Se trocar de maquina, revisar isso.

## Como adicionar/atualizar concorrentes (quando voltar)

```
# 1. listar os ativos de um concorrente (page_id ou link da Ad Library)
python scripts/listar_ativos.py <page_id> --headless

# 2. regenerar os cards do Espiao com tudo que ja foi coletado
python scripts/gerar_cards_espiao.py

# 3. abrir http://localhost:8000/ e ver no Espiao
```
(Use o caminho completo do python se o terminal nao achar: 
`%LOCALAPPDATA%\Programs\Python\Python312\python.exe`)

## Proximos passos sugeridos (quando voce decidir)
- Preencher `brand.md` -> destrava Copywriter e variacoes.
- Por a chave do Gemini -> liga o "Dissecar" (anuncio listado vira card completo) e a
  pipeline de video.
- Decidir se o "Salvar no Swipe" e "Dissecar" passam a persistir de verdade (hoje sao visuais).
