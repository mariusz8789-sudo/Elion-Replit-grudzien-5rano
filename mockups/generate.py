# -*- coding: utf-8 -*-
"""Generate the Genesis world-first mockup artboards."""
import io, json, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'project')
os.makedirs(OUT, exist_ok=True)

PLATE_BIO = '/_blob/a6a26de28ff64f6c4029979562f843e8'
PLATE_PHY = '/_blob/238f34c1f243ca0b725d8eec9d332a75'

W, H = 1440, 900
MW, MH = 390, 844

FONTS = ("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">"
         "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?"
         "family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&"
         "family=Manrope:wght@400;500;600;700;800&display=swap\">")

BASE_CSS = """
body{margin:0;font-family:Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.cond{font-family:'Barlow Condensed',Manrope,sans-serif;letter-spacing:.06em;text-transform:uppercase}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}
"""


def page(title, body, w=W, h=H, extra_css='', lang='pl'):
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>{BASE_CSS}{extra_css}</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""


def write(name, html):
    with io.open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(html)


# ---------------------------------------------------------------- shared bits

def badge(text, tone='ok'):
    tones = {
        'ok': 'border-color:rgba(98,240,163,.5);color:#d9ffe9',
        'warn': 'border-color:rgba(251,191,36,.55);color:#fde68a',
        'cool': 'border-color:rgba(125,211,252,.45);color:#dff1ff',
        'dim': 'border-color:rgba(255,255,255,.22);color:rgba(255,255,255,.72)',
    }
    return (f'<span class="mono" style="display:inline-flex;align-items:center;gap:6px;'
            f'padding:5px 10px;border:1px solid;border-radius:999px;font-size:11px;'
            f'letter-spacing:.08em;background:rgba(3,8,14,.62);backdrop-filter:blur(10px);'
            f'{tones[tone]}">{text}</span>')


def toolbar(items, accent='#7dd3fc'):
    """The narrow world toolbar — one of the five permitted HUD elements."""
    btns = ''.join(
        f'<button style="display:flex;flex-direction:column;align-items:center;gap:4px;'
        f'padding:9px 6px;border-radius:10px;width:100%;'
        f'{"background:rgba(125,211,252,.14);" if on else ""}">'
        f'<span style="font-size:17px;line-height:1;color:{accent if on else "rgba(255,255,255,.62)"}">{ico}</span>'
        f'<span class="cond" style="font-size:8.5px;color:{"#fff" if on else "rgba(255,255,255,.45)"}">{lab}</span>'
        f'</button>'
        for ico, lab, on in items)
    return (f'<div style="position:absolute;left:18px;top:50%;transform:translateY(-50%);width:62px;'
            f'display:flex;flex-direction:column;gap:2px;padding:8px 6px;border-radius:16px;'
            f'background:rgba(3,8,14,.66);border:1px solid rgba(255,255,255,.1);'
            f'backdrop-filter:blur(14px);box-shadow:0 18px 50px rgba(0,0,0,.45)">{btns}</div>')


def worldbar(name, back='GENESIS', accent='#7dd3fc'):
    return (f'<div style="position:absolute;left:18px;top:18px;display:flex;align-items:center;gap:10px;'
            f'padding:8px 14px 8px 10px;border-radius:999px;background:rgba(3,8,14,.66);'
            f'border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(14px)">'
            f'<span style="width:22px;height:22px;border-radius:7px;border:1.5px solid {accent};'
            f'display:grid;place-items:center;font-size:11px;color:{accent}">‹</span>'
            f'<span class="cond" style="font-size:10px;color:rgba(255,255,255,.44)">{back}</span>'
            f'<span style="width:1px;height:13px;background:rgba(255,255,255,.18)"></span>'
            f'<span class="cond" style="font-size:13px;font-weight:600;color:#fff">{name}</span>'
            f'</div>')


def chatpill(accent='#7dd3fc'):
    return (f'<button style="position:absolute;right:20px;bottom:20px;display:flex;align-items:center;gap:9px;'
            f'padding:11px 17px;border-radius:999px;background:rgba(3,8,14,.78);'
            f'border:1px solid {accent}55;backdrop-filter:blur(14px);'
            f'box-shadow:0 14px 40px rgba(0,0,0,.5)">'
            f'<span style="width:7px;height:7px;border-radius:50%;background:{accent};'
            f'box-shadow:0 0 10px {accent}"></span>'
            f'<span class="cond" style="font-size:11.5px;color:#fff">Science AI</span></button>')


def hudcount(n, note=''):
    tone = 'ok' if n <= 5 else 'warn'
    col = '#62f0a3' if n <= 5 else '#fbbf24'
    return (f'<div style="position:absolute;right:18px;top:18px;display:flex;align-items:center;gap:8px;'
            f'padding:6px 11px;border-radius:999px;background:rgba(3,8,14,.66);'
            f'border:1px solid {col}55;backdrop-filter:blur(12px)">'
            f'<span class="mono" style="font-size:10.5px;color:{col};letter-spacing:.06em">HUD {n}/5</span>'
            + (f'<span class="mono" style="font-size:10px;color:rgba(255,255,255,.5)">{note}</span>' if note else '')
            + '</div>')


def scaleladder(active):
    rungs = [('Ciało', '1 m'), ('Narząd', '10 cm'), ('Tkanka', '1 mm'), ('Komórka', '10 µm'),
             ('Organellum', '1 µm'), ('Cząsteczka', '1 nm'), ('DNA', '0,1 nm'), ('Atomy', '0,01 nm')]
    out = []
    for i, (n, s) in enumerate(rungs):
        on = i == active
        done = i < active
        col = '#fff' if on else ('rgba(255,255,255,.66)' if done else 'rgba(255,255,255,.3)')
        bd = '1px solid #62f0a3' if on else '1px solid rgba(255,255,255,.12)'
        bg = 'rgba(98,240,163,.12)' if on else 'transparent'
        out.append(f'<div style="display:flex;align-items:center;gap:7px">'
                   f'<button style="padding:6px 11px;border-radius:9px;border:{bd};background:{bg};'
                   f'display:flex;flex-direction:column;align-items:center;gap:1px">'
                   f'<span class="cond" style="font-size:10px;color:{col}">{n}</span>'
                   f'<span class="mono" style="font-size:8.5px;color:rgba(125,211,252,.8)">{s}</span></button>'
                   + ('<span style="color:rgba(255,255,255,.2);font-size:10px">›</span>' if i < 7 else '')
                   + '</div>')
    return ''.join(out)


