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
    card: bool = False     # a cropped Discover card; the screen is rebuilt around it


PANELS = [
    Panel("01-discover-card.jpg", "Get discovered.", "It's a Draft!",
          "Swipe right to Draft an athlete, coach or agent. When it's mutual, chat unlocks.",
          card=True),
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


IONICONS = ROOT / "node_modules" / "@expo" / "vector-icons" / "build" / "vendor" / "react-native-vector-icons" / "Fonts" / "Ionicons.ttf"
# Codepoints from the Ionicons glyphmap shipped with @expo/vector-icons.
ICON = {"arrow-back": 0xF127, "arrow-forward": 0xF133, "compass-outline": 0xF284,
        "trophy-outline": 0xF602, "globe-outline": 0xF350, "menu-outline": 0xF452, "play": 0xF4C6}
# The app's own colours (config/colors.ts): Pass is semantic.error, Draft is
# semantic.success, the Super Draft plate is brand.primary with a white ring.
PASS_RED = (231, 76, 60)
DRAFT_GREEN = (0, 184, 148)
PLATE = (18, 18, 18)
SCREEN_BG_TOP = (10, 14, 22)
SCREEN_BG_BOTTOM = (5, 8, 14)


def icon(draw: ImageDraw.ImageDraw, name: str, cx: int, cy: int, size: int, fill) -> None:
    f = ImageFont.truetype(str(IONICONS), size)
    ch = chr(ICON[name])
    x0, y0, x1, y1 = draw.textbbox((0, 0), ch, font=f)
    draw.text((cx - (x1 - x0) / 2 - x0, cy - (y1 - y0) / 2 - y0), ch, font=f, fill=fill)


def discover_screen(card: Image.Image, w: int = 1080, h: int = 2340) -> Image.Image:
    """Rebuild the Discover tab around a captured card: the real header copy,
    the card, the three action buttons and the tab bar, in the app's own
    colours and icons. Used when the capture is the card alone rather than
    the whole screen."""
    img = Image.new("RGB", (w, h), SCREEN_BG_TOP)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        px[0, y] = tuple(int(a + (b - a) * t) for a, b in zip(SCREEN_BG_TOP, SCREEN_BG_BOTTOM))
    for y in range(h):
        row = px[0, y]
        for x in range(1, w):
            px[x, y] = row
    d = ImageDraw.Draw(img)
    m = int(w * 0.06)

    # Header -- what a recruiter sees on Discover.
    d.text((m, int(h * 0.062)), "Hello, Coach", font=font("400Regular", int(w * 0.036)), fill=MUTED)
    d.text((m, int(h * 0.062) + int(w * 0.05)), "Let's Start Scouting", font=font("700Bold", int(w * 0.062)), fill=WHITE)

    # Card
    cw = int(w * 0.88)
    chh = int(cw * card.height / card.width)
    cy = int(h * 0.165)
    img.paste(rounded(card.resize((cw, chh), Image.LANCZOS), int(cw * 0.05)), ((w - cw) // 2, cy),
              rounded(card.resize((cw, chh), Image.LANCZOS), int(cw * 0.05)))

    # Action row: Pass · Super Draft · Draft
    by = cy + chh + int(h * 0.05)
    big, small, gap = int(w * 0.13), int(w * 0.115), int(w * 0.075)
    xs = [w // 2 - gap - big, w // 2, w // 2 + gap + big]
    d.ellipse([xs[0] - big // 2, by - big // 2, xs[0] + big // 2, by + big // 2], fill=PASS_RED)
    icon(d, "arrow-back", xs[0], by, int(big * 0.5), WHITE)
    d.ellipse([xs[1] - small // 2, by - small // 2, xs[1] + small // 2, by + small // 2], fill=PLATE,
              outline=(230, 230, 230), width=max(2, small // 40))
    logo = Image.open(ROOT / "assets" / "logo_white.png").convert("RGBA")
    ls = int(small * 0.5)
    logo = logo.resize((ls, int(ls * logo.height / logo.width)), Image.LANCZOS)
    img.paste(logo, (xs[1] - logo.width // 2, by - logo.height // 2), logo)
    d.ellipse([xs[2] - big // 2, by - big // 2, xs[2] + big // 2, by + big // 2], fill=DRAFT_GREEN)
    icon(d, "arrow-forward", xs[2], by, int(big * 0.5), WHITE)

    # Tab bar: Discover · Draft Board · (feed) · Globe · More
    tb = int(h * 0.94)
    d.line([(0, tb - int(h * 0.028)), (w, tb - int(h * 0.028))], fill=(28, 32, 40), width=2)
    tabs = [("compass-outline", "Discover", True), ("trophy-outline", "Draft Board", False),
            ("play", "", False), ("globe-outline", "Globe", False), ("menu-outline", "More", False)]
    f_tab = font("500Medium", int(w * 0.024))
    for i, (ic, label, active) in enumerate(tabs):
        cx = int(w * (0.1 + 0.2 * i))
        col = WHITE if active else (150, 160, 175)
        if ic == "play":
            r = int(w * 0.04)
            d.ellipse([cx - r, tb - int(h * 0.012) - r, cx + r, tb - int(h * 0.012) + r], outline=(200, 205, 215), width=3)
            icon(d, ic, cx + 2, tb - int(h * 0.012), int(r * 0.9), (200, 205, 215))
            continue
        icon(d, ic, cx, tb - int(h * 0.016), int(w * 0.05), col)
        d.text((cx - d.textlength(label, font=f_tab) / 2, tb + int(h * 0.004)), label, font=f_tab, fill=col)
    return img


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
    if panel.card:
        # A cropped card: rebuild the Discover screen around it, then frame
        # it like every other panel.
        shot = discover_screen(shot)
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
