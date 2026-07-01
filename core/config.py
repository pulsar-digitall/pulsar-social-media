"""Configuracao central: caminhos do projeto e leitura do .env."""

from pathlib import Path
import os

from dotenv import load_dotenv

# core/ fica um nivel abaixo da raiz do projeto.
BASE_DIR = Path(__file__).resolve().parent.parent
SWIPE_DIR = BASE_DIR / "swipe"
BRAND_PATH = BASE_DIR / "brand.md"
PROMPTS_DIR = BASE_DIR / "skills" / "swipe_criativos" / "prompts"

NICHOS_VALIDOS = ("medica", "estetica", "odonto")

load_dotenv(BASE_DIR / ".env")


def gemini_api_key() -> str:
    chave = os.getenv("GEMINI_API_KEY", "").strip()
    if not chave:
        raise RuntimeError(
            "GEMINI_API_KEY nao configurada. Copie .env.example para .env e preencha a chave."
        )
    return chave


def gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()


def ler_prompt(nome: str) -> str:
    return (PROMPTS_DIR / nome).read_text(encoding="utf-8")


def brand_preenchido() -> bool:
    """True quando o brand.md ja tem conteudo real (sem marcadores [PREENCHER])."""
    if not BRAND_PATH.exists():
        return False
    texto = BRAND_PATH.read_text(encoding="utf-8")
    return "[PREENCHER]" not in texto


def brand_texto() -> str:
    return BRAND_PATH.read_text(encoding="utf-8")