# ---------------------------------------------------------------- 1. Genesis Home (Matrix)
def rain():
    cols = []
    import random
    random.seed(7)
    glyphs = '01ΔΣΨΩλμσφχ∂∇∫≈±ACGT'
    for i in range(46):
        x = i * 31 + 6
        dur = 5 + (i % 7)
        delay = -(i * 0.73) % 9
        txt = ''.join(random.choice(glyphs) for _ in range(30))
        cols.append(
            f'<span class="mono rn" style="left:{x}px;animation-duration:{dur}s;animation-delay:{delay}s;'
            f'opacity:{0.1 + (i % 5) * 0.06:.2f}">{txt}</span>')
    return ''.join(cols)


HOME_CSS = """
.rn{position:absolute;top:-120%;writing-mode:vertical-rl;font-size:15px;line-height:1.02;
  color:#33d17a;text-shadow:0 0 9px rgba(51,209,122,.55);animation-name:fall;animation-timing-function:linear;
  animation-iteration-count:infinite;white-space:pre}
@keyframes fall{from{transform:translateY(0)}to{transform:translateY(190%)}}
.wcard{position:relative;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.12);
  background:#0a1410;min-height:168px;display:flex;flex-direction:column;justify-content:flex-end;padding:16px}
.wcard:hover{border-color:rgba(51,209,122,.6)}
"""

def world_card(name, sub, grad, glyph):
    return (f'<a href="HB_World.dc.html" class="wcard" style="background:{grad}">'
            f'<span style="position:absolute;right:12px;top:10px;font-size:26px;opacity:.5">{glyph}</span>'
            f'<span class="cond" style="font-size:15px;font-weight:700;color:#fff">{name}</span>'
            f'<span style="font-size:11.5px;color:rgba(255,255,255,.62);margin-top:3px">{sub}</span></a>')


home = f'''<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#04070a">
  <div style="position:absolute;inset:0;overflow:hidden">{rain()}</div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,rgba(4,7,10,.32) 0%,rgba(4,7,10,.9) 62%,#04070a 100%)"></div>

  <div style="position:absolute;left:44px;top:32px;display:flex;align-items:center;gap:13px">
    <span style="width:34px;height:34px;border:1.6px solid #33d17a;border-radius:10px;display:grid;place-items:center;
      color:#33d17a;font-size:16px;box-shadow:0 0 22px rgba(51,209,122,.35)">◈</span>
    <div><div class="cond" style="font-size:19px;font-weight:700;color:#fff;letter-spacing:.16em">GENESIS</div>
    <div class="mono" style="font-size:8.5px;color:rgba(51,209,122,.8);letter-spacing:.24em">SCIENTIFIC OS</div></div>
  </div>
  <div style="position:absolute;right:44px;top:34px;display:flex;gap:9px;align-items:center">
    {badge('LEDGER · 43 REKORDY','ok')}{badge('ŚWIATY · 6','dim')}
  </div>

  <div style="position:absolute;left:50%;top:214px;transform:translateX(-50%);width:800px;text-align:center">
    <div class="cond" style="font-size:54px;font-weight:700;color:#fff;letter-spacing:.02em;line-height:1.04">
      Zadaj pytanie.<br><span style="color:#33d17a">Genesis zbuduje świat.</span></div>
    <p style="margin:18px auto 0;max-width:560px;font-size:14.5px;line-height:1.6;color:rgba(255,255,255,.62)">
      Każda odpowiedź niesie swoje źródło, swój status epistemiczny i odcisk replay.
      Czego nie da się sprawdzić, nie zostaje nazwane wynikiem.</p>
    <div style="margin-top:30px;display:flex;gap:10px;padding:8px 8px 8px 20px;border-radius:14px;
      background:rgba(8,18,14,.86);border:1px solid rgba(51,209,122,.34);box-shadow:0 0 44px rgba(51,209,122,.1)">
      <input aria-label="Pytanie do Genesis" placeholder="np. Czy ten lek obniża ryzyko zdarzeń sercowych?"
        style="flex-grow:1;background:none;border:0;outline:none;color:#eafff2;font-size:14.5px;font-family:inherit">
      <button style="padding:11px 22px;border-radius:10px;background:#33d17a;color:#04140c;
        font-weight:700;font-size:13px">Zapytaj</button>
    </div>
  </div>

  <div style="position:absolute;left:50%;bottom:44px;transform:translateX(-50%);width:1180px;
    display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px">
    {world_card('Human Biology','Bliźniak cyfrowy','linear-gradient(160deg,#0d1b26,#132c33)','⌘')}
    {world_card('CERN','Collider i detektor','linear-gradient(160deg,#1a1410,#2b1c10)','◉')}
    {world_card('Cosmos','Obserwacje nieba','linear-gradient(160deg,#0a0a18,#171033)','✦')}
    {world_card('Molecular','Synteza i wiązanie','linear-gradient(160deg,#101426,#1d1636)','⬡')}
    {world_card('Physics','Laboratorium','linear-gradient(160deg,#0f1113,#1c2024)','⚛')}
    {world_card('Hyperscope','Mikroskopia','linear-gradient(160deg,#0a1410,#10261c)','◎')}
  </div>
  <div class="mono" style="position:absolute;left:44px;bottom:16px;font-size:9.5px;color:rgba(51,209,122,.45);
    letter-spacing:.14em">MATRIX = DOM, WEJŚCIE, PRZEJŚCIE. PO WEJŚCIU DO ŚWIATA — JEGO WŁASNE ŚRODOWISKO.</div>
</div>'''
write('Main.dc.html', page('Genesis Home', home, extra_css=HOME_CSS))


# ---------------------------------------------------------------- Human Biology
BIO_TOOLS = [('◫', 'Układy', False), ('✂', 'Przekrój', False), ('◐', 'Powłoka', False),
             ('◎', 'Skala', False), ('⌕', 'Szukaj', False)]

def bio_stage(overlay='', plate_shift='center 42%'):
    return (f'<div style="position:absolute;inset:0;background:#0b1016">'
            f'<img src="{PLATE_BIO}" alt="Laboratorium Human Biology — realny render Genesis"'
            f' style="width:100%;height:100%;object-fit:cover;object-position:{plate_shift}">'
            f'<div style="position:absolute;inset:0;background:'
            f'linear-gradient(180deg,rgba(4,10,16,.55) 0%,rgba(4,10,16,0) 26%,rgba(4,10,16,0) 62%,rgba(4,10,16,.62) 100%)">'
            f'</div>{overlay}</div>')

def bio_shell(inner, tools=None, hud=5, note=''):
    return (f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#0b1016;color:#fff">'
            + inner
            + worldbar('Human Biology Lab')
            + toolbar(tools or BIO_TOOLS)
            + hudcount(hud, note)
            + chatpill() + '</div>')

