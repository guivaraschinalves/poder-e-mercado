# Poder & Mercado

Indicadores da economia brasileira desde 1995, cada um num gráfico com o
fundo colorido por governo (FHC I e II, Lula I e II, Dilma I e II, Temer,
Bolsonaro e Lula), com o retrato oficial do presidente e, embaixo dele, a
variação e a média do período. Site estático, sem build: `index.html` +
`app.js` + `styles.css`, com os dados em `dados/`.

- **Menu à esquerda** — a lista de indicadores fica numa barra lateral fixa
  (no celular ela vira uma fila de atalhos no topo). **Arraste um nome** para
  mudar a ordem dos gráficos: o cartão acompanha, e a ordem fica salva no
  navegador de quem está lendo (chave `pm_ordem`), com um botão para voltar à
  original. Sem mouse, **Alt + ↑/↓** move o link que está com o foco. Um
  indicador novo, que não esteja na ordem salva, entra no fim da lista.
- **Tela cheia** — botão em cada gráfico: o quadro vai para a tela inteira pela
  API do navegador e o desenho é refeito no tamanho novo. Esc volta.
- **Modo escuro/claro** — botão na lateral (o escuro é o padrão e reproduz o
  visual do gráfico de referência; a escolha fica salva no navegador).
- **Baixar** — em cada gráfico, no tema da tela, em PNG, JPG, PDF ou SVG
  editável, e o CSV com os dados. Tamanhos (todos em 2×, para sair nítido):
  apresentação 16:9 (3840×2160) e Instagram feed 4:5 (2160×2700), feed 3:4
  (2160×2880), quadrado 1:1 (2160×2160) e Stories 9:16 (2160×3840, com o
  gráfico dentro da área segura, longe das barras do app).
- **Rating soberano** — um cartão só, com botões para ver Moody's, S&P ou
  Fitch, a nota em moeda estrangeira e em moeda local, cada ação de rating
  marcada com a perspectiva anunciada e a linha do grau de investimento.
- **PIB** — dois cartões com botões de **Conta:** e **Componente:**, que ligam
  e desligam quantas linhas você quiser ao mesmo tempo: a variação real
  acumulada em 4 trimestres (PIB, consumo das famílias, consumo do governo,
  formação bruta de capital, exportação e importação) e a participação de cada
  componente no PIB nominal. Cada componente tem cor fixa, que aparece no
  botão, na linha, na legenda e no selo do último valor. Com duas linhas ou
  mais, os retratos e os números do mandato saem (a média de qual linha seria?)
  e o topo do gráfico vira legenda — as faixas e os nomes dos governos ficam.
- **Início** — FHC I, FHC II, Lula I, Lula II, Dilma I, Dilma II, Temer,
  Bolsonaro, Lula III: o gráfico começa no primeiro mês do mandato escolhido
  (só aparecem os mandatos em que a série tem dados). No IPCA, "FHC I" começa
  em jan/1996, porque o valor de jan/1995 (631%) achata todo o resto.
- Passe o mouse (ou toque) no gráfico para ver o valor do mês e o governo.
- O eixo X marca sempre janeiro, de ano em ano (de 2 em 2 na tela do celular,
  onde um ano não comporta o rótulo).
- Na largura de celular o gráfico vira retrato e mostra só as fotos e os nomes:
  os números do mandato não cabem em faixa estreita sem virar borrão.

## Como atualizar os dados

Os dados vêm de dois Excel em `dados/` e de três fontes que o script baixa:

- `Presidentes da República.xlsx` — abas *Outros Indicadores*, *Presidentes*,
  *Dívida Bruta* (a série no tempo e a comparação entre mandatos) e
  *Base Rating 2*;
- `PIB Brasil.xlsx` — abas *PIB Var. Real 4t* e *PIB Nominal*, trimestrais;
- o **SGS do Banco Central**, de onde vêm oito das séries no mês mais recente
  (ver *Atualização automática pelo SGS*, abaixo);
- o **Ibovespa**, do histórico diário do `^BVSP`, conferido contra a cotação da
  própria B3;
- a taxa da NTN-B, do dado aberto do Tesouro Transparente.

O site não lê o Excel: lê os JSON gerados a partir dele.

