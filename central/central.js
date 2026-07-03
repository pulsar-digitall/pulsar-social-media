// Central Pulsar: areas Clientes e Gestor de Trafego.
// Consome a API do backend Node (PULSAR GESTOR DE TRAFEGO) via config.js.
// Nenhum token ou chave vive aqui: o navegador so fala com o backend local.
(function () {
  var CFG = window.PULSAR_CONFIG || {};
  var API = String(CFG.API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

  var estado = {
    metaConectada: false,
    clientes: [],
    concorrentes: [],
    formEditandoId: null, // null = fechado, "" = novo, "id" = editando
    gestor: {
      view: "dash", // "dash" | "cliente"
      clienteId: null,
      periodo: 7, // 7 | 14 | 30 | "custom"
      desde: "", // YYYY-MM-DD (periodo custom)
      ate: "",
      planoAtual: null // { planId, plan, safety }
    }
  };

  var rootClientes = document.getElementById("clientes-root");
  var rootGestor = document.getElementById("gestor-root");

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fmtMoeda(v, moeda) {
    if (v == null || isNaN(v)) return "-";
    try { return Number(v).toLocaleString("pt-BR", { style: "currency", currency: moeda || "BRL" }); }
    catch (e) { return "R$ " + Number(v).toFixed(2); }
  }
  function fmtNum(v) { return (v == null || isNaN(v)) ? "-" : Number(v).toLocaleString("pt-BR"); }
  function fmtDec(v, casas) { return (v == null || isNaN(v)) ? "-" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
  function fmtData(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function spinner(texto) { return '<div class="ct-carregando"><span class="spin"></span>' + esc(texto || "Carregando...") + "</div>"; }

  // fetch com timeout; erros de rede viram { offline: true }
  function api(caminho, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 60000) : null;
    var init = {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      signal: ctrl ? ctrl.signal : undefined
    };
    if (opts.body) init.body = JSON.stringify(opts.body);
    return fetch(API + caminho, init)
      .then(function (resp) {
        return resp.json().catch(function () { return {}; }).then(function (dados) {
          if (timer) clearTimeout(timer);
          if (!resp.ok) {
            var err = new Error((dados && dados.erro) || ("Erro HTTP " + resp.status));
            err.status = resp.status;
            err.payload = dados;
            throw err;
          }
          return dados;
        });
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (!err.status) err.offline = true;
        throw err;
      });
  }

  function htmlOffline() {
    return (
      '<div class="ct-offline">' +
        '<div class="titulo"><span class="dot"></span>Backend offline — inicie o servico Paid Ads</div>' +
        "<p>O modulo Gestor de Trafego depende do backend Node rodando na sua maquina. " +
        "Abra um terminal na pasta <code>PULSAR GESTOR DE TRÁFEGO</code> e rode:</p>" +
        "<p><code>npm run server</code></p>" +
        '<p>API esperada em <code>' + esc(API) + "</code> (ajuste em <code>config.js</code> se mudar a porta).</p>" +
        '<div class="acoes"><button class="btn-toolbar" data-act="retry">Tentar de novo</button></div>' +
      "</div>"
    );
  }

  function renderOffline(root, aoTentar) {
    root.innerHTML = htmlOffline();
    var btn = root.querySelector('[data-act="retry"]');
    if (btn) btn.addEventListener("click", aoTentar);
  }

  function badgeStatus(status) {
    return '<span class="ct-badge ' + esc(status) + '">' + esc(status) + "</span>";
  }

  // ---------------------------------------------------------------------
  // AREA: CLIENTES
  // ---------------------------------------------------------------------
  function carregarClientes() {
    if (!rootClientes) return;
    rootClientes.innerHTML = spinner("Carregando clientes...");
    Promise.all([api("/api/paid-ads/clients"), api("/api/paid-ads/concorrentes")])
      .then(function (r) {
        estado.metaConectada = !!r[0].metaConectada;
        estado.clientes = r[0].clientes || [];
        estado.concorrentes = r[1].concorrentes || [];
        renderClientes();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(rootClientes, carregarClientes);
        else rootClientes.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function renderClientes() {
    var h = "";

    if (!estado.metaConectada) {
      h += '<div class="ct-nota">Meta API sem token no backend (.env). Cadastro e associacao funcionam normalmente; ' +
           "metricas e comandos ficam disponiveis quando o META_ACCESS_TOKEN for configurado.</div>";
    }

    h += '<div class="filtros" style="margin:0 0 22px;">' +
         '<button class="btn-toolbar" data-act="novo"><span class="mais">+</span> Novo cliente</button>' +
         '<div class="contador"><b>' + estado.clientes.length + "</b> cliente(s)</div></div>";

    if (estado.formEditandoId !== null) h += htmlFormCliente();

    // Tabela de clientes
    h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Clientes</h3></div>';
    if (!estado.clientes.length) {
      h += '<div class="vazio">Nenhum cliente cadastrado ainda. Crie o primeiro com "+ Novo cliente".</div>';
    } else {
      h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
           "<th>Cliente</th><th>Status</th><th>Conta de anuncio</th><th>Concorrentes</th><th></th></tr></thead><tbody>";
      estado.clientes.forEach(function (c) {
        var conta = c.adAccountId
          ? chipConexao(c) + ' <span style="color:var(--text-3);font-size:12px;">' + esc(c.adAccountId) + "</span>"
          : '<span class="ct-badge off">Pendente</span>';
        var concs = (c.concorrentes || []).map(function (r) { return esc(r.nome); }).join(", ") || '<span style="color:var(--text-3);">nenhum</span>';
        h += "<tr><td class=\"nome-obj\">" + esc(c.nome) + "</td><td>" + badgeStatus(c.status) + "</td><td>" + conta + "</td>" +
             "<td style=\"max-width:280px;\">" + concs + "</td>" +
             '<td class="num"><button class="btn-sm" data-act="editar" data-id="' + esc(c.id) + '">Editar</button> ' +
             '<button class="btn-sm salvar" data-act="abrir" data-id="' + esc(c.id) + '">Abrir no Gestor</button></td></tr>';
      });
      h += "</tbody></table></div>";
    }
    h += "</div>";

    // Concorrentes do Espiao (associados e nao associados)
    var naoAssociados = estado.concorrentes.filter(function (r) { return !r.clienteId; });
    h += '<div class="painel"><div class="painel-topo"><h3>Concorrentes do Radar</h3>' +
         (naoAssociados.length ? '<span class="ct-badge alerta">' + naoAssociados.length + " nao associado(s)</span>" : "") + "</div>";
    if (!estado.concorrentes.length) {
      h += '<div class="vazio">Nenhum concorrente no catalogo ainda. Rode o scraper do Radar para coletar.</div>';
    } else {
      h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
           "<th>Concorrente</th><th>Page ID</th><th class=\"num\">Anuncios coletados</th><th>Cliente</th><th></th></tr></thead><tbody>";
      estado.concorrentes.forEach(function (r) {
        var vinculo = r.clienteNome
          ? '<span class="ct-badge on">' + esc(r.clienteNome) + "</span>"
          : '<span class="ct-badge off">nao associado</span>';
        var acao = "";
        if (!r.clienteId && estado.clientes.length) {
          var ops = estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nome) + "</option>"; }).join("");
          acao = '<select data-sel="' + esc(r.pageId) + '" style="min-width:150px;padding:7px 30px 7px 11px;font-size:12.5px;">' + ops + "</select> " +
                 '<button class="btn-sm salvar" data-act="associar" data-page="' + esc(r.pageId) + '">Associar</button>';
        } else if (r.clienteId) {
          acao = '<button class="btn-sm" data-act="desassociar" data-page="' + esc(r.pageId) + '" data-cliente="' + esc(r.clienteId) + '">Remover vinculo</button>';
        }
        h += "<tr><td class=\"nome-obj\">" + esc(r.nome) + "</td><td style=\"color:var(--text-3);font-size:12.5px;\">" + esc(r.pageId) + "</td>" +
             '<td class="num">' + fmtNum(r.totalAnuncios) + "</td><td>" + vinculo + '</td><td class="num">' + acao + "</td></tr>";
      });
      h += "</tbody></table></div>";
    }
    h += "</div>";

    rootClientes.innerHTML = h;
    ligarEventosClientes();
  }

  function htmlFormCliente() {
    var editando = estado.formEditandoId !== "" ? buscarCliente(estado.formEditandoId) : null;
    var c = editando || { nome: "", status: "ativo", adAccountId: "", pageId: "", instagramId: "", pixelId: "", moeda: "BRL", timezone: "America/Sao_Paulo", metas: {}, concorrentesMonitorados: [], observacoes: "" };
    var m = c.metas || {};
    function campo(rotulo, nome, valor, tipo, ph) {
      return '<div class="campo"><label>' + rotulo + '</label><input type="' + (tipo || "text") + '" name="' + nome + '" value="' + esc(valor == null ? "" : valor) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + (tipo === "number" ? ' step="any" min="0"' : "") + " /></div>";
    }
    var checks = estado.concorrentes.map(function (r) {
      var dono = r.clienteId && (!editando || r.clienteId !== editando.id);
      var marcado = (c.concorrentesMonitorados || []).indexOf(r.pageId) >= 0;
      var extra = dono ? " (hoje com " + esc(r.clienteNome) + ")" : "";
      return '<label class="ct-conc-check' + (marcado ? " marcado" : "") + '"><input type="checkbox" name="conc" value="' + esc(r.pageId) + '"' + (marcado ? " checked" : "") + " />" + esc(r.nome) + extra + "</label>";
    }).join("");
    return (
      '<div class="ct-form" id="ct-form-cliente">' +
        "<h3>" + (editando ? "Editar cliente" : "Novo cliente") + "</h3>" +
        '<div class="ct-form-grid">' +
          campo("Nome *", "nome", c.nome) +
          '<div class="campo"><label>Status</label><div class="select-wrap"><select name="status">' +
            ["ativo", "pausado", "onboarding"].map(function (s) { return '<option value="' + s + '"' + (c.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") +
          "</select></div></div>" +
          campo("Conta Meta Ads", "adAccountId", c.adAccountId, "text", "act_123456789") +
          campo("Google Ads Customer ID", "googleAdsCustomerId", c.googleAdsCustomerId, "text", "1234567890") +
          campo("Page ID (Facebook)", "pageId", c.pageId) +
          campo("Instagram ID", "instagramId", c.instagramId) +
          campo("Pixel ID", "pixelId", c.pixelId) +
          campo("Moeda", "moeda", c.moeda || "BRL") +
          campo("Timezone", "timezone", c.timezone || "America/Sao_Paulo") +
        "</div>" +
        '<div class="secao">Metas de performance</div>' +
        '<div class="ct-form-grid">' +
          campo("CPL maximo (R$)", "maxCpl", m.maxCpl, "number") +
          campo("CTR minimo (%)", "minCtr", m.minCtr, "number") +
          campo("Frequencia maxima", "maxFrequency", m.maxFrequency, "number") +
          campo("CPM maximo (R$)", "maxCpm", m.maxCpm, "number") +
          campo("Leads minimos", "minLeads", m.minLeads, "number") +
        "</div>" +
        '<div class="secao">Concorrentes monitorados (Radar)</div>' +
        '<div class="ct-conc-lista">' + (checks || '<span style="color:var(--text-3);font-size:13px;">Nenhum concorrente no catalogo ainda.</span>') + "</div>" +
        '<div class="secao">Observacoes</div>' +
        '<div class="campo"><textarea name="observacoes">' + esc(c.observacoes || "") + "</textarea></div>" +
        '<div class="ct-form-acoes">' +
          '<button class="btn-toolbar" data-act="salvar-cliente">Salvar cliente</button>' +
          '<button class="ct-btn-sec" data-act="cancelar">Cancelar</button>' +
        "</div>" +
        '<div class="ct-erro-form" id="ct-erro-form"></div>' +
      "</div>"
    );
  }

  function buscarCliente(id) {
    for (var i = 0; i < estado.clientes.length; i++) if (estado.clientes[i].id === id) return estado.clientes[i];
    return null;
  }

  function ligarEventosClientes() {
    rootClientes.querySelectorAll("[data-act]").forEach(function (el) {
      var act = el.getAttribute("data-act");
      if (act === "novo") el.addEventListener("click", function () { estado.formEditandoId = ""; renderClientes(); });
      if (act === "cancelar") el.addEventListener("click", function () { estado.formEditandoId = null; renderClientes(); });
      if (act === "editar") el.addEventListener("click", function () { estado.formEditandoId = el.getAttribute("data-id"); renderClientes(); window.scrollTo({ top: 0, behavior: "smooth" }); });
      if (act === "abrir") el.addEventListener("click", function () { abrirNoGestor(el.getAttribute("data-id")); });
      if (act === "salvar-cliente") el.addEventListener("click", salvarClienteDoForm);
      if (act === "associar") el.addEventListener("click", function () { associarConcorrente(el.getAttribute("data-page")); });
      if (act === "desassociar") el.addEventListener("click", function () { desassociarConcorrente(el.getAttribute("data-page"), el.getAttribute("data-cliente")); });
    });
    // realce visual dos checkboxes de concorrente
    rootClientes.querySelectorAll(".ct-conc-check input").forEach(function (chk) {
      chk.addEventListener("change", function () { chk.closest(".ct-conc-check").classList.toggle("marcado", chk.checked); });
    });
  }

  function salvarClienteDoForm() {
    var form = document.getElementById("ct-form-cliente");
    if (!form) return;
    function v(nome) { var el = form.querySelector('[name="' + nome + '"]'); return el ? el.value.trim() : ""; }
    var metas = {};
    ["maxCpl", "minCtr", "maxFrequency", "maxCpm", "minLeads"].forEach(function (k) {
      var num = parseFloat(v(k).replace(",", "."));
      if (!isNaN(num) && num > 0) metas[k] = num;
    });
    var concs = [];
    form.querySelectorAll('[name="conc"]:checked').forEach(function (chk) { concs.push(chk.value); });
    var payload = {
      id: estado.formEditandoId || undefined,
      nome: v("nome"),
      status: v("status") || "ativo",
      adAccountId: v("adAccountId"),
      googleAdsCustomerId: v("googleAdsCustomerId"),
      pageId: v("pageId"),
      instagramId: v("instagramId"),
      pixelId: v("pixelId"),
      moeda: v("moeda") || "BRL",
      timezone: v("timezone") || "America/Sao_Paulo",
      metas: metas,
      concorrentesMonitorados: concs,
      observacoes: v("observacoes")
    };
    api("/api/paid-ads/clients", { method: "POST", body: payload })
      .then(function () { estado.formEditandoId = null; carregarClientes(); })
      .catch(function (err) {
        var alvo = document.getElementById("ct-erro-form");
        if (alvo) alvo.textContent = err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message;
      });
  }

  function associarConcorrente(pageId) {
    var sel = rootClientes.querySelector('[data-sel="' + pageId + '"]');
    var cliente = sel ? buscarCliente(sel.value) : null;
    if (!cliente) return;
    var lista = (cliente.concorrentesMonitorados || []).slice();
    if (lista.indexOf(pageId) < 0) lista.push(pageId);
    salvarVinculo(cliente, lista);
  }

  function desassociarConcorrente(pageId, clienteId) {
    var cliente = buscarCliente(clienteId);
    if (!cliente) return;
    var lista = (cliente.concorrentesMonitorados || []).filter(function (p) { return p !== pageId; });
    salvarVinculo(cliente, lista);
  }

  function salvarVinculo(cliente, lista) {
    var payload = {
      id: cliente.id, nome: cliente.nome, status: cliente.status,
      adAccountId: cliente.adAccountId || "", googleAdsCustomerId: cliente.googleAdsCustomerId || "",
      pageId: cliente.pageId || "",
      instagramId: cliente.instagramId || "", pixelId: cliente.pixelId || "",
      moeda: cliente.moeda, timezone: cliente.timezone, metas: cliente.metas || {},
      concorrentesMonitorados: lista, observacoes: cliente.observacoes || ""
    };
    api("/api/paid-ads/clients", { method: "POST", body: payload })
      .then(carregarClientes)
      .catch(function (err) {
        if (err.offline) renderOffline(rootClientes, carregarClientes);
        else window.alert("Erro ao salvar: " + err.message);
      });
  }

  // ---------------------------------------------------------------------
  // AREA: GESTOR DE TRAFEGO
  // ---------------------------------------------------------------------
  function carregarGestor() {
    if (!rootGestor) return;
    if (estado.gestor.view === "cliente" && estado.gestor.clienteId) renderGestorCliente();
    else renderGestorDash();
  }

  function abrirNoGestor(clienteId) {
    estado.gestor.view = "cliente";
    estado.gestor.clienteId = clienteId;
    estado.gestor.planoAtual = null;
    var btn = document.querySelector('nav.areas .nav-item[data-area="gestor"]');
    if (btn) btn.click();
  }

  // ---------- Dashboard geral ----------
  function renderGestorDash() {
    estado.gestor.view = "dash";
    rootGestor.innerHTML = spinner("Carregando visao geral...");
    api("/api/paid-ads/overview")
      .then(function (ov) {
        var h = "";
        if (!ov.metaConectada) {
          h += '<div class="ct-nota">Meta API sem token no backend. Os numeros de investimento, leads e CPL aparecem ' +
               "quando o META_ACCESS_TOKEN for configurado no .env do Gestor de Trafego.</div>";
        }
        var semDados = !ov.dadosDisponiveis;
        function num(v, fmt) { return semDados ? "—" : fmt(v); }
        var stats = [
          { ico: "clientes", num: String(ov.clientesAtivos), lab: "Clientes ativos", sub: ov.clientesTotal + " no total" },
          { ico: "dinheiro", num: num(ov.investimentoTotal, function (v) { return fmtMoeda(v); }), lab: "Investimento (7d)" },
          { ico: "leads", num: num(ov.leadsTotal, fmtNum), lab: "Leads (7d)" },
          { ico: "alvo", num: semDados || ov.cplMedio == null ? "—" : fmtMoeda(ov.cplMedio), lab: "CPL medio (7d)" },
          { ico: "campanhas", num: num(ov.campanhasAtivas, fmtNum), lab: "Campanhas ativas" },
          { ico: "alerta", num: num(ov.campanhasComAlerta, fmtNum), lab: "Campanhas com alerta" }
        ];
        h += '<div class="stat-grid">' + stats.map(kpiHtml).join("") + "</div>";

        // Lista de clientes (line-cards, padrao da referencia)
        h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Clientes</h3></div><div style="padding:16px 18px 18px;">';
        if (!ov.porCliente.length) {
          h += '<div class="vazio">Nenhum cliente cadastrado. Crie na area Clientes.</div>';
        } else {
          h += '<div class="ct-lista">' + ov.porCliente.map(function (c) {
            var m = c.metrics;
            var lado = "";
            if (m) {
              lado += '<span class="valor">' + fmtMoeda(m.spend) + "</span>" +
                      '<span class="ct-badge neutro">' + fmtNum(m.leads) + " leads</span>" +
                      (m.costPerLead != null ? '<span class="ct-badge neutro">CPL ' + fmtMoeda(m.costPerLead) + "</span>" : "") +
                      (c.campanhasComAlerta > 0 ? '<span class="ct-badge alerta">' + c.campanhasComAlerta + " alerta(s)</span>" : '<span class="ct-badge on">ok</span>');
            } else {
              lado += c.contaConectada ? '<span class="ct-badge neutro">sem dados</span>' : '<span class="ct-badge off">Pendente</span>';
            }
            lado += pillTracking(c.trackingCompletude || 0);
            return '<div class="ct-item clicavel" data-id="' + esc(c.id) + '">' +
              '<span class="av">' + esc(iniciaisDe(c.nome)) + "</span>" +
              '<div class="info"><div class="titulo">' + esc(c.nome) + '</div><div class="sub">' +
                esc(c.status) + (c.contaConectada ? " · conta conectada" : " · conta pendente") + "</div></div>" +
              '<div class="lado">' + lado + '<span class="seta">&rsaquo;</span></div></div>';
          }).join("") + "</div>";
        }
        h += "</div></div>";

        // Ultimas otimizacoes
        h += '<div class="painel"><div class="painel-topo"><h3>Ultimas otimizacoes</h3></div>';
        if (!ov.ultimasOtimizacoes.length) {
          h += '<div class="vazio">Nenhuma otimizacao registrada ainda.</div>';
        } else {
          h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
               "<th>Quando</th><th>Cliente</th><th>Modo</th><th>Comando</th><th class=\"num\">Mudancas</th><th class=\"num\">Aplicadas</th></tr></thead><tbody>";
          ov.ultimasOtimizacoes.forEach(function (r) {
            h += "<tr><td>" + fmtData(r.timestamp) + "</td><td>" + esc(r.clientName) + "</td>" +
                 '<td><span class="ct-badge neutro">' + esc(r.mode) + '</span></td><td class="ct-hist-cmd" title="' + esc(r.command) + '">' + esc(r.command) + "</td>" +
                 '<td class="num">' + fmtNum(r.mudancas) + '</td><td class="num">' + fmtNum(r.aplicadas) + "</td></tr>";
          });
          h += "</tbody></table></div>";
        }
        h += "</div>";

        rootGestor.innerHTML = h;
        rootGestor.querySelectorAll(".ct-item.clicavel[data-id]").forEach(function (item) {
          item.addEventListener("click", function () {
            estado.gestor.view = "cliente";
            estado.gestor.clienteId = item.getAttribute("data-id");
            estado.gestor.planoAtual = null;
            renderGestorCliente();
          });
        });
      })
      .catch(function (err) {
        if (err.offline) renderOffline(rootGestor, renderGestorDash);
        else rootGestor.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  // ---------- Pagina do cliente ----------
  function renderGestorCliente() {
    var id = estado.gestor.clienteId;
    rootGestor.innerHTML = spinner("Carregando cliente...");
    api("/api/paid-ads/clients")
      .then(function (r) {
        estado.clientes = r.clientes || [];
        estado.metaConectada = !!r.metaConectada;
        var cliente = buscarCliente(id);
        if (!cliente) {
          rootGestor.innerHTML = '<div class="ct-resultado erro">Cliente nao encontrado.</div>';
          return;
        }
        montarPaginaCliente(cliente);
      })
      .catch(function (err) {
        if (err.offline) renderOffline(rootGestor, renderGestorCliente);
        else rootGestor.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  // ---------- Periodo (7/14/30 e personalizado) ----------
  function queryPeriodo(extra) {
    var g = estado.gestor;
    var q = g.periodo === "custom"
      ? "since=" + encodeURIComponent(g.desde) + "&until=" + encodeURIComponent(g.ate)
      : "period=" + g.periodo;
    return extra ? q + "&" + extra : q;
  }

  function seletorPeriodo() {
    var g = estado.gestor;
    var h = '<span class="ct-periodo">' + [7, 14, 30].map(function (p) {
      return '<button data-periodo="' + p + '"' + (g.periodo === p ? ' class="ativo"' : "") + ">" + p + "d</button>";
    }).join("") +
    '<button data-periodo="custom"' + (g.periodo === "custom" ? ' class="ativo"' : "") + ">Personalizado</button></span>";
    if (g.periodo === "custom") {
      h += '<span class="ct-datas"><input type="date" id="ct-data-de" value="' + esc(g.desde) + '" /> ate ' +
           '<input type="date" id="ct-data-ate" value="' + esc(g.ate) + '" /> ' +
           '<button class="btn-sm salvar" data-act="aplicar-datas">Aplicar</button></span>';
    }
    return h;
  }

  // Variacao vs periodo anterior. dir: 1 = subir e bom, -1 = descer e bom, 0 = neutro.
  function variacaoHtml(atual, anterior, dir, legenda) {
    var titulo = legenda ? ' title="' + esc(legenda) + '"' : "";
    if (atual == null || anterior == null || !isFinite(atual) || !isFinite(anterior) || anterior === 0) {
      return '<span class="ct-var neutra"' + titulo + ">&mdash;</span>";
    }
    var pct = ((atual - anterior) / Math.abs(anterior)) * 100;
    if (!isFinite(pct)) return '<span class="ct-var neutra"' + titulo + ">&mdash;</span>";
    var subiu = pct >= 0;
    var cls = dir === 0 ? "neutra" : ((subiu ? 1 : -1) === dir ? "boa" : "ruim");
    return '<span class="ct-var ' + cls + '"' + titulo + ">" + (subiu ? "&#8599;" : "&#8600;") + " " +
           Math.abs(pct).toFixed(1).replace(".", ",") + "%</span>";
  }

  // ---------- Card de KPI (icone em chip + numero + badge + label) ----------
  var ICONES_KPI = {
    dinheiro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    alvo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    clique: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 9 5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2 8 5.1"/><path d="m5.1 8-2.9-.8"/><path d="M14 4.1 12 6"/><path d="m6 12-1.9 2"/></svg>',
    grafico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    frequencia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    alcance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
    campanhas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    conversao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  };

  function kpiHtml(o) {
    return '<div class="stat">' +
      (o.ico && ICONES_KPI[o.ico] ? '<span class="ico-chip">' + ICONES_KPI[o.ico] + "</span>" : "") +
      '<div class="linha-num"><span class="num">' + o.num + "</span>" + (o.varr || "") + "</div>" +
      '<div class="lab">' + o.lab + "</div>" +
      (o.sub ? '<div class="ct-stat-sub">' + o.sub + "</div>" : "") +
      "</div>";
  }

  function iniciaisDe(nome) {
    return String(nome || "?").split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function linhaCacheHtml(cache, mock) {
    if (mock || !cache) return "";
    var quando = fmtData(cache.coletadoEm);
    return '<div class="ct-cache-linha">Dados coletados em ' + quando +
           (cache.doCache ? " (cache " + cache.ttlMinutos + " min)" : " (agora)") +
           ' &middot; <button class="ct-link" data-act="atualizar-agora">Atualizar agora</button></div>';
  }

  function chipConexao(cliente) {
    var cx = cliente.conexaoMeta;
    if (cx && cx.status === "conectado") return '<span class="ct-badge conectado" title="' + esc(cx.detalhe) + '">Conectado</span>';
    if (cx && cx.status === "erro") return '<span class="ct-badge alerta" title="' + esc(cx.detalhe) + '">Erro</span>';
    return '<span class="ct-badge off" title="' + esc(cx ? cx.detalhe : "Conexao ainda nao testada") + '">Pendente</span>';
  }

  function montarPaginaCliente(cliente) {
    var moeda = cliente.moeda || "BRL";
    var h =
      '<button class="ct-voltar" data-act="voltar">&lsaquo; Voltar para a visao geral</button>' +
      '<div class="filtros" style="margin:0 0 8px;align-items:center;">' +
        '<h2 style="font-size:20px;font-weight:700;">' + esc(cliente.nome) + "</h2>" +
        '<span id="ct-selo-exemplo" class="selo-exemplo" style="display:none;">Dados de exemplo</span>' +
        badgeStatus(cliente.status) +
        (cliente.adAccountId ? '<span class="ct-badge neutro">' + esc(cliente.adAccountId) + "</span>" : "") +
        '<span id="ct-conexao-chip">' + chipConexao(cliente) + "</span>" +
        '<button class="btn-sm" data-act="testar-conexao">Testar conexao</button>' +
        '<div class="contador" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span class="ct-datebox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span id="ct-datebox-texto">...</span></span>' +
          seletorPeriodo() +
        "</div>" +
      "</div>" +
      '<div id="ct-conexao-resultado"></div>' +
      '<div class="painel ct-secao" id="ct-tracking-strip" style="display:none;"></div>' +
      '<div class="ct-canal-titulo">Meta Ads</div>' +
      '<div class="ct-secao" id="ct-resumo">' + spinner("Carregando resumo...") + "</div>" +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Performance diaria</h3>' +
        '<span class="contador"><span class="ct-periodo" id="ct-serie-metrica">' +
          '<button data-metrica="investimento" class="ativo">Investimento</button>' +
          '<button data-metrica="leads">Leads</button>' +
        "</span></span></div>" +
        '<div id="ct-serie">' + spinner("Carregando grafico...") + "</div></div>" +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Campanhas</h3><span class="contador" style="font-size:12px;color:var(--text-3);">clique numa linha para abrir conjuntos e anuncios</span></div><div id="ct-campanhas">' + spinner("Carregando campanhas...") + "</div></div>" +
      '<div class="ct-canal-titulo">Google Ads <span class="ct-badge neutro">somente leitura</span></div>' +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Campanhas Google</h3></div><div id="ct-google">' + spinner("Carregando Google Ads...") + "</div></div>" +
      '<div class="ct-canal-titulo">Entregas</div>' +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Relatorios</h3>' +
        '<span class="contador" style="font-size:12px;color:var(--text-3);">usa o periodo selecionado no topo</span></div>' +
        '<div style="padding:18px 20px;">' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
            '<button class="btn-toolbar" data-act="rel-whatsapp">Gerar relatorio WhatsApp</button>' +
            '<button class="ct-btn-sec" data-act="rel-pdf">Gerar PDF</button>' +
          "</div>" +
          '<div id="ct-rel-resultado"></div>' +
          '<div id="ct-link-publico" style="margin-top:20px;">' + spinner("Verificando link publico...") + "</div>" +
          '<div id="ct-rel-historico" style="margin-top:20px;">' + spinner("Carregando historico de relatorios...") + "</div>" +
        "</div></div>" +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Diagnostico IA</h3>' +
        '<span class="contador"><button class="btn-toolbar" data-act="diagnosticar">Gerar diagnostico</button></span></div>' +
        '<div id="ct-diagnostico"><div class="ct-msg">Clique em "Gerar diagnostico" para analisar a conta no periodo selecionado. O diagnostico e informativo: nunca executa nada sozinho.</div></div></div>' +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Comando em linguagem natural</h3></div>' +
        '<div style="padding:18px 20px;">' +
          '<div class="ct-cmd"><input type="text" id="ct-cmd-input" placeholder=\'Ex.: "pause os anuncios com gasto acima de R$50 e zero leads"\' />' +
          '<button class="btn-toolbar" data-act="comando">Interpretar (DRY RUN)</button></div>' +
          '<div class="ct-exemplos">' +
            ["Analise a conta nos ultimos 7 dias", "Mostre campanhas gastando sem gerar lead", "Reduza 20% do orcamento dos conjuntos com CPL acima de R$40", "Mostre o historico de otimizacoes"].map(function (ex) {
              return '<span class="tag" data-exemplo="' + esc(ex) + '">' + esc(ex) + "</span>";
            }).join("") +
          "</div>" +
          '<div id="ct-cmd-resultado"></div>' +
        "</div></div>" +
      '<div class="painel"><div class="painel-topo"><h3>Changelog do cliente</h3>' +
        '<span class="contador"><span class="ct-periodo" id="ct-changelog-filtro">' +
          [["7", "7d"], ["30", "30d"], ["90", "90d"], ["", "Tudo"]].map(function (op) {
            return '<button data-chl="' + op[0] + '"' + (op[0] === "30" ? ' class="ativo"' : "") + ">" + op[1] + "</button>";
          }).join("") +
        "</span></span></div>" +
        '<div id="ct-changelog">' + spinner("Carregando changelog...") + "</div></div>";

    rootGestor.innerHTML = h;

    rootGestor.querySelector('[data-act="voltar"]').addEventListener("click", renderGestorDash);
    rootGestor.querySelectorAll("[data-periodo]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-periodo");
        if (v === "custom") {
          if (estado.gestor.periodo !== "custom") {
            var hoje = new Date();
            var ontem = new Date(hoje.getTime() - 86400000);
            var inicio = new Date(hoje.getTime() - 7 * 86400000);
            estado.gestor.ate = ontem.toISOString().slice(0, 10);
            estado.gestor.desde = inicio.toISOString().slice(0, 10);
            estado.gestor.periodo = "custom";
            montarPaginaCliente(cliente);
          }
        } else {
          estado.gestor.periodo = Number(v);
          montarPaginaCliente(cliente);
        }
      });
    });
    var btnDatas = rootGestor.querySelector('[data-act="aplicar-datas"]');
    if (btnDatas) btnDatas.addEventListener("click", function () {
      var de = (document.getElementById("ct-data-de") || {}).value || "";
      var ate = (document.getElementById("ct-data-ate") || {}).value || "";
      if (!de || !ate || de > ate) { window.alert("Escolha um intervalo valido (data inicial ate data final)."); return; }
      estado.gestor.desde = de;
      estado.gestor.ate = ate;
      montarPaginaCliente(cliente);
    });
    rootGestor.querySelector('[data-act="testar-conexao"]').addEventListener("click", function () { testarConexao(cliente); });
    rootGestor.querySelector('[data-act="diagnosticar"]').addEventListener("click", function () { gerarDiagnostico(cliente); });
    var cmdInput = document.getElementById("ct-cmd-input");
    rootGestor.querySelector('[data-act="comando"]').addEventListener("click", function () { enviarComando(cliente); });
    cmdInput.addEventListener("keydown", function (e) { if (e.key === "Enter") enviarComando(cliente); });
    rootGestor.querySelectorAll("[data-exemplo]").forEach(function (t) {
      t.addEventListener("click", function () { cmdInput.value = t.getAttribute("data-exemplo"); cmdInput.focus(); });
    });
    rootGestor.querySelectorAll("#ct-changelog-filtro [data-chl]").forEach(function (b) {
      b.addEventListener("click", function () {
        rootGestor.querySelectorAll("#ct-changelog-filtro button").forEach(function (x) { x.classList.remove("ativo"); });
        b.classList.add("ativo");
        carregarChangelog(cliente, b.getAttribute("data-chl"));
      });
    });

    rootGestor.querySelector('[data-act="rel-whatsapp"]').addEventListener("click", function () { gerarRelatorio(cliente, "whatsapp"); });
    rootGestor.querySelector('[data-act="rel-pdf"]').addEventListener("click", function () { gerarRelatorio(cliente, "pdf"); });
    rootGestor.querySelectorAll("#ct-serie-metrica [data-metrica]").forEach(function (b) {
      b.addEventListener("click", function () {
        rootGestor.querySelectorAll("#ct-serie-metrica button").forEach(function (x) { x.classList.remove("ativo"); });
        b.classList.add("ativo");
        renderSerie(cliente, moeda);
      });
    });

    carregarResumo(cliente, moeda, false);
    carregarSerie(cliente, moeda, false);
    carregarCampanhas(cliente, moeda, false);
    carregarGoogleAds(cliente, moeda, false);
    carregarTrackingStrip(cliente);
    carregarLinkPublico(cliente);
    carregarHistoricoRelatorios(cliente);
    carregarChangelog(cliente, "30");
  }

  // ---------- Grafico de barras: performance diaria ----------
  var serieDados = null; // ultimo payload da serie diaria

  function carregarSerie(cliente, moeda, refresh) {
    var alvo = document.getElementById("ct-serie");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando grafico...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/serie-diaria?" + queryPeriodo(refresh ? "refresh=1" : ""))
      .then(function (r) {
        serieDados = r;
        renderSerie(cliente, moeda);
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarSerie(cliente, moeda, false); }); });
  }

  // Constroi o HTML do grafico de barras (reutilizado no dashboard e no cliente).
  function chartHtml(dias, valores, fmtValor) {
    var max = Math.max.apply(null, valores.concat([1]));
    var soma = valores.reduce(function (a, b) { return a + b; }, 0);
    var media = soma / valores.length;
    var idxAtivo = valores.indexOf(Math.max.apply(null, valores));
    var muitos = dias.length > 16;
    function rotuloDe(iso, i) {
      if (muitos && i % Math.ceil(dias.length / 12) !== 0) return "";
      var p = iso.split("-");
      return p[2] + "/" + p[1];
    }
    return '<div class="ct-chart-wrap"><div class="ct-chart">' +
      '<div class="media-linha" style="bottom:' + ((media / max) * 220 + 24) + 'px;"><span class="media-rotulo">media ' + esc(fmtValor(Math.round(media * 100) / 100)) + "</span></div>" +
      dias.map(function (d, i) {
        var v = valores[i];
        var altura = Math.max(8, Math.round((v / max) * 220));
        var ativo = i === idxAtivo;
        return '<div class="col' + (ativo ? " ativa" : "") + '" data-i="' + i + '">' +
          (ativo ? '<span class="tooltip">' + esc(fmtValor(v)) + '<span class="tsub">' + d.data.split("-").reverse().join("/") + "</span></span>" : "") +
          '<div class="barra" style="height:' + altura + 'px;" title="' + esc(fmtValor(v)) + '"></div>' +
          '<span class="rotulo">' + rotuloDe(d.data, i) + "</span></div>";
      }).join("") +
      "</div></div>";
  }

  function ligarChart(container, dias, valores, fmtValor) {
    container.querySelectorAll(".ct-chart .col").forEach(function (col) {
      col.addEventListener("mouseenter", function () {
        var i = Number(col.getAttribute("data-i"));
        container.querySelectorAll(".ct-chart .col").forEach(function (c) {
          c.classList.remove("ativa");
          var t = c.querySelector(".tooltip");
          if (t) t.remove();
        });
        col.classList.add("ativa");
        col.insertAdjacentHTML("afterbegin",
          '<span class="tooltip">' + esc(fmtValor(valores[i])) + '<span class="tsub">' + dias[i].data.split("-").reverse().join("/") + "</span></span>");
      });
    });
  }

  function renderSerie(cliente, moeda) {
    var alvo = document.getElementById("ct-serie");
    if (!alvo || !serieDados) return;
    var metrica = (document.querySelector("#ct-serie-metrica button.ativo") || {}).getAttribute
      ? (document.querySelector("#ct-serie-metrica button.ativo").getAttribute("data-metrica") || "investimento")
      : "investimento";
    var dias = serieDados.dias || [];
    if (!dias.length) { alvo.innerHTML = '<div class="vazio">Sem dados no periodo.</div>'; return; }

    var valores = dias.map(function (d) { return metrica === "leads" ? d.leads : d.investimento; });
    function fmtValor(v) { return metrica === "leads" ? fmtNum(v) + " leads" : fmtMoeda(v, moeda); }

    var h = chartHtml(dias, valores, fmtValor);
    h += '<div style="padding:0 20px 16px;">' + linhaCacheHtml(serieDados.cache, serieDados.mock) + "</div>";
    alvo.innerHTML = h;
    ligarChart(alvo, dias, valores, fmtValor);
    var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
    if (btnAtu) btnAtu.addEventListener("click", function () { carregarSerie(cliente, moeda, true); });
  }

  // ---------- Relatorios (WhatsApp / PDF) ----------
  function bodyPeriodo() {
    var g = estado.gestor;
    return g.periodo === "custom" ? { since: g.desde, until: g.ate } : { period: g.periodo };
  }

  function copiarTexto(texto, btn) {
    function feito() {
      if (!btn) return;
      var t = btn.textContent;
      btn.textContent = "Copiado!";
      setTimeout(function () { btn.textContent = t; }, 1600);
    }
    function alternativa() {
      var ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); feito(); } catch (e) { window.alert("Nao foi possivel copiar automaticamente. Copie manualmente."); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(feito, alternativa);
    } else {
      alternativa();
    }
  }

  function avisosHtml(avisos) {
    if (!avisos || !avisos.length) return "";
    return avisos.map(function (a) { return '<div class="ct-nota" style="margin:12px 0 0;">' + esc(a) + "</div>"; }).join("");
  }

  function gerarRelatorio(cliente, tipo) {
    var alvo = document.getElementById("ct-rel-resultado");
    alvo.innerHTML = spinner(tipo === "pdf" ? "Gerando PDF..." : "Gerando relatorio WhatsApp...");
    var body = bodyPeriodo();
    body.tipo = tipo;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/relatorio", { method: "POST", body: body, timeoutMs: 90000 })
      .then(function (r) {
        var h = avisosHtml(r.avisos);
        if (tipo === "whatsapp") {
          h += '<div class="ct-preview-wa"><textarea readonly id="ct-wa-texto">' + esc(r.conteudo) + "</textarea>" +
               '<div style="display:flex;gap:10px;margin-top:10px;">' +
               '<button class="btn-toolbar" data-act="copiar-wa">Copiar</button>' +
               '<span style="font-size:12px;color:var(--text-3);align-self:center;">Revise os campos em branco antes de enviar ao cliente.</span></div></div>';
        } else {
          h += '<div style="margin-top:14px;"><a class="btn-toolbar" style="text-decoration:none;display:inline-flex;" href="' + esc(API + r.downloadUrl) + '" target="_blank" rel="noopener">Baixar PDF</a></div>';
        }
        alvo.innerHTML = h;
        var btnCp = alvo.querySelector('[data-act="copiar-wa"]');
        if (btnCp) btnCp.addEventListener("click", function () { copiarTexto(document.getElementById("ct-wa-texto").value, btnCp); });
        carregarHistoricoRelatorios(cliente);
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { gerarRelatorio(cliente, tipo); }); });
  }

  // ---------- Link publico ----------
  function carregarLinkPublico(cliente) {
    var alvo = document.getElementById("ct-link-publico");
    if (!alvo) return;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/public-link", { method: "POST", body: { acao: "status" } })
      .then(function (r) { renderLinkPublico(cliente, r.link); })
      .catch(function () { alvo.innerHTML = ""; });
  }

  function renderLinkPublico(cliente, link) {
    var alvo = document.getElementById("ct-link-publico");
    var h = '<div class="secao" style="font-size:10.5px;text-transform:uppercase;letter-spacing:1.4px;color:var(--text-3);margin-bottom:10px;">Dashboard publico por link</div>';
    if (link) {
      var url = API + link.caminho;
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
           '<input type="text" readonly value="' + esc(url) + '" id="ct-link-url" style="flex:1;min-width:260px;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:9px 12px;font-size:12.5px;font-family:inherit;color:var(--text-2);" />' +
           '<button class="btn-sm salvar" data-act="link-copiar">Copiar</button>' +
           '<button class="btn-sm" data-act="link-revogar">Revogar</button></div>' +
           '<div style="font-size:12px;color:var(--text-3);margin-top:8px;">Somente leitura, sem login. Hoje o backend e local: o link so abre nesta maquina. Com o backend publico (Etapa 7), o mesmo link funciona na internet.</div>';
    } else {
      h += '<button class="ct-btn-sec" data-act="link-gerar">Gerar link publico</button>' +
           '<span style="font-size:12px;color:var(--text-3);margin-left:10px;">Resumo somente leitura para o cliente, revogavel a qualquer momento.</span>';
    }
    alvo.innerHTML = h;
    var bg = alvo.querySelector('[data-act="link-gerar"]');
    if (bg) bg.addEventListener("click", function () { acaoLinkPublico(cliente, "gerar"); });
    var bc = alvo.querySelector('[data-act="link-copiar"]');
    if (bc) bc.addEventListener("click", function () { copiarTexto(document.getElementById("ct-link-url").value, bc); });
    var br = alvo.querySelector('[data-act="link-revogar"]');
    if (br) br.addEventListener("click", function () {
      if (window.confirm("Revogar o link publico? Quem tiver o link perdera o acesso na hora.")) acaoLinkPublico(cliente, "revogar");
    });
  }

  function acaoLinkPublico(cliente, acao) {
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/public-link", { method: "POST", body: { acao: acao } })
      .then(function (r) { renderLinkPublico(cliente, acao === "revogar" ? null : r.link); })
      .catch(function (err) { window.alert("Erro: " + err.message); });
  }

  // ---------- Historico de relatorios ----------
  function carregarHistoricoRelatorios(cliente) {
    var alvo = document.getElementById("ct-rel-historico");
    if (!alvo) return;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/relatorios")
      .then(function (r) {
        var h = '<div class="secao" style="font-size:10.5px;text-transform:uppercase;letter-spacing:1.4px;color:var(--text-3);margin-bottom:10px;">Historico de relatorios</div>';
        if (!r.relatorios.length) {
          h += '<div style="font-size:13px;color:var(--text-3);">Nenhum relatorio gerado ainda.</div>';
          alvo.innerHTML = h;
          return;
        }
        h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr><th>Quando</th><th>Tipo</th><th>Periodo</th><th></th></tr></thead><tbody>';
        r.relatorios.forEach(function (rel, i) {
          var acao = rel.tipo === "pdf"
            ? '<a class="btn-sm" style="text-decoration:none;display:inline-block;" href="' + esc(API + "/api/paid-ads/relatorios/" + rel.id + "/pdf") + '" target="_blank" rel="noopener">Baixar</a>'
            : '<button class="btn-sm salvar" data-rel-copiar="' + i + '">Copiar</button>';
          h += "<tr><td>" + fmtData(rel.timestamp) + '</td><td><span class="ct-badge ' + (rel.tipo === "pdf" ? "neutro" : "onboarding") + '">' + esc(rel.tipo) + "</span></td>" +
               "<td>" + esc(rel.range.label) + '</td><td class="num">' + acao + "</td></tr>";
        });
        h += "</tbody></table></div>";
        alvo.innerHTML = h;
        alvo.querySelectorAll("[data-rel-copiar]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var rel = r.relatorios[Number(btn.getAttribute("data-rel-copiar"))];
            copiarTexto(rel.conteudo || "", btn);
          });
        });
      })
      .catch(function () { alvo.innerHTML = ""; });
  }

  // ---------- Google Ads (somente leitura) ----------
  function carregarGoogleAds(cliente, moeda, refresh) {
    var alvo = document.getElementById("ct-google");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando Google Ads...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/google-ads?" + queryPeriodo(refresh ? "refresh=1" : ""))
      .then(function (r) {
        var t = r.totais, ant = r.totaisAnterior;
        var h = "";
        if (r.mock) {
          h += '<div style="padding:16px 20px 0;"><span class="selo-exemplo" title="' + esc(r.aviso || "") + '">Dados de exemplo</span></div>';
        }
        var legG = "vs " + r.rangeAnterior.label;
        var stats = [
          { ico: "dinheiro", num: fmtMoeda(t.gasto, moeda), lab: "Investimento", varr: variacaoHtml(t.gasto, ant.gasto, 0, legG) },
          { ico: "conversao", num: fmtNum(t.conversoes), lab: "Conversoes", varr: variacaoHtml(t.conversoes, ant.conversoes, 1, legG) },
          { ico: "alvo", num: t.custoPorConversao != null ? fmtMoeda(t.custoPorConversao, moeda) : "—", lab: "Custo/conversao", varr: variacaoHtml(t.custoPorConversao, ant.custoPorConversao, -1, legG) },
          { ico: "clique", num: fmtNum(t.cliques), lab: "Cliques", varr: variacaoHtml(t.cliques, ant.cliques, 1, legG) },
          { ico: "olho", num: fmtNum(t.impressoes), lab: "Impressoes", varr: variacaoHtml(t.impressoes, ant.impressoes, 1, legG) },
          { ico: "grafico", num: fmtDec(t.ctr, 2) + "%", lab: "CTR", varr: variacaoHtml(t.ctr, ant.ctr, 1, legG) },
          { ico: "dinheiro", num: fmtMoeda(t.cpc, moeda), lab: "CPC", varr: variacaoHtml(t.cpc, ant.cpc, -1, legG) }
        ];
        h += '<div style="padding:18px 20px 0;"><div class="stat-grid" style="margin-bottom:18px;">' + stats.map(kpiHtml).join("") + "</div></div>";

        if (!r.campanhas.length) {
          h += '<div class="vazio">Nenhuma campanha Google no periodo.</div>';
        } else {
          h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
               "<th>Campanha</th><th>Status</th><th class=\"num\">Orcam./dia</th><th class=\"num\">Gasto</th><th class=\"num\">Cliques</th>" +
               "<th class=\"num\">Impressoes</th><th class=\"num\">CTR</th><th class=\"num\">CPC</th><th class=\"num\">Conversoes</th><th class=\"num\">Custo/conv.</th></tr></thead><tbody>";
          r.campanhas.forEach(function (c) {
            var st = c.status === "ENABLED"
              ? '<span class="ct-badge on">ativa</span>'
              : c.status === "PAUSED"
                ? '<span class="ct-badge off">pausada</span>'
                : '<span class="ct-badge neutro">' + esc(String(c.status || "").toLowerCase()) + "</span>";
            h += '<tr><td class="nome-obj">' + esc(c.nome) + "</td><td>" + st + "</td>" +
                 '<td class="num">' + (c.orcamentoDia != null ? fmtMoeda(c.orcamentoDia, moeda) : "—") + "</td>" +
                 '<td class="num">' + fmtMoeda(c.gasto, moeda) + '</td><td class="num">' + fmtNum(c.cliques) + "</td>" +
                 '<td class="num">' + fmtNum(c.impressoes) + '</td><td class="num">' + fmtDec(c.ctr, 2) + "%</td>" +
                 '<td class="num">' + fmtMoeda(c.cpc, moeda) + '</td><td class="num">' + fmtNum(c.conversoes) + "</td>" +
                 '<td class="num">' + (c.custoPorConversao != null ? fmtMoeda(c.custoPorConversao, moeda) : "—") + "</td></tr>";
          });
          h += "</tbody></table></div>";
        }
        h += '<div style="padding:0 20px 16px;">' + linhaCacheHtml(r.cache, r.mock) + "</div>";
        alvo.innerHTML = h;
        var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
        if (btnAtu) btnAtu.addEventListener("click", function () { carregarGoogleAds(cliente, moeda, true); });
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarGoogleAds(cliente, moeda, false); }); });
  }

  function testarConexao(cliente) {
    var chip = document.getElementById("ct-conexao-chip");
    var alvo = document.getElementById("ct-conexao-resultado");
    alvo.innerHTML = spinner("Testando conexao com a Meta API...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/testar-conexao", { method: "POST" })
      .then(function (r) {
        cliente.conexaoMeta = r.conexao;
        if (chip) chip.innerHTML = chipConexao(cliente);
        var cls = r.conexao.status === "conectado" ? "ok" : "erro";
        alvo.innerHTML = '<div class="ct-resultado ' + cls + '" style="margin:0 0 18px;">' +
          "<b>" + (r.conexao.status === "conectado" ? "Conectado" : r.conexao.status === "erro" ? "Erro na conexao" : "Pendente") + ":</b> " +
          esc(r.conexao.detalhe) + "</div>";
      })
      .catch(function (err) {
        if (err.offline) { alvo.innerHTML = htmlOffline(); ligarRetry(alvo, function () { testarConexao(cliente); }); }
        else alvo.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function erroBloco(err, aoTentar) {
    if (err.offline) return htmlOffline();
    return '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
  }

  function carregarResumo(cliente, moeda, refresh) {
    var alvo = document.getElementById("ct-resumo");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando resumo...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/summary?" + queryPeriodo(refresh ? "refresh=1" : ""))
      .then(function (r) {
        var m = r.atual.metrics;
        var ant = r.anterior.metrics;
        var leg = "vs " + r.rangeAnterior.label;
        // dir: 1 = subir e bom, -1 = descer e bom, 0 = neutro
        var stats = [
          { ico: "dinheiro", num: fmtMoeda(m.spend, moeda), lab: "Investimento", varr: variacaoHtml(m.spend, ant.spend, 0, leg) },
          { ico: "leads", num: fmtNum(m.leads), lab: "Leads", varr: variacaoHtml(m.leads, ant.leads, 1, leg) },
          { ico: "alvo", num: m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—", lab: "CPL", varr: variacaoHtml(m.costPerLead, ant.costPerLead, -1, leg) },
          { ico: "clique", num: fmtDec(m.ctr, 2) + "%", lab: "CTR", varr: variacaoHtml(m.ctr, ant.ctr, 1, leg) },
          { ico: "grafico", num: fmtMoeda(m.cpm, moeda), lab: "CPM", varr: variacaoHtml(m.cpm, ant.cpm, -1, leg) },
          { ico: "frequencia", num: fmtDec(m.frequency, 2), lab: "Frequencia", varr: variacaoHtml(m.frequency, ant.frequency, -1, leg) },
          { ico: "alcance", num: fmtNum(m.reach), lab: "Alcance", varr: variacaoHtml(m.reach, ant.reach, 1, leg) },
          { ico: "campanhas", num: fmtNum(r.atual.campanhasAtivas), lab: "Campanhas ativas", sub: r.atual.campanhasComAlerta + " com alerta" }
        ];
        // Selo discreto no cabecalho do cliente (sem banner de largura total)
        var selo = document.getElementById("ct-selo-exemplo");
        if (selo) {
          selo.style.display = r.mock ? "inline-flex" : "none";
          if (r.aviso) selo.title = r.aviso;
        }
        var h = '<div class="stat-grid">' + stats.map(kpiHtml).join("") + "</div>";
        h += linhaCacheHtml(r.cache, r.mock);
        alvo.innerHTML = h;
        var db = document.getElementById("ct-datebox-texto");
        if (db) db.textContent = r.range.since.split("-").reverse().join("/") + " - " + r.range.until.split("-").reverse().join("/");
        var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
        if (btnAtu) btnAtu.addEventListener("click", function () {
          carregarResumo(cliente, moeda, true);
          carregarCampanhas(cliente, moeda, true);
        });
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarResumo(cliente, moeda, false); }); });
  }

  // ---------- Campanhas com drill-down (campanha -> conjuntos -> anuncios) ----------
  function celulasMetricas(e, moeda) {
    var m = e.metrics || {};
    return '<td class="num">' + (e.dailyBudget != null ? fmtMoeda(e.dailyBudget, moeda) : "—") + "</td>" +
           '<td class="num">' + fmtMoeda(m.spend, moeda) + '</td><td class="num">' + fmtNum(m.leads) + "</td>" +
           '<td class="num">' + (m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—") + "</td>" +
           '<td class="num">' + fmtDec(m.ctr, 2) + '%</td><td class="num">' + fmtMoeda(m.cpm, moeda) + "</td>" +
           '<td class="num">' + fmtDec(m.frequency, 2) + "</td>" +
           '<td style="max-width:220px;">' + (e.alertas || []).map(function (a) { return '<span class="ct-badge alerta" title="' + esc(a) + '">' + esc(a) + "</span>"; }).join(" ") + "</td>";
  }

  function statusHtml(e) {
    var st = String(e.effectiveStatus || e.status || "");
    if (st === "ACTIVE") return '<span class="ct-badge on">ativa</span>';
    if (st === "PAUSED") return '<span class="ct-badge off">pausada</span>';
    return '<span class="ct-badge neutro">' + esc(st.toLowerCase()) + "</span>";
  }

  function linhaEntidade(e, nivel, moeda, expansivel) {
    var recuo = nivel === "adset" ? "ct-row-adset" : nivel === "ad" ? "ct-row-ad" : "";
    var seta = expansivel ? '<button class="ct-chevron" data-expand="' + esc(e.id) + '" data-nivel="' + nivel + '" aria-label="Expandir">&rsaquo;</button>' : '<span class="ct-chevron-vazio"></span>';
    return '<tr class="ct-nivel ' + recuo + '" data-id="' + esc(e.id) + '"' + (e.parentId ? ' data-parent="' + esc(e.parentId) + '"' : "") + ">" +
           '<td class="nome-obj"><span class="ct-drill-nome">' + seta + esc(e.name) + "</span></td>" +
           "<td>" + statusHtml(e) + "</td>" + celulasMetricas(e, moeda) + "</tr>";
  }

  function carregarCampanhas(cliente, moeda, refresh) {
    var alvo = document.getElementById("ct-campanhas");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando campanhas...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/campaigns?" + queryPeriodo(refresh ? "refresh=1" : ""))
      .then(function (r) {
        if (!r.campanhas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma campanha encontrada na conta.</div>'; return; }
        var h = '<div class="ct-tabela-wrap"><table class="ct-tabela" id="ct-tabela-drill"><thead><tr>' +
             "<th>Nome</th><th>Status</th><th class=\"num\">Orcam./dia</th><th class=\"num\">Gasto</th><th class=\"num\">Leads</th>" +
             "<th class=\"num\">CPL</th><th class=\"num\">CTR</th><th class=\"num\">CPM</th><th class=\"num\">Freq.</th><th>Alertas</th></tr></thead><tbody>";
        r.campanhas.forEach(function (c) { h += linhaEntidade(c, "campaign", moeda, true); });
        h += "</tbody></table></div>";
        h += linhaCacheHtml(r.cache, r.mock);
        alvo.innerHTML = h;

        var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
        if (btnAtu) btnAtu.addEventListener("click", function () {
          carregarResumo(cliente, moeda, true);
          carregarCampanhas(cliente, moeda, true);
        });

        var tbody = alvo.querySelector("#ct-tabela-drill tbody");
        tbody.addEventListener("click", function (ev) {
          var btn = ev.target.closest("[data-expand]");
          if (!btn) return;
          var id = btn.getAttribute("data-expand");
          var nivel = btn.getAttribute("data-nivel");
          var linha = btn.closest("tr");
          if (btn.classList.contains("aberto")) {
            btn.classList.remove("aberto");
            removerFilhos(tbody, id);
            return;
          }
          btn.classList.add("aberto");
          var carregando = document.createElement("tr");
          carregando.setAttribute("data-parent", id);
          carregando.innerHTML = '<td colspan="10">' + spinner(nivel === "campaign" ? "Carregando conjuntos..." : "Carregando anuncios...") + "</td>";
          linha.after(carregando);
          var rota = nivel === "campaign"
            ? "/adsets?" + queryPeriodo("campaignId=" + encodeURIComponent(id))
            : "/ads?" + queryPeriodo("adsetId=" + encodeURIComponent(id));
          api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + rota)
            .then(function (rr) {
              var filhos = nivel === "campaign" ? rr.conjuntos : rr.anuncios;
              var htmlFilhos = filhos.length
                ? filhos.map(function (f) { return linhaEntidade(f, nivel === "campaign" ? "adset" : "ad", moeda, nivel === "campaign"); }).join("")
                : '<tr data-parent="' + esc(id) + '"><td colspan="10" class="ct-drill-vazio">' + (nivel === "campaign" ? "Nenhum conjunto nesta campanha." : "Nenhum anuncio neste conjunto.") + "</td></tr>";
              carregando.outerHTML = htmlFilhos;
            })
            .catch(function (err) {
              carregando.innerHTML = '<td colspan="10"><div class="ct-resultado erro" style="margin:6px 0;">' + esc(err.offline ? "Backend offline." : err.message) + "</div></td>";
            });
        });
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarCampanhas(cliente, moeda, false); }); });
  }

  function removerFilhos(tbody, id) {
    tbody.querySelectorAll('tr[data-parent="' + id + '"]').forEach(function (tr) {
      var subId = tr.getAttribute("data-id");
      if (subId) removerFilhos(tbody, subId);
      tr.remove();
    });
  }

  // ---------- Changelog (execucoes, simulacoes e diagnosticos) ----------
  function carregarChangelog(cliente, dias) {
    var alvo = document.getElementById("ct-changelog");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando changelog...");
    var q = "";
    if (dias) {
      var desde = new Date(Date.now() - Number(dias) * 86400000).toISOString().slice(0, 10);
      q = "?since=" + desde;
    }
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/changelog" + q)
      .then(function (r) {
        if (!r.entradas.length) { alvo.innerHTML = '<div class="vazio">Nada registrado neste periodo.</div>'; return; }
        var rotulo = { execucao: "Execucao", simulacao: "Simulacao", diagnostico: "Diagnostico" };
        var classe = { execucao: "on", simulacao: "neutro", diagnostico: "onboarding" };
        var h = '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
                "<th>Quando</th><th>Tipo</th><th>O que</th><th>Detalhe</th></tr></thead><tbody>";
        r.entradas.forEach(function (e) {
          h += "<tr><td style=\"white-space:nowrap;\">" + fmtData(e.timestamp) + "</td>" +
               '<td><span class="ct-badge ' + (classe[e.tipo] || "neutro") + '">' + (rotulo[e.tipo] || e.tipo) + "</span>" + (e.mock ? ' <span class="ct-badge neutro" title="Gerado com dados de exemplo">exemplo</span>' : "") + "</td>" +
               '<td class="ct-hist-cmd" title="' + esc(e.titulo) + '">' + esc(e.titulo) + "</td>" +
               '<td style="max-width:420px;font-size:12.5px;color:var(--text-2);">' + esc(e.detalhe) + "</td></tr>";
        });
        alvo.innerHTML = h + "</tbody></table></div>";
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarChangelog(cliente, dias); }); });
  }

  function ligarRetry(alvo, fn) {
    var btn = alvo.querySelector('[data-act="retry"]');
    if (btn) btn.addEventListener("click", fn);
  }

  // ---------- Diagnostico IA ----------
  function gerarDiagnostico(cliente) {
    var alvo = document.getElementById("ct-diagnostico");
    var g = estado.gestor;
    alvo.innerHTML = spinner("Analisando a conta" + (iaLabel() ? " com IA" : "") + "...");
    var body = g.periodo === "custom" ? { since: g.desde, until: g.ate } : { period: g.periodo };
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/diagnose", { method: "POST", body: body, timeoutMs: 90000 })
      .then(function (r) {
        var moeda = cliente.moeda || "BRL";
        var m = r.account;
        function lista(itens, vazio) {
          if (!itens || !itens.length) return '<span class="nada">' + vazio + "</span>";
          return "<ul>" + itens.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
        }
        var ia = r.ia;
        var fonteBadge = r.fonte === "ia"
          ? '<span class="ct-badge onboarding">IA: ' + esc(r.provider || "?") + (r.modelo ? " (" + esc(r.modelo) + ")" : "") + "</span>"
          : '<span class="ct-badge neutro">Analise deterministica (regras)</span>';

        var h = '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:16px;">';
        if (r.avisoIA) h += '<div class="ct-nota" style="margin:0;">' + esc(r.avisoIA) + "</div>";
        h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' + fonteBadge +
             '<span class="ct-badge neutro">' + esc(r.range.label) + "</span>" +
             (r.mock ? '<span class="selo-exemplo" title="' + esc(r.aviso || "") + '">Dados de exemplo</span>' : "") +
             "</div>";

        if (ia && ia.resumoExecutivo) {
          h += '<div class="ct-diag-resumo">' + esc(ia.resumoExecutivo) + "</div>";
        }

        h += '<div class="stat-grid" style="margin:0;">' + [
          { ico: "dinheiro", num: fmtMoeda(m.spend, moeda), lab: "Investimento no periodo" },
          { ico: "leads", num: fmtNum(m.leads), lab: "Leads" },
          { ico: "alvo", num: m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—", lab: "CPL" },
          { ico: "campanhas", num: fmtNum(r.activeCampaigns), lab: "Campanhas ativas" }
        ].map(kpiHtml).join("") + "</div>";

        var bem = ia ? ia.oQueEstaBem : r.deterministico.workingWell;
        var problemas = ia ? ia.problemas : r.deterministico.problems;
        var plano = ia ? ia.sugestaoPlano : r.deterministico.planResumo;
        h += '<div class="ct-diag-grid">' +
             '<div class="ct-diag-bloco bom"><h4>O que esta bem</h4>' + lista(bem, "Nada de destaque no periodo.") + "</div>" +
             '<div class="ct-diag-bloco ruim"><h4>Problemas</h4>' + lista(problemas, "Nenhum problema encontrado.") + "</div>" +
             (ia ? '<div class="ct-diag-bloco plano"><h4>Oportunidades</h4>' + lista(ia.oportunidades, "Nenhuma oportunidade mapeada.") + "</div>" : "") +
             '<div class="ct-diag-bloco plano"><h4>Sugestao de plano</h4>' + lista(plano, "Nenhuma acao proposta.") + "</div>" +
             (ia ? '<div class="ct-diag-bloco risco"><h4>Riscos</h4>' + lista(ia.riscos, "Nenhum risco sinalizado.") + "</div>" : "") +
             "</div>";

        h += '<div class="ct-nota" style="margin:0;">O diagnostico e informativo e fica registrado no changelog. ' +
             'Para aplicar acoes, use o campo de comando abaixo — todo plano passa por DRY RUN e confirmacao explicita.</div></div>';
        alvo.innerHTML = h;
        carregarChangelog(cliente, filtroChangelogAtual());
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { gerarDiagnostico(cliente); }); });
  }

  function iaLabel() {
    return true; // rotulo informativo; o backend decide IA ou deterministico
  }

  function filtroChangelogAtual() {
    var ativo = document.querySelector("#ct-changelog-filtro button.ativo");
    return ativo ? ativo.getAttribute("data-chl") : "30";
  }

  // ---------- Comando + plano + execucao ----------
  function enviarComando(cliente) {
    var input = document.getElementById("ct-cmd-input");
    var alvo = document.getElementById("ct-cmd-resultado");
    var texto = (input.value || "").trim();
    if (!texto) return;
    alvo.innerHTML = spinner("Interpretando e simulando (DRY RUN)...");
    estado.gestor.planoAtual = null;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/command", { method: "POST", body: { command: texto } })
      .then(function (r) { alvo.innerHTML = ""; renderResultadoComando(alvo, r, cliente); })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { enviarComando(cliente); }); });
  }

  function renderResultadoComando(alvo, r, cliente) {
    var moeda = cliente.moeda || "BRL";
    if (r.kind === "message") {
      alvo.innerHTML = '<div class="painel ct-plano"><div class="ct-msg">' + esc(r.text) + "</div></div>";
      return;
    }
    if (r.kind === "history") {
      carregarChangelog(cliente, filtroChangelogAtual());
      alvo.innerHTML = '<div class="ct-resultado ok">Changelog atualizado na secao abaixo.</div>';
      return;
    }
    if (r.kind === "comparison") {
      var cAtual = r.current, cAnt = r.previous;
      alvo.innerHTML =
        '<div class="painel ct-plano"><div class="ct-plano-head"><span class="resumo">Comparativo: ' + esc(r.range.label) + " vs periodo anterior</span></div>" +
        '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr><th>Metrica</th><th class="num">Atual</th><th class="num">Anterior</th></tr></thead><tbody>' +
        [["Investimento", fmtMoeda(cAtual.spend, moeda), fmtMoeda(cAnt.spend, moeda)],
         ["Leads", fmtNum(cAtual.leads), fmtNum(cAnt.leads)],
         ["CPL", cAtual.costPerLead != null ? fmtMoeda(cAtual.costPerLead, moeda) : "—", cAnt.costPerLead != null ? fmtMoeda(cAnt.costPerLead, moeda) : "—"],
         ["CTR", fmtDec(cAtual.ctr, 2) + "%", fmtDec(cAnt.ctr, 2) + "%"],
         ["CPM", fmtMoeda(cAtual.cpm, moeda), fmtMoeda(cAnt.cpm, moeda)]].map(function (l) {
          return "<tr><td>" + l[0] + '</td><td class="num">' + l[1] + '</td><td class="num">' + l[2] + "</td></tr>";
        }).join("") + "</tbody></table></div></div>";
      return;
    }
    if (r.kind === "listing") {
      if (!r.entities.length) { alvo.innerHTML = '<div class="ct-resultado ok">Nenhum objeto encontrado com esse filtro.</div>'; return; }
      var hl = '<div class="painel ct-plano"><div class="ct-plano-head"><span class="resumo">' + r.entities.length + " objeto(s) — " + esc(r.range.label) + "</span></div>" +
               '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr><th>Nome</th><th>Status</th><th class="num">Gasto</th><th class="num">Leads</th><th class="num">CPL</th><th class="num">CTR</th></tr></thead><tbody>';
      r.entities.forEach(function (e) {
        var m = e.metrics || {};
        hl += '<tr><td class="nome-obj">' + esc(e.name) + '</td><td><span class="ct-badge neutro">' + esc(e.effectiveStatus || e.status) + "</span></td>" +
              '<td class="num">' + fmtMoeda(m.spend, moeda) + '</td><td class="num">' + fmtNum(m.leads) + "</td>" +
              '<td class="num">' + (m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—") + '</td><td class="num">' + fmtDec(m.ctr, 2) + "%</td></tr>";
      });
      alvo.innerHTML = hl + "</tbody></table></div></div>";
      return;
    }
    // plan | diagnosis | rollback: plano DRY_RUN com fluxo de execucao
    var plan = r.plan;
    var safety = r.safety || { warnings: [], blockers: [] };
    var mutantes = plan.changes.filter(function (c) { return c.kind !== "flag"; });
    var flags = plan.changes.filter(function (c) { return c.kind === "flag"; });
    estado.gestor.planoAtual = { planId: r.planId, clienteId: cliente.id };

    var h = '<div class="painel ct-plano"><div class="ct-plano-head"><span class="modo">DRY RUN</span>' +
            '<span class="resumo">' + plan.changes.length + " acao(oes) proposta(s) — " + esc(plan.dateRange.label) + "</span></div>";
    (safety.blockers || []).forEach(function (b) { h += '<div class="ct-aviso bloqueio">Bloqueio: ' + esc(b) + "</div>"; });
    (safety.warnings || []).forEach(function (w) { h += '<div class="ct-aviso">Aviso: ' + esc(w) + "</div>"; });

    if (!plan.changes.length) {
      h += '<div class="ct-msg">Nenhum objeto se encaixou nos criterios do comando. Nada a fazer.</div></div>';
      alvo.innerHTML = h;
      return;
    }

    h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
         "<th>Objeto</th><th>Nivel</th><th>Acao</th><th class=\"num\">De</th><th class=\"num\">Para</th><th>Risco</th><th>Motivo</th></tr></thead><tbody>";
    var rotuloAcao = { pause: "Pausar", activate: "Ativar", set_daily_budget: "Orcamento diario", set_lifetime_budget: "Orcamento total", set_start_time: "Data de inicio", set_end_time: "Data de fim", flag: "Sinalizacao" };
    plan.changes.forEach(function (c) {
      var de = c.currentValue == null ? "—" : (typeof c.currentValue === "number" ? fmtMoeda(c.currentValue, moeda) : esc(String(c.currentValue)));
      var para = c.newValue == null ? "—" : (typeof c.newValue === "number" ? fmtMoeda(c.newValue, moeda) : esc(String(c.newValue)));
      h += '<tr><td class="nome-obj">' + esc(c.entityName) + '</td><td><span class="ct-badge neutro">' + esc(c.level) + "</span></td>" +
           "<td>" + esc(rotuloAcao[c.kind] || c.kind) + '</td><td class="num">' + de + '</td><td class="num">' + para + "</td>" +
           '<td><span class="ct-risco ' + esc(c.risk) + '">' + esc(c.risk) + "</span>" + (c.requiresExtraConfirmation ? ' <span class="ct-badge alerta" title="Variacao acima do limite">extra</span>' : "") + "</td>" +
           '<td style="max-width:320px;font-size:12.5px;color:var(--text-2);">' + esc(c.reason) + "</td></tr>";
    });
    h += "</tbody></table></div>";

    if (mutantes.length && !(safety.blockers || []).length) {
      h += '<div class="ct-executar">' +
           '<span class="dica">Simulacao concluida. Nada foi alterado. Para aplicar de verdade, digite exatamente "Confirmo executar" e clique no botao. ' +
           (flags.length ? flags.length + " sinalizacao(oes) sao apenas informativas e nao serao aplicadas. " : "") +
           "O plano expira em " + (r.expiraEmMinutos || 30) + " minutos.</span>" +
           '<input type="text" id="ct-confirmacao" placeholder=\'Digite "Confirmo executar"\' autocomplete="off" />' +
           '<button class="ct-btn-perigo" data-act="executar">Executar ' + mutantes.length + " alteracao(oes)</button>" +
           "</div>";
    } else if (mutantes.length === 0) {
      h += '<div class="ct-executar"><span class="dica">Apenas sinalizacoes: nada sera alterado na conta.</span></div>';
    }
    h += "</div><div id=\"ct-exec-resultado\"></div>";
    alvo.innerHTML = h;

    var btnExec = alvo.querySelector('[data-act="executar"]');
    if (btnExec) btnExec.addEventListener("click", function () { executarPlano(cliente, r.planId, btnExec); });
  }

  function executarPlano(cliente, planId, btn) {
    var confInput = document.getElementById("ct-confirmacao");
    var alvo = document.getElementById("ct-exec-resultado");
    var confirmacao = confInput ? confInput.value.trim() : "";
    if (!confirmacao) { alvo.innerHTML = '<div class="ct-resultado erro">Digite a confirmacao ("Confirmo executar") antes de aplicar.</div>'; return; }
    btn.disabled = true;
    alvo.innerHTML = spinner("Aplicando alteracoes na Meta API...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/execute", { method: "POST", body: { planId: planId, confirmacao: confirmacao } })
      .then(function (r) {
        alvo.innerHTML = '<div class="ct-resultado ok">Execucao concluida: ' + r.aplicadas + " aplicada(s), " + r.comErro + " com erro. Registro " + esc(r.recordId) + ".</div>";
        carregarChangelog(cliente, filtroChangelogAtual());
        carregarCampanhas(cliente, cliente.moeda || "BRL", true);
        carregarResumo(cliente, cliente.moeda || "BRL", true);
      })
      .catch(function (err) {
        btn.disabled = false;
        if (err.offline) { alvo.innerHTML = htmlOffline(); ligarRetry(alvo, function () { executarPlano(cliente, planId, btn); }); }
        else alvo.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  // ---------------------------------------------------------------------
  // Dashboard consolidado (bloco da Central na area Dashboard)
  // ---------------------------------------------------------------------
  function irParaArea(id) {
    var btn = document.querySelector('#nav-grupos .nav-item[data-area="' + id + '"]');
    if (btn) btn.click();
  }

  var dashPeriodo = 7; // 7 | 14 | 30

  // Badge de variacao com percentual ja calculado (mock do dashboard).
  function badgeVar(pct, dir) {
    var subiu = pct >= 0;
    var cls = dir === 0 ? "neutra" : ((subiu ? 1 : -1) === dir ? "boa" : "ruim");
    return '<span class="ct-var ' + cls + '">' + (subiu ? "&#8599;" : "&#8600;") + " " +
           Math.abs(pct).toFixed(1).replace(".", ",") + "%</span>";
  }

  function rotuloRangeDash(p) {
    function fmt(d) {
      return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    }
    var ontem = new Date(Date.now() - 86400000);
    var inicio = new Date(Date.now() - p * 86400000);
    return fmt(inicio) + " - " + fmt(ontem);
  }

  function renderDashPeriodo() {
    var el = document.getElementById("dash-periodo");
    if (!el) return;
    el.innerHTML =
      '<span class="ct-datebox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>' +
      rotuloRangeDash(dashPeriodo) + "</span></span>" +
      '<span class="ct-periodo">' + [7, 14, 30].map(function (p) {
        return '<button data-dp="' + p + '"' + (p === dashPeriodo ? ' class="ativo"' : "") + ">" + p + "d</button>";
      }).join("") + "</span>";
    el.querySelectorAll("[data-dp]").forEach(function (b) {
      b.addEventListener("click", function () {
        dashPeriodo = Number(b.getAttribute("data-dp"));
        renderDashCentral();
      });
    });
  }

  // Gerador deterministico de dados de exemplo do dashboard (numeros realistas).
  function rngSimples(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dashMockDados(periodo) {
    var serie = [];
    var totalInv = 0;
    var totalLeads = 0;
    for (var i = periodo; i >= 1; i--) {
      var d = new Date(Date.now() - i * 86400000);
      var iso = d.toISOString().slice(0, 10);
      var r = rngSimples(7919 * periodo + i * 131);
      var fds = d.getDay() === 0 || d.getDay() === 6 ? 0.55 : 1;
      var inv = Math.round((320 + r() * 380) * fds * 100) / 100;
      var leads = Math.round(inv / (24 + r() * 14));
      totalInv += inv;
      totalLeads += leads;
      serie.push({ data: iso, investimento: inv, leads: leads });
    }
    var rv = rngSimples(periodo * 977);
    return {
      serie: serie,
      investimento: Math.round(totalInv * 100) / 100,
      leads: totalLeads,
      cpl: Math.round((totalInv / Math.max(totalLeads, 1)) * 100) / 100,
      varInv: 6 + rv() * 12,
      varLeads: 9 + rv() * 16,
      varCpl: -(4 + rv() * 12),
      campanhasAtivas: 9,
      campanhasComAlerta: 2
    };
  }

  function renderDashCentral() {
    var alvo = document.getElementById("dash-central");
    if (!alvo) return;
    renderDashPeriodo();
    alvo.innerHTML = spinner("Carregando dados da central...");
    Promise.all([api("/api/paid-ads/overview?period=" + dashPeriodo), api("/api/paid-ads/concorrentes")])
      .then(function (r) {
        var ov = r[0];
        var concs = r[1].concorrentes || [];
        var exemplo = !ov.dadosDisponiveis;
        var mockD = exemplo ? dashMockDados(dashPeriodo) : null;

        // KPIs (grid uniforme de 4, como a referencia)
        var stats = exemplo
          ? [
              { ico: "dinheiro", num: fmtMoeda(mockD.investimento), lab: "Investimento (" + dashPeriodo + "d)", varr: badgeVar(mockD.varInv, 0) },
              { ico: "leads", num: fmtNum(mockD.leads), lab: "Leads (" + dashPeriodo + "d)", varr: badgeVar(mockD.varLeads, 1) },
              { ico: "alvo", num: fmtMoeda(mockD.cpl), lab: "CPL medio", varr: badgeVar(mockD.varCpl, -1) },
              { ico: "clientes", num: String(ov.clientesAtivos), lab: "Clientes ativos", sub: ov.clientesTotal + " cadastrado(s)" }
            ]
          : [
              { ico: "dinheiro", num: fmtMoeda(ov.investimentoTotal), lab: "Investimento (" + dashPeriodo + "d)" },
              { ico: "leads", num: fmtNum(ov.leadsTotal), lab: "Leads (" + dashPeriodo + "d)" },
              { ico: "alvo", num: ov.cplMedio != null ? fmtMoeda(ov.cplMedio) : "—", lab: "CPL medio" },
              { ico: "clientes", num: String(ov.clientesAtivos), lab: "Clientes ativos", sub: ov.clientesTotal + " cadastrado(s)" }
            ];

        // Pendencias (alertas das automacoes primeiro: ultimas 24h)
        var pendencias = (ov.alertasAutomacao || []).map(function (a) {
          return { area: "automacoes", texto: a.texto, meta: a.meta };
        });
        if (!ov.metaConectada) pendencias.push({ area: "gestor", texto: "Meta API sem token no backend", meta: "Preencha META_ACCESS_TOKEN no .env do Gestor de Trafego" });
        var semConta = (ov.porCliente || []).filter(function (c) { return !c.contaConectada; }).length;
        if (semConta > 0) pendencias.push({ area: "clientes", texto: semConta + " cliente(s) sem conta de anuncio conectada", meta: "Conecte o adAccountId na area Clientes" });
        var naoAssoc = concs.filter(function (c) { return !c.clienteId; }).length;
        if (naoAssoc > 0) pendencias.push({ area: "clientes", texto: naoAssoc + " concorrente(s) do Radar sem cliente associado", meta: "Associe na area Clientes" });
        if (!ov.clientesTotal) pendencias.push({ area: "clientes", texto: "Nenhum cliente cadastrado ainda", meta: "Crie o primeiro na area Clientes" });

        // Selo discreto "Dados de exemplo" ao lado do titulo (sem banner)
        var selo = document.getElementById("dash-selo-exemplo");
        if (selo) {
          selo.style.display = exemplo ? "inline-flex" : "none";
          selo.title = "Os numeros e o grafico sao ilustrativos. Conecte o META_ACCESS_TOKEN no .env do backend e as contas dos clientes para ver dados reais.";
        }

        var h = '<div class="stat-grid dash-kpis">' + stats.map(kpiHtml).join("") + "</div>";

        // Bloco principal: grafico (~60%) + pendencias na coluna lateral
        var serie = exemplo ? mockD.serie : (ov.serie || []);
        var valores = serie.map(function (d) { return d.investimento; });
        function fmtValor(v) { return fmtMoeda(v); }

        h += '<div class="dash-principal ct-secao">';
        h += '<div class="painel"><div class="painel-topo"><h3>Investimento por dia</h3></div>' +
             '<div id="dash-grafico">' +
             (serie.length ? chartHtml(serie, valores, fmtValor) : '<div class="vazio">Sem dados no periodo.</div>') +
             "</div></div>";

        var icoAlerta = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        var icoOk = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

        h += '<div class="painel"><div class="painel-topo"><h3>Pendencias</h3>' +
             (pendencias.length ? '<span class="ct-badge alerta">' + pendencias.length + "</span>" : "") + "</div>" +
             '<div class="pend-lista">';
        if (!pendencias.length) {
          h += '<div class="pend-item estatico"><span class="pend-ico ok">' + icoOk + "</span>" +
               '<div class="pend-info"><div class="pend-titulo">Tudo em dia</div><div class="pend-sub">Nenhuma pendencia aberta na central.</div></div></div>';
        } else {
          h += pendencias.map(function (p) {
            return '<div class="pend-item" data-area-link="' + esc(p.area) + '"><span class="pend-ico">' + icoAlerta + "</span>" +
                   '<div class="pend-info"><div class="pend-titulo">' + esc(p.texto) + '</div><div class="pend-sub">' + esc(p.meta) + "</div></div>" +
                   '<span class="seta">&rsaquo;</span></div>';
          }).join("");
        }
        h += "</div></div></div>";

        alvo.innerHTML = h;
        var graf = document.getElementById("dash-grafico");
        if (graf && serie.length) ligarChart(graf, serie, valores, fmtValor);
        alvo.querySelectorAll("[data-area-link]").forEach(function (row) {
          row.addEventListener("click", function () { irParaArea(row.getAttribute("data-area-link")); });
        });
      })
      .catch(function (err) {
        if (err.offline) renderOffline(alvo, renderDashCentral);
        else alvo.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  // ---------------------------------------------------------------------
  // Tabelas responsivas: copia o texto do cabecalho para data-th de cada
  // celula (o CSS mobile usa attr(data-th) como rotulo do card empilhado).
  // ---------------------------------------------------------------------
  function rotularTabelas(raiz) {
    if (!raiz) return;
    raiz.querySelectorAll("table.ct-tabela").forEach(function (tb) {
      var ths = Array.prototype.map.call(tb.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
      tb.querySelectorAll("tbody tr").forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          if (ths[i] && !td.hasAttribute("data-th")) td.setAttribute("data-th", ths[i]);
        });
      });
    });
  }
  var raizesTabelas = [rootClientes, rootGestor, document.getElementById("dash-central")];
  var observadorTabelas = new MutationObserver(function () { raizesTabelas.forEach(rotularTabelas); });
  raizesTabelas.forEach(function (r) { if (r) observadorTabelas.observe(r, { childList: true, subtree: true }); });

  // =====================================================================
  // TRACKING (Etapa 4): checklist, monitor de eventos do Pixel e UTMs
  // =====================================================================
  var trackingClienteId = null;

  function pillTracking(pct) {
    var cls = pct >= 100 ? "on" : pct > 0 ? "conectado" : "neutro";
    return '<span class="ct-badge ' + cls + '">Tracking ' + pct + "%</span>";
  }

  function progressoHtml(pct) {
    var w = Math.max(0, Math.min(100, Math.round(pct)));
    if (w === 0) {
      return '<div class="ct-progress"><div class="barra" style="width:48px;background:var(--surface-3);color:var(--text-3);">0%</div><div class="resto">100%</div></div>';
    }
    return '<div class="ct-progress"><div class="barra" style="width:' + w + '%;">' + w + "%</div>" +
           (w < 100 ? '<div class="resto">' + (100 - w) + "%</div>" : "") + "</div>";
  }

  var ICONES_TRK = {
    pendente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>',
    em_andamento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    problema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  var ROTULO_STATUS_TRK = { pendente: "Pendente", em_andamento: "Em andamento", ok: "OK", problema: "Com problema" };

  function renderTracking() {
    var root = document.getElementById("tracking-root");
    var topo = document.getElementById("tracking-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Tracking...");
    api("/api/paid-ads/clients")
      .then(function (r) {
        estado.clientes = r.clientes || [];
        if (!estado.clientes.length) {
          if (topo) topo.innerHTML = "";
          root.innerHTML = '<div class="painel"><div class="vazio">Nenhum cliente cadastrado ainda.<br/><br/>' +
            '<button class="btn-toolbar" data-act="ir-clientes">Criar cliente</button></div></div>';
          var b = root.querySelector('[data-act="ir-clientes"]');
          if (b) b.addEventListener("click", function () { irParaArea("clientes"); });
          return;
        }
        if (!trackingClienteId || !buscarCliente(trackingClienteId)) trackingClienteId = estado.clientes[0].id;
        if (topo) {
          topo.innerHTML = '<div class="select-wrap"><select id="trk-cliente">' + estado.clientes.map(function (c) {
            return '<option value="' + esc(c.id) + '"' + (c.id === trackingClienteId ? " selected" : "") + ">" + esc(c.nome) + "</option>";
          }).join("") + "</select></div>";
          document.getElementById("trk-cliente").addEventListener("change", function () {
            trackingClienteId = this.value;
            renderTracking();
          });
        }
        var cliente = buscarCliente(trackingClienteId);
        root.innerHTML =
          '<div class="painel ct-secao"><div class="painel-topo"><h3>Checklist de tracking</h3><span class="contador" id="trk-progresso"></span></div><div id="trk-checklist">' + spinner("Carregando checklist...") + "</div></div>" +
          '<div class="painel ct-secao"><div class="painel-topo"><h3>Monitor de eventos (Pixel)</h3><span class="contador" id="trk-eventos-info"></span></div><div id="trk-eventos">' + spinner("Lendo eventos do Pixel...") + "</div></div>" +
          '<div class="painel"><div class="painel-topo"><h3>Auditoria de UTMs</h3><span class="contador" id="trk-utms-info"></span></div><div id="trk-utms">' + spinner("Auditando UTMs...") + "</div></div>";
        carregarChecklist(cliente);
        carregarEventosPixel(cliente, false);
        carregarUtms(cliente, false);
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderTracking);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  // ---------- 4.1 Checklist ----------
  function carregarChecklist(cliente) {
    var alvo = document.getElementById("trk-checklist");
    if (!alvo) return;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/tracking")
      .then(function (r) { renderChecklist(cliente, r); })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarChecklist(cliente); }); });
  }

  function renderChecklist(cliente, r) {
    var alvo = document.getElementById("trk-checklist");
    var prog = document.getElementById("trk-progresso");
    if (prog) prog.innerHTML = '<div style="min-width:220px;">' + progressoHtml(r.completude) + "</div>";
    var h = '<div class="trk-lista">' + r.itens.map(function (item) {
      var opcoes = r.statusPossiveis.map(function (s) {
        return '<option value="' + s + '"' + (item.status === s ? " selected" : "") + ">" + (ROTULO_STATUS_TRK[s] || s) + "</option>";
      }).join("");
      return '<div class="trk-item st-' + esc(item.status) + '" data-linha="' + esc(item.id) + '">' +
        '<span class="trk-ico">' + (ICONES_TRK[item.status] || ICONES_TRK.pendente) + "</span>" +
        '<div class="trk-info"><div class="trk-titulo">' + esc(item.titulo) + '</div><div class="trk-desc">' + esc(item.descricao) + "</div></div>" +
        '<input class="trk-obs" data-item="' + esc(item.id) + '" placeholder="Observacao..." value="' + esc(item.observacao || "") + '" />' +
        '<div class="select-wrap"><select class="trk-status" data-item="' + esc(item.id) + '">' + opcoes + "</select></div>" +
        "</div>";
    }).join("") + "</div>";
    alvo.innerHTML = h;

    function salvarItem(itemId) {
      var sel = alvo.querySelector('.trk-status[data-item="' + itemId + '"]');
      var obs = alvo.querySelector('.trk-obs[data-item="' + itemId + '"]');
      api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/tracking", {
        method: "POST",
        body: { item: itemId, status: sel.value, observacao: obs.value }
      })
        .then(function (nr) {
          if (prog) prog.innerHTML = '<div style="min-width:220px;">' + progressoHtml(nr.completude) + "</div>";
          var linha = alvo.querySelector('[data-linha="' + itemId + '"]');
          if (linha) {
            linha.className = "trk-item st-" + sel.value;
            linha.setAttribute("data-linha", itemId);
            var ico = linha.querySelector(".trk-ico");
            if (ico) ico.innerHTML = ICONES_TRK[sel.value] || ICONES_TRK.pendente;
          }
        })
        .catch(function (err) { window.alert("Erro ao salvar item: " + err.message); });
    }

    alvo.querySelectorAll(".trk-status").forEach(function (sel) {
      sel.addEventListener("change", function () { salvarItem(sel.getAttribute("data-item")); });
    });
    alvo.querySelectorAll(".trk-obs").forEach(function (inp) {
      inp.addEventListener("change", function () { salvarItem(inp.getAttribute("data-item")); });
    });
  }

  // ---------- 4.2 Monitor de eventos ----------
  function carregarEventosPixel(cliente, refresh) {
    var alvo = document.getElementById("trk-eventos");
    if (!alvo) return;
    alvo.innerHTML = spinner("Lendo eventos do Pixel...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/tracking-eventos" + (refresh ? "?refresh=1" : ""))
      .then(function (r) {
        var info = document.getElementById("trk-eventos-info");
        if (info) info.innerHTML = r.mock ? '<span class="selo-exemplo" title="' + esc(r.aviso || "") + '">Dados de exemplo</span>' : "";
        var icoSinal = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        var h = "";
        if (r.sinais && r.sinais.length) {
          h += '<div class="trk-sinais">' + r.sinais.map(function (s) {
            return '<div class="trk-sinal">' + icoSinal + "<span>" + esc(s) + "</span></div>";
          }).join("") + "</div>";
        } else {
          h += '<div class="trk-sinais"><div class="trk-sinal" style="background:var(--positive-soft);"><span style="color:var(--positive);font-weight:600;">Nenhum sinal de problema nos ultimos 7 dias.</span></div></div>';
        }
        h += '<div class="trk-origem">' +
             (r.origemDisponivel && r.origem
               ? '<span class="ct-badge conectado">Browser: ' + fmtNum(r.origem.browser) + "</span>" +
                 '<span class="ct-badge ' + (r.origem.server > 0 ? "on" : "off") + '">Server (CAPI): ' + fmtNum(r.origem.server) + "</span>"
               : '<span class="ct-badge neutro">Origem browser/server indisponivel nesta conta</span>') +
             "</div>";
        if (!r.eventos.length) {
          h += '<div class="vazio">Nenhum evento recebido nos ultimos 7 dias.</div>';
        } else {
          h += '<div class="ct-tabela-wrap" style="margin-top:6px;"><table class="ct-tabela"><thead><tr>' +
               "<th>Evento</th><th class=\"num\">Ultimos 7 dias</th><th class=\"num\">7 dias anteriores</th><th class=\"num\">Variacao</th></tr></thead><tbody>";
          r.eventos.forEach(function (ev) {
            h += '<tr><td class="nome-obj">' + esc(ev.nome) + '</td><td class="num">' + fmtNum(ev.total) + "</td>" +
                 '<td class="num">' + fmtNum(ev.anterior) + '</td><td class="num">' +
                 (ev.variacaoPct != null ? badgeVar(ev.variacaoPct, 1) : '<span class="ct-var neutra">&mdash;</span>') + "</td></tr>";
          });
          h += "</tbody></table></div>";
        }
        h += '<div style="padding:0 20px 16px;">' + linhaCacheHtml(r.cache, r.mock) + "</div>";
        alvo.innerHTML = h;
        var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
        if (btnAtu) btnAtu.addEventListener("click", function () { carregarEventosPixel(cliente, true); });
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarEventosPixel(cliente, false); }); });
  }

  // ---------- 4.3 Auditoria de UTMs ----------
  var ROTULO_UTM = { ok: "OK", sem_utm: "Sem UTM", fora_padrao: "Fora do padrao" };
  var CLASSE_UTM = { ok: "on", sem_utm: "alerta", fora_padrao: "off" };

  function carregarUtms(cliente, refresh) {
    var alvo = document.getElementById("trk-utms");
    if (!alvo) return;
    alvo.innerHTML = spinner("Auditando UTMs...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/tracking-utms" + (refresh ? "?refresh=1" : ""))
      .then(function (r) {
        var info = document.getElementById("trk-utms-info");
        if (info) info.innerHTML = r.mock ? '<span class="selo-exemplo" title="' + esc(r.aviso || "") + '">Dados de exemplo</span>' : "";
        var h = '<div class="trk-origem">' +
          '<span class="ct-badge on">' + r.resumo.ok + " ok</span>" +
          '<span class="ct-badge alerta">' + r.resumo.semUtm + " sem UTM</span>" +
          '<span class="ct-badge off">' + r.resumo.foraPadrao + " fora do padrao</span>" +
          '<span class="ct-badge neutro" title="Parametros obrigatorios">Padrao: ' + r.padrao.join(", ") + "</span></div>";
        if (!r.anuncios.length) {
          h += '<div class="vazio">Nenhum anuncio encontrado no periodo.</div>';
        } else {
          h += '<div class="ct-tabela-wrap" style="margin-top:6px;"><table class="ct-tabela"><thead><tr>' +
               "<th>Anuncio</th><th>Status</th><th>UTM</th><th>Detalhe</th></tr></thead><tbody>";
          r.anuncios.forEach(function (a) {
            var detalhe = a.status === "ok"
              ? '<span style="color:var(--text-3);font-size:12px;" title="' + esc(a.urlTags) + '">' + esc(a.urlTags.length > 60 ? a.urlTags.slice(0, 60) + "..." : a.urlTags) + "</span>"
              : a.status === "sem_utm"
                ? '<span style="color:var(--text-2);font-size:12.5px;">Nenhum parametro de URL configurado</span>'
                : '<span style="color:var(--text-2);font-size:12.5px;">Faltando: <b>' + a.faltando.join(", ") + "</b></span>";
            h += '<tr><td class="nome-obj">' + esc(a.nome) + "</td>" +
                 "<td>" + (a.statusAnuncio === "ACTIVE" ? '<span class="ct-badge on">ativo</span>' : '<span class="ct-badge neutro">' + esc(String(a.statusAnuncio || "").toLowerCase()) + "</span>") + "</td>" +
                 '<td><span class="ct-badge ' + (CLASSE_UTM[a.status] || "neutro") + '">' + (ROTULO_UTM[a.status] || a.status) + "</span></td>" +
                 "<td>" + detalhe + "</td></tr>";
          });
          h += "</tbody></table></div>";
        }
        h += '<div style="padding:0 20px 16px;">' + linhaCacheHtml(r.cache, r.mock) + "</div>";
        alvo.innerHTML = h;
        var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
        if (btnAtu) btnAtu.addEventListener("click", function () { carregarUtms(cliente, true); });
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarUtms(cliente, false); }); });
  }

  // Faixa de completude do tracking na pagina do cliente (Gestor)
  function carregarTrackingStrip(cliente) {
    var strip = document.getElementById("ct-tracking-strip");
    if (!strip) return;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/tracking")
      .then(function (r) {
        strip.style.display = "";
        strip.innerHTML = '<div style="padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
          '<span style="font-size:14px;font-weight:600;">Tracking</span>' +
          '<div style="flex:1;min-width:220px;max-width:420px;">' + progressoHtml(r.completude) + "</div>" +
          '<button class="btn-sm salvar" data-act="abrir-tracking">Abrir Tracking</button></div>';
        strip.querySelector('[data-act="abrir-tracking"]').addEventListener("click", function () {
          trackingClienteId = cliente.id;
          irParaArea("tracking");
        });
      })
      .catch(function () { strip.style.display = "none"; });
  }

  // =====================================================================
  // AUTOMACOES (Etapa 4.5): regras -> webhooks (GHL / n8n / Make / outro)
  // =====================================================================
  var autFormId = null; // null = fechado, "" = nova, "id" = editando
  var autDados = null; // ultimo GET /automacoes

  var ROTULO_PLAT = { ghl: "GHL", n8n: "n8n", make: "Make", outro: "Outro" };

  function gatilhoInfo(id) {
    if (!autDados) return null;
    for (var i = 0; i < autDados.gatilhos.length; i++) if (autDados.gatilhos[i].id === id) return autDados.gatilhos[i];
    return null;
  }

  function condicaoResumo(regra) {
    var info = gatilhoInfo(regra.gatilho);
    if (!info || !info.params.length) return "";
    return info.params.map(function (p) {
      return p.rotulo + ": " + (regra.parametros[p.k] != null ? regra.parametros[p.k] : p.def);
    }).join(" · ");
  }

  function renderAutomacoes() {
    var root = document.getElementById("automacoes-root");
    var topo = document.getElementById("automacoes-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando automacoes...");
    Promise.all([api("/api/paid-ads/automacoes"), api("/api/paid-ads/clients")])
      .then(function (r) {
        autDados = r[0];
        estado.clientes = r[1].clientes || [];
        if (topo) {
          var ultima = autDados.estado.ultimaVerificacao ? fmtData(autDados.estado.ultimaVerificacao) : "nunca";
          topo.innerHTML =
            '<span style="font-size:12px;color:var(--text-3);">Verificacoes as ' + esc(autDados.estado.horarios.join(" e ")) +
            ' · ultima: ' + esc(ultima) + "</span>" +
            '<button class="btn-toolbar" data-act="verificar-agora">Verificar agora</button>';
          topo.querySelector('[data-act="verificar-agora"]').addEventListener("click", verificarAgora);
        }
        renderAutomacoesCorpo();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderAutomacoes);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function verificarAgora() {
    var topo = document.getElementById("automacoes-topo");
    var btn = topo ? topo.querySelector('[data-act="verificar-agora"]') : null;
    if (btn) { btn.disabled = true; btn.textContent = "Verificando..."; }
    api("/api/paid-ads/automacoes-verificar", { method: "POST", timeoutMs: 180000 })
      .then(function (r) {
        window.alert("Verificacao concluida: " + r.resumo.disparos + " disparo(s) em " + r.resumo.combinacoes +
          " combinacao(oes) avaliada(s)." + (r.resumo.erros.length ? "\nErros: " + r.resumo.erros.join(" | ") : ""));
        renderAutomacoes();
      })
      .catch(function (err) {
        window.alert("Erro na verificacao: " + err.message);
        if (btn) { btn.disabled = false; btn.textContent = "Verificar agora"; }
      });
  }

  function renderAutomacoesCorpo() {
    var root = document.getElementById("automacoes-root");
    var h = '<div class="filtros" style="margin:0 0 22px;">' +
      '<button class="btn-toolbar" data-act="nova-regra"><span class="mais">+</span> Nova regra</button>' +
      '<div class="contador"><b>' + autDados.regras.length + "</b> regra(s)</div></div>";

    if (autFormId !== null) h += htmlFormRegra();

    // Lista de regras
    h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Regras</h3></div>';
    if (!autDados.regras.length) {
      h += '<div class="vazio">Nenhuma regra criada. As condicoes sao avaliadas 2x ao dia e disparam webhooks para GHL, n8n ou Make.<br/><br/>' +
           '<button class="btn-toolbar" data-act="nova-regra-2"><span class="mais">+</span> Criar a primeira regra</button></div>';
    } else {
      h += '<div style="padding:16px 18px 18px;"><div class="ct-lista">' + autDados.regras.map(function (regra) {
        var info = gatilhoInfo(regra.gatilho);
        var clientesTxt = regra.clientes.length
          ? regra.clientes.map(function (id) { var c = buscarCliente(id); return c ? c.nome : id; }).join(", ")
          : "Todos os clientes";
        var cond = condicaoResumo(regra);
        var hooks = regra.webhooks.length
          ? regra.webhooks.map(function (w) { return '<span class="ct-badge neutro" title="' + esc(w.url) + '">' + (ROTULO_PLAT[w.plataforma] || w.plataforma) + "</span>"; }).join(" ")
          : '<span class="ct-badge off" title="Sem webhook: o disparo vira so pendencia no Dashboard">sem webhook</span>';
        return '<div class="ct-item">' +
          '<span class="av" style="border-radius:12px;">' + (ICONES_KPI.alerta || "") + "</span>" +
          '<div class="info"><div class="titulo">' + esc(regra.nome) + "</div>" +
          '<div class="sub">' + esc(info ? info.titulo : regra.gatilho) + (cond ? " · " + esc(cond) : "") + " · " + esc(clientesTxt) + "</div></div>" +
          '<div class="lado">' + hooks +
          '<span class="ct-badge ' + (regra.ativa ? "on" : "off") + '" style="cursor:pointer;" data-toggle="' + esc(regra.id) + '" title="Clique para ' + (regra.ativa ? "pausar" : "ativar") + '">' + (regra.ativa ? "Ativa" : "Pausada") + "</span>" +
          '<button class="btn-sm" data-testar="' + esc(regra.id) + '">Testar disparo</button>' +
          '<button class="btn-sm" data-editar-regra="' + esc(regra.id) + '">Editar</button>' +
          '<button class="btn-sm" data-excluir="' + esc(regra.id) + '">Excluir</button>' +
          "</div></div>";
      }).join("") + "</div></div>";
    }
    h += "</div>";

    // Log de disparos
    h += '<div class="painel"><div class="painel-topo"><h3>Log de disparos</h3>' +
         '<span class="contador"><span class="ct-periodo" id="aut-log-filtro">' +
         [["7", "7d"], ["30", "30d"], ["", "Tudo"]].map(function (op) {
           return '<button data-dias="' + op[0] + '"' + (op[0] === "7" ? ' class="ativo"' : "") + ">" + op[1] + "</button>";
         }).join("") + "</span></span></div>" +
         '<div id="aut-log">' + spinner("Carregando log...") + "</div></div>";

    root.innerHTML = h;

    root.querySelectorAll('[data-act="nova-regra"], [data-act="nova-regra-2"]').forEach(function (b) {
      b.addEventListener("click", function () { autFormId = ""; renderAutomacoesCorpo(); });
    });
    root.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var regra = regraPorId(b.getAttribute("data-toggle"));
        if (!regra) return;
        salvarRegra({ id: regra.id, nome: regra.nome, gatilho: regra.gatilho, parametros: regra.parametros, clientes: regra.clientes, webhooks: regra.webhooks, ativa: !regra.ativa });
      });
    });
    root.querySelectorAll("[data-editar-regra]").forEach(function (b) {
      b.addEventListener("click", function () { autFormId = b.getAttribute("data-editar-regra"); renderAutomacoesCorpo(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    });
    root.querySelectorAll("[data-excluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var regra = regraPorId(b.getAttribute("data-excluir"));
        if (!regra) return;
        if (!window.confirm('Excluir a regra "' + regra.nome + '"? O log de disparos e mantido.')) return;
        api("/api/paid-ads/automacoes-acao", { method: "POST", body: { id: regra.id, acao: "excluir" } })
          .then(renderAutomacoes)
          .catch(function (err) { window.alert("Erro: " + err.message); });
      });
    });
    root.querySelectorAll("[data-testar]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        b.textContent = "Enviando...";
        api("/api/paid-ads/automacoes-acao", { method: "POST", body: { id: b.getAttribute("data-testar"), acao: "testar" }, timeoutMs: 60000 })
          .then(function () { carregarLogDisparos(filtroLogAtual()); b.disabled = false; b.textContent = "Testar disparo"; })
          .catch(function (err) { window.alert("Erro no teste: " + err.message); b.disabled = false; b.textContent = "Testar disparo"; });
      });
    });
    root.querySelectorAll("#aut-log-filtro [data-dias]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll("#aut-log-filtro button").forEach(function (x) { x.classList.remove("ativo"); });
        b.classList.add("ativo");
        carregarLogDisparos(b.getAttribute("data-dias"));
      });
    });
    ligarFormRegra();
    carregarLogDisparos("7");
  }

  function regraPorId(id) {
    for (var i = 0; i < autDados.regras.length; i++) if (autDados.regras[i].id === id) return autDados.regras[i];
    return null;
  }

  function filtroLogAtual() {
    var a = document.querySelector("#aut-log-filtro button.ativo");
    return a ? a.getAttribute("data-dias") : "7";
  }

  function htmlFormRegra() {
    var editando = autFormId ? regraPorId(autFormId) : null;
    var r = autRascunho || editando || { nome: "", gatilho: autDados.gatilhos[0].id, parametros: {}, clientes: [], webhooks: [], ativa: true };
    var info = gatilhoInfo(r.gatilho) || autDados.gatilhos[0];

    var opsGatilho = autDados.gatilhos.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === r.gatilho ? " selected" : "") + ">" + esc(g.titulo) + "</option>";
    }).join("");

    var paramsHtml = info.params.map(function (p) {
      var v = r.parametros[p.k] != null ? r.parametros[p.k] : p.def;
      return '<div class="campo"><label>' + esc(p.rotulo) + '</label><input type="number" step="any" min="0" name="param-' + p.k + '" value="' + v + '" /></div>';
    }).join("");

    var clientesHtml = estado.clientes.length
      ? '<label class="ct-conc-check' + (!r.clientes.length ? " marcado" : "") + '"><input type="checkbox" name="aut-todos"' + (!r.clientes.length ? " checked" : "") + " />Todos os clientes</label>" +
        estado.clientes.map(function (c) {
          var marcado = r.clientes.indexOf(c.id) >= 0;
          return '<label class="ct-conc-check' + (marcado ? " marcado" : "") + '"><input type="checkbox" name="aut-cliente" value="' + esc(c.id) + '"' + (marcado ? " checked" : "") + " />" + esc(c.nome) + "</label>";
        }).join("")
      : '<span style="color:var(--text-3);font-size:13px;">Nenhum cliente cadastrado (a regra vale para todos quando existirem).</span>';

    var hooks = r.webhooks.length ? r.webhooks : [{ url: "", plataforma: "outro" }];
    var hooksHtml = hooks.map(function (w, i) {
      return '<div class="aut-webhook" data-hook="' + i + '">' +
        '<input type="text" class="aut-hook-url" placeholder="https://..." value="' + esc(w.url) + '" />' +
        '<div class="select-wrap"><select class="aut-hook-plat">' +
          ["ghl", "n8n", "make", "outro"].map(function (p) { return '<option value="' + p + '"' + (w.plataforma === p ? " selected" : "") + ">" + ROTULO_PLAT[p] + "</option>"; }).join("") +
        "</select></div>" +
        '<button class="btn-sm" data-remover-hook="' + i + '">Remover</button></div>';
    }).join("");

    return '<div class="ct-form" id="aut-form">' +
      "<h3>" + (editando ? "Editar regra" : "Nova regra") + "</h3>" +
      '<div class="ct-form-grid">' +
        '<div class="campo"><label>Nome *</label><input type="text" name="aut-nome" value="' + esc(r.nome) + '" placeholder="Ex.: CPL estourado" /></div>' +
        '<div class="campo"><label>Gatilho</label><div class="select-wrap"><select name="aut-gatilho">' + opsGatilho + "</select></div></div>" +
        paramsHtml +
      "</div>" +
      '<div class="secao">Clientes aplicaveis</div>' +
      '<div class="ct-conc-lista">' + clientesHtml + "</div>" +
      '<div class="secao">Webhooks de destino (URL generica; a etiqueta e so visual)</div>' +
      '<div id="aut-hooks">' + hooksHtml + "</div>" +
      '<button class="ct-btn-sec" data-act="add-hook" style="margin-top:10px;">+ Adicionar webhook</button>' +
      '<div class="ct-form-acoes">' +
        '<button class="btn-toolbar" data-act="salvar-regra">Salvar regra</button>' +
        '<button class="ct-btn-sec" data-act="cancelar-regra">Cancelar</button>' +
        '<label class="ct-conc-check' + (r.ativa ? " marcado" : "") + '" style="margin-left:auto;"><input type="checkbox" name="aut-ativa"' + (r.ativa ? " checked" : "") + " />Regra ativa</label>" +
      "</div>" +
      '<div class="ct-erro-form" id="aut-erro"></div>' +
    "</div>";
  }

  function ligarFormRegra() {
    var form = document.getElementById("aut-form");
    if (!form) return;

    form.querySelector('[name="aut-gatilho"]').addEventListener("change", function () {
      // Regenera o form preservando nome/hooks digitados ate agora
      var rascunho = coletarFormRegra(form);
      rascunho.gatilho = this.value;
      autRascunho = rascunho;
      renderAutomacoesCorpo();
      autRascunho = null;
    });
    form.querySelector('[data-act="cancelar-regra"]').addEventListener("click", function () { autFormId = null; renderAutomacoesCorpo(); });
    form.querySelector('[data-act="salvar-regra"]').addEventListener("click", function () {
      var payload = coletarFormRegra(form);
      salvarRegra(payload, function (msg) {
        var alvo = document.getElementById("aut-erro");
        if (alvo) alvo.textContent = msg;
      });
    });
    form.querySelector('[data-act="add-hook"]').addEventListener("click", function () {
      var cont = document.getElementById("aut-hooks");
      var i = cont.querySelectorAll(".aut-webhook").length;
      var div = document.createElement("div");
      div.className = "aut-webhook";
      div.setAttribute("data-hook", String(i));
      div.innerHTML = '<input type="text" class="aut-hook-url" placeholder="https://..." />' +
        '<div class="select-wrap"><select class="aut-hook-plat">' +
        ["ghl", "n8n", "make", "outro"].map(function (p) { return '<option value="' + p + '">' + ROTULO_PLAT[p] + "</option>"; }).join("") +
        "</select></div>" +
        '<button class="btn-sm" data-remover-hook="' + i + '">Remover</button>';
      cont.appendChild(div);
      div.querySelector("[data-remover-hook]").addEventListener("click", function () { div.remove(); });
    });
    form.querySelectorAll("[data-remover-hook]").forEach(function (b) {
      b.addEventListener("click", function () { b.closest(".aut-webhook").remove(); });
    });
    // "Todos" desmarca individuais e vice-versa
    var todos = form.querySelector('[name="aut-todos"]');
    if (todos) todos.addEventListener("change", function () {
      if (todos.checked) form.querySelectorAll('[name="aut-cliente"]').forEach(function (c) { c.checked = false; c.closest(".ct-conc-check").classList.remove("marcado"); });
      todos.closest(".ct-conc-check").classList.toggle("marcado", todos.checked);
    });
    form.querySelectorAll('[name="aut-cliente"]').forEach(function (c) {
      c.addEventListener("change", function () {
        c.closest(".ct-conc-check").classList.toggle("marcado", c.checked);
        if (c.checked && todos) { todos.checked = false; todos.closest(".ct-conc-check").classList.remove("marcado"); }
      });
    });
    var ativa = form.querySelector('[name="aut-ativa"]');
    if (ativa) ativa.addEventListener("change", function () { ativa.closest(".ct-conc-check").classList.toggle("marcado", ativa.checked); });
  }

  var autRascunho = null;

  function coletarFormRegra(form) {
    if (autRascunho) return autRascunho;
    var parametros = {};
    form.querySelectorAll('input[name^="param-"]').forEach(function (inp) {
      parametros[inp.name.replace("param-", "")] = parseFloat(String(inp.value).replace(",", "."));
    });
    var clientes = [];
    var todos = form.querySelector('[name="aut-todos"]');
    if (!todos || !todos.checked) {
      form.querySelectorAll('[name="aut-cliente"]:checked').forEach(function (c) { clientes.push(c.value); });
    }
    var webhooks = [];
    form.querySelectorAll(".aut-webhook").forEach(function (row) {
      var url = row.querySelector(".aut-hook-url").value.trim();
      if (url) webhooks.push({ url: url, plataforma: row.querySelector(".aut-hook-plat").value });
    });
    return {
      id: autFormId || undefined,
      nome: form.querySelector('[name="aut-nome"]').value.trim(),
      gatilho: form.querySelector('[name="aut-gatilho"]').value,
      parametros: parametros,
      clientes: clientes,
      webhooks: webhooks,
      ativa: form.querySelector('[name="aut-ativa"]') ? form.querySelector('[name="aut-ativa"]').checked : true
    };
  }

  function salvarRegra(payload, aoErro) {
    api("/api/paid-ads/automacoes", { method: "POST", body: payload })
      .then(function () { autFormId = null; renderAutomacoes(); })
      .catch(function (err) {
        if (aoErro) aoErro(err.offline ? "Backend offline." : err.message);
        else window.alert("Erro ao salvar: " + err.message);
      });
  }

  function carregarLogDisparos(dias) {
    var alvo = document.getElementById("aut-log");
    if (!alvo) return;
    var q = "";
    if (dias) q = "?since=" + new Date(Date.now() - Number(dias) * 86400000).toISOString().slice(0, 10);
    api("/api/paid-ads/automacoes-disparos" + q)
      .then(function (r) {
        if (!r.disparos.length) { alvo.innerHTML = '<div class="vazio">Nenhum disparo registrado neste periodo.</div>'; return; }
        var h = '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
                "<th>Quando</th><th>Regra</th><th>Cliente</th><th>Tipo</th><th>Entrega</th></tr></thead><tbody>";
        r.disparos.forEach(function (d, i) {
          var entrega = d.resultados.length
            ? d.resultados.map(function (res) {
                var badge = res.ok ? '<span class="ct-badge on">' + (res.status || "ok") + "</span>" : '<span class="ct-badge alerta" title="' + esc(res.erro || "") + '">' + (res.status || "falha") + (res.tentativas > 1 ? " (retry)" : "") + "</span>";
                return '<span title="' + esc(res.url) + '">' + (ROTULO_PLAT[res.plataforma] || res.plataforma) + " " + badge + "</span>";
              }).join(" &nbsp; ")
            : '<span class="ct-badge neutro">so pendencia</span>';
          h += '<tr class="clicavel" data-disp="' + i + '"><td style="white-space:nowrap;">' + fmtData(d.timestamp) + "</td>" +
               '<td class="nome-obj">' + esc(d.regraNome) + "</td><td>" + esc(d.clienteNome) + "</td>" +
               "<td>" + (d.teste ? '<span class="ct-badge neutro">teste</span>' : '<span class="ct-badge conectado">real</span>') + "</td>" +
               "<td>" + entrega + "</td></tr>" +
               '<tr class="aut-payload" data-payload="' + i + '" style="display:none;"><td colspan="5"><pre>' + esc(JSON.stringify(d.payload, null, 2)) + "</pre></td></tr>";
        });
        alvo.innerHTML = h + "</tbody></table></div>";
        alvo.querySelectorAll("tr[data-disp]").forEach(function (tr) {
          tr.addEventListener("click", function () {
            var p = alvo.querySelector('tr[data-payload="' + tr.getAttribute("data-disp") + '"]');
            if (p) p.style.display = p.style.display === "none" ? "" : "none";
          });
        });
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarLogDisparos(dias); }); });
  }

  // =====================================================================
  // REDATOR IA (Etapa 5.1): carrossel, reel, legenda e ideias por pilar
  // =====================================================================
  var redInfo = null; // GET /redator (tipos, disponibilidade)
  var redTipo = "carrossel";
  var redUltimo = null; // ultima geracao (para salvar na Biblioteca)

  function renderRedator() {
    var root = document.getElementById("redator-root");
    var topo = document.getElementById("redator-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Redator IA...");
    Promise.all([api("/api/paid-ads/redator"), api("/api/paid-ads/clients")])
      .then(function (r) {
        redInfo = r[0];
        estado.clientes = r[1].clientes || [];
        if (topo) {
          topo.innerHTML = redInfo.disponivel
            ? '<span class="ct-badge conectado">IA: ' + esc(redInfo.provider || "?") + "</span>"
            : '<span class="ct-badge off" title="' + esc(redInfo.aviso || "") + '">IA nao configurada</span>';
        }
        var h = "";
        if (!redInfo.disponivel) {
          h += '<div class="ct-nota">' + esc(redInfo.aviso || "Configure a chave de IA no backend.") + "</div>";
        }
        h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Briefing</h3>' +
             '<span class="contador"><span class="ct-periodo" id="red-tipos">' +
             redInfo.tipos.map(function (t) {
               return '<button data-tipo="' + t.id + '"' + (t.id === redTipo ? ' class="ativo"' : "") + ' title="' + esc(t.descricao) + '">' + esc(t.titulo) + "</button>";
             }).join("") + "</span></span></div>" +
             '<div style="padding:18px 20px;">' +
               '<div class="ct-form-grid">' +
                 '<div class="campo"><label>Cliente</label><div class="select-wrap"><select id="red-cliente">' +
                   '<option value="">— sem cliente —</option>' +
                   estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nome) + "</option>"; }).join("") +
                 "</select></div></div>" +
                 '<div class="campo"><label>Nicho</label><div class="select-wrap"><select id="red-nicho">' +
                   ["medica", "estetica", "odonto", "outro"].map(function (n) { return '<option value="' + n + '">' + n + "</option>"; }).join("") +
                 "</select></div></div>" +
                 '<div class="campo"><label>Tom</label><input type="text" id="red-tom" placeholder="Ex.: proximo, confiante, sem jargao" /></div>' +
               "</div>" +
               '<div class="campo" style="margin-bottom:14px;"><label>Objetivo do post *</label><input type="text" id="red-objetivo" placeholder=\'Ex.: "gerar agendamentos de avaliacao de implante" ou "quebrar a objecao de dor"\' style="width:100%;" /></div>' +
               '<div class="campo" style="margin-bottom:16px;"><label>Referencia (opcional — cole um texto ou o conteudo de um card do Radar)</label><textarea id="red-referencia" placeholder="Cole aqui uma referencia de estrutura ou angulo..."></textarea></div>' +
               '<button class="btn-toolbar" data-act="red-gerar"' + (redInfo.disponivel ? "" : " disabled") + ">Gerar conteudo</button>" +
             "</div></div>" +
             '<div id="red-resultado"></div>';
        root.innerHTML = h;

        root.querySelectorAll("#red-tipos [data-tipo]").forEach(function (b) {
          b.addEventListener("click", function () {
            redTipo = b.getAttribute("data-tipo");
            root.querySelectorAll("#red-tipos button").forEach(function (x) { x.classList.remove("ativo"); });
            b.classList.add("ativo");
          });
        });
        var btnGerar = root.querySelector('[data-act="red-gerar"]');
        if (btnGerar) btnGerar.addEventListener("click", gerarConteudoRedator);
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderRedator);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function gerarConteudoRedator() {
    var alvo = document.getElementById("red-resultado");
    var objetivo = (document.getElementById("red-objetivo") || {}).value || "";
    if (!objetivo.trim()) {
      alvo.innerHTML = '<div class="ct-resultado erro">Preencha o objetivo do post antes de gerar.</div>';
      return;
    }
    alvo.innerHTML = spinner("Gerando conteudo com IA (pode levar ate 1 minuto)...");
    redUltimo = null;
    api("/api/paid-ads/redator", {
      method: "POST",
      timeoutMs: 120000,
      body: {
        tipo: redTipo,
        clienteId: (document.getElementById("red-cliente") || {}).value || "",
        nicho: (document.getElementById("red-nicho") || {}).value || "",
        tom: (document.getElementById("red-tom") || {}).value || "",
        objetivo: objetivo,
        referencia: (document.getElementById("red-referencia") || {}).value || ""
      }
    })
      .then(function (r) {
        redUltimo = r;
        renderResultadoRedator(alvo, r);
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, gerarConteudoRedator); });
  }

  function hashtagsHtml(tags) {
    if (!tags || !tags.length) return "";
    return '<div class="tags" style="margin-top:10px;">' + tags.map(function (t) { return '<span class="tag">#' + esc(t) + "</span>"; }).join("") + "</div>";
  }

  function blocoTexto(rotulo, texto) {
    return '<div class="ct-diag-bloco" style="margin-top:12px;"><h4 style="color:var(--accent-hover);">' + esc(rotulo) + '</h4><p style="white-space:pre-wrap;font-size:13.5px;color:var(--text-2);">' + esc(texto) + "</p></div>";
  }

  function textoParaCopiar(tipo, c) {
    var linhas = [];
    if (tipo === "carrossel") {
      linhas.push("CAPA: " + c.capa.titulo, c.capa.subtitulo, "");
      c.slides.forEach(function (s) { linhas.push("SLIDE " + s.numero + " — " + s.titulo, s.texto, ""); });
      linhas.push("CTA: " + c.cta, "", "LEGENDA:", c.legenda);
    } else if (tipo === "reel") {
      linhas.push("GANCHO: " + c.gancho, "");
      c.cenas.forEach(function (s) { linhas.push("[" + s.tempo + "] FALA: " + s.fala, "TEXTO NA TELA: " + s.textoNaTela, ""); });
      linhas.push("CTA: " + c.cta, "", "LEGENDA:", c.legenda);
    } else if (tipo === "legenda") {
      linhas.push(c.legenda, "", "CTA: " + c.cta);
    } else {
      (c.pilares || []).forEach(function (p) {
        linhas.push("PILAR: " + p.pilar);
        p.ideias.forEach(function (i) { linhas.push("- [" + i.formato + "] " + i.titulo + ": " + i.descricao); });
        linhas.push("");
      });
    }
    if (c.hashtags && c.hashtags.length) linhas.push("", c.hashtags.map(function (t) { return "#" + t; }).join(" "));
    return linhas.join("\n").trim();
  }

  function renderResultadoRedator(alvo, r) {
    var c = r.conteudo;
    var corpo = "";

    if (r.tipo === "carrossel") {
      corpo += '<div class="ct-diag-bloco"><h4 style="color:var(--accent-hover);">Capa</h4>' +
        '<p style="font-size:16px;font-weight:700;color:var(--text);">' + esc(c.capa.titulo) + "</p>" +
        '<p style="font-size:13px;color:var(--text-2);margin-top:4px;">' + esc(c.capa.subtitulo) + "</p></div>" +
        '<div class="red-slides">' + c.slides.map(function (s) {
          return '<div class="red-slide"><span class="red-num">' + s.numero + "</span>" +
            '<div class="red-slide-titulo">' + esc(s.titulo) + '</div><div class="red-slide-texto">' + esc(s.texto) + "</div></div>";
        }).join("") + "</div>" +
        blocoTexto("CTA (slide final)", c.cta) +
        blocoTexto("Legenda", c.legenda) + hashtagsHtml(c.hashtags);
    } else if (r.tipo === "reel") {
      corpo += '<div class="ct-diag-resumo" style="margin-bottom:12px;"><b>Gancho:</b> ' + esc(c.gancho) + "</div>" +
        '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr><th>Tempo</th><th>Fala</th><th>Texto na tela</th></tr></thead><tbody>' +
        c.cenas.map(function (s) {
          return '<tr><td style="white-space:nowrap;">' + esc(s.tempo) + "</td><td>" + esc(s.fala) + '</td><td style="color:var(--text-2);">' + esc(s.textoNaTela) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        blocoTexto("CTA", c.cta) + blocoTexto("Legenda", c.legenda) + hashtagsHtml(c.hashtags);
    } else if (r.tipo === "legenda") {
      corpo += blocoTexto("Legenda", c.legenda) + blocoTexto("CTA", c.cta) + hashtagsHtml(c.hashtags);
    } else {
      corpo += '<div class="ct-diag-grid">' + (c.pilares || []).map(function (p) {
        return '<div class="ct-diag-bloco plano"><h4>' + esc(p.pilar) + "</h4><ul>" +
          p.ideias.map(function (i) {
            return "<li><b>" + esc(i.titulo) + "</b> <span class=\"ct-badge neutro\">" + esc(i.formato) + "</span><br/><span style=\"font-size:12.5px;\">" + esc(i.descricao) + "</span></li>";
          }).join("") + "</ul></div>";
      }).join("") + "</div>";
    }

    var titulo = c.titulo || (redInfo.tipos.filter(function (t) { return t.id === r.tipo; })[0] || {}).titulo || r.tipo;
    alvo.innerHTML =
      '<div class="painel"><div class="painel-topo"><h3>' + esc(titulo) + "</h3>" +
      '<span class="contador"><span class="ct-badge conectado">IA: ' + esc(r.provider) + "</span>" +
      (r.clienteNome ? ' <span class="ct-badge neutro">' + esc(r.clienteNome) + "</span>" : "") + "</span></div>" +
      '<div style="padding:18px 20px;">' + corpo +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">' +
        '<button class="btn-toolbar" data-act="red-copiar">Copiar tudo</button>' +
        '<button class="ct-btn-sec" data-act="red-salvar">Salvar na Biblioteca (rascunho)</button>' +
        '<button class="ct-btn-sec" data-act="red-salvar-aprovado">Salvar como aprovado</button>' +
      "</div>" +
      '<div id="red-salvo" style="margin-top:8px;"></div>' +
      "</div></div>";

    alvo.querySelector('[data-act="red-copiar"]').addEventListener("click", function () {
      copiarTexto(textoParaCopiar(r.tipo, c), this);
    });
    function salvar(status, btn) {
      btn.disabled = true;
      api("/api/paid-ads/biblioteca", {
        method: "POST",
        body: { clienteId: r.clienteId || "", tipo: r.tipo, titulo: titulo, conteudo: c, status: status }
      })
        .then(function () {
          document.getElementById("red-salvo").innerHTML =
            '<div class="ct-resultado ok">Salvo na Biblioteca como <b>' + status + "</b>. A area Biblioteca (5.2) vai listar tudo.</div>";
        })
        .catch(function (err) {
          btn.disabled = false;
          document.getElementById("red-salvo").innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
        });
    }
    alvo.querySelector('[data-act="red-salvar"]').addEventListener("click", function () { salvar("rascunho", this); });
    alvo.querySelector('[data-act="red-salvar-aprovado"]').addEventListener("click", function () { salvar("aprovado", this); });
  }

  // ---------------------------------------------------------------------
  // Integracao com a navegacao do app
  // ---------------------------------------------------------------------
  window.PulsarCentral = {
    onArea: function (id) {
      if (id === "dashboard") renderDashCentral();
      if (id === "clientes") carregarClientes();
      if (id === "gestor") carregarGestor();
      if (id === "tracking") renderTracking();
      if (id === "automacoes") renderAutomacoes();
      if (id === "redator") renderRedator();
    }
  };

  // O app abre no Dashboard antes deste arquivo carregar: renderiza o bloco
  // consolidado na primeira carga tambem.
  renderDashCentral();

  // linkPainel dos webhooks: ?cliente=<id> abre direto a pagina do cliente.
  try {
    var paramCliente = new URLSearchParams(window.location.search).get("cliente");
    if (paramCliente) {
      estado.gestor.view = "cliente";
      estado.gestor.clienteId = paramCliente;
      irParaArea("gestor");
    }
  } catch (e) {}
})();
