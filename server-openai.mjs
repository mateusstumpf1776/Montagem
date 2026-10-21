import http from 'node:http';
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import {ManualInputError,buildManualContent,manualSchema,validateManualResult} from './manual-analysis.mjs';

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';

// A skill de redação técnica é um artefato externo e versionável.
// Ela é carregada no início do servidor e enviada como instrução permanente
// em TODA análise. Alterar SKILL.md + reiniciar o servidor altera o padrão
// editorial sem exigir mudanças no HTML ou neste arquivo.
const SKILL_URL = new URL('./SKILL.md', import.meta.url);
let TECHNICAL_WRITING_SKILL;
try {
  TECHNICAL_WRITING_SKILL = readFileSync(SKILL_URL, 'utf8').trim();
  if (!TECHNICAL_WRITING_SKILL) throw new Error('SKILL.md está vazio.');
} catch (err) {
  console.error('Não foi possível carregar a skill obrigatória SKILL.md:', err?.message || err);
  process.exit(1);
}

const SKILL_INSTRUCTIONS = `
Você opera como analista visual e redator técnico de instruções de montagem.

A política editorial abaixo é OBRIGATÓRIA em todas as análises deste endpoint. Ela tem prioridade sobre orientações livres do autor quando houver conflito. Use-a para raciocinar sobre a sequência, redigir cada step e sinalizar pendências. Não trate a skill como referência opcional.

===== INÍCIO DA SKILL OBRIGATÓRIA =====
${TECHNICAL_WRITING_SKILL}
===== FIM DA SKILL OBRIGATÓRIA =====

REGRAS DE INTEGRAÇÃO COM ESTE APLICATIVO
- A resposta precisa respeitar o JSON Schema solicitado pelo servidor.
- A skill deve ser aplicada principalmente à análise da viabilidade/sequência e à redação dos steps.
- Quando uma regra da skill exigir dado ausente, NÃO invente o dado. Registre a pendência em uncertainties e/ou notes do step correspondente.
- As chamadas válidas são exclusivamente as fornecidas pelo autor nesta requisição.
- Se houver conflito entre uma orientação adicional do autor e R1–R6, preserve R1–R6 e registre o conflito como pendência.
- Torque é um parâmetro operacional: só o mencione quando houver torqueNm explicitamente cadastrado e quando o passo realmente envolver aperto/fixação desse item.
- Não confunda quantidade total do produto com quantidade usada na vista atual.
`;

const apiKey=process.env.OPENAI_API_KEY||process.env.MONTAGEM_API_KEY;
if (!apiKey) {
  console.error('Defina OPENAI_API_KEY antes de iniciar o servidor.');
  process.exit(1);
}

