"""Manual acceptance PDF: run from the repository root with ReportLab and Pillow."""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors
from PIL import Image, ImageDraw
from pathlib import Path
out=Path('tmp/docling-1368'); out.mkdir(parents=True, exist_ok=True); image=Image.new('RGB',(500,170),'white'); d=ImageDraw.Draw(image)
d.rectangle((20,40,145,130),fill='#DBEAFE',outline='#2563EB',width=3);d.rectangle((350,40,475,130),fill='#DCFCE7',outline='#16A34A',width=3);d.line((145,85,350,85),fill='#334155',width=5);d.polygon([(350,85),(330,73),(330,97)],fill='#334155'); image.save(out/'diagram.png')
c=canvas.Canvas(str(out/'acceptance.pdf'),pagesize=A4);w,h=A4
for page in range(1,2):
 c.setFont('Helvetica',9); c.drawString(48,h-25,'CONVERSION ACCEPTANCE / RUNNING HEADER'); c.drawRightString(w-48,24,f'Page {page}')
 if page==1:
  c.setFont('Helvetica-Bold',22); c.drawString(48,h-65,'Conversion acceptance')
  c.setFont('Helvetica',11); c.drawString(48,h-92,'A small source document for structural conversion and explicit losses.')
  c.setFont('Helvetica-Bold',14);c.drawString(48,h-130,'1. Data table')
  t=Table([['Quarter','Revenue','Cost'],['Q1','120','80'],['Q2','150','90']],colWidths=[150,150,150],rowHeights=25);t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),1,colors.black),('BACKGROUND',(0,0),(-1,0),colors.lightgrey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]));t.wrapOn(c,450,75);t.drawOn(c,48,h-225)
  c.setFont('Helvetica-Bold',14);c.drawString(48,h-265,'2. Procedure')
  c.setFont('Helvetica',11)
  for i,text in enumerate(['1. Read the original document.','2. Convert without modifying the source.','3. Inspect the generated document.']): c.drawString(60,h-290-i*20,text)
  c.setFont('Helvetica-Bold',14);c.drawString(48,h-375,'3. Code')
  c.setFillColor(colors.HexColor('#F1F5F9'));c.rect(48,h-460,450,65,fill=1,stroke=0);c.setFillColor(colors.black);c.setFont('Courier',12)
  for i,text in enumerate(['def square(x):','    return x * x','print(square(3))']):c.drawString(60,h-415-i*17,text)
  c.setFont('Helvetica-Bold',14);c.drawString(48,h-505,'4. Equation');c.setFont('Times-Italic',24);c.drawString(150,h-540,'x ='); c.drawString(215,h-528,'-b ±'); c.drawString(285,h-528,'(b² - 4ac)'); c.line(210,h-534,410,h-534); c.drawString(290,h-560,'2a')
  c.drawImage(str(out/'diagram.png'),100,100,width=375,height=127.5)
  c.setFont('Helvetica',11);c.drawCentredString(w/2,80,'Figure 1: Two connected stages in the conversion pipeline.')
 else:
  c.setFont('Helvetica-Bold',18); c.drawString(48,h-70,f'{page}. Supporting notes')
  c.setFont('Helvetica',12);c.drawString(48,h-105,'The repeated running header and page footer are furniture.')
  c.drawString(48,h-130,'The original PDF and embedded picture data remain in the archive.')
 c.showPage()
c.save()