# --- 2. World View
wv = bio_stage() + (
    f'<div style="position:absolute;left:50%;top:76px;transform:translateX(-50%);display:flex;gap:8px">'
    f'{badge("BLIŹNIAK · CC0", "cool")}{badge("ANATOMIA: MODEL", "warn")}</div>'
    f'<div style="position:absolute;left:50%;bottom:34px;transform:translateX(-50%);text-align:center">'
    f'<div class="cond" style="font-size:11px;color:rgba(255,255,255,.5)">najedź na narząd, aby go zbadać</div></div>')
write('HB_World.dc.html', page('Human Biology — World View', bio_shell(wv, hud=5)))

# --- 3. Hover heart
hover_ring = (
    '<div style="position:absolute;left:687px;top:318px;width:62px;height:62px;border-radius:50%;'
    'border:2px solid #62f0a3;box-shadow:0 0 0 7px rgba(98,240,163,.14),0 0 30px rgba(98,240,163,.5)"></div>'
    '<svg width="220" height="90" style="position:absolute;left:744px;top:292px;overflow:visible">'
    '<path d="M4 58 L70 12 L214 12" stroke="rgba(98,240,163,.75)" stroke-width="1.4" fill="none"/>'
    '<circle cx="4" cy="58" r="3" fill="#62f0a3"/></svg>'
    '<div style="position:absolute;left:812px;top:272px;padding:9px 14px;border-radius:11px;'
    'background:rgba(3,10,8,.88);border:1px solid rgba(98,240,163,.5);backdrop-filter:blur(12px)">'
    '<div class="cond" style="font-size:15px;font-weight:700;color:#fff">Serce</div>'
    '<div class="mono" style="font-size:9.5px;color:rgba(98,240,163,.85);margin-top:2px">'
    'UKŁAD KRĄŻENIA · MODEL</div></div>')
write('HB_Hover.dc.html', page('Human Biology — hover na sercu', bio_shell(bio_stage(hover_ring), hud=5)))

# --- 4. Contextual popup
POP_ACTIONS = ['Widok 3D', 'Przekrój', 'Naczynia', 'Histologia']
pop = ''.join(
    f'<button style="padding:8px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.16);'
    f'text-align:left;font-size:12px;color:rgba(255,255,255,.88)">{a}</button>' for a in POP_ACTIONS)
popup = (
    '<div style="position:absolute;left:687px;top:318px;width:62px;height:62px;border-radius:50%;'
    'border:2px solid #62f0a3;box-shadow:0 0 0 7px rgba(98,240,163,.18),0 0 34px rgba(98,240,163,.6)"></div>'
    '<div style="position:absolute;left:772px;top:250px;width:246px;padding:14px;border-radius:15px;'
    'background:rgba(4,11,9,.9);border:1px solid rgba(98,240,163,.34);backdrop-filter:blur(18px);'
    'box-shadow:0 22px 60px rgba(0,0,0,.6)">'
    '<div style="display:flex;align-items:baseline;justify-content:space-between">'
    '<span class="cond" style="font-size:17px;font-weight:700">Serce</span>'
    '<span class="mono" style="font-size:9px;color:rgba(251,191,36,.9)">MODEL</span></div>'
    '<div class="mono" style="font-size:9.5px;color:rgba(255,255,255,.46);margin-top:2px">'
    'COR · UKŁAD KRĄŻENIA · 0,11 m</div>'
    f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0 10px">{pop}</div>'
    '<button style="width:100%;padding:10px;border-radius:10px;background:#62f0a3;color:#042014;'
    'font-weight:800;font-size:12.5px;letter-spacing:.08em">BADAJ →</button>'
    '<div class="mono" style="font-size:8.5px;color:rgba(255,255,255,.34);margin-top:9px;line-height:1.45">'
    'Bryła narządu pochodzi z atlasu. To nie jest skan pacjenta.</div></div>')
write('HB_Selected.dc.html', page('Human Biology — serce wybrane', bio_shell(bio_stage(popup), hud=5)))

# --- 5. Research drawer
def drawer(title, sub, epi, body, h=372):
    return (f'<div style="position:absolute;left:0;right:0;bottom:0;height:{h}px;'
            f'background:linear-gradient(180deg,rgba(5,12,10,.93),rgba(3,8,7,.985));'
            f'border-top:1px solid rgba(98,240,163,.28);backdrop-filter:blur(22px);'
            f'box-shadow:0 -26px 70px rgba(0,0,0,.6);padding:16px 26px 20px">'
            f'<div style="display:flex;align-items:center;gap:12px">'
            f'<span style="width:34px;height:4px;border-radius:2px;background:rgba(255,255,255,.2)"></span>'
            f'<span class="cond" style="font-size:19px;font-weight:700">{title}</span>'
            f'<span class="mono" style="font-size:10px;color:rgba(255,255,255,.44)">{sub}</span>'
            f'<span style="flex-grow:1"></span>{badge(epi,"warn")}'
            f'<button aria-label="Zamknij" style="width:28px;height:28px;border-radius:8px;'
            f'border:1px solid rgba(255,255,255,.18);font-size:13px">✕</button></div>{body}</div>')

def tile(label, epi, grad):
    return (f'<div style="border-radius:11px;overflow:hidden;border:1px solid rgba(255,255,255,.12)">'
            f'<div style="height:84px;background:{grad};position:relative">'
            f'<span class="mono" style="position:absolute;right:6px;top:6px;font-size:8px;padding:2px 6px;'
            f'border-radius:5px;background:rgba(0,0,0,.6);color:#fde68a">{epi}</span></div>'
            f'<div style="padding:7px 9px;font-size:11px;color:rgba(255,255,255,.78)">{label}</div></div>')