```bash
python3 scripts/gerar_dados.py
git add dados && git commit -m "Atualiza dados" && git push
```

O script usa só a biblioteca padrão do Python (não precisa instalar nada) e
aceita outro caminho como argumento, se a planilha dos presidentes mudar de
nome. Nenhum download é obrigatório: o que não baixar fica como está na
planilha (ou, na NTN-B, nos meses que já estavam no JSON), e o script diz na
tela qual foi — rede fora do ar não apaga série nem derruba a rodada.

| Arquivo | O que tem |
|---|---|
| `dados/indicadores.json` | Uma série por indicador (mensal ou trimestral) |
| `dados/mandatos.json` | Início, fim e cor de cada governo (aba *Presidentes*) |

Uma série sem nenhum valor na coluna aparece como cartão "sem dados ainda" —
basta preencher a coluna e rodar o script de novo. Hoje não há nenhuma.

### Atualização automática pelo SGS

A planilha é a **memória** do site; quem a mantém no mês corrente é o SGS do
Banco Central, de graça e sem chave
(`api.bcb.gov.br/dados/serie/bcdata.sgs.<código>/dados?formato=json`). Oito
séries são refeitas de lá a cada rodada, com estas contas:

| Cartão | Código(s) | Conta |
|---|---|---|
| Selic Over | 4189 | ÷ 100 (o SGS publica em % a.a.) |
| Dólar | 3697, 3698 | média de compra e venda, **média do mês** |
| Resultado Primário | 5783 + 5786 | −(soma) ÷ 100 |
| Dívida Bruta, % do PIB | 4502 ÷ 4382 | dívida bruta sobre PIB de 12 meses |
| IED | 22885 | **soma móvel de 12 meses** do IDP mensal |
| Endividamento das Famílias | 29038 | ÷ 100 |
| Ibovespa em dólar | 3695, 3696 | Ibovespa ÷ dólar do **fim do mês** |
| Dívida Bruta (mandatos) | — | refeita de `divida-pib`, já atualizada |

Cada conta foi conferida mês a mês contra a coluna correspondente da planilha
antes de entrar aqui, e **onde as duas existem elas dão o mesmo número**: o
dólar, o primário e a dívida/PIB batem em **todos** os meses; a Selic bate em
todos menos o último da planilha; o endividamento, em todos menos os dois
últimos; o IED bate de dez/1995 a nov/2023, e de novo em dez/2024. O que o SGS
acrescenta é de três tipos:

1. **meses novos** — é o ponto de rodar;
2. **revisões do Banco Central** — o endividamento das famílias, por exemplo,
   saiu de 30,83% para 30,77% em jun/2026 depois de a planilha ser preenchida.
   No IED elas são grandes: a diferença contra a planilha é de exatamente
   +2.399,7 em doze somas seguidas (dez/2023 a nov/2024) e zero em dez/2024 —
   assinatura de **um** mês revisado, dez/2023, que é o único mês comum àquelas
   doze janelas de 12 meses e cai fora da décima terceira. De 2025 em diante há
   mais, até US$ 11,5 bi em jun/2025;
3. **o mês que estava provisório** — a planilha foi fechada em 30/09/2026, antes
   de setembro acabar, e por isso trazia Selic de 13,85% (o certo é 13,78%) e
   Ibovespa de 185.547 (fechou em 186.340).

Três detalhes que não são óbvios:

- **O "governo geral" do primário não existe como série única.** É a soma de
  duas linhas do NFSP: 5783 (Governo Federal e Banco Central) e 5786 (governos
  estaduais e municipais) — o setor público consolidado (5793) inclui as
  empresas estatais e dá outro número, 0,05 a 0,08 p.p. acima. O SGS publica o
  **déficit** com sinal positivo; aqui o superávit é que é positivo, como na
  planilha, daí o sinal invertido.
- **O dólar aparece em duas contas diferentes**, e é de propósito: o cartão do
  dólar mostra a **média do mês** (3697/3698) e o Ibovespa em dólar divide pelo
  dólar do **fim do mês** (3695/3696). Era assim na planilha, e o script
  reconfere isso a cada rodada: se a segunda conta deixar de reproduzir a coluna
  F com erro menor que um ponto, ele para em vez de gravar.
