---
name: ddjoinjoy-art-style
description: DDJoinJoy house art style — warm hand-painted 2D game art. Use whenever making or reviewing any graphic for a DDJoinJoy game (props, UI art, icons, scenes, characters, animated/rigged assets, image-gen prompts), so every game keeps one look.
---

# DDJoinJoy art style

DDJoinJoy is a set of web party games (big host screen + phones). Every game must look like it belongs to the same family. This skill is the single source of that look. It does **not** cover game design, engine or Figma work: deliver files; the art lead places them in Figma.

**Before drawing anything, open the reference images in `references/` and look at them.** The approved images outweigh any text here. When the text and the images disagree, match the images.

| Reference | What it shows |
|---|---|
| `references/golden-props.png` | The three approved "golden samples": shaker (metal), glass of Thai iced tea (glass + liquid), order ticket (paper). The best of the set are the glass and the paper ticket. |
| `references/kit-sheet.png` | A full prop kit in the style: gauge, stamps, tutorial icons |
| `references/rig-states.png` | One rigged asset (glass) at several states — how a changing asset should look at each value |
| `references/raster/scene-bg.jpg` | Host background scene (raster, image-gen) |
| `references/raster/character-sip.png`, `character-grumpy.png` | One character in two expressions (raster, image-gen) |
| `references/svg/*.svg` | Source SVG of the props, to read how they are built |

## 1. The look

"Warm hand-painted 2D illustration with dimensional form, fine brushwork, and material-specific textures."

- Gouache / watercolour feel with **controlled** edges. Shapes must read when small (phone screen, a cup among 8 on the host).
- **Outlines:** thin, in a darker shade of the object's own colour (metal → slate, tea → dark amber, paper → warm brown). Never a uniform thick black line.
- **Colour:** natural and vivid. Do not tint everything yellow or sepia. Warm, tactile, friendly.
- **Dimensional form:** light from upper left, a clear highlight and core shadow, soft contact shadow under objects.
- **Not:** photo, 3D plastic render, flat vector/icon style, anime cel shading, pixel art.
- **Theme:** close-to-home Thai (street food stalls, ร้านชา, ตลาด, วัด, บ้านไม้). Thai text is a live text layer in the game, never painted into art.

### Materials must read differently

| Material | How to paint it |
|---|---|
| Metal | Vertical reflection bands in the gradient (dark–light–mid–warm–dark), a crisp white highlight streak, a warm reflected tone; **clean symmetric outline** |
| Glass | Mostly transparent; bright edge highlights, a vertical white streak, contents visible through it; clean outline |
| Ceramic | Smooth soft gradient, one soft highlight; clean outline |
| Liquid | Rich colour, lighter at the surface, swirl/translucency; edge may be lively |
| Paper | Matte, fine fibre dabs, slightly irregular edge, tape or torn edge as accent |
| Cloth | Soft folds, lively edge |
| Wood | Grain strokes along the length |

**Key lesson:** solid geometric objects (metal, ceramic, glass, bottles) need **clean symmetric outlines**. Hand-drawn wobble on them reads as a crooked object, not as handmade (the first shaker was rejected for looking bent). Keep the painterly feel in brush dabs and highlights. Paper, cloth and liquid may keep a lively edge.

## 2. Two production lanes

### Lane A — props, UI art, icons: Claude draws "painted vector" SVG

Use `scripts/painted_svg.py` (helpers) and read `scripts/example_shaker.py` (a complete approved object) before starting.

- Build: gradient fills + many short semi-transparent **brush-dab strokes** (`strokes()`) inside the shape + highlight streaks + thin coloured outline.
- **No SVG filters, masks, blur or `<image>`** inside props — Figma drops or breaks them. Gradients, paths, clipPath only.
- Smooth outlines with `smooth_path()` (Catmull-Rom). For sharp corners repeat the point with `corner()`, otherwise the curve spikes.
- `wobble` amount: ≤ 0.3 for metal/ceramic/glass, 1–3 for paper/cloth.
- Use a fixed `random.Random(seed)` so re-running gives the same art.
- Canvas: draw at roughly the size it will be used on the host (objects ~300–500 px tall), transparent background, object centred, a little padding.
- Give layers meaningful `id`s (`L-body`, `L-highlight`, …) — designers and devs will look for them.