heart_body = (
    '<div style="display:grid;grid-template-columns:270px 1fr 300px;gap:18px;margin-top:14px">'
    '<div><div class="cond" style="font-size:10px;color:#62f0a3;margin-bottom:7px">DANE ATLASU</div>'
    '<dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:11.5px">'
    '<dt style="color:rgba(255,255,255,.5)">Nazwa</dt><dd style="margin:0">Cor</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Układ</dt><dd style="margin:0">Krążenia</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Skala</dt><dd style="margin:0" class="mono">0,11 × 0,13 × 0,09 m</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Dowód</dt><dd style="margin:0" class="mono">MODEL</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Użycie</dt><dd style="margin:0" class="mono">NOT_A_MEDICAL_DEVICE</dd>'
    '</dl>'
    '<div style="margin-top:14px;padding:10px;border-radius:9px;border:1px solid rgba(251,191,36,.3);'
    'background:rgba(251,191,36,.06)"><div class="mono" style="font-size:9.5px;color:#fde68a;line-height:1.5">'
    'Bryła z atlasu, nie z obrazowania. Genesis nie posiada zdjęcia serca tego bliźniaka.</div></div></div>'
    '<div><div class="cond" style="font-size:10px;color:#62f0a3;margin-bottom:7px">OD MAKRO DO MIKRO</div>'
    f'<div style="display:flex;flex-wrap:wrap;gap:4px">{scaleladder(1)}</div>'
    '<div class="cond" style="font-size:10px;color:#62f0a3;margin:16px 0 7px">POWIERZCHNIA BLIŹNIAKA</div>'
    '<div style="display:flex;gap:6px">'
    + ''.join(f'<button style="padding:7px 13px;border-radius:9px;font-size:11.5px;'
              f'border:1px solid {"#62f0a3" if on else "rgba(255,255,255,.16)"};'
              f'color:{"#eafff4" if on else "rgba(255,255,255,.7)"}">{n}</button>'
              for n, on in [('Skóra', True), ('Prześwit', False), ('RTG (model)', False), ('Duch', False)])
    + '</div>'
    '<div class="cond" style="font-size:10px;color:#62f0a3;margin:16px 0 7px">PRZEKRÓJ</div>'
    '<div style="display:flex;gap:6px;align-items:center">'
    + ''.join(f'<button style="padding:6px 12px;border-radius:9px;font-size:11px;'
              f'border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.72)">{n}</button>'
              for n in ['strzałkowy', 'czołowy', 'poprzeczny'])
    + '<div style="flex-grow:1;height:4px;border-radius:2px;background:rgba(255,255,255,.14);position:relative">'
      '<span style="position:absolute;left:46%;top:-5px;width:14px;height:14px;border-radius:50%;'
      'background:#62f0a3"></span></div></div></div>'
    '<div><div class="cond" style="font-size:10px;color:#62f0a3;margin-bottom:7px">OBRAZ Z SESJI</div>'
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
    + tile('Hyperscope 5×', 'MODEL', 'radial-gradient(circle at 42% 40%,#1d3a4d,#07131b)')
    + tile('Histologia', 'SIMULATED', 'repeating-linear-gradient(48deg,#3a2740,#3a2740 5px,#4a3150 5px,#4a3150 10px)')
    + '</div>'
    '<div style="margin-top:9px;padding:9px 10px;border-radius:9px;background:rgba(255,255,255,.04);'
    'border:1px solid rgba(255,255,255,.1)">'
    '<div class="mono" style="font-size:9px;color:rgba(255,255,255,.44);line-height:1.6">'
    'SESJA 00dabb8f4e1475d5…<br>ODCISK REPLAY 85240c96…<br>LEDGER: zapisany</div></div>'
    '<div class="mono" style="font-size:8.5px;color:rgba(255,255,255,.3);margin-top:8px;line-height:1.45">'
    'Brak kafelka = brak sesji. Genesis nigdy nie pokazuje zdjęcia poglądowego jako wyniku.</div></div></div>')
write('HB_Research.dc.html', page('Human Biology — Research Drawer: serce',
      bio_shell(bio_stage(drawer('Serce', 'COR · UKŁAD KRĄŻENIA', 'MODEL', heart_body), 'center 24%'), hud=5)))


# --- 6,7,8. Tissue / Cell / Molecule-DNA
def micro_stage(grad, caption, epi, rung, viz):
    return (f'<div style="position:absolute;inset:0;background:{grad}">{viz}'
            f'<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,'
            f'rgba(0,0,0,0) 34%,rgba(3,7,10,.82) 100%)"></div>'
            f'<div style="position:absolute;left:50%;top:74px;transform:translateX(-50%);display:flex;gap:8px">'
            f'{badge(caption,"cool")}{badge(epi,"warn")}</div>'
            f'<div style="position:absolute;left:50%;bottom:26px;transform:translateX(-50%);'
            f'display:flex;flex-wrap:wrap;gap:4px;padding:9px 13px;border-radius:14px;'
            f'background:rgba(3,8,10,.7);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(14px)">'
            f'{scaleladder(rung)}</div></div>')

fibres = ''.join(
    f'<div style="position:absolute;left:{-140 + i * 96}px;top:-60px;width:52px;height:1120px;'
    f'transform:rotate(11deg);border-radius:26px;'
    f'background:linear-gradient(90deg,rgba(190,72,72,.0),rgba(214,96,96,.62),rgba(150,48,48,.0));'
    f'opacity:{0.5 + (i % 3) * .16:.2f}"></div>' for i in range(19))
write('HB_Tissue.dc.html', page('Human Biology — tkanka', bio_shell(
    micro_stage('linear-gradient(160deg,#25090c,#4a1417 55%,#1a0508)',
                'TKANKA MIĘŚNIA SERCOWEGO · 1 mm', 'SIMULATED · NOT_DIRECT_OBSERVATION', 2, fibres)
    + '<div style="position:absolute;right:26px;top:96px;width:230px;padding:12px;border-radius:12px;'
      'background:rgba(4,10,12,.8);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px)">'
      '<div class="cond" style="font-size:10px;color:#7dd3fc">CZYM TO JEST</div>'
      '<p style="margin:7px 0 0;font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.74)">'
      'Proceduralna rekonstrukcja układu włókien z parametrów atlasu — wygenerowana, nie sfotografowana. '
      'Genesis nie ma preparatu histologicznego tego bliźniaka.</p></div>', hud=5)))

organelles = (''.join(
    f'<div style="position:absolute;left:{330 + (i * 137) % 760}px;top:{250 + (i * 91) % 330}px;'
    f'width:{26 + (i % 4) * 13}px;height:{18 + (i % 3) * 9}px;border-radius:50%;'
    f'background:radial-gradient(circle at 34% 30%,rgba(255,196,120,.85),rgba(150,80,30,.25));'
    f'box-shadow:0 0 16px rgba(255,170,90,.3)"></div>' for i in range(13))
    + '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:250px;height:250px;'
      'border-radius:50%;background:radial-gradient(circle at 40% 34%,rgba(120,180,255,.5),rgba(20,50,110,.2));'
      'border:1px solid rgba(140,200,255,.4);box-shadow:0 0 60px rgba(90,160,255,.3)"></div>')
write('HB_Cell.dc.html', page('Human Biology — komórka', bio_shell(
    micro_stage('radial-gradient(ellipse at 50% 46%,#0e2338,#061019 70%)',
                'KARDIOMIOCYT · 10 µm', 'MODEL · NOT_DIRECT_OBSERVATION', 3, organelles)
    + '<div style="position:absolute;right:26px;top:96px;width:230px;padding:12px;border-radius:12px;'
      'background:rgba(4,10,12,.8);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px)">'
      '<div class="cond" style="font-size:10px;color:#7dd3fc">WIDOCZNE ELEMENTY</div>'
      '<p style="margin:7px 0 0;font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.74)">'
      'Jądro i mitochondria jako bryły modelowe. Liczba i rozmieszczenie są losowaniem z ziarna sesji, '
      'nie pomiarem w komórce.</p></div>', hud=5)))

