#!/usr/bin/env python3
"""
Lê o Excel "Presidentes da República.xlsx" e escreve os dois JSON que o site
consome:

  dados/indicadores.json  — uma série por indicador: as mensais da aba "Outros
                            Indicadores", a comparação entre mandatos da aba
                            "Dívida Bruta" e o rating da aba "Base Rating 2"
  dados/mandatos.json     — faixas de governo, derivadas da aba "Presidentes"

Também lê "dados/PIB Brasil.xlsx" (abas trimestrais do PIB), baixa a taxa da
NTN-B do dado aberto do Tesouro Transparente e, no fim, põe no dado de hoje as
séries que o Banco Central publica no SGS e o Ibovespa (ver `atualizar`): a
planilha é o histórico, o SGS é quem revisa e quem está no mês mais recente.

Uso:
    python3 scripts/gerar_dados.py

Só usa a biblioteca padrão (zipfile + xml): não precisa de openpyxl/pandas.
O site lê só os JSON — o .xlsx fica no repositório apenas como fonte.
"""
import json
import os
import re
import sys
import time
import zipfile
import datetime
import urllib.request
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA_INDICADORES = os.path.join(RAIZ, "dados", "indicadores.json")
SAIDA_MANDATOS = os.path.join(RAIZ, "dados", "mandatos.json")
PLANILHA_PADRAO = os.path.join(RAIZ, "dados", "Presidentes da República.xlsx")
PLANILHA_PIB = os.path.join(RAIZ, "dados", "PIB Brasil.xlsx")

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
    # dívida/PIB no tempo: coluna AL da aba "Dívida Bruta" (4502 ÷ PIB de 12 meses),
    # com a data na coluna AJ da mesma aba
    ("AL", "divida-pib", dict(titulo="Dívida Bruta do Governo Geral",
                              subtitulo="% do PIB · metodologia do FMI, que conta os títulos do "
                                        "Tesouro na carteira do Banco Central",
                              formato="pct", casas=2, tipo="linha", variacao="abs", minEixo=0.30,
                              aba="Dívida Bruta", colunas=("AJ", "AL"))),
    # comparação entre mandatos: calculada aqui, a partir da série de cima
    # (divida-pib), e não de uma tabela pronta da planilha. Os mandatos são os
    # mesmos da aba "Presidentes" que desenha as faixas de governo do site —
    # foi isso que corrigiu a divisão Dilma/Temer (ver README).
    ("—", "divida-bruta", dict(titulo="Dívida Bruta do Governo Geral",
                               subtitulo="Variação acumulada, em p.p. do PIB, a partir do mês "
                                         "anterior à posse · metodologia do FMI",
                               formato="pp", casas=1, tipo="comparacao", derivaDe="divida-pib")),
    # PIB: vêm do "PIB Brasil.xlsx", uma conta por vez no site
    # média geométrica por mandato: a média aritmética de taxas de crescimento não
    # compõe, e a variação do primeiro ao último trimestre do mandato compara duas
    # taxas, não dois níveis — não significa nada, então sai
    ("—", "pib-demanda", dict(titulo="PIB pela ótica da demanda",
                              subtitulo="Variação real acumulada em 4 trimestres",
                              formato="pct", casas=2, tipo="linha", buracoMax=3,
                              media="geometrica", semDelta=True,
                              planilha="pib", aba="PIB Var. Real 4t", opcoes="demanda",
                              rotuloOpcoes="Conta:", fonte="IBGE e Liberta")),
    ("—", "pib-participacao", dict(titulo="Composição do PIB",
                                   subtitulo="Participação no PIB, acumulada em 4 trimestres",
                                   formato="pct", casas=2, tipo="linha", variacao="abs", buracoMax=3,
                                   planilha="pib", aba="PIB Nominal", opcoes="participacao",
                                   rotuloOpcoes="Componente:", fonte="IBGE e Liberta")),
    ("J", "ied", dict(titulo="Investimento Estrangeiro Direto", subtitulo="US$ milhões", formato="num", casas=0,
                      prefixo="US$ ", sufixo=" mi", tipo="linha", variacao="pct")),
    ("K", "familias", dict(titulo="Endividamento das Famílias", subtitulo="Exc. crédito habitacional", formato="pct",
                           casas=2, tipo="linha", variacao="abs", minEixo=0.10)),
    ("L", "ipos", dict(titulo="IPOs na B3", subtitulo="Número de IPOs por mês, a partir de abril de 2004",
                       formato="int", casas=0, tipo="barras", variacao="soma", fonte="B3 e Liberta")),
    # juro real longo: baixado do dado aberto do Tesouro (não vem do Excel)
    ("—", "ntnb", dict(titulo="Juro real longo", subtitulo="Taxa da NTN-B 2045 no último pregão do mês",
                       formato="pct", casas=2, tipo="linha", variacao="abs",
                       tesouro=True, fonte="Tesouro Nacional e Liberta")),
    # rating soberano: vem da aba "Base Rating 2", uma agência por vez no site
    ("M", "rating", dict(titulo="Rating Soberano do Brasil",
                         subtitulo="Nota de crédito de longo prazo", tipo="rating",
                         aba="Base Rating 2", fonte="Moody's, S&P, Fitch e Liberta")),
]

