# Guardian Video Example — AI Generation Prompt

Use this prompt with a text-to-video model (Sora, Veo 3, Runway Gen-3, Kling, or
similar) to produce a short example video that we show parents/guardians before
they record their own declaration. The goal: communicate exactly what the
guardian must say and how to frame the shot, in a friendly tone.

The clip plays inside the GetDraft parent-link flow with the caption
"Here's what your video should look like" above the player.

---

## Recommended model + settings

- **Model:** Sora 2 (1080p, vertical 9:16) or Veo 3 (vertical). Either works;
  Veo tends to handle natural speech sync better.
- **Length:** 8–10 seconds.
- **Aspect ratio:** 9:16 (vertical, full-bleed on phones).
- **Resolution:** 1080×1920.
- **Audio:** ON. The spoken phrase is the point of the example.
- **Camera motion:** None — locked, eye-level, phone-held framing.
- **Negative prompt:** no on-screen text, no logos, no captions, no transitions,
  no music bed, no background voices.

---

## The prompt (copy-paste verbatim)

> **A friendly, well-lit selfie-style portrait video, vertical 9:16, eye-level
> phone framing. A 35-year-old man with short dark hair, light beard, wearing
> a plain navy crewneck, sits in a softly-lit living room. Warm afternoon
> light from a window on his left. He looks directly into the camera lens
> with a relaxed, confident expression and speaks clearly in a natural,
> conversational tone:**
>
> *"Hi, my name is David Carter. I am the legal guardian of Marcus Carter.
> I confirm that I am submitting this on the GetDraft platform on his
> behalf."*
>
> **He smiles briefly at the end. The audio is clean, no music, no
> background noise. The camera is completely static — no zoom, no pan,
> no cuts. Plain, unbusy background (a neutral wall with a hint of a
> bookshelf and a soft plant out of focus). No on-screen text, no
> captions, no logos. Realistic, documentary-style, not stylised.
> Natural skin tones, no filters.**

---

## Variations (optional second/third examples)

If you want a second example for a different relationship type, swap the
**bolded line** below for the appropriate one, keep everything else identical:

| Relationship  | Spoken line                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| Parent        | "My name is **David Carter**. I am the **parent** of **Marcus Carter**."                       |
| Legal guardian| "My name is **David Carter**. I am the **legal guardian** of **Marcus Carter**."               |
| Step-parent   | "My name is **David Carter**. I am the **step-parent** of **Marcus Carter**."                  |
| Sibling       | "My name is **David Carter**. I am the **older brother** of **Marcus Carter**."                |
| Aunt / Uncle  | "My name is **Sarah Carter**. I am the **aunt** of **Marcus Carter**."                         |
| Grandparent   | "My name is **Robert Carter**. I am the **grandfather** of **Marcus Carter**."                 |

For each variation, append:
*"I confirm that I am submitting this on the GetDraft platform on his behalf."*
(or "her behalf" if the athlete is female).

---

## What to watch for in the output

Re-roll the generation if any of these are off:

- ❌ AI artefacts on the mouth/teeth (very common on text-to-video).
- ❌ Lip sync drifts more than ~80ms from the audio.
- ❌ Eyes look glassy or pupils don't move (uncanny-valley red flag).
- ❌ Background has hallucinated text, signage, or branded items.
- ❌ Audio has reverb, hum, or background voices.
- ❌ The phrase is misspoken or the order of "I am the X of Y" is reversed.
- ✅ Eye contact with the camera lens, natural blinks every 3–5 seconds.
- ✅ Voice sounds warm and unhurried, not robotic.
- ✅ Background is calm and uncluttered.

---

## How we use the video in-app

1. Stored in Supabase storage at `guardian-examples/example-parent.mp4`
   (and one per relationship variant under the same prefix).
2. Loaded via `expo-video` on the parent-link "Record your video" screen
   with a "▶ Watch example" pressable.
3. The caption rendered next to it reads:
   > "Say this exact phrase clearly, looking at the camera:
   > **'My name is &lt;your full name&gt;. I am the &lt;relationship&gt; of
   > &lt;athlete full name&gt;.'**"
4. The parent's actual recording is enforced to be 5–15 seconds; under-length
   recordings are rejected client-side before upload.

---

## Re-generation cadence

Regenerate when:

- The legal copy changes (talk to the team before re-recording).
- A new relationship type is added in the parent-link questionnaire.
- Model quality jumps a generation (e.g. Sora 3 lands and is materially
  better) — re-render all variants to keep them visually consistent.
