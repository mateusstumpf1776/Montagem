/* The workflow shares the catalog, drawing editor and document state with the original app. */
const filesModule = () => import('./files.js');
const studyViews = () => state.desenhos.flatMap(source => source.views.map(view => ({ ...view, sourceId: source.id })));
const pieceById = id => state.pecas.find(piece => piece.id === id);
const catalogName = piece => [piece.nome, piece.especificacao].filter(Boolean).join(', ');
const currentPages = () => [state.visaoGeral, ...orderedPages()].filter(Boolean);
const placed = (page, id) => page.chamadas.some(marker => marker.pecaId === id);
const missingParts = page => page.selectedPecaIds.filter(id => pieceById(id) && !placed(page, id));
const pageUnplaced = page => (page.calloutUncertainties || []).filter(item => missingParts(page).includes(item.partId));
const uniqueCallouts = page => [...new Map(page.chamadas.map(marker => [marker.pecaId, marker])).values()];
const sourceWarnings = page => pageUnplaced(page).map(({ partId, reason }) => {
  const piece = pieceById(partId);
  return `(${piece.chamada}) ${piece.nome}: ${reason}`;
});

let projectDatabase;
let calloutsRunning = false;

function openProjectDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB indisponível.'));
    const request = indexedDB.open('montagem-projects', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('Armazenamento indisponível.'));
  });
}

function storageFailure() {
  if (storageWarning) return;
  storageWarning = true;
  showToast('O navegador não conseguiu salvar o manual. Exporte um backup para preservar as alterações.', 'error');
}

function persistProject() {
  try {
    if (!projectDatabase) {
      localStorage.setItem('montagemXmlState', JSON.stringify(state));
      return;
    }
    const transaction = projectDatabase.transaction('projects', 'readwrite');
    transaction.onabort = storageFailure;
    transaction.objectStore('projects').put(state, 'active');
  } catch {
    storageFailure();
  }
}

async function initializeState() {
  const main = document.querySelector('main');
  main.inert = true;
  try {
    projectDatabase = await openProjectDatabase();
    const saved = await new Promise((resolve, reject) => {
      const request = projectDatabase.transaction('projects').objectStore('projects').get('active');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    load(saved);
    if (!saved) persistProject();
  } catch {
    projectDatabase = null;
    load();
  } finally {
    renderAll();
    main.inert = false;
    main.dataset.ready = 'true';
  }
}

function requestField(title, field, label) {
  const dialog = document.getElementById('inputDialog');
  if (dialog.open) return Promise.resolve(null);
  document.getElementById('inputDialogTitle').textContent = title;
  const body = document.getElementById('inputDialogBody');
  const caption = document.createElement('label');
  caption.className = 'field';
  caption.append(label, field);
  body.replaceChildren(caption);
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept' ? field.value : null), { once: true });
    dialog.showModal();
  });
}

async function choosePage(count, name) {
  const input = Object.assign(document.createElement('input'), { type: 'number', min: 1, max: count, value: 1, required: true });
  const result = await requestField(name, input, `Página da imagem (1 a ${count})`);
  return result ? Number(result) : null;
}

async function readImage(file) {
  const { readVisual } = await filesModule();
  return readVisual(file, choosePage);
}

async function readProcedureFiles(files) {
  const views = [];
  for (const file of files) {
    const image = await readImage(file);
    if (image) views.push({ title: file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'Imagem do procedimento', image });
  }
  return views;
}

async function postAssembly(path, payload, signal) {
  const url = new URL(getAiServer(), location.href);
  url.pathname = url.pathname.replace(/\/api\/analyze(?:-manual)?\/?$/, '/api/' + path);
  if (!url.pathname.endsWith('/api/' + path)) throw new Error('Configure o endereço do servidor na aba Revisar manual.');
  const body = JSON.stringify(payload);
  if (new Blob([body]).size > 30 * 1024 * 1024) throw new Error('Os dados excedem 30 MB. Reduza as imagens ou os arquivos de apoio.');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Não foi possível obter a resposta do servidor.');
  return result;
}