# fonte do rodapé de cada gráfico, quando o indicador não define a sua
FONTE_PADRAO = "BCB e Liberta"
# fonte citada no rodapé da página (todas as séries)
FONTE_SITE = "BCB, B3, IBGE, Tesouro Nacional e Liberta"

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
    ("lula3", "Lula III", ["Lula III"], "#687634", "lula3.jpg"),
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


def mes_mais(mes, n):
    a, m = map(int, mes.split("-"))
    t = a * 12 + (m - 1) + n
    return "%04d-%02d" % (t // 12, t % 12 + 1)


def compara_mandatos(dados, periodos):
    """Δ de cada mandato, mês a mês, em pontos percentuais.

    A conta é sempre a mesma da série de cima: valor do mês menos o valor do
    **mês anterior à posse**. O presidente toma posse em 5 de janeiro, então
    janeiro já é dele, e o mês 0 do gráfico (dezembro) é o que ele recebeu.

    Mandato que começa antes do primeiro mês da série fica de fora — não há de
    onde partir. Se faltar um mês no meio, a linha para ali: o eixo X é "meses
    desde a posse", e pular um mês deslocaria todo o resto.
    """
    por_mes = dict(dados)
    saida = []
    for nome, (inicio, fim) in sorted(periodos.items(), key=lambda kv: kv[1][0]):
        base = por_mes.get(mes_mais(inicio, -1))
        if base is None:
            continue
        valores, mes = [], inicio
        while mes <= fim and mes in por_mes:
            valores.append(round((por_mes[mes] - base) * 100, 3))
            mes = mes_mais(mes, 1)
        if valores:
            saida.append(dict(nome=nome, inicio=inicio, fim=fim, dados=valores))
    return saida


def le_periodos(pres):
    """{"Lula III": ("2023-01", "2026-12"), …} — da aba "Presidentes", que é a
    mesma origem das faixas de governo do site."""
    ultima = max(r for (c, r) in pres if c == "A" and eh_numero(pres[(c, r)]))
    colunas = {pres[(c, 1)]: c for (c, r) in pres if r == 1 and c != "A"}
    periodos = {}
    for nome, col in colunas.items():
        marcados = [serial_para_mes(pres[("A", r)]) for r in range(2, ultima + 1) if (col, r) in pres]
        if marcados:
            periodos[nome] = (min(marcados), max(marcados))
    return periodos


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


# --------------------------------------------------------------------------
# PIB (planilha "PIB Brasil.xlsx") e juro real longo (dado aberto do Tesouro)
# --------------------------------------------------------------------------

TRIMESTRE = {"I": "03", "II": "06", "III": "09", "IV": "12"}

# Uma opção por conta da ótica da demanda / por componente do PIB nominal. O
# site mostra uma por vez, num botão ao lado do "Início:".
# Cor de cada componente, a mesma nos dois cartões. None = cor da linha do tema
# (branca no escuro, azul-escura no claro), reservada para o PIB.
COR_PIB = {
    "pib": None,
    "consumo-familias": "#4CAF50",          # verde
    "consumo-governo": "#D94F4F",           # vermelho
    "fbc": "#7FB3E8",                       # azul
    "fbcf": "#A9CCF0",                      # azul mais claro, irmão do FBC
    "estoques": "#9A7FD0",                  # roxo
    "exportacao": "#2E6BC6",                # azul forte
    "importacao": "#F0913A",                # laranja
    "exportacoes-liquidas": "#3FA7A0",      # verde-azulado
}

OPCOES_PIB = {
    "demanda": [("B", "pib", "PIB"), ("C", "consumo-familias", "Consumo das Famílias"),
                ("D", "consumo-governo", "Consumo do Governo"),
                ("E", "fbc", "Formação Bruta de Capital"),
                ("F", "exportacao", "Exportação"), ("G", "importacao", "Importação")],
    "participacao": [("C", "consumo-familias", "Consumo das Famílias"),
                     ("D", "consumo-governo", "Consumo do Governo"),
                     ("E", "fbc", "Formação Bruta de Capital"),
                     ("F", "fbcf", "Formação Bruta de Capital Fixo"),
                     ("G", "estoques", "Variação de Estoques"),
                     ("H", "exportacao", "Exportação"), ("I", "importacao", "Importação"),
                     ("J", "exportacoes-liquidas", "Exportações Líquidas")],
}


def trimestre_para_mes(txt):
    """"1996.I" → "1996-03" (o mês em que o trimestre fecha)."""
    partes = str(txt).strip().split(".")
    if len(partes) != 2 or not partes[0].isdigit() or partes[1].strip() not in TRIMESTRE:
        return None
    return f"{int(partes[0]):04d}-{TRIMESTRE[partes[1].strip()]}"


def le_pib(aba, quais, col_trimestre):
    """Aba trimestral do PIB → uma lista de opções com os pares [mês, valor].
    Linha sem todas as contas fica de fora (o PIB nominal só tem a série cheia
    a partir de 1996.IV)."""
    ultima = max(r for (c, r) in aba)
    opcoes = []
    for col, id_, nome in quais:
        opcoes.append(dict(id=id_, nome=nome, cor=COR_PIB.get(id_), dados=[]))
    for r in range(1, ultima + 1):
        mes = trimestre_para_mes(aba.get((col_trimestre, r)))
        if not mes or any(not eh_numero(aba.get((c, r))) for c, _, _ in quais):
            continue
        for k, (col, _, _) in enumerate(quais):
            opcoes[k]["dados"].append([mes, round(float(aba[(col, r)]), 6)])
    return opcoes


def le_coluna_par(aba, col_data, col_valor):
    """Duas colunas soltas de uma aba (data em serial + valor) → [[mês, valor]]."""
    ultima = max(r for (c, r) in aba)
    fora = []
    for r in range(1, ultima + 1):
        d, v = aba.get((col_data, r)), aba.get((col_valor, r))
        if eh_numero(d) and eh_numero(v) and float(d) > 20000:
            fora.append([serial_para_mes(d), round(float(v), 6)])
    return fora


# Taxas do Tesouro Direto: CSV aberto do Tesouro Transparente, sem chave. A API
# da B3 (treasurybondsinfo.json) responde 410 desde que foi desativada.
CKAN_TAXAS = ("https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show"
              "?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto")
CSV_TAXAS = ("https://www.tesourotransparente.gov.br/ckan/dataset/"
             "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
             "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv")


VENC_NTNB = "2045"


def le_ntnb():
    """Taxa mensal (último pregão do mês) da NTN-B 2045, em fração de 1.
    Taxa = média entre compra e venda da manhã."""
    import csv
    import io as _io
    import urllib.request

    url = CSV_TAXAS
    try:
        req = urllib.request.Request(CKAN_TAXAS, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            for rec in json.load(r)["result"]["resources"]:
                if rec["format"].upper() == "CSV":
                    url = rec["url"]
                    break
    except Exception as e:
        print("  (CKAN não respondeu, usando a URL fixa:", e, ")")

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        bruto = r.read()

    por_mes = {}
    leitor = csv.DictReader(_io.StringIO(bruto.decode("latin-1")), delimiter=";")
    for linha in leitor:
        if linha["Tipo Titulo"].strip() != "Tesouro IPCA+ com Juros Semestrais":
            continue
        if linha["Data Vencimento"][-4:] != VENC_NTNB:
            continue
        d, m, a = linha["Data Base"].split("/")
        taxa = (float(linha["Taxa Compra Manha"].replace(",", "."))
                + float(linha["Taxa Venda Manha"].replace(",", "."))) / 2
        mes = f"{a}-{m}"
        atual = por_mes.get(mes)
        if atual is None or atual[0] < d:          # fica com o último pregão do mês
            por_mes[mes] = (d, taxa)
    return [[mes, round(por_mes[mes][1] / 100, 6)] for mes in sorted(por_mes)]


# --------------------------------------------------------------------------
# SGS: as séries do Banco Central, direto da API aberta (sem chave)
# --------------------------------------------------------------------------
# A planilha é o histórico do site, mas quase tudo nela vem do Banco Central, e
# no SGS as mesmas séries estão sempre no mês mais recente — e revisadas. Cada
# conta abaixo foi conferida mês a mês contra a coluna correspondente da
# planilha, e o script reimprime essa conferência a cada rodada: onde as duas
# existem, o SGS reproduz a coluna. O que ele acrescenta são os meses novos, as
# revisões do BC e o mês que estava provisório quando a planilha foi preenchida.
SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.%d/dados?formato=json"
# Séries diárias: o SGS responde 406 quando se pede uma delas inteira, então vão
# com data de início. Só interessa o último pregão (para fechar o mês corrente),
# e esta janela cobre feriado longo e atraso de publicação com folga.
DIARIAS = {1, 10813}
DIAS_PTAX = 120

# O que cada código é, para o log e o README não dependerem de consulta externa.
# Quem aparece no log é a lista do que foi baixado de fato (`BAIXADAS`), e não
# esta tabela: assim um código novo numa conta não some do relatório por
# esquecimento.
BAIXADAS = []
NOMES_SGS = {
    1: "dólar (venda) — PTAX diária",
    3695: "dólar (compra) — fim do mês",
    3696: "dólar (venda) — fim do mês",
    3697: "dólar (compra) — média do mês",
    3698: "dólar (venda) — média do mês",
    4189: "Selic acumulada no mês, anualizada",
    4382: "PIB acumulado em 12 meses, R$ milhões correntes",
    4502: "dívida bruta do governo geral, R$ milhões",
    5783: "resultado primário do Governo Federal e do BC, % do PIB em 12 meses",
    5786: "resultado primário dos governos estaduais e municipais, % do PIB em 12 meses",
    10813: "dólar (compra) — PTAX diária",
    22885: "investimento direto no país (IDP), líquido, US$ milhões no mês",
    29038: "endividamento das famílias exc. crédito habitacional, %",
}


def sgs(cod, tentativas=4):
    """Uma série do SGS → {"aaaa-mm-dd": valor}. O SGS data as séries mensais no
    dia 1º, então o mês é só os sete primeiros caracteres da chave.

    Ele devolve corpo vazio quando engasga (e a série 7, do Ibovespa, foi
    desativada e responde sempre assim), por isso as tentativas."""
    url = SGS % cod
    if cod in DIARIAS:
        inicio = datetime.date.today() - datetime.timedelta(days=DIAS_PTAX)
        url += "&dataInicial=" + inicio.strftime("%d/%m/%Y")
    erro = None
    for n in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url), timeout=180) as r:
                bruto = json.load(r)
            break
        except Exception as e:                      # inclui corpo vazio
            erro = e
            time.sleep(3)
    else:
        raise RuntimeError("SGS %d: %s" % (cod, erro))
    saida = {}
    for x in bruto:
        if x.get("valor") in (None, ""):
            continue
        d, m, a = x["data"].split("/")
        saida["%s-%s-%s" % (a, m, d)] = float(x["valor"])
    BAIXADAS.append(cod)
    return saida


