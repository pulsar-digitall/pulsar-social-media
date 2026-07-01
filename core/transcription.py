"""Etapa de transcricao, isolada de proposito.

Hoje usa Gemini. Para trocar por Whisper local depois, basta reimplementar
`transcrever(caminho_video)` aqui, sem mexer no resto do projeto.
"""

from core import gemini_client, config


def transcrever(arquivo_video) -> str:
    """Recebe o arquivo de video ja subido no Gemini e devolve a transcricao verbatim.

    Para Whisper local, trocar a assinatura para receber o caminho do arquivo e
    rodar o modelo local aqui.
    """
    prompt = config.ler_prompt("transcricao.txt")
    dados = gemini_client.gerar_json(prompt, arquivo_video)
    return dados.get("transcricao", "")
