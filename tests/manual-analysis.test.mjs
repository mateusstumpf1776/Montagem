import test from 'node:test';
import assert from 'node:assert/strict';
import {buildManualContent,validateManualInput,validateManualResult,ManualInputError} from '../manual-analysis.mjs';
const image='data:image/png;base64,iVBORw0KGgo=';
function input(){
 const parts=[{id:'p1',nome:'Base',chamada:'K',quantidadeTotal:2},{id:'p2',nome:'Tampa',chamada:'A',quantidadeTotal:1}];
 const page=(id,ids)=>({id,name:id,imageDataUrl:image,parts:ids.map(id=>({id,quantidadeNestaVista:1})),callouts:ids.map((pid,i)=>({id:id+'_c'+i,pecaId:pid,letra:parts.find(p=>p.id===pid).chamada,x:20,y:30,tipX:35,tipY:40}))});
 return {manualTitle:'Teste',parts,overview:page('general',['p1','p2']),blocks:[{id:'b1',title:'Preparar a base',pages:[page('view1',['p1'])]},{id:'b2',title:'Fechar o conjunto',pages:[page('view2',['p2'])]}]};
}
function output(i){return {summary:'Conjunto',uncertainties:[],blocks:i.blocks.map((b,n)=>({blockId:b.id,summary:b.title,dependencies:n?['b1']:[],uncertainties:[],pages:b.pages.map(p=>({pageId:p.id,summary:'Vista',uncertainties:[],steps:[{instruction:'Posicione o componente ('+p.callouts[0].letra+').',activity:'outro',partIds:[p.parts[0].id],hardwareIds:[],calloutIds:[p.callouts[0].id],confidence:'alta',notes:''}]}))}))};}
test('all images and author block order are included in one multimodal request',()=>{
 const c=buildManualContent(input());assert.equal(c.filter(x=>x.type==='input_image').length,3);assert.match(c[0].text,/COMO UM CONJUNTO/);assert.match(c[0].text,/quantidadeNestaVista/);assert.match(c[3].text,/b1.*view1/);assert.match(c[5].text,/b2.*view2/);
});
for(const [name,mutate]of[
 ['missing overview',i=>i.overview=null],['empty block',i=>i.blocks[0].pages=[]],['duplicate catalog letter',i=>i.parts[1].chamada='K'],['wrong local letter',i=>i.blocks[0].pages[0].callouts[0].letra='A'],['quantity too large',i=>i.blocks[0].pages[0].parts[0].quantidadeNestaVista=5],['unpositioned marker',i=>i.overview.callouts[0].x=null],['missing general component',i=>i.overview.callouts.pop()],['unknown part',i=>i.blocks[0].pages[0].parts[0].id='unknown'],['invalid detail',i=>i.detailLevel='inventar'],['too many images',i=>i.blocks[0].pages=Array.from({length:24},(_,n)=>({...i.blocks[0].pages[0],id:'v'+n}))]
])test('reject '+name,()=>{const i=input();mutate(i);assert.throws(()=>validateManualInput(i),ManualInputError);});
test('complete output follows the author order even if model returns reversed blocks',()=>{const i=input(),o=output(i);o.blocks.reverse();assert.deepEqual(validateManualResult(i,o).blocks.map(b=>b.blockId),['b1','b2']);});
for(const [name,mutate]of[
 ['missing block',o=>o.blocks.pop()],['duplicate block',o=>o.blocks[1]=o.blocks[0]],['missing page',o=>o.blocks[0].pages=[]],['cross-image callout',o=>o.blocks[0].pages[0].steps[0].calloutIds=['view2_c0']],['cross-image part',o=>o.blocks[0].pages[0].steps[0].partIds=['p2']],['unknown dependency',o=>o.blocks[0].dependencies=['unknown']],['invented letter',o=>o.blocks[0].pages[0].steps[0].instruction='Posicione (Z).'],['invalid instruction',o=>o.blocks[0].pages[0].steps[0].instruction=null]
])test('reject result: '+name,()=>{const i=input(),o=output(i);mutate(o);assert.throws(()=>validateManualResult(i,o),/Resposta global inválida/);});
test('insufficient evidence can return zero steps with an explicit uncertainty',()=>{const i=input(),o=output(i);o.blocks[0].pages[0].steps=[];o.blocks[0].pages[0].uncertainties=['Dados de fixação ausentes.'];assert.equal(validateManualResult(i,o).blocks[0].pages[0].steps.length,0);});
