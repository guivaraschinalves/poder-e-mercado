#!/usr/bin/env python3
"""
Lê o Excel "Presidentes da República.xlsx" e escreve os dois JSON que o site
consome:

  dados/indicadores.json  — uma série por indicador: as mensais da aba "Outros
                            Indicadores", a comparação entre mandatos da aba
                            "Dívida Bruta" e o rating da aba "Base Rating 2"
  dados/mandatos.json     — faixas de governo, derivadas da aba "Presidentes"

Uso:
    python3 scripts/gerar_dados.py "dados/Presidentes da República.xlsx"

Só usa a biblioteca padrão (zipfile + xml): não precisa de openpyxl/pandas.
O site lê só os JSON — o .xlsx fica no repositório apenas como fonte.
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
# variacao: como o Δ de cada mandato é calculado — "abs" (último menos primeiro
# mês, na unidade da série; em p.p. quando é %), "pct" (variação percentual) ou
# "soma" (total do período, para contagem).
# minEixo: trava o piso do eixo Y (senão ele é escolhido pelos dados).
INDICADORES = [
    ("B", "selic", dict(titulo="Selic Over", subtitulo="% a.a.", formato="pct", casas=2, tipo="linha",
                        variacao="abs")),
    ("C", "ipca", dict(titulo="IPCA", subtitulo="Var. % acumulada em 12 meses", formato="pct", casas=2, tipo="linha",
                       variacao="abs", inicioPadrao="1996-01")),
    ("D", "dolar", dict(titulo="Dólar", subtitulo="R$ por US$", formato="num", casas=2, prefixo="R$ ",
                        tipo="linha", variacao="abs")),
    ("E", "ibov", dict(titulo="Ibovespa", subtitulo="Pontos", formato="num", casas=0, tipo="linha",
                       variacao="pct", fonte="B3 e Liberta")),
    ("F", "ibov-dolar", dict(titulo="Ibovespa em dólar", subtitulo="Pontos (Ibovespa / dólar)", formato="num",
                             casas=0, tipo="linha", variacao="pct", fonte="B3, BCB e Liberta")),
    ("G", "primario", dict(titulo="Resultado Primário do Governo Geral", subtitulo="% do PIB", formato="pct", casas=2,
                           tipo="linha", variacao="abs")),
    ("H", "divida-liquida", dict(titulo="Dívida Líquida", subtitulo="% do PIB", formato="pct", casas=2,
                                 tipo="linha", variacao="abs")),
    # comparação entre mandatos: vem da última tabela da aba "Dívida Bruta" (em p.p.)
    ("I", "divida-bruta", dict(titulo="Dívida Bruta do Governo Geral",
                               subtitulo="Variação desde o início do mandato, em p.p. do PIB",
                               formato="pp", casas=1, tipo="comparacao", aba="Dívida Bruta")),
    ("J", "ied", dict(titulo="Investimento Estrangeiro Direto", subtitulo="US$ milhões", formato="num", casas=0,
                      prefixo="US$ ", sufixo=" mi", tipo="linha", variacao="pct")),
    ("K", "familias", dict(titulo="Endividamento das Famílias", subtitulo="Exc. crédito habitacional", formato="pct",
                           casas=2, tipo="linha", variacao="abs", minEixo=0.10)),
    ("L", "ipos", dict(titulo="IPOs na B3", subtitulo="Número de IPOs por mês, a partir de abril de 2004",
                       formato="int", casas=0, tipo="barras", variacao="soma", fonte="B3 e Liberta")),
    # rating soberano: vem da aba "Base Rating 2", uma agência por vez no site
    ("M", "rating", dict(titulo="Rating Soberano do Brasil",
                         subtitulo="Nota de crédito de longo prazo", tipo="rating",
                         aba="Base Rating 2", fonte="Moody's, S&P, Fitch e Liberta")),
]

# fonte do rodapé de cada gráfico, quando o indicador não define a sua
FONTE_PADRAO = "BCB e Liberta"
# fonte citada no rodapé da página (todas as séries)
FONTE_SITE = "BCB, B3 e Liberta"

# Presidentes da aba "Presidentes" → faixas exibidas. Os mandatos seguidos da
# mesma pessoa viram uma faixa só (FHC I+II, Lula I+II, Dilma I+II), como no
# modelo feito no PowerPoint. As cores foram amostradas desse modelo; a foto é
# o retrato oficial de cada presidente, em assets/presidentes/.
GOVERNOS = [
    ("fhc", "FHC I e II", ["FHC I", "FHC II"], "#2E5072", "fhc.jpg"),
    ("lula12", "Lula I e II", ["Lula I", "Lula II"], "#8D5A2C", "lula12.jpg"),
    ("dilma", "Dilma I e II", ["Dilma I", "Dilma II"], "#6D3331", "dilma.jpg"),
    ("temer", "Temer", ["Temer"], "#12304E", "temer.jpg"),
    ("bolsonaro", "Bolsonaro", ["Bolsonaro"], "#2E6875", "bolsonaro.jpg"),
    ("lula3", "Lula", ["Lula III"], "#687634", "lula3.jpg"),
]


# Presidentes anteriores a 1995. A aba "Presidentes" começa no FHC, mas o rating
# soberano vai até 1986 — sem estes, o começo do gráfico fica sem faixa. As datas
# são as do mês em que cada um assumiu de fato: Sarney em março de 1985, Collor
# em março de 1990 e Itamar em outubro de 1992, quando Collor foi afastado pelo
# Senado (a renúncia veio em 29/12/1992). Sem retrato: as faixas do rating não
# mostram foto. As outras séries começam em 1995 e nunca exibem estas faixas.
ANTERIORES = [
    dict(id="sarney", nome="Sarney", cor="#4E4A6E", foto=None, inicio="1985-03", fim="1990-02"),
    dict(id="collor", nome="Collor", cor="#7A4A63", foto=None, inicio="1990-03", fim="1992-09"),
    dict(id="itamar", nome="Itamar", cor="#3F5E4A", foto=None, inicio="1992-10", fim="1994-12"),
]


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


def col_num(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def le_comparacao(aba):
    """Tabela "mês do mandato × mandato": a última da aba, à direita do rótulo
    "Início do mandato". Linha 1 = nome do mandato; linhas 2, 3, … = mês 1, 2, …
    do mandato; as linhas "Início do mandato" e "Fim do mandato" dão as datas."""
    rotulos = [(c, r) for (c, r), v in aba.items() if v == "Início do mandato"]
    c0, r_ini = max(rotulos, key=lambda k: col_num(k[0]))
    colunas = sorted({c for (c, r) in aba if r == 1 and col_num(c) > col_num(c0)}, key=col_num)
    saida = []
    for c in colunas:
        valores = []
        for r in range(2, r_ini):
            v = aba.get((c, r))
            if not eh_numero(v):
                break
            valores.append(round(float(v), 4))
        saida.append(dict(nome=aba[(c, 1)].strip(), inicio=serial_para_mes(aba[(c, r_ini)]),
                          fim=serial_para_mes(aba[(c, r_ini + 1)]), dados=valores))
    return saida


# Aba "Base Rating 2": colunas de cada agência. Rótulos (moeda estrangeira,
# moeda local, perspectiva), níveis numéricos das duas notas e, mais à direita,
# a tabela de ações de rating (data do anúncio, nível e perspectiva).
AGENCIAS = [
    dict(id="moodys", nome="Moody's", escala="moody", rot=("B", "C", "D"), niv=("L", "M"),
         evt=("S", "T", "U")),
    dict(id="sp", nome="S&P", escala="spf", rot=("H", "I", "J"), niv=("P", "Q"),
         evt=("AG", "AH", "AI")),
    dict(id="fitch", nome="Fitch", escala="spf", rot=("E", "F", "G"), niv=("N", "O"),
         evt=("Z", "AA", "AB")),
]
NIVEL_GRAU_INVESTIMENTO = 12   # Baa3 / BBB-


def serial_para_dia(n):
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(n)))).isoformat()


def mudancas(pares):
    """[(mês, valor)] mensal → só os pontos em que o valor muda (o site repete
    o último até a mudança seguinte). None marca buraco na série."""
    saida, ant = [], "\0"
    for mes, v in pares:
        if v != ant:
            saida.append([mes, v])
            ant = v
    return saida


def le_rating(aba):
    """Escala de notas, séries mensais por agência (nota em moeda estrangeira e
    em moeda local) e a lista de ações de rating com a perspectiva de cada uma."""
    ultima = max(r for (c, r) in aba if c == "A" and eh_numero(aba[(c, r)]))
    meses = [(r, serial_para_mes(aba[("A", r)])) for r in range(2, ultima + 1) if ("A", r) in aba]

    escala = []
    for r in range(2, ultima + 1):
        if not eh_numero(aba.get(("AN", r))):
            break
        escala.append([int(float(aba[("AN", r)])), aba[("AO", r)], aba[("AP", r)]])

    def nivel(col, r):
        v = aba.get((col, r))
        return int(float(v)) if eh_numero(v) else None

    def rotulo(col, r):
        v = (aba.get((col, r)) or "").strip()
        return v if v not in ("", "-", "n/d") else None

    agencias = []
    for a in AGENCIAS:
        me = mudancas([(m, nivel(a["niv"][0], r)) for r, m in meses])
        ml = mudancas([(m, nivel(a["niv"][1], r)) for r, m in meses])
        persp = mudancas([(m, rotulo(a["rot"][2], r)) for r, m in meses])
        eventos = []
        for r in range(2, ultima + 1):
            d, n, p = (aba.get((c, r)) for c in a["evt"])
            if not eh_numero(d):
                continue
            if eh_numero(n):
                eventos.append([serial_para_dia(d), int(float(n)), (p or "").strip() or "n/d"])
        eventos.sort()
        com_dado = [m for r, m in meses if nivel(a["niv"][0], r) is not None]
        agencias.append(dict(id=a["id"], nome=a["nome"], escala=a["escala"],
                             inicio=com_dado[0], fim=com_dado[-1],
                             me=me, ml=ml, persp=persp, eventos=eventos))
    return dict(escala=escala, grauInvestimento=NIVEL_GRAU_INVESTIMENTO, agencias=agencias)


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

    saida = {"fonte": FONTE_SITE, "atualizado": datetime.date.today().isoformat(), "series": []}
    for col, id_, cfg in INDICADORES:
        if cfg.get("tipo") == "rating":
            rt = le_rating(abas[cfg["aba"]])
            cfg = {k: v for k, v in cfg.items() if k != "aba"}
            saida["series"].append(dict(id=id_, coluna="aba Base Rating 2", **cfg, **rt, dados=[]))
            for a in rt["agencias"]:
                print(f"  {id_:16s} {a['nome']:8s} {a['inicio']} → {a['fim']}  "
                      f"{len(a['me'])} mudanças (ME), {len(a['eventos'])} ações")
            continue
        if cfg.get("tipo") == "comparacao":
            cmp = le_comparacao(abas[cfg["aba"]])
            cfg = {k: v for k, v in cfg.items() if k != "aba"}
            saida["series"].append(dict(id=id_, coluna="aba " + id_, **{**cfg, "fonte": cfg.get("fonte", FONTE_PADRAO)},
                                        mandatos=cmp, dados=[]))
            print(f"  {id_:16s} comparação: " + ", ".join(f"{m['nome']} ({len(m['dados'])} meses)" for m in cmp))
            continue
        cabecalho = (ind.get((col, 1)) or "").strip()
        dados = []
        for r, mes in meses.items():
            v = ind.get((col, r))
            if eh_numero(v):
                dados.append([mes, round(float(v), 6)])
        serie = dict(id=id_, coluna=cabecalho, **{**cfg, "fonte": cfg.get("fonte", FONTE_PADRAO)}, dados=dados)
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

    mandatos = list(ANTERIORES)
    for id_, rotulo, partes, cor, foto in GOVERNOS:
        faixa = [periodos[p] for p in partes]
        mandatos.append(dict(id=id_, nome=rotulo, cor=cor, foto="assets/presidentes/" + foto,
                             inicio=min(f[0] for f in faixa), fim=max(f[1] for f in faixa)))
    with open(SAIDA_MANDATOS, "w", encoding="utf-8") as f:
        json.dump({"mandatos": mandatos}, f, ensure_ascii=False, indent=1)
    print("Mandatos:", [(m["nome"], m["inicio"], m["fim"]) for m in mandatos])


if __name__ == "__main__":
    main()
