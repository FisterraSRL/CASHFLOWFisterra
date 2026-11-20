"""Render the editable Fisterra user manual as a shareable PDF."""

from __future__ import annotations

import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "manual-usuario-cashflow-fisterra.md"
OUTPUT = ROOT / "output" / "pdf" / "manual-usuario-cashflow-fisterra.pdf"
NAVY = colors.HexColor("#0A2F44")
BLUE = colors.HexColor("#183B62")
RED = colors.HexColor("#ED1C24")
GREY = colors.HexColor("#5D6C7A")

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold")

body = ParagraphStyle("body", fontName="Arial", fontSize=9.4, leading=14.1, textColor=BLUE, spaceAfter=8)
h1 = ParagraphStyle("h1", parent=body, fontName="Arial-Bold", fontSize=22, leading=27, textColor=RED, spaceAfter=14)
h2 = ParagraphStyle("h2", parent=body, fontName="Arial-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=15, spaceAfter=7, keepWithNext=True)
h3 = ParagraphStyle("h3", parent=body, fontName="Arial-Bold", fontSize=10.6, leading=15, textColor=NAVY, spaceBefore=10, spaceAfter=5, keepWithNext=True)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=17, firstLineIndent=-11, spaceAfter=5)
numbered = ParagraphStyle("numbered", parent=body, leftIndent=18, firstLineIndent=-13, spaceAfter=5)


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


def page_frame(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(RED)
    canvas.rect(0, height - 8, width, 8, fill=1, stroke=0)
    canvas.setFont("Arial-Bold", 9)
    canvas.setFillColor(NAVY)
    canvas.drawString(46, height - 37, "FISTERRA  /  CASHFLOW")
    canvas.setStrokeColor(colors.HexColor("#CBD5DF"))
    canvas.line(46, height - 44, width - 46, height - 44)
    canvas.line(46, 40, width - 46, 40)
    canvas.setFont("Arial", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(46, 27, "Manual de uso  ·  v1.0.34  ·  20/11/2026")
    canvas.drawRightString(width - 46, 27, f"Página {doc.page}")
    canvas.restoreState()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story: list = []
    pending: list[str] = []
    for line in lines:
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
        str(OUTPUT), pagesize=A4, rightMargin=46, leftMargin=46,
        topMargin=59, bottomMargin=55, title="Manual de uso de Cashflow Fisterra",
        author="Fisterra", subject="Uso de Cashflow y administración de usuarios",
    )
    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    print(OUTPUT)


if __name__ == "__main__":
    main()
