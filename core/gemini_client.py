"""Cliente de baixo nivel para o Gemini (SDK google-genai).

Responsavel apenas por: configurar a chave, subir o video e gerar JSON.
A logica de negocio (transcricao, analise, card, variacoes) fica nas camadas acima.
"""

import json
import time

from google import genai

from core import config

_cliente = None


def _client():
    global _cliente
    if _cliente is None:
        _cliente = genai.Client(api_key=config.gemini_api_key())
    return _cliente


def subir_video(caminho: str):
    """Sobe o video para o Gemini e espera ficar ACTIVE."""
    cli = _client()
    arquivo = cli.files.upload(file=caminho)
    while arquivo.state.name == "PROCESSING":
        time.sleep(2)
        arquivo = cli.files.get(name=arquivo.name)
    if arquivo.state.name != "ACTIVE":
        raise RuntimeError(f"Falha ao processar o video no Gemini (estado: {arquivo.state.name}).")
    return arquivo


def gerar_json(prompt: str, arquivo_video=None) -> dict:
    """Roda o modelo pedindo resposta em JSON e devolve um dict."""
    cli = _client()
    contents = [prompt]
    if arquivo_video is not None:
        contents.append(arquivo_video)
    resposta = cli.models.generate_content(
        model=config.gemini_model(),
        contents=contents,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(resposta.text)