helix = ''.join(
    f'<div style="position:absolute;left:50%;top:{176 + i * 15}px;width:{abs(190 * __import__("math").sin(i * .3)):.0f}px;'
    f'height:5px;margin-left:{-abs(190 * __import__("math").sin(i * .3)) / 2:.0f}px;border-radius:3px;'
    f'background:linear-gradient(90deg,#62f0a3,#7dd3fc);opacity:{.3 + .5 * abs(__import__("math").sin(i * .3)):.2f}"></div>'
    for i in range(34))
write('HB_Molecule.dc.html', page('Human Biology — cząsteczka i DNA', bio_shell(
    micro_stage('radial-gradient(ellipse at 50% 44%,#0b1a2b,#04080f 72%)',
                'DNA · 0,1 nm', 'SCHEMATIC · NOT_DIRECT_OBSERVATION', 6, helix)
    + '<div style="position:absolute;right:26px;top:96px;width:242px;padding:12px;border-radius:12px;'
      'background:rgba(4,10,12,.8);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px)">'
      '<div class="cond" style="font-size:10px;color:#7dd3fc">GRANICA MODELU</div>'
      '<p style="margin:7px 0 0;font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.74)">'
      'Schemat podwójnej helisy. Poziom ATOMY pozostaje wyłączony — Genesis nie modeluje pozycji atomów '
      'i nie udaje, że to robi.</p>'
      '<div class="mono" style="margin-top:9px;font-size:9px;color:rgba(251,191,36,.85)">ATOMY · NIEMODELOWANE</div>'
      '</div>', hud=5)))

# --- 9. Clean lab (drawer closed again)
write('HB_Clean.dc.html', page('Human Biology — czyste laboratorium', bio_shell(
    bio_stage('<div style="position:absolute;left:50%;bottom:30px;transform:translateX(-50%);text-align:center">'
              '<div class="cond" style="font-size:11px;color:rgba(255,255,255,.44)">'
              'panel zamknięty — świat wraca na pierwszy plan</div></div>'), hud=5)))


# ---------------------------------------------------------------- CERN
import math
CERN = '#ff8a3d'
det_rings = ''.join(
    f'<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
    f'width:{140 + i * 96}px;height:{140 + i * 96}px;border-radius:50%;'
    f'border:{1 + (i % 2)}px solid rgba(255,138,61,{.32 - i * .034:.2f});'
    f'box-shadow:inset 0 0 {22 + i * 9}px rgba(255,138,61,.07)"></div>' for i in range(8))
det_seg = ''.join(
    f'<div style="position:absolute;left:50%;top:50%;width:3px;height:420px;'
    f'transform:translate(-50%,-50%) rotate({i * 11.25}deg);'
    f'background:linear-gradient(180deg,rgba(255,138,61,0),rgba(255,138,61,.22),rgba(255,138,61,0))"></div>'
    for i in range(32))
tracks = ''.join(
    f'<div style="position:absolute;left:50%;top:50%;width:{190 + (i * 37) % 210}px;height:2px;'
    f'transform-origin:0 50%;transform:rotate({i * 23.5}deg);'
    f'background:linear-gradient(90deg,rgba(125,211,252,.95),rgba(125,211,252,0));'
    f'box-shadow:0 0 8px rgba(125,211,252,.6)"></div>' for i in range(15))
cern_stage = (f'<div style="position:absolute;inset:0;background:'
              f'radial-gradient(ellipse at 50% 50%,#1d1712 0%,#0b0906 72%)">'
              f'{det_rings}{det_seg}{tracks}'
              f'<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
              f'width:26px;height:26px;border-radius:50%;background:#fff;'
              f'box-shadow:0 0 44px 14px rgba(255,220,180,.7)"></div>'
              f'<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,'
              f'rgba(0,0,0,0) 40%,rgba(8,6,4,.86) 100%)"></div></div>')
CERN_TOOLS = [('◉', 'Detektor', True), ('⚡', 'Zderzenia', False), ('▤', 'Dane', False),
              ('↺', 'Replay', False), ('⌕', 'Szukaj', False)]

def cern_shell(extra, hud=5):
    return (f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#0b0906;color:#fff">'
            + cern_stage + extra + worldbar('CERN Collider', accent=CERN) + toolbar(CERN_TOOLS, CERN)
            + hudcount(hud) + chatpill(CERN) + '</div>')

write('CERN_World.dc.html', page('CERN — World View', cern_shell(
    f'<div style="position:absolute;left:50%;top:76px;transform:translateX(-50%);display:flex;gap:8px">'
    f'{badge("CMS · ZDERZENIE 5 412","dim")}{badge("REAL_DATASET · CERN OPEN DATA","ok")}</div>'
    f'<div style="position:absolute;left:50%;bottom:32px;transform:translateX(-50%)">'
    f'<div class="cond" style="font-size:11px;color:rgba(255,255,255,.45)">'
    f'kliknij ślad, aby otworzyć jego rekonstrukcję</div></div>')))

