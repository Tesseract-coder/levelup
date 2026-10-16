"""Generate LevelUp PWA icons (original artwork: rising bars + chevron)."""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/icons"
ACCENT = (79, 70, 229)
WHITE = (255, 255, 255)

def draw(size: int, maskable: bool, radius_frac: float = 0.22) -> Image.Image:
    s = size * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=ACCENT)
        pad = s * 0.22  # keep artwork in the safe zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_frac), fill=ACCENT)
        pad = s * 0.2
    inner = s - 2 * pad
    bw = inner * 0.2
    gap = (inner - 3 * bw) / 2
    heights = [0.3, 0.48, 0.66]
    base = pad + inner
    for i, h in enumerate(heights):
        x0 = pad + i * (bw + gap)
        y0 = base - inner * h
        alpha = 150 + i * 50
        d.rounded_rectangle([x0, y0, x0 + bw, base], radius=int(bw * 0.35), fill=WHITE + (alpha,))
    # chevron above the bars
    cx, cy, w = pad + inner * 0.5, pad + inner * 0.04, inner * 0.22
    lw = int(inner * 0.07)
    d.line([(cx - w, cy + w * 0.7), (cx, cy), (cx + w, cy + w * 0.7)], fill=WHITE, width=lw, joint="curve")
    for px, py in [(cx - w, cy + w * 0.7), (cx, cy), (cx + w, cy + w * 0.7)]:
        d.ellipse([px - lw / 2, py - lw / 2, px + lw / 2, py + lw / 2], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)

for size in (192, 512):
    draw(size, False).save(f"{OUT}/icon-{size}.png")
    draw(size, True).save(f"{OUT}/maskable-{size}.png")
draw(180, True).convert("RGB").save(f"{OUT}/apple-touch-icon.png")
draw(64, False).save(f"{OUT}/favicon-64.png")
# shortcut icons
for name in ("food", "workout", "water"):
    draw(96, False).save(f"{OUT}/shortcut-{name}.png")
print("icons written to", OUT)
