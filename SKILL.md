---
name: redacao-tecnica-montagem
version: 1.0.0
description: Padroniza, revisa e valida textos de etapas, notas e legendas de imagens de manuais de montagem de máquinas e móveis.
---

# Skill — Redação técnica de instruções de montagem

## Objetivo

Gerar e revisar instruções de montagem com terminologia consistente, referências visuais rastreáveis, etapas escritas no imperativo e sequência fisicamente executável para o equipamento ou móvel descrito.

## Dados necessários

Antes de redigir, utilizar os dados disponíveis no projeto:

- **Produto**: tipo de máquina ou móvel, modelo (quando informado) e configuração relevante.
- **Componentes**: identificador, nome padronizado, letra da chamada e especificações técnicas.
- **Imagens**: imagem correspondente a cada etapa ou conjunto de etapas e chamadas efetivamente visíveis.
- **Montagem**: operações propostas, estado inicial, relações entre componentes, pontos de fixação e pré-requisitos de acesso.
- **Restrições**: elementos que precisam ser liberados, abertos, removidos, sustentados ou alinhados antes da operação; ferramentas e torques somente quando fornecidos.

Não inventar modelo, letras, especificações, ferramentas, dimensões, torques, peças, operações, condições de segurança ou acesso físico. Se um dado essencial estiver ausente, informar a pendência para confirmação pelo autor.

## Regras obrigatórias

### R1 — Componentes citados nos steps precisam de chamada

Sempre que um componente com chamada designada for mencionado no texto de uma etapa (*step*), escrever seu nome acompanhado da letra entre parênteses: `parafuso (A)`, `painel lateral (B)`.

- Manter a mesma letra para o mesmo componente em todo o contexto associado.
- Não trocar, supor ou gerar letras sem registro nos dados do manual.
- Se um componente citado não tiver chamada cadastrada, sinalizar que a chamada precisa ser atribuída antes de aprovar o step.

### R2 — Especificações não podem aparecer no texto dos steps

O texto dos steps deve usar somente o nome do componente e sua chamada. Medidas e especificações ficam fora do step.

- **Incorreto:** `Instale o parafuso M20x3 (A).`
- **Correto:** `Instale o parafuso (A).`

Não incluir nos steps, quando descrevem especificações de componentes, dados como diâmetro, rosca, comprimento, dimensões, espessura, material ou código de peça. Esses dados devem estar na legenda correspondente.

### R3 — Todas as chamadas visíveis em uma imagem exigem legenda abaixo dela

Para **cada imagem**, identificar todas as letras de chamada visualmente presentes e gerar, diretamente abaixo da imagem, uma entrada de legenda por chamada.

Formato: `A—Parafuso, M20x3`.

- Cada chamada deve ter o nome padronizado e **todas as especificações fornecidas** para aquele componente.
- A letra na legenda deve coincidir exatamente com a letra visível na imagem.
- Não pode haver chamada visível sem entrada de legenda.
- Não listar na legenda dessa imagem chamadas que não aparecem nela.
- Se alguma especificação necessária não estiver cadastrada, marcar a legenda como incompleta e solicitar o dado; nunca inventar a especificação.

### R4 — Todos os steps devem ser escritos no imperativo

Começar cada step com um verbo de ação no **imperativo** dirigido ao leitor, mantendo tratamento consistente ao longo do manual.

Exemplos: `Posicione`, `Instale`, `Fixe`, `Remova`, `Aperte`, `Alinhe`, `Encaixe`.

- **Incorreto:** `Fixar o suporte (A) à base (B).` (infinitivo)
- **Correto:** `Fixe o suporte (A) à base (B).` (imperativo)

### R5 — Steps contêm ações; informações não operacionais são notas

Cada step deve expressar uma operação concreta que o montador deve executar. Informações descritivas, explicativas ou observações que não ordenem uma ação devem aparecer como **NOTA**, entre os steps relevantes, e não como uma etapa numerada.

- **Step:** `Posicione o suporte (A) sobre a base (B).`
- **NOTA:** `O suporte (A) possui uma face chanfrada.` (somente quando tal informação tiver sido fornecida)

Não transformar informações em verbos artificiais apenas para enquadrá-las como steps. Quando possível, dividir operações independentes em steps separados, preservando as dependências.

### R6 — Sequência de montagem fisicamente coerente

