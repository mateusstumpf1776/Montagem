import { jsPDF } from 'jspdf';

export function manualPdf({ title, product, parts, overview, summary, warnings, blocks }) {
  const pdf = new jsPDF({ format: 'a4', unit: 'mm', compress: true });
  const margin = 17, width = 176, bottom = 273;
  const ink = '#1B2740', blue = '#214EA5', muted = '#4A5670';
  let y = 19;
  pdf.setProperties({ title, subject: 'Instruções de montagem' });

  function reserve(height) {
    if (y + height <= bottom) return;
    pdf.addPage();
    y = 19;
  }

  function paragraph(value, { size = 11, bold = false, color = ink, indent = 0, gap = 2 } = {}) {
    if (!value) return;
    const lineHeight = size * .43;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    for (const line of pdf.splitTextToSize(value, width - indent)) {
      reserve(lineHeight);
      pdf.text(line, margin + indent, y + size * .32);
      y += lineHeight;
    }
    y += gap;
  }

  function heading(value, size = 16) {
    if (!value) return;
    reserve(20);
    paragraph(value, { size, bold: true, color: blue, gap: 3 });
  }

  function figure({ image, labels }) {
    const { width: pixelsWide, height: pixelsHigh } = pdf.getImageProperties(image);
    const scale = Math.min(width / pixelsWide, 135 / pixelsHigh);
    const imageWidth = pixelsWide * scale;
    const imageHeight = pixelsHigh * scale;
    reserve(imageHeight + 9 + Math.min(labels.length, 3) * 5);
    pdf.addImage(image, 'PNG', margin + (width - imageWidth) / 2, y, imageWidth, imageHeight);
    y += imageHeight + 3;
    labels.forEach(label => paragraph(label, { size: 10, color: muted, gap: .4 }));
    y += 5;
  }

  function pending(items) {
    for (const item of items) paragraph('Pendência: ' + item, { color: '#8A3E17', size: 10 });
  }

  function catalogHeader() {
    reserve(10);
    pdf.setFillColor('#E7EDF9');
    pdf.rect(margin, y, width, 8, 'F');
    pdf.setTextColor(ink);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Chamada', margin + 3, y + 5.3);
    pdf.text('Nome', margin + 31, y + 5.3);
    pdf.text('Quantidade', margin + width - 3, y + 5.3, { align: 'right' });
    y += 8;
  }

  paragraph(title, { size: 24, bold: true, gap: 5 });
  paragraph(product, { color: muted, gap: 5 });
  heading('Lista de peças');
  if (parts.length) {
    catalogHeader();
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    for (const part of parts) {
      const lines = pdf.splitTextToSize(part.name, width - 66);
      let firstLine = true;
      for (const line of lines) {
        if (y + 7 > bottom) {
          reserve(7);
          catalogHeader();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
        }
        if (firstLine) {
          pdf.text(part.letter, margin + 3, y + 4.8);
          pdf.text(String(part.quantity), margin + width - 3, y + 4.8, { align: 'right' });
        }
        pdf.text(line, margin + 31, y + 4.8);
        y += 5;
        firstLine = false;
      }
      y += 2;
      pdf.setDrawColor('#DBE1EC');
      pdf.line(margin, y, margin + width, y);
    }
  }
  y += 7;

  if (overview) {
    reserve(27);
    heading('Vista explodida');
    figure(overview);
    pending(overview.warnings);
  }
  paragraph(summary);
  pending(warnings);

  blocks.forEach((block, index) => {
    y += 6;
    heading(`${index + 1}. ${block.title}`);
    paragraph(block.summary);
    if (block.dependencies.length) paragraph('Pré-requisitos: ' + block.dependencies.join(', '), { color: muted });
    pending(block.warnings);
    let number = 0;
    for (const page of block.pages) {
      figure(page);
      for (const { instruction, note } of page.steps) {
        paragraph(`${++number}. ${instruction}`);
        if (note) paragraph('NOTA: ' + note, { color: muted, indent: 5 });
      }
      pending(page.warnings);
    }
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor('#DBE1EC');
    pdf.line(margin, 280, margin + width, 280);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(muted);
    pdf.text('Manual de montagem', margin, 286);
    pdf.text(`${page} / ${pages}`, margin + width, 286, { align: 'right' });
  }
  return pdf.output('blob');
}
