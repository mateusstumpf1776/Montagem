// Real Chromium + real backend + local OpenAI mock. No paid API calls.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import * as xlsx from 'xlsx';
import {jsPDF} from 'jspdf';
import tiff from 'utif';
const root=new URL('../',import.meta.url);let calls=0,mode='ok',lastRequest,release;
const mock=http.createServer(async(req,res)=>{
 let raw='';for await(const c of req)raw+=c;lastRequest=JSON.parse(raw);calls++;
 const format=lastRequest.text.format.name;
 const respond=result=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'mock',object:'response',status:'completed',output:[{id:'msg',type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result),annotations:[]}]}]}));};
 if(format==='assembly_catalog'){
   const { sheet, rows }=JSON.parse(lastRequest.input[0].content[0].text);
   assert.equal(sheet,'Lista');
   assert.deepEqual(rows[1],['Base','500 × 300 mm','2']);
   return respond({parts:[
     {name:'Base',specification:'500 × 300 mm',code:'',kind:'peca',entries:[{row:1,quantityColumn:2},{row:2,quantityColumn:2}]},
     {name:'Parafuso',specification:'M6×30',code:'',kind:'parafuso',entries:[{row:3,quantityColumn:2}]}
   ],warnings:[]});
 }
 if(format==='assembly_callouts'){
   assert.match(lastRequest.instructions,/review-3d-part-drawings/);
   const markers=lastRequest.input[0].content.filter(item=>item.text?.startsWith('Imagem de destino'));
   const pages=markers.map(item=>{
     const page=JSON.parse(item.text.slice(item.text.indexOf('{')));
     const partIds=page.requested;
     const shown=page.name==='Fechar fundo' ? partIds.filter(id=>page.parts.find(part=>part.id===id).tipo!=='parafuso') : partIds;
     return {pageId:page.id,markers:shown.map((partId,i)=>({partId,x:22+i*42,y:24,tipX:37+i*40,tipY:41})),
       unresolved:partIds.filter(id=>!shown.includes(id)).map(partId=>({partId,reason:'Cabeça do fixador ocultada na vista.'}))};
   });
   return respond({pages});
 }
 if(mode==='delay')await new Promise(resolve=>release=resolve);
 if(mode==='auth'){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Incorrect key LOCAL-TEST-SECRET',type:'invalid_request_error',code:'invalid_api_key'}}));return;}
 const blocks=JSON.parse(lastRequest.input[0].content[0].text.split('BLOCOS NA ORDEM DO AUTOR:\n')[1]);
 const result={summary:'Leitura do conjunto',uncertainties:['Confirmar apoio da base.'],blocks:blocks.map((b,n)=>({blockId:b.id,summary:b.title,dependencies:n?[blocks[0].id]:[],uncertainties:[],pages:b.pages.map(p=>({pageId:p.id,summary:'Vista contextualizada',uncertainties:[],steps:[{instruction:'Posicione '+p.parts[0].nome+' ('+p.parts[0].chamada+').',activity:'outro',partIds:[p.parts[0].id],hardwareIds:[],calloutIds:[p.callouts[0].id],confidence:'alta',notes:'Confira o alinhamento <antes> de continuar.'}]}))}))};
 if(mode==='incomplete')result.blocks.pop();respond(result);
});mock.listen(0,'127.0.0.1');await once(mock,'listening');
const child=spawn(process.execPath,['server-openai.mjs'],{cwd:root,env:{...process.env,PORT:'0',OPENAI_API_KEY:'local-test-only',MONTAGEM_API_KEY:'',OPENAI_BASE_URL:`http://127.0.0.1:${mock.address().port}/v1`,NODE_USE_ENV_PROXY:'0'}});
const apiPort=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Backend start timeout')),8000);child.stdout.on('data',x=>{const m=String(x).match(/localhost:(\d+)/);if(m){clearTimeout(t);resolve(Number(m[1]));}});child.once('exit',x=>{clearTimeout(t);reject(Error('Backend exit '+x));});});
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.goto(`http://127.0.0.1:${apiPort}`,{waitUntil:'domcontentloaded'});await page.locator('#manualTitulo').fill('Manual por blocos');
 for(const [nome,letra]of[['Base','K'],['Tampa','A']]){await page.locator('#pecaNome').fill(nome);await page.locator('#pecaChamada').fill(letra);await page.locator('#btnAddPeca').click();}
 const pieces=await page.evaluate(()=>state.pecas.map(p=>({id:p.id,chamada:p.chamada})));assert.deepEqual(pieces.map(p=>p.chamada),['K','A']);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=350;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,350);x.fillStyle='#5577aa';x.fillRect(80,80,180,150);x.fillStyle='#aa8855';x.fillRect(350,100,150,140);return c.toDataURL('image/png').split(',')[1];});const file={name:'kit.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
 await page.locator('[data-tab="visao"]').click();await page.locator('#generalImageInput').setInputFiles(file);await page.locator('#stageImg').waitFor();await page.locator('#btnToggleMarkerMode').click();
 async function mark(pid,n=0){await page.locator('#stageImg').click({position:{x:75+n*95,y:90}});await page.locator('.chamada-peca-select').last().selectOption(pid);await page.waitForFunction(()=>document.querySelectorAll('#stageCalloutLayer .callout-label').length===currentStep().chamadas.length);}
 await mark(pieces[0].id);await mark(pieces[1].id,1);assert.deepEqual(await page.locator('#stageCalloutLayer .callout-label').allTextContents(),['K','A']);
 await page.locator('[data-tab="montagem"]').click();await page.getByText('Adicionar um bloco vazio').click();for(const t of['Preparar a base','Fechar o conjunto']){await page.locator('#blockTitle').fill(t);await page.locator('#blockForm button').click();}
 const blocks=await page.evaluate(()=>state.blocos.map(b=>b.id));
 for(let n=0;n<2;n++){await page.locator(`[data-block="${blocks[n]}"]`).click();await page.locator('#imageInput').setInputFiles(n===0?[file,{...file,name:'detalhe.png'}]:file);await page.waitForFunction(count=>blockPages(state.currentBlockId).length===count,n===0?2:1);const ids=await page.evaluate(()=>blockPages(state.currentBlockId).map(p=>p.id));for(const id of ids){await page.locator(`.step-thumb[onclick="selectStep('${id}')"]`).click();await page.locator(`.visible-part-check[data-pid="${pieces[n].id}"]`).check();await mark(pieces[n].id);assert.deepEqual(await page.locator('#stageCalloutLayer .callout-label').allTextContents(),[pieces[n].chamada]);}await page.locator('#blockNotes').fill('Orientações do procedimento '+n);}
 await page.locator('[data-tab="preview"]').click();assert.match(await page.locator('#manualReadiness').innerText(),/Pronto para analisar/);await page.locator('#aiServerInput').fill(`http://127.0.0.1:${apiPort}/api/analyze`);await page.locator('#btnSalvarAiServer').click();await page.locator('#btnGerarIA').click();await page.waitForFunction(()=>!!state.manualAnalysis);
 assert.equal(calls,1);assert.equal(lastRequest.reasoning.effort,'high');assert.equal(lastRequest.input[0].content.filter(x=>x.type==='input_image').length,4);assert.equal(await page.locator('[data-instruction]').count(),3);assert.deepEqual(await page.locator('.manual-block-heading').allTextContents(),['1. Preparar a base','2. Fechar o conjunto']);
 await page.locator('[data-instruction]').first().fill('Alinhe a base (K) com cuidado.');await page.locator('[data-note]').first().fill('Nota editada pelo autor.');await page.locator('[data-global-summary]').fill('Resumo revisado.');await page.locator('[data-block-summary]').first().fill('Conferir o apoio da base.');
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('main[data-ready]').waitFor();await page.locator('[data-tab="preview"]').click();assert.equal(await page.locator('[data-instruction]').first().innerText(),'Alinhe a base (K) com cuidado.');assert.equal(await page.locator('[data-global-summary]').innerText(),'Resumo revisado.');
 for(const failure of['incomplete','auth']){mode=failure;await page.locator('#btnGerarIA').click();await page.locator('#confirmOk').click();await page.waitForFunction(()=>!analysisRunning);assert.equal(await page.locator('[data-instruction]').first().innerText(),'Alinhe a base (K) com cuidado.');}assert.ok(!(await page.locator('body').innerText()).includes('LOCAL-TEST-SECRET'));
 mode='delay';const before=calls;await page.locator('#btnGerarIA').click();await page.locator('#confirmOk').click();while(calls===before)await new Promise(r=>setTimeout(r,10));await page.locator('#manualTitulo').fill('Alterado durante análise');release();await page.waitForFunction(()=>!analysisRunning);assert.match(await page.locator('#previewStatus').innerText(),/mudou durante a análise/);
 await page.locator('[data-tab="exportar"]').click();const xml=await page.evaluate(()=>buildXml());const parsed=await page.evaluate(xml=>{const d=new DOMParser().parseFromString(xml,'application/xml');return {error:!!d.querySelector('parsererror'),pages:d.querySelectorAll('paginas > pagina').length,blocks:d.querySelectorAll('blocos > bloco').length,calls:[...d.querySelectorAll('visaoGeral > chamada')].map(c=>c.getAttribute('letra'))};},xml);assert.deepEqual(parsed,{error:false,pages:3,blocks:2,calls:['K','A']});
 const wordEvent=page.waitForEvent('download');await page.locator('#btnBaixarWord').click();const word=await readFile(await(await wordEvent).path(),'utf8');assert.ok(word.includes('Nota editada pelo autor.')&&word.includes('Fechar o conjunto')&&!word.includes('<svg'));
 await page.locator('[data-tab="montagem"]').click();await page.locator(`[data-move-block="${blocks[1]}"][data-delta="-1"]`).click();await page.locator('[data-tab="preview"]').click();assert.deepEqual(await page.locator('.manual-block-heading').allTextContents(),['1. Fechar o conjunto','2. Preparar a base']);assert.match(await page.locator('#manualReadiness').innerText(),/dados mudaram/i);assert.equal(calls,before+1);
 await page.emulateMedia({media:'print'});assert.ok((await page.pdf({format:'A4'})).byteLength>10000);await page.emulateMedia({media:'screen'});
 const backupEvent=page.waitForEvent('download');await page.locator('#btnExportJson').click();const backup=await readFile(await(await backupEvent).path());await page.locator('[data-tab="montagem"]').click();await page.locator(`[data-remove-block="${blocks[0]}"]`).click();await page.locator('#confirmOk').click();assert.equal(await page.evaluate(()=>state.passos.length),1);await page.locator('#importInput').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});await page.locator('#confirmOk').click();assert.equal(await page.evaluate(()=>state.passos.length),3);
 const legacy={titulo:'Antigo',pecas:[{id:'old1',nome:'Base',tipo:'peca',qtd:1},{id:'old2',nome:'Tampa',tipo:'peca',qtd:1}],passos:[{id:'oldpage',nome:'Vista',imagemData:'data:image/png;base64,'+png,selectedPecaIds:['old1','old2'],partUsage:{old1:1,old2:1},chamadas:[{id:'oc1',pecaId:'old2',x:20,y:20},{id:'oc2',pecaId:'old1',x:60,y:60}],passos:[{id:'op1',descricaoIA:'Posicione a tampa (A) sobre a base (B).',chamadaIds:['oc1','oc2'],atividade:'outro'}]}]};await page.locator('#importInput').setInputFiles({name:'antigo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.locator('#confirmOk').click();assert.equal(await page.evaluate(()=>state.blocos.length),1);assert.equal(await page.evaluate(()=>state.passos[0].passos[0].descricaoIA),'Posicione a tampa (B) sobre a base (A).');
 assert.deepEqual(errors,[]);
 console.log('PASS: fluxo anterior, erros, resposta atrasada, exportações e migração.');

 mode='ok';
 const fresh=await browser.newPage({viewport:{width:1500,height:1000}});
 fresh.on('pageerror',error=>errors.push(error.message));
 await fresh.goto(`http://127.0.0.1:${apiPort}`);
 await fresh.locator('main[data-ready]').waitFor();
 await fresh.locator('#manualTitulo').fill('Armário Ipê');

 const workbook=xlsx.utils.book_new();
 xlsx.utils.book_append_sheet(workbook,xlsx.utils.aoa_to_sheet([['Instruções']]),'Capa');
 xlsx.utils.book_append_sheet(workbook,xlsx.utils.aoa_to_sheet([
   ['Peça','Medidas','Quantidade'],['Base','500 × 300 mm',2],['Base','500 × 300 mm',1],['Parafuso','M6×30',8]
 ]),'Lista');
 await fresh.locator('#excelInput').setInputFiles({
   name:'catalogo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   buffer:xlsx.write(workbook,{bookType:'xlsx',type:'buffer'})
 });
 await fresh.getByLabel('Aba do Excel').selectOption('Lista');
 await fresh.locator('#inputDialog').getByRole('button',{name:'Confirmar'}).click();
 await fresh.getByRole('button',{name:'Adicionar ao catálogo'}).click();
 assert.deepEqual(await fresh.evaluate(()=>state.pecas.map(({chamada,nome,qtd})=>[chamada,nome,qtd])),[['A','Base',3],['B','Parafuso',8]]);
 await fresh.getByRole('button',{name:'Editar peça A'}).click();
 await fresh.getByLabel('Medidas e especificações',{exact:true}).fill('510 × 300 mm');
 await fresh.locator('#inputDialog').getByRole('button',{name:'Confirmar'}).click();
 await fresh.locator('#pecasTableWrap').getByText('Base, 510 × 300 mm',{exact:true}).waitFor();

 const drawing=new jsPDF();
 drawing.text('Vista frontal',20,20);
 drawing.rect(20,40,100,60);
 drawing.addPage();
 drawing.text('Vista lateral',20,20);
 drawing.rect(20,40,60,100);
 const pdfInput={name:'vistas.pdf',mimeType:'application/pdf',buffer:Buffer.from(drawing.output('arraybuffer'))};
 await fresh.locator('[data-tab="visao"]').click();
 await fresh.locator('#generalImageInput').setInputFiles(pdfInput);
 await fresh.getByLabel('Página da imagem (1 a 2)').fill('2');
 await fresh.locator('#inputDialog').getByRole('button',{name:'Confirmar'}).click();
 await fresh.locator('#stageImg').waitFor();
 await fresh.locator('#drawingPdf').setInputFiles(pdfInput);
 await fresh.waitForFunction(()=>state.desenhos.some(source=>source.kind==='PDF'&&source.views.length===2));
 const step=await readFile(new URL('node_modules/occt-import-js/test/testfiles/simple-basic-cube/cube.stp',root));
 await fresh.locator('#stepFile').setInputFiles({name:'modelo.stp',mimeType:'application/octet-stream',buffer:step});
 await fresh.waitForFunction(()=>state.desenhos.some(source=>source.kind==='STEP'&&source.views.length===3));
 assert.equal(await fresh.locator('.reference-card').count(),5);

 await fresh.locator('#btnGenerateCallouts').click();
 await fresh.waitForFunction(()=>state.visaoGeral.chamadas.length===2);
 assert.equal(lastRequest.input[0].content.filter(item=>item.type==='input_image').length,6);
 const previousX=await fresh.evaluate(()=>state.visaoGeral.chamadas[0].x);
 const marker=await fresh.locator('#stageCalloutLayer [data-role="circle"]').first().boundingBox();
 const x=marker.x+marker.width/2,y=marker.y+marker.height/2;
 await fresh.mouse.move(x,y);await fresh.mouse.down();await fresh.mouse.move(x+30,y+15);await fresh.mouse.up();
 assert.notEqual(await fresh.evaluate(()=>state.visaoGeral.chamadas[0].x),previousX);

 const pixels=new Uint8Array(40*32*4).fill(170);
 const imageTiff={name:'Fechar fundo.tif',mimeType:'image/tiff',buffer:Buffer.from(tiff.encodeImage(pixels.buffer,40,32))};
 await fresh.locator('[data-tab="montagem"]').click();
 await fresh.locator('#procedureImages').setInputFiles([{...file,name:'Preparar base.png'},imageTiff]);
 await fresh.waitForFunction(()=>state.blocos.length===2);
 const newParts=await fresh.evaluate(()=>state.pecas.map(piece=>piece.id));
 const procedures=await fresh.evaluate(()=>state.blocos.map(block=>block.id));
 for(const id of procedures){
   await fresh.locator(`[data-block="${id}"]`).click();
   await fresh.locator(`.visible-part-check[data-pid="${newParts[0]}"]`).check();
   await fresh.locator(`.part-usage-input[data-pid="${newParts[0]}"]`).fill('2');
 }
 await fresh.locator(`.visible-part-check[data-pid="${newParts[1]}"]`).check();
 await fresh.locator('#btnBatchCallouts').click();
 await fresh.waitForFunction(()=>state.passos.every(page=>page.chamadas.length===1));
 assert.equal(await fresh.evaluate(()=>state.passos[1].calloutUncertainties.length),1);
 await fresh.locator('#btnGenerateDraft').click();
 await fresh.waitForFunction(()=>!!state.manualAnalysis);
 assert.match(lastRequest.instructions,/redacao-tecnica-montagem/);
 assert.match(lastRequest.instructions,/review-3d-part-drawings/);
 assert.equal(lastRequest.input[0].content.filter(item=>item.type==='input_image').length,8);
 await fresh.locator('[data-instruction]').first().fill('Alinhe a base (A) na borda.');
 await fresh.locator('#previewContent').getByText('Cabeça do fixador ocultada na vista.',{exact:false}).first().waitFor();
 const pdfEvent=fresh.waitForEvent('download');
 await fresh.locator('#btnReviewPdf').click();
 const download=await pdfEvent;
 const pdfBytes=await readFile(await download.path());
 assert.equal(download.suggestedFilename(),'armario-ipe.pdf');
 assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');
 assert.ok(pdfBytes.length>10000);
 assert.deepEqual(errors,[]);
 console.log('PASS: Excel, PDF multipágina, TIFF, STEP, chamadas editáveis em lote, pendências, geração e download real de PDF.');
}finally{await browser?.close();child.kill();mock.closeAllConnections();mock.close();}
