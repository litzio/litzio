"""Small manual figure/number PDF; run from the repository root."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors
from PIL import Image, ImageDraw
out = Path("tmp/docling-1382")
out.mkdir(parents=True, exist_ok=True)
for index in range(2):
    image = Image.new("RGB", (600, 170), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 35, 180, 135), fill=("#DBEAFE" if index == 0 else "#FCE7F3"), outline="#2563EB", width=4)
    draw.rectangle((410, 35, 570, 135), fill="#DCFCE7", outline="#16A34A", width=4)
    draw.line((180, 85, 410, 85), fill="#334155", width=6)
    draw.polygon([(410, 85), (385, 69), (385, 101)], fill="#334155")
    image.save(out / f"diagram-{index}.png")
c = canvas.Canvas(str(out / "acceptance.pdf"), pagesize=A4)
w, h = A4
c.setFont("Helvetica-Bold", 22)
c.drawString(48, h - 65, "Figure and table source numbers")
c.setFont("Helvetica", 11)
c.drawString(48, h - 95, "Preserve original images and numbers. Keep uncertain captions unchanged.")
t = Table([["Quarter", "Revenue", "Cost"], ["Q1", "120", "80"], ["Q2", "150", "90"]], colWidths=[150]*3, rowHeights=25)
t.setStyle(TableStyle([("GRID", (0,0), (-1,-1), 1, colors.black), ("BACKGROUND", (0,0), (-1,0), colors.lightgrey)]))
t.wrapOn(c, 450, 75)
t.drawOn(c, 48, h - 210)
c.drawCentredString(w/2, h - 230, "Table 2-1. Quarterly values")
for index, y, caption in [(0, 370, "Figure 6: Two connected stages"), (1, 140, "Figure IV: Unreadable source number")]:
    c.drawImage(str(out / f"diagram-{index}.png"), 73, y, width=450, height=127.5)
    c.setFont("Helvetica", 11)
    c.drawCentredString(w/2, y - 22, caption)
c.showPage()
c.save()
