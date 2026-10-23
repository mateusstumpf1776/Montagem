export class ManualInputError extends Error {}
const list={type:'array',items:{type:'string'}};
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const activities=['parafusar','apertar','colar','juntar','encaixar','martelar','outro'];
export const manualSchema=object({summary:{type:'string'},uncertainties:list,blocks:{type:'array',items:object({
  blockId:{type:'string'},summary:{type:'string'},dependencies:list,uncertainties:list,pages:{type:'array',items:object({
    pageId:{type:'string'},summary:{type:'string'},uncertainties:list,steps:{type:'array',items:object({
      instruction:{type:'string'},activity:{type:'string',enum:activities},partIds:list,hardwareIds:list,calloutIds:list,confidence:{type:'string',enum:['alta','media','baixa']},notes:{type:'string'}
    })}
  })}
})}});
const unique=a=>new Set(a).size===a.length;
const validId=x=>x&&typeof x.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x.id);
const image=x=>typeof x==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(x);
const strings=x=>Array.isArray(x)&&x.every(v=>typeof v==='string');
export function validateManualInput(input){
  const require=(ok,msg)=>{if(!ok)throw new ManualInputError(msg);};
  require(input&&Array.isArray(input.parts)&&input.parts.length>0,'Cadastre as peças do conjunto.');
  require(input.parts.every(p=>validId(p)&&typeof p.nome==='string'&&p.nome.trim()&&/^[A-Z]{1,3}$/.test(p.chamada)&&Number.isInteger(p.quantidadeTotal)&&p.quantidadeTotal>0),'Cadastro de peças inválido.');
  require(unique(input.parts.map(p=>p.id))&&unique(input.parts.map(p=>p.chamada)),'Use uma chamada única por peça.');
  require(!input.detailLevel||['detalhado','essencial'].includes(input.detailLevel),'Detalhamento inválido.');
  require(validId(input.overview)&&image(input.overview.imageDataUrl),'Insira a imagem geral do kit.');
  require(Array.isArray(input.blocks)&&input.blocks.length>0&&input.blocks.length<=40,'Cadastre de 1 a 40 blocos.');
  require(input.blocks.every(b=>validId(b)&&typeof b.title==='string'&&b.title.trim()&&Array.isArray(b.pages)&&b.pages.length>0),'Cada bloco precisa de título e imagens.');
  require(unique(input.blocks.map(b=>b.id)),'IDs de blocos repetidos.');
  const pages=[input.overview,...input.blocks.flatMap(b=>b.pages)];
  require(pages.length<=24,'Use até 24 imagens, incluindo a visão geral.');
  require(pages.every(p=>validId(p)&&image(p.imageDataUrl))&&unique(pages.map(p=>p.id)),'Imagens inválidas ou IDs repetidos.');
  const catalog=new Map(input.parts.map(p=>[p.id,p])),calloutIds=[];
  for(const page of pages){
    require(Array.isArray(page.parts)&&page.parts.length>0&&page.parts.every(p=>p&&catalog.has(p.id)&&Number.isInteger(p.quantidadeNestaVista)&&p.quantidadeNestaVista>0&&p.quantidadeNestaVista<=catalog.get(p.id).quantidadeTotal),'Revise as peças e quantidades de cada imagem.');
    require(unique(page.parts.map(p=>p.id)),'Peças repetidas na mesma imagem.');
    require(Array.isArray(page.callouts)&&page.callouts.every(c=>validId(c)&&page.parts.some(p=>p.id===c.pecaId)&&c.letra===catalog.get(c.pecaId)?.chamada&&['x','y','tipX','tipY'].every(k=>Number.isFinite(c[k])&&c[k]>=0&&c[k]<=100)),'Chamadas inválidas: use as letras do cadastro e posições válidas.');
    require(page.parts.every(p=>page.callouts.some(c=>c.pecaId===p.id)),'Posicione uma chamada para cada peça selecionada.');
    calloutIds.push(...page.callouts.map(c=>c.id));
  }
  require(input.parts.every(p=>input.overview.callouts.some(c=>c.pecaId===p.id)),'Marque todas as peças na imagem geral.');
  require(unique(calloutIds),'IDs de chamadas repetidos.');return input;
}
export function buildManualContent(input){
  validateManualInput(input);
  const clean=({imageDataUrl,...p})=>p;
  const prompt=`Analise a máquina ou móvel COMO UM CONJUNTO antes de escrever os procedimentos. Examine a imagem geral, o catálogo e TODAS as imagens dos blocos. Siga a skill R1–R6.
As letras são globais por peça e devem ser mantidas em todas as imagens. Nunca invente peças, ferramentas, torque, quantidades, medidas, condições de acesso ou relações não demonstradas.
Preserve títulos, IDs e ordem dos blocos do autor. Identifique dependências e o estado resultante dos blocos anteriores. Se a ordem for inviável, sinalize a pendência sem reordenar silenciosamente. Não repita operações já concluídas.
Detalhamento: ${input.detailLevel||'detalhado'}. No modo detalhado, separe posicionamento, alinhamento, fixação e verificações quando os dados comprovarem essas ações. No modo essencial, seja conciso sem omitir pré-requisitos. Não alongue o texto com ações inventadas.
Gere passos operacionais, no imperativo, com nome (LETRA) dos componentes. Especificações pertencem à legenda; notas ficam separadas. Só inclua torque cadastrado. Para ciclos repetitivos, descreva um ciclo e a repetição usando quantidadeNestaVista, não a quantidade total. Várias vistas da mesma peça não significam consumo adicional.
Retorne TODOS os blocos e páginas, inclusive os sem evidência suficiente (steps vazio e uncertainties explicando a pendência). Use em cada passo apenas os IDs de peças e chamadas daquela imagem. Explicite dúvidas locais e globais; não apresente hipóteses como confirmação técnica.
CONTEXTO GLOBAL:\n${JSON.stringify({manualTitle:input.manualTitle,productDescription:input.productDescription,detailLevel:input.detailLevel,parts:input.parts})}
IMAGEM GERAL:\n${JSON.stringify(clean(input.overview))}
BLOCOS NA ORDEM DO AUTOR:\n${JSON.stringify(input.blocks.map(b=>({...b,pages:b.pages.map(clean)})))}`;
  const content=[{type:'input_text',text:prompt},{type:'input_text',text:'Imagem geral: '+input.overview.id},{type:'input_image',image_url:input.overview.imageDataUrl,detail:'high'}];
  for(const block of input.blocks)for(const page of block.pages)content.push({type:'input_text',text:`Bloco ${block.id}: ${block.title}; imagem ${page.id}: ${page.name}`},{type:'input_image',image_url:page.imageDataUrl,detail:'high'});
  return content;
}
export function validateManualResult(input,result){
  const fail=msg=>{throw Error('Resposta global inválida: '+msg);};
  if(!result||typeof result.summary!=='string'||!strings(result.uncertainties)||!Array.isArray(result.blocks)||result.blocks.length!==input.blocks.length||!unique(result.blocks.map(b=>b.blockId)))fail('blocos ausentes ou repetidos.');
  result.blocks=input.blocks.map(block=>{
    const out=result.blocks.find(b=>b.blockId===block.id);
    if(!out||typeof out.summary!=='string'||!strings(out.uncertainties)||!strings(out.dependencies)||out.dependencies.some(id=>id===block.id||!input.blocks.some(b=>b.id===id)))fail('bloco ou dependências inválidas.');
    if(!Array.isArray(out.pages)||out.pages.length!==block.pages.length||!unique(out.pages.map(p=>p.pageId)))fail('imagens ausentes ou repetidas.');
    out.pages=block.pages.map(page=>{
      const p=out.pages.find(p=>p.pageId===page.id);
      if(!p||typeof p.summary!=='string'||!strings(p.uncertainties)||!Array.isArray(p.steps))fail('resultado de imagem incompleto.');
      for(const step of p.steps){
        if(typeof step.instruction!=='string'||!step.instruction.trim()||typeof step.notes!=='string'||!activities.includes(step.activity)||!['alta','media','baixa'].includes(step.confidence)||!strings(step.partIds)||!strings(step.hardwareIds)||!strings(step.calloutIds))fail('instrução inválida.');
        if([...step.partIds,...step.hardwareIds].some(id=>!page.parts.some(p=>p.id===id))||step.calloutIds.some(id=>!page.callouts.some(c=>c.id===id)))fail('referências fora da imagem.');
        if([...step.instruction.matchAll(/\(([A-Z]{1,3})\)/g)].some(m=>!page.callouts.some(c=>c.letra===m[1])))fail('chamada inexistente no texto.');
      }return p;
    });return out;
  });return result;
}