- **O SGS vem de muito antes de 1995** — a série do dólar começa em 1953, em
  cruzeiros, três trocas de moeda atrás. Quem decide onde cada série começa é a
  planilha: `aplicar` sobrepõe do primeiro mês da coluna em diante, nunca antes.

O mês corrente é um caso à parte. A média mensal do dólar só sai quando o mês
acaba, então enquanto isso vale a **PTAX do último dia publicado** (séries
diárias 1 e 10813 — que o SGS recusa se pedidas inteiras, com HTTP 406, e por
isso vão com data de início). O Ibovespa do mês corrente é o fechamento do
último pregão. Os dois são provisórios por construção, e a rodada seguinte
corrige sozinha.

A precisão do IED cai um pouco: a planilha guardava o IDP com seis casas
decimais e o SGS publica com uma, então a soma de 12 meses muda na primeira casa
(10.791,687 → 10.791,7 em dez/1996). Em US$ milhões, num cartão que mostra
inteiros, é invisível — mas o log avisa quantos meses mudaram, para uma revisão
de verdade não se esconder atrás disso.

### O Ibovespa

O SGS tinha o Ibovespa na série 7 e ela foi **desativada** (responde corpo
vazio), e a B3 publica a cotação do momento mas não o histórico. O que sobra de
público é a série diária do `^BVSP`, de onde sai o fechamento do último pregão
de cada mês; o último valor dela é confrontado com a cotação que a própria B3
publica, e se as duas discordarem em mais de 1% o mês corrente **não entra**
(com a bolsa aberta elas discordam mesmo: a B3 devolve o preço do momento e o
histórico só anda no fechamento). Os meses já fechados entram de qualquer forma.

A sobreposição do Ibovespa é a única que não vale para a série inteira: começa
no último mês que a planilha tem. Fechamento não se revisa, e a fonte arredonda
— reescrever trinta anos de história só traria ruído de um ponto para cá e para
lá.

### Δ e Média de cada mandato

Calculados na hora de desenhar. A **média** é dos meses visíveis da faixa. O
**Δ** vai do **último mês do mandato anterior** até o último mês deste: a posse
é em 1º de janeiro, então o que acontece em janeiro já é de quem entrou, e medir
a partir do primeiro mês dele deixaria esse pedaço sem dono. É o mesmo ponto de
partida do gráfico de comparação entre mandatos, onde o mês 0 é o mês anterior
à posse — e é o que faz os Δ fecharem: na dívida/PIB eles somam +54,3 p.p., que
é exatamente a distância entre 40,2% em jan/1998 e 94,5% em ago/2026.

A base sai da série inteira, não só do trecho visível, para o Δ de um mandato
não mudar quando se troca o botão de "Início:". No primeiro mandato da série não
há mês anterior, e aí o Δ parte do primeiro mês da faixa mesmo.

O campo `variacao` em `scripts/gerar_dados.py` escolhe a conta:

| `variacao` | Δ mostrado | Usado em |
|---|---|---|
| `"pct"` | variação % do primeiro ao último mês | Ibovespa, Ibovespa em dólar, IED |
| `"abs"` | diferença do primeiro ao último mês — em p.p. quando a série já é % | Selic, IPCA, Dólar, Primário, Endividamento |
| `"soma"` | `Total:` do período, e a média vira por mês | IPOs (contagem) |

O Δ sai **verde quando positivo e vermelho quando negativo** (`Total:` dos IPOs
fica neutro — não é variação). Nome, Δ e média usam **o mesmo corpo de fonte em
todas as faixas**: o maior que caiba sem dois rótulos vizinhos se encostarem —
por isso um mandato curto não ganha letra menor, e sim todos ficam do tamanho
que ele permite.

`minEixo` trava o piso do eixo Y (o Endividamento começa em 10%).

Para o gráfico caber, a escala do eixo Y ganha folga no topo até a linha passar
por baixo dos retratos; quando nem assim cabe, o retrato encolhe.

### Para mudar título, unidade ou casas decimais

