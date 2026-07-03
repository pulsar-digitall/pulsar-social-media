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
      periodo: 7,
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
          ? '<span class="ct-badge on">conectada</span> <span style="color:var(--text-3);font-size:12px;">' + esc(c.adAccountId) + "</span>"
          : '<span class="ct-badge off">pendente</span>';
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
          campo("Conta de anuncio", "adAccountId", c.adAccountId, "text", "act_123456789") +
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
      adAccountId: cliente.adAccountId || "", pageId: cliente.pageId || "",
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
          { num: String(ov.clientesAtivos), lab: "Clientes ativos", sub: ov.clientesTotal + " no total" },
          { num: num(ov.investimentoTotal, function (v) { return fmtMoeda(v); }), lab: "Investimento (7d)" },
          { num: num(ov.leadsTotal, fmtNum), lab: "Leads (7d)" },
          { num: semDados || ov.cplMedio == null ? "—" : fmtMoeda(ov.cplMedio), lab: "CPL medio (7d)" },
          { num: num(ov.campanhasAtivas, fmtNum), lab: "Campanhas ativas" },
          { num: num(ov.campanhasComAlerta, fmtNum), lab: "Campanhas com alerta" }
        ];
        h += '<div class="stat-grid">' + stats.map(function (s) {
          return '<div class="stat"><div class="num">' + s.num + '</div><div class="lab">' + s.lab + "</div>" + (s.sub ? '<div class="ct-stat-sub">' + s.sub + "</div>" : "") + "</div>";
        }).join("") + "</div>";

        // Lista de clientes
        h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Clientes</h3></div>';
        if (!ov.porCliente.length) {
          h += '<div class="vazio">Nenhum cliente cadastrado. Crie na area Clientes.</div>';
        } else {
          h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
               "<th>Cliente</th><th>Status</th><th>Conta</th><th class=\"num\">Investimento</th><th class=\"num\">Leads</th><th class=\"num\">CPL</th><th class=\"num\">Alertas</th></tr></thead><tbody>";
          ov.porCliente.forEach(function (c) {
            var m = c.metrics;
            var cpl = m && m.costPerLead != null ? fmtMoeda(m.costPerLead) : "—";
            var alertas = m ? (c.campanhasComAlerta > 0 ? '<span class="ct-badge alerta">' + c.campanhasComAlerta + "</span>" : '<span class="ct-badge on">ok</span>') : "—";
            h += '<tr class="clicavel" data-id="' + esc(c.id) + '"><td class="nome-obj">' + esc(c.nome) + "</td><td>" + badgeStatus(c.status) + "</td>" +
                 "<td>" + (c.contaConectada ? '<span class="ct-badge on">conectada</span>' : '<span class="ct-badge off">pendente</span>') + "</td>" +
                 '<td class="num">' + (m ? fmtMoeda(m.spend) : "—") + '</td><td class="num">' + (m ? fmtNum(m.leads) : "—") + "</td>" +
                 '<td class="num">' + cpl + '</td><td class="num">' + alertas + "</td></tr>";
          });
          h += "</tbody></table></div>";
        }
        h += "</div>";

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
        rootGestor.querySelectorAll("tr.clicavel[data-id]").forEach(function (tr) {
          tr.addEventListener("click", function () {
            estado.gestor.view = "cliente";
            estado.gestor.clienteId = tr.getAttribute("data-id");
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

  function seletorPeriodo() {
    return '<span class="ct-periodo">' + [7, 14, 30].map(function (p) {
      return '<button data-periodo="' + p + '"' + (estado.gestor.periodo === p ? ' class="ativo"' : "") + ">" + p + "d</button>";
    }).join("") + "</span>";
  }

  function montarPaginaCliente(cliente) {
    var moeda = cliente.moeda || "BRL";
    var h =
      '<button class="ct-voltar" data-act="voltar">&lsaquo; Voltar para a visao geral</button>' +
      '<div class="filtros" style="margin:0 0 24px;align-items:center;">' +
        '<h2 style="font-size:20px;font-weight:700;">' + esc(cliente.nome) + "</h2>" + badgeStatus(cliente.status) +
        (cliente.adAccountId ? '<span class="ct-badge on">' + esc(cliente.adAccountId) + "</span>" : '<span class="ct-badge off">conta pendente</span>') +
        '<div class="contador">' + seletorPeriodo() + "</div>" +
      "</div>" +
      '<div class="ct-secao" id="ct-resumo">' + spinner("Carregando resumo...") + "</div>" +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Campanhas</h3></div><div id="ct-campanhas">' + spinner("Carregando campanhas...") + "</div></div>" +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Diagnostico IA</h3>' +
        '<span class="contador"><button class="btn-toolbar" data-act="diagnosticar">Gerar diagnostico (' + estado.gestor.periodo + "d)</button></span></div>" +
        '<div id="ct-diagnostico"><div class="ct-msg">Clique em "Gerar diagnostico" para analisar a conta no periodo selecionado.</div></div></div>' +
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
      '<div class="painel"><div class="painel-topo"><h3>Historico de otimizacoes</h3></div><div id="ct-historico">' + spinner("Carregando historico...") + "</div></div>";

    rootGestor.innerHTML = h;

    rootGestor.querySelector('[data-act="voltar"]').addEventListener("click", renderGestorDash);
    rootGestor.querySelectorAll("[data-periodo]").forEach(function (b) {
      b.addEventListener("click", function () {
        estado.gestor.periodo = Number(b.getAttribute("data-periodo"));
        montarPaginaCliente(cliente);
      });
    });
    rootGestor.querySelector('[data-act="diagnosticar"]').addEventListener("click", function () { gerarDiagnostico(cliente); });
    var cmdInput = document.getElementById("ct-cmd-input");
    rootGestor.querySelector('[data-act="comando"]').addEventListener("click", function () { enviarComando(cliente); });
    cmdInput.addEventListener("keydown", function (e) { if (e.key === "Enter") enviarComando(cliente); });
    rootGestor.querySelectorAll("[data-exemplo]").forEach(function (t) {
      t.addEventListener("click", function () { cmdInput.value = t.getAttribute("data-exemplo"); cmdInput.focus(); });
    });

    carregarResumo(cliente, moeda);
    carregarCampanhas(cliente, moeda);
    carregarHistorico(cliente);
  }

  function erroBloco(err, aoTentar) {
    if (err.offline) return htmlOffline();
    return '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
  }

  function carregarResumo(cliente, moeda) {
    var alvo = document.getElementById("ct-resumo");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/summary?period=" + estado.gestor.periodo)
      .then(function (r) {
        var m = r.metrics;
        var stats = [
          { num: fmtMoeda(m.spend, moeda), lab: "Investimento" },
          { num: fmtNum(m.leads), lab: "Leads" },
          { num: m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—", lab: "CPL" },
          { num: fmtDec(m.ctr, 2) + "%", lab: "CTR" },
          { num: fmtMoeda(m.cpm, moeda), lab: "CPM" },
          { num: fmtDec(m.frequency, 2), lab: "Frequencia" },
          { num: fmtNum(r.campanhasAtivas), lab: "Campanhas ativas", sub: r.campanhasTotal + " no total" },
          { num: fmtNum(r.campanhasComAlerta), lab: "Com alerta" }
        ];
        alvo.innerHTML = '<div class="stat-grid">' + stats.map(function (s) {
          return '<div class="stat"><div class="num">' + s.num + '</div><div class="lab">' + s.lab + "</div>" + (s.sub ? '<div class="ct-stat-sub">' + s.sub + "</div>" : "") + "</div>";
        }).join("") + "</div>";
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarResumo(cliente, moeda); }); });
  }

  function carregarCampanhas(cliente, moeda) {
    var alvo = document.getElementById("ct-campanhas");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/campaigns?period=" + estado.gestor.periodo)
      .then(function (r) {
        if (!r.campanhas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma campanha encontrada na conta.</div>'; return; }
        var h = '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
                "<th>Campanha</th><th>Status</th><th class=\"num\">Orcamento/dia</th><th class=\"num\">Gasto</th><th class=\"num\">Leads</th>" +
                "<th class=\"num\">CPL</th><th class=\"num\">CTR</th><th class=\"num\">CPM</th><th class=\"num\">Freq.</th><th>Alertas</th></tr></thead><tbody>";
        r.campanhas.forEach(function (c) {
          var m = c.metrics || {};
          var st = (c.effectiveStatus || c.status) === "ACTIVE"
            ? '<span class="ct-badge on">ativa</span>'
            : '<span class="ct-badge neutro">' + esc((c.effectiveStatus || c.status || "").toLowerCase()) + "</span>";
          var alertas = (c.alertas || []).map(function (a) { return '<span class="ct-badge alerta" title="' + esc(a) + '">' + esc(a) + "</span>"; }).join(" ") || "";
          h += '<tr><td class="nome-obj">' + esc(c.name) + "</td><td>" + st + "</td>" +
               '<td class="num">' + (c.dailyBudget != null ? fmtMoeda(c.dailyBudget, moeda) : "—") + "</td>" +
               '<td class="num">' + fmtMoeda(m.spend, moeda) + '</td><td class="num">' + fmtNum(m.leads) + "</td>" +
               '<td class="num">' + (m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—") + "</td>" +
               '<td class="num">' + fmtDec(m.ctr, 2) + '%</td><td class="num">' + fmtMoeda(m.cpm, moeda) + "</td>" +
               '<td class="num">' + fmtDec(m.frequency, 2) + '</td><td style="max-width:240px;">' + alertas + "</td></tr>";
        });
        alvo.innerHTML = h + "</tbody></table></div>";
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarCampanhas(cliente, moeda); }); });
  }

  function carregarHistorico(cliente) {
    var alvo = document.getElementById("ct-historico");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/logs")
      .then(function (r) {
        if (!r.records.length) { alvo.innerHTML = '<div class="vazio">Nenhuma otimizacao registrada para este cliente.</div>'; return; }
        var h = '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
                "<th>Quando</th><th>Modo</th><th>Comando</th><th class=\"num\">Mudancas propostas</th><th class=\"num\">Aplicadas</th><th></th></tr></thead><tbody>";
        r.records.forEach(function (rec) {
          var aplicadas = rec.executedResults.filter(function (e) { return e.status === "success"; }).length;
          h += "<tr><td>" + fmtData(rec.timestamp) + '</td><td><span class="ct-badge neutro">' + esc(rec.mode) + "</span></td>" +
               '<td class="ct-hist-cmd" title="' + esc(rec.command) + '">' + esc(rec.command) + "</td>" +
               '<td class="num">' + fmtNum(rec.proposedChanges.length) + '</td><td class="num">' + fmtNum(aplicadas) + "</td>" +
               "<td>" + (rec.rolledBack ? '<span class="ct-badge off">revertida</span>' : "") + "</td></tr>";
        });
        alvo.innerHTML = h + "</tbody></table></div>";
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarHistorico(cliente); }); });
  }

  function ligarRetry(alvo, fn) {
    var btn = alvo.querySelector('[data-act="retry"]');
    if (btn) btn.addEventListener("click", fn);
  }

  // ---------- Diagnostico IA ----------
  function gerarDiagnostico(cliente) {
    var alvo = document.getElementById("ct-diagnostico");
    alvo.innerHTML = spinner("Analisando a conta (" + estado.gestor.periodo + " dias)...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/diagnose", { method: "POST", body: { period: estado.gestor.periodo } })
      .then(function (r) {
        var d = r.diagnosis;
        var m = d.account;
        var moeda = cliente.moeda || "BRL";
        function lista(itens, vazio) {
          if (!itens || !itens.length) return '<span class="nada">' + vazio + "</span>";
          return "<ul>" + itens.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
        }
        var recomendacoes = (d.plan || []).concat(d.flags || []).map(function (c) {
          return c.entityName + " — " + c.reason + (c.expectedImpact ? " (" + c.expectedImpact + ")" : "");
        });
        var riscos = (r.safety && r.safety.warnings) || [];
        var h =
          '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:16px;">' +
            '<div class="stat-grid" style="margin:0;">' +
              '<div class="stat"><div class="num">' + fmtMoeda(m.spend, moeda) + '</div><div class="lab">Investimento no periodo</div></div>' +
              '<div class="stat"><div class="num">' + fmtNum(m.leads) + '</div><div class="lab">Leads</div></div>' +
              '<div class="stat"><div class="num">' + (m.costPerLead != null ? fmtMoeda(m.costPerLead, moeda) : "—") + '</div><div class="lab">CPL</div></div>' +
              '<div class="stat"><div class="num">' + fmtNum(d.activeCampaigns) + '</div><div class="lab">Campanhas ativas</div></div>' +
            "</div>" +
            '<div class="ct-diag-grid">' +
              '<div class="ct-diag-bloco bom"><h4>O que esta funcionando</h4>' + lista(d.workingWell, "Nada de destaque no periodo.") + "</div>" +
              '<div class="ct-diag-bloco ruim"><h4>Problemas encontrados</h4>' + lista(d.problems, "Nenhum problema encontrado.") + "</div>" +
              '<div class="ct-diag-bloco plano"><h4>Recomendacoes e plano</h4>' + lista(recomendacoes, "Nenhuma acao proposta.") + "</div>" +
              '<div class="ct-diag-bloco risco"><h4>Riscos e avisos</h4>' + lista(riscos, "Nenhum risco sinalizado.") + "</div>" +
            "</div>" +
            ((d.plan || []).length ? '<div class="ct-nota" style="margin:0;">Para aplicar essas acoes, use o campo de comando abaixo (ex.: "faca uma otimizacao geral") — o plano sempre passa por DRY RUN e confirmacao antes de executar.</div>' : "") +
          "</div>";
        alvo.innerHTML = h;
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { gerarDiagnostico(cliente); }); });
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
      carregarHistorico(cliente);
      alvo.innerHTML = '<div class="ct-resultado ok">Historico atualizado na secao abaixo.</div>';
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
        carregarHistorico(cliente);
        carregarCampanhas(cliente, cliente.moeda || "BRL");
        carregarResumo(cliente, cliente.moeda || "BRL");
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

  function renderDashCentral() {
    var alvo = document.getElementById("dash-central");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando dados da central...");
    Promise.all([api("/api/paid-ads/overview"), api("/api/paid-ads/concorrentes")])
      .then(function (r) {
        var ov = r[0];
        var concs = r[1].concorrentes || [];
        var semDados = !ov.dadosDisponiveis;

        var stats = [
          { num: String(ov.clientesAtivos), lab: "Clientes ativos", sub: ov.clientesTotal + " cadastrado(s)" },
          { num: semDados ? "—" : fmtMoeda(ov.investimentoTotal), lab: "Investimento (7d)" },
          { num: semDados ? "—" : fmtNum(ov.leadsTotal), lab: "Leads (7d)" },
          { num: semDados || ov.cplMedio == null ? "—" : fmtMoeda(ov.cplMedio), lab: "CPL medio (7d)" },
          { num: semDados ? "—" : fmtNum(ov.campanhasAtivas), lab: "Campanhas ativas" },
          { num: semDados ? "—" : fmtNum(ov.campanhasComAlerta), lab: "Campanhas com alerta" }
        ];

        var pendencias = [];
        if (!ov.metaConectada) pendencias.push({ area: "gestor", texto: "Meta API sem token no backend", meta: "Preencha META_ACCESS_TOKEN no .env do Gestor de Trafego" });
        var semConta = (ov.porCliente || []).filter(function (c) { return !c.contaConectada; }).length;
        if (semConta > 0) pendencias.push({ area: "clientes", texto: semConta + " cliente(s) sem conta de anuncio conectada", meta: "Conecte o adAccountId na area Clientes" });
        var naoAssoc = concs.filter(function (c) { return !c.clienteId; }).length;
        if (naoAssoc > 0) pendencias.push({ area: "clientes", texto: naoAssoc + " concorrente(s) do Radar sem cliente associado", meta: "Associe na area Clientes" });
        if (!ov.clientesTotal) pendencias.push({ area: "clientes", texto: "Nenhum cliente cadastrado ainda", meta: "Crie o primeiro na area Clientes" });

        var h = '<div class="stat-grid">' + stats.map(function (s) {
          return '<div class="stat"><div class="num">' + s.num + '</div><div class="lab">' + s.lab + "</div>" + (s.sub ? '<div class="ct-stat-sub">' + s.sub + "</div>" : "") + "</div>";
        }).join("") + "</div>";

        if (semDados) {
          h += '<div class="ct-nota">Resumo de trafego indisponivel: ' +
               (ov.metaConectada ? "nenhum cliente com conta de anuncio conectada." : "Meta API sem token no backend.") +
               " Os numeros aparecem quando houver credencial e conta conectada.</div>";
        }

        h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Pendencias</h3>' +
             (pendencias.length ? '<span class="ct-badge alerta">' + pendencias.length + "</span>" : "") + "</div>";
        if (!pendencias.length) {
          h += '<div class="alta-row" style="cursor:default;"><span class="dot" style="background:#15803D;"></span><div><div class="nome">Tudo em dia</div><div class="meta">Nenhuma pendencia aberta na central.</div></div></div>';
        } else {
          h += pendencias.map(function (p) {
            return '<div class="alta-row" data-area-link="' + esc(p.area) + '"><span class="dot" style="background:#EA580C;"></span>' +
                   '<div><div class="nome">' + esc(p.texto) + '</div><div class="meta">' + esc(p.meta) + "</div></div>" +
                   '<span class="seta">&rsaquo;</span></div>';
          }).join("");
        }
        h += "</div>";

        alvo.innerHTML = h;
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
  // Integracao com a navegacao do app
  // ---------------------------------------------------------------------
  window.PulsarCentral = {
    onArea: function (id) {
      if (id === "dashboard") renderDashCentral();
      if (id === "clientes") carregarClientes();
      if (id === "gestor") carregarGestor();
    }
  };

  // O app abre no Dashboard antes deste arquivo carregar: renderiza o bloco
  // consolidado na primeira carga tambem.
  renderDashCentral();
})();
