"""Draw the 1200x630 Open Graph image for onesist.rogasper.com.

    python3 -I landing/og/make-og.py

Writes public/screenshots/og-image-onesist-1200x630.jpg and og-image-onesist.png from the
hero screenshot and the page headline. Pillow only; no browser.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
W, H = 1200, 630
BRAND = (109, 124, 255)
INK = (24, 24, 27)
MUTED = (161, 161, 170)
SUB = (113, 113, 122)
SF = "/System/Library/Fonts/SFNS.ttf"


def font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(SF, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def blob(canvas: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: int) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius], fill=(*color, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius // 2)))


def rounded(im: Image.Image, r: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def main() -> None:
    canvas = Image.new("RGBA", (W, H), (252, 252, 250, 255))
    top = Image.new("RGBA", (W, H), (245, 246, 255, 255))
    fade = Image.linear_gradient("L").resize((W, H)).point(lambda v: 255 - v)
    canvas = Image.composite(top, canvas, fade)
    blob(canvas, (120, 60), 260, BRAND, 40)
    blob(canvas, (1120, 140), 240, (255, 143, 163), 34)

    # Screenshot on the right, in a white frame with a soft shadow.
    shot = Image.open(PUB / "screenshots" / "hero-agent-approval.jpg").convert("RGB")
    sw = 560
    shot = shot.resize((sw, round(shot.height * sw / shot.width)), Image.LANCZOS).crop((0, 0, sw, 470))
    fx, fy, pad = 600, 92, 10
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([fx + 6, fy + 16, fx + sw + 2 * pad + 6, fy + shot.height + 2 * pad + 16], 22, fill=(16, 24, 40, 40))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
    frame = Image.new("RGBA", (sw + 2 * pad, shot.height + 2 * pad), (255, 255, 255, 240))
    canvas.alpha_composite(rounded(frame, 22), (fx, fy))
    canvas.alpha_composite(rounded(shot, 14), (fx + pad, fy + pad))

    d = ImageDraw.Draw(canvas)
    logo = Image.open(PUB / "logo-icon.png").convert("RGBA").resize((44, 44), Image.LANCZOS)
    canvas.alpha_composite(logo, (64, 64))
    d.text((120, 74), "ONESIST", font=font(22, "Semibold"), fill=INK)

    d.text((64, 186), "From FSD", font=font(64, "Semibold"), fill=INK)
    d.text((64, 258), "to handoff.", font=font(64, "Semibold"), fill=INK)
    d.text((64, 340), "Your agents in the loop.", font=font(34, "Medium"), fill=MUTED)
    d.text((64, 408), "ERD · API spec · Tasks · RTM · SIT", font=font(22), fill=SUB)

    x = 64
    for name in ["Claude Code", "Codex", "Pi", "OpenCode"]:
        f = font(18, "Medium")
        tw = d.textlength(name, font=f)
        d.rounded_rectangle([x, 470, x + tw + 28, 506], 18, fill=(235, 237, 255), outline=(200, 206, 255))
        d.text((x + 14, 478), name, font=f, fill=(79, 91, 213))
        x += tw + 40
    d.text((64, 548), "onesist.rogasper.com · Desktop for macOS & Windows · MIT", font=font(17), fill=SUB)

    rgb = canvas.convert("RGB")
    out = PUB / "screenshots"
    rgb.save(out / "og-image-onesist-1200x630.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(out / "og-image-onesist.png", optimize=True)
    for name in ["og-image-onesist-1200x630.jpg", "og-image-onesist.png"]:
        p = out / name
        print(name, Image.open(p).size, p.stat().st_size)


if __name__ == "__main__":
    main()