def soma_movel(serie, n=12):
    """Soma dos n meses que terminam em cada mês. Mês sem os n−1 meses
    imediatamente anteriores fica de fora: um buraco no meio interrompe a conta
    em vez de somar 11 meses como se fossem 12."""
    meses = sorted(serie)
    saida = {}
    for i in range(n - 1, len(meses)):
        janela = meses[i - n + 1:i + 1]
        if mes_mais(janela[0], n - 1) != janela[-1]:
            continue
        saida[janela[-1]] = sum(serie[m] for m in janela)
    return saida


def series_do_sgs():
    """{id do indicador: {mês: valor}}, na mesma unidade da coluna da planilha,
    mais o dólar do fim do mês (que o Ibovespa em dólar usa) e o dia da PTAX
    que fechou o mês corrente."""
    cache = {}

    def dia(cod):
        if cod not in cache:
            cache[cod] = sgs(cod)
        return cache[cod]

    def mes(cod):
        return {d[:7]: v for d, v in dia(cod).items()}

    def ptax(compra, venda, casas):
        c, v = mes(compra), mes(venda)
        return {m: round((c[m] + v[m]) / 2, casas) for m in c if m in v}

    def completar(serie, casas):
        """O mês corrente não tem média nem fechamento mensal no SGS enquanto
        não acaba: entra com a PTAX do último dia publicado."""
        c, v = dia(10813), dia(1)
        ultimo = max(d for d in c if d in v)
        serie.setdefault(ultimo[:7], round((c[ultimo] + v[ultimo]) / 2, casas))
        return ultimo

    # o cartão do dólar é a média do mês; o do Ibovespa em dólar é o fim do mês.
    # Cinco casas: a média de dois valores de quatro casas tem no máximo cinco, e
    # é com cinco que a planilha guarda (5,64315, não 5,6432).
    dolar = ptax(3697, 3698, 5)
    fim_de_mes = ptax(3695, 3696, 6)
    ptax_de = completar(dolar, 5)
    completar(fim_de_mes, 6)

    # "governo geral" = Governo Federal e Banco Central + governos estaduais e
    # municipais, as duas linhas do NFSP que sobram tirando as empresas
    # estatais. O SGS publica o déficit com sinal positivo; aqui o superávit é
    # que é positivo, como na planilha.
    uniao, locais = mes(5783), mes(5786)
    primario = {m: round(-(uniao[m] + locais[m]) / 100, 4) for m in uniao if m in locais}

    divida, pib = mes(4502), mes(4382)

    series = {
        "selic": {m: round(v / 100, 4) for m, v in mes(4189).items()},
        "dolar": dolar,
        "primario": primario,
        "divida-pib": {m: round(divida[m] / pib[m], 6) for m in divida if m in pib},
        # o SGS publica o IDP mês a mês; o cartão mostra o acumulado em 12 meses
        "ied": {m: round(v, 6) for m, v in soma_movel(mes(22885)).items()},
        "familias": {m: round(v / 100, 4) for m, v in mes(29038).items()},
    }
    return series, fim_de_mes, ptax_de


