/* Poder & Mercado — gráficos dos indicadores com fundo por governo.
 *
 * Tudo é desenhado em SVG por este arquivo, com cores em atributos (nada de
 * CSS dentro do SVG): assim o mesmo desenho serve para a tela, para o SVG
 * baixado e para o PNG (que serializa o SVG num canvas).
 */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var FONT = "Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro"];
  var LOGO_RAZAO = 61 / 695;

  var PALETAS = {
    dark: {
      texto: "#ffffff", suave: "rgba(255,255,255,.74)", grade: "rgba(255,255,255,.11)",
      zero: "rgba(255,255,255,.5)", linha: "#5b8dd6", selo: "#4a7bc4", seloTexto: "#ffffff",
      faixaOp: 0.17, faixaTexto: 1, bg: "#04100f", tipBg: "rgba(4,16,15,.94)", tipBorda: "rgba(255,255,255,.3)",
      logo: "assets/logo.png"
    },
    light: {
      texto: "#14202b", suave: "#5a6772", grade: "#e2e7ea",
      zero: "#8a96a0", linha: "#2f5fae", selo: "#2f5fae", seloTexto: "#ffffff",
      faixaOp: 0.15, faixaTexto: 0.62, bg: "#ffffff", tipBg: "rgba(255,255,255,.96)", tipBorda: "#b9c3ca",
      logo: "assets/logo-claro.png"
    }
  };

  var LAYOUTS = {
    wide: {
      W: 1920, H: 1080, y0: 235, y1: 925,
      titulo: { x: 40, y: 84, fs: 62 }, sub: { x: 42, y: 130, fs: 30 },
      logo: { x: 1400, y: 36, w: 480 }, legenda: { y: 198, fs: 32 },
      tick: 30, xlab: 28, selo: 34, fonte: { x: 1885, y: 1060, fs: 24 },
      faixa: 28, tip: 30, linha: 6, eixoDuplo: true, faixaVertical: false, tituloMax: 1330
    },
    narrow: {
      W: 1080, H: 1400, y0: 345, y1: 1130,
      titulo: { x: 36, y: 165, fs: 68 }, sub: { x: 38, y: 218, fs: 38 },
      logo: { x: 664, y: 30, w: 380 }, legenda: { y: 292, fs: 36 },
      tick: 36, xlab: 33, selo: 38, fonte: { x: 1044, y: 1372, fs: 30 },
      faixa: 32, tip: 38, linha: 7, eixoDuplo: false, faixaVertical: true, tituloMax: 1008
    }
  };

  var cartoes = [];
  var mandatos = [];
  var meta = {};

  // ---------- utilidades ----------
  function el(nome, attrs, filhos) {
    var n = document.createElementNS(NS, nome);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    (filhos || []).forEach(function (f) { n.appendChild(f); });
    return n;
  }
  function texto(conteudo, attrs) {
    var t = el("text", Object.assign({ "font-family": FONT }, attrs));
    t.textContent = conteudo;
    return t;
  }
  function html(tag, attrs, filhos) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "texto") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (filhos || []).forEach(function (f) { n.appendChild(f); });
    return n;
  }
  function tema() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }

  var medidor = document.createElement("canvas").getContext("2d");
  function largura(str, fs, peso) {
    medidor.font = (peso || "normal") + " " + fs + "px " + FONT;
    return medidor.measureText(str).width;
  }

  var nfCache = {};
  function nf(casas) {
    if (!nfCache[casas]) {
      nfCache[casas] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    return nfCache[casas];
  }

  function idxMes(m) { var p = m.split("-"); return (+p[0]) * 12 + (+p[1] - 1); }
  function rotuloMesCurto(i) { return MESES[i % 12] + "/" + String(Math.floor(i / 12)).slice(-2); }
  function rotuloMesLongo(i) { return MESES_LONGOS[i % 12] + " de " + Math.floor(i / 12); }

  function sombrear(hex, ate) {
    // mistura a cor com preto (ate<1 escurece) — usada nos rótulos das faixas no tema claro
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function c(v) { return Math.round(v * ate); }
    return "rgb(" + c(r) + "," + c(g) + "," + c(b) + ")";
  }

  // ---------- formatação de valores ----------
  function fmtValor(s, v) {
    if (s.formato === "pct") return nf(s.casas).format(v * 100) + "%";
    var base = nf(s.casas).format(v);
    return (s.prefixo || "") + base + (s.sufixo || "");
  }
  function fmtTick(s, v, passo) {
    if (s.formato === "pct") {
      var p = passo * 100;
      return nf(p >= 1 ? 0 : p >= 0.1 ? 1 : 2).format(v * 100) + "%";
    }
    return nf(passo >= 1 ? 0 : passo >= 0.1 ? 1 : 2).format(v);
  }

  // ---------- escala Y ----------
  function passoBonito(faixa, alvo) {
    var bruto = faixa / alvo;
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var cands = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < cands.length; i++) if (cands[i] * mag >= bruto) return cands[i] * mag;
    return 10 * mag;
  }
  function escalaY(vals) {
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var baixo = mn;
    if (mn >= 0 && mn <= mx * 0.6) baixo = 0;
    var alto = mx > 0 ? mx * 1.04 : mx;
    if (alto - baixo <= 0) alto = baixo + 1;
    var passo = passoBonito(alto - baixo, 5);
    var min = Math.floor(baixo / passo + 1e-9) * passo;
    var max = Math.ceil(alto / passo - 1e-9) * passo;
    var ticks = [];
    for (var v = min; v <= max + passo / 2; v += passo) ticks.push(Math.round(v / passo * 1e6) / 1e6 * passo);
    return { min: min, max: max, passo: passo, ticks: ticks };
  }

  // ---------- desenho do gráfico ----------
  function construir(cartao, L, nomeTema) {
    var s = cartao.serie, pal = PALETAS[nomeTema];
    var todos = s.dados.map(function (d) { return { i: idxMes(d[0]), v: d[1] }; });
    var primeiro = todos[0].i, ultimo = todos[todos.length - 1].i;
    var d0 = Math.max(primeiro, cartao.inicioIdx === null ? primeiro : cartao.inicioIdx);
    var d1 = ultimo + 1;
    var pts = todos.filter(function (p) { return p.i >= d0; });
    var barras = s.tipo === "barras";
    var ult = pts[pts.length - 1];

    var esc = escalaY(pts.map(function (p) { return p.v; }).concat(barras ? [0] : []));

    // margens laterais dependem do que precisa caber: rótulos do eixo Y e o selo
    // do último valor (que ocupa a coluna do eixo direito)
    var tw = Math.max.apply(null, esc.ticks.map(function (t) { return largura(fmtTick(s, t, esc.passo), L.tick); }));
    var rotSelo = fmtValor(s, ult.v);
    var sw = largura(rotSelo, L.selo, "bold") + 28;
    L = Object.assign({}, L, {
      x0: 26 + tw + 14,
      x1: L.W - (26 + (L.eixoDuplo ? Math.max(tw, sw) : sw) + 14)
    });
    var pw = L.x1 - L.x0, ph = L.y1 - L.y0;
    function X(i) { return L.x0 + (i - d0) / (d1 - d0) * pw; }
    function Y(v) { return L.y1 - (v - esc.min) / (esc.max - esc.min) * ph; }

    var svg = el("svg", {
      xmlns: NS, viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H,
      role: "img", "aria-label": s.titulo + " — " + s.subtitulo + ", com o fundo por governo"
    });

    // faixas de governo
    var faixas = [];
    mandatos.forEach(function (m) {
      var a = Math.max(idxMes(m.inicio), d0), b = Math.min(idxMes(m.fim) + 1, d1);
      if (b <= a) return;
      faixas.push({ m: m, a: a, b: b });
      svg.appendChild(el("rect", {
        x: X(a), y: L.y0, width: X(b) - X(a), height: ph, fill: m.cor, "fill-opacity": pal.faixaOp
      }));
    });

    // grade + rótulos do eixo Y
    var seloH = L.selo * 1.55;
    var seloY = Math.min(Math.max(Y(ult.v), L.y0), L.y1);
    esc.ticks.forEach(function (t) {
      var y = Y(t);
      var ehZero = Math.abs(t) < esc.passo * 1e-6 && esc.min < 0;
      svg.appendChild(el("line", {
        x1: L.x0, x2: L.x1, y1: y, y2: y, stroke: ehZero ? pal.zero : pal.grade, "stroke-width": ehZero ? 2 : 1.5
      }));
      var rot = fmtTick(s, t, esc.passo);
      var at = { "font-size": L.tick, fill: pal.suave, "dominant-baseline": "central", y: y };
      svg.appendChild(texto(rot, Object.assign({ x: L.x0 - 16, "text-anchor": "end" }, at)));
      if (L.eixoDuplo && Math.abs(y - seloY) > seloH / 2 + L.tick * 0.5) {
        svg.appendChild(texto(rot, Object.assign({ x: L.x1 + 16, "text-anchor": "start" }, at)));
      }
    });

    // rótulos do eixo X (rotacionados, alinhados por múltiplos de N meses)
    var pxMes = pw / (d1 - d0), passoX = 1;
    [1, 2, 3, 4, 6, 12, 24, 36, 60].some(function (n) { passoX = n; return pxMes * n >= L.xlab * 1.3; });
    for (var i = d0; i < d1; i++) {
      if (i % passoX !== 0) continue;
      var cx = X(i + 0.5);
      svg.appendChild(el("line", { x1: cx, x2: cx, y1: L.y1, y2: L.y1 + 8, stroke: pal.zero, "stroke-width": 1.5 }));
      svg.appendChild(texto(rotuloMesCurto(i), {
        x: cx, y: L.y1 + 18, "font-size": L.xlab, fill: pal.suave, "text-anchor": "end",
        "dominant-baseline": "central", transform: "rotate(-90 " + cx + " " + (L.y1 + 18) + ")"
      }));
    }

    // nomes dos governos no topo de cada faixa
    faixas.forEach(function (f) {
      var w = X(f.b) - X(f.a);
      var cor = nomeTema === "dark" ? f.m.cor : sombrear(f.m.cor, pal.faixaTexto);
      var cx = (X(f.a) + X(f.b)) / 2;
      if (L.faixaVertical) {
        // layout estreito: nome girado, cabe em faixas finas
        if (w < L.faixa * 1.25) return;
        svg.appendChild(texto(f.m.nome, {
          x: cx, y: L.y0 + 14, "font-size": L.faixa, "font-weight": "bold", fill: cor, "text-anchor": "end",
          "dominant-baseline": "central", transform: "rotate(-90 " + cx + " " + (L.y0 + 14) + ")"
        }));
        return;
      }
      if (w < largura(f.m.nome, L.faixa, "bold") + 14) return;
      svg.appendChild(texto(f.m.nome, {
        x: cx, y: L.y0 + L.faixa + 8, "font-size": L.faixa, "font-weight": "bold",
        fill: cor, "text-anchor": "middle"
      }));
    });

    // série
    if (barras) {
      var bw = Math.max(1.5, pxMes * 0.7), y0v = Y(Math.max(esc.min, 0));
      pts.forEach(function (p) {
        if (!p.v) return;
        var yy = Y(p.v);
        svg.appendChild(el("rect", { x: X(p.i + 0.5) - bw / 2, y: yy, width: bw, height: Math.max(2, y0v - yy), fill: pal.linha }));
      });
    } else {
      var d = "", ant = null;
      pts.forEach(function (p) {
        d += (ant === null || p.i - ant > 1 ? "M" : "L") + X(p.i + 0.5).toFixed(1) + " " + Y(p.v).toFixed(1);
        ant = p.i;
      });
      svg.appendChild(el("path", {
        d: d, fill: "none", stroke: pal.linha, "stroke-width": L.linha,
        "stroke-linejoin": "round", "stroke-linecap": "round"
      }));
    }

    // selo com o último valor
    var bx = L.W - 26 - sw;
    var px = X(ult.i + 0.5), py = Y(ult.v);
    if (px + 6 < bx) {
      svg.appendChild(el("line", { x1: px, y1: py, x2: bx, y2: seloY, stroke: pal.suave, "stroke-width": 1.5 }));
    }
    if (!barras) svg.appendChild(el("circle", { cx: px, cy: py, r: 8, fill: pal.linha, stroke: pal.bg, "stroke-width": 3 }));
    svg.appendChild(el("rect", { x: bx, y: seloY - seloH / 2, width: sw, height: seloH, rx: 5, fill: pal.selo }));
    svg.appendChild(texto(rotSelo, {
      x: bx + sw / 2, y: seloY, "font-size": L.selo, "font-weight": "bold", fill: pal.seloTexto,
      "text-anchor": "middle", "dominant-baseline": "central"
    }));

    // título, subtítulo, legenda e fonte
    var tfs = Math.min(L.titulo.fs, L.tituloMax / largura(s.titulo, 100, "bold") * 100);
    svg.appendChild(texto(s.titulo, {
      x: L.titulo.x, y: L.titulo.y, "font-size": tfs, "font-weight": "bold", fill: pal.texto
    }));
    svg.appendChild(texto(s.subtitulo, { x: L.sub.x, y: L.sub.y, "font-size": L.sub.fs, fill: pal.suave }));

    var rotLeg = s.titulo + " (" + s.subtitulo.replace(/^Var\. /, "") + ")";
    var lfs = Math.min(L.legenda.fs, (L.W - 60 - 76) / largura(rotLeg, 100) * 100);
    var lw = largura(rotLeg, lfs) + 76;
    var lx = (L.W - lw) / 2;
    if (barras) {
      svg.appendChild(el("rect", { x: lx, y: L.legenda.y - 9, width: 52, height: 18, fill: pal.linha }));
    } else {
      svg.appendChild(el("line", {
        x1: lx, x2: lx + 52, y1: L.legenda.y, y2: L.legenda.y, stroke: pal.linha, "stroke-width": 8, "stroke-linecap": "round"
      }));
    }
    svg.appendChild(texto(rotLeg, {
      x: lx + 68, y: L.legenda.y, "font-size": lfs, fill: pal.texto, "dominant-baseline": "central"
    }));
    svg.appendChild(texto("Fonte: " + meta.fonte + ".", {
      x: L.fonte.x, y: L.fonte.y, "font-size": L.fonte.fs, fill: pal.suave, "text-anchor": "end"
    }));

    return {
      svg: svg, L: L, pal: pal, X: X, Y: Y, d0: d0, d1: d1, pts: pts, faixas: faixas,
      porIdx: pts.reduce(function (o, p) { o[p.i] = p; return o; }, {})
    };
  }

  // logo à parte: fica fora do SVG exportado (o PNG o desenha no canvas)
  function logoNoSvg(g) {
    var lw = g.L.logo.w;
    g.svg.appendChild(el("image", {
      href: g.pal.logo, x: g.L.logo.x, y: g.L.logo.y, width: lw, height: lw * LOGO_RAZAO, "class": "logo-svg"
    }));
  }

  // ---------- interação: passar o mouse ----------
  function ligarHover(cartao, g) {
    var svg = g.svg, L = g.L, pal = g.pal;
    var camada = el("g", { "pointer-events": "none", "class": "hover" });
    var alvo = el("rect", { x: L.x0, y: L.y0, width: L.x1 - L.x0, height: L.y1 - L.y0, fill: "transparent" });
    svg.appendChild(alvo);
    svg.appendChild(camada);

    function limpar() { while (camada.firstChild) camada.removeChild(camada.firstChild); }
    function mover(ev) {
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var i = Math.floor(g.d0 + (p.x - L.x0) / (L.x1 - L.x0) * (g.d1 - g.d0));
      var ponto = g.porIdx[i];
      if (!ponto) {
        var melhor = null;
        g.pts.forEach(function (q) { if (melhor === null || Math.abs(q.i - i) < Math.abs(melhor.i - i)) melhor = q; });
        if (!melhor || Math.abs(melhor.i - i) > 3) { limpar(); return; }
        ponto = melhor;
      }
      limpar();
      var x = g.X(ponto.i + 0.5), y = g.Y(ponto.v);
      camada.appendChild(el("line", {
        x1: x, x2: x, y1: L.y0, y2: L.y1, stroke: pal.suave, "stroke-width": 1.5, "stroke-dasharray": "6 6"
      }));
      camada.appendChild(el("circle", { cx: x, cy: y, r: 9, fill: pal.linha, stroke: pal.texto, "stroke-width": 3 }));

      var gov = null;
      g.faixas.forEach(function (f) { if (ponto.i >= f.a && ponto.i < f.b) gov = f.m; });
      var linhas = [rotuloMesLongo(ponto.i), fmtValor(cartao.serie, ponto.v)];
      if (gov) linhas.push(gov.nome);
      var fs = L.tip, pad = fs * 0.6;
      var w = Math.max.apply(null, linhas.map(function (t, k) { return largura(t, fs, k === 1 ? "bold" : "normal"); })) + pad * 2 + (gov ? fs * 0.7 : 0);
      var h = linhas.length * fs * 1.35 + pad * 1.2;
      var bx = x + 24; if (bx + w > L.x1 + 40) bx = x - 24 - w;
      var by = L.y0 + 56;
      camada.appendChild(el("rect", { x: bx, y: by, width: w, height: h, rx: 8, fill: pal.tipBg, stroke: pal.tipBorda, "stroke-width": 1.5 }));
      linhas.forEach(function (t, k) {
        var ty = by + pad * 0.6 + fs * 0.68 + k * fs * 1.35;
        var ehGov = gov && k === 2;
        if (ehGov) camada.appendChild(el("circle", { cx: bx + pad + fs * 0.22, cy: ty - fs * 0.3, r: fs * 0.24, fill: gov.cor }));
        camada.appendChild(texto(t, {
          x: bx + pad + (ehGov ? fs * 0.7 : 0), y: ty, "font-size": fs,
          "font-weight": k === 1 ? "bold" : "normal", fill: k === 0 || ehGov ? pal.suave : pal.texto
        }));
      });
    }
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerdown", mover);
    alvo.addEventListener("pointerleave", limpar);
  }

  // ---------- cartão ----------
  function periodosDisponiveis(s) {
    var meses = idxMes(s.dados[s.dados.length - 1][0]) - idxMes(s.dados[0][0]) + 1;
    var lista = [];
    if (s.inicioPadrao) lista.push({ id: "padrao", rot: "Desde " + s.inicioPadrao.slice(0, 4) });
    lista.push({ id: "tudo", rot: "Tudo" });
    [20, 10, 5].forEach(function (a) { if (meses > a * 12 * 1.1) lista.push({ id: String(a), rot: a + " anos" }); });
    return lista;
  }
  function inicioDoPeriodo(s, id) {
    var ultimo = idxMes(s.dados[s.dados.length - 1][0]);
    if (id === "tudo") return null;
    if (id === "padrao") return idxMes(s.inicioPadrao);
    return ultimo - (+id) * 12 + 1;
  }

  function criarCartao(s) {
    var cartao = { serie: s, periodo: s.inicioPadrao ? "padrao" : "tudo", inicioIdx: null, layoutAtual: null };
    var vazio = !s.dados.length;
    if (!vazio) cartao.inicioIdx = inicioDoPeriodo(s, cartao.periodo);

    var frame = html("div", { "class": "frame" });
    var raiz = html("article", { "class": "card", id: s.id });
    raiz.appendChild(html("h2", { "class": "sr-only", texto: s.titulo + " — " + s.subtitulo }));

    var ferramentas = html("div", { "class": "card-tools" });
    if (!vazio) {
      var grupo = html("div", { "class": "periodos", role: "group", "aria-label": "Período de " + s.titulo });
      periodosDisponiveis(s).forEach(function (p) {
        var b = html("button", { type: "button", texto: p.rot, "data-p": p.id, "aria-pressed": String(p.id === cartao.periodo) });
        b.addEventListener("click", function () {
          cartao.periodo = p.id;
          cartao.inicioIdx = inicioDoPeriodo(s, p.id);
          Array.prototype.forEach.call(grupo.children, function (x) {
            x.setAttribute("aria-pressed", String(x.getAttribute("data-p") === p.id));
          });
          desenhar(cartao, true);
        });
        grupo.appendChild(b);
      });
      ferramentas.appendChild(grupo);
      ferramentas.appendChild(menuBaixar(cartao));
    } else {
      ferramentas.appendChild(html("span", { "class": "sr-only", texto: "Sem dados" }));
    }
    raiz.appendChild(ferramentas);
    raiz.appendChild(frame);

    cartao.raiz = raiz;
    cartao.frame = frame;
    if (vazio) {
      frame.style.aspectRatio = "16 / 9";
      frame.appendChild(html("div", { "class": "sem-dados" }, [
        html("strong", { texto: s.titulo }),
        html("span", { texto: "Sem dados ainda." }),
        html("span", { texto: "Preencha a coluna “" + s.coluna + "” do Excel e rode scripts/gerar_dados.py." })
      ]));
    }
    return cartao;
  }

  function escolherLayout(cartao) {
    return cartao.frame.clientWidth < 700 || window.innerWidth < 700 ? "narrow" : "wide";
  }

  function desenhar(cartao, forcar) {
    if (!cartao.serie.dados.length) return;
    var nomeLayout = escolherLayout(cartao);
    var chave = nomeLayout + "|" + tema();
    if (!forcar && cartao.chave === chave) return;
    cartao.chave = chave;
    var L = LAYOUTS[nomeLayout];
    var g = construir(cartao, L, tema());
    logoNoSvg(g);
    ligarHover(cartao, g);
    cartao.frame.style.aspectRatio = L.W + " / " + L.H;
    cartao.frame.innerHTML = "";
    cartao.frame.appendChild(g.svg);
  }

  // ---------- baixar ----------
  function menuBaixar(cartao) {
    var caixa = html("div", { "class": "baixar" });
    var botao = html("button", { type: "button", "class": "btn", "aria-haspopup": "menu", "aria-expanded": "false" });
    botao.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg><span>Baixar</span>';
    var menu = html("div", { "class": "menu", role: "menu", hidden: "" });
    [
      ["png", "Imagem (PNG)", "1920×1080, no tema atual", baixarPNG],
      ["svg", "Vetor (SVG)", "editável no Illustrator/Figma", baixarSVG],
      ["csv", "Dados (CSV)", "mês e valor, para o Excel", baixarCSV]
    ].forEach(function (it) {
      var b = html("button", { type: "button", role: "menuitem" });
      b.innerHTML = it[1] + "<small>" + it[2] + "</small>";
      b.addEventListener("click", function () { fechar(); it[3](cartao); });
      menu.appendChild(b);
    });
    function fechar() { menu.hidden = true; botao.setAttribute("aria-expanded", "false"); }
    botao.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = menu.hidden;
      document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
      menu.hidden = !abrir;
      botao.setAttribute("aria-expanded", String(abrir));
    });
    document.addEventListener("click", function (e) { if (!caixa.contains(e.target)) fechar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { fechar(); } });
    caixa.appendChild(botao);
    caixa.appendChild(menu);
    return caixa;
  }

  function salvar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function nomeArquivo(cartao, ext) { return "poder-e-mercado-" + cartao.serie.id + "." + ext; }
  function carregarImagem(src) {
    return new Promise(function (ok, erro) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { erro(new Error("Não carregou " + src.slice(0, 60))); };
      im.src = src;
    });
  }
  function serializar(svg) { return new XMLSerializer().serializeToString(svg); }

  function baixarPNG(cartao) {
    var nomeTema = tema(), L = LAYOUTS.wide;
    var g = construir(cartao, L, nomeTema);
    var xml = serializar(g.svg);
    var pedidos = [
      carregarImagem("data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml)),
      carregarImagem(g.pal.logo),
      nomeTema === "dark" ? carregarImagem("assets/fundo.jpg") : Promise.resolve(null)
    ];
    Promise.all(pedidos).then(function (r) {
      var c = document.createElement("canvas");
      c.width = L.W; c.height = L.H;
      var x = c.getContext("2d");
      x.fillStyle = g.pal.bg; x.fillRect(0, 0, L.W, L.H);
      if (r[2]) x.drawImage(r[2], 0, 0, L.W, L.H);
      x.drawImage(r[0], 0, 0, L.W, L.H);
      x.drawImage(r[1], L.logo.x, L.logo.y, L.logo.w, L.logo.w * LOGO_RAZAO);
      c.toBlob(function (b) { salvar(b, nomeArquivo(cartao, "png")); }, "image/png");
    }).catch(function (e) { alert("Não consegui gerar o PNG: " + e.message); });
  }

  function baixarSVG(cartao) {
    var nomeTema = tema(), L = LAYOUTS.wide;
    var g = construir(cartao, L, nomeTema);
    carregarImagem(g.pal.logo).then(function (im) {
      var c = document.createElement("canvas");
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext("2d").drawImage(im, 0, 0);
      g.svg.insertBefore(el("rect", { x: 0, y: 0, width: L.W, height: L.H, fill: g.pal.bg }), g.svg.firstChild);
      g.svg.appendChild(el("image", {
        href: c.toDataURL("image/png"), x: L.logo.x, y: L.logo.y, width: L.logo.w, height: L.logo.w * LOGO_RAZAO
      }));
      salvar(new Blob([serializar(g.svg)], { type: "image/svg+xml" }), nomeArquivo(cartao, "svg"));
    }).catch(function (e) { alert("Não consegui gerar o SVG: " + e.message); });
  }

  function baixarCSV(cartao) {
    var s = cartao.serie, pct = s.formato === "pct";
    var linhas = ["mes;" + s.titulo.replace(/;/g, ",") + " (" + s.subtitulo.replace(/;/g, ",") + ")"];
    s.dados.forEach(function (d) {
      var v = pct ? d[1] * 100 : d[1];
      linhas.push(d[0] + ";" + String(Math.round(v * 1e6) / 1e6).replace(".", ","));
    });
    salvar(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }), nomeArquivo(cartao, "csv"));
  }

  // ---------- tema ----------
  function alternarTema() {
    var novo = tema() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("pm_tema", novo); } catch (e) {}
    cartoes.forEach(function (c) { desenhar(c, true); });
  }

  // ---------- carga ----------
  function pegarJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " → HTTP " + r.status);
      return r.json();
    });
  }

  function iniciar() {
    var host = document.getElementById("graficos");
    Promise.all([pegarJSON("dados/indicadores.json"), pegarJSON("dados/mandatos.json")]).then(function (r) {
      meta = { fonte: r[0].fonte, atualizado: r[0].atualizado };
      mandatos = r[1].mandatos;
      host.innerHTML = "";
      var chips = document.getElementById("chips");
      r[0].series.forEach(function (s) {
        var c = criarCartao(s);
        cartoes.push(c);
        host.appendChild(c.raiz);
        var a = html("a", { href: "#" + s.id, texto: s.titulo });
        if (!s.dados.length) a.className = "vazio";
        chips.appendChild(a);
      });
      cartoes.forEach(function (c) { desenhar(c, true); });
      var d = meta.atualizado.split("-");
      document.getElementById("rodape").textContent =
        "Fonte: " + meta.fonte + ". Dados atualizados em " + d[2] + "/" + d[1] + "/" + d[0] + ".";
    }).catch(function (e) {
      host.innerHTML = "";
      host.appendChild(html("p", { "class": "estado erro", texto: "Não foi possível carregar os dados. " + e.message }));
    });

    document.getElementById("tema").addEventListener("click", alternarTema);
    var espera;
    window.addEventListener("resize", function () {
      clearTimeout(espera);
      espera = setTimeout(function () { cartoes.forEach(function (c) { desenhar(c, false); }); }, 120);
    });
  }

  iniciar();
})();
