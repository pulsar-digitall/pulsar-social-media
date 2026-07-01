"""Lista os anuncios ATIVOS de um concorrente na Meta Ad Library via Playwright.

Roda sozinho, com navegador proprio (sem a extensao Claude in Chrome, sem prompts).
Apenas listagem (id, formato, url da midia, texto). Sem disseccao.

Uso:
    python scripts/listar_ativos.py <page_id_ou_link_da_ad_library>
    python scripts/listar_ativos.py 105263212060030
    python scripts/listar_ativos.py "https://www.facebook.com/ads/library/?...view_all_page_id=105263212060030"

Flags:
    --headless   roda sem abrir janela (padrao: com janela, passa melhor no anti-bot)
    --max-seg N  tempo maximo de rolagem em segundos (padrao 180)
"""

import sys
import re
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = BASE_DIR / "scripts" / "out"

# Coletor injetado na pagina: captura cada card conforme entra no DOM (vence a virtualizacao).
COLETOR_JS = r"""
() => {
  if (window.__ADS) return;
  window.__ADS = new Map();
  const idRe = /Identificação da biblioteca:\s*(\d+)|Library ID:\s*(\d+)/i;
  window.__scanAds = () => {
    document.querySelectorAll('span,div').forEach(e => {
      if (e.children.length) return;
      const m = (e.textContent || '').match(idRe);
      if (!m) return;
      const id = m[1] || m[2];
      if (!id) return;
      let node = e;
      for (let i = 0; i < 14 && node.parentElement; i++) {
        node = node.parentElement;
        if (node.querySelector('video, img[src]')) break;
      }
      // Upgrade-friendly: o card pode aparecer com o video ainda em buffer (sem url).
      // Atualizamos a entrada conforme o currentSrc do video vira https.
      let prev = window.__ADS.get(id);
      if (!prev) {
        prev = { id: id, formato: 'desconhecido', midia: '', video_url: '', thumb: '', anunciante: '', texto: '' };
        window.__ADS.set(id, prev);
      }
      const video = node.querySelector('video');
      const imgs = Array.from(node.querySelectorAll('img')).filter(i => i.src && !i.src.startsWith('data:'));
      if (video) {
        prev.formato = 'video';
        const src = video.currentSrc || video.src || '';
        if (src.indexOf('http') === 0 && !prev.video_url) { prev.video_url = src; prev.midia = src; }
        if (!prev.thumb) prev.thumb = video.poster || (imgs[0] ? imgs[0].src : '');
      } else if (imgs.length && prev.formato !== 'video') {
        prev.formato = 'imagem';
        const best = imgs.slice().sort((a, b) => (b.naturalWidth || 0) - (a.naturalWidth || 0))[0].src;
        if (!prev.midia) prev.midia = best;
        if (!prev.thumb) prev.thumb = best;
      }
      if (!prev.anunciante || !prev.texto) {
        const raw = node.innerText || '';
        if (!prev.anunciante) {
          const pIdx = raw.indexOf('Patrocinado');
          if (pIdx >= 0) {
            const antes = raw.slice(0, pIdx).split('\n').map(s => s.trim()).filter(Boolean);
            prev.anunciante = antes.length ? antes[antes.length - 1] : '';
          }
        }
        let texto = raw.replace(/\s+/g, ' ').trim();
        const corte = texto.indexOf('Patrocinado');
        if (corte >= 0) texto = texto.slice(corte + 'Patrocinado'.length).trim();
        if (texto) prev.texto = texto.slice(0, 600);
      }
    });
  };
  window.__adsObs = new MutationObserver(() => window.__scanAds());
  window.__adsObs.observe(document.body, { childList: true, subtree: true });
  window.__scanAds();
}
"""


def montar_url(arg: str) -> tuple[str, str]:
    """Devolve (url, page_id) a partir de um page_id puro ou de um link da Ad Library."""
    m = re.search(r"view_all_page_id=(\d+)", arg)
    if m:
        page_id = m.group(1)
        url = arg if arg.startswith("http") else None
    elif arg.strip().isdigit():
        page_id = arg.strip()
        url = None
    else:
        raise SystemExit("Informe um page_id numerico ou um link com view_all_page_id=.")
    if not url:
        url = (
            "https://www.facebook.com/ads/library/?active_status=active&ad_type=all"
            "&country=BR&is_targeted_country=false&media_type=all&search_type=page"
            f"&view_all_page_id={page_id}"
        )
    return url, page_id


