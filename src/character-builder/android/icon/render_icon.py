"""Renders the launcher foreground (108 dp adaptive-icon canvas at 6 px per dp).

Run from this folder: python render_icon.py
Needs PyMuPDF and Pillow.
"""
import re
import fitz
from PIL import Image

SCALE = 6
SIZE = 108 * SCALE
BRASS = "#D9AE55"
COG_DP = 68      # cog tip to tip; the visible launcher window is 72 dp

svg = re.sub(r'<path d="M0 0h512v512H0z"/>', "", open("cog.svg").read()).replace("#fff", BRASS)
open("_cog_brass.svg", "w").write(svg)
page = fitz.open("_cog_brass.svg")[0]

render_px = 4 * COG_DP * SCALE
zoom = render_px / page.rect.width
pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
cog = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
cog = cog.crop(cog.getbbox()).resize((COG_DP * SCALE, COG_DP * SCALE), Image.LANCZOS)

canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
canvas.paste(cog, ((SIZE - cog.width) // 2, (SIZE - cog.height) // 2), cog)
canvas.save("../src/main/res/drawable-nodpi/ic_launcher_foreground.png")