cern_body = (
    '<div style="display:grid;grid-template-columns:300px 1fr 280px;gap:18px;margin-top:14px">'
    '<div><div class="cond" style="font-size:10px;color:#ff8a3d;margin-bottom:7px">ŚLAD</div>'
    '<dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:11.5px">'
    '<dt style="color:rgba(255,255,255,.5)">Typ</dt><dd style="margin:0">µ⁻ (kandydat)</dd>'
    '<dt style="color:rgba(255,255,255,.5)">p<sub>T</sub></dt><dd class="mono" style="margin:0">42,7 GeV/c</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Zbiór</dt><dd class="mono" style="margin:0">CMS Zμμ 2012 (open)</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Dowód</dt><dd class="mono" style="margin:0;color:#62f0a3">REAL_DATASET</dd>'
    '</dl>'
    '<div style="margin-top:13px;padding:10px;border-radius:9px;border:1px solid rgba(98,240,163,.3);'
    'background:rgba(98,240,163,.06)"><div class="mono" style="font-size:9.5px;color:#d9ffe9;line-height:1.5">'
    'Ten świat ma realny, przypięty zbiór. Etykieta REAL_DATASET należy do danych — '
    'rekonstrukcja toru pozostaje RECONSTRUCTED.</div></div></div>'
    '<div><div class="cond" style="font-size:10px;color:#ff8a3d;margin-bottom:7px">MASA NIEZMIENNICZA</div>'
    '<div style="height:150px;border-radius:10px;border:1px solid rgba(255,255,255,.12);'
    'background:linear-gradient(180deg,rgba(255,138,61,.07),transparent);position:relative;overflow:hidden">'
    + ''.join(f'<div style="position:absolute;bottom:0;left:{4 + i * 3.1:.1f}%;width:2.3%;'
              f'height:{max(4, 118 * math.exp(-((i - 17) ** 2) / 26)):.0f}px;'
              f'background:rgba(255,138,61,.72);border-radius:2px 2px 0 0"></div>' for i in range(31))
    + '<span class="mono" style="position:absolute;left:52%;top:8px;font-size:9px;color:#fde68a">'
      '91,2 GeV · Z⁰</span></div>'
    '<div class="mono" style="font-size:9px;color:rgba(255,255,255,.4);margin-top:6px">'
    'Histogram liczony z przypiętego zbioru w tej sesji — nie obrazek poglądowy.</div></div>'
    '<div><div class="cond" style="font-size:10px;color:#ff8a3d;margin-bottom:7px">SESJA</div>'
    '<div style="padding:10px;border-radius:9px;background:rgba(255,255,255,.04);'
    'border:1px solid rgba(255,255,255,.1)"><div class="mono" style="font-size:9px;'
    'color:rgba(255,255,255,.45);line-height:1.7">SESJA cms-zmumu-0412<br>ODCISK 5fa67dcd…<br>'
    'REPLAY: MATCH<br>LEDGER: zapisany</div></div>'
    '<button style="width:100%;margin-top:9px;padding:9px;border-radius:9px;'
    'border:1px solid rgba(255,138,61,.5);color:#ffd7ba;font-size:12px">Powtórz eksperyment</button></div></div>')
write('CERN_Research.dc.html', page('CERN — Research Drawer', cern_shell(
    drawer('Ślad 12 · µ⁻', 'CMS · ZDERZENIE 5 412', 'REAL_DATASET', cern_body))))

# ---------------------------------------------------------------- Cosmos
COS = '#b79cff'
import random as _r
_r.seed(3)
stars = ''.join(
    f'<div style="position:absolute;left:{_r.random() * 100:.2f}%;top:{_r.random() * 100:.2f}%;'
    f'width:{_r.choice([1, 1, 1, 2, 2, 3])}px;height:{_r.choice([1, 1, 1, 2, 2, 3])}px;border-radius:50%;'
    f'background:#fff;opacity:{_r.uniform(.18, .95):.2f}"></div>' for _ in range(340))
cos_stage = (f'<div style="position:absolute;inset:0;background:'
             f'radial-gradient(ellipse at 66% 34%,#231a47 0%,#0c0a1c 46%,#04030a 100%)">{stars}'
             f'<div style="position:absolute;left:58%;top:26%;width:430px;height:430px;border-radius:50%;'
             f'background:radial-gradient(circle at 42% 40%,rgba(183,156,255,.36),rgba(90,60,180,.09) 58%,transparent 72%);'
             f'filter:blur(6px)"></div>'
             f'<div style="position:absolute;left:24%;top:54%;width:120px;height:120px;border-radius:50%;'
             f'background:radial-gradient(circle at 36% 32%,#cbb7ff,#4a3a8a);'
             f'box-shadow:0 0 70px rgba(150,120,255,.45)"></div></div>')
COS_TOOLS = [('✦', 'Obiekty', True), ('◷', 'Czas', False), ('▤', 'Dane', False),
             ('?', 'Hipotezy', False), ('⌕', 'Szukaj', False)]

def cos_shell(extra, hud=5):
    return (f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#04030a;color:#fff">'
            + cos_stage + extra + worldbar('Cosmos', accent=COS) + toolbar(COS_TOOLS, COS)
            + hudcount(hud) + chatpill(COS) + '</div>')

write('Cosmos_World.dc.html', page('Cosmos — World View', cos_shell(
    '<div style="position:absolute;left:24%;top:54%;width:120px;height:120px;margin:-22px 0 0 -22px;'
    'border-radius:50%;border:1.5px solid rgba(183,156,255,.85);width:164px;height:164px;'
    'box-shadow:0 0 0 6px rgba(183,156,255,.1)"></div>'
    '<div style="position:absolute;left:35%;top:50%;padding:8px 13px;border-radius:10px;'
    'background:rgba(8,6,20,.86);border:1px solid rgba(183,156,255,.45);backdrop-filter:blur(12px)">'
    '<div class="cond" style="font-size:14px;font-weight:700">Kepler-186 f</div>'
    '<div class="mono" style="font-size:9.5px;color:rgba(183,156,255,.9);margin-top:2px">'
    'REAL_DATASET · KEPLER (przypięty)</div></div>'
    + f'<div style="position:absolute;left:50%;top:76px;transform:translateX(-50%);display:flex;gap:8px">'
      f'{badge("KATALOG · 12 OBIEKTÓW","dim")}{badge("ŹRÓDŁO: NASA KEPLER","ok")}</div>')))

cos_body = (
    '<div style="display:grid;grid-template-columns:300px 1fr 280px;gap:18px;margin-top:14px">'
    '<div><div class="cond" style="font-size:10px;color:#b79cff;margin-bottom:7px">OBIEKT</div>'
    '<dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:11.5px">'
    '<dt style="color:rgba(255,255,255,.5)">Okres</dt><dd class="mono" style="margin:0">129,9 d</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Promień</dt><dd class="mono" style="margin:0">1,17 R⊕</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Metoda</dt><dd style="margin:0">tranzyt</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Dowód</dt><dd class="mono" style="margin:0;color:#62f0a3">REAL_DATASET</dd>'
    '</dl>'
    '<div style="margin-top:13px;padding:10px;border-radius:9px;border:1px solid rgba(251,191,36,.3);'
    'background:rgba(251,191,36,.06)"><div class="mono" style="font-size:9.5px;color:#fde68a;line-height:1.5">'
    'Wizualizacja planety jest ILLUSTRATIVE. Realny jest zbiór krzywej blasku, nie ten glob.</div></div></div>'
    '<div><div class="cond" style="font-size:10px;color:#b79cff;margin-bottom:7px">KRZYWA BLASKU</div>'
    '<div style="height:150px;border-radius:10px;border:1px solid rgba(255,255,255,.12);position:relative;'
    'background:linear-gradient(180deg,rgba(183,156,255,.06),transparent);overflow:hidden">'
    '<svg viewBox="0 0 600 150" preserveAspectRatio="none" style="width:100%;height:100%">'
    '<path d="M0 46 L210 46 Q222 46 232 96 L368 96 Q378 46 390 46 L600 46" fill="none" '
    'stroke="#cbb7ff" stroke-width="2"/></svg>'
    '<span class="mono" style="position:absolute;left:46%;bottom:9px;font-size:9px;color:#cbb7ff">'
    'głębokość tranzytu 0,043%</span></div>'
    '<div class="mono" style="font-size:9px;color:rgba(255,255,255,.4);margin-top:6px">'
    'Krzywa z przypiętego zbioru Kepler. Replay tej sesji odtwarza ją bit w bit.</div></div>'
    '<div><div class="cond" style="font-size:10px;color:#b79cff;margin-bottom:7px">HIPOTEZY</div>'
    '<div style="padding:10px;border-radius:9px;background:rgba(255,255,255,.04);'
    'border:1px solid rgba(255,255,255,.1);font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.76)">'
    'Sygnał zgodny z planetą wielkości Ziemi w ekosferze.'
    '<div class="mono" style="margin-top:7px;font-size:9px;color:#fbbf24">STATUS: HYPOTHESIS · unverified</div>'
    '</div><div class="mono" style="font-size:8.5px;color:rgba(255,255,255,.32);margin-top:8px;line-height:1.5">'
    'Hipoteza nie awansuje sama. Publikacja wymaga zatwierdzenia przez człowieka.</div></div></div>')
