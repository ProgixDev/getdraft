"""
Showcase mockups: several phones on one branded scene.

    python docs/store-assets/make-showcase.py

Outputs into docs/store-assets/out/showcase/:
  feature-graphic-1024x500.png   Google Play feature graphic (logo + 2 phones)
  showcase-1920x1080.png         website hero / press
  showcase-1080x1080.png         social (square)
  showcase-1080x1920.png         story format

Uses the same captures, fonts, colours and phone frame as
make_screenshots.py, so the two sets look like one family.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_screenshots import (  # noqa: E402
    ACCENT, CAPTURES, MUTED, OUT, ROOT, WHITE, font, gradient, phone_frame, shadow,
)

LOGO = ROOT / "assets" / "logo_white.png"
# Which screens make the scene, back to front.
SCENE = ["03-globe.png", "05-draft-board.png", "02-its-a-draft.png"]


def phone(file: str, width: int) -> Image.Image:
    return phone_frame(Image.open(CAPTURES / file).convert("RGB"), width)


def place(canvas: Image.Image, art: Image.Image, x: int, y: int, angle: float = 0.0) -> None:
    """Drop a phone with a soft shadow, optionally tilted."""
    if angle:
        art = art.rotate(angle, resample=Image.BICUBIC, expand=True)
    sh, pad = shadow(art.size, int(art.width * 0.14), int(art.width * 0.06), alpha=150)
    canvas.alpha_composite(sh, (x - pad, y - pad + int(art.width * 0.04)))
    canvas.alpha_composite(art, (x, y))


def logo_block(canvas: Image.Image, x: int, y: int, scale: float, tagline: bool = True) -> None:
    d = ImageDraw.Draw(canvas)
    logo = Image.open(LOGO).convert("RGBA")
    lw = int(160 * scale)
    logo = logo.resize((lw, int(lw * logo.height / logo.width)), Image.LANCZOS)
    canvas.alpha_composite(logo, (x, y))
    f_word = font("800ExtraBold", int(84 * scale))
    tx = x + lw + int(22 * scale)
    ty = y + (logo.height - int(84 * scale * 1.25)) // 2
    d.text((tx, ty), "Get", font=f_word, fill=WHITE)
    d.text((tx + d.textlength("Get", font=f_word), ty), "Draft", font=f_word, fill=ACCENT)
    if tagline:
        f_h = font("700Bold", int(46 * scale))
        f_s = font("500Medium", int(26 * scale))
        yy = y + logo.height + int(36 * scale)
        d.text((x, yy), "Get discovered.", font=f_h, fill=WHITE)
        yy += int(46 * scale * 1.15)
        d.text((x, yy), "It's a Draft!", font=f_h, fill=ACCENT)
        yy += int(46 * scale * 1.35)
        d.text((x, yy), "Athletes, coaches and agents connect", font=f_s, fill=MUTED)
        yy += int(26 * scale * 1.45)
        d.text((x, yy), "with a single Draft.", font=f_s, fill=MUTED)


def feature_graphic() -> Image.Image:
    w, h = 1024, 500
    c = gradient(w, h).convert("RGBA")
    logo_block(c, 64, 96, 0.78)
    back = phone("03-globe.png", 190)
    front = phone("02-its-a-draft.png", 210)
    place(c, back, 600, 60, angle=-8)
    place(c, front, 760, 40, angle=6)
    return c.convert("RGB")


def showcase(w: int, h: int) -> Image.Image:
    c = gradient(w, h).convert("RGBA")
    landscape = w > h
    if landscape:
        logo_block(c, int(w * 0.07), int(h * 0.22), w / 1500)
        pw = int(w * 0.17)
        base_y = int(h * 0.12)
        xs = [int(w * 0.50), int(w * 0.63), int(w * 0.76)]
        for i, (file, x) in enumerate(zip(SCENE, xs)):
            place(c, phone(file, pw), x, base_y + int(h * 0.05) * (i % 2), angle=(-6, 0, 6)[i])
    else:
        # Portrait / square: logo on top, three fanned phones below.
        d = ImageDraw.Draw(c)
        logo = Image.open(LOGO).convert("RGBA")
        lw = int(w * 0.13)
        logo = logo.resize((lw, int(lw * logo.height / logo.width)), Image.LANCZOS)
        f_word = font("800ExtraBold", int(w * 0.075))
        total = lw + int(w * 0.02) + d.textlength("GetDraft", font=f_word)
        x0 = int((w - total) // 2)
        y0 = int(h * 0.07)
        c.alpha_composite(logo, (x0, y0))
        tx = x0 + lw + int(w * 0.02)
        ty = y0 + (logo.height - int(w * 0.075 * 1.25)) // 2
        d.text((tx, ty), "Get", font=f_word, fill=WHITE)
        d.text((tx + d.textlength("Get", font=f_word), ty), "Draft", font=f_word, fill=ACCENT)
        f_h = font("700Bold", int(w * 0.042))
        line = "Get discovered. It's a Draft!"
        d.text(((w - d.textlength(line, font=f_h)) // 2, y0 + logo.height + int(h * 0.02)), line, font=f_h, fill=MUTED)
        # Square gets smaller phones so the fan clears the tagline; the story
        # format has room for bigger ones.
        if h > w:
            pw, top, spread = int(w * 0.36), int(h * 0.26), 1.30
        else:
            pw, top, spread = int(w * 0.26), int(h * 0.36), 1.40
        centre = w // 2
        place(c, phone(SCENE[0], pw), centre - int(pw * spread), top + int(pw * 0.25), angle=-8)
        place(c, phone(SCENE[2], pw), centre + int(pw * (spread - 1.0)), top + int(pw * 0.25), angle=8)
        place(c, phone(SCENE[1], int(pw * 1.08)), centre - int(pw * 0.54), top, angle=0)
    return c.convert("RGB")


def main() -> int:
    dest = OUT / "showcase"
    dest.mkdir(parents=True, exist_ok=True)
    feature_graphic().save(dest / "feature-graphic-1024x500.png", optimize=True)
    print("feature-graphic-1024x500.png")
    for w, h in ((1920, 1080), (1080, 1080), (1080, 1920)):
        showcase(w, h).save(dest / f"showcase-{w}x{h}.png", optimize=True)
        print(f"showcase-{w}x{h}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
