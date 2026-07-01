"""Gera 3 variacoes de roteiro no tom da Pulsar, adaptadas ao nicho."""

from core import config, gemini_client


class BrandVazioError(RuntimeError):
    """Lancada quando o brand.md ainda nao tem conteudo."""


def gerar_variacoes(card: dict) -> list:
    if not config.brand_preenchido():
        raise BrandVazioError(
            "brand.md ainda sem conteudo (marcadores [PREENCHER]). "
            "Preencha o tom da Pulsar antes de gerar variacoes."
        )

    template = config.ler_prompt("variacoes.txt")
    prompt = template.format(
        brand=config.brand_texto(),
        nicho=card.get("nicho", ""),
        hook=card.get("hook", ""),
        tipo_hook=card.get("tipo_hook", ""),
        body=card.get("body", ""),
        cta=card.get("cta", ""),
        por_que_escalou=card.get("por_que_escalou", ""),
    )
    dados = gemini_client.gerar_json(prompt)
    return dados.get("variacoes", [])