write('Cosmos_Research.dc.html', page('Cosmos — Research Drawer', cos_shell(
    drawer('Kepler-186 f', 'KANDYDAT · TRANZYT', 'REAL_DATASET', cos_body))))


# ---------------------------------------------------------------- Matrix: teraz vs docelowo
def panel_block(x, y, w, h, label, col='rgba(56,189,248,.5)'):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;'
            f'border-radius:10px;background:rgba(3,8,14,.82);border:1px solid {col};'
            f'display:flex;align-items:flex-start;padding:8px 10px">'
            f'<span class="mono" style="font-size:9.5px;color:rgba(255,255,255,.6);letter-spacing:.06em">{label}</span>'
            f'</div>')

now_stage = bio_stage()
now_panels = (panel_block(18, 18, 330, 148, 'STATUS · 5 BADGE’ÓW')
              + panel_block(18, 380, 400, 250, 'TRANSKRYPT POLECEŃ')
              + panel_block(18, 640, 400, 96, 'PASEK POLECEŃ + CHIPY')
              + panel_block(900, 18, 522, 182, 'DOWODY · SESJA · REPLAY')
              + panel_block(640, 300, 782, 350, 'DOK HUMAN EXPLORER')
              + panel_block(640, 664, 782, 78, 'OD MAKRO DO MIKRO')
              + panel_block(0, 180, 200, 560, 'LEWA SZYNA', 'rgba(255,255,255,.2)')
              + '<div style="position:absolute;right:20px;bottom:20px;padding:10px 16px;border-radius:999px;'
                'background:rgba(3,8,14,.85);border:1px solid rgba(56,189,248,.5)">'
                '<span class="mono" style="font-size:10px">SCIENCE CHAT</span></div>')
write('Matrix_Now.dc.html', page('Stan obecny — panele zasłaniają świat',
      f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#0b1016;color:#fff">'
      + now_stage
      + '<div style="position:absolute;inset:0;background:rgba(2,6,10,.35)"></div>'
      + now_panels
      + '<div style="position:absolute;left:50%;top:214px;transform:translateX(-50%);padding:9px 16px;'
        'border-radius:10px;background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.55)">'
        '<span class="mono" style="font-size:11px;color:#fde68a;letter-spacing:.08em">'
        'HUD 12/5 · ŚWIAT WIDOCZNY W ~28% KADRU</span></div>'
      + '</div>'))

write('Matrix_Next.dc.html', page('Docelowo — świat na pierwszym planie', bio_shell(
    bio_stage('<div style="position:absolute;left:50%;top:214px;transform:translateX(-50%);padding:9px 16px;'
              'border-radius:10px;background:rgba(98,240,163,.12);border:1px solid rgba(98,240,163,.55)">'
              '<span class="mono" style="font-size:11px;color:#d9ffe9;letter-spacing:.08em">'
              'HUD 5/5 · ŚWIAT WIDOCZNY W ~92% KADRU</span></div>'), hud=5)))

# ---------------------------------------------------------------- Science Chat
write('Chat_Closed.dc.html', page('Science Chat — zamknięty', bio_shell(bio_stage(), hud=5)))

chat_msgs = [
    ('user', 'Czy serce tego bliźniaka to prawdziwa anatomia?'),
    ('ai', 'Nie. Bryła serca pochodzi z atlasu modelowego — Genesis nie posiada obrazowania medycznego '
           'tego bliźniaka. Ciało jest licencjonowanym assetem CC0, anatomia pozostaje MODEL.'),
    ('user', 'To co mogę uznać za wynik?'),
    ('ai', 'Sesję Hyperscope 5× (MODEL) i jej odcisk replay. To jest wynik powtarzalny. '
           'Nie jest obserwacją i nie zostanie tak nazwany.'),
]
bubbles = ''.join(
    (f'<div style="align-self:flex-end;max-width:76%;padding:10px 13px;border-radius:13px 13px 3px 13px;'
     f'background:rgba(125,211,252,.16);border:1px solid rgba(125,211,252,.3);font-size:12.5px;line-height:1.55">{t}</div>'
     if who == 'user' else
     f'<div style="align-self:flex-start;max-width:86%;padding:10px 13px;border-radius:13px 13px 13px 3px;'
     f'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);font-size:12.5px;'
     f'line-height:1.55;color:rgba(255,255,255,.86)">{t}'
     f'<div class="mono" style="margin-top:7px;font-size:8.5px;color:rgba(251,191,36,.85)">'
     f'ŹRÓDŁO: ATLAS V3 · STATUS: MODEL</div></div>')
    for who, t in chat_msgs)
chat_open = (
    '<div style="position:absolute;right:0;top:0;bottom:0;width:430px;'
    'background:linear-gradient(180deg,rgba(4,10,14,.95),rgba(3,7,10,.99));'
    'border-left:1px solid rgba(125,211,252,.28);backdrop-filter:blur(22px);'
    'display:flex;flex-direction:column;padding:18px 18px 16px">'
    '<div style="display:flex;align-items:center;gap:9px">'
    '<span style="width:7px;height:7px;border-radius:50%;background:#7dd3fc;box-shadow:0 0 10px #7dd3fc"></span>'
    '<span class="cond" style="font-size:14px;font-weight:700">Science AI</span>'
    '<span style="flex-grow:1"></span>'
    '<button aria-label="Zamknij czat" style="width:27px;height:27px;border-radius:8px;'
    'border:1px solid rgba(255,255,255,.18);font-size:12px">✕</button></div>'
    f'<div style="flex-grow:1;display:flex;flex-direction:column;gap:11px;margin-top:16px;overflow:hidden">{bubbles}</div>'
    '<div style="display:flex;gap:8px;padding:7px 7px 7px 14px;border-radius:12px;'
    'background:rgba(255,255,255,.05);border:1px solid rgba(125,211,252,.25);margin-top:12px">'
    '<input aria-label="Pytanie" placeholder="Zapytaj o ten świat…" style="flex-grow:1;background:none;'
    'border:0;outline:none;color:#eaf6ff;font-size:12.5px;font-family:inherit">'
    '<button style="padding:8px 15px;border-radius:9px;background:#7dd3fc;color:#04121a;'
    'font-weight:700;font-size:12px">Wyślij</button></div></div>')
