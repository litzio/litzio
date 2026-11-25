"""Generate the three synthetic visual fixtures. Requires Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


root = Path(__file__).with_name("fixtures")
root.mkdir(exist_ok=True)

formula = Image.new("RGB", (420, 170), "white")
ink = ImageDraw.Draw(formula)
font = ImageFont.load_default(38)
ink.text((139, 85), "u =", font=font, anchor="rm", fill="black")
ink.text((240, 55), "3r + 7", font=font, anchor="mm", fill="black")
ink.line((174, 85, 306, 85), fill="black", width=3)
ink.text((240, 116), "2s - 5", font=font, anchor="mm", fill="black")
formula.save(root / "formula.png")

sample = Image.new("RGB", (420, 230), "white")
ink = ImageDraw.Draw(sample)
ink.ellipse((42, 56, 158, 172), fill="#2265dc")
ink.polygon(((302, 53), (232, 174), (372, 174)), fill="#f08822")
sample.save(root / "sample.png")

grid = Image.new("RGB", (360, 205), "white")
ink = ImageDraw.Draw(grid)
font = ImageFont.load_default(25)
ink.rectangle((15, 14, 345, 190), outline="black", width=2)
ink.line((190, 14, 190, 190), fill="black", width=2)
for index, (item, count) in enumerate((("Item", "Quantity"), ("Gamma", "52"), ("Delta", "46"), ("Omega", "19"))):
    top = 14 + index * 44
    ink.line((15, top, 345, top), fill="black", width=2)
    ink.text((30, top + 23), item, font=font, anchor="lm", fill="black")
    ink.text((222, top + 23), count, font=font, anchor="lm", fill="black")
grid.save(root / "grid.png")
