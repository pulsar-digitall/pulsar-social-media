"""Persistencia: copia o video, salva card.json + card.md e regenera o cards.js."""

import json
import shutil
from pathlib import Path

from core import config


def pasta_do_card(nicho: str, slug: str) -> Path:
    destino = config.SWIPE_DIR / nicho / slug
    destino.mkdir(parents=True, exist_ok=True)
    return destino


def copiar_video(caminho_origem: str, nicho: str, slug: str) -> str:
    """Copia o video para a pasta do card. Nao copia de novo se ja existir."""
    origem = Path(caminho_origem)
    destino = pasta_do_card(nicho, slug) / origem.name
    if not destino.exists():
        shutil.copy2(origem, destino)
    return origem.name


def salvar_card(card: dict) -> Path:
    pasta = pasta_do_card(card["nicho"], card["id"])
    caminho_json = pasta / "card.json"
    caminho_json.write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    (pasta / "card.md").write_text(_card_para_md(card), encoding="utf-8")
    return caminho_json


def regenerar_cards_js() -> Path:
    """Le todos os card.json e reescreve o cards.js com window.CARDS = [...]."""
    cards = []
    for caminho in sorted(config.SWIPE_DIR.glob("*/*/card.json")):
        cards.append(json.loads(caminho.read_text(encoding="utf-8")))
    destino = config.SWIPE_DIR / "cards.js"
    conteudo = (
        "// Gerado pela skill swipe-criativos. Nao editar a mao.\n"
        "window.CARDS = " + json.dumps(cards, ensure_ascii=False, indent=2) + ";\n"
    )
    destino.write_text(conteudo, encoding="utf-8")
    return destino


def _card_para_md(card: dict) -> str:
    av = card.get("analise_visual", {})
    linhas = [
        f"# {card.get('hook', '')}",
        "",
        f"- Fonte: {card.get('fonte', '') or '(vazio)'}",
        f"- Nicho: {card.get('nicho', '')}",
        f"- Formato: {card.get('formato', '')}",
        f"- Duracao: {card.get('duracao', '')}",
        f"- Tipo de hook: {card.get('tipo_hook', '')}",
        "",
        "## Hook",
        card.get("hook", ""),
        "",
        "## Hook visual",
        card.get("hook_visual", ""),
        "",
        "## Body",
        card.get("body", ""),
        "",
        "## CTA",
        card.get("cta", ""),
        "",
        "## Direcao e edicao",
        card.get("direcao_edicao", ""),
        "",
        "## Analise visual",
        f"- Primeiros 3s: {av.get('primeiros_3s', '')}",
        f"- Ritmo de corte: {av.get('ritmo_corte', '')}",
        f"- Legenda na tela: {av.get('legenda', '')}",
        f"- Musica: {av.get('musica', '')}",
        f"- Texto na tela: {av.get('texto_na_tela', '')}",
        f"- Tom e expressao: {av.get('tom_expressao', '')}",
        "",
        "## Por que escalou",
        card.get("por_que_escalou", ""),
        "",
        "## Transcricao",
        card.get("transcricao", ""),
        "",
        "## Variacoes de roteiro",
    ]
    for i, v in enumerate(card.get("variacoes", []), start=1):
        linhas += [
            "",
            f"### {v.get('titulo', f'Variacao {i}')}",
            f"- Hook: {v.get('hook', '')}",
            f"- Body: {v.get('body', '')}",
            f"- CTA: {v.get('cta', '')}",
            f"- Direcao visual: {v.get('direcao_visual', '')}",
        ]
    return "\n".join(linhas) + "\n"
