"""WhatsApp header image for the AMC offer: 1200 x 628 (the 1.91:1 WhatsApp shows without cropping).

Drawn at 2x and scaled down so edges are smooth. Change the strings in CONFIG to make another offer.
"""
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CONFIG = {
    'pill': 'SPECIAL AMC OFFER',
    'big': '20% OFF',
    'sub': 'Annual CCTV Maintenance',
    'bullets': ['Scheduled check-up visits included', 'Priority repair support', 'Every camera stays recording'],
    'valid': 'Limited time offer',
    'phone': 'Call 9070149507',
    'brand': 'NETWORKING EXPERTS',
    'place': 'Srinagar, Kashmir',
}

S = 2
W, H = 1200 * S, 628 * S
BOLD = r'E:\service-app\server\fonts\NotoSans-Bold.ttf'
REG = r'E:\service-app\server\fonts\NotoSans-Regular.ttf'
font = lambda path, size: ImageFont.truetype(path, size * S)

GREEN = (34, 197, 94)
GREEN_D = (21, 160, 90)
WHITE = (255, 255, 255)
SOFT = (198, 224, 210)
GOLD = (255, 200, 60)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ── background: deep green, lit from the right ───────────────────────────
img = Image.new('RGB', (W, H))
px = img.load()
c1, c2 = (4, 26, 20), (10, 70, 50)
for y in range(H):
    for x in range(W):
        t = (x / W) * 0.7 + (y / H) * 0.3
        px[x, y] = lerp(c1, c2, t)

glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((W * 0.52, -H * 0.25, W * 1.15, H * 1.15), fill=(34, 197, 94, 70))
g.ellipse((W * 0.62, H * 0.05, W * 1.05, H * 0.95), fill=(34, 197, 94, 60))
glow = glow.filter(ImageFilter.GaussianBlur(90 * S))
img = Image.alpha_composite(img.convert('RGBA'), glow)

under = Image.new('RGBA', (W, H), (0, 0, 0, 0))
u = ImageDraw.Draw(under)
d = ImageDraw.Draw(img)

# faint grid of dots, top left, for texture
for gx in range(0, 14):
    for gy in range(0, 6):
        u.ellipse((60 * S + gx * 26 * S, 24 * S + gy * 26 * S, 60 * S + gx * 26 * S + 4 * S, 24 * S + gy * 26 * S + 4 * S), fill=(255, 255, 255, 40))

# ── camera illustration (right) ──────────────────────────────────────────
cx, cy = int(W * 0.78), int(H * 0.50)

# rings
for r, a in [(250, 26), (205, 40), (160, 60)]:
    u.ellipse((cx - r * S, cy - r * S, cx + r * S, cy + r * S), outline=(34, 197, 94, a), width=3 * S)

# shield behind the camera
shield = [(cx, cy - 215 * S), (cx + 150 * S, cy - 165 * S), (cx + 140 * S, cy + 60 * S), (cx, cy + 215 * S), (cx - 140 * S, cy + 60 * S), (cx - 150 * S, cy - 165 * S)]
u.polygon(shield, fill=(255, 255, 255, 26))
u.line(shield + [shield[0]], fill=(34, 197, 94, 200), width=4 * S)
img = Image.alpha_composite(img, under)
d = ImageDraw.Draw(img)

# ceiling plate
d.rounded_rectangle((cx - 120 * S, cy - 150 * S, cx + 120 * S, cy - 118 * S), radius=10 * S, fill=(226, 232, 240, 255))
d.rounded_rectangle((cx - 120 * S, cy - 130 * S, cx + 120 * S, cy - 118 * S), radius=6 * S, fill=(148, 163, 184, 255))
# dome body
d.pieslice((cx - 115 * S, cy - 170 * S, cx + 115 * S, cy + 60 * S), 0, 180, fill=(248, 250, 252, 255))
d.pieslice((cx - 115 * S, cy - 170 * S, cx + 115 * S, cy + 60 * S), 0, 180, outline=(203, 213, 225, 255), width=3 * S)
# smoked glass
d.ellipse((cx - 78 * S, cy - 110 * S, cx + 78 * S, cy + 46 * S), fill=(15, 23, 42, 255))
d.ellipse((cx - 78 * S, cy - 110 * S, cx + 78 * S, cy + 46 * S), outline=(51, 65, 85, 255), width=4 * S)
# lens
for r, col in [(50, (30, 41, 59)), (36, (15, 23, 42)), (22, (2, 6, 23))]:
    d.ellipse((cx - r * S, cy - 32 * S - r * S, cx + r * S, cy - 32 * S + r * S), fill=col + (255,))
