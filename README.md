# Montagem · Editor de manuais

Crie manuais de montagem de móveis domésticos a partir de um catálogo de peças, uma vista explodida e imagens do procedimento. A OpenAI organiza a lista, sugere a posição das chamadas e redige os passos. O editor permite conferir o resultado e baixar um PDF A4.

## Iniciar

Use Node.js 24 e execute na pasta do repositório.

```sh
npm ci
npm start
```

Abra http://localhost:3000. Para ativar os recursos de IA, defina `OPENAI_API_KEY` no ambiente do servidor antes de executar `npm start`. O alias `MONTAGEM_API_KEY` também é aceito. A chave fica no servidor. No PowerShell, use `$env:OPENAI_API_KEY = "sua-chave"` na mesma sessão em que vai iniciar o servidor.

| Variável opcional | Efeito |
| --- | --- |
| `OPENAI_MODEL` | Modelo padrão `gpt-5.4`. O modelo configurado precisa aceitar visão, Responses API, saída estruturada e raciocínio. |
| `PORT` | Porta local. Padrão `3000`. |
| `MONTAGEM_HOST` | Interface de rede. Padrão `127.0.0.1`. |
| `MONTAGEM_ALLOWED_ORIGIN` | Origem autorizada adicional quando a interface usa um domínio diferente do backend. |

Se a importação indicar falha de conexão com a OpenAI, execute este comando no PowerShell. Ele testa o acesso do Node.js ao endereço da API sem usar a chave.

```powershell
node -e "fetch('https://api.openai.com/v1/models').then(r => console.log('HTTP', r.status)).catch(e => console.log(e.cause?.code ?? e.name))"
```

`HTTP 401` é a resposta esperada para este teste sem chave e indica que o Node.js alcançou a API. Se aparecer um erro de DNS, certificado ou conexão, confira a rede. Se a sua rede usa um proxy informado pela equipe de TI, configure `HTTPS_PROXY` com esse endereço e defina `$env:NODE_USE_ENV_PROXY = "1"` antes de iniciar o servidor com Node.js 24 atualizado.

## Fluxo do manual

1. **Lista de peças.** Importe um Excel `.xlsx` ou `.xls`, escolha a aba e confira o resultado antes de adicioná-lo ao catálogo. A IA identifica as linhas de peças e agrupa duplicatas. O servidor soma as quantidades indicadas na planilha e o aplicativo atribui chamadas A, B, C e assim por diante. Quando a planilha omite a quantidade, o valor inicial é 1 e a linha é sinalizada para conferência. Edite nomes, medidas e quantidades no catálogo. Para incluir uma peça avulsa, abra **Adicionar peça manualmente** e preencha nome, quantidade e, se quiser, a chamada.
2. **Vista explodida.** Importe JPEG, PNG, TIFF, PDF ou WebP. Se o arquivo tiver várias páginas, escolha a página da vista. Adicione, se desejar, um modelo `.stp` ou `.step`, um PDF de vistas técnicas ou ambos. Gere as chamadas. Arraste o círculo da letra ou a ponta da seta para corrigir a posição.
3. **Procedimento.** Importe as imagens na ordem de montagem. Cada arquivo adicionado por **Importar imagens** cria um bloco com título editável. Marque as peças visíveis de cada imagem e informe as quantidades. Gere as chamadas por imagem ou em lote. O comando **Gerar chamadas e passos** completa as marcações pendentes, analisa o conjunto na ordem dos blocos e gera um rascunho.
4. **Revisar manual.** Confira as pendências de localização e sequência. Edite as instruções, notas e resumos e baixe o arquivo em **Baixar PDF**. A imagem anotada e sua legenda acompanham cada bloco. Pendências em aberto seguem identificadas na exportação.

A pasta [.agents/skills/review-3d-part-drawings](.agents/skills/review-3d-part-drawings) contém a skill usada na localização das chamadas e na revisão visual da sequência. A [skill de redação técnica](SKILL.md) também é enviada nas solicitações de geração dos passos. O aplicativo sinaliza dados insuficientes para revisão técnica.

## Arquivos e dados

- O PDF de apoio aceita até oito páginas. O STEP é tessellado no navegador com Open Cascade e gera três projeções de apoio. A API recebe essas projeções, os desenhos em imagens e os dados relevantes do projeto.
- Cada arquivo visual tem limite de 25 MB. O manual aceita até 24 imagens principais, incluindo a vista explodida. O limite de dados por solicitação ao backend é 30 MB.
- O navegador salva o manual localmente. Use **Salvar backup** para transferir o projeto entre navegadores ou para migrar um manual da versão anterior. Use **Baixar Word** para editar o documento fora do aplicativo.
- Planilhas e imagens são processadas localmente antes do envio dos dados necessários para a OpenAI nas ações de IA. O PDF é gerado no navegador.

## Verificação

```sh
npm test
npm run test:browser
```

O teste de navegador usa Chromium, o backend real e uma resposta simulada da OpenAI. Defina `CHROMIUM_PATH` se o binário estiver fora de `/usr/bin/chromium`. Para conferir a qualidade técnica da geração em produção, use uma credencial real e os desenhos de um móvel representativo.