# --------------------------------------------------------------------------
# Ibovespa
# --------------------------------------------------------------------------
# O SGS tinha o Ibovespa na série 7 e ela foi desativada (responde vazio), e a
# B3 só publica a cotação do momento, sem histórico. O que sobra de público é a
# série diária do ^BVSP; o último pregão dela é confrontado com a cotação da
# própria B3, para um número torto não entrar calado.
YAHOO_IBOV = ("https://query2.finance.yahoo.com/v8/finance/chart/%5EBVSP"
              "?interval=1d&range=2y")
B3_IBOV = "https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/IBOV"
# O quanto as duas fontes podem discordar no último pregão. Rodando com a bolsa
# aberta elas discordam de verdade: a B3 devolve a cotação do momento e o
# histórico do ^BVSP só anda no fechamento. Acima disto o mês corrente não entra
# — os meses fechados entram de qualquer forma, que esses ninguém revisa.
TOLERANCIA_IBOV = 0.01


def fechamentos_ibov():
    """{mês: fechamento do último pregão do mês} nos últimos dois anos, e a data
    e o valor do pregão mais recente. No mês corrente o "último pregão" é o de
    hoje — é de propósito, e a rodada seguinte corrige sozinha."""
    req = urllib.request.Request(YAHOO_IBOV, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)["chart"]["result"][0]
    por_dia = {}
    for t, v in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]):
        if v is None:
            continue
        d = datetime.datetime.fromtimestamp(t, datetime.timezone.utc)
        por_dia[d.strftime("%Y-%m-%d")] = v
    por_mes = {}
    for d in sorted(por_dia):
        por_mes[d[:7]] = float(round(por_dia[d]))
    ultimo = max(por_dia)
    return por_mes, ultimo, por_dia[ultimo]


