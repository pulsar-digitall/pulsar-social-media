"""Converte a saida do scraper (scripts/out/anuncios_<id>.json) em cards do app.

Gera swipe/cards_espiao.js no formato window.CARDS_ESPIAO = [...], que o Espiao
le via <script>. Sao anuncios LISTADOS (ainda nao dissecados): tem id, concorrente,
formato, midia e texto. Os campos ricos (hook, body, cta, analise, variacoes) so
aparecem depois que rodar a disseccao no Gemini.

Uso:
    python scripts/gerar_cards_espiao.py            (junta todos os anuncios_*.json)
    python scripts/gerar_cards_espiao.py 105263212060030
"""

import sys
import json
from collections import Counter
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = BASE_DIR / "scripts" / "out"
DESTINO = BASE_DIR / "swipe" / "cards_espiao.js"


def concorrente_predominante(cards: list) -> str:
    nomes = Counter(c.get("anunciante", "") for c in cards if c.get("anunciante"))
    return nomes.most_common(1)[0][0] if nomes else ""


def carregar(page_id: str | None) -> list:
    arquivos = sorted(OUT_DIR.glob(f"anuncios_{page_id}.json" if page_id else "anuncios_*.json"))
    if not arquivos:
        raise SystemExit("Nenhum anuncios_*.json em scripts/out. Rode listar_ativos.py antes.")
    cards = []
    hoje = date.today().isoformat()
    for arq in arquivos:
        dados = json.loads(arq.read_text(encoding="utf-8"))
        pid = dados.get("page_id", "")
        concorrente = concorrente_predominante(dados.get("cards", []))
        for c in dados.get("cards", []):
            ad_id = c.get("id", "")
            cards.append({
                "id": f"espiao-{ad_id}",
                "ad_id": ad_id,
                "mock": False,
                "origem": "espiao",
                "dissecado": False,
                "salvo_no_swipe": False,
                "concorrente": c.get("anunciante") or concorrente,
                "page_id": pid,
                "nicho": "",
                "formato": c.get("formato", ""),
                "midia_url": c.get("video_url") or c.get("midia", ""),
                "midia_local": c.get("midia_local", ""),
                "midia_video_local": c.get("midia_video_local", ""),
                "texto": c.get("texto", ""),
                "criado_em": hoje,
            })
    return cards


def main(argv) -> int:
    page_id = argv[0] if argv else None
    cards = carregar(page_id)
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    conteudo = (
        "// Gerado por scripts/gerar_cards_espiao.py a partir do scraper. Nao editar a mao.\n"
        "// Anuncios LISTADOS (nao dissecados) dos concorrentes monitorados.\n"
        "window.CARDS_ESPIAO = " + json.dumps(cards, ensure_ascii=False, indent=2) + ";\n"
    )
    DESTINO.write_text(conteudo, encoding="utf-8")
    concorrentes = sorted({c["concorrente"] for c in cards})
    print(f"OK. {len(cards)} cards gerados de {len(concorrentes)} concorrente(s).")
    print("Concorrentes:", ", ".join(concorrentes))
    print(f"Salvo em: {DESTINO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
