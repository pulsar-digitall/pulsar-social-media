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
      conta: "", // filtro multi-conta ("" = todas as contas do cliente)
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

  // ---------------------------------------------------------------------
  // Modal proprio (substitui window.alert/window.confirm nativos do
  // navegador). Mesma linguagem visual do overlay de chave (#ct-chave-overlay):
  // fundo com blur + caixa no tema. API baseada em Promise:
  //   pulsarAlert("mensagem") -> Promise<void>
  //   pulsarConfirm("mensagem") -> Promise<boolean>
  // ---------------------------------------------------------------------
  var pulsarModalEl = null;
  function pulsarModalGarantir() {
    if (pulsarModalEl) return pulsarModalEl;
    var el = document.createElement("div");
    el.className = "pulsar-modal-overlay";
    el.style.display = "none";
    el.innerHTML =
      '<div class="pulsar-modal-caixa">' +
        '<p class="pulsar-modal-msg"></p>' +
        '<div class="pulsar-modal-acoes">' +
          '<button type="button" class="ct-btn-sec pulsar-modal-cancelar" style="display:none;">Cancelar</button>' +
          '<button type="button" class="btn-toolbar pulsar-modal-ok">OK</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(el);
    pulsarModalEl = el;
    return el;
  }
  function pulsarMostrarModal(mensagem, opcoes) {
    opcoes = opcoes || {};
    var el = pulsarModalGarantir();
    var msgEl = el.querySelector(".pulsar-modal-msg");
    var okBtn = el.querySelector(".pulsar-modal-ok");
    var cancelBtn = el.querySelector(".pulsar-modal-cancelar");
    var ehConfirm = opcoes.tipo === "confirm";
    msgEl.textContent = mensagem;
    okBtn.textContent = opcoes.textoOk || "OK";
    cancelBtn.style.display = ehConfirm ? "inline-flex" : "none";
    cancelBtn.textContent = opcoes.textoCancelar || "Cancelar";
    el.style.display = "flex";
    return new Promise(function (resolve) {
      function limpar() {
        el.style.display = "none";
        okBtn.removeEventListener("click", aoOk);
        cancelBtn.removeEventListener("click", aoCancelar);
        el.removeEventListener("mousedown", aoFundo);
        document.removeEventListener("keydown", aoTecla);
      }
      function aoOk() { limpar(); resolve(true); }
      // Fechar sem confirmar (fundo/Esc): em alert equivale a "ok" (so tem 1 saida);
      // em confirm equivale a cancelar.
      function aoCancelar() { limpar(); resolve(!ehConfirm); }
      function aoFundo(e) { if (e.target === el) aoCancelar(); }
      function aoTecla(e) {
        if (e.key === "Escape") { e.preventDefault(); aoCancelar(); }
        else if (e.key === "Enter") { e.preventDefault(); aoOk(); }
      }
      okBtn.addEventListener("click", aoOk);
      cancelBtn.addEventListener("click", aoCancelar);
      el.addEventListener("mousedown", aoFundo);
      document.addEventListener("keydown", aoTecla);
      setTimeout(function () { okBtn.focus(); }, 0);
    });
  }
  function pulsarAlert(mensagem) {
    return pulsarMostrarModal(mensagem, { tipo: "alert" });
  }
  function pulsarConfirm(mensagem, textoOk, textoCancelar) {
    return pulsarMostrarModal(mensagem, { tipo: "confirm", textoOk: textoOk, textoCancelar: textoCancelar });
  }
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

  // Chave de acesso da API (Etapa 7): vive SO neste navegador (localStorage).
  // O backend local sem CENTRAL_API_KEY nunca pede chave.
  function chaveApi() {
    try { return localStorage.getItem("pulsar_api_key") || ""; } catch (e) { return ""; }
  }

  function pedirChaveApi(mensagem) {
    if (document.getElementById("ct-chave-overlay")) return;
    var div = document.createElement("div");
    div.id = "ct-chave-overlay";
    div.innerHTML =
      '<div class="caixa">' +
        "<h3>Chave da Central</h3>" +
        '<p>' + esc(mensagem || "Este backend exige a chave de acesso da Central (CENTRAL_API_KEY). Ela fica salva so neste navegador.") + "</p>" +
        '<input type="password" id="ct-chave-input" placeholder="Cole a chave aqui" autocomplete="off" />' +
        '<div class="acoes"><button class="btn-toolbar" id="ct-chave-salvar">Entrar</button></div>' +
        '<div class="ct-erro-form" id="ct-chave-erro"></div>' +
      "</div>";
    document.body.appendChild(div);
    var input = div.querySelector("#ct-chave-input");
    function salvar() {
      var valor = input.value.trim();
      if (!valor) { div.querySelector("#ct-chave-erro").textContent = "Cole a chave para entrar."; return; }
      try { localStorage.setItem("pulsar_api_key", valor); } catch (e) {}
      window.location.reload();
    }
    div.querySelector("#ct-chave-salvar").addEventListener("click", salvar);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") salvar(); });
    input.focus();
  }

  // fetch com timeout; erros de rede viram { offline: true }
  function api(caminho, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 60000) : null;
    var headers = { "Content-Type": "application/json" };
    var chave = chaveApi();
    if (chave) headers["X-Api-Key"] = chave;
    var init = {
      method: opts.method || "GET",
      headers: headers,
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
            if (resp.status === 401 && dados && dados.chaveNecessaria) {
              try { localStorage.removeItem("pulsar_api_key"); } catch (e) {}
              pedirChaveApi(chave ? "Chave invalida ou trocada no backend. Cole a chave atual da Central." : null);
            }
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

    // Radar: concorrentes da PROPRIA PULSAR no mercado (area independente;
    // sem vinculo com cliente — modelo antigo de associacao foi descontinuado).
    h += '<div class="painel"><div class="painel-topo"><h3>Concorrentes do Radar</h3>' +
         '<span class="contador" style="font-size:12px;color:var(--text-3);">concorrentes da Pulsar monitorados no Radar (independente dos clientes)</span></div>';
    if (!estado.concorrentes.length) {
      h += '<div class="vazio">Nenhum concorrente no catalogo ainda. Rode o scraper do Radar para coletar.</div>';
    } else {
      h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr>' +
           "<th>Concorrente</th><th>Page ID</th><th class=\"num\">Anuncios coletados</th></tr></thead><tbody>";
      estado.concorrentes.forEach(function (r) {
        h += "<tr><td class=\"nome-obj\">" + esc(r.nome) + "</td><td style=\"color:var(--text-3);font-size:12.5px;\">" + esc(r.pageId) + "</td>" +
             '<td class="num">' + fmtNum(r.totalAnuncios) + "</td></tr>";
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
    return (
      '<div class="ct-form" id="ct-form-cliente">' +
        "<h3>" + (editando ? "Editar cliente" : "Novo cliente") + "</h3>" +
        '<div class="ct-form-grid">' +
          campo("Nome *", "nome", c.nome) +
          '<div class="campo"><label>Status</label><div class="select-wrap"><select name="status">' +
            ["ativo", "pausado", "onboarding"].map(function (s) { return '<option value="' + s + '"' + (c.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") +
          "</select></div></div>" +
          campo("Conta Meta Ads", "adAccountId", c.adAccountId, "text", "act_123456789") +
          campo("Contas adicionais (multi-conta, separadas por virgula)", "adAccountIds", (c.adAccountIds || []).join(", "), "text", "act_111, act_222") +
          campo("Google Ads Customer ID", "googleAdsCustomerId", c.googleAdsCustomerId, "text", "1234567890") +
          campo("Page ID (Facebook)", "pageId", c.pageId) +
          '<div class="campo"><label>Instagram ID (visitas ao perfil)</label>' +
            '<div style="display:flex;gap:6px;"><input type="text" name="instagramId" value="' + esc(c.instagramId || "") + '" placeholder="ID da conta IG business" style="flex:1;" />' +
            (editando ? '<button type="button" class="ct-btn-sec" data-act="detectar-ig" style="white-space:nowrap;">Detectar</button>' : "") + "</div>" +
            '<div id="ig-detect" style="font-size:12px;color:var(--text-3);margin-top:4px;"></div></div>' +
          campo("Pixel ID", "pixelId", c.pixelId) +
          campo("Moeda", "moeda", c.moeda || "BRL") +
          campo("Timezone", "timezone", c.timezone || "America/Sao_Paulo") +
        "</div>" +
        '<div class="secao">Relatorio do cliente</div>' +
        '<div class="ct-form-grid">' +
          '<div class="campo"><label>Tipo de relatorio</label><div class="select-wrap"><select name="tipoRelatorio">' +
            [["leadgen", "Leadgen (leads + CPL)"], ["ecommerce", "E-commerce (conversoes + ROAS)"], ["branding", "Branding (so metricas base)"]].map(function (t) {
              return '<option value="' + t[0] + '"' + ((c.tipoRelatorio || "leadgen") === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
            }).join("") +
          "</select></div></div>" +
          campo("Nome da conversao (e-commerce)", "nomeConversao", c.nomeConversao, "text", "Ex.: Anotaai, Compras") +
          campo("Link do Looker Studio (opcional)", "linkLooker", c.linkLooker, "text", "https://lookerstudio.google.com/...") +
        "</div>" +
        '<div class="secao">Metas de performance</div>' +
        '<div class="ct-form-grid">' +
          campo("CPL maximo (R$)", "maxCpl", m.maxCpl, "number") +
          campo("CTR minimo (%)", "minCtr", m.minCtr, "number") +
          campo("Frequencia maxima", "maxFrequency", m.maxFrequency, "number") +
          campo("CPM maximo (R$)", "maxCpm", m.maxCpm, "number") +
          campo("Leads minimos", "minLeads", m.minLeads, "number") +
        "</div>" +
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
      if (act === "detectar-ig") el.addEventListener("click", detectarInstagram);
    });
  }

  // Detecta as contas IG vinculadas a conta de anuncio do cliente em edicao.
  function detectarInstagram() {
    var alvo = document.getElementById("ig-detect");
    var id = estado.formEditandoId;
    if (!id) { alvo.textContent = "Salve o cliente primeiro para detectar."; return; }
    alvo.textContent = "Buscando contas Instagram vinculadas...";
    api("/api/paid-ads/clients/" + encodeURIComponent(id) + "/instagram-contas")
      .then(function (r) {
        var contas = r.contas || [];
        if (!contas.length) { alvo.textContent = r.aviso || "Nenhuma conta Instagram vinculada a esta conta de anuncio."; return; }
        var input = document.querySelector('#ct-form-cliente [name="instagramId"]');
        alvo.innerHTML = "Clique para usar: " + contas.map(function (c) {
          return '<button type="button" class="ct-link" data-ig="' + esc(c.id) + '">@' + esc(c.username) + "</button>";
        }).join(" · ");
        alvo.querySelectorAll("[data-ig]").forEach(function (b) {
          b.addEventListener("click", function () { input.value = b.getAttribute("data-ig"); alvo.innerHTML = "Selecionado: @" + b.textContent.replace("@", "") + " (" + b.getAttribute("data-ig") + "). Salve para aplicar."; });
        });
      })
      .catch(function (err) { alvo.textContent = "Erro: " + err.message; });
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
    // Associacao concorrente<->cliente foi descontinuada (Radar e independente);
    // o campo e preservado como esta para nao quebrar dados antigos.
    var editandoAtual = estado.formEditandoId ? buscarCliente(estado.formEditandoId) : null;
    var concs = (editandoAtual && editandoAtual.concorrentesMonitorados) || [];
    var payload = {
      id: estado.formEditandoId || undefined,
      nome: v("nome"),
      status: v("status") || "ativo",
      adAccountId: v("adAccountId"),
      adAccountIds: v("adAccountIds").split(",").map(function (a) { return a.trim(); }).filter(Boolean),
      tipoRelatorio: v("tipoRelatorio") || "leadgen",
      nomeConversao: v("nomeConversao"),
      linkLooker: v("linkLooker"),
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
    estado.gestor.conta = "";
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
               "quando o META_ACCESS_TOKEN for configurado no .env do backend.</div>";
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
    // Multi-conta: filtro por conta especifica (vazio = todas somadas).
    if (g.conta) q += "&conta=" + encodeURIComponent(g.conta);
    return extra ? q + "&" + extra : q;
  }

  // Select de conta na pagina do cliente (so aparece com contas adicionais).
  function seletorConta(cliente) {
    var contas = [cliente.adAccountId].concat(cliente.adAccountIds || []).filter(Boolean);
    if (contas.length < 2) return "";
    var g = estado.gestor;
    return '<div class="select-wrap" style="margin-left:10px;"><select id="ct-sel-conta">' +
      '<option value="">Todas as contas (' + contas.length + ')</option>' +
      contas.map(function (a) { return '<option value="' + esc(a) + '"' + (g.conta === a ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("") +
      "</select></div>";
  }

  function ligarSeletorConta(recarregar) {
    var sel = document.getElementById("ct-sel-conta");
    if (sel) sel.addEventListener("change", function () { estado.gestor.conta = this.value; recarregar(); });
  }

  function seletorPeriodo() {
    var g = estado.gestor;
    var h = '<span class="ct-periodo">' + [7, 14, 30].map(function (p) {
      return '<button data-periodo="' + p + '"' + (g.periodo === p ? ' class="ativo"' : "") + ">" + p + "d</button>";
    }).join("") +
    '<button data-periodo="custom"' + (g.periodo === "custom" ? ' class="ativo"' : "") + ">Personalizado</button></span>";
    if (g.periodo === "custom") {
      h += '<span class="ct-datas">' + campoData("de", g.desde) +
           '<span class="ct-cal-sep">ate</span>' + campoData("ate", g.ate) +
           '<button class="btn-sm salvar" data-act="aplicar-datas">Aplicar</button></span>';
    }
    return h;
  }

  // ---------- Calendario proprio (tema claro/escuro via tokens) ----------
  var SVG_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  function fmtIsoBr(iso) {
    var p = String(iso || "").split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "Selecionar";
  }

  function campoData(chave, iso) {
    return '<span class="ct-cal-field">' +
      '<input type="hidden" id="ct-data-' + chave + '" value="' + esc(iso || "") + '" />' +
      '<button type="button" class="ct-cal-trigger" data-cal-trigger="' + chave + '">' +
        SVG_CAL + '<span data-cal-label="' + chave + '">' + esc(fmtIsoBr(iso)) + "</span></button>" +
      '<div class="ct-cal-pop" data-cal-pop="' + chave + '" hidden></div></span>';
  }

  function criarCalendario(popEl, iso, onPick) {
    var meses = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    var dow = ["D", "S", "T", "Q", "Q", "S", "S"];
    function parseIso(s) { var p = String(s || "").split("-"); return p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) : null; }
    function toIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    function mesmoDia(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    var sel = parseIso(iso);
    var vista = new Date((sel || new Date()).getFullYear(), (sel || new Date()).getMonth(), 1);
    var hoje = new Date();
    function desenhar() {
      var ano = vista.getFullYear(), mes = vista.getMonth();
      var inicioSemana = new Date(ano, mes, 1).getDay();
      var totalDias = new Date(ano, mes + 1, 0).getDate();
      var h = '<div class="ct-cal-topo">' +
        '<button type="button" class="ct-cal-nav" data-nav="-1" aria-label="Mes anterior">&#8249;</button>' +
        '<span class="ct-cal-mes">' + meses[mes] + " " + ano + "</span>" +
        '<button type="button" class="ct-cal-nav" data-nav="1" aria-label="Proximo mes">&#8250;</button></div>';
      h += '<div class="ct-cal-grade ct-cal-head">' + dow.map(function (d) { return '<span class="ct-cal-dow">' + d + "</span>"; }).join("") + "</div>";
      h += '<div class="ct-cal-grade">';
      for (var i = 0; i < inicioSemana; i++) h += '<span class="ct-cal-dia vazio"></span>';
      for (var d = 1; d <= totalDias; d++) {
        var data = new Date(ano, mes, d);
        var cls = "ct-cal-dia" + (mesmoDia(data, sel) ? " sel" : "") + (mesmoDia(data, hoje) ? " hoje" : "");
        h += '<button type="button" class="' + cls + '" data-dia="' + toIso(data) + '">' + d + "</button>";
      }
      h += "</div>";
      h += '<div class="ct-cal-rodape"><button type="button" class="ct-cal-link" data-hoje="1">Hoje</button></div>';
      popEl.innerHTML = h;
      popEl.querySelectorAll("[data-nav]").forEach(function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); vista.setMonth(vista.getMonth() + Number(b.getAttribute("data-nav"))); desenhar(); });
      });
      popEl.querySelectorAll("[data-dia]").forEach(function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); onPick(b.getAttribute("data-dia")); });
      });
      popEl.querySelector("[data-hoje]").addEventListener("click", function (e) { e.stopPropagation(); onPick(toIso(new Date())); });
    }
    desenhar();
  }

  var calFechamentoGlobal = false;
  function ligarCalendarios(root) {
    root.querySelectorAll("[data-cal-trigger]").forEach(function (trigger) {
      var chave = trigger.getAttribute("data-cal-trigger");
      var pop = root.querySelector('[data-cal-pop="' + chave + '"]');
      var hidden = root.querySelector("#ct-data-" + chave);
      var label = root.querySelector('[data-cal-label="' + chave + '"]');
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var estavaAberto = !pop.hidden;
        root.querySelectorAll(".ct-cal-pop").forEach(function (p) { p.hidden = true; p.innerHTML = ""; });
        if (estavaAberto) return;
        pop.hidden = false;
        criarCalendario(pop, hidden.value, function (iso) {
          hidden.value = iso;
          label.textContent = fmtIsoBr(iso);
          pop.hidden = true;
          pop.innerHTML = "";
        });
      });
    });
    if (!calFechamentoGlobal) {
      calFechamentoGlobal = true;
      document.addEventListener("click", function (e) {
        if (e.target.closest(".ct-cal-pop") || e.target.closest("[data-cal-trigger]")) return;
        document.querySelectorAll(".ct-cal-pop").forEach(function (p) { if (!p.hidden) { p.hidden = true; p.innerHTML = ""; } });
      });
    }
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
    tarefas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  };

  function kpiHtml(o) {
    return '<div class="stat"' + (o.id ? ' id="' + o.id + '" style="cursor:pointer;"' : "") + ">" +
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
          seletorConta(cliente) +
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
      if (!de || !ate || de > ate) { pulsarAlert("Escolha um intervalo valido (data inicial ate data final)."); return; }
      estado.gestor.desde = de;
      estado.gestor.ate = ate;
      montarPaginaCliente(cliente);
    });
    ligarCalendarios(rootGestor);
    ligarSeletorConta(function () { montarPaginaCliente(cliente); });
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
      try { document.execCommand("copy"); feito(); } catch (e) { pulsarAlert("Nao foi possivel copiar automaticamente. Copie manualmente."); }
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

  // Transparencia da regra de calculo: quais campanhas entraram no CPL e no
  // custo por conversao (nunca a media geral da conta).
  function campanhasConsideradasHtml(cc, tipoRelatorio) {
    if (!cc) return "";
    function bloco(rotulo, lista) {
      if (!lista || !lista.length) return '<div class="ct-cache-linha">' + rotulo + ": nenhuma campanha do objetivo no periodo.</div>";
      return '<div class="ct-cache-linha">' + rotulo + " (" + lista.length + "): " +
        lista.map(function (c) { return esc(c.nome); }).join(" · ") + "</div>";
    }
    var h = '<div style="margin-top:12px;">';
    if (tipoRelatorio !== "branding") {
      if (tipoRelatorio === "ecommerce") h += bloco("Campanhas consideradas no custo por conversao", cc.vendas);
      else h += bloco("Campanhas consideradas no CPL", cc.leads);
    }
    h += "</div>";
    return h;
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
          h += campanhasConsideradasHtml(r.campanhasConsideradas, r.tipoRelatorio);
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
      pulsarConfirm("Revogar o link publico? Quem tiver o link perdera o acesso na hora.").then(function (ok) {
        if (ok) acaoLinkPublico(cliente, "revogar");
      });
    });
  }

  function acaoLinkPublico(cliente, acao) {
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/public-link", { method: "POST", body: { acao: acao } })
      .then(function (r) { renderLinkPublico(cliente, acao === "revogar" ? null : r.link); })
      .catch(function (err) { pulsarAlert("Erro: " + err.message); });
  }

  // ---------- Historico de relatorios ----------
  function carregarHistoricoRelatorios(cliente) {
    var alvo = document.getElementById("ct-rel-historico");
    if (!alvo) return;
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/relatorios")
      .then(function (r) {
        var titulo = '<div class="secao" style="font-size:10.5px;text-transform:uppercase;letter-spacing:1.4px;color:var(--text-3);margin-bottom:10px;">Historico de relatorios</div>';
        if (!r.relatorios.length) {
          alvo.innerHTML = titulo + '<div style="font-size:13px;color:var(--text-3);">Nenhum relatorio gerado ainda.</div>';
          return;
        }
        var LIMITE = 4;
        var expandido = false;
        function render() {
          var lista = expandido ? r.relatorios : r.relatorios.slice(0, LIMITE);
          var h = titulo;
          h += '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr><th>Quando</th><th>Tipo</th><th>Periodo</th><th></th></tr></thead><tbody>';
          lista.forEach(function (rel, i) {
            var acao = rel.tipo === "pdf"
              ? '<a class="btn-sm" style="text-decoration:none;display:inline-block;" href="' + esc(API + "/api/paid-ads/relatorios/" + rel.id + "/pdf") + '" target="_blank" rel="noopener">Baixar</a>'
              : '<button class="btn-sm salvar" data-rel-copiar="' + i + '">Copiar</button>';
            h += "<tr><td>" + fmtData(rel.timestamp) + '</td><td><span class="ct-badge ' + (rel.tipo === "pdf" ? "neutro" : "onboarding") + '">' + esc(rel.tipo) + "</span></td>" +
                 "<td>" + esc(rel.range.label) + '</td><td class="num">' + acao + "</td></tr>";
          });
          h += "</tbody></table></div>";
          if (r.relatorios.length > LIMITE) {
            h += '<div style="text-align:center;margin-top:12px;"><button class="btn-sm" data-rel-toggle>' +
                 (expandido ? "Mostrar menos" : "Ver mais " + (r.relatorios.length - LIMITE) + " relatorios") + "</button></div>";
          }
          alvo.innerHTML = h;
          alvo.querySelectorAll("[data-rel-copiar]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var rel = r.relatorios[Number(btn.getAttribute("data-rel-copiar"))];
              copiarTexto(rel.conteudo || "", btn);
            });
          });
          var btnToggle = alvo.querySelector("[data-rel-toggle]");
          if (btnToggle) btnToggle.addEventListener("click", function () { expandido = !expandido; render(); });
        }
        render();
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

  // Campanha encerrada = fim de veiculacao (stop_time) no passado.
  function campanhaEncerrada(e) {
    if (!e.endTime) return false;
    var fim = new Date(e.endTime).getTime();
    return !isNaN(fim) && fim < Date.now();
  }

  function statusHtml(e) {
    var st = String(e.effectiveStatus || e.status || "");
    if (st === "ACTIVE") return '<span class="ct-badge on">ativa</span>';
    if (campanhaEncerrada(e)) return '<span class="ct-badge neutro">encerrada</span>';
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

  // Estado da tabela de campanhas (filtros/previa aplicados no cliente).
  var campData = null; // { campanhas, moeda, cliente, cache, mock }
  var campFiltro = { status: "", soVeiculacao: true, mostrarTodas: false };
  var CAMP_PREVIA = 10;

  function carregarCampanhas(cliente, moeda, refresh) {
    var alvo = document.getElementById("ct-campanhas");
    if (!alvo) return;
    alvo.innerHTML = spinner("Carregando campanhas...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cliente.id) + "/campaigns?" + queryPeriodo(refresh ? "refresh=1" : ""))
      .then(function (r) {
        campData = { campanhas: r.campanhas || [], moeda: moeda, cliente: cliente, cache: r.cache, mock: r.mock };
        campFiltro.mostrarTodas = false;
        renderCampanhas();
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { carregarCampanhas(cliente, moeda, false); }); });
  }

  // Ordena e filtra as campanhas para a previa (ativas primeiro por gasto).
  function campanhasOrdenadas() {
    var lista = campData.campanhas.slice();
    var busca = campFiltro.status;
    var soVeic = campFiltro.soVeiculacao;
    lista = lista.filter(function (c) {
      var ativa = (c.effectiveStatus || c.status) === "ACTIVE";
      if (busca === "ativas" && !ativa) return false;
      if (busca === "pausadas" && ativa) return false;
      if (soVeic && !((c.metrics && c.metrics.impressions) > 0) && !ativa) return false;
      return true;
    });
    lista.sort(function (a, b) {
      var aAtiva = (a.effectiveStatus || a.status) === "ACTIVE";
      var bAtiva = (b.effectiveStatus || b.status) === "ACTIVE";
      if (aAtiva !== bAtiva) return aAtiva ? -1 : 1; // ativas sempre no topo
      if (aAtiva) return ((b.metrics && b.metrics.spend) || 0) - ((a.metrics && a.metrics.spend) || 0);
      // nao-ativas: mais recentes primeiro (por inicio de veiculacao)
      return String(b.startTime || "").localeCompare(String(a.startTime || ""));
    });
    return lista;
  }

  function renderCampanhas() {
    var alvo = document.getElementById("ct-campanhas");
    if (!alvo || !campData) return;
    var moeda = campData.moeda, cliente = campData.cliente;
    if (!campData.campanhas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma campanha encontrada na conta.</div>'; return; }

    var ordenadas = campanhasOrdenadas();
    var totalFiltrado = ordenadas.length;
    var visiveis = campFiltro.mostrarTodas ? ordenadas : ordenadas.slice(0, CAMP_PREVIA);
    var ativasCount = campData.campanhas.filter(function (c) { return (c.effectiveStatus || c.status) === "ACTIVE"; }).length;

    function pill(id, rot) {
      return '<button data-camp-status="' + id + '"' + (campFiltro.status === id ? ' class="ativo"' : "") + ">" + rot + "</button>";
    }
    var h = '<div class="filtros" style="margin:0 0 16px;gap:14px;">' +
      '<div class="campo"><label>Status</label><span class="ct-periodo">' +
        pill("", "Todas") + pill("ativas", "Ativas (" + ativasCount + ")") + pill("pausadas", "Pausadas") +
      "</span></div>" +
      '<div class="campo"><label>Veiculacao</label><span class="ct-periodo">' +
        '<button data-camp-veic="1"' + (campFiltro.soVeiculacao ? ' class="ativo"' : "") + ">So com veiculacao no periodo</button>" +
        '<button data-camp-veic="0"' + (!campFiltro.soVeiculacao ? ' class="ativo"' : "") + ">Todas</button>" +
      "</span></div>" +
      '<div class="contador"><b>' + totalFiltrado + "</b> campanha(s)</div></div>";

    h += '<div class="ct-tabela-wrap"><table class="ct-tabela" id="ct-tabela-drill"><thead><tr>' +
         "<th>Nome</th><th>Status</th><th class=\"num\">Orcam./dia</th><th class=\"num\">Gasto</th><th class=\"num\">Leads</th>" +
         "<th class=\"num\">CPL</th><th class=\"num\">CTR</th><th class=\"num\">CPM</th><th class=\"num\">Freq.</th><th>Alertas</th></tr></thead><tbody>";
    if (!visiveis.length) {
      h += '<tr><td colspan="10" class="ct-drill-vazio" style="padding-left:14px !important;">Nenhuma campanha com esses filtros.</td></tr>';
    } else {
      visiveis.forEach(function (c) { h += linhaEntidade(c, "campaign", moeda, true); });
    }
    h += "</tbody></table></div>";
    if (!campFiltro.mostrarTodas && totalFiltrado > CAMP_PREVIA) {
      h += '<div style="margin-top:12px;"><button class="ct-btn-sec" data-act="camp-mostrar-todas">Mostrar todas (' + totalFiltrado + ")</button></div>";
    }
    h += linhaCacheHtml(campData.cache, campData.mock);
    alvo.innerHTML = h;

    alvo.querySelectorAll("[data-camp-status]").forEach(function (b) {
      b.addEventListener("click", function () { campFiltro.status = b.getAttribute("data-camp-status"); campFiltro.mostrarTodas = false; renderCampanhas(); });
    });
    alvo.querySelectorAll("[data-camp-veic]").forEach(function (b) {
      b.addEventListener("click", function () { campFiltro.soVeiculacao = b.getAttribute("data-camp-veic") === "1"; campFiltro.mostrarTodas = false; renderCampanhas(); });
    });
    var btnTodas = alvo.querySelector('[data-act="camp-mostrar-todas"]');
    if (btnTodas) btnTodas.addEventListener("click", function () { campFiltro.mostrarTodas = true; renderCampanhas(); });

    var btnAtu = alvo.querySelector('[data-act="atualizar-agora"]');
    if (btnAtu) btnAtu.addEventListener("click", function () {
      carregarResumo(cliente, moeda, true);
      carregarCampanhas(cliente, moeda, true);
    });

    (function (moeda, cliente) {
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
    })(moeda, cliente);
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

        // KPIs de PORTFOLIO (saude da carteira; nada de media entre nichos —
        // CPL/leads individuais vivem na pagina do cliente, com meta propria)
        var stats = [
          { ico: "clientes", num: String(ov.clientesAtivos), lab: "Clientes ativos", sub: ov.clientesTotal + " cadastrado(s)" },
          { ico: "alerta", num: ov.clientesComAlerta != null ? String(ov.clientesComAlerta) : "—", lab: "Clientes com alerta", sub: "clique para ver os casos", id: "kpi-alerta" },
          { ico: "dinheiro", num: exemplo ? fmtMoeda(mockD.investimento) : fmtMoeda(ov.investimentoTotal), lab: "Investimento (" + dashPeriodo + "d)", varr: exemplo ? badgeVar(mockD.varInv, 0) : "" },
          { ico: "tarefas", num: String(ov.pendenciasOperacionais != null ? ov.pendenciasOperacionais : "—"), lab: "Pendencias operacionais", sub: "conexao, tracking, onboarding" }
        ];

        // Pendencias (alertas das automacoes primeiro: ultimas 24h)
        var pendencias = (ov.alertasAutomacao || []).map(function (a) {
          return { area: "automacoes", texto: a.texto, meta: a.meta };
        });
        if (!ov.metaConectada) pendencias.push({ area: "gestor", texto: "Meta API sem token no backend", meta: "Preencha META_ACCESS_TOKEN no .env do Gestor de Trafego" });
        var semConta = (ov.porCliente || []).filter(function (c) { return !c.contaConectada; }).length;
        if (semConta > 0) pendencias.push({ area: "clientes", texto: semConta + " cliente(s) sem conta de anuncio conectada", meta: "Conecte o adAccountId na area Clientes" });
        if (!ov.clientesTotal) pendencias.push({ area: "clientes", texto: "Nenhum cliente cadastrado ainda", meta: "Crie o primeiro na area Clientes" });
        // Aviso discreto: sem meta definida o cliente nao gera alerta de CPL.
        if (ov.clientesSemMeta > 0) pendencias.push({ area: "clientes", texto: ov.clientesSemMeta + " cliente(s) sem meta definida", meta: "Sem meta de CPL o cliente nao gera alerta — defina na area Clientes" });

        // Selo discreto "Dados de exemplo" ao lado do titulo (sem banner)
        var selo = document.getElementById("dash-selo-exemplo");
        if (selo) {
          selo.style.display = exemplo ? "inline-flex" : "none";
          selo.title = "Os numeros e o grafico sao ilustrativos. Conecte o META_ACCESS_TOKEN no .env do backend e as contas dos clientes para ver dados reais.";
        }

        var h = '<div class="stat-grid dash-kpis">' + stats.map(kpiHtml).join("") + "</div>";

        // Clientes que precisam de atencao (portfolio): SO quem tem problema,
        // sempre contra a meta PROPRIA. Clique abre a pagina do cliente.
        var icoOkAtencao = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        var icoAt = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        var comAtencao = (ov.porCliente || []).filter(function (c) { return (c.atencao || []).length > 0; });
        comAtencao.sort(function (a, b) { return b.atencao.length - a.atencao.length; });
        h += '<div class="painel ct-secao" id="dash-atencao"><div class="painel-topo"><h3>Clientes que precisam de atencao</h3>' +
             (comAtencao.length ? '<span class="ct-badge alerta">' + comAtencao.length + "</span>" : "") + "</div>";
        if (exemplo) {
          h += '<div class="vazio" style="padding:30px 20px;">Disponivel quando houver dados reais conectados.</div>';
        } else if (!comAtencao.length) {
          h += '<div class="pend-lista"><div class="pend-item estatico"><span class="pend-ico ok">' + icoOkAtencao + "</span>" +
               '<div class="pend-info"><div class="pend-titulo">Todos os clientes saudaveis</div>' +
               '<div class="pend-sub">Nenhum cliente com alerta contra a propria meta no periodo.</div></div></div></div>';
        } else {
          h += '<div class="pend-lista">' + comAtencao.map(function (c) {
            return '<div class="pend-item" data-cliente-link="' + esc(c.id) + '"><span class="pend-ico">' + icoAt + "</span>" +
                   '<div class="pend-info"><div class="pend-titulo">' + esc(c.nome) + "</div>" +
                   '<div class="pend-sub">' + c.atencao.map(esc).join(" · ") + "</div></div>" +
                   '<span class="seta">&rsaquo;</span></div>';
          }).join("") + "</div>";
        }
        h += "</div>";

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

        // Evolucao semanal (snapshots de segunda-feira; so dados reais)
        h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Evolucao semanal</h3>' +
             '<span class="contador" style="font-size:12px;color:var(--text-3);">investimento por semana (snapshot de segunda)</span></div>' +
             '<div id="dash-semanal">' + spinner("Carregando snapshots...") + "</div></div>";

        alvo.innerHTML = h;
        var graf = document.getElementById("dash-grafico");
        if (graf && serie.length) ligarChart(graf, serie, valores, fmtValor);
        alvo.querySelectorAll("[data-area-link]").forEach(function (row) {
          row.addEventListener("click", function () { irParaArea(row.getAttribute("data-area-link")); });
        });
        alvo.querySelectorAll("[data-cliente-link]").forEach(function (row) {
          row.addEventListener("click", function () { abrirNoGestor(row.getAttribute("data-cliente-link")); });
        });
        var kpiAlerta = document.getElementById("kpi-alerta");
        if (kpiAlerta) kpiAlerta.addEventListener("click", function () {
          var bloco = document.getElementById("dash-atencao");
          if (bloco) bloco.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        carregarEvolucaoSemanal();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(alvo, renderDashCentral);
        else alvo.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  // Evolucao semanal do Dashboard: alimentada pelos snapshots de segunda.
  // Com menos de 3 semanas mostra o estado "coletando historico".
  function carregarEvolucaoSemanal() {
    var alvo = document.getElementById("dash-semanal");
    if (!alvo) return;
    api("/api/paid-ads/snapshots")
      .then(function (r) {
        var snaps = r.snapshots || [];
        if (!snaps.length) {
          alvo.innerHTML = '<div class="vazio" style="padding:34px 20px;">Sem snapshots ainda. O primeiro e gerado automaticamente na segunda-feira (ou na proxima inicializacao do backend).</div>';
          return;
        }
        var serie = snaps.map(function (s) {
          var total = 0;
          (s.clientes || []).forEach(function (c) { total += c.investimento || 0; });
          return { data: s.semana.since, investimento: Math.round(total * 100) / 100 };
        });
        if (snaps.length < 3) {
          var linhas = serie.map(function (p) {
            return '<div class="pend-item estatico"><div class="pend-info"><div class="pend-titulo">Semana de ' + esc(p.data.split("-").reverse().join("/")) + '</div><div class="pend-sub">Investimento total: ' + fmtMoeda(p.investimento) + "</div></div></div>";
          }).join("");
          alvo.innerHTML = '<div class="pend-lista">' +
            '<div class="pend-item estatico"><span class="pend-ico">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>' +
              '<div class="pend-info"><div class="pend-titulo">Coletando historico (' + snaps.length + " de 3 semanas)</div>" +
              '<div class="pend-sub">O grafico aparece com 3+ snapshots semanais; um novo e salvo toda segunda.</div></div></div>' +
            linhas + "</div>";
          return;
        }
        var valores = serie.map(function (p) { return p.investimento; });
        alvo.innerHTML = chartHtml(serie, valores, fmtMoeda);
        ligarChart(alvo, serie, valores, fmtMoeda);
      })
      .catch(function (err) {
        alvo.innerHTML = '<div class="ct-msg">' + esc(err.offline ? "Backend offline." : err.message) + "</div>";
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
        .catch(function (err) { pulsarAlert("Erro ao salvar item: " + err.message); });
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
        pulsarAlert("Verificacao concluida: " + r.resumo.disparos + " disparo(s) em " + r.resumo.combinacoes +
          " combinacao(oes) avaliada(s)." + (r.resumo.erros.length ? "\nErros: " + r.resumo.erros.join(" | ") : ""));
        renderAutomacoes();
      })
      .catch(function (err) {
        pulsarAlert("Erro na verificacao: " + err.message);
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
        pulsarConfirm('Excluir a regra "' + regra.nome + '"? O log de disparos e mantido.').then(function (ok) {
          if (!ok) return;
          api("/api/paid-ads/automacoes-acao", { method: "POST", body: { id: regra.id, acao: "excluir" } })
            .then(renderAutomacoes)
            .catch(function (err) { pulsarAlert("Erro: " + err.message); });
        });
      });
    });
    root.querySelectorAll("[data-testar]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        b.textContent = "Enviando...";
        api("/api/paid-ads/automacoes-acao", { method: "POST", body: { id: b.getAttribute("data-testar"), acao: "testar" }, timeoutMs: 60000 })
          .then(function () { carregarLogDisparos(filtroLogAtual()); b.disabled = false; b.textContent = "Testar disparo"; })
          .catch(function (err) { pulsarAlert("Erro no teste: " + err.message); b.disabled = false; b.textContent = "Testar disparo"; });
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
        else pulsarAlert("Erro ao salvar: " + err.message);
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

  // Corpo visual de um conteudo gerado pelo Redator (reusado pela Biblioteca).
  function corpoConteudoRedator(tipo, c) {
    var corpo = "";
    if (tipo === "carrossel") {
      corpo += '<div class="ct-diag-bloco"><h4 style="color:var(--accent-hover);">Capa</h4>' +
        '<p style="font-size:16px;font-weight:700;color:var(--text);">' + esc((c.capa || {}).titulo) + "</p>" +
        '<p style="font-size:13px;color:var(--text-2);margin-top:4px;">' + esc((c.capa || {}).subtitulo) + "</p></div>" +
        '<div class="red-slides">' + (c.slides || []).map(function (s) {
          return '<div class="red-slide"><span class="red-num">' + s.numero + "</span>" +
            '<div class="red-slide-titulo">' + esc(s.titulo) + '</div><div class="red-slide-texto">' + esc(s.texto) + "</div></div>";
        }).join("") + "</div>" +
        blocoTexto("CTA (slide final)", c.cta) +
        blocoTexto("Legenda", c.legenda) + hashtagsHtml(c.hashtags);
    } else if (tipo === "reel") {
      corpo += '<div class="ct-diag-resumo" style="margin-bottom:12px;"><b>Gancho:</b> ' + esc(c.gancho) + "</div>" +
        '<div class="ct-tabela-wrap"><table class="ct-tabela"><thead><tr><th>Tempo</th><th>Fala</th><th>Texto na tela</th></tr></thead><tbody>' +
        (c.cenas || []).map(function (s) {
          return '<tr><td style="white-space:nowrap;">' + esc(s.tempo) + "</td><td>" + esc(s.fala) + '</td><td style="color:var(--text-2);">' + esc(s.textoNaTela) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        blocoTexto("CTA", c.cta) + blocoTexto("Legenda", c.legenda) + hashtagsHtml(c.hashtags);
    } else if (tipo === "legenda") {
      corpo += blocoTexto("Legenda", c.legenda) + blocoTexto("CTA", c.cta) + hashtagsHtml(c.hashtags);
    } else if (tipo === "ideias") {
      corpo += '<div class="ct-diag-grid">' + (c.pilares || []).map(function (p) {
        return '<div class="ct-diag-bloco plano"><h4>' + esc(p.pilar) + "</h4><ul>" +
          p.ideias.map(function (i) {
            return "<li><b>" + esc(i.titulo) + "</b> <span class=\"ct-badge neutro\">" + esc(i.formato) + "</span><br/><span style=\"font-size:12.5px;\">" + esc(i.descricao) + "</span></li>";
          }).join("") + "</ul></div>";
      }).join("") + "</div>";
    }
    return corpo;
  }

  function renderResultadoRedator(alvo, r) {
    var c = r.conteudo;
    var corpo = corpoConteudoRedator(r.tipo, c);

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

  // =====================================================================
  // BIBLIOTECA (Etapa 5.2): repositorio central de conteudo por cliente
  // =====================================================================
  var TIPOS_BIB = [
    { id: "anuncio", rotulo: "Anuncio" },
    { id: "carrossel", rotulo: "Carrossel" },
    { id: "reel", rotulo: "Reel" },
    { id: "story", rotulo: "Story" },
    { id: "estatico", rotulo: "Estatico" },
    { id: "legenda", rotulo: "Legenda" },
    { id: "ideias", rotulo: "Ideias" }
  ];
  var bibFiltro = { clienteId: "", tipo: "", status: "" };
  var bibUploadAberto = false;
  var bibItens = [];

  function rotuloTipoBib(id) {
    for (var i = 0; i < TIPOS_BIB.length; i++) if (TIPOS_BIB[i].id === id) return TIPOS_BIB[i].rotulo;
    return id;
  }

  function urlMidia(m) {
    return API + "/api/paid-ads/biblioteca-midia/" + encodeURIComponent(m.arquivo);
  }

  function renderBiblioteca() {
    var root = document.getElementById("biblioteca-root");
    var topo = document.getElementById("biblioteca-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Biblioteca...");
    Promise.all([api("/api/paid-ads/biblioteca"), api("/api/paid-ads/clients")])
      .then(function (r) {
        bibItens = r[0].itens || [];
        estado.clientes = r[1].clientes || [];
        if (topo) {
          topo.innerHTML = '<button class="btn-toolbar" data-act="bib-upload"><span class="mais">+</span> Upload de midia</button>';
          topo.querySelector('[data-act="bib-upload"]').addEventListener("click", function () {
            bibUploadAberto = !bibUploadAberto;
            renderBibliotecaCorpo();
          });
        }
        renderBibliotecaCorpo();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderBiblioteca);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function renderBibliotecaCorpo() {
    var root = document.getElementById("biblioteca-root");
    if (!root) return;

    var filtrados = bibItens.filter(function (i) {
      if (bibFiltro.clienteId && i.clienteId !== bibFiltro.clienteId) return false;
      if (bibFiltro.tipo && i.tipo !== bibFiltro.tipo) return false;
      if (bibFiltro.status && i.status !== bibFiltro.status) return false;
      return true;
    });

    var h = "";
    if (bibUploadAberto) h += htmlUploadBiblioteca();

    h += '<div class="filtros" style="margin:0 0 22px;">' +
      '<div class="campo"><label>Cliente</label><div class="select-wrap"><select id="bib-f-cliente">' +
        '<option value="">Todos</option>' +
        estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (bibFiltro.clienteId === c.id ? " selected" : "") + ">" + esc(c.nome) + "</option>"; }).join("") +
      "</select></div></div>" +
      '<div class="campo"><label>Tipo</label><span class="ct-periodo">' +
        '<button data-bib-tipo=""' + (!bibFiltro.tipo ? ' class="ativo"' : "") + ">Todos</button>" +
        TIPOS_BIB.map(function (t) { return '<button data-bib-tipo="' + t.id + '"' + (bibFiltro.tipo === t.id ? ' class="ativo"' : "") + ">" + t.rotulo + "</button>"; }).join("") +
      "</span></div>" +
      '<div class="campo"><label>Status</label><span class="ct-periodo">' +
        [["", "Todos"], ["rascunho", "Rascunho"], ["aprovado", "Aprovado"]].map(function (s) {
          return '<button data-bib-status="' + s[0] + '"' + (bibFiltro.status === s[0] ? ' class="ativo"' : "") + ">" + s[1] + "</button>";
        }).join("") +
      "</span></div>" +
      '<div class="contador"><b>' + filtrados.length + "</b> item(ns)</div></div>";

    if (!filtrados.length) {
      h += '<div class="painel"><div class="vazio">Nenhum conteudo ' + (bibItens.length ? "com esses filtros" : "na Biblioteca ainda") +
           '.<br/><br/>Gere algo no <b>Redator IA</b> e salve aqui, ou faca <b>Upload de midia</b>.</div></div>';
    } else {
      h += '<div class="galeria">' + filtrados.map(function (item, idx) {
        var midia = (item.midia && item.midia[0]) || null;
        var visual;
        if (midia && midia.mime.indexOf("video/") === 0) {
          visual = '<div class="media"><video controls preload="metadata" src="' + esc(urlMidia(midia)) + '"></video></div>';
        } else if (midia) {
          visual = '<div class="media"><img src="' + esc(urlMidia(midia)) + '" alt="' + esc(item.titulo) + '" loading="lazy" /></div>';
        } else {
          visual = '<div class="media bib-sem-midia"><span class="bib-tipo-icone">' + esc(rotuloTipoBib(item.tipo)) + "</span></div>";
        }
        return '<article class="card" data-bib="' + idx + '">' + visual +
          '<div class="corpo">' +
            '<div class="tags"><span class="tag nicho">' + esc(rotuloTipoBib(item.tipo)) + "</span>" +
              '<span class="ct-badge ' + (item.status === "aprovado" ? "on" : "off") + '">' + esc(item.status) + "</span>" +
              '<span class="tag">' + (item.origem === "redator" ? "Redator IA" : "Upload") + "</span></div>" +
            '<div class="hook" style="font-size:15px;">' + esc(item.titulo) + "</div>" +
            '<div class="hook-meta">' + (item.clienteNome ? esc(item.clienteNome) + " · " : "") + fmtData(item.criadoEm) + "</div>" +
            '<div class="card-acoes">' +
              '<button class="btn-sm salvar" data-bib-copiar="' + idx + '">Copiar</button>' +
              '<button class="btn-sm" data-bib-status="' + idx + '">' + (item.status === "aprovado" ? "Voltar a rascunho" : "Aprovar") + "</button>" +
              '<button class="btn-sm" data-bib-excluir="' + idx + '">Excluir</button>' +
            "</div>" +
            '<button class="btn-exp">Expandir</button>' +
          "</div>" +
          '<div class="detalhe">' + detalheBiblioteca(item) + "</div>" +
        "</article>";
      }).join("") + "</div>";
    }

    root.innerHTML = h;
    ligarBiblioteca(root, filtrados);
  }

  function detalheBiblioteca(item) {
    var h = "";
    if (item.origem === "redator") {
      h += corpoConteudoRedator(item.tipo, item.conteudo || {});
    } else {
      var copy = (item.conteudo || {}).copy;
      if (copy) h += blocoTexto("Copy", copy);
    }
    if (item.midia && item.midia.length) {
      h += '<div class="bloco"><h4>Midia (' + item.midia.length + ')</h4><div class="tags">' +
        item.midia.map(function (m) {
          return '<a class="tag link" href="' + esc(urlMidia(m)) + '" target="_blank" rel="noopener" download>' + esc(m.nome || m.arquivo) + "</a>";
        }).join("") + "</div></div>";
    }
    return h || '<p style="color:var(--text-3);font-size:13px;">Sem conteudo adicional.</p>';
  }

  function ligarBiblioteca(root, filtrados) {
    var selCliente = root.querySelector("#bib-f-cliente");
    if (selCliente) selCliente.addEventListener("change", function () { bibFiltro.clienteId = this.value; renderBibliotecaCorpo(); });
    root.querySelectorAll("[data-bib-tipo]").forEach(function (b) {
      b.addEventListener("click", function () { bibFiltro.tipo = b.getAttribute("data-bib-tipo"); renderBibliotecaCorpo(); });
    });
    root.querySelectorAll("[data-bib-status]").forEach(function (b) {
      if (b.tagName === "BUTTON" && b.closest(".ct-periodo")) {
        b.addEventListener("click", function () { bibFiltro.status = b.getAttribute("data-bib-status"); renderBibliotecaCorpo(); });
      }
    });
    root.querySelectorAll(".card .btn-exp").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".card");
        var aberto = card.classList.toggle("aberto");
        btn.textContent = aberto ? "Recolher" : "Expandir";
      });
    });
    root.querySelectorAll("[data-bib-copiar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var item = filtrados[Number(b.getAttribute("data-bib-copiar"))];
        var texto = item.origem === "redator"
          ? textoParaCopiar(item.tipo, item.conteudo || {})
          : String((item.conteudo || {}).copy || item.titulo);
        copiarTexto(texto, b);
      });
    });
    root.querySelectorAll(".card [data-bib-status]").forEach(function (b) {
      b.addEventListener("click", function () {
        var item = filtrados[Number(b.getAttribute("data-bib-status"))];
        api("/api/paid-ads/biblioteca-acao", { method: "POST", body: { id: item.id, acao: "status", status: item.status === "aprovado" ? "rascunho" : "aprovado" } })
          .then(renderBiblioteca)
          .catch(function (err) { pulsarAlert("Erro: " + err.message); });
      });
    });
    root.querySelectorAll("[data-bib-excluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var item = filtrados[Number(b.getAttribute("data-bib-excluir"))];
        pulsarConfirm('Excluir "' + item.titulo + '" da Biblioteca? As midias do item tambem serao apagadas.').then(function (ok) {
          if (!ok) return;
          api("/api/paid-ads/biblioteca-acao", { method: "POST", body: { id: item.id, acao: "excluir" } })
            .then(renderBiblioteca)
            .catch(function (err) { pulsarAlert("Erro: " + err.message); });
        });
      });
    });
    ligarUploadBiblioteca(root);
  }

  function htmlUploadBiblioteca() {
    return '<div class="ct-form" id="bib-upload-form">' +
      "<h3>Upload de midia</h3>" +
      '<div class="ct-form-grid">' +
        '<div class="campo"><label>Titulo *</label><input type="text" name="bib-titulo" placeholder="Ex.: Criativo video depoimento v2" /></div>' +
        '<div class="campo"><label>Cliente</label><div class="select-wrap"><select name="bib-cliente"><option value="">— sem cliente —</option>' +
          estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nome) + "</option>"; }).join("") +
        "</select></div></div>" +
        '<div class="campo"><label>Tipo</label><div class="select-wrap"><select name="bib-tipo">' +
          ["anuncio", "story", "estatico", "carrossel", "reel"].map(function (t) { return '<option value="' + t + '">' + rotuloTipoBib(t) + "</option>"; }).join("") +
        "</select></div></div>" +
        '<div class="campo"><label>Status</label><div class="select-wrap"><select name="bib-status"><option value="rascunho">Rascunho</option><option value="aprovado">Aprovado</option></select></div></div>' +
      "</div>" +
      '<div class="campo" style="margin-bottom:14px;"><label>Copy / observacao (opcional)</label><textarea name="bib-copy" placeholder="Copy do anuncio, contexto da arte..."></textarea></div>' +
      '<div class="campo" style="margin-bottom:6px;"><label>Arquivos (imagem ou video, ate 40MB no total)</label>' +
        '<input type="file" name="bib-arquivos" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" /></div>' +
      '<div class="ct-form-acoes">' +
        '<button class="btn-toolbar" data-act="bib-enviar">Enviar para a Biblioteca</button>' +
        '<button class="ct-btn-sec" data-act="bib-cancelar">Cancelar</button>' +
      "</div>" +
      '<div class="ct-erro-form" id="bib-upload-erro"></div>' +
    "</div>";
  }

  function ligarUploadBiblioteca(root) {
    var form = root.querySelector("#bib-upload-form");
    if (!form) return;
    form.querySelector('[data-act="bib-cancelar"]').addEventListener("click", function () { bibUploadAberto = false; renderBibliotecaCorpo(); });
    form.querySelector('[data-act="bib-enviar"]').addEventListener("click", function () {
      var btn = this;
      var erroEl = form.querySelector("#bib-upload-erro");
      var titulo = form.querySelector('[name="bib-titulo"]').value.trim();
      var input = form.querySelector('[name="bib-arquivos"]');
      var arquivos = input.files ? Array.prototype.slice.call(input.files) : [];
      if (!titulo) { erroEl.textContent = "Preencha o titulo."; return; }
      if (!arquivos.length) { erroEl.textContent = "Selecione ao menos um arquivo de imagem ou video."; return; }
      var total = arquivos.reduce(function (s, f) { return s + f.size; }, 0);
      if (total > 40 * 1024 * 1024) { erroEl.textContent = "Total acima de 40MB. Envie arquivos menores."; return; }
      erroEl.textContent = "";
      btn.disabled = true;
      btn.textContent = "Enviando...";

      Promise.all(arquivos.map(function (f) {
        return new Promise(function (ok, falha) {
          var leitor = new FileReader();
          leitor.onload = function () {
            ok({ nome: f.name, mime: f.type, base64: String(leitor.result).split(",")[1] || "" });
          };
          leitor.onerror = function () { falha(new Error("Falha ao ler " + f.name)); };
          leitor.readAsDataURL(f);
        });
      }))
        .then(function (lidos) {
          return api("/api/paid-ads/biblioteca-upload", {
            method: "POST",
            timeoutMs: 180000,
            body: {
              titulo: titulo,
              clienteId: form.querySelector('[name="bib-cliente"]').value,
              tipo: form.querySelector('[name="bib-tipo"]').value,
              status: form.querySelector('[name="bib-status"]').value,
              copy: form.querySelector('[name="bib-copy"]').value,
              arquivos: lidos
            }
          });
        })
        .then(function () { bibUploadAberto = false; renderBiblioteca(); })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = "Enviar para a Biblioteca";
          erroEl.textContent = err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message;
        });
    });
  }

  // ---------------------------------------------------------------------
  // AREA: PLANEJAMENTO (Etapa 5.3)
  // Calendario mensal por cliente. SEM publicacao automatica: so organiza
  // data/formato/status e linka a Biblioteca; publicar e manual (Meta
  // Business Suite ou GoHighLevel).
  // ---------------------------------------------------------------------
  var ROTULOS_FORMATO_PLAN = { carrossel: "Carrossel", reel: "Reel", story: "Story", estatico: "Estatico", anuncio: "Anuncio" };
  var ROTULOS_STATUS_PLAN = { ideia: "Ideia", em_producao: "Em producao", pronto: "Pronto", publicado: "Publicado" };
  var NOMES_MES_PLAN = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var DIAS_SEMANA_PLAN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  var planCliente = "";
  var planMes = "";
  var planItens = [];
  var planAviso = "";
  var planBibOpcoes = [];
  var planFormAberto = null; // null fechado, ou { id, data, formato, status, titulo, observacao, bibliotecaId }

  function mesAtualPlan() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function hojeIsoPlan() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function nomeMesPlan(mes) {
    var p = mes.split("-");
    return NOMES_MES_PLAN[Number(p[1]) - 1] + " de " + p[0];
  }
  function shiftMesPlan(mes, delta) {
    var p = mes.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1 + delta, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function ddmmPlan(iso) {
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function renderPlanejamento() {
    var root = document.getElementById("planejamento-root");
    var topo = document.getElementById("plan-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Planejamento...");
    if (topo) topo.innerHTML = "";
    api("/api/paid-ads/clients")
      .then(function (r) {
        estado.clientes = r.clientes || [];
        if (!planCliente || !estado.clientes.some(function (c) { return c.id === planCliente; })) {
          planCliente = estado.clientes.length ? estado.clientes[0].id : "";
        }
        if (!planMes) planMes = mesAtualPlan();
        carregarPlanejamento();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderPlanejamento);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function carregarPlanejamento() {
    var root = document.getElementById("planejamento-root");
    if (!root) return;
    if (!planCliente) {
      root.innerHTML = '<div class="painel"><div class="vazio">Cadastre um cliente na area <b>Clientes</b> para comecar a planejar conteudo.</div></div>';
      return;
    }
    root.innerHTML = spinner("Carregando Planejamento...");
    Promise.all([
      api("/api/paid-ads/planejamento?clienteId=" + encodeURIComponent(planCliente) + "&mes=" + planMes),
      api("/api/paid-ads/biblioteca?clienteId=" + encodeURIComponent(planCliente))
    ])
      .then(function (r) {
        planItens = r[0].slots || [];
        planAviso = r[0].aviso || "";
        planBibOpcoes = r[1].itens || [];
        renderPlanejamentoCorpo();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, carregarPlanejamento);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function diasDoCalendarioPlan(mes) {
    var p = mes.split("-").map(Number);
    var ano = p[0], mesIdx = p[1] - 1;
    var primeiro = new Date(ano, mesIdx, 1);
    var ultimoDiaMes = new Date(ano, mesIdx + 1, 0).getDate();
    var inicioSemana = primeiro.getDay(); // 0 = domingo
    var dias = [];
    // dias do mes anterior para completar a 1a semana
    for (var i = inicioSemana - 1; i >= 0; i--) {
      var d1 = new Date(ano, mesIdx, -i);
      dias.push({ iso: isoDe(d1), fora: true });
    }
    for (var n = 1; n <= ultimoDiaMes; n++) {
      dias.push({ iso: isoDe(new Date(ano, mesIdx, n)), fora: false });
    }
    while (dias.length % 7 !== 0) {
      var ultimo = new Date(dias[dias.length - 1].iso + "T00:00:00");
      var prox = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 1);
      dias.push({ iso: isoDe(prox), fora: true });
    }
    return dias;
  }
  function isoDe(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function htmlCalendarioPlan() {
    var porDia = {};
    planItens.forEach(function (s) {
      (porDia[s.data] = porDia[s.data] || []).push(s);
    });
    var dias = diasDoCalendarioPlan(planMes);
    var hoje = hojeIsoPlan();

    var h = '<div class="pl-cal">' +
      '<div class="pl-cal-head">' +
        '<div class="pl-cal-nav"><button data-act="plan-mes-ant" aria-label="Mes anterior">&#8249;</button><button data-act="plan-mes-prox" aria-label="Proximo mes">&#8250;</button></div>' +
        '<div class="pl-cal-titulo">' + esc(nomeMesPlan(planMes)) + "</div>" +
        '<button class="pl-cal-hoje" data-act="plan-hoje">Hoje</button>' +
        '<div class="pl-legenda">' + Object.keys(ROTULOS_STATUS_PLAN).map(function (s) {
          return '<span class="pl-legenda-item st-' + s + '"><span class="dot"></span>' + ROTULOS_STATUS_PLAN[s] + "</span>";
        }).join("") + "</div>" +
      "</div>" +
      '<div class="pl-grid">' +
      DIAS_SEMANA_PLAN.map(function (n) { return '<div class="pl-semana">' + n + "</div>"; }).join("");

    dias.forEach(function (dia) {
      var itens = porDia[dia.iso] || [];
      var visiveis = itens.slice(0, 3);
      var resto = itens.length - visiveis.length;
      h += '<div class="pl-dia' + (dia.fora ? " fora" : "") + (dia.iso === hoje ? " hoje" : "") + '" data-plan-dia="' + dia.iso + '">' +
        '<div class="pl-dia-num">' + Number(dia.iso.split("-")[2]) + "</div>" +
        '<button class="pl-dia-add" data-plan-add="' + dia.iso + '" title="Novo item neste dia">+</button>' +
        '<div class="pl-chips">' + visiveis.map(function (s) {
          return '<button class="pl-chip st-' + s.status + '" data-plan-abrir="' + s.id + '"><span class="dot"></span><span class="txt">' + esc(s.titulo) + "</span></button>";
        }).join("") +
        (resto > 0 ? '<button class="pl-mais" data-plan-maisdia="' + dia.iso + '">+' + resto + " mais</button>" : "") +
        "</div></div>";
    });

    h += "</div></div>";
    return h;
  }

  function htmlFormPlanejamento() {
    var f = planFormAberto;
    var editando = Boolean(f.id);
    return '<div class="ct-form" id="plan-form">' +
      "<h3>" + (editando ? "Editar item" : "Novo item") + "</h3>" +
      '<div class="ct-form-grid">' +
        '<div class="campo"><label>Data *</label><input type="date" name="plan-data" value="' + esc(f.data) + '" /></div>' +
        '<div class="campo"><label>Formato</label><div class="select-wrap"><select name="plan-formato">' +
          Object.keys(ROTULOS_FORMATO_PLAN).map(function (id) { return '<option value="' + id + '"' + (f.formato === id ? " selected" : "") + ">" + ROTULOS_FORMATO_PLAN[id] + "</option>"; }).join("") +
        "</select></div></div>" +
        '<div class="campo"><label>Status</label><div class="select-wrap"><select name="plan-status">' +
          Object.keys(ROTULOS_STATUS_PLAN).map(function (id) { return '<option value="' + id + '"' + (f.status === id ? " selected" : "") + ">" + ROTULOS_STATUS_PLAN[id] + "</option>"; }).join("") +
        "</select></div></div>" +
        '<div class="campo"><label>Vincular Biblioteca</label><div class="select-wrap"><select name="plan-biblioteca"><option value="">— sem vinculo —</option>' +
          planBibOpcoes.map(function (i) { return '<option value="' + esc(i.id) + '"' + (f.bibliotecaId === i.id ? " selected" : "") + ">" + esc(i.titulo) + "</option>"; }).join("") +
        "</select></div></div>" +
      "</div>" +
      '<div class="campo" style="margin-bottom:14px;"><label>Titulo *</label><input type="text" name="plan-titulo" value="' + esc(f.titulo) + '" placeholder="Ex.: Carrossel depoimento paciente" /></div>' +
      '<div class="campo" style="margin-bottom:6px;"><label>Observacao (opcional)</label><textarea name="plan-observacao" placeholder="Contexto, briefing, lembrete...">' + esc(f.observacao) + "</textarea></div>" +
      '<div class="ct-form-acoes">' +
        '<button class="btn-toolbar" data-act="plan-salvar">Salvar</button>' +
        (editando ? '<button class="ct-btn-perigo" data-act="plan-excluir">Excluir</button>' : "") +
        '<button class="ct-btn-sec" data-act="plan-cancelar">Cancelar</button>' +
      "</div>" +
      '<div class="ct-erro-form" id="plan-form-erro"></div>' +
    "</div>";
  }

  function renderPlanejamentoCorpo() {
    var root = document.getElementById("planejamento-root");
    var topo = document.getElementById("plan-topo");
    if (!root) return;

    if (topo) {
      topo.innerHTML =
        '<div class="select-wrap"><select id="plan-f-cliente">' +
          estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === planCliente ? " selected" : "") + ">" + esc(c.nome) + "</option>"; }).join("") +
        "</select></div>" +
        '<button class="btn-toolbar" data-act="plan-novo"><span class="mais">+</span> Novo item</button>';
      var selCliente = topo.querySelector("#plan-f-cliente");
      selCliente.addEventListener("change", function () {
        planCliente = this.value;
        planFormAberto = null;
        carregarPlanejamento();
      });
      topo.querySelector('[data-act="plan-novo"]').addEventListener("click", function () {
        planFormAberto = { id: null, data: planMes === mesAtualPlan() ? hojeIsoPlan() : planMes + "-01", formato: "carrossel", status: "ideia", titulo: "", observacao: "", bibliotecaId: "" };
        renderPlanejamentoCorpo();
      });
    }

    var h = "";
    if (planAviso) h += '<div class="ct-nota">' + esc(planAviso) + "</div>";
    if (planFormAberto) h += htmlFormPlanejamento();
    h += htmlCalendarioPlan();

    root.innerHTML = h;
    ligarPlanejamento(root);
  }

  function abrirEdicaoPlan(id) {
    var s = planItens.filter(function (i) { return i.id === id; })[0];
    if (!s) return;
    planFormAberto = { id: s.id, data: s.data, formato: s.formato, status: s.status, titulo: s.titulo, observacao: s.observacao || "", bibliotecaId: s.bibliotecaId || "" };
    renderPlanejamentoCorpo();
  }

  function ligarPlanejamento(root) {
    root.querySelectorAll("[data-plan-abrir]").forEach(function (b) {
      b.addEventListener("click", function () { abrirEdicaoPlan(b.getAttribute("data-plan-abrir")); });
    });
    root.querySelectorAll("[data-plan-add]").forEach(function (b) {
      b.addEventListener("click", function () {
        planFormAberto = { id: null, data: b.getAttribute("data-plan-add"), formato: "carrossel", status: "ideia", titulo: "", observacao: "", bibliotecaId: "" };
        renderPlanejamentoCorpo();
      });
    });
    root.querySelectorAll("[data-plan-maisdia]").forEach(function (b) {
      b.addEventListener("click", function () {
        var dia = b.getAttribute("data-plan-maisdia");
        var itens = planItens.filter(function (i) { return i.data === dia; });
        if (itens.length) abrirEdicaoPlan(itens[0].id);
      });
    });
    var navAnt = root.querySelector('[data-act="plan-mes-ant"]');
    var navProx = root.querySelector('[data-act="plan-mes-prox"]');
    var navHoje = root.querySelector('[data-act="plan-hoje"]');
    if (navAnt) navAnt.addEventListener("click", function () { planMes = shiftMesPlan(planMes, -1); carregarPlanejamento(); });
    if (navProx) navProx.addEventListener("click", function () { planMes = shiftMesPlan(planMes, 1); carregarPlanejamento(); });
    if (navHoje) navHoje.addEventListener("click", function () { planMes = mesAtualPlan(); carregarPlanejamento(); });

    var form = root.querySelector("#plan-form");
    if (form) {
      form.querySelector('[data-act="plan-cancelar"]').addEventListener("click", function () { planFormAberto = null; renderPlanejamentoCorpo(); });
      form.querySelector('[data-act="plan-salvar"]').addEventListener("click", function () {
        var btn = this;
        var erroEl = form.querySelector("#plan-form-erro");
        var data = form.querySelector('[name="plan-data"]').value;
        var titulo = form.querySelector('[name="plan-titulo"]').value.trim();
        if (!data) { erroEl.textContent = "Preencha a data."; return; }
        if (!titulo) { erroEl.textContent = "Preencha o titulo."; return; }
        erroEl.textContent = "";
        btn.disabled = true;
        btn.textContent = "Salvando...";
        var corpo = {
          data: data,
          formato: form.querySelector('[name="plan-formato"]').value,
          status: form.querySelector('[name="plan-status"]').value,
          titulo: titulo,
          observacao: form.querySelector('[name="plan-observacao"]').value,
          bibliotecaId: form.querySelector('[name="plan-biblioteca"]').value
        };
        var chamada = planFormAberto.id
          ? api("/api/paid-ads/planejamento-acao", { method: "POST", body: Object.assign({ id: planFormAberto.id, acao: "atualizar" }, corpo) })
          : api("/api/paid-ads/planejamento", { method: "POST", body: Object.assign({ clienteId: planCliente }, corpo) });
        chamada
          .then(function () {
            var novaData = data;
            planFormAberto = null;
            if (novaData.slice(0, 7) !== planMes) planMes = novaData.slice(0, 7);
            carregarPlanejamento();
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erroEl.textContent = err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message;
          });
      });
      var btnExcluir = form.querySelector('[data-act="plan-excluir"]');
      if (btnExcluir) {
        btnExcluir.addEventListener("click", function () {
          pulsarConfirm('Excluir "' + planFormAberto.titulo + '" do planejamento?').then(function (ok) {
            if (!ok) return;
            api("/api/paid-ads/planejamento-acao", { method: "POST", body: { id: planFormAberto.id, acao: "excluir" } })
              .then(function () { planFormAberto = null; carregarPlanejamento(); })
              .catch(function (err) { pulsarAlert("Erro: " + err.message); });
          });
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // AREA: AGENTE (Etapa 6) — chat com Claude Code headless
  // Fase chat = so leitura (o agente propoe planos); escrita SO depois do
  // botao "Confirmo aplicar". Consome creditos da assinatura do Claude Code.
  // ---------------------------------------------------------------------
  var agInfo = null; // GET /agente
  var agSessao = null; // sessao aberta no chat (null = tela de lista)
  var agEnviando = false;

  function fmtTokensAg(n) {
    if (n == null || isNaN(n)) return "0";
    if (n >= 1000) return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return String(n);
  }

  function renderAgente() {
    var root = document.getElementById("agente-root");
    var topo = document.getElementById("agente-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Agente...");
    agSessao = null;
    api("/api/paid-ads/agente")
      .then(function (r) {
        agInfo = r;
        if (topo) {
          topo.innerHTML = r.disponivel
            ? '<span class="ct-badge conectado">Claude Code' + (r.versao ? " " + esc(String(r.versao).split(" ")[0]) : "") + "</span>"
            : '<span class="ct-badge off" title="' + esc(r.aviso || "") + '">CLI nao encontrada</span>';
        }
        renderAgenteLista();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderAgente);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function renderAgenteLista() {
    var root = document.getElementById("agente-root");
    if (!root) return;
    var h = '<div class="ct-nota">O Agente roda o Claude Code local com acesso as pastas da Central (backend e frontend). ' +
            "Leitura livre; qualquer mudanca em arquivo vira um plano que so executa depois do seu <b>Confirmo aplicar</b>. " +
            "Cada mensagem consome creditos da sua assinatura do Claude Code.</div>";
    if (!agInfo.disponivel) h += '<div class="ct-nota">' + esc(agInfo.aviso || "") + "</div>";

    h += '<div style="margin-bottom:22px;"><button class="btn-toolbar" data-act="ag-nova"' + (agInfo.disponivel ? "" : " disabled") + '><span class="mais">+</span> Nova conversa</button></div>';

    var sessoes = agInfo.sessoes || [];
    if (sessoes.length) {
      h += '<div class="painel"><div class="painel-topo"><h3>Conversas</h3><span class="contador"><b>' + sessoes.length + "</b> sessao(oes)</span></div>" +
        '<div class="ct-lista" style="padding:14px 16px 16px;">' +
        sessoes.map(function (s, i) {
          return '<div class="ct-item">' +
            '<span class="av">&gt;_</span>' +
            '<div class="info"><div class="titulo">' + esc(s.titulo) + "</div>" +
              '<div class="sub">' + fmtData(s.atualizadoEm) + " · " + s.qtdMensagens + " mensagem(ns) · " + s.totais.turnos + " turno(s)" +
              (s.totais.custoUsd > 0 ? " · US$ " + s.totais.custoUsd.toFixed(2).replace(".", ",") : "") + "</div></div>" +
            '<span class="lado">' +
              '<span class="ct-badge ' + (s.status === "ativa" ? "on" : "neutro") + '">' + esc(s.status) + "</span>" +
              '<button class="btn-sm salvar" data-ag-abrir="' + i + '">' + (s.status === "ativa" ? "Continuar" : "Ver") + "</button>" +
              '<button class="btn-sm" data-ag-excluir="' + i + '">Excluir</button>' +
            "</span></div>";
        }).join("") + "</div></div>";
    } else {
      h += '<div class="painel"><div class="vazio">Nenhuma conversa ainda.<br/><br/>Clique em <b>+ Nova conversa</b> e peca uma analise, um resumo de cliente ou uma mudanca nos projetos da Central.</div></div>';
    }

    root.innerHTML = h;
    var btnNova = root.querySelector('[data-act="ag-nova"]');
    if (btnNova) btnNova.addEventListener("click", function () { agSessao = { id: null, status: "ativa", mensagens: [], totais: { turnos: 0, custoUsd: 0 }, contexto: { tokens: 0, maxTokens: 200000 } }; renderAgenteChat(); });
    root.querySelectorAll("[data-ag-abrir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = agInfo.sessoes[Number(b.getAttribute("data-ag-abrir"))];
        root.innerHTML = spinner("Abrindo conversa...");
        api("/api/paid-ads/agente-sessao?id=" + encodeURIComponent(s.id))
          .then(function (r) { agSessao = r.sessao; renderAgenteChat(); })
          .catch(function (err) { root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>"; });
      });
    });
    root.querySelectorAll("[data-ag-excluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = agInfo.sessoes[Number(b.getAttribute("data-ag-excluir"))];
        pulsarConfirm('Excluir a conversa "' + s.titulo + '"?').then(function (ok) {
          if (!ok) return;
          api("/api/paid-ads/agente-acao", { method: "POST", body: { id: s.id, acao: "excluir" } })
            .then(renderAgente)
            .catch(function (err) { pulsarAlert("Erro: " + err.message); });
        });
      });
    });
  }

  function htmlIndicadorAgente() {
    var t = agSessao.totais || { turnos: 0, custoUsd: 0 };
    var ctx = agSessao.contexto || { tokens: 0, maxTokens: 200000 };
    var pct = ctx.maxTokens ? Math.min(100, Math.round((ctx.tokens / ctx.maxTokens) * 100)) : 0;
    return '<span class="ag-indicador" title="Contexto aproximado da sessao no Claude Code (janela de ' + fmtTokensAg(ctx.maxTokens) + ' tokens)">' +
      '<span class="ag-ctx-barra"><span class="fill" style="width:' + pct + '%;"></span></span>' +
      "Contexto ~" + fmtTokensAg(ctx.tokens) + " tokens (" + pct + "%)" +
      " · " + t.turnos + " turno(s)" +
      (t.custoUsd > 0 ? " · US$ " + t.custoUsd.toFixed(2).replace(".", ",") : "") +
      "</span>";
  }

  function renderAgenteChat() {
    var root = document.getElementById("agente-root");
    if (!root) return;
    var ativa = agSessao.status === "ativa";

    var h = '<div class="painel ag-chat"><div class="painel-topo" style="flex-wrap:wrap;row-gap:8px;">' +
      "<h3>" + esc(agSessao.id ? agSessao.titulo : "Nova conversa") + "</h3>" +
      '<span class="contador" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        htmlIndicadorAgente() +
        '<button class="ct-btn-sec" data-act="ag-voltar">Voltar</button>' +
        (agSessao.id && ativa ? '<button class="ct-btn-perigo" data-act="ag-encerrar">Encerrar sessao</button>' : "") +
      "</span></div>" +
      '<div class="ag-mensagens" id="ag-mensagens">';

    if (!agSessao.mensagens.length) {
      h += '<div class="vazio" style="padding:40px 20px;">Pergunte algo sobre os clientes, dados ou codigo da Central.<br/>Ex.: "Resuma o tracking da Clinica Exemplo" ou "Liste os relatorios gerados este mes".</div>';
    } else {
      h += agSessao.mensagens.map(function (m) {
        var meta = m.papel === "agente" && !m.erro
          ? '<div class="ag-msg-meta">' + (m.fase === "aplicar" ? "aplicacao · " : "") + (m.numTurns || 0) + " turno(s) · " + fmtTokensAg((m.tokensEntrada || 0) + (m.tokensSaida || 0)) + " tokens" + (m.duracaoMs ? " · " + Math.round(m.duracaoMs / 1000) + "s" : "") + "</div>"
          : "";
        return '<div class="ag-msg ' + (m.papel === "usuario" ? "usuario" : "agente") + (m.erro ? " erro" : "") + '">' +
          '<div class="ag-msg-texto">' + esc(m.texto) + "</div>" + meta + "</div>";
      }).join("");
    }
    if (agEnviando) h += '<div class="ag-msg agente">' + spinner("Agente trabalhando (pode levar minutos)...") + "</div>";
    h += "</div>";

    if (ativa) {
      h += '<div class="ag-input">' +
        '<textarea id="ag-texto" placeholder="Escreva a tarefa ou a pergunta..." ' + (agEnviando ? "disabled" : "") + "></textarea>" +
        '<div class="ag-input-acoes">' +
          '<button class="btn-toolbar" data-act="ag-enviar"' + (agEnviando ? " disabled" : "") + ">Enviar</button>" +
          (agSessao.id ? '<button class="ct-btn-sec" data-act="ag-aplicar"' + (agEnviando ? " disabled" : "") + ' title="Executa o plano de mudancas que o agente propos nesta conversa">Confirmo aplicar</button>' : "") +
        "</div></div>";
    } else {
      h += '<div class="ct-nota" style="margin:14px 20px 20px;">Sessao encerrada — somente leitura. Comece uma nova conversa para continuar.</div>';
    }
    h += "</div>";

    root.innerHTML = h;
    var lista = document.getElementById("ag-mensagens");
    if (lista) lista.scrollTop = lista.scrollHeight;

    root.querySelector('[data-act="ag-voltar"]').addEventListener("click", renderAgente);
    var btnEnc = root.querySelector('[data-act="ag-encerrar"]');
    if (btnEnc) btnEnc.addEventListener("click", function () {
      pulsarConfirm("Encerrar esta sessao? A conversa fica salva para consulta, mas o agente perde o contexto.").then(function (ok) {
        if (!ok) return;
        api("/api/paid-ads/agente-acao", { method: "POST", body: { id: agSessao.id, acao: "encerrar" } })
          .then(renderAgente)
          .catch(function (err) { pulsarAlert("Erro: " + err.message); });
      });
    });
    var btnEnviar = root.querySelector('[data-act="ag-enviar"]');
    if (btnEnviar) btnEnviar.addEventListener("click", enviarMensagemAgente);
    var campo = document.getElementById("ag-texto");
    if (campo) campo.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviarMensagemAgente();
    });
    var btnAplicar = root.querySelector('[data-act="ag-aplicar"]');
    if (btnAplicar) btnAplicar.addEventListener("click", function () {
      pulsarConfirm("Aplicar as mudancas propostas pelo agente? Isso ESCREVE de verdade nos arquivos das pastas permitidas.").then(function (ok) {
        if (!ok) return;
        agEnviando = true;
        renderAgenteChat();
        api("/api/paid-ads/agente-aplicar", { method: "POST", timeoutMs: 320000, body: { sessaoId: agSessao.id, confirmacao: "Confirmo aplicar" } })
          .then(function (r) { agEnviando = false; agSessao = r.sessao; renderAgenteChat(); })
          .catch(function (err) { agEnviando = false; recarregarSessaoAgente(err); });
      });
    });
  }

  function enviarMensagemAgente() {
    var campo = document.getElementById("ag-texto");
    var texto = (campo ? campo.value : "").trim();
    if (!texto || agEnviando) return;
    agSessao.mensagens.push({ papel: "usuario", fase: "chat", texto: texto, timestamp: new Date().toISOString() });
    agEnviando = true;
    renderAgenteChat();
    api("/api/paid-ads/agente-mensagem", { method: "POST", timeoutMs: 320000, body: { sessaoId: agSessao.id || "", texto: texto } })
      .then(function (r) {
        agEnviando = false;
        agSessao = r.sessao;
        renderAgenteChat();
      })
      .catch(function (err) {
        agEnviando = false;
        recarregarSessaoAgente(err);
      });
  }

  // Depois de um erro, recarrega a sessao do backend (la fica o registro do
  // erro) ou mostra o problema quando a sessao nem chegou a ser criada.
  function recarregarSessaoAgente(err) {
    if (agSessao && agSessao.id) {
      api("/api/paid-ads/agente-sessao?id=" + encodeURIComponent(agSessao.id))
        .then(function (r) { agSessao = r.sessao; renderAgenteChat(); })
        .catch(function () { renderAgenteChat(); });
    } else {
      agSessao.mensagens.push({ papel: "agente", fase: "chat", erro: true, texto: err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message, timestamp: new Date().toISOString() });
      renderAgenteChat();
    }
  }

  // ---------------------------------------------------------------------
  // AREA: SWIPE ORGANICO (Etapa 5.5)
  // Referencias de conteudo organico: link, midia opcional, transcricao
  // via Gemini e tags por nicho e formato.
  // ---------------------------------------------------------------------
  var orgInfo = null; // GET /swipe-organico
  var orgItens = [];
  var orgFiltro = { formato: "", busca: "" };
  var orgFormAberto = false;

  var ROTULOS_FORMATO_ORG = { reel: "Reel", post: "Post", carrossel: "Carrossel", story: "Story" };

  function urlMidiaOrganico(m) {
    return API + "/api/paid-ads/swipe-organico-midia/" + encodeURIComponent(m.arquivo);
  }

  function renderSwipeOrganico() {
    var root = document.getElementById("swipeorganico-root");
    var topo = document.getElementById("swipeorganico-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Swipe Organico...");
    api("/api/paid-ads/swipe-organico")
      .then(function (r) {
        orgInfo = r;
        orgItens = r.itens || [];
        if (topo) {
          topo.innerHTML = (r.transcricaoDisponivel
            ? '<span class="ct-badge conectado">Transcricao: gemini</span>'
            : '<span class="ct-badge off" title="' + esc(r.avisoTranscricao || "") + '">Transcricao indisponivel</span>') +
            '<button class="btn-toolbar" data-act="org-novo"><span class="mais">+</span> Nova referencia</button>';
          topo.querySelector('[data-act="org-novo"]').addEventListener("click", function () {
            orgFormAberto = !orgFormAberto;
            renderSwipeOrganicoCorpo();
          });
        }
        renderSwipeOrganicoCorpo();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderSwipeOrganico);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function renderSwipeOrganicoCorpo() {
    var root = document.getElementById("swipeorganico-root");
    if (!root) return;

    var busca = orgFiltro.busca.toLowerCase();
    var filtrados = orgItens.filter(function (i) {
      if (orgFiltro.formato && i.formato !== orgFiltro.formato) return false;
      if (busca) {
        var texto = (i.origem + " " + i.nicho + " " + (i.tags || []).join(" ") + " " + (i.transcricao || "") + " " + (i.observacao || "")).toLowerCase();
        if (texto.indexOf(busca) === -1) return false;
      }
      return true;
    });

    var h = "";
    if (orgFormAberto) h += htmlFormOrganico();

    h += '<div class="filtros" style="margin:0 0 22px;">' +
      '<div class="campo"><label>Buscar</label><input type="search" id="org-f-busca" placeholder="Origem, tag, nicho, transcricao..." value="' + esc(orgFiltro.busca) + '" /></div>' +
      '<div class="campo"><label>Formato</label><span class="ct-periodo">' +
        '<button data-org-formato=""' + (!orgFiltro.formato ? ' class="ativo"' : "") + ">Todos</button>" +
        Object.keys(ROTULOS_FORMATO_ORG).map(function (f) {
          return '<button data-org-formato="' + f + '"' + (orgFiltro.formato === f ? ' class="ativo"' : "") + ">" + ROTULOS_FORMATO_ORG[f] + "</button>";
        }).join("") +
      "</span></div>" +
      '<div class="contador"><b>' + filtrados.length + "</b> referencia(s)</div></div>";

    if (!filtrados.length) {
      h += '<div class="painel"><div class="vazio">Nenhuma referencia ' + (orgItens.length ? "com esses filtros" : "no Swipe Organico ainda") +
           '.<br/><br/>Clique em <b>+ Nova referencia</b> para salvar um reel ou post de concorrente/criador.</div></div>';
    } else {
      h += '<div class="galeria">' + filtrados.map(function (item, idx) {
        var visual;
        if (item.midia && item.midia.mime.indexOf("video/") === 0) {
          visual = '<div class="media"><video controls preload="metadata" src="' + esc(urlMidiaOrganico(item.midia)) + '"></video></div>';
        } else if (item.midia) {
          visual = '<div class="media"><img src="' + esc(urlMidiaOrganico(item.midia)) + '" alt="' + esc(item.origem) + '" loading="lazy" /></div>';
        } else {
          visual = '<div class="media bib-sem-midia"><span class="bib-tipo-icone">' + esc(ROTULOS_FORMATO_ORG[item.formato] || item.formato) + "</span></div>";
        }
        var temVideo = item.midia && item.midia.mime.indexOf("video/") === 0;
        return '<article class="card" data-org="' + idx + '">' + visual +
          '<div class="corpo">' +
            '<div class="tags"><span class="tag nicho">' + esc(ROTULOS_FORMATO_ORG[item.formato] || item.formato) + "</span>" +
              (item.nicho ? '<span class="tag">' + esc(item.nicho) + "</span>" : "") +
              (item.transcricao ? '<span class="ct-badge on">transcrito</span>' : "") +
              (item.tags || []).slice(0, 4).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
            "</div>" +
            '<div class="hook" style="font-size:15px;">' + esc(item.origem) + "</div>" +
            '<div class="hook-meta">' + fmtData(item.criadoEm) +
              (item.link ? ' · <a class="ct-link" href="' + esc(item.link) + '" target="_blank" rel="noopener">Abrir original</a>' : "") + "</div>" +
            '<div class="card-acoes">' +
              (temVideo && !item.transcricao ? '<button class="btn-sm salvar" data-org-transcrever="' + idx + '"' + (orgInfo.transcricaoDisponivel ? "" : ' disabled title="' + esc(orgInfo.avisoTranscricao || "") + '"') + ">Transcrever</button>" : "") +
              (item.transcricao ? '<button class="btn-sm salvar" data-org-copiar="' + idx + '">Copiar transcricao</button>' : "") +
              '<button class="btn-sm" data-org-excluir="' + idx + '">Excluir</button>' +
            "</div>" +
            '<button class="btn-exp">Expandir</button>' +
          "</div>" +
          '<div class="detalhe">' + detalheOrganico(item) + "</div>" +
        "</article>";
      }).join("") + "</div>";
    }

    root.innerHTML = h;
    ligarSwipeOrganico(root, filtrados);
  }

  function detalheOrganico(item) {
    var h = "";
    if (item.transcricao) {
      h += '<div class="bloco transcricao"><h4>Transcricao' + (item.transcricaoModelo ? " (" + esc(item.transcricaoModelo) + ")" : "") + "</h4><p>" + esc(item.transcricao) + "</p></div>";
    }
    if (item.observacao) h += '<div class="bloco"><h4>Observacao</h4><p>' + esc(item.observacao) + "</p></div>";
    if ((item.tags || []).length > 4) {
      h += '<div class="bloco"><h4>Todas as tags</h4><div class="tags">' + item.tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div>";
    }
    return h || '<p style="color:var(--text-3);font-size:13px;">Sem transcricao ou observacao ainda.</p>';
  }

  function htmlFormOrganico() {
    return '<div class="ct-form" id="org-form">' +
      "<h3>Nova referencia</h3>" +
      '<div class="ct-form-grid">' +
        '<div class="campo"><label>Origem (criador/concorrente) *</label><input type="text" name="org-origem" placeholder="Ex.: @clinicaexemplo" /></div>' +
        '<div class="campo"><label>Link do post</label><input type="text" name="org-link" placeholder="https://www.instagram.com/reel/..." /></div>' +
        '<div class="campo"><label>Nicho</label><input type="text" name="org-nicho" placeholder="Ex.: odonto, estetica" /></div>' +
        '<div class="campo"><label>Formato</label><div class="select-wrap"><select name="org-formato">' +
          Object.keys(ROTULOS_FORMATO_ORG).map(function (f) { return '<option value="' + f + '">' + ROTULOS_FORMATO_ORG[f] + "</option>"; }).join("") +
        "</select></div></div>" +
      "</div>" +
      '<div class="campo" style="margin-bottom:14px;"><label>Tags (separadas por virgula)</label><input type="text" name="org-tags" placeholder="Ex.: gancho forte, prova social, humor" /></div>' +
      '<div class="campo" style="margin-bottom:14px;"><label>Observacao (opcional — por que essa referencia e boa)</label><textarea name="org-observacao" placeholder="O que copiar dessa estrutura..."></textarea></div>' +
      '<div class="campo" style="margin-bottom:6px;"><label>Midia (opcional — 1 video ou imagem, ate 40MB; video ate 19MB para transcrever)</label>' +
        '<input type="file" name="org-arquivo" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" /></div>' +
      '<div class="ct-form-acoes">' +
        '<button class="btn-toolbar" data-act="org-salvar">Salvar referencia</button>' +
        '<button class="ct-btn-sec" data-act="org-cancelar">Cancelar</button>' +
      "</div>" +
      '<div class="ct-erro-form" id="org-form-erro"></div>' +
    "</div>";
  }

  function ligarSwipeOrganico(root, filtrados) {
    var buscaEl = root.querySelector("#org-f-busca");
    if (buscaEl) {
      buscaEl.addEventListener("input", function () {
        orgFiltro.busca = this.value;
        var pos = this.selectionStart;
        renderSwipeOrganicoCorpo();
        var novo = document.getElementById("org-f-busca");
        if (novo) { novo.focus(); novo.setSelectionRange(pos, pos); }
      });
    }
    root.querySelectorAll("[data-org-formato]").forEach(function (b) {
      b.addEventListener("click", function () { orgFiltro.formato = b.getAttribute("data-org-formato"); renderSwipeOrganicoCorpo(); });
    });
    root.querySelectorAll(".card .btn-exp").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".card");
        var aberto = card.classList.toggle("aberto");
        btn.textContent = aberto ? "Recolher" : "Expandir";
      });
    });
    root.querySelectorAll("[data-org-copiar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var item = filtrados[Number(b.getAttribute("data-org-copiar"))];
        copiarTexto(item.transcricao || "", b);
      });
    });
    root.querySelectorAll("[data-org-transcrever]").forEach(function (b) {
      b.addEventListener("click", function () {
        var item = filtrados[Number(b.getAttribute("data-org-transcrever"))];
        b.disabled = true;
        b.textContent = "Transcrevendo...";
        api("/api/paid-ads/swipe-organico-acao", { method: "POST", timeoutMs: 180000, body: { id: item.id, acao: "transcrever" } })
          .then(renderSwipeOrganico)
          .catch(function (err) {
            b.disabled = false;
            b.textContent = "Transcrever";
            pulsarAlert("Erro: " + (err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message));
          });
      });
    });
    root.querySelectorAll("[data-org-excluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var item = filtrados[Number(b.getAttribute("data-org-excluir"))];
        pulsarConfirm('Excluir a referencia de "' + item.origem + '"? A midia do item tambem sera apagada.').then(function (ok) {
          if (!ok) return;
          api("/api/paid-ads/swipe-organico-acao", { method: "POST", body: { id: item.id, acao: "excluir" } })
            .then(renderSwipeOrganico)
            .catch(function (err) { pulsarAlert("Erro: " + err.message); });
        });
      });
    });
    ligarFormOrganico(root);
  }

  function ligarFormOrganico(root) {
    var form = root.querySelector("#org-form");
    if (!form) return;
    form.querySelector('[data-act="org-cancelar"]').addEventListener("click", function () { orgFormAberto = false; renderSwipeOrganicoCorpo(); });
    form.querySelector('[data-act="org-salvar"]').addEventListener("click", function () {
      var btn = this;
      var erroEl = form.querySelector("#org-form-erro");
      var origem = form.querySelector('[name="org-origem"]').value.trim();
      if (!origem) { erroEl.textContent = "Preencha a origem (criador ou concorrente)."; return; }
      var input = form.querySelector('[name="org-arquivo"]');
      var arquivo = input.files && input.files[0] ? input.files[0] : null;
      if (arquivo && arquivo.size > 40 * 1024 * 1024) { erroEl.textContent = "Midia acima de 40MB. Envie um arquivo menor."; return; }
      erroEl.textContent = "";
      btn.disabled = true;
      btn.textContent = "Salvando...";

      var lerArquivo = arquivo
        ? new Promise(function (ok, falha) {
            var leitor = new FileReader();
            leitor.onload = function () { ok({ nome: arquivo.name, mime: arquivo.type, base64: String(leitor.result).split(",")[1] || "" }); };
            leitor.onerror = function () { falha(new Error("Falha ao ler " + arquivo.name)); };
            leitor.readAsDataURL(arquivo);
          })
        : Promise.resolve(null);

      lerArquivo
        .then(function (lido) {
          return api("/api/paid-ads/swipe-organico", {
            method: "POST",
            timeoutMs: 180000,
            body: {
              origem: origem,
              link: form.querySelector('[name="org-link"]').value.trim(),
              nicho: form.querySelector('[name="org-nicho"]').value.trim(),
              formato: form.querySelector('[name="org-formato"]').value,
              tags: form.querySelector('[name="org-tags"]').value,
              observacao: form.querySelector('[name="org-observacao"]').value,
              arquivo: lido
            }
          });
        })
        .then(function () { orgFormAberto = false; renderSwipeOrganico(); })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = "Salvar referencia";
          erroEl.textContent = err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message;
        });
    });
  }

  // ---------------------------------------------------------------------
  // AREA: DESIGNER IA v1 (Etapa 5.4)
  // Conceito visual + copy da arte + direcao de arte + imagem base.
  // A ARTE FINAL e finalizada no Canva — o modulo nao promete arte pronta.
  // ---------------------------------------------------------------------
  var dgInfo = null; // GET /designer (formatos, disponibilidade)
  var dgFormato = "feed";
  var dgUltimo = null; // ultima geracao (para salvar na Biblioteca)
  var dgImagem = null; // { base64, mime, modelo } da imagem base gerada

  var TIPO_BIB_POR_FORMATO_DG = { feed: "estatico", story: "story", capa_carrossel: "carrossel", anuncio: "anuncio" };

  function renderDesigner() {
    var root = document.getElementById("designer-root");
    var topo = document.getElementById("designer-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Designer IA...");
    Promise.all([api("/api/paid-ads/designer"), api("/api/paid-ads/clients")])
      .then(function (r) {
        dgInfo = r[0];
        estado.clientes = r[1].clientes || [];
        if (topo) {
          topo.innerHTML = (dgInfo.disponivel
            ? '<span class="ct-badge conectado">IA: ' + esc(dgInfo.provider || "?") + "</span>"
            : '<span class="ct-badge off" title="' + esc(dgInfo.aviso || "") + '">IA nao configurada</span>') +
            (dgInfo.imagemDisponivel
              ? '<span class="ct-badge conectado">Imagem: gemini</span>'
              : '<span class="ct-badge off" title="' + esc(dgInfo.avisoImagem || "") + '">Imagem indisponivel</span>');
        }
        var h = '<div class="ct-nota">O Designer entrega conceito, copy da arte, direcao de arte e imagem base. ' +
                "NAO e a arte final: a finalizacao e feita no Canva.</div>";
        if (!dgInfo.disponivel) {
          h += '<div class="ct-nota">' + esc(dgInfo.aviso || "Configure a chave de IA no backend.") + "</div>";
        }
        h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Briefing da arte</h3>' +
             '<span class="contador"><span class="ct-periodo" id="dg-formatos">' +
             dgInfo.formatos.map(function (f) {
               return '<button data-formato="' + f.id + '"' + (f.id === dgFormato ? ' class="ativo"' : "") + ' title="' + esc(f.proporcao) + '">' + esc(f.titulo) + "</button>";
             }).join("") + "</span></span></div>" +
             '<div style="padding:18px 20px;">' +
               '<div class="ct-form-grid">' +
                 '<div class="campo"><label>Cliente</label><div class="select-wrap"><select id="dg-cliente">' +
                   '<option value="">— sem cliente —</option>' +
                   estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nome) + "</option>"; }).join("") +
                 "</select></div></div>" +
                 '<div class="campo"><label>Nicho</label><div class="select-wrap"><select id="dg-nicho">' +
                   ["medica", "estetica", "odonto", "outro"].map(function (n) { return '<option value="' + n + '">' + n + "</option>"; }).join("") +
                 "</select></div></div>" +
                 '<div class="campo"><label>Estilo</label><input type="text" id="dg-estilo" placeholder="Ex.: dark premium, clean com foto real" /></div>' +
               "</div>" +
               '<div class="campo" style="margin-bottom:14px;"><label>Objetivo da arte *</label><input type="text" id="dg-objetivo" placeholder=\'Ex.: "anunciar avaliacao gratuita de implante" ou "post de autoridade sobre harmonizacao"\' style="width:100%;" /></div>' +
               '<div class="campo" style="margin-bottom:16px;"><label>Copy base (opcional — cole a copy aprovada do Redator ou da Biblioteca)</label><textarea id="dg-copybase" placeholder="Cole aqui a copy que a arte precisa acompanhar..."></textarea></div>' +
               '<button class="btn-toolbar" data-act="dg-gerar"' + (dgInfo.disponivel ? "" : " disabled") + ">Gerar conceito</button>" +
             "</div></div>" +
             '<div id="dg-resultado"></div>';
        root.innerHTML = h;

        root.querySelectorAll("#dg-formatos [data-formato]").forEach(function (b) {
          b.addEventListener("click", function () {
            dgFormato = b.getAttribute("data-formato");
            root.querySelectorAll("#dg-formatos button").forEach(function (x) { x.classList.remove("ativo"); });
            b.classList.add("ativo");
          });
        });
        var btnGerar = root.querySelector('[data-act="dg-gerar"]');
        if (btnGerar) btnGerar.addEventListener("click", gerarConceitoDesigner);
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderDesigner);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function gerarConceitoDesigner() {
    var alvo = document.getElementById("dg-resultado");
    var objetivo = (document.getElementById("dg-objetivo") || {}).value || "";
    if (!objetivo.trim()) {
      alvo.innerHTML = '<div class="ct-resultado erro">Preencha o objetivo da arte antes de gerar.</div>';
      return;
    }
    alvo.innerHTML = spinner("Gerando conceito com IA (pode levar ate 1 minuto)...");
    dgUltimo = null;
    dgImagem = null;
    api("/api/paid-ads/designer", {
      method: "POST",
      timeoutMs: 120000,
      body: {
        formato: dgFormato,
        clienteId: (document.getElementById("dg-cliente") || {}).value || "",
        nicho: (document.getElementById("dg-nicho") || {}).value || "",
        estilo: (document.getElementById("dg-estilo") || {}).value || "",
        objetivo: objetivo,
        copyBase: (document.getElementById("dg-copybase") || {}).value || ""
      }
    })
      .then(function (r) {
        dgUltimo = r;
        renderResultadoDesigner(alvo, r);
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, gerarConceitoDesigner); });
  }

  function textoParaCopiarDesigner(c) {
    var linhas = ["CONCEITO:", c.conceito, ""];
    linhas.push("COPY DA ARTE:");
    linhas.push("Titulo: " + c.copyDaArte.titulo);
    if (c.copyDaArte.apoio) linhas.push("Apoio: " + c.copyDaArte.apoio);
    if (c.copyDaArte.cta) linhas.push("CTA: " + c.copyDaArte.cta);
    linhas.push("", "DIRECAO DE ARTE:");
    (c.direcaoDeArte.paleta || []).forEach(function (p) { linhas.push("- " + p.cor + " (" + p.uso + ")"); });
    if (c.direcaoDeArte.tipografia) linhas.push("Tipografia: " + c.direcaoDeArte.tipografia);
    if (c.direcaoDeArte.composicao) linhas.push("Composicao: " + c.direcaoDeArte.composicao);
    if (c.direcaoDeArte.estilo) linhas.push("Estilo: " + c.direcaoDeArte.estilo);
    (c.direcaoDeArte.referencias || []).forEach(function (r) { linhas.push("Ref: " + r); });
    if (c.promptImagem) linhas.push("", "PROMPT DA IMAGEM BASE:", c.promptImagem);
    return linhas.join("\n").trim();
  }

  function renderResultadoDesigner(alvo, r) {
    var c = r.conceito;
    var da = c.direcaoDeArte || {};
    var corpo = '<div class="ct-diag-resumo" style="margin-bottom:14px;">' + esc(c.conceito) + "</div>";

    corpo += '<div class="ct-diag-bloco" style="margin-bottom:12px;"><h4 style="color:var(--accent-hover);">Copy da arte</h4>' +
      '<p style="font-size:17px;font-weight:700;color:var(--text);">' + esc(c.copyDaArte.titulo) + "</p>" +
      (c.copyDaArte.apoio ? '<p style="font-size:13.5px;color:var(--text-2);margin-top:4px;">' + esc(c.copyDaArte.apoio) + "</p>" : "") +
      (c.copyDaArte.cta ? '<p style="font-size:12.5px;color:var(--accent-hover);font-weight:600;margin-top:8px;">CTA: ' + esc(c.copyDaArte.cta) + "</p>" : "") +
      "</div>";

    corpo += '<div class="ct-diag-grid">';
    if ((da.paleta || []).length) {
      corpo += '<div class="ct-diag-bloco"><h4 style="color:var(--accent-hover);">Paleta</h4><div class="dg-paleta">' +
        da.paleta.map(function (p) {
          var cor = /^#[0-9a-fA-F]{3,8}$/.test(p.cor) ? p.cor : "#888888";
          return '<span class="dg-swatch"><span class="cor" style="background:' + esc(cor) + ';"></span><span class="hex">' + esc(p.cor) + '</span><span class="uso">' + esc(p.uso) + "</span></span>";
        }).join("") + "</div></div>";
    }
    corpo += '<div class="ct-diag-bloco"><h4 style="color:var(--accent-hover);">Tipografia</h4><p style="font-size:13.5px;color:var(--text-2);">' + esc(da.tipografia) + "</p></div>" +
      '<div class="ct-diag-bloco"><h4 style="color:var(--accent-hover);">Composicao</h4><p style="font-size:13.5px;color:var(--text-2);">' + esc(da.composicao) + "</p></div>" +
      '<div class="ct-diag-bloco"><h4 style="color:var(--accent-hover);">Estilo</h4><p style="font-size:13.5px;color:var(--text-2);">' + esc(da.estilo) +
      ((da.referencias || []).length ? '</p><ul style="list-style:none;margin-top:8px;display:flex;flex-direction:column;gap:5px;">' + da.referencias.map(function (x) { return '<li style="font-size:12.5px;color:var(--text-3);">Ref: ' + esc(x) + "</li>"; }).join("") + "</ul>" : "</p>") +
      "</div></div>";

    corpo += blocoTexto("Prompt da imagem base (em ingles)", c.promptImagem);

    corpo += '<div id="dg-imagem-area" style="margin-top:14px;">' +
      (r.imagemDisponivel
        ? '<button class="ct-btn-sec" data-act="dg-imagem">Gerar imagem base</button>'
        : '<div class="ct-nota" style="margin-bottom:0;">' + esc((dgInfo && dgInfo.avisoImagem) || "Imagem base indisponivel: configure GEMINI_API_KEY no backend.") + "</div>") +
      "</div>";

    alvo.innerHTML =
      '<div class="painel"><div class="painel-topo"><h3>' + esc(c.titulo || "Conceito da arte") + "</h3>" +
      '<span class="contador"><span class="ct-badge conectado">IA: ' + esc(r.provider) + "</span>" +
      (r.clienteNome ? ' <span class="ct-badge neutro">' + esc(r.clienteNome) + "</span>" : "") + "</span></div>" +
      '<div style="padding:18px 20px;">' + corpo +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">' +
        '<button class="btn-toolbar" data-act="dg-copiar">Copiar tudo</button>' +
        '<button class="ct-btn-sec" data-act="dg-salvar">Salvar na Biblioteca (rascunho)</button>' +
        '<button class="ct-btn-sec" data-act="dg-salvar-aprovado">Salvar como aprovado</button>' +
      "</div>" +
      '<div id="dg-salvo" style="margin-top:8px;"></div>' +
      "</div></div>";

    alvo.querySelector('[data-act="dg-copiar"]').addEventListener("click", function () {
      copiarTexto(textoParaCopiarDesigner(c), this);
    });
    alvo.querySelector('[data-act="dg-salvar"]').addEventListener("click", function () { salvarDesignerNaBiblioteca("rascunho", this); });
    alvo.querySelector('[data-act="dg-salvar-aprovado"]').addEventListener("click", function () { salvarDesignerNaBiblioteca("aprovado", this); });
    var btnImg = alvo.querySelector('[data-act="dg-imagem"]');
    if (btnImg) btnImg.addEventListener("click", gerarImagemDesigner);
  }

  function gerarImagemDesigner() {
    var area = document.getElementById("dg-imagem-area");
    if (!area || !dgUltimo) return;
    area.innerHTML = spinner("Gerando imagem base (pode levar 1-2 minutos)...");
    api("/api/paid-ads/designer-imagem", {
      method: "POST",
      timeoutMs: 180000,
      body: { prompt: dgUltimo.conceito.promptImagem }
    })
      .then(function (r) {
        dgImagem = r;
        area.innerHTML =
          '<div class="dg-imagem"><img src="data:' + esc(r.mime) + ";base64," + r.base64 + '" alt="Imagem base gerada" />' +
          '<div class="acoes"><a class="ct-btn-sec" download="imagem-base.png" href="data:' + esc(r.mime) + ";base64," + r.base64 + '">Baixar imagem</a>' +
          '<button class="ct-btn-sec" data-act="dg-imagem-de-novo">Gerar outra</button></div>' +
          '<p class="dg-imagem-nota">Imagem BASE (' + esc(r.modelo) + "): leve para o Canva e aplique a copy e a identidade do cliente.</p></div>";
        var btn = area.querySelector('[data-act="dg-imagem-de-novo"]');
        if (btn) btn.addEventListener("click", gerarImagemDesigner);
      })
      .catch(function (err) {
        area.innerHTML = erroBloco(err);
        ligarRetry(area, gerarImagemDesigner);
      });
  }

  function salvarDesignerNaBiblioteca(status, btn) {
    if (!dgUltimo) return;
    var alvo = document.getElementById("dg-salvo");
    var c = dgUltimo.conceito;
    var titulo = c.titulo || c.copyDaArte.titulo || "Conceito de arte";
    var copy = textoParaCopiarDesigner(c);
    var tipo = TIPO_BIB_POR_FORMATO_DG[dgUltimo.formato] || "estatico";
    btn.disabled = true;

    var chamada = dgImagem
      ? api("/api/paid-ads/biblioteca-upload", {
          method: "POST",
          timeoutMs: 180000,
          body: {
            titulo: titulo,
            clienteId: dgUltimo.clienteId || "",
            tipo: tipo,
            status: status,
            copy: copy,
            arquivos: [{ nome: "imagem-base.png", mime: dgImagem.mime, base64: dgImagem.base64 }]
          }
        })
      : api("/api/paid-ads/biblioteca", {
          method: "POST",
          body: {
            titulo: titulo,
            clienteId: dgUltimo.clienteId || "",
            tipo: tipo,
            status: status,
            origem: "manual",
            conteudo: { copy: copy }
          }
        });

    chamada
      .then(function () {
        alvo.innerHTML = '<div class="ct-resultado ok">Salvo na Biblioteca como <b>' + status + "</b>" +
          (dgImagem ? " (com a imagem base anexada)" : "") + ".</div>";
        btn.disabled = false;
      })
      .catch(function (err) {
        alvo.innerHTML = '<div class="ct-resultado erro">' + esc(err.offline ? "Backend offline. Inicie o servico Paid Ads." : err.message) + "</div>";
        btn.disabled = false;
      });
  }

  // ---------------------------------------------------------------------
  // Integracao com a navegacao do app
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // AREA: RELATORIOS (Entregas) — fluxo principal de geracao
  // Gera o relatorio de qualquer cliente sem entrar na pagina do Gestor.
  // Padrao de periodo: 01 do mes corrente ate hoje (mes ate agora).
  // ---------------------------------------------------------------------
  var relState = { clienteId: "", since: "", until: "", atalho: "mes", calMes: "", calStart: null };

  function mesAteHoje() {
    var d = new Date();
    var y = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return { since: y + "-" + mm + "-01", until: y + "-" + mm + "-" + dd };
  }

  function renderRelatorios() {
    var root = document.getElementById("relatorios-root");
    if (!root) return;
    root.innerHTML = spinner("Carregando clientes...");
    api("/api/paid-ads/clients")
      .then(function (r) {
        estado.clientes = r.clientes || [];
        if (!relState.since) aplicarAtalhoPeriodo("mes");
        if (!relState.clienteId && estado.clientes.length) relState.clienteId = estado.clientes[0].id;
        renderRelatoriosCorpo();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderRelatorios);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function renderRelatoriosCorpo() {
    var root = document.getElementById("relatorios-root");
    if (!root) return;
    if (!estado.clientes.length) {
      root.innerHTML = '<div class="painel"><div class="vazio">Cadastre um cliente na area <b>Clientes</b> para gerar relatorios.</div></div>';
      return;
    }
    var cli = buscarCliente(relState.clienteId) || estado.clientes[0];
    var tipo = cli.tipoRelatorio || "leadgen";
    var rotTipo = { leadgen: "Leadgen (leads + CPL)", ecommerce: "E-commerce (conversoes + ROAS)", branding: "Branding" };

    var h = '<div class="painel ct-secao"><div style="padding:20px 22px;">' +
      '<div class="ct-form-grid" style="margin-bottom:16px;">' +
        '<div class="campo"><label>Cliente</label><div class="rel-combo" id="rel-combo">' +
          '<input type="text" id="rel-cliente-input" class="rel-combo-input" autocomplete="off" spellcheck="false" placeholder="Buscar cliente..." value="' + esc(cli.nome) + '" />' +
          '<span class="rel-combo-seta">&#9662;</span>' +
          '<div class="rel-combo-list" id="rel-cliente-list" style="display:none;"></div>' +
        "</div></div>" +
        '<div class="campo"><label>Periodo</label><div class="relcal-wrap">' +
          '<button type="button" class="relcal-btn" data-act="rel-periodo-toggle"><span id="rel-periodo-label">' + esc(relPeriodoTexto()) + '</span><span class="seta">&#9662;</span></button>' +
          '<div class="relcal-panel" id="rel-cal-panel" style="display:none;"></div>' +
        "</div></div>" +
      "</div>" +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
        '<button class="btn-toolbar" data-act="rel-gerar">Gerar relatorio</button>' +
        '<span class="ct-badge neutro">Tipo: ' + esc(rotTipo[tipo] || tipo) + "</span>" +
        '<span style="font-size:12px;color:var(--text-3);">O tipo vem do cadastro do cliente.</span>' +
      "</div>" +
      '<div id="rel-resultado" style="margin-top:16px;"></div>' +
      "</div></div>" +
      '<div class="painel ct-secao"><div class="painel-topo"><h3>Historico deste cliente</h3></div>' +
      '<div id="rel-historico" style="padding:8px 12px 12px;">' + spinner("Carregando historico...") + "</div></div>";

    root.innerHTML = h;

    ligarComboClientes(cli);
    ligarSeletorPeriodo(root);
    root.querySelector('[data-act="rel-gerar"]').addEventListener("click", function () { gerarRelatorioTela(cli); });
    carregarHistoricoRel(cli);
  }

  // Combobox pesquisavel de cliente (digitar filtra; clicar seleciona).
  function ligarComboClientes(cliAtual) {
    var wrap = document.getElementById("rel-combo");
    var input = document.getElementById("rel-cliente-input");
    var list = document.getElementById("rel-cliente-list");
    if (!wrap || !input || !list) return;
    var idx = -1; // item destacado pelo teclado
    var filtrados = estado.clientes.slice();

    function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
    function nomeSelecionado() { return (buscarCliente(relState.clienteId) || cliAtual).nome; }
    function aberto() { return list.style.display === "block"; }

    function renderLista(termo) {
      var q = norm(termo);
      filtrados = estado.clientes.filter(function (c) { return !q || norm(c.nome).indexOf(q) >= 0; });
      if (!filtrados.length) { list.innerHTML = '<div class="rel-combo-vazio">Nenhum cliente encontrado</div>'; return; }
      list.innerHTML = filtrados.map(function (c, i) {
        return '<div class="rel-combo-item' + (c.id === relState.clienteId ? " sel" : "") + (i === idx ? " ativo" : "") +
          '" data-id="' + esc(c.id) + '" data-i="' + i + '">' + esc(c.nome) + "</div>";
      }).join("");
      list.querySelectorAll("[data-id]").forEach(function (el) {
        // mousedown (nao click) para nao perder o foco antes de selecionar.
        el.addEventListener("mousedown", function (e) { e.preventDefault(); escolher(el.getAttribute("data-id")); });
      });
    }
    function abrir(mostrarTudo) { list.style.display = "block"; renderLista(mostrarTudo ? "" : input.value); }
    function fechar() { list.style.display = "none"; idx = -1; }
    function escolher(id) { relState.clienteId = id; fechar(); renderRelatoriosCorpo(); }

    input.addEventListener("focus", function () { input.select(); idx = -1; abrir(true); });
    input.addEventListener("input", function () { idx = -1; if (!aberto()) list.style.display = "block"; renderLista(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!aberto()) abrir(true); idx = Math.min(idx + 1, filtrados.length - 1); renderLista(input.value); rolarAtivo(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); renderLista(input.value); rolarAtivo(); }
      else if (e.key === "Enter") { e.preventDefault(); var alvo = filtrados[idx >= 0 ? idx : 0]; if (alvo) escolher(alvo.id); }
      else if (e.key === "Escape") { fechar(); input.value = nomeSelecionado(); input.blur(); }
    });
    function rolarAtivo() { var el = list.querySelector('[data-i="' + idx + '"]'); if (el) el.scrollIntoView({ block: "nearest" }); }

    wrap.querySelector(".rel-combo-seta").addEventListener("mousedown", function (e) {
      e.preventDefault();
      if (aberto()) fechar();
      else { input.focus(); input.select(); abrir(true); }
    });
    document.addEventListener("click", function fecharFora(ev) {
      if (!wrap.parentNode) { document.removeEventListener("click", fecharFora); return; }
      if (!wrap.contains(ev.target)) { fechar(); if (input.parentNode) input.value = nomeSelecionado(); }
    });
  }

  // ---------- Seletor de periodo estilizado (sem input date nativo) ----------
  var REL_MESES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  function relPad(n) { return String(n).padStart(2, "0"); }
  function relIso(y, m, d) { return y + "-" + relPad(m) + "-" + relPad(d); }
  function relDdmmaa(iso) { var p = String(iso).split("-"); return p[2] + "/" + p[1] + "/" + p[0].slice(2); }

  function relPeriodoTexto() {
    var nomes = { mes: "Mes ate hoje", mespassado: "Mes passado", "7dias": "Ultimos 7 dias", custom: "Personalizado" };
    return (nomes[relState.atalho] || "Personalizado") + " · " + relDdmmaa(relState.since) + " ate " + relDdmmaa(relState.until);
  }

  function relDdmmaaaa(iso) { var p = String(iso).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

  // Aceita dd/mm/aaaa ou dd/mm/aa (tambem com - ou .). Valida dia/mes reais.
  function relParseData(s) {
    var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (y < 100) y += 2000;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return relIso(y, mo, d);
  }

  function aplicarAtalhoPeriodo(nome) {
    var d = new Date(), y = d.getFullYear(), m = d.getMonth();
    if (nome === "mes") { relState.since = relIso(y, m + 1, 1); relState.until = relIso(y, m + 1, d.getDate()); }
    else if (nome === "mespassado") { var pm = new Date(y, m - 1, 1); var ult = new Date(y, m, 0).getDate(); relState.since = relIso(pm.getFullYear(), pm.getMonth() + 1, 1); relState.until = relIso(pm.getFullYear(), pm.getMonth() + 1, ult); }
    else if (nome === "7dias") { var ini = new Date(d.getTime() - 6 * 86400000); relState.since = relIso(ini.getFullYear(), ini.getMonth() + 1, ini.getDate()); relState.until = relIso(y, m + 1, d.getDate()); }
    relState.atalho = nome;
    relState.calMes = relState.until.slice(0, 7);
    relState.calStart = null;
  }

  function htmlPainelPeriodo() {
    var atalhos = [["mes", "Mes ate hoje"], ["mespassado", "Mes passado"], ["7dias", "Ultimos 7 dias"]];
    var h = '<div class="relcal-atalhos">' + atalhos.map(function (a) {
      return '<button type="button" class="relcal-atalho' + (relState.atalho === a[0] ? " ativo" : "") + '" data-cal-atalho="' + a[0] + '">' + a[1] + "</button>";
    }).join("") + "</div>";
    var ym = (relState.calMes || relState.until.slice(0, 7)).split("-");
    var y = Number(ym[0]), m = Number(ym[1]) - 1;
    var inicioSemana = new Date(y, m, 1).getDay();
    var totalDias = new Date(y, m + 1, 0).getDate();
    h += '<div class="relcal-head"><button type="button" class="relcal-nav" data-cal-nav="-1">&#8249;</button>' +
         "<span>" + REL_MESES[m] + " de " + y + "</span>" +
         '<button type="button" class="relcal-nav" data-cal-nav="1">&#8250;</button></div>';
    h += '<div class="relcal-grid">' + ["D", "S", "T", "Q", "Q", "S", "S"].map(function (d) { return '<span class="relcal-dow">' + d + "</span>"; }).join("");
    for (var i = 0; i < inicioSemana; i++) h += "<span></span>";
    for (var dia = 1; dia <= totalDias; dia++) {
      var iso = relIso(y, m + 1, dia);
      var borda = iso === relState.since || iso === relState.until;
      var dentro = iso > relState.since && iso < relState.until;
      h += '<button type="button" class="relcal-dia' + (borda ? " sel" : "") + (dentro ? " dentro" : "") + '" data-cal-dia="' + iso + '">' + dia + "</button>";
    }
    h += "</div>";
    // Digitacao manual do periodo (alem do clique no calendario).
    h += '<div class="relcal-datas">' +
      '<input id="relcal-de" class="relcal-data-in" inputmode="numeric" placeholder="dd/mm/aaaa" value="' + relDdmmaaaa(relState.since) + '" spellcheck="false" />' +
      '<span class="relcal-sep">ate</span>' +
      '<input id="relcal-ate" class="relcal-data-in" inputmode="numeric" placeholder="dd/mm/aaaa" value="' + relDdmmaaaa(relState.until) + '" spellcheck="false" />' +
      '<button type="button" class="btn-sm salvar" data-cal-aplicar>OK</button></div>';
    return h;
  }

  function atualizarPainelPeriodo(root) {
    var panel = document.getElementById("rel-cal-panel");
    if (panel) panel.innerHTML = htmlPainelPeriodo();
    var lbl = document.getElementById("rel-periodo-label");
    if (lbl) lbl.textContent = relPeriodoTexto();
    ligarPainelPeriodo(root);
  }

  function ligarPainelPeriodo(root) {
    var panel = document.getElementById("rel-cal-panel");
    if (!panel) return;
    panel.querySelectorAll("[data-cal-atalho]").forEach(function (b) {
      b.addEventListener("click", function () { aplicarAtalhoPeriodo(b.getAttribute("data-cal-atalho")); atualizarPainelPeriodo(root); });
    });
    panel.querySelectorAll("[data-cal-nav]").forEach(function (b) {
      b.addEventListener("click", function () {
        var ym = (relState.calMes || relState.until.slice(0, 7)).split("-");
        var d = new Date(Number(ym[0]), Number(ym[1]) - 1 + Number(b.getAttribute("data-cal-nav")), 1);
        relState.calMes = d.getFullYear() + "-" + relPad(d.getMonth() + 1);
        atualizarPainelPeriodo(root);
      });
    });
    panel.querySelectorAll("[data-cal-dia]").forEach(function (b) {
      b.addEventListener("click", function () {
        var iso = b.getAttribute("data-cal-dia");
        if (!relState.calStart) { relState.calStart = iso; relState.since = iso; relState.until = iso; }
        else {
          if (iso < relState.calStart) { relState.since = iso; relState.until = relState.calStart; }
          else { relState.since = relState.calStart; relState.until = iso; }
          relState.calStart = null;
        }
        relState.atalho = "custom";
        atualizarPainelPeriodo(root);
      });
    });
    // Periodo digitado (dd/mm/aaaa): aplica com OK ou Enter.
    function aplicarDigitado() {
      var de = relParseData((document.getElementById("relcal-de") || {}).value);
      var ate = relParseData((document.getElementById("relcal-ate") || {}).value);
      if (!de || !ate) { pulsarAlert("Data invalida. Use o formato dd/mm/aaaa."); return; }
      if (de > ate) { var t = de; de = ate; ate = t; }
      relState.since = de;
      relState.until = ate;
      relState.atalho = "custom";
      relState.calMes = ate.slice(0, 7);
      relState.calStart = null;
      atualizarPainelPeriodo(root);
      panel.style.display = "none";
    }
    var btnAplicar = panel.querySelector("[data-cal-aplicar]");
    if (btnAplicar) btnAplicar.addEventListener("click", aplicarDigitado);
    panel.querySelectorAll(".relcal-data-in").forEach(function (inp) {
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); aplicarDigitado(); } });
    });
  }

  function ligarSeletorPeriodo(root) {
    var btn = root.querySelector('[data-act="rel-periodo-toggle"]');
    var panel = document.getElementById("rel-cal-panel");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = panel.style.display === "none";
      panel.style.display = abrir ? "block" : "none";
      if (abrir) { relState.calMes = relState.until.slice(0, 7); relState.calStart = null; atualizarPainelPeriodo(root); }
    });
    // fecha ao clicar fora
    document.addEventListener("click", function fechar(ev) {
      if (!panel) return;
      if (!panel.parentNode) { document.removeEventListener("click", fechar); return; }
      // Clique em elemento que o re-render interno removeu do DOM (ex.: seta de
      // mes): contains() daria falso e fecharia sem querer. Ignorar.
      if (ev.target && !ev.target.isConnected) return;
      if (!panel.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) panel.style.display = "none";
    });
  }

  var relCampos = null; // campos estruturados do relatorio atual (editaveis)

  // Assembla o texto final do WhatsApp a partir dos campos (espelha o backend).
  function montarTextoRel(campos) {
    return campos.map(function (l) {
      if (l.tipo === "espaco") return "";
      if (l.tipo === "texto") return l.valor;
      var v = (l.valor == null ? "" : String(l.valor)).trim();
      if (l.opcional && !v) return null;
      var mid = !v ? "[PREENCHER]" : (v === "—" ? "—" : (l.negrito ? "*" + v + "*" : v));
      return (l.prefixo || "") + mid + (l.sufixo || "");
    }).filter(function (x) { return x != null; }).join("\n");
  }

  // ---------- Secao de otimizacoes + analise IA (opcional) ----------
  var REL_MARCADOR = "🔧 *Otimizações realizadas no período:*";
  var relOtim = { bullets: [], analise: "", biblioteca: [], changelog: [], catAberta: null };

  function relParsearFrase(frase) {
    var partes = [], re = /\[([^\]]+)\]/g, last = 0, m;
    while ((m = re.exec(frase))) {
      if (m.index > last) partes.push({ tipo: "fixo", valor: frase.slice(last, m.index) });
      partes.push({ tipo: "var", nome: m[1], valor: "" });
      last = m.index + m[0].length;
    }
    if (last < frase.length) partes.push({ tipo: "fixo", valor: frase.slice(last) });
    if (!partes.length) partes.push({ tipo: "fixo", valor: frase });
    return partes;
  }
  function relTextoBullet(b) {
    return b.partes.map(function (p) {
      if (p.tipo === "fixo") return p.valor;
      if (p.tipo === "var") return p.valor.trim() ? p.valor.trim() : "[" + p.nome + "]";
      return p.valor; // livre
    }).join("").trim();
  }
  function relBulletsTextos() {
    return relOtim.bullets.map(relTextoBullet).filter(function (t) { return t; });
  }
  function relMontarSecao() {
    var bs = relBulletsTextos();
    if (!bs.length) return "";
    var s = REL_MARCADOR + "\n" + bs.map(function (t) { return "- " + t; }).join("\n");
    var a = (relOtim.analise || "").trim();
    if (a) s += "\n\n" + a;
    return s;
  }
  // Reescreve a secao no texto final SEM tocar no que o Luis editou nas metricas
  // (remove do marcador ate o fim e re-anexa a secao montada, sempre por ultimo).
  function relInserirSecao() {
    var ta = document.getElementById("rel-final");
    if (!ta) return;
    var txt = ta.value;
    var idx = txt.indexOf(REL_MARCADOR);
    if (idx >= 0) txt = txt.slice(0, idx);
    txt = txt.replace(/\s+$/, "");
    var secao = relMontarSecao();
    if (secao) txt += "\n\n" + secao;
    ta.value = txt;
  }
  function relRenderBullets() {
    var alvo = document.getElementById("rel-otim-bullets");
    if (!alvo) return;
    if (!relOtim.bullets.length) {
      alvo.innerHTML = '<div class="rel-otim-vazio">Nenhuma otimizacao selecionada. A secao so entra no texto quando voce adiciona pelo menos 1 item.</div>';
      return;
    }
    var h = "";
    relOtim.bullets.forEach(function (b, i) {
      h += '<div class="rel-otim-bullet"><span class="rel-otim-marca">&#8226;</span><span class="rel-otim-campos">';
      b.partes.forEach(function (p, j) {
        if (p.tipo === "fixo") h += '<span class="rel-otim-fixo">' + esc(p.valor) + "</span>";
        else if (p.tipo === "var") h += '<input class="rel-otim-var" data-b="' + i + '" data-p="' + j + '" value="' + esc(p.valor) + '" placeholder="' + esc(p.nome) + '" spellcheck="false" />';
        else h += '<input class="rel-otim-livre-in" data-b="' + i + '" data-p="' + j + '" value="' + esc(p.valor) + '" spellcheck="false" />';
      });
      h += '</span><button class="rel-otim-x" data-remove="' + i + '" title="Remover">&times;</button></div>';
    });
    alvo.innerHTML = h;
    alvo.querySelectorAll("input[data-p]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        relOtim.bullets[Number(inp.getAttribute("data-b"))].partes[Number(inp.getAttribute("data-p"))].valor = inp.value;
        relInserirSecao();
      });
    });
    alvo.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        relOtim.bullets.splice(Number(btn.getAttribute("data-remove")), 1);
        relRenderBullets();
        relInserirSecao();
      });
    });
  }
  function relAddBullet(partes) {
    relOtim.bullets.push({ partes: partes });
    relRenderBullets();
    relInserirSecao();
  }
  var relOtimFraseEditando = null; // { catId, indice } enquanto uma frase da biblioteca esta em edicao

  function relRenderBiblioteca() {
    var alvo = document.getElementById("rel-otim-lib");
    if (!alvo) return;
    var h = '<div class="rel-otim-cats">' + relOtim.biblioteca.map(function (c) {
      return '<button type="button" class="rel-otim-cat' + (relOtim.catAberta === c.id ? " ativa" : "") + '" data-cat="' + esc(c.id) + '">' + esc(c.nome) + "</button>";
    }).join("") + "</div>";
    var aberta = relOtim.biblioteca.filter(function (c) { return c.id === relOtim.catAberta; })[0];
    if (aberta) {
      h += '<div class="rel-otim-frases">' + aberta.frases.map(function (f, i) {
        var emEdicao = relOtimFraseEditando && relOtimFraseEditando.catId === aberta.id && relOtimFraseEditando.indice === i;
        if (emEdicao) {
          return '<div class="rel-otim-frase-row rel-otim-frase-editando">' +
            '<input class="rel-otim-frase-edit-in" id="rel-otim-frase-edit-in" value="' + esc(f) + '" spellcheck="false" />' +
            '<button type="button" class="btn-sm salvar" data-salvar-frase="' + i + '">Salvar</button>' +
            '<button type="button" class="rel-otim-x" data-cancelar-edicao title="Cancelar">&times;</button>' +
          "</div>";
        }
        return '<div class="rel-otim-frase-row">' +
          '<button type="button" class="rel-otim-frase" data-frase="' + esc(f) + '">+ ' + esc(f) + "</button>" +
          '<button type="button" class="rel-otim-frase-ico" data-editar-frase="' + i + '" title="Editar">&#9998;</button>' +
          '<button type="button" class="rel-otim-x" data-remover-frase="' + i + '" title="Remover">&times;</button>' +
        "</div>";
      }).join("") + "</div>";
      h += '<div class="rel-otim-addlib"><input id="rel-otim-nova" placeholder="Nova frase para ' + esc(aberta.nome) + ' (use [variavel])" spellcheck="false" />' +
           '<button type="button" class="btn-sm" data-addlib="' + esc(aberta.id) + '">Adicionar a biblioteca</button></div>';
    }
    alvo.innerHTML = h;
    alvo.querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () { relOtimFraseEditando = null; relOtim.catAberta = b.getAttribute("data-cat"); relRenderBiblioteca(); });
    });
    alvo.querySelectorAll("[data-frase]").forEach(function (b) {
      b.addEventListener("click", function () { relAddBullet(relParsearFrase(b.getAttribute("data-frase"))); });
    });
    alvo.querySelectorAll("[data-editar-frase]").forEach(function (b) {
      b.addEventListener("click", function () {
        relOtimFraseEditando = { catId: aberta.id, indice: Number(b.getAttribute("data-editar-frase")) };
        relRenderBiblioteca();
        var inp = document.getElementById("rel-otim-frase-edit-in");
        if (inp) { inp.focus(); inp.select(); }
      });
    });
    alvo.querySelectorAll("[data-remover-frase]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = Number(b.getAttribute("data-remover-frase"));
        pulsarConfirm('Remover a frase "' + aberta.frases[i] + '" da biblioteca?').then(function (ok) {
          if (!ok) return;
          b.disabled = true;
          api("/api/paid-ads/otimizacoes-acao", { method: "POST", body: { categoria: aberta.id, indice: i, acao: "remover" } })
            .then(function (r) { relOtim.biblioteca = r.categorias || relOtim.biblioteca; relRenderBiblioteca(); })
            .catch(function (err) { b.disabled = false; pulsarAlert("Erro ao remover: " + err.message); });
        });
      });
    });
    var cancelar = alvo.querySelector("[data-cancelar-edicao]");
    if (cancelar) cancelar.addEventListener("click", function () { relOtimFraseEditando = null; relRenderBiblioteca(); });
    var salvarBtn = alvo.querySelector("[data-salvar-frase]");
    if (salvarBtn) {
      var confirmarEdicao = function () {
        var inp = document.getElementById("rel-otim-frase-edit-in");
        var nova = (inp.value || "").trim();
        if (!nova) return;
        var i = Number(salvarBtn.getAttribute("data-salvar-frase"));
        salvarBtn.disabled = true;
        api("/api/paid-ads/otimizacoes-acao", { method: "POST", body: { categoria: aberta.id, indice: i, acao: "editar", frase: nova } })
          .then(function (r) { relOtimFraseEditando = null; relOtim.biblioteca = r.categorias || relOtim.biblioteca; relRenderBiblioteca(); })
          .catch(function (err) { salvarBtn.disabled = false; pulsarAlert("Erro ao editar: " + err.message); });
      };
      salvarBtn.addEventListener("click", confirmarEdicao);
      var editIn = document.getElementById("rel-otim-frase-edit-in");
      if (editIn) editIn.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); confirmarEdicao(); }
        else if (e.key === "Escape") { relOtimFraseEditando = null; relRenderBiblioteca(); }
      });
    }
    var addlib = alvo.querySelector("[data-addlib]");
    if (addlib) addlib.addEventListener("click", function () {
      var inp = document.getElementById("rel-otim-nova");
      var frase = (inp.value || "").trim();
      if (!frase) return;
      addlib.disabled = true;
      api("/api/paid-ads/otimizacoes", { method: "POST", body: { categoria: addlib.getAttribute("data-addlib"), frase: frase } })
        .then(function (r) { relOtim.biblioteca = r.categorias || relOtim.biblioteca; relRenderBiblioteca(); })
        .catch(function (err) { addlib.disabled = false; pulsarAlert("Erro ao adicionar: " + err.message); });
    });
  }
  function relRenderChangelog() {
    var alvo = document.getElementById("rel-otim-chg");
    if (!alvo) return;
    if (!relOtim.changelog.length) { alvo.innerHTML = ""; return; }
    alvo.innerHTML = '<div class="rel-otim-sub">Do historico deste cliente</div><div class="rel-otim-frases">' +
      relOtim.changelog.map(function (e, i) { return '<button type="button" class="rel-otim-frase" data-chg="' + i + '">+ ' + esc(e.titulo) + "</button>"; }).join("") + "</div>";
    alvo.querySelectorAll("[data-chg]").forEach(function (b) {
      b.addEventListener("click", function () { relAddBullet([{ tipo: "livre", valor: relOtim.changelog[Number(b.getAttribute("data-chg"))].titulo }]); });
    });
  }
  function relGerarAnalise(cli, btn) {
    var status = document.getElementById("rel-otim-analise-status");
    var bullets = relBulletsTextos();
    if (btn) btn.disabled = true;
    if (status) status.textContent = "Gerando analise...";
    api("/api/paid-ads/clients/" + encodeURIComponent(cli.id) + "/analise-relatorio", {
      method: "POST", timeoutMs: 60000,
      body: { since: relState.since, until: relState.until, bullets: bullets }
    })
      .then(function (r) {
        var taA = document.getElementById("rel-otim-analise-ta");
        if (taA) { taA.value = r.analise || ""; relOtim.analise = taA.value; }
        relInserirSecao();
        if (status) status.textContent = "Analise gerada (edite se quiser).";
        if (btn) btn.disabled = false;
      })
      .catch(function (err) {
        if (status) status.textContent = "";
        if (btn) btn.disabled = false;
        pulsarAlert("Erro na analise IA: " + err.message);
      });
  }
  function relPainelOtimHtml() {
    return '<div class="rel-otim">' +
      '<div class="rel-editor-titulo" style="margin-top:18px;">Otimizacoes realizadas no periodo (opcional)</div>' +
      '<div id="rel-otim-lib"></div>' +
      '<div id="rel-otim-chg"></div>' +
      '<div class="rel-otim-livre-wrap"><input id="rel-otim-livre-add" placeholder="Escrever um item livre..." spellcheck="false" />' +
        '<button class="btn-sm" data-act="rel-otim-livre">Adicionar item</button></div>' +
      '<div id="rel-otim-bullets"></div>' +
      '<div class="rel-otim-analise">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">' +
          '<button class="btn-sm salvar" data-act="rel-otim-analise">Gerar analise (IA)</button>' +
          '<span id="rel-otim-analise-status" style="font-size:12px;color:var(--text-3);"></span></div>' +
        '<textarea id="rel-otim-analise-ta" class="rel-otim-analise-ta" placeholder="A analise gerada aparece aqui, editavel. Entra abaixo dos bullets no texto final." spellcheck="false"></textarea>' +
      "</div></div>";
  }
  function relLigarPainelOtim(cli) {
    relRenderBullets();
    var elLivre = document.querySelector('[data-act="rel-otim-livre"]');
    if (elLivre) elLivre.addEventListener("click", function () {
      var inp = document.getElementById("rel-otim-livre-add");
      var t = (inp.value || "").trim();
      if (!t) return;
      relAddBullet([{ tipo: "livre", valor: t }]);
      inp.value = "";
    });
    var taA = document.getElementById("rel-otim-analise-ta");
    if (taA) taA.addEventListener("input", function () { relOtim.analise = taA.value; relInserirSecao(); });
    var btnA = document.querySelector('[data-act="rel-otim-analise"]');
    if (btnA) btnA.addEventListener("click", function () { relGerarAnalise(cli, btnA); });
    // Biblioteca e sugestoes do changelog (carregam em paralelo).
    api("/api/paid-ads/otimizacoes")
      .then(function (r) {
        relOtim.biblioteca = r.categorias || [];
        if (!relOtim.catAberta && relOtim.biblioteca[0]) relOtim.catAberta = relOtim.biblioteca[0].id;
        relRenderBiblioteca();
      })
      .catch(function () {});
    api("/api/paid-ads/clients/" + encodeURIComponent(cli.id) + "/changelog?since=" + encodeURIComponent(relState.since) + "&until=" + encodeURIComponent(relState.until))
      .then(function (r) {
        relOtim.changelog = (r.entradas || []).map(function (e) { return { titulo: e.titulo, tipo: e.tipo }; });
        relRenderChangelog();
      })
      .catch(function () {});
  }

  function gerarRelatorioTela(cli) {
    var alvo = document.getElementById("rel-resultado");
    if (!relState.since || !relState.until || relState.since > relState.until) {
      alvo.innerHTML = '<div class="ct-resultado erro">Escolha um intervalo valido (inicio ate hoje).</div>';
      return;
    }
    alvo.innerHTML = spinner("Gerando relatorio...");
    api("/api/paid-ads/clients/" + encodeURIComponent(cli.id) + "/relatorio", {
      method: "POST", timeoutMs: 120000,
      body: { tipo: "whatsapp", since: relState.since, until: relState.until }
    })
      .then(function (r) {
        relCampos = r.campos || [];
        relOtim = { bullets: [], analise: "", biblioteca: [], changelog: [], catAberta: null };
        relOtimFraseEditando = null;
        // O relatorio WhatsApp nao tem secao Google: nao poluir com esse aviso.
        var avisos = (r.avisos || []).filter(function (a) { return a.indexOf("Google") < 0; });
        // Texto unico editavel: monta o texto a partir dos campos do backend e o
        // Luis edita livremente antes de copiar (mais simples que campo a campo).
        var textoInicial = montarTextoRel(relCampos);
        function temPreencher(t) { return t.indexOf("[PREENCHER]") >= 0; }
        var h = avisosHtml(avisos);
        h += '<div class="rel-editor">' +
             '<div class="rel-editor-titulo">Texto do relatorio — edite livremente antes de copiar.' +
               ' <span id="rel-aviso-preencher" style="color:var(--warning);font-weight:600;' + (temPreencher(textoInicial) ? "" : "display:none;") + '">Ha campos [PREENCHER] em branco.</span></div>' +
             '<textarea id="rel-final" class="rel-final-ta" spellcheck="false"></textarea>' +
             relPainelOtimHtml() +
             '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
               '<button class="btn-toolbar" data-act="rel-copiar">Copiar para WhatsApp</button>' +
             "</div></div>";
        alvo.innerHTML = h;
        var ta = document.getElementById("rel-final");
        ta.value = textoInicial;
        var aviso = document.getElementById("rel-aviso-preencher");
        ta.addEventListener("input", function () {
          if (aviso) aviso.style.display = temPreencher(ta.value) ? "inline" : "none";
        });
        relLigarPainelOtim(cli);
        var btnCopiar = alvo.querySelector('[data-act="rel-copiar"]');
        btnCopiar.addEventListener("click", function () {
          function prosseguir() {
            copiarTexto(ta.value, btnCopiar);
            // Salvar ao finalizar (historico com a secao de otimizacoes + analise).
            api("/api/paid-ads/clients/" + encodeURIComponent(cli.id) + "/relatorio-salvar", {
              method: "POST",
              body: { since: relState.since, until: relState.until, conteudo: ta.value, otimizacoes: relBulletsTextos(), analise: relOtim.analise }
            })
              .then(function () { carregarHistoricoRel(cli); })
              .catch(function () {});
          }
          if (temPreencher(ta.value)) {
            pulsarConfirm("Ainda ha campo(s) [PREENCHER] em branco. Copiar mesmo assim?").then(function (ok) { if (ok) prosseguir(); });
          } else {
            prosseguir();
          }
        });
        carregarHistoricoRel(cli);
      })
      .catch(function (err) { alvo.innerHTML = erroBloco(err); ligarRetry(alvo, function () { gerarRelatorioTela(cli); }); });
  }

  function carregarHistoricoRel(cli) {
    var alvo = document.getElementById("rel-historico");
    if (!alvo) return;
    api("/api/paid-ads/clients/" + encodeURIComponent(cli.id) + "/relatorios")
      .then(function (r) {
        var lista = (r.relatorios || []).filter(function (x) { return x.tipo === "whatsapp"; });
        if (!lista.length) { alvo.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:8px 10px;">Nenhum relatorio gerado ainda para este cliente.</div>'; return; }
        alvo.innerHTML = '<div class="ct-lista">' + lista.slice(0, 12).map(function (rel, i) {
          return '<div class="ct-item"><span class="av">WA</span>' +
            '<div class="info"><div class="titulo">' + esc(rel.range.label) + "</div>" +
            '<div class="sub">' + fmtData(rel.timestamp) + "</div></div>" +
            '<span class="lado"><button class="btn-sm salvar" data-rel-copiar="' + i + '">Copiar</button></span></div>';
        }).join("") + "</div>";
        alvo.querySelectorAll("[data-rel-copiar]").forEach(function (b) {
          b.addEventListener("click", function () { copiarTexto(lista[Number(b.getAttribute("data-rel-copiar"))].conteudo || "", b); });
        });
      })
      .catch(function () { alvo.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:8px 10px;">Nao foi possivel carregar o historico.</div>'; });
  }

  // ---------------------------------------------------------------------
  // AREA: TRANSCRITOR (Etapa 8)
  // Transcricao INTEGRAL de audio/video via Whisper local (roda na maquina).
  // Fila de 1 job por vez; a UI acompanha por polling de 3s.
  // ---------------------------------------------------------------------
  var trInfo = null; // GET /transcritor (motor, limite, jobs)
  var trJobs = [];
  var trTimestamps = {}; // jobId -> mostrar timestamps no texto expandido
  var trResultados = {}; // jobId -> resultado carregado (texto + segmentos)
  var trPollTimer = null;

  var ROTULO_STATUS_TR = {
    aguardando: "Na fila",
    processando: "Transcrevendo",
    concluido: "Concluido",
    erro: "Erro",
    cancelado: "Cancelado"
  };
  var CLASSE_STATUS_TR = {
    aguardando: "",
    processando: "on",
    concluido: "conectado",
    erro: "off",
    cancelado: "off"
  };

  function fmtDuracao(seg) {
    if (seg == null || isNaN(seg)) return "";
    var s = Math.floor(seg);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function trAreaAtiva() {
    var sec = document.getElementById("area-transcritor");
    return sec && sec.classList.contains("ativa");
  }

  function trTemJobAtivo() {
    return trJobs.some(function (j) { return j.status === "aguardando" || j.status === "processando"; });
  }

  function agendarPollingTr() {
    if (trPollTimer) { clearTimeout(trPollTimer); trPollTimer = null; }
    if (!trAreaAtiva() || !trTemJobAtivo()) return;
    trPollTimer = setTimeout(function () {
      if (!trAreaAtiva()) return;
      api("/api/paid-ads/transcritor")
        .then(function (r) {
          trInfo = r;
          trJobs = r.jobs || [];
          renderTranscritorCorpo();
          agendarPollingTr();
        })
        .catch(function () { agendarPollingTr(); });
    }, 3000);
  }

  function renderTranscritor() {
    var root = document.getElementById("transcritor-root");
    var topo = document.getElementById("transcritor-topo");
    if (!root) return;
    root.innerHTML = spinner("Carregando Transcritor...");
    Promise.all([api("/api/paid-ads/transcritor"), api("/api/paid-ads/clients")])
      .then(function (r) {
        trInfo = r[0];
        trJobs = r[0].jobs || [];
        estado.clientes = r[1].clientes || [];
        if (topo) {
          topo.innerHTML = trInfo.motor && trInfo.motor.ok
            ? '<span class="ct-badge conectado">Motor local: ' + esc(trInfo.motor.modelo || "whisper") + " (" + esc(trInfo.motor.device || "cpu") + ")</span>"
            : '<span class="ct-badge off">Motor nao configurado</span>';
        }
        renderTranscritorCorpo();
        agendarPollingTr();
      })
      .catch(function (err) {
        if (err.offline) renderOffline(root, renderTranscritor);
        else root.innerHTML = '<div class="ct-resultado erro">' + esc(err.message) + "</div>";
      });
  }

  function renderTranscritorCorpo() {
    var root = document.getElementById("transcritor-root");
    if (!root) return;
    var motorOk = trInfo && trInfo.motor && trInfo.motor.ok;
    var limiteMb = (trInfo && trInfo.limiteMb) || 2048;
    var h = "";

    if (!motorOk) {
      h += '<div class="ct-nota">' + esc((trInfo && trInfo.motor && trInfo.motor.detalhe) ||
           'Transcritor nao configurado. Rode "npm run transcritor:setup" na pasta do backend e reinicie o servidor.') + "</div>";
    } else {
      h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Nova transcricao</h3></div><div style="padding:18px 20px;">' +
        '<div class="ct-form-grid">' +
          '<div class="campo"><label>Arquivos de audio ou video * (pode selecionar varios)</label>' +
            '<input type="file" id="tr-arquivo" multiple accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.webm,.mkv,audio/*,video/*" /></div>' +
          '<div class="campo"><label>Cliente (opcional)</label><div class="select-wrap"><select id="tr-cliente">' +
            '<option value="">— sem cliente —</option>' +
            estado.clientes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nome) + "</option>"; }).join("") +
          "</select></div></div>" +
          '<div class="campo"><label>Contexto (opcional — nomes e termos do audio)</label>' +
            '<input type="text" id="tr-contexto" placeholder="Ex.: Dra. Ana, toxina botulinica, harmonizacao" /></div>' +
        "</div>" +
        '<div class="ct-form-acoes" style="margin-top:6px;">' +
          '<button class="btn-toolbar" data-act="tr-enviar">Transcrever</button>' +
          '<span id="tr-envio-status" style="font-size:13px;color:var(--text-3);"></span>' +
        "</div>" +
        '<div class="ct-erro-form" id="tr-form-erro"></div>' +
      "</div></div>";

      h += '<div class="ct-nota">Transcricao local e integral: o Whisper roda nesta maquina e nenhum audio sai dela. ' +
           "Precisao tipica de 95 a 98 por cento: revise nomes proprios e termos tecnicos antes de usar em entregavel. " +
           "Limite de " + limiteMb + " MB por arquivo.</div>";
    }

    h += '<div class="painel ct-secao"><div class="painel-topo"><h3>Transcricoes</h3>' +
         '<span class="contador"><b>' + trJobs.length + "</b> item(ns)</span></div>";
    if (!trJobs.length) {
      h += '<div class="vazio">Nenhuma transcricao ainda. Envie um audio ou video acima.</div>';
    } else {
      h += '<div style="padding:6px 0;">' + trJobs.map(htmlJobTr).join("") + "</div>";
    }
    h += "</div>";

    root.innerHTML = h;
    ligarTranscritor(root);
  }

  function htmlJobTr(job) {
    var cliente = job.clienteNome ? " · " + esc(job.clienteNome) : "";
    var dur = job.duracaoAudio ? " · " + fmtDuracao(job.duracaoAudio) : "";
    var statusHtml = '<span class="ct-badge ' + (CLASSE_STATUS_TR[job.status] || "") + '">' + esc(ROTULO_STATUS_TR[job.status] || job.status) + "</span>";

    var meta = '<div class="hook-meta">' + fmtData(job.criadoEm) + cliente + dur + "</div>";
    var corpo = "";
    if (job.status === "processando") {
      corpo = '<div style="margin:10px 0;">' + progressoHtml(job.progresso || 0) + "</div>";
    } else if (job.status === "erro" && job.erro) {
      corpo = '<div class="ct-resultado erro" style="margin:10px 0;">' + esc(job.erro) + "</div>";
    }

    var acoes = "";
    if (job.status === "processando" || job.status === "aguardando") {
      acoes += '<button class="btn-sm" data-tr-cancelar="' + esc(job.id) + '">Cancelar</button>';
    }
    if (job.status === "erro" || job.status === "cancelado") {
      acoes += '<button class="btn-sm salvar" data-tr-reprocessar="' + esc(job.id) + '">Reprocessar</button>';
    }
    if (job.status === "concluido") {
      acoes += '<button class="btn-sm salvar" data-tr-expandir="' + esc(job.id) + '">Ver transcricao</button>';
    }
    acoes += '<button class="btn-sm" data-tr-excluir="' + esc(job.id) + '">Excluir</button>';

    var detalhe = "";
    var res = trResultados[job.id];
    if (job.status === "concluido" && res) {
      var mostrarTs = !!trTimestamps[job.id];
      var texto = mostrarTs
        ? (res.segmentos || []).map(function (s) { return "[" + fmtDuracao(s.inicio) + "] " + s.texto; }).join("\n")
        : (res.texto || "");
      detalhe = '<div class="bloco" style="margin-top:12px;">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
          '<button class="btn-sm salvar" data-tr-copiar="' + esc(job.id) + '">Copiar</button>' +
          '<button class="btn-sm" data-tr-baixar="txt" data-tr-id="' + esc(job.id) + '">Baixar .txt</button>' +
          '<button class="btn-sm" data-tr-baixar="srt" data-tr-id="' + esc(job.id) + '">Baixar .srt</button>' +
          '<button class="btn-sm" data-tr-timestamps="' + esc(job.id) + '">' + (mostrarTs ? "Ocultar timestamps" : "Mostrar timestamps") + "</button>" +
        "</div>" +
        '<div style="white-space:pre-wrap;max-height:420px;overflow:auto;font-size:14px;line-height:1.6;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px 16px;">' +
          esc(texto || "(sem fala detectada)") + "</div></div>";
    }

    return '<div class="pend-item" style="display:block;padding:14px 16px;border-bottom:1px solid var(--border);">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
        '<div><div class="hook" style="font-size:15px;">' + esc(job.nomeOriginal) + "  " + statusHtml + "</div>" + meta + "</div>" +
        '<div class="card-acoes" style="flex-wrap:wrap;">' + acoes + "</div>" +
      "</div>" + corpo + detalhe +
    "</div>";
  }

  function trBaixar(id, formato) {
    var chave = chaveApi();
    var headers = {};
    if (chave) headers["X-Api-Key"] = chave;
    fetch(API + "/api/paid-ads/transcritor-download?id=" + encodeURIComponent(id) + "&formato=" + encodeURIComponent(formato), { headers: headers })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Falha ao baixar (HTTP " + resp.status + ").");
        var nome = "transcricao." + (formato === "srt" ? "srt" : "txt");
        var disp = resp.headers.get("Content-Disposition") || "";
        var m = /filename="?([^"]+)"?/.exec(disp);
        if (m) nome = m[1];
        return resp.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = nome;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        });
      })
      .catch(function (err) { pulsarAlert("Erro: " + err.message); });
  }

  function ligarTranscritor(root) {
    var btnEnviar = root.querySelector('[data-act="tr-enviar"]');
    if (btnEnviar) btnEnviar.addEventListener("click", function () { enviarTranscricao(root); });

    root.querySelectorAll("[data-tr-cancelar]").forEach(function (b) {
      b.addEventListener("click", function () { trAcao("cancelar", b.getAttribute("data-tr-cancelar")); });
    });
    root.querySelectorAll("[data-tr-reprocessar]").forEach(function (b) {
      b.addEventListener("click", function () { trAcao("reprocessar", b.getAttribute("data-tr-reprocessar")); });
    });
    root.querySelectorAll("[data-tr-excluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-tr-excluir");
        pulsarConfirm("Excluir esta transcricao? O arquivo de midia tambem sera apagado.").then(function (ok) {
          if (ok) trAcao("excluir", id);
        });
      });
    });
    root.querySelectorAll("[data-tr-expandir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-tr-expandir");
        if (trResultados[id]) { delete trResultados[id]; renderTranscritorCorpo(); return; }
        api("/api/paid-ads/transcritor-job?id=" + encodeURIComponent(id))
          .then(function (r) { if (r.resultado) trResultados[id] = r.resultado; renderTranscritorCorpo(); })
          .catch(function (err) { pulsarAlert("Erro: " + err.message); });
      });
    });
    root.querySelectorAll("[data-tr-timestamps]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-tr-timestamps");
        trTimestamps[id] = !trTimestamps[id];
        renderTranscritorCorpo();
      });
    });
    root.querySelectorAll("[data-tr-copiar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-tr-copiar");
        var res = trResultados[id];
        if (!res) return;
        var mostrarTs = !!trTimestamps[id];
        var texto = mostrarTs
          ? (res.segmentos || []).map(function (s) { return "[" + fmtDuracao(s.inicio) + "] " + s.texto; }).join("\n")
          : (res.texto || "");
        copiarTexto(texto, b);
      });
    });
    root.querySelectorAll("[data-tr-baixar]").forEach(function (b) {
      b.addEventListener("click", function () {
        trBaixar(b.getAttribute("data-tr-id"), b.getAttribute("data-tr-baixar"));
      });
    });
  }

  function trAcao(acao, id) {
    api("/api/paid-ads/transcritor-acao", { method: "POST", body: { id: id, acao: acao } })
      .then(function () { return api("/api/paid-ads/transcritor"); })
      .then(function (r) {
        trInfo = r; trJobs = r.jobs || [];
        renderTranscritorCorpo();
        agendarPollingTr();
      })
      .catch(function (err) { pulsarAlert("Erro: " + (err.offline ? "Backend offline." : err.message)); });
  }

  function enviarTranscricao(root) {
    var erroEl = root.querySelector("#tr-form-erro");
    var statusEl = root.querySelector("#tr-envio-status");
    var input = root.querySelector("#tr-arquivo");
    var arquivos = input && input.files ? Array.prototype.slice.call(input.files) : [];
    if (!arquivos.length) { erroEl.textContent = "Escolha um ou mais arquivos de audio ou video."; return; }
    var limiteMb = (trInfo && trInfo.limiteMb) || 2048;
    var grande = arquivos.filter(function (a) { return a.size > limiteMb * 1024 * 1024; });
    if (grande.length) {
      erroEl.textContent = "Arquivo(s) acima do limite de " + limiteMb + " MB: " + grande.map(function (a) { return a.name; }).join(", ") + ".";
      return;
    }
    erroEl.textContent = "";
    var btn = root.querySelector('[data-act="tr-enviar"]');
    if (btn) btn.disabled = true;

    var clienteId = root.querySelector("#tr-cliente").value;
    var contexto = root.querySelector("#tr-contexto").value.trim();
    var chave = chaveApi();
    var headers = { "Content-Type": "application/octet-stream" };
    if (chave) headers["X-Api-Key"] = chave;

    var total = arquivos.length;
    var falhas = [];

    // Envia um por vez (a fila do backend ja processa em sequencia; enviar
    // sequencial evita saturar a rede e deixa o status claro).
    function enviarUm(i) {
      if (i >= total) return Promise.resolve();
      var arquivo = arquivos[i];
      if (statusEl) statusEl.textContent = "Enviando " + (i + 1) + " de " + total + ": " + arquivo.name;
      var qs = "?nome=" + encodeURIComponent(arquivo.name) +
               (clienteId ? "&clienteId=" + encodeURIComponent(clienteId) : "") +
               (contexto ? "&contexto=" + encodeURIComponent(contexto) : "") +
               "&idioma=pt";
      return fetch(API + "/api/paid-ads/transcritor-upload" + qs, { method: "POST", headers: headers, body: arquivo })
        .then(function (resp) {
          return resp.json().catch(function () { return {}; }).then(function (dados) {
            if (!resp.ok) throw new Error((dados && dados.erro) || ("Erro HTTP " + resp.status));
          });
        })
        .catch(function (err) { falhas.push(arquivo.name + " (" + err.message + ")"); })
        .then(function () { return enviarUm(i + 1); });
    }

    enviarUm(0)
      .then(function () {
        if (btn) btn.disabled = false;
        if (statusEl) statusEl.textContent = "";
        input.value = "";
        root.querySelector("#tr-contexto").value = "";
        erroEl.textContent = falhas.length ? "Nao foi possivel enviar: " + falhas.join("; ") : "";
        return api("/api/paid-ads/transcritor");
      })
      .then(function (r) {
        trInfo = r; trJobs = r.jobs || [];
        renderTranscritorCorpo();
        agendarPollingTr();
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        if (statusEl) statusEl.textContent = "";
        erroEl.textContent = "Falha no envio: " + err.message;
      });
  }

  window.PulsarCentral = {
    onArea: function (id) {
      if (id === "dashboard") renderDashCentral();
      if (id === "clientes") carregarClientes();
      if (id === "gestor") carregarGestor();
      if (id === "tracking") renderTracking();
      if (id === "automacoes") renderAutomacoes();
      if (id === "redator") renderRedator();
      if (id === "biblioteca") renderBiblioteca();
      if (id === "planejamento") renderPlanejamento();
      if (id === "designer") renderDesigner();
      if (id === "swipeorganico") renderSwipeOrganico();
      if (id === "agente") renderAgente();
      if (id === "transcritor") renderTranscritor();
      if (id === "relatorios") renderRelatorios();
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