def tratar_consentimento(page) -> None:
    """Best-effort: recusa cookies opcionais se aparecer o banner (preserva privacidade)."""
    rotulos = [
        "Recusar cookies opcionais", "Permitir apenas cookies essenciais",
        "Decline optional cookies", "Only allow essential cookies",
    ]
    for r in rotulos:
        try:
            botao = page.get_by_role("button", name=re.compile(r, re.I))
            if botao.count():
                botao.first.click(timeout=2000)
                page.wait_for_timeout(800)
                return
        except Exception:
            pass


def _ext_de(content_type: str, url: str) -> str:
    ct = (content_type or "").lower()
    if "png" in ct:
        return "png"
    if "webp" in ct:
        return "webp"
    if "gif" in ct:
        return "gif"
    if "jpeg" in ct or "jpg" in ct:
        return "jpg"
    m = re.search(r"\.(png|webp|gif|jpe?g)", url.lower())
    return (m.group(1).replace("jpeg", "jpg") if m else "jpg")


def baixar_thumbs(ctx, cards: list, page_id: str) -> int:
    """Baixa a miniatura de cada card pela sessao do navegador (passa no anti-bot).

    Salva em swipe/espiao_midia/<page_id>/<ad_id>.<ext> e seta card['midia_local']
    (caminho relativo a raiz do projeto, que o viewer usa direto).
    """
    destino = BASE_DIR / "swipe" / "espiao_midia" / page_id
    destino.mkdir(parents=True, exist_ok=True)
    baixados = 0
    for c in cards:
        thumb = c.get("thumb") or ""
        if not thumb:
            continue
        try:
            resp = ctx.request.get(thumb, timeout=20000)
            if not resp.ok:
                continue
            ext = _ext_de(resp.headers.get("content-type", ""), thumb)
            arq = destino / f"{c['id']}.{ext}"
            arq.write_bytes(resp.body())
            c["midia_local"] = f"swipe/espiao_midia/{page_id}/{c['id']}.{ext}"
            baixados += 1
        except Exception:
            continue
    return baixados


def baixar_videos(ctx, cards: list, page_id: str) -> int:
    """Baixa o mp4 de cada card com video_url. Pesado: so roda com baixar_video=True."""
    destino = BASE_DIR / "swipe" / "espiao_midia" / page_id
    destino.mkdir(parents=True, exist_ok=True)
    baixados = 0
    for c in cards:
        vurl = c.get("video_url") or ""
        if not vurl:
            continue
        alvo = destino / f"{c['id']}.mp4"
        if alvo.exists():
            c["midia_video_local"] = f"swipe/espiao_midia/{page_id}/{c['id']}.mp4"
            baixados += 1
            continue
        try:
            resp = ctx.request.get(vurl, timeout=90000)
            if not resp.ok:
                continue
            alvo.write_bytes(resp.body())
            c["midia_video_local"] = f"swipe/espiao_midia/{page_id}/{c['id']}.mp4"
            baixados += 1
        except Exception:
            continue
    return baixados