Fica no topo de `scripts/gerar_dados.py` (lista `INDICADORES`). As unidades das
oito séries que vêm do SGS estão **confirmadas** — a conta de cada uma reproduz
a coluna da planilha mês a mês, e é isso que o script confere a cada rodada.
Das outras, os rótulos continuam sendo suposições:

- IPCA = variação acumulada em 12 meses (do Excel).
- IPOs = número de IPOs por mês (do Excel).
- Resultado Primário = % do PIB em 12 meses, governo geral; Endividamento =
  % da renda acumulada em 12 meses, exc. crédito habitacional; IED = US$
  milhões acumulados em 12 meses — os três confirmados contra o SGS.
- A fonte do rodapé de cada gráfico é "BCB e Liberta" (`FONTE_PADRAO`), menos onde
  o indicador define a sua: Ibovespa e IPOs "B3 e Liberta", Ibovespa em dólar
  "B3, BCB e Liberta" (campo `fonte` em `INDICADORES`).

### Comparação entre mandatos (Dívida Bruta)

Cada mandato vira uma linha, com o eixo X em meses desde a posse e o valor em
p.p. do PIB acumulados desde o mês anterior à posse (mês 0 = zero).

Esse gráfico é **calculado pelo script** (`compara_mandatos`), a partir da
mesma série do cartão de cima — a dívida/PIB da coluna AL. Para cada mandato:
valor do mês menos o valor do mês anterior à posse, vezes 100. Nada de tabela
pronta: antes ele lia uma feita à mão na aba "Dívida Bruta", e aquela tabela
dividia Dilma e Temer em **abr/mai de 2016** enquanto as faixas de governo de
todos os outros gráficos usam **jul/ago de 2016**. Agora os dois vêm do mesmo
lugar, a aba "Presidentes" (`le_periodos`), e o site inteiro conta os mandatos
igual. O que mudou na prática: Dilma II passou de 16 para 19 meses e de +9,4
para **+11,3 p.p.**; Temer, de 32 para 29 meses e de +13,8 para **+11,9 p.p.**
Os outros seis mandatos não mudaram nem uma casa decimal.

O teste que fecha a conta: somados, os oito mandatos dão **+43,943 p.p.**, que é
exatamente o que a dívida andou de dez/1998 (50,587%) a ago/2026 (94,530%) —
cada mandato começa onde o anterior parou, sem sobra nem buraco.

Mandato que começa antes do primeiro mês da série fica de fora (FHC I, porque a
série começa em jan/1998 e não há dez/1994 de onde partir). Se faltasse um mês
no meio de um mandato, a linha pararia ali: o eixo X é "meses desde a posse", e
pular um mês deslocaria todo o resto.

### PIB, dívida/PIB e juro real longo

Três acréscimos que não saem da aba *Outros Indicadores*:

- **Dívida Bruta do Governo Geral, % do PIB** — coluna **AL** da aba
  *Dívida Bruta* (a dívida bruta, SGS 4502, dividida pelo PIB de 12 meses,
  SGS 4382), com a data na coluna AJ da mesma aba — e, de fev/1998 em diante,
  a mesma divisão feita direto no SGS, que é o que mantém a série em dia. São
  344 meses, de jan/1998 a ago/2026. É outro cartão: o antigo continua sendo a comparação entre
  mandatos, em p.p. acumulados desde a posse. Os dois dizem no subtítulo que a
  dívida bruta aqui é a da **metodologia do FMI**, que conta os títulos do
  Tesouro na carteira do Banco Central — é a diferença que faz o número ficar
  bem acima do que o BC publica na metodologia dele. O eixo dele começa em 30%
  (`minEixo`) porque a dívida nunca chegou perto de zero: com o piso em zero, a
  folga que os retratos exigem no topo empurrava o eixo até 200% e a linha
  ficava espremida no rodapé;
