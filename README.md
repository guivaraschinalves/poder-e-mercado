# Poder & Mercado

Indicadores da economia brasileira desde 1995, cada um num gráfico com o
fundo colorido por governo (FHC, Lula I, Lula II, Dilma, Temer, Bolsonaro e
Lula III). Site estático, sem build: `index.html` + `app.js` + `styles.css`,
com os dados em `dados/`.

- **Modo escuro/claro** — botão no topo (o escuro é o padrão e reproduz o
  visual do gráfico de referência; a escolha fica salva no navegador).
- **Baixar** — em cada gráfico: PNG 1920×1080 (no tema que estiver na tela),
  SVG editável e CSV com os dados.
- **Período** — Tudo / 20 / 10 / 5 anos. O IPCA abre em 1996 porque o valor de
  jan/1995 (631%) achata todo o resto; "Tudo" mostra desde 1995.
- Passe o mouse (ou toque) no gráfico para ver o valor do mês e o governo.

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

### Para mudar título, unidade ou casas decimais

Fica no topo de `scripts/gerar_dados.py` (lista `INDICADORES`). Os rótulos de
unidade são **suposições** a confirmar contra o Excel:

- IPCA = variação acumulada em 12 meses; Resultado Primário = % do PIB;
  Endividamento = fração da renda (como está formatado no Excel).
- IED = US$ milhões; IPOs = número de IPOs por mês.
- A fonte do rodapé ("BCB e FtM") é a mesma para todos (`FONTE_PADRAO`).

### Governos

`GOVERNOS` no mesmo script agrupa os mandatos da aba *Presidentes*: FHC (I+II)
e Dilma (I+II) viram uma faixa cada; o resto segue o Excel. As cores só
distinguem os governos entre si.

## Testar localmente

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## Estrutura

```
index.html  styles.css  app.js
assets/     fundo.jpg, logo.png, logo-claro.png (logo para o tema claro), favicon.svg
dados/      indicadores.json, mandatos.json (gerados)
scripts/    gerar_dados.py
```
