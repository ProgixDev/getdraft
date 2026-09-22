"""
Store screenshot panels for GetDraft -- Google Play and App Store.

    python docs/store-assets/make_screenshots.py

Reads the raw phone captures in docs/store-assets/captures/, composes each one
into a branded panel (headline, phone frame, brand gradient) and writes every
store size into docs/store-assets/out/<store>/. Re-run whenever a screen
changes; the panels are regenerated in a few seconds.

Captures should be real phone screenshots (about 1080x2400). Anything much
smaller gets upscaled and looks soft on a store page.

Fonts come from the app's own Poppins bundle in node_modules, so the panels
use the exact face the app does.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CAPTURES = ROOT / "docs" / "store-assets" / "captures"
OUT = ROOT / "docs" / "store-assets" / "out"
FONTS = ROOT / "node_modules" / "@expo-google-fonts" / "poppins"

# ---------------------------------------------------------------- brand
NAVY_DEEP = (5, 20, 38)
NAVY = (13, 44, 77)          # #0D2C4D, the brand blue
NAVY_LIGHT = (18, 58, 102)
ACCENT = (127, 179, 240)     # the light blue "Draft!" uses on the site
WHITE = (255, 255, 255)
MUTED = (191, 206, 224)
BEZEL = (12, 12, 14)

# --------------------------------------------------------------- copy
# Brand terminology: Draft / Pass, "It's a Draft!", Draft Board, Game On.
@dataclass(frozen=True)
class Panel:
    file: str
    headline: str          # first line, white
    accent: str            # second line, light blue
    sub: str


PANELS = [
    Panel("01-discover.png", "Get discovered.", "It's a Draft!",
          "Swipe right to Draft an athlete, coach or agent. When it's mutual, chat unlocks."),
    Panel("02-its-a-draft.png", "Mutual interest,", "instant chat.",
          "Both sides Draft, the match is made, and you can message right away."),
    Panel("03-globe.png", "Talent,", "worldwide.",
          "See athletes and recruiters on the map. Tap a pin to Draft."),
    Panel("04-rankings.png", "Climb the", "rankings.",
          "A Draft Score for every athlete, by country and by sport."),
    Panel("05-draft-board.png", "Your", "Draft Board.",
          "Every match and every message, in one place."),
    Panel("06-scout-board.png", "Built for coaches", "and agents.",
          "Interested athletes come to you. Accept or refuse in one tap."),
]

# ------------------------------------------------------------- store sizes
# (name, width, height). Play accepts 9:16 phone screenshots; Apple's 6.7"
# size is what App Store Connect asks for first and scales to the rest.
SIZES = {
    "google-play": (1080, 1920),
    "app-store-6.7": (1290, 2796),
}


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONTS / weight / f"Poppins_{weight}.ttf"
    return ImageFont.truetype(str(path), size)


def gradient(w: int, h: int) -> Image.Image:
    """Deep navy at the top-left to brand blue at the bottom-right, with a
    soft light-blue glow behind where the phone sits."""
    img = Image.new("RGB", (w, h), NAVY_DEEP)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for x in range(w):
            u = (x / max(1, w - 1)) * 0.35 + t * 0.65
            r = NAVY_DEEP[0] + (NAVY_LIGHT[0] - NAVY_DEEP[0]) * u
            g = NAVY_DEEP[1] + (NAVY_LIGHT[1] - NAVY_DEEP[1]) * u
            b = NAVY_DEEP[2] + (NAVY_LIGHT[2] - NAVY_DEEP[2]) * u
            px[x, y] = (int(r), int(g), int(b))
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * 0.1, h * 0.45, w * 0.9, h * 1.05], fill=(40, 90, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.18))
    return Image.blend(img, Image.composite(glow, img, glow.convert("L").point(lambda v: min(255, v * 2))), 0.55)


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=f) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def shadow(size: tuple[int, int], radius: int, blur: int, alpha: int = 140) -> Image.Image:
    pad = blur * 3
    sh = Image.new("RGBA", (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([pad, pad, pad + size[0], pad + size[1]], radius, fill=(0, 0, 0, alpha))
    return sh.filter(ImageFilter.GaussianBlur(blur)), pad


def phone_frame(shot: Image.Image, target_w: int) -> Image.Image:
    """A dark bezel around the screenshot with a screen-shaped cutout.
    Deliberately generic -- neither an iPhone nor a Pixel -- so one asset
    serves both stores without pretending to be a device it is not."""
    ratio = shot.height / shot.width
    screen_w = target_w
    screen_h = int(screen_w * ratio)
    shot = shot.resize((screen_w, screen_h), Image.LANCZOS)
    bezel = int(screen_w * 0.035)
    r_outer = int(screen_w * 0.14)
    r_inner = int(screen_w * 0.11)
    frame = Image.new("RGBA", (screen_w + bezel * 2, screen_h + bezel * 2), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([0, 0, frame.width - 1, frame.height - 1], r_outer, fill=BEZEL + (255,))
    frame.alpha_composite(rounded(shot, r_inner), (bezel, bezel))
    return frame


def compose(panel: Panel, w: int, h: int) -> Image.Image:
    img = gradient(w, h).convert("RGBA")
    d = ImageDraw.Draw(img)
    margin = int(w * 0.08)

    # --- headline block -------------------------------------------------
    head_size = int(w * 0.082)
    f_head = font("800ExtraBold", head_size)
    f_sub = font("500Medium", int(w * 0.036))
    y = int(h * 0.075)
    for line, color in ((panel.headline, WHITE), (panel.accent, ACCENT)):
        for part in wrap(d, line, f_head, w - margin * 2):
            d.text((margin, y), part, font=f_head, fill=color)
            y += int(head_size * 1.12)
    y += int(h * 0.012)
    for part in wrap(d, panel.sub, f_sub, w - margin * 2):
        d.text((margin, y), part, font=f_sub, fill=MUTED)
        y += int(f_sub.size * 1.5)
    top_of_art = y + int(h * 0.035)

    # --- the screenshot -------------------------------------------------
    shot = Image.open(CAPTURES / panel.file).convert("RGB")
    art = phone_frame(shot, int(w * 0.72))

    x = (w - art.width) // 2
    # The phone bleeds off the bottom edge -- what fits above the fold is
    # the headline and the top two-thirds of the screen, which is the part
    # that carries the story.
    max_visible = h - top_of_art
    y_art = top_of_art if art.height > max_visible else top_of_art + (max_visible - art.height) // 2

    sh, pad = shadow(art.size, int(w * 0.12), int(w * 0.05))
    img.alpha_composite(sh, (x - pad, y_art - pad + int(w * 0.03)))
    img.alpha_composite(art, (x, y_art))
    return img.convert("RGB")


def main() -> int:
    missing = [p.file for p in PANELS if not (CAPTURES / p.file).exists()]
    if missing:
        print("missing captures:", ", ".join(missing))
        return 1
    for store, (w, h) in SIZES.items():
        dest = OUT / store
        dest.mkdir(parents=True, exist_ok=True)
        for i, panel in enumerate(PANELS, 1):
            out = compose(panel, w, h)
            path = dest / f"{i:02d}-{Path(panel.file).stem.split('-', 1)[1]}.png"
            out.save(path, "PNG", optimize=True)
            print(f"{store}: {path.name} {w}x{h}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