- **PIB** — de `dados/PIB Brasil.xlsx`. As duas abas são trimestrais, e o
  trimestre vira o mês em que ele fecha (1996.I → 1996-03). Como a série anda
  de 3 em 3 meses, essas séries levam `buracoMax: 3` no JSON: sem isso o site
  cortaria a linha a cada ponto, porque o corte padrão é de um mês. As contas
  ficam em `OPCOES_PIB` e as cores em `COR_PIB`, no script — para tirar,
  acrescentar ou recolorir uma, basta mexer nessas listas.

  No gráfico de **variação real**, a média de cada mandato é **geométrica**:
  `(∏(1+g))^(1/n) − 1` sobre as variações em 12 meses dos trimestres do
  mandato. Taxa de crescimento não se acumula somando — a aritmética
  superestima, e é a geométrica que responde "qual taxa, repetida, daria o
  mesmo crescimento composto". Com janelas de 4 trimestres que se sobrepõem ela
  é uma aproximação do crescimento anualizado do período, não a conta exata
  (essa exigiria o nível do PIB, não a taxa). O mesmo gráfico **não mostra Δ**:
  a diferença entre a taxa do primeiro e a do último trimestre compara duas
  taxas, não dois níveis, e não significa nada. Quem manda nisso são os campos
  `media="geometrica"` e `semDelta` do indicador;
- **Juro real longo (NTN-B)** — baixado do CSV aberto do Tesouro Transparente
  (a API da B3 foi desativada e responde 410). É a taxa da **NTN-B 2045**,
  média entre compra e venda no último pregão de cada mês, de dez/2004 até
  hoje. O vencimento fica em `VENC_NTNB`, no script. (O `app.js` sabe pintar
  trechos de uma linha em cores diferentes, pelo campo `segmentos` da série —
  ficou de quando o gráfico emendava a 2045 com a 2050; hoje nenhuma série
  usa.)

### Rating soberano

Vem da aba **"Base Rating 2"**, lida por `le_rating`, e ocupa um cartão só, com
botões para trocar de agência (Moody's, S&P e Fitch). Da aba saem três coisas:

* a **escala** (colunas AN–AP): nível 4 a 16, com o rótulo da Moody's (`Caa2`…`A2`)
  e o da S&P/Fitch (`CCC`…`A`). O grau de investimento começa no nível 12
  (Baa3 / BBB-), e é ele que a linha tracejada marca no gráfico;
* as **séries mensais** de cada agência — nota em moeda estrangeira (linha cheia)
  e em moeda local (tracejada). No JSON só vão os meses em que a nota muda: o
  site repete a última até a mudança seguinte, e `null` marca mês sem nota
  (a Fitch tem alguns buracos na nota em moeda local em 2000 e 2002);
* as **ações de rating** (colunas S–U, Z–AB e AG–AI): data do anúncio, nível e
  perspectiva. Cada uma vira um marcador em cima da linha — triângulo verde
  (positiva), círculo cinza (estável) e losango vermelho (negativa). As ações
  antigas sem perspectiva divulgada (as seis primeiras da Fitch e a primeira da
  Moody's) ficam sem marcador, como no modelo do Excel.

Os dados são os da planilha, sem ajuste. Vale notar que ela traz a Moody's em
moeda local abaixo da nota em moeda estrangeira entre set/1998 e set/2000
(Caa1 contra B2) — se isso for erro de digitação, corrija na aba e rode o script
de novo.

O CSV desse cartão sai com um mês por linha: nota nas duas moedas, nível,
perspectiva e governo.

### Governos

`GOVERNOS` no mesmo script agrupa os mandatos da aba *Presidentes*: mandatos
seguidos da mesma pessoa viram uma faixa só (FHC I+II, Lula I+II, Dilma I+II).
As cores foram amostradas do modelo feito no PowerPoint e só servem para
distinguir uma faixa da outra. Cada faixa aponta para o retrato oficial em
`assets/presidentes/` — trocar a foto é trocar o arquivo, mantendo o nome.

Antes deles vem `ANTERIORES`, escrito à mão no script porque a aba *Presidentes*
começa no FHC: Sarney (mar/1985), Collor (mar/1990) e Itamar (out/1992, quando o
Senado afastou Collor). Só aparecem no gráfico de rating, que é o único com dados
anteriores a 1995, e não têm retrato.

## Testar localmente

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## Estrutura

```
index.html  styles.css  app.js
assets/     fundo.jpg, logo.png, logo-claro.png (logo para o tema claro), favicon.svg
            presidentes/ — retratos oficiais usados nas faixas
dados/      indicadores.json, mandatos.json (gerados)
scripts/    gerar_dados.py
```
