"""Render the editable Fisterra user manual as a shareable PDF."""

from __future__ import annotations

import re
from functools import partial
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "manual-usuario-cashflow-fisterra.md"
OUTPUT_DIR = ROOT / "output" / "pdf"
NAVY = colors.HexColor("#0A2F44")
BLUE = colors.HexColor("#183B62")
RED = colors.HexColor("#ED1C24")
GREY = colors.HexColor("#5D6C7A")

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold")

body = ParagraphStyle("body", fontName="Arial", fontSize=9.4, leading=12.8, textColor=BLUE, spaceAfter=6)
h1 = ParagraphStyle("h1", parent=body, fontName="Arial-Bold", fontSize=22, leading=27, textColor=RED, spaceAfter=14)
h2 = ParagraphStyle("h2", parent=body, fontName="Arial-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=13, spaceAfter=6, keepWithNext=True)
h3 = ParagraphStyle("h3", parent=body, fontName="Arial-Bold", fontSize=10.6, leading=14, textColor=NAVY, spaceBefore=9, spaceAfter=5, keepWithNext=True)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=17, firstLineIndent=-11, spaceAfter=4)
numbered = ParagraphStyle("numbered", parent=body, leftIndent=18, firstLineIndent=-13, spaceAfter=4)


def inline(text: str) -> str:
    text = escape(text.strip())
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font color="#0A2F44"><b>\1</b></font>', text)
    text = re.sub(r"(https://[^\s<]+)", r'<link href="\1" color="#0A2F44"><u>\1</u></link>', text)
    return text


def add_paragraph(story: list, lines: list[str]) -> None:
    if lines:
        story.append(Paragraph(inline(" ".join(lines).replace("  ", " ")), body))
        lines.clear()


def page_frame(canvas, doc, *, installation: str, version: str) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(RED)
    canvas.rect(0, height - 8, width, 8, fill=1, stroke=0)
    canvas.setFont("Arial-Bold", 9)
    canvas.setFillColor(NAVY)
    canvas.drawString(46, height - 37, f"{installation.upper()}  /  CASHFLOW")
    canvas.setStrokeColor(colors.HexColor("#CBD5DF"))
    canvas.line(46, height - 44, width - 46, height - 44)
    canvas.line(46, 40, width - 46, 40)
    canvas.setFont("Arial", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(46, 27, f"Manual de uso  ·  v{version}")
    canvas.drawRightString(width - 46, 27, f"Página {doc.page}")
    canvas.restoreState()


def build_manual(markdown: str, installation: str, version: str) -> None:
    output = OUTPUT_DIR / f"manual-usuario-cashflow-{installation.lower()}.pdf"
    story: list = []
    pending: list[str] = []
    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped:
            add_paragraph(story, pending)
            continue
        if stripped.startswith("# "):
            add_paragraph(story, pending)
            story.append(Spacer(1, 15))
            story.append(Paragraph(inline(stripped[2:]), h1))
        elif stripped.startswith("## "):
            add_paragraph(story, pending)
            story.append(Paragraph(inline(stripped[3:]), h2))
        elif stripped.startswith("### "):
            add_paragraph(story, pending)
            story.append(Paragraph(inline(stripped[4:]), h3))
        elif stripped.startswith("- "):
            add_paragraph(story, pending)
            story.append(Paragraph("•  " + inline(stripped[2:]), bullet))
        elif re.match(r"^\d+\. ", stripped):
            add_paragraph(story, pending)
            match = re.match(r"^(\d+)\. (.*)", stripped)
            story.append(Paragraph(f"<b>{match.group(1)}.</b>  " + inline(match.group(2)), numbered))
        else:
            pending.append(stripped.rstrip(" "))
    add_paragraph(story, pending)
    doc = SimpleDocTemplate(
        str(output), pagesize=A4, rightMargin=46, leftMargin=46,
        topMargin=59, bottomMargin=55, title=f"Manual de uso de Cashflow {installation}",
        author=installation, subject="Uso de Cashflow y administración de usuarios",
    )
    frame = partial(page_frame, installation=installation, version=version)
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    print(output)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = SOURCE.read_text(encoding="utf-8")
    version_line = re.search(r"^\*\*Versión de la aplicación:\*\* (\d+\.\d+\.\d+)$", source, re.MULTILINE)
    if not version_line:
        raise ValueError("El manual debe indicar la versión de la aplicación.")
    version = version_line.group(1)
    build_manual(source, "Fisterra", version)
    nubiral = (source.replace("Cashflow Fisterra", "Cashflow Nubiral")
               .replace("https://cashflowfisterra.vercel.app/", "https://cashflownubiral.vercel.app/")
               .replace("Abrí la URL de Fisterra", "Abrí la URL de Nubiral"))
    build_manual(nubiral, "Nubiral", version)


if __name__ == "__main__":
    main()