**Process:** draw 1–2 objects first → render a preview sheet with `scripts/preview_sheet.py out.png a.svg b.svg …` (dark game background) → **open the PNG and compare side by side with `references/golden-props.png`** → fix → show the user the sheet and wait for feedback before producing the rest of the set.

### Lane B — scenes and characters: raster from image generation

Claude writes the prompt; the person runs it in an image generator (ChatGPT) and brings the PNG back. Attach the reference images from `references/` to the image generator together with the prompt.

Prompt template (English, keep every heading):

```
Purpose: <what it is used for in the game, where it appears, on which screen>
Subject: <exact object / character / scene>
Reference roles: Image 1 = style reference (match brushwork, outlines, colour), Image 2 = <…>. Do not copy their subjects.
Style: Warm hand-painted 2D illustration with dimensional form, fine brushwork, and material-specific textures. Gouache feel, controlled edges, thin outlines in a darker shade of each object's own colour, natural vivid colour (not sepia), light from upper left.
Materials: <material by material>
Composition: <framing; leave calm empty areas where UI/text will go; the character faces LEFT/RIGHT toward …>
Lighting: <warm daylight / evening stall lights …>
Change / Preserve: (for variants) Change: <expression only>. Preserve: same character, same head position and size, same clothes, same framing.
Output: <size, e.g. 1254x1254>, PNG, RGBA, transparent background, alpha = 0 outside the subject.   (scenes: 16:9, opaque)
Exclusions: no text, no letters, no logos, no watermark, no extra props, no frame or border.
```

- Make **one master character** first, then every expression from it with Change/Preserve so the head stays in the same place (the game swaps images in place).
- **When the PNG comes back, check:**
  - alpha is really 0 outside (often ~99 % plus faint specks) → clean it (threshold low alpha, remove small islands);
  - which way the character faces relative to what it looks at in the game → mirror **once** if needed (note it, so nobody mirrors it twice);
  - scenes: upscale/crop to 1920×1080;
  - compare against `references/raster/` — same brushwork and colour temperature?

## 3. Assets that change with a number (rigs)

Anything whose look depends on a value (a glass filling, a gauge, a balloon inflating, a mortar pounding) is a **rig**: separate named layers + a few parameters + rules for how each layer moves. See `references/svg/glass-rig.svg` and `references/rig-states.png`.

- Paint textured fills **once at full size and reveal them with a moving clip**. Never stretch textured art.
- **Everything inside a container** (liquid, foam, ice, ripples) sits in one group clipped to the container's interior **including its mouth** (rim ellipse for cups and mortars, neck for bottles). A flat-top clip cuts surfaces flat at the rim; no clip lets ripples leak outside the glass.
- **Surfaces inside a round container are curved** (two ellipse arcs), scaled to the container's width at that height — never a flat rectangle.
- 0 % means truly empty: no leftover liquid.
- **Overflow / spill** is its own layer outside the container, hidden until needed.
- Rotate tools around their functional point (a shaker around its spout).
- Render and check every rig at **0, ~5 %, middle, full, overflow**, as one sheet.
- Write a short `rigs.md` next to the SVG: layer ids, parameters, ranges, formulas.

## 4. Delivering

Put the files in the game's asset folder (ask where if unclear), e.g.:

```
assets/svg/        props, icons, rigs (+ rigs.md)
assets/raster/     scenes, characters (PNG RGBA, cleaned)
assets/preview.png one sheet of everything on the dark background
```

File names: `<game-prefix>-<thing>[-<state>].svg` (e.g. `stt-stamp-coral.svg`). Tell the person which files are ready and which need the art lead to place them in Figma.

## 5. Final check (do it, don't assume)

- [ ] Preview sheet rendered and **looked at** next to `golden-props.png`
- [ ] Outlines thin and coloured; solid objects symmetric and clean
- [ ] No filters/masks/`<image>` in SVG props
- [ ] Readable small: view the sheet at 25 % size
- [ ] No text painted into art
- [ ] Rasters: alpha clean, facing direction correct, sizes right
- [ ] Rigs checked at all states, nothing leaks outside its container
