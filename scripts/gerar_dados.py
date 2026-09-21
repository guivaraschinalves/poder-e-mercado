#!/usr/bin/env python3
"""
Lê o Excel "Presidentes da República.xlsx" e escreve os dois JSON que o site
consome:

  dados/indicadores.json  — uma série mensal por coluna da aba "Outros Indicadores"
  dados/mandatos.json     — faixas de governo, derivadas da aba "Presidentes"

Uso:
    python3 scripts/gerar_dados.py "caminho/Presidentes da República.xlsx"

Só usa a biblioteca padrão (zipfile + xml): não precisa de openpyxl/pandas.
O .xlsx não vai para o repositório — só os JSON gerados.
"""
import json
import os
import re
import sys
import zipfile
import datetime
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA_INDICADORES = os.path.join(RAIZ, "dados", "indicadores.json")
SAIDA_MANDATOS = os.path.join(RAIZ, "dados", "mandatos.json")

# Coluna do Excel → configuração do gráfico. A ordem daqui é a ordem na página.
# formato: "pct" (fração → %), "num" (número com casas), "int" (inteiro).
INDICADORES = [
    ("B", "selic", dict(titulo="Selic", subtitulo="% a.a.", formato="pct", casas=2, tipo="linha")),
    ("C", "ipca", dict(titulo="IPCA", subtitulo="Var. % acumulada em 12 meses", formato="pct", casas=2, tipo="linha",
                       inicioPadrao="1996-01")),
    ("D", "dolar", dict(titulo="Dólar", subtitulo="R$ por US$", formato="num", casas=2, prefixo="R$ ", tipo="linha")),
    ("E", "ibov", dict(titulo="Ibovespa", subtitulo="Pontos", formato="num", casas=0, tipo="linha")),
    ("F", "ibov-dolar", dict(titulo="Ibovespa em dólar", subtitulo="Pontos (Ibovespa / dólar)", formato="num", casas=0,
                             tipo="linha")),
    ("G", "primario", dict(titulo="Resultado Primário", subtitulo="% do PIB", formato="pct", casas=2, tipo="linha")),
    ("H", "divida-liquida", dict(titulo="Dívida Líquida", subtitulo="% do PIB", formato="pct", casas=2, tipo="linha")),
    ("I", "divida-bruta", dict(titulo="Dívida Bruta", subtitulo="% do PIB", formato="pct", casas=2, tipo="linha")),
    ("J", "ied", dict(titulo="Investimento Estrangeiro Direto", subtitulo="US$ milhões", formato="num", casas=0,
                      prefixo="US$ ", sufixo=" mi", tipo="linha")),
    ("K", "familias", dict(titulo="Endividamento das Famílias", subtitulo="Exc. crédito habitacional", formato="pct",
                           casas=2, tipo="linha")),
    ("L", "ipos", dict(titulo="IPOs na B3", subtitulo="Número de IPOs", formato="int", casas=0, tipo="barras")),
]

FONTE_PADRAO = "BCB e FtM"

# Presidentes da aba "Presidentes" → governos exibidos (FHC e Dilma unem os dois mandatos).
GOVERNOS = [
    ("fhc", "FHC", ["FHC I", "FHC II"], "#0fa3b1"),
    ("lula1", "Lula I", ["Lula I"], "#f2b134"),
    ("lula2", "Lula II", ["Lula II"], "#e4572e"),
    ("dilma", "Dilma", ["Dilma I", "Dilma II"], "#9b5de5"),
    ("temer", "Temer", ["Temer"], "#8d99ae"),
    ("bolsonaro", "Bolsonaro", ["Bolsonaro"], "#43aa8b"),
    ("lula3", "Lula III", ["Lula III"], "#f15bb5"),
]  # cores só distinguem os governos entre si — sem relação com partidos


def serial_para_mes(n):
    d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(n)))
    return d.strftime("%Y-%m")


