"""Monta o card de criativo a partir da analise do Gemini."""

import re
import unicodedata
from datetime import date


def slugify(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    texto = re.sub(r"[^a-zA-Z0-9]+", "-", texto).strip("-").lower()
    return texto or "criativo"


def montar_card(analise: dict, nicho: str, fonte: str, video_nome: str, slug: str,
                origem: str = "espiao", concorrente: str = "") -> dict:
    """Normaliza a saida do Gemini no schema do card (fonte de verdade).

    Schema unico para Espiao e Swipe:
      origem:         "espiao" | "manual"
      salvo_no_swipe: aparece no Swipe quando True (comeca False)
      concorrente:    usado para agrupar no Espiao (vazio em cards manuais)
    """
    av = analise.get("analise_visual", {})
    return {
        "id": slug,
        "mock": False,
        "origem": origem,
        "salvo_no_swipe": False,
        "concorrente": concorrente or "",
        "fonte": fonte or "",
        "nicho": nicho,
        "formato": analise.get("formato", ""),
        "duracao": analise.get("duracao", ""),
        "video": video_nome,
        "hook": analise.get("hook", ""),
        "tipo_hook": analise.get("tipo_hook", ""),
        "hook_visual": analise.get("hook_visual", ""),
        "body": analise.get("body", ""),
        "cta": analise.get("cta", ""),
        "direcao_edicao": analise.get("direcao_edicao", ""),
        "transcricao": analise.get("transcricao", ""),
        "por_que_escalou": analise.get("por_que_escalou", ""),
        "analise_visual": {
            "primeiros_3s": av.get("primeiros_3s", ""),
            "ritmo_corte": av.get("ritmo_corte", ""),
            "formato": av.get("formato", ""),
            "legenda": av.get("legenda", ""),
            "musica": av.get("musica", ""),
            "texto_na_tela": av.get("texto_na_tela", ""),
            "tom_expressao": av.get("tom_expressao", ""),
        },
        "variacoes": [],
        "criado_em": date.today().isoformat(),
    }
