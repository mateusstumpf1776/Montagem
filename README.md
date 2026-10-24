# Montagem — manual por blocos (v5)

Esta versão permite **escrever os títulos dos blocos/procedimentos**, organizar suas imagens e gerar o manual com uma análise conjunta do equipamento ou móvel.

## Fluxo de trabalho

1. **Peças e visão geral:** descreva o produto, cadastre todas as peças e suas quantidades totais. Cada peça recebe uma chamada única (automática ou escolhida pelo autor). Insira a imagem do kit completo ou uma vista explodida e posicione as chamadas.
2. **Blocos e imagens:** escreva o título de cada procedimento, por exemplo “Montagem da base” e “Instalação das portas”. Selecione um bloco para adicionar suas imagens. Os blocos podem ser renomeados, ordenados e excluídos.
3. **Preparação de cada imagem:** selecione as peças visíveis, informe a quantidade usada na vista e posicione as chamadas. Uma peça mantém a mesma letra em todas as imagens; múltiplas ocorrências da mesma peça podem usar a mesma letra.
4. **Análise conjunta:** preencha todos os blocos e escolha o detalhamento Detalhado ou Essencial. A IA recebe o catálogo, a imagem geral, todos os títulos, orientações e imagens em uma única análise. Considera dependências e o estado resultante dos procedimentos anteriores.
5. **Manual editável:** revise as pendências. Clique nos resumos, textos e notas para editar. O editor da imagem permite adicionar, remover ou reordenar passos. Exporte Word, PDF, XML ou backup JSON.

A versão correta mostra **“Blocos · v5”** no cabeçalho e **“Blocos / procedimentos do manual”** na segunda aba.

## Instalação

Baixe **o pacote completo** desta versão. O backend precisa de `server-openai.mjs`, `manual-analysis.mjs`, `SKILL.md` e `package.json`; não basta substituir apenas o HTML.

Com Node.js 24 recomendado, execute na pasta do projeto:

```sh
npm install --package-lock=false
npm start
```

Defina antes `OPENAI_API_KEY` ou `MONTAGEM_API_KEY` no ambiente do servidor. A chave fica no backend, nunca no HTML ou no repositório. No PowerShell, por exemplo, use `$env:MONTAGEM_API_KEY="SUA_CHAVE"` antes de `npm start`.

Variáveis opcionais:

| Variável | Valor / função |
| --- | --- |
| `OPENAI_MODEL` | `gpt-5.4` por padrão; precisa aceitar visão, Responses API, JSON Schema e raciocínio alto |
| `PORT` | `3000` por padrão |
| `ANALYSIS_TIMEOUT_MS` | Prazo do servidor: `600000` (10 minutos) por padrão; aceita de 1000 a 600000 ms |
| `NODE_USE_ENV_PROXY` | `1` em ambientes Node 24 que precisam do proxy de rede |

Abra `montagem-xml-openai-v4.6.html` no navegador. O nome do arquivo foi mantido para compatibilidade; o cabeçalho identifica a versão v5. Também é possível servi-lo com `python3 -m http.server 8080` na pasta. No aplicativo, configure o endereço do backend terminando em `/api/analyze`. O cliente usa `/api/analyze-manual` para gerar o conjunto. O backend não serve o HTML.

## Preservação e qualidade

- Geração conjunta com raciocínio **alto** e imagens em detalhe **alto**, sem troca automática para modelo inferior.
- `SKILL.md` continua obrigatório, com regras R1–R6. A IA deve declarar informações insuficientes e pendências de sequência física, sem inventar operações ou componentes.
- O servidor aguarda até 10 minutos; o navegador aguarda 11 minutos para receber a resposta. O tempo decorrido aparece durante a análise. A rede ou o provedor ainda pode impor um prazo menor. Não há nova chamada automática após timeout.
- Não há geração automática ao editar ou trocar de aba.
- Respostas incompletas ou inválidas e falhas da API preservam os textos anteriores. Uma resposta atrasada não substitui um manual alterado durante a geração.
- Uma nova geração pede confirmação antes de substituir instruções existentes.
- Backups antigos são importados em “Procedimentos importados”. As chamadas locais e os textos são ajustados ao catálogo global. Adicione a imagem geral antes de gerar novamente.
- Salve backups JSON: o armazenamento do navegador tem limite, especialmente ao guardar muitas imagens.

Limites: 24 imagens incluindo a visão geral, 40 blocos e 30 MB por requisição. PNG/JPEG/WebP são preparados com até 2200 px no lado maior e qualidade JPEG de 92%; guarde os originais separadamente.

XML versão 2 inclui blocos, imagem geral e referências `blocoId` nas páginas, além dos dados existentes. Integrações com esquema XML antigo precisam aceitar esses campos. Word incorpora as chamadas nas imagens; PDF usa a impressão do navegador, que pode ser bloqueada em visualizadores incorporados.

## Testes

```sh
npm test
npm run test:browser
```

O teste de navegador requer Chromium em `/usr/bin/chromium`, ou `CHROMIUM_PATH` apontando ao binário instalado. Usa Chromium e backend reais com API OpenAI **simulada localmente**, sem chave real nem consumo de créditos. Verifica blocos, análise global, edição/persistência, falhas, resposta atrasada, backups novos e antigos e XML/Word/PDF. A qualidade semântica de uma análise real ainda exige um manual representativo e revisão técnica.

## Arquivos e GitHub

Preparar ou publicar um ambiente de desenvolvimento não envia commits ao GitHub. A versão baixada depende da branch escolhida no repositório. Para obter o novo fluxo, baixe a branch que contém esta revisão ou o pacote v5 fornecido junto dela.