def le_planilhas(caminho):
    """{nome da aba: {(coluna, linha): valor}} — só células com valor."""
    z = zipfile.ZipFile(caminho)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    abas = {}
    for s in wb.find("m:sheets", NS):
        alvo = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        alvo = alvo if alvo.startswith("xl/") else "xl/" + alvo
        celulas = {}
        for linha in ET.fromstring(z.read(alvo)).find("m:sheetData", NS):
            for c in linha:
                v = c.find("m:v", NS)
                if v is None or v.text is None:
                    continue
                col = re.match(r"[A-Z]+", c.get("r")).group()
                celulas[(col, int(c.get("r")[len(col):]))] = ss[int(v.text)] if c.get("t") == "s" else v.text
        abas[s.get("name")] = celulas
    return abas


def eh_numero(txt):
    try:
        float(txt)
        return True
    except (TypeError, ValueError):
        return False


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    abas = le_planilhas(sys.argv[1])
    ind = abas["Outros Indicadores"]
    pres = abas["Presidentes"]

    ultima = max(r for (c, r) in ind if c == "A" and eh_numero(ind[(c, r)]))
    meses = {r: serial_para_mes(ind[("A", r)]) for r in range(2, ultima + 1) if ("A", r) in ind}

    saida = {"fonte": FONTE_PADRAO, "atualizado": datetime.date.today().isoformat(), "series": []}
    for col, id_, cfg in INDICADORES:
        cabecalho = (ind.get((col, 1)) or "").strip()
        dados = []
        for r, mes in meses.items():
            v = ind.get((col, r))
            if eh_numero(v):
                dados.append([mes, round(float(v), 6)])
        serie = dict(id=id_, coluna=cabecalho, **cfg, dados=dados)
        saida["series"].append(serie)
        if dados:
            print(f"  {id_:16s} {len(dados):4d} meses  {dados[0][0]} → {dados[-1][0]}  último={dados[-1][1]}")
        else:
            print(f"  {id_:16s} sem dados na coluna {col} ({cabecalho})")

    # Uma série por bloco, com os pares [mês, valor] numa linha só (diff legível).
    with open(SAIDA_INDICADORES, "w", encoding="utf-8") as f:
        cab = {k: v for k, v in saida.items() if k != "series"}
        f.write("{\n")
        for k, v in cab.items():
            f.write(f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n")
        f.write(' "series": [\n')
        blocos = []
        for s in saida["series"]:
            meta = {k: v for k, v in s.items() if k != "dados"}
            dados = ",".join(json.dumps(par) for par in s["dados"])
            blocos.append("  " + json.dumps(meta, ensure_ascii=False)[:-1] + ', "dados": [' + dados + "]}")
        f.write(",\n".join(blocos) + "\n ]\n}\n")

    # Mandatos: para cada presidente, o primeiro e o último mês marcado com 100.
    ultima_p = max(r for (c, r) in pres if c == "A" and eh_numero(pres[(c, r)]))
    colunas = {pres[(c, 1)]: c for (c, r) in pres if r == 1 and c != "A"}
    periodos = {}
    for nome, col in colunas.items():
        marcados = [serial_para_mes(pres[("A", r)]) for r in range(2, ultima_p + 1) if (col, r) in pres]
        if marcados:
            periodos[nome] = (min(marcados), max(marcados))

    mandatos = []
    for id_, rotulo, partes, cor in GOVERNOS:
        faixa = [periodos[p] for p in partes]
        mandatos.append(dict(id=id_, nome=rotulo, cor=cor, inicio=min(f[0] for f in faixa), fim=max(f[1] for f in faixa)))
    with open(SAIDA_MANDATOS, "w", encoding="utf-8") as f:
        json.dump({"mandatos": mandatos}, f, ensure_ascii=False, indent=1)
    print("Mandatos:", [(m["nome"], m["inicio"], m["fim"]) for m in mandatos])


if __name__ == "__main__":
    main()