d.ellipse((cx - 14 * S, cy - 32 * S - 14 * S, cx + 14 * S, cy - 32 * S + 14 * S), outline=(56, 189, 248, 200), width=2 * S)
d.ellipse((cx - 22 * S, cy - 56 * S, cx - 6 * S, cy - 42 * S), fill=(255, 255, 255, 200))  # glint
# recording dot
d.ellipse((cx + 84 * S, cy - 150 * S, cx + 98 * S, cy - 136 * S), fill=(239, 68, 68, 255))

# check badge, lower right of the camera
bx, by, br = cx + 110 * S, cy + 105 * S, 44 * S
d.ellipse((bx - br - 6 * S, by - br - 6 * S, bx + br + 6 * S, by + br + 6 * S), fill=(4, 26, 20, 255))
d.ellipse((bx - br, by - br, bx + br, by + br), fill=GREEN + (255,))
d.line([(bx - 20 * S, by + 2 * S), (bx - 6 * S, by + 16 * S), (bx + 22 * S, by - 14 * S)], fill=WHITE + (255,), width=9 * S, joint='curve')

# ── text (left) ──────────────────────────────────────────────────────────
left = 72 * S

# pill
pf = font(BOLD, 21)
pw = d.textlength(CONFIG['pill'], font=pf) + 44 * S
d.rounded_rectangle((left, 64 * S, left + pw, 64 * S + 46 * S), radius=23 * S, fill=GREEN + (255,))
d.text((left + 22 * S, 64 * S + 23 * S), CONFIG['pill'], font=pf, fill=(3, 30, 18, 255), anchor='lm')

# headline with a soft shadow
bf = font(BOLD, 128)
sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sh).text((left + 4 * S, 124 * S + 6 * S), CONFIG['big'], font=bf, fill=(0, 0, 0, 110))
img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(3 * S)))
d = ImageDraw.Draw(img)
d.text((left, 124 * S), CONFIG['big'], font=bf, fill=WHITE + (255,))

sf = font(BOLD, 38)
d.text((left + 2 * S, 282 * S), CONFIG['sub'], font=sf, fill=GREEN + (255,))
d.line([(left, 338 * S), (left + 120 * S, 338 * S)], fill=GOLD + (255,), width=5 * S)

# bullets
bl = font(REG, 27)
y = 362 * S
for text in CONFIG['bullets']:
    d.ellipse((left, y + 3 * S, left + 30 * S, y + 33 * S), fill=GREEN + (255,))
    d.line([(left + 8 * S, y + 18 * S), (left + 13 * S, y + 23 * S), (left + 23 * S, y + 11 * S)], fill=(3, 30, 18, 255), width=4 * S, joint='curve')
    d.text((left + 44 * S, y + 18 * S), text, font=bl, fill=WHITE + (255,), anchor='lm')
    y += 46 * S

# footer strip
d.rectangle((0, H - 92 * S, W, H), fill=(2, 14, 11, 235))
d.line([(0, H - 92 * S), (W, H - 92 * S)], fill=GREEN + (200,), width=3 * S)
d.text((left, H - 46 * S), CONFIG['brand'], font=font(BOLD, 27), fill=WHITE + (255,), anchor='lm')
d.text((left + d.textlength(CONFIG['brand'], font=font(BOLD, 27)) + 22 * S, H - 46 * S), CONFIG['place'], font=font(REG, 22), fill=SOFT + (255,), anchor='lm')

# phone button, right of the strip
pf2 = font(BOLD, 28)
label = CONFIG['phone']
tw = d.textlength(label, font=pf2)
bx0 = W - 72 * S - tw - 60 * S
d.rounded_rectangle((bx0, H - 78 * S, W - 72 * S, H - 14 * S), radius=32 * S, fill=GOLD + (255,))
d.text(((bx0 + W - 72 * S) / 2, H - 46 * S), label, font=pf2, fill=(40, 28, 0, 255), anchor='mm')

# validity tag over the shield
vf = font(BOLD, 20)
vt = CONFIG['valid'].upper()
vw = d.textlength(vt, font=vf) + 34 * S
d.rounded_rectangle((cx - vw / 2, 46 * S, cx + vw / 2, 46 * S + 40 * S), radius=20 * S, outline=GOLD + (255,), width=3 * S)
d.text((cx, 46 * S + 20 * S), vt, font=vf, fill=GOLD + (255,), anchor='mm')

out = img.convert('RGB').resize((1200, 628), Image.LANCZOS)
out.save(r'C:\Users\rizwa\AppData\Local\Temp\claude\E--service-app\afcfe5a1-caf7-4cfd-a4a6-a7cddb2d6e68\scratchpad\amc-offer.png', optimize=True)
out.save(r'C:\Users\rizwa\AppData\Local\Temp\claude\E--service-app\afcfe5a1-caf7-4cfd-a4a6-a7cddb2d6e68\scratchpad\amc-offer.jpg', quality=92, optimize=True)
print('saved', out.size)
