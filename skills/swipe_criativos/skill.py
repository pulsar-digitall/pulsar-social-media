"""Skill swipe-criativos: orquestra o pipeline de ponta a ponta.

Uso:
    python -m skills.swipe_criativos.skill --video "C:\\caminho\\reel.mp4" --nicho estetica
    python -m skills.swipe_criativos.skill --video "..." --nicho odonto --fonte "@conta_origem"
"""

import argparse
import sys

from core import config, gemini_client, transcription, storage
from skills.swipe_criativos import card_builder, variations


def processar(caminho_video: str, nicho: str, fonte: str = "") -> dict:
    if nicho not in config.NICHOS_VALIDOS:
        raise ValueError(f"Nicho invalido: {nicho}. Use um de {config.NICHOS_VALIDOS}.")

    # Trava cedo: nao adianta processar se nao da para gerar variacoes depois.
    if not config.brand_preenchido():
        raise variations.BrandVazioError(
            "brand.md ainda sem conteudo. Preencha o tom da Pulsar antes de processar."
        )

    print("Subindo o video para o Gemini...")
    arquivo = gemini_client.subir_video(caminho_video)

    print("Analisando o criativo...")
    prompt_analise = config.ler_prompt("analise.txt")
    analise = gemini_client.gerar_json(prompt_analise, arquivo)

    print("Transcrevendo...")
    # A transcricao vem do modulo isolado (trocavel por Whisper depois), em chamada propria.
    analise["transcricao"] = transcription.transcrever(arquivo)

    slug = card_builder.slugify(analise.get("hook", "")[:60])
    video_nome = storage.copiar_video(caminho_video, nicho, slug)
    card = card_builder.montar_card(analise, nicho, fonte, video_nome, slug)

    print("Gerando 3 variacoes de roteiro...")
    card["variacoes"] = variations.gerar_variacoes(card)

    caminho_json = storage.salvar_card(card)
    storage.regenerar_cards_js()
    print(f"Card salvo em: {caminho_json}")
    print("cards.js regenerado. Abra swipe/viewer.html via serve.bat.")
    return card


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Skill swipe-criativos da Pulsar.")
    parser.add_argument("--video", required=True, help="Caminho do reel local.")
    parser.add_argument("--nicho", required=True, choices=config.NICHOS_VALIDOS)
    parser.add_argument("--fonte", default="", help="Agencia ou conta de origem. Vazio se nao souber.")
    args = parser.parse_args(argv)
    try:
        processar(args.video, args.nicho, args.fonte)
    except variations.BrandVazioError as e:
        print(f"PARADO: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
