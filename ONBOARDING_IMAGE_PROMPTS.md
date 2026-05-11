# Onboarding Image Generation Prompts

AI image-gen prompts for the welcome slide images that pair with the dark
grainy gradient background in `components/welcome/WelcomeScreen.tsx`.

## Output requirements (read first)

- **Transparent PNG with clean alpha mask.** The background gradient is
  rendered in-app — baked-in dark backgrounds will look like a slightly
  off-color rectangle pasted onto the gradient. See the screenshot from
  May 2026 for what to avoid.
- **Aspect ratio 3:4** (vertical). The slide's `imageContainer` is sized
  at `width: SCREEN_WIDTH * 1.1, height: SCREEN_HEIGHT * 0.7` and the
  image is positioned in the bottom-right with `resizeMode: 'contain'`.
- **Subject placed in the right two-thirds of the frame.** The left third
  must be transparent so the title/subtitle text on the left side of the
  slide stays legible.
- **No text, no logos, no team identifiers, no jersey numbers.** GetDraft
  covers 15 sports — assets must be sport-agnostic or visually neutral.
- **Match the brand grade across all three slides:** consistent lighting,
  same athlete archetype range, same color palette. Generate slide 2
  first, then prompt slide 3 with "in the same style, lighting, and color
  grade as the previous image".

## Save paths

After generation + background removal, drop the new PNGs at the paths
referenced by `config/assets.ts`:

```
assets/welcome1.png   # Slide 1 — Showcase Your Talent
assets/welcome2.png   # Slide 2 — Connect With Recruiters
assets/welcome3.png   # Slide 3 — Take Your Career To The Next Level
```

No code changes needed — the slides pick them up on next reload.

---

## Slide 2 — Connect With Recruiters

> Copy on the slide: *"Get direct access to college scouts, professional
> coaches, and certified agents looking for athletes like you."*

```
Isolated subject on a fully transparent background, alpha PNG output.
Editorial sports photograph of a confident young athlete in dark, modern
training apparel mid-handshake with a sharply-dressed sports agent.
Athlete in three-quarter view, slight smile, eyes locked on the agent;
the agent's face is in soft shadow so the athlete remains the focal
point. Volumetric warm rim light wraps around both figures from behind.
Cool teal ambient fill from the front. Anamorphic flare on the rim
light only. The two figures fill the right two-thirds of the frame;
left third is empty (transparent). No backdrop, no walls, no stadium
tunnel, no floor — subject cut-out only. No text, no logos, no jersey
numbers, no team branding. Sport-neutral apparel. Photoreal, high-end
campaign quality, 50mm lens, deep contrast, subtle film grain on the
subjects. Tight 3:4 vertical crop. Output: transparent PNG, hard
subject edges, clean alpha mask.
```

**Midjourney suffix:** `--ar 3:4 --style raw --v 6.1`
**Imagen 3 / Flux:** prompt above + set output `png` with transparency
**Fallback:** generate on solid `#0a0a0a`, then run through
[remove.bg](https://remove.bg) or Photoroom.

---

## Slide 3 — Take Your Career To The Next Level

> Copy on the slide: *"Match with the right opportunities and unlock
> your potential in the sport you love."*

```
Isolated subject on a fully transparent background, alpha PNG output.
Cinematic silhouette of a young athlete in mid-stride, viewed from
behind and slightly to the side, gear bag slung over one shoulder, head
tilted up. Strong warm golden backlight rakes across the figure,
casting a long shadow that fades into the transparent canvas (shadow
is part of the cut-out, partially transparent). Cool blue-black
highlights on the front of the body, amber highlights on the back.
Anamorphic flare emerging from behind the head — keep the flare bright
but localised so it composites cleanly onto any background. Subject
placed in the right half of the frame, generous transparent space on
the left. No tunnel, no stadium, no walls, no floor — just the figure
plus its glowing rim light and trailing shadow. No text, no logos, no
team identifiers, sport-agnostic silhouette. Photoreal, IMAX-grade,
35mm anamorphic. Output: transparent PNG with clean alpha, including
soft alpha on the flare halo and shadow.
```

**Midjourney suffix:** `--ar 3:4 --style raw --v 6.1`
**Imagen 3 / Flux:** prompt above + set output `png` with transparency
**Fallback:** generate on solid `#0a0a0a`, then run through
[remove.bg](https://remove.bg) or Photoroom.

---

## Generator-specific tips

### Adobe Firefly (recommended for transparent output)
1. Generate Image → write/paste the prompt
2. Aspect ratio: **Portrait 3:4**
3. Toggle **"Transparent background"** in the right panel (Firefly
   model 3+)
4. Style: photo, content type "Photo"

### Midjourney
- Append `--ar 3:4 --style raw --v 6.1` to the prompt
- Midjourney doesn't output transparent PNGs natively. After upscale,
  drop into remove.bg or Photoroom for the alpha mask.

### Flux / Replicate
- Use `flux-1.1-pro` or `flux-schnell` with `aspect_ratio: "3:4"` and
  `output_format: "png"`
- Append `, isolated on transparent background, alpha channel, no
  backdrop` to the prompt

### Background removal services (when source isn't transparent)
- **remove.bg** — free up to 50/mo, clean edges on athletes/uniforms
- **Photoroom** — free mobile app, good batch processing
- **Adobe Express → Remove Background** — free, web-based
- **Photoshop** → Select Subject → Layer Mask → Save As PNG-24

## Sanity-check before saving

Before dropping the PNG into `assets/`, verify in any image viewer that
shows transparency (Preview shows a checkerboard pattern for alpha):

- Background is **transparent**, not white, not dark grey, not
  `#0a0a0a`.
- Edges of helmets, hair, and uniform straps are clean — no halo of
  dark pixels (that's the original backdrop bleeding through).
- The shadow (slide 3) fades smoothly to transparent at the bottom
  edge — don't crop it hard.
- Image fits the 3:4 ratio without padding bars.

---

## Slide 1 — Showcase Your Talent (reference, already exists)

> Copy: *"Upload highlights, stats, and videos to get noticed by top
> recruiters and coaches across all sports."*

The current `welcome1.png` has a baked-in dark backdrop and reads as a
rectangle on the new grainy gradient. Two quick options to fix:

1. **Run it through remove.bg** — the dual-football-player composition
   has clean enough edges that the auto-mask will work on the first
   try.
2. **Regenerate** using a prompt in the same vein as slides 2/3 above
   if you want a stylistic refresh. Keep the dual-player energy.
