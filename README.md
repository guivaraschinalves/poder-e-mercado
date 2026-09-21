# Poder & Mercado

Indicadores da economia brasileira desde 1995, cada um num gráfico com o
fundo colorido por governo (FHC I e II, Lula I e II, Dilma I e II, Temer,
Bolsonaro e Lula), com o retrato oficial do presidente e, embaixo dele, a
variação e a média do período. Site estático, sem build: `index.html` +
`app.js` + `styles.css`, com os dados em `dados/`.

- **Modo escuro/claro** — botão no topo (o escuro é o padrão e reproduz o
  visual do gráfico de referência; a escolha fica salva no navegador).
- **Baixar** — em cada gráfico: PNG 1920×1080 (no tema que estiver na tela),
  SVG editável e CSV com os dados.
- **Período** — Tudo / 20 / 10 / 5 anos. O IPCA abre em 1996 porque o valor de
  jan/1995 (631%) achata todo o resto; "Tudo" mostra desde 1995.
- Passe o mouse (ou toque) no gráfico para ver o valor do mês e o governo.
- Na largura de celular o gráfico vira retrato e mostra só as fotos e os nomes:
  os números do mandato não cabem em faixa estreita sem virar borrão.

## Como atualizar os dados

Os dados vêm do Excel `Presidentes da República.xlsx` (abas *Outros
Indicadores* e *Presidentes*). O Excel **não** é publicado — só os JSON
gerados a partir dele:

```bash
python3 scripts/gerar_dados.py "caminho/Presidentes da República.xlsx"
git add dados && git commit -m "Atualiza dados" && git push
```

O script usa só a biblioteca padrão do Python (não precisa instalar nada).

| Arquivo | O que tem |
|---|---|
| `dados/indicadores.json` | Uma série mensal por coluna da aba *Outros Indicadores* |
| `dados/mandatos.json` | Início, fim e cor de cada governo (aba *Presidentes*) |

Uma série sem nenhum valor na coluna (hoje **Dívida Líquida** e **Dívida
Bruta**) aparece como cartão "sem dados ainda" — basta preencher a coluna e
rodar o script de novo.

### Δ e Média de cada mandato

Calculados na hora de desenhar, sobre os meses **visíveis** da faixa (com
"Tudo" selecionado, é o mandato inteiro). O campo `variacao` em
`scripts/gerar_dados.py` escolhe a conta:

| `variacao` | Δ mostrado | Usado em |
|---|---|---|
| `"pct"` | variação % do primeiro ao último mês | Ibovespa, Ibovespa em dólar, IED |
| `"abs"` | diferença do primeiro ao último mês — em p.p. quando a série já é % | Selic, IPCA, Dólar, Primário, Endividamento |
| `"soma"` | `Total:` do período, e a média vira por mês | IPOs (contagem) |

`minEixo` trava o piso do eixo Y (o Endividamento começa em 10%).

Para o gráfico caber, a escala do eixo Y ganha folga no topo até a linha passar
por baixo dos retratos; quando nem assim cabe, o retrato encolhe.

### Para mudar título, unidade ou casas decimais

Fica no topo de `scripts/gerar_dados.py` (lista `INDICADORES`). Os rótulos de
unidade são **suposições** a confirmar contra o Excel:

- IPCA = variação acumulada em 12 meses; Resultado Primário = % do PIB;
  Endividamento = fração da renda (como está formatado no Excel).
- IED = US$ milhões; IPOs = número de IPOs por mês.
- A fonte do rodapé ("BCB e FtM") é a mesma para todos (`FONTE_PADRAO`).

### Governos

`GOVERNOS` no mesmo script agrupa os mandatos da aba *Presidentes*: mandatos
seguidos da mesma pessoa viram uma faixa só (FHC I+II, Lula I+II, Dilma I+II).
As cores foram amostradas do modelo feito no PowerPoint e só servem para
distinguir uma faixa da outra. Cada faixa aponta para o retrato oficial em
`assets/presidentes/` — trocar a foto é trocar o arquivo, mantendo o nome.

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