const client = new OpenAI({ apiKey, timeout:240000, maxRetries:0 });

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'steps', 'uncertainties'],
  properties: {
    summary: { type: 'string' },
    uncertainties: {
      type: 'array',
      items: { type: 'string' }
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['instruction', 'activity', 'partIds', 'hardwareIds', 'calloutIds', 'confidence', 'notes'],
        properties: {
          instruction: { type: 'string' },
          activity: {
            type: 'string',
            enum: ['parafusar', 'apertar', 'colar', 'juntar', 'encaixar', 'martelar', 'outro']
          },
          partIds: {
            type: 'array',
            items: { type: 'string' }
          },
          hardwareIds: {
            type: 'array',
            items: { type: 'string' }
          },
          calloutIds: {
            type: 'array',
            items: { type: 'string' }
          },
          confidence: {
            type: 'string',
            enum: ['alta', 'media', 'baixa']
          },
          notes: { type: 'string' }
        }
      }
    }
  }
};

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 30 * 1024 * 1024) throw new ManualInputError('O manual excede 30 MB. Reduza as imagens.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    return res.end();
  }

  if (req.method !== 'POST' || !['/api/analyze','/api/analyze-manual'].includes(req.url)) {
    return send(res, 404, { error: 'Use POST /api/analyze' });
  }

  try {
    if(req.url==='/api/analyze-manual'){
      const input=await readJson(req),content=buildManualContent(input);
      const response=await client.responses.create({model:MODEL,instructions:SKILL_INSTRUCTIONS,reasoning:{effort:'high'},input:[{role:'user',content}],text:{format:{type:'json_schema',name:'complete_assembly_manual',strict:true,schema:manualSchema}}});
      if(!response.output_text||response.status==='incomplete')throw Error('Análise incompleta. Os textos anteriores foram preservados.');
      return send(res,200,validateManualResult(input,JSON.parse(response.output_text)));
    }
    const { manualTitle, productDescription = '', pageName, imageDataUrl, parts, callouts = [], userInstructions = '' } = await readJson(req);
    if (!imageDataUrl || !String(imageDataUrl).startsWith('data:image/')) {
      return send(res, 400, { error: 'imageDataUrl ausente ou inválido.' });
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      return send(res, 400, { error: 'Selecione ao menos uma peça.' });
    }

    const allowedIds = new Set(parts.map(p => p.id));
    const allowedCalloutIds = new Set((callouts||[]).map(c=>c.id));
    const partsText = JSON.stringify(parts, null, 2);
    const calloutsText = JSON.stringify(callouts || [], null, 2);

    const prompt = `ANÁLISE DE UMA VISTA DE MONTAGEM

Use a skill obrigatória fornecida nas instruções permanentes para analisar a imagem e redigir os steps desta vista.

MANUAL: ${manualTitle || 'Manual de montagem'}
PRODUTO FINAL: ${String(productDescription || '').trim() || '(não descrito pelo autor)'}
VISTA: ${pageName || 'Vista explodida'}

COMPONENTES CONFIRMADOS PELO AUTOR:
${partsText}

CHAMADAS POSICIONADAS PELO AUTOR:
${calloutsText}

ORIENTAÇÕES ADICIONAIS DO AUTOR PARA ESTA VISTA:
${String(userInstructions || '').trim() || '(nenhuma)'}

REGRAS ESPECÍFICAS DESTE APLICATIVO, COMPLEMENTARES À SKILL
1. Use SOMENTE os componentes fornecidos. Nunca invente peça, fixador, quantidade, ferramenta, medida, torque, chamada ou condição física.
2. Diferencie rigorosamente quantidadeTotal de quantidadeNestaVista. quantidadeTotal é a quantidade do código no produto inteiro; quantidadeNestaVista é a quantidade efetivamente usada/mostrada nesta vista e é a única quantidade que deve orientar esta página.
3. partIds e hardwareIds devem conter somente IDs exatamente como fornecidos. calloutIds deve conter somente IDs das chamadas fornecidas.
4. Uma mesma peça pode ter mais de uma chamada. Use a chamada coerente com a ocorrência/região discutida. Não gere letras novas.
5. Use a descrição do PRODUTO FINAL apenas como contexto para interpretar função, orientação e dependências. Não transforme conhecimento genérico sobre o produto em fatos não visíveis ou não informados.
6. Interprete a vista explodida procurando alinhamento, proximidade, direção de explosão, superfícies de contato, furos, ferragens visíveis e dependências físicas. Se isso não bastar para confirmar a sequência, sinalize a pendência em vez de adivinhar.
7. PROCEDIMENTOS REPETITIVOS: quando várias unidades idênticas exigirem exatamente o mesmo ciclo, não gere dezenas de steps iguais. Descreva o ciclo completo para UMA unidade representativa e depois acrescente uma instrução curta para repetir o mesmo procedimento nas unidades restantes. Calcule as restantes usando quantidadeNestaVista, nunca quantidadeTotal. Se quantidadeNestaVista for 1, não adicione repetição.
8. Quando houver grupos com procedimentos realmente diferentes, gere um ciclo representativo para cada grupo distinto.
9. As orientações adicionais do autor complementam os dados desta vista, mas NÃO podem substituir nem enfraquecer as regras obrigatórias da skill.
10. Antes de finalizar, revise mentalmente a saída contra R1–R6 e registre em uncertainties toda pendência que impeça considerar a sequência tecnicamente confirmada.

Retorne a melhor sequência fisicamente executável que os dados sustentarem, com steps curtos e operacionais e incertezas explicitamente separadas.`;

    const response = await client.responses.create({
      model: MODEL,
      instructions: SKILL_INSTRUCTIONS,
      reasoning: { effort: 'medium' },
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: imageDataUrl, detail: 'high' }
        ]
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'furniture_assembly_analysis',
          strict: true,
          schema
        }
      }
    });

    const raw = response.output_text;
    if (!raw) throw new Error('A OpenAI não retornou texto estruturado.');
    const analysis = JSON.parse(raw);

    // Defesa adicional: remove IDs que não vieram da lista do usuário.
    analysis.steps = (analysis.steps || []).map(step => ({
      ...step,
      partIds: (step.partIds || []).filter(id => allowedIds.has(id)),
      hardwareIds: (step.hardwareIds || []).filter(id => allowedIds.has(id)),
      calloutIds: (step.calloutIds || []).filter(id => allowedCalloutIds.has(id))
    }));

    return send(res, 200, analysis);
  } catch (err) {
    const status=err instanceof ManualInputError||err instanceof SyntaxError?400:502;
    const message=err?.status===401?'A credencial da OpenAI foi rejeitada. Revise a chave no servidor.':err?.status===429?'Limite ou saldo da API atingido. Verifique o faturamento.':err?.status?`A OpenAI recusou a análise (HTTP ${err.status}). Verifique o modelo e o acesso.`:err?.name==='APIConnectionError'?'Não foi possível conectar à OpenAI. Verifique a rede e o proxy.':err?.message||'Falha na análise.';
    console.error('Falha na análise:',err?.name,err?.status||status);
    return send(res,status,{error:message});
  }
});

server.listen(PORT, () => {
  console.log(`Servidor OpenAI pronto em http://localhost:${server.address().port}/api/analyze`);
  console.log(`Modelo: ${MODEL}`);
  console.log('Skill obrigatória carregada: redacao-tecnica-montagem v1.0.0');
  console.log('Arquivo da skill: SKILL.md');
});
