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

---

# Ice Run (ส่งน้ำแข็ง) — characters (Lane B)

The game is seen from above, but customers sit at round tables and are shown as a **head-and-shoulders bust facing the camera**, drawn about 120 px tall on the big screen. They must read at that size: big clear face, simple shapes.
Make the **master** of each character first, then each expression from it with Change/Preserve, so the head stays in the same place (the game swaps images in place).
Put the PNGs in `assets/raster/` with the file names below and ask Claude to "เช็กภาพนี้ตามสกิล".

Attach to every prompt: Image 1 = `.claude/skills/ddjoinjoy-art-style/references/raster/character-sip.png`, Image 2 = `.claude/skills/ddjoinjoy-art-style/references/raster/character-grumpy.png`, Image 3 = `assets/ir-preview.png`

## 1. ir-customer-happy — regular customer (master)

```
Purpose: A customer waiting at a table in a party game set in a Thai beer garden (ลานเบียร์) at night. Shown small (about 120 px) on a TV screen, sitting at a round table, waiting for ice to be delivered.
Subject: A friendly Thai office worker in his 30s, head and shoulders, facing the camera, short black hair, rolled-up light blue shirt, holding up an empty beer glass with one hand as if asking for ice, cheerful hopeful smile.
Reference roles: Image 1 and Image 2 = style reference (match brushwork, outlines, colour, how a character is painted). Image 3 = props from the same game (ice cube, banana) so the character matches them. Do not copy their subjects.
Style: Warm hand-painted 2D illustration with dimensional form, fine brushwork, and material-specific textures. Gouache feel, controlled edges, thin outlines in a darker shade of each object's own colour, natural vivid colour (not sepia), light from upper left.
Materials: skin with soft warm gouache shading; cotton shirt with soft folds; glass with bright edge highlights and a vertical white streak.
Composition: square, bust centred, head in the upper half, big readable face and expression, a little padding all round. Facing the camera.
Lighting: warm evening light from string lights, from upper left.
Output: 1024x1024, PNG, RGBA, transparent background, alpha = 0 outside the subject.
Exclusions: no text, no letters, no logos, no watermark, no extra props, no table, no background, no frame or border.
```

Variants (same chat, attach the master as Image 4):
- `ir-customer-angry` — `Change: expression only: impatient and annoyed, frowning, tapping the empty glass, a small sweat drop. Preserve: same character, same head position and size, same clothes, same framing, transparent background.`
- `ir-customer-yum` — `Change: expression only: delighted, eyes closed in a big happy smile, glass now full of ice and beer. Preserve: same character, same head position and size, same clothes, same framing, transparent background.`

## 2. ir-vip-cool — VIP customer (master)

Same prompt as 1, with:
```
Subject: A flashy Thai VIP customer in his 40s, head and shoulders, facing the camera, slicked-back hair, dark sunglasses, shiny gold-patterned silk shirt, a thin gold necklace, holding up a crystal glass, confident cool smirk.
Materials: silk shirt with soft sheen and gold print; gold chain with crisp highlights; sunglasses as dark glass with a white streak; skin with soft warm gouache shading.
```
Variants: `ir-vip-annoyed` (Change: lowers the sunglasses, unimpressed frown), `ir-vip-wow` (Change: sunglasses pushed up, starry-eyed amazed grin, glass full of ice).

## 3. ir-tycoon-smug — เจ้าสัว, the final boss customer (master)

Same prompt as 1, with:
```
Purpose: The final boss customer of a party game in a Thai beer garden: a rich tycoon (เจ้าสัว) who appears in the last 10 seconds on a red-carpet stage in the middle of the screen. Shown about 220 px tall.
Subject: A plump, jolly Thai-Chinese tycoon in his 60s, head and shoulders, facing the camera, round face, neat grey hair, small round glasses, red silk mandarin-collar shirt with gold dragon embroidery, a chunky gold watch, holding up a big ice bucket glass with one hand and a fan of banknotes in the other, smug satisfied smile.
Materials: silk with sheen and embroidered gold thread; gold watch with crisp highlights; paper banknotes (matte, slightly irregular edges); glass with bright edge highlights.
```
Variants: `ir-tycoon-wow` (Change: expression only: laughing out loud with joy, throwing the banknotes up). 

Checks when they come back: alpha really 0 outside; face readable at 120 px; brushwork and colour match Image 1–2; head in the same place across expressions.