def cotacao_b3():
    """O Ibovespa que a B3 publica agora, só para conferir o do ^BVSP."""
    with urllib.request.urlopen(urllib.request.Request(B3_IBOV), timeout=60) as r:
        return float(json.load(r)["Trad"][0]["scty"]["SctyQtn"]["curPrc"])


# --------------------------------------------------------------------------
# Juntar a planilha com o dado de hoje
# --------------------------------------------------------------------------

def aplicar(serie, nova, desde=None):
    """Sobrepõe `nova` à coluna da planilha — onde os dois têm o mês vale o
    dado baixado, que é o revisado — e conta no log o que a rodada mudou. Mês
    que só a planilha tem continua (o SGS 4502, por exemplo, começa em fev/1998
    e a coluna da dívida tem jan/1998).

    `desde` limita a sobreposição a um mês em diante. Sem ele a conta vale do
    primeiro mês da coluna em diante, e não antes: no SGS quase toda série
    começa bem antes de 1995 — a do dólar vem de 1953, em cruzeiros, e três
    trocas de moeda depois ela achataria o gráfico inteiro. Quem decide onde a
    série começa é a planilha; o SGS atualiza e estende para a frente.

    No Ibovespa o `desde` é explícito e mais curto ainda: o fechamento não é
    revisado nunca, e a fonte dele arredonda, então reescrever o passado só
    traria ruído de um ponto para cá e para lá."""
    velho = dict(serie["dados"])
    if desde is None and velho:
        desde = min(velho)
    junto = dict(velho)
    for m, v in nova.items():
        if desde is None or m >= desde:
            junto[m] = v
    serie["dados"] = [[m, junto[m]] for m in sorted(junto)]
    entrou = [m for m in sorted(junto) if m not in velho]
    mudou = [m for m in sorted(junto) if m in velho and junto[m] != velho[m]]
    print("  %-16s %4d meses  %s → %s" % (serie["id"], len(junto), min(junto), max(junto)))
    if entrou:
        print("    + %d novo(s): %s" % (len(entrou), ", ".join("%s %s" % (m, junto[m]) for m in entrou)))
    if mudou:
        # a contagem vem antes da lista porque ela é o que importa: um punhado de
        # meses é revisão do Banco Central, a série toda é mudança de precisão
        # (o IDP mensal do SGS tem uma casa decimal e a planilha tinha seis)
        print("    ~ %d corrigido(s)%s: %s"
              % (len(mudou), " (os 4 últimos)" if len(mudou) > 4 else "",
                 ", ".join("%s %s→%s" % (m, velho[m], junto[m]) for m in mudou[-4:])))
    if not entrou and not mudou:
        print("    (igual à planilha)")


