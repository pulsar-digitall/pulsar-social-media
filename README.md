# PULSAR CENTRAL OPERACIONAL

Central de operação da Pulsar Negócios Digitais. Projeto standalone (não depende do Agency OS).

Módulos no menu lateral:
- **Operação**: Dashboard consolidado, Clientes (cadastro único) e Gestor de Tráfego
  (Meta Ads). Consomem a API do backend `PULSAR GESTOR DE TRÁFEGO` — suba com
  `npm run server` na pasta do backend (porta 3001, configurável no `config.js` daqui).
  Sem o backend no ar, essas áreas mostram o aviso "Backend offline".
- **Radar**: Concorrentes (anúncios ativos dos concorrentes monitorados, antigo Espião)
  e Swipe de Anúncios (acervo curado de referências de anúncio pago).
- **Social Media**: Planejamento, Redator IA, Designer IA, Swipe Orgânico e
  Biblioteca — em breve.
- **Entregas**: Relatórios e Tracking em breve.

Skills:
- `swipe-criativos`: analisa um reel local, monta um card de criativo e gera 3 variações
  de roteiro no tom da Pulsar.

## Ver o app (front-end)

O app é um shell com sidebar em `index.html` (na raiz). A área Concorrentes (Radar) carrega a galeria
de criativos a partir de `swipe/cards.js` (via `<script>`, nunca por fetch).
Alguns navegadores bloqueiam vídeo local via `file://`, então use o servidor estático:

```
serve.bat
```

Depois abra: http://localhost:8000/

O `serve.bat` usa `python -m http.server` na raiz (apenas serve arquivos, não é backend),
deixando o `index.html` e os vídeos em `swipe/` acessíveis juntos.

## Radar (Concorrentes): listar anúncios ativos de um concorrente (scraper)

Usa Playwright com o Google Chrome instalado (o Chromium empacotado falha nesta máquina).

```
python scripts/listar_ativos.py <page_id_ou_link_da_ad_library> --headless --video
python scripts/gerar_cards_espiao.py
```

Flags do `listar_ativos.py`:
- `--headless`: roda sem abrir janela.
- `--video`: baixa os vídeos localmente (em `swipe/espiao_midia/`) para tocar e baixar no
  app de forma durável. Sem essa flag, só baixa as miniaturas.
- `--max-seg N`: tempo máximo de rolagem (padrão 180).
- `--sem-midia`: não baixa nada (só lista).

Isso gera `swipe/cards_espiao.js`, que a área Concorrentes exibe automaticamente. No app: clicar num
card abre o player; o botão "Baixar" salva o criativo. As mídias ficam locais, então não
dependem do token do Facebook (que expira). Veja o `REVIEW.md` para o estado atual.

## Rodar a skill (processar um vídeo)

Requisitos: ver seção abaixo. Depois:

```
python -m skills.swipe_criativos.skill --video "C:\caminho\reel.mp4" --nicho estetica
```

Nichos: `medica`, `estetica`, `odonto`.

## Requisitos
- Python 3.10+ instalado de verdade (não o atalho da Microsoft Store).
- `pip install -r requirements.txt`
- Chave do Gemini em `.env` (`GEMINI_API_KEY`).

## Estrutura
- `core/`: base compartilhada por todas as skills.
- `skills/`: uma pasta por skill.
- `index.html`: shell do app (sidebar + áreas). Entrada principal.
- `swipe/`: saída da skill (`cards.js` e vídeos por nicho/slug).
