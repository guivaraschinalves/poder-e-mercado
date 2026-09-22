/* Poder & Mercado — gráficos dos indicadores com fundo por governo.
 *
 * Tudo é desenhado em SVG por este arquivo, com cores em atributos (nada de
 * CSS dentro do SVG): assim o mesmo desenho serve para a tela, para o SVG
 * baixado e para o PNG (que serializa o SVG num canvas).
 *
 * Cada mandato vira uma faixa colorida com o nome acima do gráfico, o retrato
 * oficial do presidente e, embaixo dele, a variação e a média do período.
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
      texto: "#ffffff", eixo: "#ffffff", suave: "rgba(255,255,255,.8)", grade: "rgba(255,255,255,.14)",
      zero: "rgba(255,255,255,.55)", linha: "#ffffff", selo: "#4a7bc4", seloTexto: "#ffffff",
      faixaOp: 0.88, faixaNome: "#ffffff", alta: "#5fdc82", baixa: "#ff8a8a", bg: "#04100f",
      tipBg: "rgba(4,16,15,.94)", tipBorda: "rgba(255,255,255,.35)", logo: "assets/logo.png"
    },
    light: {
      texto: "#14202b", eixo: "#26313b", suave: "#5a6772", grade: "#dde3e7",
      zero: "#8a96a0", linha: "#1d3f79", selo: "#2f5fae", seloTexto: "#ffffff",
      faixaOp: 0.24, faixaNome: "#26313b", alta: "#0f7a37", baixa: "#c02a2a", bg: "#ffffff",
      tipBg: "rgba(255,255,255,.96)", tipBorda: "#b9c3ca", logo: "assets/logo-claro.png"
    }
  };

  var LAYOUTS = {
    wide: {
      W: 1920, H: 1080, y0: 214, y1: 928,
      titulo: { x: 40, y: 82, fs: 58 }, sub: { x: 42, y: 128, fs: 30 },
      logo: { x: 1400, y: 34, w: 480 }, nome: { y: 190, fs: 32 },
      faixa: { pad: 16, fotoH: 160, gap: 18, fs: 30 },
      tick: 30, xlab: 28, selo: 34, fonte: { x: 1885, y: 1062, fs: 24 },
      tip: 30, linha: 6, eixoDuplo: true, tituloMax: 1330
    },
    narrow: vertical(1400, 0, 0)
  };

  // Layout em pé (largura 1080). topo/base = margem livre para a interface do
  // Instagram nos Stories (o gráfico fica dentro da área segura).
  // Na tela do celular (arquivo = false) os eixos são maiores, para ler no
  // telefone; no arquivo baixado ficam na proporção dos nomes e do Δ/média.
  function vertical(H, topo, base, arquivo) {
    var b = H - base;
    var t = arquivo ? { tick: 26, xlab: 24, selo: 30, fonte: 20, baixo: 150 }
                    : { tick: 36, xlab: 33, selo: 38, fonte: 30, baixo: 280 };
    return {
      W: 1080, H: H, y0: topo + 330, y1: b - t.baixo,
      titulo: { x: 36, y: topo + 150, fs: 66 }, sub: { x: 38, y: topo + 205, fs: 38 },
      logo: { x: 664, y: topo + 30, w: 380 }, nome: { y: topo + 305, fs: 30 },
      faixa: { pad: 12, fotoH: 132, gap: 12, fs: 26 },
      tick: t.tick, xlab: t.xlab, selo: t.selo, fonte: { x: 1044, y: b - 24, fs: t.fonte },
      tip: 38, linha: 7, eixoDuplo: false, tituloMax: 1008
    };
  }

  // Tamanhos para baixar, todos em 2×: o desenho é vetorial, então sai nítido.
  var TAMANHOS = [
    { id: "slide", nome: "Apresentação 16:9", layout: LAYOUTS.wide, escala: 2 },
    { id: "ig-4x5", nome: "Instagram feed 4:5", layout: vertical(1350, 0, 0, true), escala: 2 },
    { id: "ig-3x4", nome: "Instagram feed 3:4", layout: vertical(1440, 0, 0, true), escala: 2 },
    { id: "ig-1x1", nome: "Instagram quadrado 1:1", layout: vertical(1080, 0, 0, true), escala: 2 },
    { id: "ig-story", nome: "Instagram Stories 9:16", layout: vertical(1920, 250, 340, true), escala: 2 }
  ];

  var cartoes = [];
  var mandatos = [];
  var meta = {};
  var imagens = {};   // src → HTMLImageElement já carregado (para saber a proporção)

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
  // maior corpo de fonte em que o texto cabe na largura dada
  function corpoQueCabe(str, fsMax, disponivel, peso) {
    var w = largura(str, 100, peso);
    return Math.min(fsMax, disponivel / w * 100);
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

  // ---------- formatação de valores ----------
  function fmtValor(s, v) {
    if (s.formato === "pct") return nf(s.casas).format(v * 100) + "%";
    return (s.prefixo || "") + nf(s.casas).format(v) + (s.sufixo || "");
  }
  function fmtTick(s, v, passo) {
    if (s.formato === "pct") {
      var p = passo * 100;
      return nf(p >= 1 ? 0 : p >= 0.1 ? 1 : 2).format(v * 100) + "%";
    }
    return nf(passo >= 1 ? 0 : passo >= 0.1 ? 1 : 2).format(v);
  }
  function comSinal(v, casas) { return (v > 0 ? "+" : v < 0 ? "−" : "") + nf(casas).format(Math.abs(v)); }

  /* Variação e média do mandato. O Δ é do primeiro ao último mês visível da
   * faixa: em % para índices (Ibovespa e IED), em pontos percentuais para as
   * séries que já são %, e na própria unidade para o resto. Contagem (IPOs)
   * não tem variação que signifique algo — mostra o total do período. */
  function estatisticas(s, vals) {
    var soma = vals.reduce(function (a, b) { return a + b; }, 0);
    var media = soma / vals.length;
    var prim = vals[0], ult = vals[vals.length - 1];
    var tipo = s.variacao || "abs";
    var delta;
    if (tipo === "soma") {
      // contagem: a média por mês só diz algo com uma casa decimal
      // contagem não tem variação: "Total" fica neutro, sem cor
      return { delta: "Total: " + nf(0).format(soma), media: "Média: " + nf(1).format(media) + "/mês", sinal: 0 };
    }
    var sinal = Math.sign(ult - prim);
    if (tipo === "pct") {
      delta = prim ? "Δ: " + comSinal((ult / prim - 1) * 100, 1) + "%" : "Δ: —";
    } else if (s.formato === "pct") {
      delta = "Δ: " + comSinal((ult - prim) * 100, 1) + " p.p.";
    } else {
      delta = "Δ: " + (s.prefixo || "") + comSinal(ult - prim, s.casas) + (s.sufixo || "");
    }
    return { delta: delta, media: "Média: " + fmtValor(s, media), sinal: sinal };
  }

  // ---------- escala Y ----------
  function passoBonito(faixa, alvo) {
    var bruto = faixa / alvo;
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var cands = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < cands.length; i++) if (cands[i] * mag >= bruto) return cands[i] * mag;
    return 10 * mag;
  }
  // opts.minFixo trava o piso do eixo; opts.altoMin força espaço extra no topo
  function escalaY(vals, opts) {
    opts = opts || {};
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var baixo = opts.minFixo !== undefined && opts.minFixo !== null ? opts.minFixo : mn;
    if (opts.minFixo === undefined || opts.minFixo === null) {
      if (mn >= 0 && mn <= mx * 0.6) baixo = 0;
    }
    var alto = Math.max(mx > 0 ? mx * 1.04 : mx, opts.altoMin || -Infinity);
    if (alto - baixo <= 0) alto = baixo + 1;
    var passo = passoBonito(alto - baixo, 5);
    var min = opts.minFixo !== undefined && opts.minFixo !== null
      ? opts.minFixo : Math.floor(baixo / passo + 1e-9) * passo;
    var max = Math.ceil((alto - min) / passo - 1e-9) * passo + min;
    var ticks = [];
    for (var k = 0; min + k * passo <= max + passo / 2; k++) ticks.push(min + k * passo);
    return { min: min, max: max, passo: passo, ticks: ticks };
  }

  // ---------- desenho do gráfico ----------
  function construir(cartao, L0, nomeTema) {
    var s = cartao.serie, pal = PALETAS[nomeTema];
    var todos = s.dados.map(function (d) { return { i: idxMes(d[0]), v: d[1] }; });
    var d0 = Math.max(todos[0].i, cartao.inicioIdx === null ? todos[0].i : cartao.inicioIdx);
    var d1 = todos[todos.length - 1].i + 1;
    var pts = todos.filter(function (p) { return p.i >= d0; });
    var vals = pts.map(function (p) { return p.v; });
    var barras = s.tipo === "barras";
    var ult = pts[pts.length - 1];
    var rotSelo = fmtValor(s, ult.v);
    var fx = L0.faixa;

    // As margens laterais dependem da largura dos rótulos do eixo e do selo do
    // último valor — e os rótulos dependem da escala. Por isso a escala é
    // calculada, usada para medir, e só então refeita com o espaço que o bloco
    // de cada mandato (foto + Δ + média) exige no topo.
    function comEscala(esc, escalaFoto) {
      var tw = Math.max.apply(null, esc.ticks.map(function (t) { return largura(fmtTick(s, t, esc.passo), L0.tick); }));
      var sw = largura(rotSelo, L0.selo, "bold") + 28;
      var L = Object.assign({}, L0, {
        x0: 26 + tw + 14,
        x1: L0.W - (26 + (L0.eixoDuplo ? Math.max(tw, sw) : sw) + 14)
      });
      var pw = L.x1 - L.x0, ph = L.y1 - L.y0;
      var X = function (i) { return L.x0 + (i - d0) / (d1 - d0) * pw; };
      var Y = function (v) { return L.y1 - (v - esc.min) / (esc.max - esc.min) * ph; };

      var fotoH = fx.fotoH * escalaFoto;
      var statFs = fx.fs * Math.max(0.78, escalaFoto);
      var blocos = [];
      mandatos.forEach(function (m) {
        var a = Math.max(idxMes(m.inicio), d0), b = Math.min(idxMes(m.fim) + 1, d1);
        if (b <= a) return;
        var dentro = pts.filter(function (p) { return p.i >= a && p.i < b; });
        var bx0 = X(a), bx1 = X(b), bw = bx1 - bx0, cx = (bx0 + bx1) / 2;
        var bloco = { m: m, a: a, b: b, x0: bx0, x1: bx1, cx: cx, largura: bw };
        // Mandato curto (Temer) não comporta "Média: 22,06%" dentro da própria
        // faixa: deixa o rótulo invadir um pouco a faixa vizinha — o texto dela
        // é centralizado e fica longe. A checagem de colisão logo abaixo cuida
        // do caso em que duas faixas estreitas ficam lado a lado.
        bloco.nome100 = largura(m.nome, 100, "bold");
        if (dentro.length) {
          bloco.est = estatisticas(s, dentro.map(function (p) { return p.v; }));
          bloco.texto100 = Math.max(largura(bloco.est.delta, 100, "bold"), largura(bloco.est.media, 100, "bold"));
        }
        var im = imagens[m.foto];
        if (im && fotoH > 40) {
          var fw = fotoH * (im.naturalWidth / im.naturalHeight);
          if (fw > bw - 12) { fw = Math.max(0, bw - 12); }
          if (fw >= 34) {
            bloco.foto = { src: m.foto, w: fw, h: fw / (im.naturalWidth / im.naturalHeight) };
          }
        }
        blocos.push(bloco);
      });

      /* Um corpo de fonte só para todas as faixas — mandato curto não ganha
       * letra menor que o dos outros. Procura o maior corpo em que nenhum par
       * de rótulos vizinhos se encosta e nada escapa da imagem; um rótulo pode
       * transbordar da própria faixa, já que o do vizinho é centralizado e fica
       * longe. Como o corpo é o mesmo em todas, ou os números aparecem em todas
       * ou em nenhuma (é o que acontece na versão estreita, de celular). */
      function corpoUniforme(campo, fsMax) {
        var usados = blocos.filter(function (b) { return b[campo]; });
        var fs = fsMax;
        usados.forEach(function (b, k) {
          fs = Math.min(fs, (b.cx - 8) * 200 / b[campo], (L.W - 8 - b.cx) * 200 / b[campo]);
          var prox = usados[k + 1];
          if (prox) fs = Math.min(fs, (prox.cx - b.cx - 16) * 200 / (b[campo] + prox[campo]));
        });
        return fs;
      }
      var nomeFs = corpoUniforme("nome100", L.nome.fs);
      var textoFs = Math.min(statFs, corpoUniforme("texto100", fx.fs));
      var mostraNumeros = textoFs >= fx.fs * 0.4;
      statFs = textoFs;
      blocos.forEach(function (b) {
        b.nomeFs = nomeFs;
        b.nomeW = nomeFs >= L.nome.fs * 0.4 ? b.nome100 * nomeFs / 100 : 0;
        b.statFs = textoFs;
        if (!mostraNumeros) b.est = null;
        b.textoW = b.est ? b.texto100 * textoFs / 100 : 0;
        // extensão horizontal do bloco: é ela que a linha não pode cruzar
        var ocupado = Math.max(b.foto ? b.foto.w : 0, b.textoW);
        b.ocupa = [b.cx - ocupado / 2 - 6, b.cx + ocupado / 2 + 6];
      });

      // uma linha de base só para todas as faixas, ancorada na maior foto
      var fotoMax = 0, temTexto = false;
      blocos.forEach(function (b) {
        fotoMax = Math.max(fotoMax, b.foto ? b.foto.h : 0);
        temTexto = temTexto || !!b.est;
      });
      var baseTexto = L.y0 + fx.pad + fotoMax + (fotoMax ? fx.gap : fx.pad);
      var alturaBloco = (temTexto ? baseTexto + statFs * 2.25 : L.y0 + fx.pad + fotoMax) + 10 - L.y0;
      return {
        L: L, pw: pw, ph: ph, X: X, Y: Y, blocos: blocos,
        alturaBloco: alturaBloco, baseTexto: baseTexto, sw: sw, esc: esc
      };
    }

    // Escolhe o maior retrato que caiba sem empurrar demais o eixo: para cada
    // tamanho, calcula o topo de eixo necessário para a linha passar por baixo
    // dos blocos e aceita o primeiro que não estique a escala além de 60%. Em
    // série que só sobe (Ibovespa) esse é o preço de pôr as fotos em cima da
    // linha; quando nem assim cabe, a foto encolhe.
    var opcoes = { minFixo: s.minEixo };
    var natural = escalaY(vals.concat(barras ? [0] : []), opcoes);
    var escolhido = null;
    [1, 0.85, 0.7, 0.55, 0.4].some(function (escalaFoto) {
      var g = comEscala(natural, escalaFoto);
      var pico = -Infinity;
      g.blocos.forEach(function (b) {
        pts.forEach(function (p) {
          var x = g.X(p.i + 0.5);
          if (x >= b.ocupa[0] && x <= b.ocupa[1] && p.v > pico) pico = p.v;
        });
      });
      var altoMin = natural.max;
      if (pico > -Infinity) {
        var fracao = 1 - g.alturaBloco / g.ph;
        altoMin = natural.min + (pico - natural.min) / Math.max(0.2, fracao);
      }
      var esc = escalaY(vals.concat(barras ? [0] : []), Object.assign({ altoMin: altoMin }, opcoes));
      var esticou = (esc.max - esc.min) / (natural.max - natural.min);
      if (esticou <= 1.6 || escalaFoto === 0.4) {
        escolhido = comEscala(esc, escalaFoto);
        return true;
      }
      return false;
    });

    var g = escolhido, L = g.L, X = g.X, Y = g.Y, esc = g.esc, ph = g.ph, pw = g.pw;
    var svg = el("svg", {
      xmlns: NS, viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H,
      role: "img", "aria-label": s.titulo + " — " + s.subtitulo + ", por governo"
    });
    var desenhos = [];   // imagens: fora do SVG na hora de exportar PNG

    // faixas dos mandatos
    g.blocos.forEach(function (b) {
      svg.appendChild(el("rect", {
        x: b.x0, y: L.y0, width: b.largura, height: ph, fill: b.m.cor, "fill-opacity": pal.faixaOp
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
      var at = { "font-size": L.tick, fill: pal.eixo, "dominant-baseline": "central", y: y };
      svg.appendChild(texto(rot, Object.assign({ x: L.x0 - 16, "text-anchor": "end" }, at)));
      if (L.eixoDuplo && Math.abs(y - seloY) > seloH / 2 + L.tick * 0.5) {
        svg.appendChild(texto(rot, Object.assign({ x: L.x1 + 16, "text-anchor": "start" }, at)));
      }
    });

    // Eixo X sempre em anos cheios, marcando janeiro. Se um ano de largura não
    // comporta o rótulo (acontece na versão estreita, de celular), pula de 2 em
    // 2 anos — nunca meio ano, para o eixo não trocar de passo entre um período
    // e outro.
    var pxMes = pw / (d1 - d0), passoX = 12;
    while (pxMes * passoX < L.xlab * 1.15) passoX += 12;
    for (var i = d0; i < d1; i++) {
      if (i % passoX !== 0) continue;
      var cx = X(i + 0.5);
      svg.appendChild(el("line", { x1: cx, x2: cx, y1: L.y1, y2: L.y1 + 8, stroke: pal.zero, "stroke-width": 1.5 }));
      svg.appendChild(texto(rotuloMesCurto(i), {
        x: cx, y: L.y1 + 18, "font-size": L.xlab, fill: pal.eixo, "text-anchor": "end",
        "dominant-baseline": "central", transform: "rotate(-90 " + cx + " " + (L.y1 + 18) + ")"
      }));
    }

    // nome do mandato (acima do gráfico), retrato e números do período
    g.blocos.forEach(function (b) {
      if (b.nomeW) {
        svg.appendChild(texto(b.m.nome, {
          x: b.cx, y: L.nome.y, "font-size": b.nomeFs, "font-weight": "bold",
          fill: pal.faixaNome, "text-anchor": "middle"
        }));
      }
      if (b.foto) {
        desenhos.push({
          src: b.foto.src, x: b.cx - b.foto.w / 2, y: L.y0 + fx.pad, w: b.foto.w, h: b.foto.h
        });
      }
      if (b.est) {
        var corDelta = b.est.sinal > 0 ? pal.alta : b.est.sinal < 0 ? pal.baixa : pal.faixaNome;
        [[b.est.delta, corDelta], [b.est.media, pal.faixaNome]].forEach(function (linha, k) {
          svg.appendChild(texto(linha[0], {
            x: b.cx, y: g.baseTexto + b.statFs * (0.85 + k * 1.25), "font-size": b.statFs,
            "font-weight": "bold", fill: linha[1], "text-anchor": "middle"
          }));
        });
      }
    });

    // série
    if (barras) {
      var bw = Math.max(1.5, pxMes * 0.7), yBase = Y(Math.max(esc.min, 0));
      pts.forEach(function (p) {
        if (!p.v) return;
        var yy = Y(p.v);
        svg.appendChild(el("rect", {
          x: X(p.i + 0.5) - bw / 2, y: yy, width: bw, height: Math.max(2, yBase - yy), fill: pal.linha
        }));
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
    var bx = L.W - 26 - g.sw;
    var px = X(ult.i + 0.5), py = Y(ult.v);
    if (px + 6 < bx) {
      svg.appendChild(el("line", { x1: px, y1: py, x2: bx, y2: seloY, stroke: pal.suave, "stroke-width": 1.5 }));
    }
    if (!barras) svg.appendChild(el("circle", { cx: px, cy: py, r: 8, fill: pal.linha, stroke: pal.bg, "stroke-width": 3 }));
    svg.appendChild(el("rect", { x: bx, y: seloY - seloH / 2, width: g.sw, height: seloH, rx: 5, fill: pal.selo }));
    svg.appendChild(texto(rotSelo, {
      x: bx + g.sw / 2, y: seloY, "font-size": L.selo, "font-weight": "bold", fill: pal.seloTexto,
      "text-anchor": "middle", "dominant-baseline": "central"
    }));

    // título, subtítulo e fonte
    svg.appendChild(texto(s.titulo, {
      x: L.titulo.x, y: L.titulo.y, "font-weight": "bold", fill: pal.texto,
      "font-size": corpoQueCabe(s.titulo, L.titulo.fs, L.tituloMax, "bold")
    }));
    svg.appendChild(texto(s.subtitulo, { x: L.sub.x, y: L.sub.y, "font-size": L.sub.fs, fill: pal.suave }));
    svg.appendChild(texto("Fonte: " + (s.fonte || meta.fonte) + ".", {
      x: L.fonte.x, y: L.fonte.y, "font-size": L.fonte.fs, fill: pal.suave, "text-anchor": "end"
    }));

    desenhos.push({ src: pal.logo, x: L.logo.x, y: L.logo.y, w: L.logo.w, h: L.logo.w * LOGO_RAZAO });

    return {
      svg: svg, L: L, pal: pal, X: X, Y: Y, d0: d0, d1: d1, pts: pts, blocos: g.blocos,
      alturaBloco: g.alturaBloco, desenhos: desenhos,
      porIdx: pts.reduce(function (o, p) { o[p.i] = p; return o; }, {})
    };
  }

  // na tela as imagens entram como <image href>; no PNG elas vão para o canvas
  function imagensNoSvg(g) {
    g.desenhos.forEach(function (im) {
      g.svg.appendChild(el("image", { href: im.src, x: im.x, y: im.y, width: im.w, height: im.h }));
    });
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
      camada.appendChild(el("circle", { cx: x, cy: y, r: 9, fill: pal.linha, stroke: pal.bg, "stroke-width": 3 }));

      var gov = null;
      g.blocos.forEach(function (b) { if (ponto.i >= b.a && ponto.i < b.b) gov = b.m; });
      var linhas = [rotuloMesLongo(ponto.i), fmtValor(cartao.serie, ponto.v)];
      if (gov) linhas.push(gov.nome);
      var fs = L.tip, pad = fs * 0.6;
      var w = Math.max.apply(null, linhas.map(function (t, k) {
        return largura(t, fs, k === 1 ? "bold" : "normal");
      })) + pad * 2 + (gov ? fs * 0.7 : 0);
      var h = linhas.length * fs * 1.35 + pad * 1.2;
      var bx = x + 24; if (bx + w > L.x1 + 40) bx = x - 24 - w;
      var by = Math.min(L.y0 + g.alturaBloco + 16, L.y1 - h - 16);
      camada.appendChild(el("rect", {
        x: bx, y: by, width: w, height: h, rx: 8, fill: pal.tipBg, stroke: pal.tipBorda, "stroke-width": 1.5
      }));
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
    if (id === "tudo") return null;
    if (id === "padrao") return idxMes(s.inicioPadrao);
    return idxMes(s.dados[s.dados.length - 1][0]) - (+id) * 12 + 1;
  }

  function criarCartao(s) {
    var cartao = { serie: s, periodo: s.inicioPadrao ? "padrao" : "tudo", inicioIdx: null, chave: null };
    var vazio = !s.dados.length;
    if (!vazio) cartao.inicioIdx = inicioDoPeriodo(s, cartao.periodo);

    var frame = html("div", { "class": "frame" });
    var raiz = html("article", { "class": "card", id: s.id });
    raiz.appendChild(html("h2", { "class": "sr-only", texto: s.titulo + " — " + s.subtitulo }));

    var ferramentas = html("div", { "class": "card-tools" });
    if (!vazio) {
      var grupo = html("div", { "class": "periodos", role: "group", "aria-label": "Período de " + s.titulo });
      periodosDisponiveis(s).forEach(function (p) {
        var b = html("button", {
          type: "button", texto: p.rot, "data-p": p.id, "aria-pressed": String(p.id === cartao.periodo)
        });
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

  function desenhar(cartao, forcar) {
    if (!cartao.serie.dados.length) return;
    var nomeLayout = cartao.frame.clientWidth < 700 || window.innerWidth < 700 ? "narrow" : "wide";
    var chave = nomeLayout + "|" + tema() + "|" + cartao.periodo;
    if (!forcar && cartao.chave === chave) return;
    cartao.chave = chave;
    var L = LAYOUTS[nomeLayout];
    var g = construir(cartao, L, tema());
    imagensNoSvg(g);
    ligarHover(cartao, g);
    cartao.frame.style.aspectRatio = L.W + " / " + L.H;
    cartao.frame.innerHTML = "";
    cartao.frame.appendChild(g.svg);
  }

  // ---------- baixar ----------
  var FORMATOS = [
    { id: "png", nome: "PNG", nota: "sem perda, o mais nítido" },
    { id: "jpg", nome: "JPG", nota: "arquivo menor, para redes e WhatsApp" },
    { id: "pdf", nome: "PDF", nota: "para imprimir ou anexar" },
    { id: "svg", nome: "SVG", nota: "vetor editável (Illustrator/Figma)" }
  ];
  var tamanhoEscolhido = "slide";
  try { tamanhoEscolhido = localStorage.getItem("pm_tamanho") || "slide"; } catch (e) {}

  function tamanhoPorId(id) {
    return TAMANHOS.filter(function (t) { return t.id === id; })[0] || TAMANHOS[0];
  }
  function dimensoes(t) { return (t.layout.W * t.escala) + "×" + (t.layout.H * t.escala); }

  function menuBaixar(cartao) {
    var caixa = html("div", { "class": "baixar" });
    var botao = html("button", { type: "button", "class": "btn", "aria-haspopup": "menu", "aria-expanded": "false" });
    botao.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg><span>Baixar</span>';
    var menu = html("div", { "class": "menu", role: "menu", hidden: "" });

    var rotTam = html("label", { "class": "menu-rotulo", texto: "Tamanho" });
    var sel = html("select", { "class": "menu-tamanho", "aria-label": "Tamanho da imagem" });
    TAMANHOS.forEach(function (t) {
      var o = html("option", { value: t.id, texto: t.nome + " · " + dimensoes(t) });
      if (t.id === tamanhoPorId(tamanhoEscolhido).id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      tamanhoEscolhido = sel.value;
      try { localStorage.setItem("pm_tamanho", sel.value); } catch (e) {}
      document.querySelectorAll(".menu-tamanho").forEach(function (x) { x.value = sel.value; });
    });
    rotTam.appendChild(sel);
    menu.appendChild(rotTam);

    FORMATOS.forEach(function (f) {
      var b = html("button", { type: "button", role: "menuitem" });
      b.innerHTML = "Imagem (" + f.nome + ")<small>" + f.nota + ", no tema atual</small>";
      b.addEventListener("click", function () { fechar(); exportar(cartao, tamanhoPorId(sel.value), f.id); });
      menu.appendChild(b);
    });
    menu.appendChild(html("hr"));
    var bc = html("button", { type: "button", role: "menuitem" });
    bc.innerHTML = "Dados (CSV)<small>mês e valor, para o Excel</small>";
    bc.addEventListener("click", function () { fechar(); baixarCSV(cartao); });
    menu.appendChild(bc);

    function fechar() { menu.hidden = true; botao.setAttribute("aria-expanded", "false"); }
    botao.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = menu.hidden;
      document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
      menu.hidden = !abrir;
      botao.setAttribute("aria-expanded", String(abrir));
    });
    document.addEventListener("click", function (e) { if (!caixa.contains(e.target)) fechar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
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
  function nomeArquivo(cartao, ext, t) {
    return "poder-e-mercado-" + cartao.serie.id + (t && t.id !== "slide" ? "-" + t.id : "") + "." + ext;
  }
  function carregarImagem(src) {
    return new Promise(function (ok, erro) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { erro(new Error("não carregou " + src.slice(0, 60))); };
      im.src = src;
    });
  }
  function serializar(svg) { return new XMLSerializer().serializeToString(svg); }
  function comoDataURL(im) {
    var c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext("2d").drawImage(im, 0, 0);
    return c.toDataURL(/\.png$/i.test(im.src) ? "image/png" : "image/jpeg", 0.92);
  }

  function exportar(cartao, t, formato) {
    if (formato === "svg") return baixarSVG(cartao, t);
    var nomeTema = tema(), L = t.layout, k = t.escala;
    var g = construir(cartao, L, nomeTema);
    var W = L.W * k, H = L.H * k;
    // o SVG é rasterizado já no tamanho final: texto e linhas saem nítidos
    g.svg.setAttribute("width", W); g.svg.setAttribute("height", H);
    Promise.all([
      carregarImagem("data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializar(g.svg))),
      nomeTema === "dark" ? carregarImagem("assets/fundo.jpg") : Promise.resolve(null)
    ].concat(g.desenhos.map(function (im) { return carregarImagem(im.src); }))).then(function (r) {
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var x = c.getContext("2d");
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.fillStyle = g.pal.bg; x.fillRect(0, 0, W, H);
      if (r[1]) {
        // fundo em "cover": preenche o quadro sem distorcer (recorta o excesso)
        var f = r[1], z = Math.max(W / f.naturalWidth, H / f.naturalHeight);
        var fw = f.naturalWidth * z, fh = f.naturalHeight * z;
        x.drawImage(f, (W - fw) / 2, (H - fh) / 2, fw, fh);
      }
      x.drawImage(r[0], 0, 0, W, H);
      g.desenhos.forEach(function (im, j) { x.drawImage(r[j + 2], im.x * k, im.y * k, im.w * k, im.h * k); });
      if (formato === "png") {
        c.toBlob(function (b) { salvar(b, nomeArquivo(cartao, "png", t)); }, "image/png");
      } else if (formato === "jpg") {
        c.toBlob(function (b) { salvar(b, nomeArquivo(cartao, "jpg", t)); }, "image/jpeg", 0.95);
      } else {
        c.toBlob(function (b) {
          b.arrayBuffer().then(function (buf) {
            salvar(pdfComJpeg(new Uint8Array(buf), W, H, L.W * 0.75, L.H * 0.75), nomeArquivo(cartao, "pdf", t));
          });
        }, "image/jpeg", 0.97);
      }
    }).catch(function (e) { alert("Não consegui gerar a imagem: " + e.message); });
  }

  // PDF de uma página com a imagem (JPEG) ocupando a página toda.
  // pw/ph em pontos: 1 px do layout = 0,75 pt (96 dpi), então 16:9 vira 1440×810 pt.
  function pdfComJpeg(jpeg, iw, ih, pw, ph) {
    var enc = new TextEncoder(), partes = [], tam = 0, offs = [];
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; partes.push(b); tam += b.length; }
    function obj(n, corpo) { offs[n] = tam; add(n + " 0 obj\n" + corpo + "\nendobj\n"); }
    var conteudo = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] " +
      "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    offs[4] = tam;
    add("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + iw + " /Height " + ih +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    add(jpeg);
    add("\nendstream\nendobj\n");
    obj(5, "<< /Length " + conteudo.length + " >>\nstream\n" + conteudo + "\nendstream");
    var xref = tam, linhas = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) linhas += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    add(linhas + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(partes, { type: "application/pdf" });
  }

  function baixarSVG(cartao, t) {
    var nomeTema = tema(), L = t.layout;
    var g = construir(cartao, L, nomeTema);
    Promise.all(g.desenhos.map(function (im) { return carregarImagem(im.src); })).then(function (r) {
      g.svg.insertBefore(el("rect", { x: 0, y: 0, width: L.W, height: L.H, fill: g.pal.bg }), g.svg.firstChild);
      g.desenhos.forEach(function (im, k) {
        g.svg.appendChild(el("image", { href: comoDataURL(r[k]), x: im.x, y: im.y, width: im.w, height: im.h }));
      });
      salvar(new Blob([serializar(g.svg)], { type: "image/svg+xml" }), nomeArquivo(cartao, "svg", t));
    }).catch(function (e) { alert("Não consegui gerar o SVG: " + e.message); });
  }

  function baixarCSV(cartao) {
    var s = cartao.serie, pct = s.formato === "pct";
    var linhas = ["mes;" + s.titulo.replace(/;/g, ",") + " (" + s.subtitulo.replace(/;/g, ",") + ");governo"];
    s.dados.forEach(function (d) {
      var i = idxMes(d[0]), gov = "";
      mandatos.forEach(function (m) { if (i >= idxMes(m.inicio) && i <= idxMes(m.fim)) gov = m.nome; });
      var v = pct ? d[1] * 100 : d[1];
      linhas.push(d[0] + ";" + String(Math.round(v * 1e6) / 1e6).replace(".", ",") + ";" + gov);
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
    return fetch(url, { cache: "no-cache" }).then(function (r) {   // sempre confere se há dados novos
      if (!r.ok) throw new Error(url + " → HTTP " + r.status);
      return r.json();
    });
  }

  function iniciar() {
    var host = document.getElementById("graficos");
    Promise.all([pegarJSON("dados/indicadores.json"), pegarJSON("dados/mandatos.json")]).then(function (r) {
      meta = { fonte: r[0].fonte, atualizado: r[0].atualizado };
      mandatos = r[1].mandatos;
      // os retratos precisam estar carregados antes do primeiro desenho: é deles
      // que sai a proporção usada para reservar espaço no topo do gráfico
      var fotos = mandatos.map(function (m) { return m.foto; }).filter(Boolean);
      return Promise.all(fotos.map(function (src) {
        return carregarImagem(src).then(function (im) { imagens[src] = im; }, function () {});
      })).then(function () { return r[0].series; });
    }).then(function (series) {
      host.innerHTML = "";
      var chips = document.getElementById("chips");
      series.forEach(function (s) {
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