Organizar as operações de acordo com o tipo, modelo e estado inicial da máquina ou móvel, considerando:

1. Pré-requisitos de acesso físico à área de trabalho.
2. Peças, proteções, tampas ou conjuntos que precisam ser abertos ou removidos antes de uma intervenção.
3. Componentes que servem de base, recebem outros componentes ou precisam ser sustentados, posicionados ou alinhados antes de fixação.
4. Relações reais de encaixe, contato, inserção, apoio e fixação entre as peças.
5. Restrições de montagem e sequência informadas no projeto.

**Exemplos de raciocínio:**

- Em uma colheitadeira, não descrever uma intervenção no rotor como se ele fosse diretamente acessível se a configuração fornecida exigir abertura ou remoção prévia de outras partes.
- Em um armário, descrever a fixação dos painéis com os parafusos, sem inverter indevidamente a relação entre a peça que recebe o elemento de fixação e o próprio fixador.

Não presumir uma desmontagem específica apenas por conhecer o tipo genérico da máquina. Quando não houver dados suficientes para comprovar a possibilidade física ou a ordem de acesso, **sinalizar a dependência para revisão do autor** em vez de fabricar etapas.

## Procedimento de geração e revisão

1. Ler o cadastro de produto, componentes, chamadas, imagens e estado inicial da montagem.
2. Construir uma lista de operações e pré-requisitos de cada operação.
3. Ordenar as operações de modo que nenhuma dependa de acesso ou montagem ainda não realizados.
4. Escrever os steps com verbos no imperativo e ações concretas.
5. Substituir as referências aos componentes por `nome (LETRA)`; retirar especificações do texto dos steps.
6. Converter conteúdo não operacional em notas situadas entre os steps pertinentes.
7. Para cada imagem, gerar a legenda a partir do conjunto real de chamadas visíveis e do cadastro técnico dos componentes.
8. Executar as validações abaixo; corrigir problemas comprováveis e indicar pendências que necessitem de avaliação técnica.

## Validação antes da exportação

### Verificações determinísticas recomendadas no aplicativo

- [ ] Nenhum componente citado em step está sem a chamada atribuída.
- [ ] Nenhum step contém especificação técnica de componente.
- [ ] Todas as letras de chamada registradas na imagem aparecem na legenda diretamente abaixo dela.
- [ ] Nenhuma letra extra aparece na legenda da imagem.
- [ ] Cada entrada de legenda usa a letra, nome e especificações cadastrados, sem divergência.
- [ ] Cada step contém uma ação e usa o imperativo (checagem sintática, com revisão complementar nos casos ambíguos).
- [ ] Notas estão fora da numeração dos steps, nos pontos adequados.

### Verificações semânticas com IA e/ou aprovação técnica

- [ ] A sequência respeita as dependências físicas e o estado inicial.
- [ ] As operações descrevem corretamente qual componente recebe, sustenta ou fixa outro.
- [ ] Não há intervenções impossíveis devido a ausência de acesso, remoção, abertura ou posicionamento prévio.
- [ ] Todas as dúvidas sobre viabilidade e pré-requisitos estão explicitamente sinalizadas.

**Regra de aprovação:** Não apresentar como validada uma sequência cuja viabilidade física não possa ser confirmada com as informações disponíveis. Checagens automáticas de texto não substituem aprovação técnica da montagem.

## Exemplo ilustrativo

**Dados cadastrados**

- `A`: painel lateral — MDF, 18 mm.
- `B`: base — MDF, 18 mm.
- `C`: parafuso — M6x30.
- A imagem da operação mostra as chamadas `A`, `B` e `C`.

**Steps**

1. `Posicione o painel lateral (A) sobre a base (B).`
2. `Fixe o painel lateral (A) à base (B) com os parafusos (C).`

**Legenda diretamente abaixo da imagem**

`A—Painel lateral, MDF, 18 mm`  
`B—Base, MDF, 18 mm`  
`C—Parafuso, M6x30`

O exemplo ilustra o formato textual, não constitui instrução técnica validada para um móvel específico.

## Saída esperada

Entregar steps numerados, notas não numeradas e legendas associadas às respectivas imagens. Quando houver problemas, fornecer uma lista de pendências por etapa ou imagem, identificando a regra (`R1` a `R6`) violada e como corrigi-la. Nunca declarar conformidade total se houver pendências críticas.
