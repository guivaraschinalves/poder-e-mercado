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

Os dados vêm de dois Excel em `dados/` e de um download:

- `Presidentes da República.xlsx` — abas *Outros Indicadores*, *Presidentes*,
  *Dívida Bruta* (a série no tempo e a comparação entre mandatos) e
  *Base Rating 2*;
- `PIB Brasil.xlsx` — abas *PIB Var. Real 4t* e *PIB Nominal*, trimestrais;
- a taxa da NTN-B, baixada do dado aberto do Tesouro Transparente.

O site não lê o Excel: lê os JSON gerados a partir dele.

```bash
python3 scripts/gerar_dados.py
git add dados && git commit -m "Atualiza dados" && git push
```

O script usa só a biblioteca padrão do Python (não precisa instalar nada) e
aceita outro caminho como argumento, se a planilha dos presidentes mudar de
nome. Se a rede falhar na hora de baixar a NTN-B, ele mantém os meses que já
estavam no JSON em vez de apagar a série.

| Arquivo | O que tem |
|---|---|
| `dados/indicadores.json` | Uma série por indicador (mensal ou trimestral) |
| `dados/mandatos.json` | Início, fim e cor de cada governo (aba *Presidentes*) |

Uma série sem nenhum valor na coluna aparece como cartão "sem dados ainda" —
basta preencher a coluna e rodar o script de novo. Hoje não há nenhuma.

### Δ e Média de cada mandato

Calculados na hora de desenhar. A **média** é dos meses visíveis da faixa. O
**Δ** vai do **último mês do mandato anterior** até o último mês deste: a posse
é em 1º de janeiro, então o que acontece em janeiro já é de quem entrou, e medir
a partir do primeiro mês dele deixaria esse pedaço sem dono. É o mesmo ponto de
partida do gráfico de comparação entre mandatos, onde o mês 0 é o dezembro
anterior — e é o que faz os Δ fecharem: na dívida/PIB eles somam +55,2 p.p., que
é exatamente a distância entre 40,2% em jan/1998 e 95,4% em jul/2026.

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

Fica no topo de `scripts/gerar_dados.py` (lista `INDICADORES`). Os rótulos de
unidade são **suposições** a confirmar contra o Excel:

- IPCA = variação acumulada em 12 meses; Resultado Primário = % do PIB;
  Endividamento = fração da renda (como está formatado no Excel).
- IED = US$ milhões; IPOs = número de IPOs por mês.
- A fonte do rodapé de cada gráfico é "BCB e Liberta" (`FONTE_PADRAO`), menos onde
  o indicador define a sua: Ibovespa e IPOs "B3 e Liberta", Ibovespa em dólar
  "B3, BCB e Liberta" (campo `fonte` em `INDICADORES`).

### Comparação entre mandatos (Dívida Bruta)

A Dívida Bruta não é uma série no tempo como as outras: vem da **última tabela
da aba "Dívida Bruta"** do Excel (a que está em p.p.), lida por `le_comparacao`.
Cada mandato vira uma linha, com o eixo X em meses desde a posse e o valor em
p.p. do PIB acumulados desde o mês anterior à posse (mês 0 = zero).

As contas são as da planilha: dívida bruta do governo geral (SGS 4502) dividida
pelo PIB de 12 meses (SGS 4382), e a diferença contra dezembro anterior. As
datas de mandato vêm da própria tabela — nela, Dilma II vai até abr/2016 e Temer
começa em mai/2016 (as faixas dos outros gráficos usam ago/2016, a posse
definitiva).

Para trocar o gráfico por outra tabela nesse formato, aponte `aba` no
`INDICADORES` para a aba desejada: a função procura o rótulo "Início do
mandato" mais à direita e lê a tabela que estiver depois dele.

### PIB, dívida/PIB e juro real longo

Três acréscimos que não saem da aba *Outros Indicadores*:

- **Dívida Bruta do Governo Geral, % do PIB** — coluna **AL** da aba
  *Dívida Bruta* (a dívida bruta, SGS 4502, dividida pelo PIB de 12 meses,
  SGS 4382), com a data na coluna AJ da mesma aba. São 343 meses, de jan/1998
  a jul/2026. É outro cartão: o antigo continua sendo a comparação entre
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
