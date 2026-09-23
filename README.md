# Poder & Mercado

Indicadores da economia brasileira desde 1995, cada um num gráfico com o
fundo colorido por governo (FHC I e II, Lula I e II, Dilma I e II, Temer,
Bolsonaro e Lula), com o retrato oficial do presidente e, embaixo dele, a
variação e a média do período. Site estático, sem build: `index.html` +
`app.js` + `styles.css`, com os dados em `dados/`.

- **Modo escuro/claro** — botão no topo (o escuro é o padrão e reproduz o
  visual do gráfico de referência; a escolha fica salva no navegador).
- **Baixar** — em cada gráfico, no tema da tela, em PNG, JPG, PDF ou SVG
  editável, e o CSV com os dados. Tamanhos (todos em 2×, para sair nítido):
  apresentação 16:9 (3840×2160) e Instagram feed 4:5 (2160×2700), feed 3:4
  (2160×2880), quadrado 1:1 (2160×2160) e Stories 9:16 (2160×3840, com o
  gráfico dentro da área segura, longe das barras do app).
- **Rating soberano** — um cartão só, com botões para ver Moody's, S&P ou
  Fitch, a nota em moeda estrangeira e em moeda local, cada ação de rating
  marcada com a perspectiva anunciada e a linha do grau de investimento.
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

Os dados vêm do Excel `dados/Presidentes da República.xlsx` (abas *Outros
Indicadores*, *Presidentes*, *Dívida Bruta* e *Base Rating 2*). O site não lê o
Excel: lê os JSON gerados a partir dele.

```bash
python3 scripts/gerar_dados.py "dados/Presidentes da República.xlsx"
git add dados && git commit -m "Atualiza dados" && git push
```

O script usa só a biblioteca padrão do Python (não precisa instalar nada).

| Arquivo | O que tem |
|---|---|
| `dados/indicadores.json` | Uma série mensal por coluna da aba *Outros Indicadores* |
| `dados/mandatos.json` | Início, fim e cor de cada governo (aba *Presidentes*) |

Uma série sem nenhum valor na coluna (hoje **Dívida Líquida**) aparece como
cartão "sem dados ainda" — basta preencher a coluna e
rodar o script de novo.

### Δ e Média de cada mandato

Calculados na hora de desenhar, sobre os meses **visíveis** da faixa (começando
no primeiro mandato disponível, é o mandato inteiro). O campo `variacao` em
`scripts/gerar_dados.py` escolhe a conta:

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