def atualizar(saida, periodos):
    """Põe no dado de hoje o que não precisa da planilha: as séries do SGS, o
    Ibovespa, o Ibovespa em dólar (que sai dos dois) e a comparação entre
    mandatos (que sai da dívida/PIB já atualizada).

    Rede fora do ar não quebra a rodada: o que não baixar fica como está na
    planilha, e o script diz qual foi."""
    por_id = {s["id"]: s for s in saida["series"]}

    try:
        series, fim_de_mes, ptax_de = series_do_sgs()
        print("  SGS: %s" % ", ".join("%d (%s)" % (c, NOMES_SGS.get(c, "?"))
                                       for c in sorted(set(BAIXADAS))))
        print("  mês corrente fechado com a PTAX de %s" % ptax_de)
    except Exception as e:
        print("  SGS fora do ar (%s): as séries do Banco Central ficam como estão na planilha" % e)
        series, fim_de_mes = {}, {}
    for id_ in sorted(series):
        aplicar(por_id[id_], series[id_])

    try:
        fechos, pregao, valor = fechamentos_ibov()
        b3 = cotacao_b3()
        erro = abs(b3 - valor) / valor
        print("  Ibovespa: último pregão %s = %.0f (a B3 publica %.0f, %.3f%% de diferença)"
              % (pregao, valor, b3, 100 * erro))
        if erro > TOLERANCIA_IBOV:
            print("    o mês corrente (%s) fica de fora: as duas fontes não confirmam o mesmo "
                  "número. Rode de novo com a bolsa fechada." % pregao[:7])
            fechos.pop(pregao[:7], None)
        aplicar(por_id["ibov"], fechos, desde=max(dict(por_id["ibov"]["dados"])))
    except SystemExit:
        raise
    except Exception as e:
        print("  Ibovespa não baixou (%s): fica como está na planilha" % e)

    # Ibovespa em dólar: o índice do fim do mês dividido pelo dólar do fim do
    # mês (média de compra e venda da PTAX) — e não pela média do mês, que é o
    # que o cartão do dólar mostra. As duas contas convivem na planilha; esta é
    # a que reproduz a coluna F, e o `confere` abaixo é o que garante isso.
    ibov = dict(por_id["ibov"]["dados"])
    if fim_de_mes and ibov:
        nova = {m: round(ibov[m] / fim_de_mes[m], 6) for m in ibov if m in fim_de_mes}
        velho = dict(por_id["ibov-dolar"]["dados"])
        # o último mês da planilha estava provisório (o índice e a PTAX do dia
        # ainda não tinham saído quando ela foi preenchida), então ele não conta
        limite = max(velho)
        pior = max(((abs(nova[m] - velho[m]), m) for m in nova if m in velho and m < limite),
                   default=(0, None))
        if pior[0] > 1:
            sys.exit("Ibovespa em dólar: a conta deixou de reproduzir a coluna F da planilha "
                     "(%s erra em %.1f pontos). Confira a série do dólar antes de gravar."
                     % (pior[1], pior[0]))
        print("  Ibovespa em dólar: recalculado; a conta reproduz a coluna F da planilha "
              "(pior mês: %s, %.4f ponto)" % (pior[1], pior[0]))
        aplicar(por_id["ibov-dolar"], nova)

    # a comparação entre mandatos sai da dívida/PIB: refazer depois dela andar
    cmp_ = compara_mandatos(por_id["divida-pib"]["dados"], periodos)
    por_id["divida-bruta"]["mandatos"] = cmp_
    print("  divida-bruta     comparação refeita: "
          + ", ".join("%s (%dm, %+.1f p.p.)" % (m["nome"], len(m["dados"]), m["dados"][-1])
                      for m in cmp_))