write('Chat_Open.dc.html', page('Science Chat — otwarty',
      f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#0b1016;color:#fff">'
      + bio_stage() + worldbar('Human Biology Lab') + toolbar(BIO_TOOLS) + hudcount(5)
      + chat_open + '</div>'))

# ---------------------------------------------------------------- Mobile
def mobile(title, inner):
    return page(title, f'<div style="width:{MW}px;height:{MH}px;position:relative;overflow:hidden;'
                       f'background:#0b1016;color:#fff">{inner}</div>', w=MW, h=MH)

m_stage = (f'<img src="{PLATE_BIO}" alt="Bliźniak cyfrowy" style="position:absolute;inset:0;'
           f'width:100%;height:100%;object-fit:cover;object-position:52% 30%">'
           f'<div style="position:absolute;inset:0;background:linear-gradient(180deg,'
           f'rgba(4,10,16,.62) 0%,rgba(4,10,16,0) 22%,rgba(4,10,16,0) 48%,rgba(4,10,16,.9) 100%)"></div>')
m_top = ('<div style="position:absolute;left:14px;right:14px;top:16px;display:flex;align-items:center;gap:9px">'
         '<span style="width:30px;height:30px;border-radius:9px;border:1.5px solid #7dd3fc;display:grid;'
         'place-items:center;color:#7dd3fc;font-size:13px">‹</span>'
         '<span class="cond" style="font-size:13px;font-weight:700">Human Biology</span>'
         '<span style="flex-grow:1"></span>'
         + badge('MODEL', 'warn') + '</div>')

m_sheet_peek = (
    '<div style="position:absolute;left:0;right:0;bottom:0;height:196px;border-radius:20px 20px 0 0;'
    'background:rgba(5,12,10,.95);border-top:1px solid rgba(98,240,163,.3);backdrop-filter:blur(20px);'
    'padding:11px 18px 22px">'
    '<div style="width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.24);margin:0 auto 13px"></div>'
    '<div class="cond" style="font-size:11px;color:rgba(255,255,255,.5)">DOTKNIJ NARZĄDU, ABY GO ZBADAĆ</div>'
    '<div style="display:flex;gap:7px;overflow:hidden;margin-top:11px">'
    + ''.join(f'<button style="padding:9px 14px;border-radius:11px;border:1px solid '
              f'{"#62f0a3" if on else "rgba(255,255,255,.16)"};font-size:12.5px;white-space:nowrap;'
              f'color:{"#eafff4" if on else "rgba(255,255,255,.72)"}">{n}</button>'
              for n, on in [('Krążenia', True), ('Nerwowy', False), ('Oddechowy', False), ('Kostny', False)])
    + '</div>'
      '<div style="display:flex;gap:7px;margin-top:9px">'
      '<button style="flex-grow:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);'
      'font-size:13px">Przekrój</button>'
      '<button style="flex-grow:1;padding:12px;border-radius:12px;background:#62f0a3;color:#042014;'
      'font-weight:800;font-size:13px">BADAJ</button></div></div>')
write('Mobile_Human.dc.html', mobile('Mobile — człowiek', m_stage + m_top + m_sheet_peek))

m_sheet_full = (
    '<div style="position:absolute;left:0;right:0;bottom:0;height:566px;border-radius:20px 20px 0 0;'
    'background:rgba(5,12,10,.97);border-top:1px solid rgba(98,240,163,.35);backdrop-filter:blur(22px);'
    'padding:11px 18px 22px;display:flex;flex-direction:column">'
    '<div style="width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.24);margin:0 auto 13px"></div>'
    '<div style="display:flex;align-items:baseline;gap:9px">'
    '<span class="cond" style="font-size:20px;font-weight:700">Serce</span>'
    '<span class="mono" style="font-size:9px;color:rgba(255,255,255,.44)">COR</span>'
    '<span style="flex-grow:1"></span>' + badge('MODEL', 'warn') + '</div>'
    '<dl style="margin:14px 0 0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12px">'
    '<dt style="color:rgba(255,255,255,.5)">Układ</dt><dd style="margin:0">Krążenia</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Skala</dt><dd class="mono" style="margin:0">0,11 m</dd>'
    '<dt style="color:rgba(255,255,255,.5)">Użycie</dt><dd class="mono" style="margin:0">NOT_A_MEDICAL_DEVICE</dd>'
    '</dl>'
    '<div class="cond" style="font-size:10px;color:#62f0a3;margin:18px 0 8px">OD MAKRO DO MIKRO</div>'
    '<div style="display:flex;flex-wrap:wrap;gap:6px">'
    + ''.join(f'<button style="padding:8px 12px;border-radius:10px;font-size:12px;'
              f'border:1px solid {"#62f0a3" if on else "rgba(255,255,255,.14)"};'
              f'color:{"#eafff4" if on else "rgba(255,255,255,.66)"}">{n}</button>'
              for n, on in [('Ciało', False), ('Narząd', True), ('Tkanka', False), ('Komórka', False),
                            ('Organellum', False), ('DNA', False)])
    + '</div>'
      '<div class="cond" style="font-size:10px;color:#62f0a3;margin:18px 0 8px">OBRAZ Z SESJI</div>'
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">'
    + tile('Hyperscope 5×', 'MODEL', 'radial-gradient(circle at 42% 40%,#1d3a4d,#07131b)')
    + tile('Histologia', 'SIMULATED', 'repeating-linear-gradient(48deg,#3a2740,#3a2740 5px,#4a3150 5px,#4a3150 10px)')
    + '</div>'
      '<div style="flex-grow:1"></div>'
      '<div class="mono" style="font-size:9px;color:rgba(255,255,255,.34);line-height:1.5;margin-bottom:10px">'
      'Bryła z atlasu. Genesis nie ma obrazowania tego bliźniaka.</div>'
      '<button style="width:100%;padding:14px;border-radius:13px;background:#62f0a3;color:#042014;'
      'font-weight:800;font-size:13.5px">Otwórz sesję badawczą</button></div>')
write('Mobile_Organ.dc.html', mobile('Mobile — narząd', m_stage + m_top + m_sheet_full))