async function importExcel(file) {
  const button = document.getElementById('btnExcel');
  const status = document.getElementById('excelStatus');
  const review = document.getElementById('excelReview');
  const target = state;
  review.replaceChildren();
  button.disabled = true;
  status.textContent = 'Lendo a planilha…';
  try {
    const { readWorkbook } = await filesModule();
    const workbook = await readWorkbook(file);
    let sheet = workbook.names[0];
    if (workbook.names.length > 1) {
      const select = document.createElement('select');
      for (const name of workbook.names) select.add(new Option(name, name));
      sheet = await requestField('Aba da lista de peças', select, 'Aba do Excel');
    }
    if (!sheet) {
      status.textContent = 'Selecione uma aba para importar a lista.';
      return;
    }
    const rows = workbook.rows(sheet);
    status.textContent = 'Organizando a lista com a OpenAI…';
    const result = await postAssembly('import-parts', { sheet, rows }, AbortSignal.timeout(260000));
    if (state !== target) return;
    status.textContent = result.parts.length
      ? `${file.name} · ${sheet} · ${result.parts.length} tipos de peça`
      : 'A IA não identificou peças com quantidade válida nesta aba.';
    review.innerHTML = uncertaintiesHtml(result.warnings);
    if (!result.parts.length) return;
    const confirm = document.createElement('button');
    confirm.className = 'btn btn-primary';
    confirm.textContent = 'Adicionar ao catálogo';
    confirm.onclick = () => {
      if (state !== target) {
        review.replaceChildren();
        status.textContent = 'Selecione a planilha do manual atual.';
        return;
      }
      for (const part of result.parts) {
        const piece = {
          id: uid('p'), chamada: nextCatalogLetter(), nome: part.name, especificacao: part.specification,
          codigo: part.code, tipo: part.kind, qtd: part.quantity, torqueNm: null
        };
        appendCatalogPiece(piece);
      }
      review.replaceChildren();
      status.textContent = 'Peças adicionadas. Você pode corrigir nomes, medidas e quantidades no catálogo.';
      save();
      renderAll();
    };
    const list = document.createElement('div');
    list.className = 'import-preview';
    const used = new Set(state.pecas.map(piece => piece.chamada));
    let index = 0;
    const previewRows = result.parts.map(part => {
      while (used.has(calloutLetter(index))) index++;
      const letter = calloutLetter(index++);
      return `<tr><td>${letter}</td><td>${escapeHtml([part.name, part.specification].filter(Boolean).join(', '))}</td><td>${part.quantity}</td></tr>`;
    });
    list.innerHTML = '<table><thead><tr><th>Chamada</th><th>Nome</th><th>Quantidade</th></tr></thead><tbody>' + previewRows.join('') + '</tbody></table>';
    const actions = document.createElement('div');
    actions.className = 'workflow-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = 'Cancelar importação';
    cancel.onclick = () => {
      review.replaceChildren();
      status.textContent = 'Importação cancelada.';
    };
    actions.append(confirm, cancel);
    review.append(list, actions);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function appendCatalogPiece(piece) {
  state.pecas.push(piece);
  if (state.visaoGeral) {
    state.visaoGeral.selectedPecaIds.push(piece.id);
    state.visaoGeral.partUsage[piece.id] = piece.qtd;
  }
}

function renderReferences() {
  const file = document.getElementById('overviewFile');
  file.textContent = state.visaoGeral ? state.visaoGeral.fileName || 'Vista explodida importada' : '';
  const list = document.getElementById('referenceList');
  list.replaceChildren();
  for (const source of state.desenhos) {
    const row = document.createElement('div');
    row.className = 'reference-group';
    const title = document.createElement('strong');
    title.textContent = source.name;
    const remove = document.createElement('button');
    remove.className = 'btn btn-sm';
    remove.textContent = 'Remover';
    remove.setAttribute('aria-label', 'Remover ' + source.name);
    remove.onclick = () => {
      state.desenhos = state.desenhos.filter(item => item.id !== source.id);
      save();
      renderReferences();
      renderReadiness();
    };
    row.append(title, remove);
    list.append(row);
    source.views.forEach(view => {
      const card = document.createElement('button');
      card.className = 'reference-card';
      const image = new Image();
      image.src = view.imageDataUrl;
      image.alt = '';
      const caption = document.createElement('span');
      caption.textContent = view.label.split(' · ').at(-1);
      card.append(image, caption);
      card.onclick = () => {
        const dialog = document.getElementById('inputDialog');
        document.getElementById('inputDialogTitle').textContent = view.label;
        const enlarged = new Image();
        enlarged.src = view.imageDataUrl;
        enlarged.alt = view.label;
        document.getElementById('inputDialogBody').replaceChildren(enlarged);
        dialog.showModal();
      };
      list.append(card);
    });
  }
}

async function importReference(file, kind) {
  const target = state;
  const status = document.getElementById('referenceStatus');
  const buttons = ['btnStepFile', 'btnDrawingPdf'].map(id => document.getElementById(id));
  buttons.forEach(button => button.disabled = true);
  status.textContent = 'Preparando as vistas de apoio…';
  try {
    const files = await filesModule();
    const views = await (kind === 'PDF' ? files.readDrawingPdf(file) : files.readStep(file));
    if (state !== target) return;
    state.desenhos = [...state.desenhos.filter(item => item.kind !== kind), { id: uid('drawing'), name: file.name, kind, views }];
    save();
    renderReferences();
    renderReadiness();
    status.textContent = `${views.length} vista(s) disponíveis para a análise.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

async function importProcedureImages(files) {
  if (!files.length) return;
  const target = state;
  const status = document.getElementById('batchStatus');
  const button = document.getElementById('btnProcedureImages');
  button.disabled = true;
  status.textContent = 'Preparando as imagens…';
  try {
    if (state.passos.length + files.length > 23) throw new Error('Você pode importar até 23 imagens de procedimento por manual.');
    const images = await readProcedureFiles(files);
    if (state !== target || !images.length) return;
    if (state.passos.length + images.length > 23) throw new Error('Você pode importar até 23 imagens de procedimento por manual.');
    let firstBlock;
    for (const { image, title } of images) {
      const block = { id: uid('b'), titulo: title, orientacoes: '' };
      state.blocos.push(block);
      state.passos.push({ ...newPage(image, block.id), nome: title });
      firstBlock ||= block.id;
    }
    if (document.querySelector('nav .active').dataset.tab === 'montagem') selectBlock(firstBlock);
    save();
    renderCounts();
    renderBlocks();
    renderReadiness();
    status.textContent = `${images.length} bloco(s) criado(s). Selecione as peças visíveis de cada bloco.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    if (status.textContent === 'Preparando as imagens…') status.textContent = '';
  }
}

function renderCalloutStatus(page) {
  const button = document.getElementById('btnGenerateCallouts');
  button.disabled = calloutsRunning || analysisRunning || !page?.selectedPecaIds.length;
  const status = document.getElementById('calloutStatus');
  status.innerHTML = uncertaintiesHtml(page ? sourceWarnings(page) : []);
}

function calloutPayload(pages) {
  const overview = state.visaoGeral;
  const useOverview = overview && !pages.includes(overview);
  return {
    product: state.produtoFinalDescricao,
    title: state.titulo,
    drawings: studyViews(),
    overview: useOverview ? overview.imagemData : null,
    overviewMarkers: useOverview ? calloutsPayload(overview) : [],
    pages: pages.map(page => ({
      id: page.id,
      name: page.nome,
      imageDataUrl: page.imagemData,
      notes: page.aiPromptNotes || '',
      parts: selectedPartsPayload(page),
      existing: calloutsPayload(page),
      requested: missingParts(page)
    }))
  };
}

async function generateCalloutPages(pages, signal) {
  const targets = pages.filter(page => page && missingParts(page).length);
  if (!targets.length) return { markers: 0, pending: 0 };
  const project = state;
  const payload = calloutPayload(targets);
  const signature = JSON.stringify(payload);
  const result = await postAssembly('generate-callouts', payload, signal);
  if (state !== project || targets.some(page => !currentPages().includes(page)) ||
      JSON.stringify(calloutPayload(targets)) !== signature) {
    throw new Error('As imagens ou peças mudaram durante a análise. Gere as chamadas novamente.');
  }
  if (!Array.isArray(result.pages) || result.pages.length !== targets.length ||
      targets.some(page => !result.pages.some(output => output.pageId === page.id))) {
    throw new Error('O servidor devolveu chamadas incompletas.');
  }
  let markers = 0, pending = 0;
  for (const { pageId, markers: suggestions, unresolved } of result.pages) {
    const page = targets.find(item => item.id === pageId);
    page.chamadas.push(...suggestions.map(({ partId, ...point }) => normalizeCallout({ ...point, id: uid('c'), pecaId: partId })));
    page.calloutUncertainties = unresolved;
    markers += suggestions.length;
    pending += unresolved.length;
  }
  save();
  renderEditor();
  renderPreview();
  return { markers, pending };
}

async function generateCallouts(pages, status) {
  if (calloutsRunning || analysisRunning) return;
  if (!pages.some(page => page?.selectedPecaIds.length)) {
    showToast('Selecione as peças visíveis antes de gerar chamadas.', 'error');
    return;
  }
  calloutsRunning = true;
  const batch = document.getElementById('btnBatchCallouts');
  batch.disabled = true;
  renderCalloutStatus(currentStep());
  const buttons = ['btnGenerateDraft', 'btnGerarIA'].map(id => document.getElementById(id));
  buttons.forEach(button => button.disabled = true);
  const progress = document.getElementById('calloutProgress');
  const indicator = status === 'batch' ? document.getElementById('batchStatus') : progress;
  indicator.textContent = 'A IA está localizando as peças…';
  try {
    const { markers, pending } = await generateCalloutPages(pages, AbortSignal.timeout(260000));
    const message = markers || pending
      ? `${markers} chamada(s) adicionada(s) · ${pending} pendência(s) para conferir.`
      : 'As peças selecionadas já têm chamadas.';
    indicator.textContent = message;
    showToast(message, pending ? undefined : 'success');
  } catch (error) {
    indicator.textContent = error.message;
    showToast(error.message, 'error');
  } finally {
    calloutsRunning = false;
    batch.disabled = false;
    buttons.forEach(button => button.disabled = false);
    renderCalloutStatus(currentStep());
  }
}

async function downloadManualPdf() {
  if (!state.passos.length) {
    showToast('Adicione imagens ao procedimento antes de baixar o manual.', 'error');
    return;
  }
  const buttons = ['btnBaixarPdf', 'btnReviewPdf'].map(id => document.getElementById(id));
  const filename = nomeArquivoBase() + '.pdf';
  buttons.forEach(button => button.disabled = true);
  const figure = (page, withSteps = false) => {
    const labels = uniqueCallouts(page).map(marker => legendTextForCallout(page, marker));
    const steps = withSteps ? page.passos.map(step => ({ instruction: instrucaoTexto(step, page), note: step.obs || '' })) : [];
    const warnings = [...sourceWarnings(page), ...(page.aiAnalysis?.uncertainties || [])];
    if (withSteps && !steps.length && !warnings.length) warnings.push('Instruções deste bloco aguardam elaboração.');
    for (const partId of missingParts(page)) {
      if (!pageUnplaced(page).some(item => item.partId === partId)) warnings.push('Chamada por posicionar: ' + catalogName(pieceById(partId)) + '.');
    }
    return annotatedImageData(page).then(image => ({ image, labels, steps, warnings }));
  };
  try {
    const project = {
      title: state.titulo || 'Manual de montagem',
      product: state.produtoFinalDescricao,
      parts: state.pecas.map(piece => ({ letter: piece.chamada, name: catalogName(piece), quantity: piece.qtd })),
      overview: state.visaoGeral && figure(state.visaoGeral),
      summary: state.manualAnalysis?.summary,
      warnings: [...(state.manualAnalysis?.uncertainties || []), ...manualProblems()],
      blocks: state.blocos.map(block => ({
        title: block.titulo,
        summary: block.aiAnalysis?.summary,
        dependencies: (block.aiAnalysis?.dependencies || []).map(id => state.blocos.find(item => item.id === id)?.titulo || 'Procedimento removido'),
        warnings: block.aiAnalysis?.uncertainties || [],
        pages: Promise.all(blockPages(block.id).map(page => figure(page, true)))
      }))
    };
    if (state.manualAnalysis && state.manualAnalysis.signature !== manualSignature(manualPayload())) {
      project.warnings.push('Dados alterados após a última análise. Confira as instruções com as imagens atuais.');
    }
    const [{ manualPdf }, overview, blocks] = await Promise.all([
      import('./pdf-output.js'),
      project.overview,
      Promise.all(project.blocks.map(async block => ({ ...block, pages: await block.pages })))
    ]);
    downloadBlob(manualPdf({ ...project, overview, blocks }), filename);
  } catch (error) {
    showToast('Não foi possível preparar o PDF. ' + error.message, 'error');
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

function initializeWorkflow() {
  for (const button of document.querySelectorAll('[data-go]')) {
    button.onclick = () => document.querySelector(`nav [data-tab="${button.dataset.go}"]`).click();
  }
  const bindFile = (button, input, action, multiple = false) => {
    const field = document.getElementById(input);
    document.getElementById(button).onclick = () => field.click();
    field.onchange = () => {
      const files = [...field.files];
      field.value = '';
      if (files.length) action(multiple ? files : files[0]);
    };
  };
  bindFile('btnExcel', 'excelInput', importExcel);
  bindFile('btnStepFile', 'stepFile', file => importReference(file, 'STEP'));
  bindFile('btnDrawingPdf', 'drawingPdf', file => importReference(file, 'PDF'));
  bindFile('btnProcedureImages', 'procedureImages', importProcedureImages, true);
  document.getElementById('btnGenerateCallouts').onclick = () => {
    const page = currentStep();
    if (page) generateCallouts([page], 'current');
  };
  document.getElementById('btnBatchCallouts').onclick = () => generateCallouts(currentPages(), 'batch');
}

function editPiece(id) {
  const piece = pieceById(id);
  const project = state;
  const dialog = document.getElementById('inputDialog');
  if (!piece || dialog.open) return;
  document.getElementById('inputDialogTitle').textContent = 'Editar peça ' + piece.chamada;
  const body = document.getElementById('inputDialogBody');
  body.replaceChildren();
  const addField = (label, type, value) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    const input = Object.assign(document.createElement('input'), { id: 'edit-piece-' + body.children.length, type, value });
    const caption = Object.assign(document.createElement('label'), { htmlFor: input.id, textContent: label });
    wrapper.append(caption, input);
    body.append(wrapper);
    return input;
  };
  const name = addField('Nome', 'text', piece.nome);
  name.required = true;
  name.maxLength = 300;
  name.oninput = () => name.setCustomValidity(name.value.trim() ? '' : 'Informe o nome da peça.');
  const specification = addField('Medidas e especificações', 'text', piece.especificacao || '');
  specification.maxLength = 300;
  const quantity = addField('Quantidade', 'number', piece.qtd);
  quantity.required = true;
  quantity.min = 1;
  quantity.max = Number.MAX_SAFE_INTEGER;

  dialog.returnValue = '';
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'accept' || state !== project || !pieceById(id)) return;
    piece.nome = name.value.trim();
    piece.especificacao = specification.value.trim();
    piece.qtd = quantity.valueAsNumber;
    for (const page of currentPages()) {
      if (!page.selectedPecaIds.includes(id)) continue;
      page.partUsage[id] = page === state.visaoGeral ? piece.qtd : Math.min(piece.qtd, page.partUsage[id] || 1);
    }
    save();
    renderAll();
  }, { once: true });
  dialog.showModal();
}