def eh_numero(txt):
    try:
        float(txt)
        return True
    except (TypeError, ValueError):
        return False


def serie_antiga(id_):
    """Os dados que já estão no JSON — rede fora do ar não apaga série."""
    try:
        with open(SAIDA_INDICADORES, encoding="utf-8") as f:
            for s in json.load(f)["series"]:
                if s["id"] == id_:
                    return s.get("dados") or []
    except Exception:
        pass
    return []


def main():
    if len(sys.argv) > 2:
        sys.exit(__doc__)
    caminho = sys.argv[1] if len(sys.argv) == 2 else PLANILHA_PADRAO
    abas = le_planilhas(caminho)
    pib = le_planilhas(PLANILHA_PIB)
    ind = abas["Outros Indicadores"]
    pres = abas["Presidentes"]
    periodos = le_periodos(pres)

    ultima = max(r for (c, r) in ind if c == "A" and eh_numero(ind[(c, r)]))
    meses = {r: serial_para_mes(ind[("A", r)]) for r in range(2, ultima + 1) if ("A", r) in ind}

    saida = {"fonte": FONTE_SITE, "atualizado": datetime.date.today().isoformat(), "series": []}
    for col, id_, cfg in INDICADORES:
        fonte = cfg.get("fonte", FONTE_PADRAO)
        if cfg.get("planilha") == "pib":
            quais = OPCOES_PIB[cfg["opcoes"]]
            col_tri = "A" if cfg["aba"] == "PIB Var. Real 4t" else "B"
            opcoes = le_pib(pib[cfg["aba"]], quais, col_tri)
            base = {k: v for k, v in cfg.items() if k not in ("aba", "planilha", "opcoes")}
            saida["series"].append(dict(id=id_, coluna="aba " + cfg["aba"], **{**base, "fonte": fonte},
                                        opcoes=opcoes, dados=[]))
            print(f"  {id_:16s} {len(opcoes)} opções, {len(opcoes[0]['dados']):3d} trimestres  "
                  f"{opcoes[0]['dados'][0][0]} → {opcoes[0]['dados'][-1][0]}")
            continue
        if cfg.get("colunas"):
            cd, cv = cfg["colunas"]
            dados = le_coluna_par(abas[cfg["aba"]], cd, cv)
            base = {k: v for k, v in cfg.items() if k not in ("aba", "colunas")}
            saida["series"].append(dict(id=id_, coluna=f"aba {cfg['aba']}, colunas {cd} e {cv}",
                                        **{**base, "fonte": fonte}, dados=dados))
            print(f"  {id_:16s} {len(dados):4d} meses  {dados[0][0]} → {dados[-1][0]}  último={dados[-1][1]:.4f}")
            continue
        if cfg.get("tesouro"):
            try:
                dados = le_ntnb()
                print(f"  {id_:16s} {len(dados):4d} meses  {dados[0][0]} → {dados[-1][0]}  "
                      f"(NTN-B {VENC_NTNB})")
            except Exception as e:
                dados = serie_antiga(id_)
                print(f"  {id_:16s} não baixou ({e}); mantendo os {len(dados)} meses que já estavam no JSON")
            base = {k: v for k, v in cfg.items() if k != "tesouro"}
            saida["series"].append(dict(id=id_, coluna="Tesouro Transparente (NTN-B)",
                                        **{**base, "fonte": fonte}, dados=dados))
            continue
        if cfg.get("tipo") == "rating":
            rt = le_rating(abas[cfg["aba"]])
            cfg = {k: v for k, v in cfg.items() if k != "aba"}
            saida["series"].append(dict(id=id_, coluna="aba Base Rating 2", **cfg, **rt, dados=[]))
            for a in rt["agencias"]:
                print(f"  {id_:16s} {a['nome']:8s} {a['inicio']} → {a['fim']}  "
                      f"{len(a['me'])} mudanças (ME), {len(a['eventos'])} ações")
            continue
        if cfg.get("tipo") == "comparacao":
            origem = next(x for x in saida["series"] if x["id"] == cfg["derivaDe"])
            cmp = compara_mandatos(origem["dados"], periodos)
            cfg = {k: v for k, v in cfg.items() if k != "derivaDe"}
            saida["series"].append(dict(id=id_, coluna="calculado de " + origem["id"],
                                        **{**cfg, "fonte": cfg.get("fonte", FONTE_PADRAO)},
                                        mandatos=cmp, dados=[]))
            print(f"  {id_:16s} comparação de {origem['id']}: "
                  + ", ".join(f"{m['nome']} ({len(m['dados'])}m, {m['dados'][-1]:+.1f} p.p.)" for m in cmp))
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

    # Até aqui tudo saiu da planilha. Agora o que tem fonte própria vai para o
    # dado de hoje: o SGS, o Ibovespa e o que deriva deles.
    print("Atualizando com o dado de hoje:")
    atualizar(saida, periodos)

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

    # Faixas de governo: os mesmos períodos que a comparação entre mandatos usa.
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
