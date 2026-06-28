// Drop-in building sprites: composite a custom building PNG onto the map where
// an EB building is. You make a building image, add an entry here, rebuild —
// it shows up in the game. Idempotent post-build step (re-applies after builds).
//
//   node scripts/stamp-buildings.mjs
//
// content/building-overrides.json:
//   { "buildings": [
//       { "id": "the-plug", "chunk": "3,2", "x": 14, "y": 0, "w": 120, "h": 158,
//         "image": "assets/buildings/the-plug.png" }   // x,y,w,h = where/size on the chunk (512x512), top-left origin
//   ] }
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUB = join(ROOT, "apps/game/public");
const CHUNKS = join(PUB, "generated/assets/world/chunks");
const CONFIG = join(ROOT, "content/building-overrides.json");

try { execSync("magick -version", { stdio: "ignore" }); }
catch { console.warn("stamp-buildings: ImageMagick not found — skipping"); process.exit(0); }
if (!existsSync(CONFIG)) { console.log("no content/building-overrides.json — nothing to stamp"); process.exit(0); }

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const GROUND = cfg.groundColor || "srgb(41,189,99)"; // grass green to erase the EB building to
let stamped = 0, skipped = 0;
for (const b of cfg.buildings ?? []) {
  const [cx, cy] = String(b.chunk).split(",").map(Number);
  const chunk = join(CHUNKS, `background-${cx}-${cy}.png`);
  const img = join(PUB, b.image);
  if (!existsSync(chunk) || !existsSync(img)) { console.warn(`  skip ${b.id}: missing ${!existsSync(chunk) ? "chunk" : "image"}`); skipped++; continue; }
  // ERASE: clear an expanded box around the EB building to ground (so its
  // silhouette can't peek past the new sprite), then drop the sprite on top.
  // Expansion (top/side bigger, keep bottom near the base so the sidewalk stays).
  const e = b.erase || { top: 14, side: 8, bottom: 2 };
  const ex = b.x - e.side, ey = b.y - e.top, ew = b.w + e.side * 2, eh = b.h + e.top + e.bottom;
  const ground = b.groundImage ? `\\( "${join(PUB, b.groundImage)}" -write mpr:g +delete -size ${ew}x${eh} tile:mpr:g \\)` : `\\( -size ${ew}x${eh} xc:"${GROUND}" \\)`;
  execSync(`magick "${chunk}" ${ground} -geometry +${ex}+${ey} -compose over -composite \\( "${img}" -filter point -resize ${b.w}x${b.h}! \\) -geometry +${b.x}+${b.y} -compose over -composite "${chunk}"`, { stdio: "ignore" });
  console.log(`  stamped ${b.id} -> chunk ${b.chunk} @ ${b.x},${b.y} (${b.w}x${b.h}, erased +${e.top}/${e.side})`);
  stamped++;
}
console.log(`stamped ${stamped} building(s)${skipped ? `, skipped ${skipped}` : ""}`);