def coletar(arg: str, headless: bool, max_seg: int, baixar: bool = True, baixar_video: bool = False) -> dict:
    url, page_id = montar_url(arg)
    with sync_playwright() as p:
        # Usa o Google Chrome instalado no sistema (channel="chrome"); o Chromium
        # empacotado do Playwright falha com erro side-by-side nesta maquina.
        try:
            navegador = p.chromium.launch(channel="chrome", headless=headless)
        except Exception:
            navegador = p.chromium.launch(headless=headless)
        ctx = navegador.new_context(
            locale="pt-BR",
            viewport={"width": 1366, "height": 900},
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"),
        )
        page = ctx.new_page()
        print(f"[1/4] Abrindo Ad Library do page_id {page_id}...", file=sys.stderr)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4000)
        tratar_consentimento(page)
        page.wait_for_timeout(2000)

        print("[2/4] Instalando coletor...", file=sys.stderr)
        page.evaluate(COLETOR_JS)

        total_label = ""
        try:
            txt = page.inner_text("body")
            mt = re.search(r"~?\s*([\d\.]+)\s*resultados", txt)
            if mt:
                total_label = mt.group(1)
        except Exception:
            pass

        print(f"[3/4] Rolando e acumulando (total na pagina: {total_label or '?'})...", file=sys.stderr)
        inicio = time.time()
        anterior, estavel = -1, 0
        while time.time() - inicio < max_seg:
            page.mouse.wheel(0, 1200)
            page.wait_for_timeout(850)
            page.evaluate("window.__scanAds && window.__scanAds()")
            atual = page.evaluate("window.__ADS ? window.__ADS.size : 0")
            if atual == anterior:
                estavel += 1
                if estavel >= 6:
                    # Jiggles escalonados: sobe distancias crescentes e volta, para
                    # re-disparar o lazy-load. So desiste se nenhum deles trouxe mais.
                    cresceu = False
                    for amp in (1500, 3500, 7000):
                        page.mouse.wheel(0, -amp)
                        page.wait_for_timeout(700)
                        page.mouse.wheel(0, amp + 2600)
                        page.wait_for_timeout(1700)
                        page.evaluate("window.__scanAds && window.__scanAds()")
                        depois = page.evaluate("window.__ADS ? window.__ADS.size : 0")
                        if depois > atual:
                            atual, cresceu = depois, True
                            break
                    if not cresceu:
                        break
                    estavel = 0
            else:
                estavel = 0
            anterior = atual
            print(f"      coletados: {atual}", file=sys.stderr)

        cards = page.evaluate("Array.from(window.__ADS.values())")

        com_video = sum(1 for c in cards if c.get("video_url"))
        print(f"      video_url (DOM) resolvido p/ {com_video} de {len(cards)} cards", file=sys.stderr)

        baixados = 0
        if baixar:
            print(f"[4/5] Baixando miniaturas de {len(cards)} cards...", file=sys.stderr)
            baixados = baixar_thumbs(ctx, cards, page_id)
            print(f"      miniaturas salvas: {baixados}", file=sys.stderr)

        videos_baixados = 0
        if baixar_video:
            print(f"[5/5] Baixando videos (pode demorar)...", file=sys.stderr)
            videos_baixados = baixar_videos(ctx, cards, page_id)
            print(f"      videos salvos: {videos_baixados}", file=sys.stderr)

        navegador.close()

    return {
        "page_id": page_id,
        "total_na_pagina": total_label,
        "coletados": len(cards),
        "miniaturas_baixadas": baixados,
        "videos_baixados": videos_baixados,
        "cards": cards,
    }


def main(argv) -> int:
    args = [a for a in argv if not a.startswith("--")]
    headless = "--headless" in argv
    max_seg = 180
    for a in argv:
        if a.startswith("--max-seg"):
            try:
                max_seg = int(a.split("=", 1)[1]) if "=" in a else int(argv[argv.index(a) + 1])
            except Exception:
                pass
    if not args:
        raise SystemExit("Informe o page_id ou o link da Ad Library do concorrente.")

    baixar = "--sem-midia" not in argv
    baixar_video = "--video" in argv
    res = coletar(args[0], headless=headless, max_seg=max_seg, baixar=baixar, baixar_video=baixar_video)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    destino = OUT_DIR / f"anuncios_{res['page_id']}.json"
    destino.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")

    videos = sum(1 for c in res["cards"] if c["formato"] == "video")
    imagens = sum(1 for c in res["cards"] if c["formato"] == "imagem")
    print(f"\nOK. page_id {res['page_id']}: {res['coletados']} coletados "
          f"(total na pagina: {res['total_na_pagina'] or '?'}) | {videos} video, {imagens} imagem"
          f" | videos baixados: {res.get('videos_baixados', 0)}")
    print(f"Salvo em: {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
