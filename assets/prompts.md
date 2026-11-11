# Tilt Arena — image-gen prompts (Lane B)

Run in ChatGPT image generation. Attach the images listed under "Reference roles" together with the prompt.
When the PNG comes back, put it in `assets/raster/` and ask Claude to "เช็กภาพนี้ตามสกิล" (crop/upscale to 1920×1080, compare with `references/raster/`).

## ta-scene-schoolyard — host background

Attach: Image 1 = `.claude/skills/ddjoinjoy-art-style/references/raster/scene-bg.jpg`, Image 2 = `assets/preview.png`

```
Purpose: Full-screen background of the host (TV/projector) screen for a party game where players roll glass marbles inside a chalk ring scratched into a dirt yard. The round arena is drawn by the game on top of the centre of this image, so the centre must stay calm.
Subject: A Thai school yard in the late afternoon, seen from slightly above: a wide patch of bare packed brown earth in the middle, framed at the edges by a shaded wooden school building corner with a long bench, a big rain tree (ต้นจามจุรี) casting soft dappled shade, a few potted plants, a low painted concrete wall, a pair of rubber sandals left by the bench, and a small pile of school bags.
Reference roles: Image 1 = style reference (match brushwork, outlines, colour temperature, level of detail). Image 2 = the game's marbles and props, so the scene matches them. Do not copy their subjects.
Style: Warm hand-painted 2D illustration with dimensional form, fine brushwork, and material-specific textures. Gouache feel, controlled edges, thin outlines in a darker shade of each object's own colour, natural vivid colour (not sepia), light from upper left.
Materials: dry packed earth with small pebbles and faint scuffs (matte, crumbly dabs); weathered teak wood with grain along the planks; leaves in layered greens; painted concrete with chipped edges; canvas school bags; rubber sandals.
Composition: 16:9. The middle ~60% of the frame is an open, evenly lit dirt yard with no objects, no strong shadows and no busy texture (the game draws its arena there). Props stay at the left, right and top edges. Keep the top-left and top-right corners calm for score UI. Eye level slightly above, looking down at the yard.
Lighting: warm late-afternoon daylight from upper left, soft dappled shade from the tree at the edges, gentle warm bounce light on the earth.
Output: 1920x1080 (or the closest 16:9), PNG, opaque.
Exclusions: no text, no letters, no logos, no watermark, no people, no children, no marbles, no chalk circle, no frame or border.
```

### v2 follow-up (send in the same ChatGPT chat, attach the v1 result as Image 3)

v1 (`assets/raster/ta-scene-schoolyard.png`) came out at eye level: the yard ends a third of the way down and the wall
runs through where the top of the arena is drawn. It is also tinted orange all over and reads more anime-background than gouache.

```
Change: camera angle only — look much more steeply down at the yard (about 60° from horizontal, close to top-down), so packed dirt fills the whole frame from top edge to bottom edge. The wooden bench, bags and sandals stay as a corner vignette at the top-left; the tree, its roots and the pots as a corner vignette at the top-right; the wall and the buildings behind it are no longer visible. Colour: less orange cast, earth a natural mid brown with cool grey-green shade under the tree. Brushwork: gouache dabs and soft painted edges like Image 1, not crisp anime-style leaves.
Preserve: same place, same props, same late-afternoon light from upper left, same calm open centre with only faint dappled shade, 16:9.
Output: 1920x1080 (or the closest 16:9), PNG, opaque.
Exclusions: no text, no letters, no logos, no watermark, no people, no marbles, no chalk circle, no frame or border.
```

Checks when it comes back:
- the centre is calm enough for the arena and the balls to read on top (compare against `assets/preview.png`)
- colour temperature and brushwork match `scene-bg.jpg`, not photo-like or 3D
- upscale / crop to exactly 1920×1080
