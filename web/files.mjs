const asset = path => new URL(path, import.meta.url).href;
const mb = 1024 ** 2;

async function bytes(file, maxSize) {
  if (file.size > maxSize * mb) throw new Error(`O arquivo “${file.name}” excede ${maxSize} MB.`);
  return file.arrayBuffer();
}

export async function readWorkbook(file) {
  const xlsx = await import('xlsx');
  let workbook;
  try {
    workbook = xlsx.read(await bytes(file, 20), { type: 'array', cellFormula: false, cellHTML: false });
  } catch (cause) {
    if (cause.message.includes('excede')) throw cause;
    throw new Error('Não foi possível ler a planilha. Use um arquivo Excel .xlsx ou .xls.');
  }
  return {
    names: workbook.SheetNames,
    rows: name => {
      const sheet = workbook.Sheets[name];
      if (!sheet?.['!ref']) throw new Error('A aba selecionada está vazia.');
      const bounds = xlsx.utils.decode_range(sheet['!ref']);
      if (bounds.e.r - bounds.s.r >= 10000 || bounds.e.c - bounds.s.c >= 60) {
        throw new Error('A área usada da aba é grande demais. Mantenha até 60 colunas.');
      }
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: true })
        .map(row => row.map(cell => String(cell).trim()));
      if (!rows.length || rows.length > 600) throw new Error('Escolha uma aba com 1 a 600 linhas preenchidas.');
      return rows;
    }
  };
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function jpeg(source, maxSide = 2200) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const target = canvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
  const ctx = target.getContext('2d', { alpha: false });
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return target.toDataURL('image/jpeg', .92);
}

async function pdfDocument(file) {
  const pdf = await import('pdfjs-dist');
  pdf.GlobalWorkerOptions.workerSrc = asset('./pdf.worker.min.mjs');
  return pdf.getDocument({
    data: await bytes(file, 25),
    cMapUrl: asset('./cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: asset('./standard_fonts/'),
    isEvalSupported: false,
    canvasMaxAreaInBytes: 32000000
  }).promise;
}

async function pdfPage(pdf, number, maxSide) {
  const page = await pdf.getPage(number);
  try {
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxSide / Math.max(original.width, original.height) });
    const target = canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: target.getContext('2d', { alpha: false }), viewport }).promise;
    return target.toDataURL('image/jpeg', .92);
  } finally {
    page.cleanup();
  }
}

export async function readVisual(file, pickPage) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'pdf' || file.type === 'application/pdf') {
    const pdf = await pdfDocument(file);
    try {
      const page = pdf.numPages === 1 ? 1 : await pickPage(pdf.numPages, file.name);
      return page ? await pdfPage(pdf, page, 2200) : null;
    } finally {
      await pdf.destroy();
    }
  }
  if (['tif', 'tiff'].includes(extension) || file.type === 'image/tiff') {
    const { default: tiff } = await import('utif');
    const data = await bytes(file, 25);
    const pages = tiff.decode(data).filter(page => page.t256?.[0] && page.t257?.[0] && !(page.t254?.[0] & 1));
    if (!pages.length) throw new Error('Nenhuma página encontrada no TIFF.');
    const number = pages.length === 1 ? 1 : await pickPage(pages.length, file.name);
    if (!number) return null;
    const page = pages[number - 1];
    const [width, height] = [page.t256[0], page.t257[0]];
    if (width * height > 32_000_000) throw new Error('A página TIFF tem mais de 32 megapixels.');
    tiff.decodeImage(data, page);
    const source = canvas(width, height);
    const pixels = new Uint8ClampedArray(tiff.toRGBA8(page));
    source.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
    return jpeg(source);
  }
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension) &&
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Use JPEG, PNG, WebP, TIFF ou PDF.');
  }
  if (file.size > 25 * mb) throw new Error('Use uma imagem de até 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return jpeg(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readDrawingPdf(file) {
  const pdf = await pdfDocument(file);
  try {
    if (pdf.numPages > 8) throw new Error('O desenho de apoio deve ter até 8 páginas. Separe as vistas relevantes em outro PDF.');
    const views = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      views.push({ kind: 'PDF', label: `${file.name.slice(0, 240)} · página ${number}`, imageDataUrl: await pdfPage(pdf, number, 1800) });
    }
    return views;
  } finally {
    await pdf.destroy();
  }
}

async function blobData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function readStep(file) {
  const data = await bytes(file, 25);
  const worker = new Worker(asset('./step-worker.js'));
  let timeout;
  try {
    const projections = await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('O modelo STEP demorou demais para ser processado.')), 60000);
      worker.onmessage = ({ data: result }) => result.error ? reject(new Error(result.error)) : resolve(result);
      worker.onerror = () => reject(new Error('Não foi possível iniciar o leitor de STEP.'));
      worker.postMessage(data, [data]);
    });
    return Promise.all(projections.map(async ({ view, blob }) => ({
      kind: 'STEP', label: `${file.name.slice(0, 240)} · ${view}`, imageDataUrl: await blobData(blob)
    })));
  } finally {
    clearTimeout(timeout);
    worker.terminate();
  }
}
