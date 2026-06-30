// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Dívidas (dividas.js) - Aba de Dívidas
// Versão 1.0 - Gestão de dívidas, parcelas e anexos
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Dívidas carregado");

  // ============================================================
  // DEPENDÊNCIAS
  // ============================================================

  const Utils = global.Utils || {};
  const Supabase = global.Supabase || {};
  const UI = global.UI || {};
  const Auth = global.Auth || {};

  const {
    todayISO,
    formatDate,
    formatCurrency,
    formatDateTime,
    escapeHtml,
    capitalizeFirst,
    getMonthRangeForDate,
    showToast: toast,
  } = Utils;

  // ============================================================
  // CONSTANTES
  // ============================================================

  const LIMITE_PADRAO = 20;

  // ============================================================
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let dados = {};
  let carregando = false;
  let limiteAtual = LIMITE_PADRAO;
  let totalRegistros = 0;

  let filtros = {
    credor: "",
    status: "",
    tipo: "",
    vencimentoInicio: "",
    vencimentoFim: "",
    fornecedorId: "",
  };

  let ordenacao = {
    coluna: "due_date",
    ascendente: true,
  };

  // ============================================================
  // ELEMENTOS DO DOM (Cache)
  // ============================================================

  const $ = (id) => document.getElementById(id);

  // ============================================================
  // FUNÇÕES DE FORMATAÇÃO DE TIPOS
  // ============================================================

  function formatarTipoDivida(tipo) {
    const tipos = {
      bancaria: "Bancária",
      fornecedor: "Fornecedor",
      imposto: "Imposto",
      pessoal: "Pessoal",
      outro: "Outro",
    };
    return tipos[tipo] || tipo;
  }

  // ============================================================
  // FUNÇÕES DE CARREGAMENTO DE DADOS
  // ============================================================

  /**
   * Carrega os dados de dívidas com filtros e paginação
   * @param {boolean} resetLimite - Se deve resetar o limite de paginação
   * @returns {Promise<Object>} Dados das dívidas
   */
  async function carregarDividasPeriodo(resetLimite = true) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        throw new Error("Cliente Supabase não disponível");
      }

      if (resetLimite) limiteAtual = LIMITE_PADRAO;

      console.log("💰 Dívidas: Carregando dados...");

      // ========== BUSCAR DÍVIDAS COM FILTROS ==========
      let query = supabase
        .from("debts")
        .select("*", { count: "exact" })
        .order(ordenacao.coluna, {
          ascending: ordenacao.ascendente,
        })
        .range(limiteAtual - LIMITE_PADRAO, limiteAtual - 1);

      if (filtros.credor) {
        query = query.ilike("creditor", `%${filtros.credor}%`);
      }
      if (filtros.status) {
        query = query.eq("status", filtros.status);
      }
      if (filtros.tipo) {
        query = query.eq("type", filtros.tipo);
      }
      if (filtros.vencimentoInicio) {
        query = query.gte("due_date", filtros.vencimentoInicio);
      }
      if (filtros.vencimentoFim) {
        query = query.lte("due_date", filtros.vencimentoFim);
      }
      if (filtros.fornecedorId) {
        query = query.eq("supplier_id", filtros.fornecedorId);
      }

      const { data: dividas, error, count } = await query;
      if (error) {
        console.error("❌ Dívidas: Erro ao buscar:", error);
        if (UI.showToast) {
          UI.showToast("Erro", "Falha ao carregar dívidas.", "error");
        }
        return dados;
      }

      totalRegistros = count || 0;

      // ========== BUSCAR PARCELAS ==========
      const ids = dividas?.map((d) => d.id) || [];
      let parcelasMap = {};
      let anexosMap = {};

      if (ids.length > 0) {
        const { data: parcelas } = await supabase
          .from("debt_installments")
          .select("*")
          .in("debt_id", ids)
          .order("installment_number", { ascending: true });

        if (parcelas) {
          parcelas.forEach((p) => {
            if (!parcelasMap[p.debt_id]) parcelasMap[p.debt_id] = [];
            parcelasMap[p.debt_id].push(p);
          });
        }

        const { data: anexos } = await supabase
          .from("debt_attachments")
          .select("*")
          .in("debt_id", ids);

        if (anexos) {
          anexos.forEach((a) => {
            if (!anexosMap[a.debt_id]) anexosMap[a.debt_id] = [];
            anexosMap[a.debt_id].push(a);
          });
        }
      }

      // ========== BUSCAR FORNECEDORES ==========
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, company_name");
      const suppliersMap = {};
      if (suppliers) {
        suppliers.forEach((s) => (suppliersMap[s.id] = s.company_name));
      }

      // ========== MONTAR OBJETO DE DADOS ==========
      const dividasComFornecedor = (dividas || []).map((d) => ({
        ...d,
        suppliers: d.supplier_id
          ? { company_name: suppliersMap[d.supplier_id] }
          : null,
      }));

      // Calcular totais
      let totalDivida = 0,
        totalPago = 0,
        saldoDevedor = 0;
      let ativas = 0,
        quitadas = 0;
      const hoje = new Date();
      let vencidas = 0;
      let parcelasVencerProximas = 0;

      for (const d of dividasComFornecedor) {
        const parcelas = parcelasMap[d.id] || [];
        const valorTotal = parseFloat(d.total_amount) || 0;
        totalDivida += valorTotal;

        const valorPago = parcelas
          .filter((p) => p.paid === true)
          .reduce((sum, p) => sum + parseFloat(p.amount), 0);
        totalPago += valorPago;

        if (d.status === "ativa") ativas++;
        if (d.status === "quitada") quitadas++;

        const parcelaVencida = parcelas.some(
          (p) => !p.paid && new Date(p.due_date) < hoje,
        );
        if (parcelaVencida) vencidas++;

        const parcelaProxima = parcelas.some(
          (p) =>
            !p.paid &&
            p.due_date >= todayISO() &&
            new Date(p.due_date) <= new Date(Date.now() + 7 * 86400000),
        );
        if (parcelaProxima) parcelasVencerProximas++;
      }

      saldoDevedor = totalDivida - totalPago;

      dados = {
        dividas: dividasComFornecedor || [],
        parcelasMap: parcelasMap || {},
        anexosMap: anexosMap || {},
        totalDivida: totalDivida || 0,
        totalPago: totalPago || 0,
        saldoDevedor: saldoDevedor || 0,
        ativas: ativas || 0,
        quitadas: quitadas || 0,
        vencidas: vencidas || 0,
        parcelasVencerProximas: parcelasVencerProximas || 0,
        totalRegistros: totalRegistros || 0,
        limiteAtual: limiteAtual,
      };

      // Renderizar
      renderizarDividas(dados);

      console.log(
        `✅ Dívidas: ${dividasComFornecedor.length} dívidas carregadas`,
      );
      return dados;
    } catch (e) {
      console.error("❌ Dívidas: Erro ao carregar dados:", e);
      if (UI.showToast) {
        UI.showToast("Erro", "Falha ao carregar dados de dívidas.", "error");
      }
      return dados;
    }
  }

  // ============================================================
  // RENDERIZAR - ABA DÍVIDAS
  // ============================================================

  function renderizarDividas(dados) {
    console.log("📊 Dívidas: Renderizando...");

    const {
      dividas,
      parcelasMap,
      anexosMap,
      totalDivida,
      totalPago,
      saldoDevedor,
      ativas,
      quitadas,
      vencidas,
      parcelasVencerProximas,
      totalRegistros,
      limiteAtual,
    } = dados;

    // ========== ATUALIZAR KPIs ==========
    const divTotalGeral = document.getElementById("divTotalGeral");
    const divSaldoDevedor = document.getElementById("divSaldoDevedor");
    const divAtivas = document.getElementById("divAtivas");
    const divQuitadas = document.getElementById("divQuitadas");

    if (divTotalGeral) divTotalGeral.textContent = formatCurrency(totalDivida);
    if (divSaldoDevedor)
      divSaldoDevedor.textContent = formatCurrency(saldoDevedor);
    if (divAtivas) divAtivas.textContent = ativas;
    if (divQuitadas) divQuitadas.textContent = quitadas;

    // ========== RENDERIZAR LISTA ==========
    const container = document.getElementById("listaDividas");
    const totalEl = document.getElementById("totalDividas");

    if (totalEl) {
      totalEl.textContent = (dividas || []).length + " registros";
    }

    if (!container) {
      console.error("❌ Dívidas: Container #listaDividas não encontrado");
      return;
    }

    if (!dividas || dividas.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center;padding:40px 16px;color:var(--gray-dark);">
          <i class="ph ph-warning-circle" style="font-size:40px;display:block;margin-bottom:12px;color:var(--gray);"></i>
          <p style="font-size:15px;font-weight:500;">Nenhuma dívida cadastrada</p>
          <p style="font-size:12px;color:var(--gray);margin-top:4px;">Clique em "Nova Dívida" para começar</p>
        </div>
      `;
      renderizarPaginacao(dados);
      return;
    }

    const hoje = new Date();

    container.innerHTML = dividas
      .map((d) => {
        const parcelas = parcelasMap[d.id] || [];
        const totalParcelas = parcelas.length;
        const pagas = parcelas.filter((p) => p.paid === true).length;
        const percentual =
          totalParcelas > 0 ? (pagas / totalParcelas) * 100 : 0;

        const proximaParcela = parcelas.find((p) => !p.paid);
        const proxVenc = proximaParcela
          ? formatDate(proximaParcela.due_date)
          : "-";
        const vencida =
          proximaParcela &&
          new Date(proximaParcela.due_date) < hoje &&
          d.status !== "quitada";

        let statusBadge = "";
        let statusColor = "";
        if (d.status === "quitada") {
          statusBadge = "✅ Quitada";
          statusColor = "var(--success)";
        } else if (vencida) {
          statusBadge = "🔴 Vencida";
          statusColor = "var(--error)";
        } else {
          statusBadge = "🟡 Ativa";
          statusColor = "var(--warning)";
        }

        const fornecedorNome =
          d.suppliers?.company_name ||
          (d.type === "fornecedor" ? d.creditor : "-");
        const anexosCount = anexosMap[d.id]?.length || 0;
        const anexoIcon =
          anexosCount > 0
            ? `<i class="ph ph-paperclip" style="color:var(--gold-light);" title="${anexosCount} anexo(s)"></i>`
            : "-";

        const credorExibicao = d.creditor || "Credor não informado";

        let catIcon = "ph-warning-circle";
        const tipoLower = (d.type || "").toLowerCase();
        if (tipoLower.includes("bancaria")) catIcon = "ph-bank";
        else if (tipoLower.includes("fornecedor")) catIcon = "ph-truck";
        else if (tipoLower.includes("imposto")) catIcon = "ph-receipt";
        else if (tipoLower.includes("pessoal")) catIcon = "ph-user";

        return `
          <div class="list-item" 
               data-id="${d.id}"
               style="
                 display: flex;
                 flex-direction: column;
                 padding: 14px 16px;
                 margin-bottom: 10px;
                 border-radius: 12px;
                 border: 1px solid ${vencida ? "rgba(255,82,82,0.2)" : d.status === "quitada" ? "rgba(76,175,80,0.2)" : "rgba(255,255,255,0.06)"};
                 border-left: 4px solid ${vencida ? "var(--error)" : d.status === "quitada" ? "var(--success)" : "var(--warning)"};
                 background: ${vencida ? "rgba(255,82,82,0.05)" : "rgba(255,255,255,0.02)"};
                 transition: all 0.2s ease;
                 cursor: pointer;
               "
               onclick="window.Dividas.abrirModalDivida('${d.id}')"
               onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)'; this.style.transform='translateY(-2px)';"
               onmouseleave="this.style.boxShadow='none'; this.style.transform='translateY(0)';"
               >
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 15px; font-weight: 700; color: ${vencida ? "var(--error)" : d.status === "quitada" ? "var(--success)" : "var(--gold-light)"}; display: flex; align-items: center; gap: 8px;">
                  <i class="ph ${catIcon}" style="font-size: 16px;"></i>
                  ${escapeHtml(credorExibicao)}
                </div>
                <div style="font-size: 11px; color: var(--gray-dark); margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px 14px;">
                  <span><i class="ph ph-tag"></i> ${formatarTipoDivida(d.type)}</span>
                  <span><i class="ph ph-truck"></i> ${escapeHtml(fornecedorNome)}</span>
                  <span><i class="ph ph-currency-circle-dollar"></i> ${formatCurrency(d.total_amount)}</span>
                  <span><i class="ph ph-receipt"></i> ${pagas}/${totalParcelas}</span>
                  <span><i class="ph ph-calendar"></i> Próx.: ${proxVenc}</span>
                  ${anexosCount > 0 ? `<span><i class="ph ph-paperclip"></i> ${anexosCount}</span>` : ""}
                </div>
              </div>
              <div style="text-align: right; flex-shrink: 0;">
                <span style="font-size:0.65rem; color:${statusColor}; background:${statusColor}22; padding:3px 12px; border-radius:20px; border:1px solid ${statusColor}44; font-weight:500;">
                  ${statusBadge}
                </span>
                <div style="font-size:0.6rem; color:var(--gray-dark); margin-top:2px;">${anexoIcon}</div>
              </div>
            </div>

            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04);">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; font-size: 0.6rem; color: var(--gray-dark); margin-bottom: 2px;">
                    <span>Pago: ${formatCurrency(parcelas.filter((p) => p.paid).reduce((s, p) => s + parseFloat(p.amount), 0))}</span>
                    <span>${percentual.toFixed(0)}%</span>
                  </div>
                  <div style="width:100%; height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
                    <div style="width:${Math.min(percentual, 100)}%; height:100%; background:${d.status === "quitada" ? "var(--success)" : "var(--gold)"}; border-radius:2px; transition:width 0.8s ease;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 10px; align-items: center;">
              <button class="btn-action btn-action-ghost" 
                      onclick="event.stopPropagation(); window.Dividas.abrirModalDivida('${d.id}')" 
                      style="padding:4px 12px; font-size:0.6rem;">
                <i class="ph ph-eye"></i> Detalhes
              </button>
              <button class="btn-action btn-action-ghost" 
                      onclick="event.stopPropagation(); window.Dividas.editarDivida('${d.id}')" 
                      style="padding:4px 12px; font-size:0.6rem;">
                <i class="ph ph-pencil-simple"></i> Editar
              </button>
              ${
                d.status !== "quitada"
                  ? `
                <button class="btn-action btn-action-success" 
                        onclick="event.stopPropagation(); window.Dividas.quitarParcela('${d.id}')" 
                        style="padding:4px 12px; font-size:0.6rem; background:rgba(76,175,80,0.15); color:#a5d6a7; border:1px solid rgba(76,175,80,0.2); border-radius:16px;">
                  <i class="ph ph-check-circle"></i> Quitar Parcela
                </button>
                <button class="btn-action btn-action-primary" 
                        onclick="event.stopPropagation(); window.Dividas.quitarDivida('${d.id}')" 
                        style="padding:4px 12px; font-size:0.6rem; background:rgba(33,150,243,0.15); color:#64b5f6; border:1px solid rgba(33,150,243,0.2); border-radius:16px;">
                  <i class="ph ph-check-square"></i> Quitar Tudo
                </button>
              `
                  : ""
              }
              <button class="btn-action btn-action-ghost" 
                      onclick="event.stopPropagation(); window.Dividas.excluirDivida('${d.id}')" 
                      style="padding:4px 12px; font-size:0.6rem; color:var(--error);">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    // Renderizar paginação
    renderizarPaginacao(dados);

    // Configurar filtros
    configurarFiltros();

    console.log(`✅ Dívidas: ${dividas.length} dívidas renderizadas`);
  }

  // ============================================================
  // PAGINAÇÃO
  // ============================================================

  function renderizarPaginacao(dados) {
    const container = document.getElementById("paginacaoDividas");
    if (!container) return;

    const { totalRegistros, limiteAtual } = dados;

    if (totalRegistros <= limiteAtual) {
      container.innerHTML = "";
      return;
    }

    const restantes = totalRegistros - limiteAtual;

    container.innerHTML = `
      <div style="text-align:center; margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="btnCarregarMaisDividas" style="min-height:36px; padding:6px 16px;">
          <i class="ph ph-plus-circle"></i> Carregar mais (${restantes} restantes)
        </button>
      </div>
    `;

    const btn = document.getElementById("btnCarregarMaisDividas");
    if (btn) {
      btn.addEventListener("click", () => {
        limiteAtual += LIMITE_PADRAO;
        carregarDividasPeriodo(false);
      });
    }
  }

  // ============================================================
  // FILTROS
  // ============================================================

  function configurarFiltros() {
    const container = document.getElementById("filtrosDividas");
    if (!container) return;

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; width:100%;">
        <div class="form-group" style="position:relative; margin-bottom:0;">
          <input type="text" id="filtroCredor" class="form-input" placeholder="Buscar credor..." value="${filtros.credor || ""}" style="padding:6px 10px; font-size:0.8rem;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <select id="filtroStatus" class="form-select" style="padding:6px 10px; font-size:0.8rem;">
            <option value="">Todos Status</option>
            <option value="ativa" ${filtros.status === "ativa" ? "selected" : ""}>🟡 Ativa</option>
            <option value="quitada" ${filtros.status === "quitada" ? "selected" : ""}>✅ Quitada</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <select id="filtroTipo" class="form-select" style="padding:6px 10px; font-size:0.8rem;">
            <option value="">Todos Tipos</option>
            <option value="bancaria" ${filtros.tipo === "bancaria" ? "selected" : ""}>🏦 Bancária</option>
            <option value="fornecedor" ${filtros.tipo === "fornecedor" ? "selected" : ""}>🚚 Fornecedor</option>
            <option value="imposto" ${filtros.tipo === "imposto" ? "selected" : ""}>📋 Imposto</option>
            <option value="pessoal" ${filtros.tipo === "pessoal" ? "selected" : ""}>👤 Pessoal</option>
            <option value="outro" ${filtros.tipo === "outro" ? "selected" : ""}>📌 Outro</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <input type="date" id="filtroVencimentoInicio" class="form-input" title="Vencimento Inicial" value="${filtros.vencimentoInicio || ""}" style="padding:6px 10px; font-size:0.8rem;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <input type="date" id="filtroVencimentoFim" class="form-input" title="Vencimento Final" value="${filtros.vencimentoFim || ""}" style="padding:6px 10px; font-size:0.8rem;">
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-primary btn-sm" id="btnAplicarFiltrosDividas" style="padding:6px 14px; font-size:0.75rem; min-height:36px;">
            <i class="ph ph-funnel"></i> Filtrar
          </button>
          <button class="btn btn-ghost btn-sm" id="btnLimparFiltrosDividas" style="padding:6px 14px; font-size:0.75rem; min-height:36px;">
            <i class="ph ph-x"></i>
          </button>
        </div>
      </div>
    `;

    // Event listeners
    document
      .getElementById("btnAplicarFiltrosDividas")
      ?.addEventListener("click", () => {
        filtros.credor = document.getElementById("filtroCredor").value;
        filtros.status = document.getElementById("filtroStatus").value;
        filtros.tipo = document.getElementById("filtroTipo").value;
        filtros.vencimentoInicio = document.getElementById(
          "filtroVencimentoInicio",
        ).value;
        filtros.vencimentoFim = document.getElementById(
          "filtroVencimentoFim",
        ).value;
        carregarDividasPeriodo();
      });

    document
      .getElementById("btnLimparFiltrosDividas")
      ?.addEventListener("click", () => {
        filtros = {
          credor: "",
          status: "",
          tipo: "",
          vencimentoInicio: "",
          vencimentoFim: "",
          fornecedorId: "",
        };
        document.getElementById("filtroCredor").value = "";
        document.getElementById("filtroStatus").value = "";
        document.getElementById("filtroTipo").value = "";
        document.getElementById("filtroVencimentoInicio").value = "";
        document.getElementById("filtroVencimentoFim").value = "";
        carregarDividasPeriodo();
      });

    // Enter key no campo de busca
    document
      .getElementById("filtroCredor")
      ?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          document.getElementById("btnAplicarFiltrosDividas")?.click();
        }
      });
  }

  // ============================================================
  // FUNÇÕES DE CRUD DE DÍVIDAS
  // ============================================================

  /**
   * Abre o modal para criar uma nova dívida
   */
  function novaDivida() {
    console.log("📝 Dívidas: Criando nova dívida...");

    const html = `
      <div style="display:grid; gap:12px;">
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user"></i> Credor *</label>
          <input id="divCredor" class="form-input" placeholder="Nome do credor" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Tipo *</label>
          <select id="divTipo" class="form-select" required>
            <option value="bancaria">🏦 Bancária</option>
            <option value="fornecedor">🚚 Fornecedor</option>
            <option value="imposto">📋 Imposto</option>
            <option value="pessoal">👤 Pessoal</option>
            <option value="outro">📌 Outro</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-currency-circle-dollar"></i> Valor Total *</label>
          <input id="divTotal" type="number" step="0.01" min="0.01" class="form-input" placeholder="0,00" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-receipt"></i> Número de Parcelas *</label>
          <input id="divParcelas" type="number" min="1" max="120" class="form-input" value="1" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-calendar-blank"></i> Data do Primeiro Vencimento *</label>
          <input id="divPrimeiroVenc" type="date" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-percent"></i> Taxa de Juros Mensal (%)</label>
          <input id="divJuros" type="number" step="0.01" class="form-input" placeholder="Ex: 2.5 (opcional)">
          <small style="color:var(--gray); font-size:0.65rem;">Se houver juros, o valor das parcelas será recalculado</small>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-note"></i> Observações</label>
          <textarea id="divObs" class="form-input" rows="2" placeholder="Informações adicionais..."></textarea>
        </div>
      </div>
    `;

    UI.modalComConfirmacao(
      "Nova Dívida",
      html,
      async () => {
        await salvarNovaDivida();
      },
      null,
      "560px",
    );

    // Definir data padrão
    setTimeout(() => {
      const dataInput = document.getElementById("divPrimeiroVenc");
      if (dataInput && !dataInput.value) {
        dataInput.value = todayISO();
      }
    }, 100);
  }

  /**
   * Salva uma nova dívida no banco
   */
  async function salvarNovaDivida() {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const credor = document.getElementById("divCredor").value.trim();
      const tipo = document.getElementById("divTipo").value;
      const total = parseFloat(document.getElementById("divTotal").value);
      const numParcelas = parseInt(
        document.getElementById("divParcelas").value,
      );
      const primeiroVenc = document.getElementById("divPrimeiroVenc").value;
      const jurosMensal =
        parseFloat(document.getElementById("divJuros").value) || 0;
      const obs = document.getElementById("divObs").value.trim() || null;

      if (!credor || !tipo || !total || !numParcelas || !primeiroVenc) {
        UI.showToast("Erro", "Preencha todos os campos obrigatórios.", "error");
        return;
      }

      if (total <= 0) {
        UI.showToast("Erro", "Informe um valor total válido.", "error");
        return;
      }

      if (numParcelas < 1 || numParcelas > 120) {
        UI.showToast(
          "Erro",
          "Número de parcelas deve ser entre 1 e 120.",
          "error",
        );
        return;
      }

      const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
      if (!loginResult) {
        UI.showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }

      // Calcular valor da parcela com ou sem juros
      let valorParcela = total / numParcelas;
      let jurosEfetivo = 0;
      if (jurosMensal > 0) {
        const i = jurosMensal / 100;
        const fator = Math.pow(1 + i, numParcelas);
        valorParcela = total * ((i * fator) / (fator - 1));
        jurosEfetivo = jurosMensal;
      }

      // Inserir dívida
      const { data: nova, error: insertError } = await supabase
        .from("debts")
        .insert({
          creditor: credor,
          type: tipo,
          total_amount: total,
          original_total_amount: total,
          interest_rate: jurosEfetivo,
          late_fee_percent: 0,
          total_installments: numParcelas,
          installment_value: valorParcela,
          due_date: primeiroVenc,
          status: "ativa",
          notes: obs,
        })
        .select("id")
        .single();

      if (insertError) {
        UI.showToast(
          "Erro",
          `Falha ao criar dívida: ${insertError.message}`,
          "error",
        );
        return;
      }

      // Gerar parcelas
      const parcelas = [];
      for (let i = 0; i < numParcelas; i++) {
        const dataVenc = new Date(primeiroVenc + "T12:00:00");
        dataVenc.setMonth(dataVenc.getMonth() + i);
        const dataVencStr = dataVenc.toISOString().split("T")[0];
        parcelas.push({
          debt_id: nova.id,
          installment_number: i + 1,
          amount: valorParcela,
          due_date: dataVencStr,
          paid: false,
        });
      }

      const { error: parcelasError } = await supabase
        .from("debt_installments")
        .insert(parcelas);

      if (parcelasError) {
        console.error("❌ Erro ao gerar parcelas:", parcelasError);
        UI.showToast(
          "Aviso",
          "Dívida criada, mas houve falha ao gerar parcelas.",
          "warning",
        );
      } else {
        UI.showToast(
          "Sucesso",
          `Dívida com ${numParcelas} parcelas criada!`,
          "success",
        );
      }

      document.getElementById("modalContainer").innerHTML = "";
      await carregarDividasPeriodo();

      // Atualizar dados do dashboard
      if (global.Dashboard && global.Dashboard.atualizarDados) {
        global.Dashboard.atualizarDados();
      }
    } catch (e) {
      console.error("Erro ao criar dívida:", e);
      UI.showToast("Erro", "Falha ao criar dívida.", "error");
    }
  }

  // ============================================================
  // FUNÇÕES DE MODAL - DÍVIDA
  // ============================================================

  /**
   * Abre o modal com detalhes da dívida
   */
  window.abrirModalDivida = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: divida, error } = await supabase
        .from("debts")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !divida) {
        UI.showToast("Erro", "Dívida não encontrada.", "error");
        return;
      }

      const { data: parcelas } = await supabase
        .from("debt_installments")
        .select("*")
        .eq("debt_id", id)
        .order("installment_number", { ascending: true });

      const totalPago =
        parcelas
          ?.filter((p) => p.paid)
          .reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
      const saldo = divida.total_amount - totalPago;

      let parcelasHtml = "";
      if (parcelas && parcelas.length > 0) {
        const hoje = new Date();
        parcelasHtml = `
          <h4 style="margin:16px 0 8px 0; font-size:0.9rem; color:var(--gold-light);">
            <i class="ph ph-receipt"></i> Parcelas (${parcelas.filter((p) => p.paid).length}/${parcelas.length})
          </h4>
          <div style="max-height:300px; overflow-y:auto;">
            ${parcelas
              .map((p) => {
                const atrasada = !p.paid && new Date(p.due_date) < hoje;
                const jurosMulta =
                  (p.interest_paid || 0) + (p.late_fee_paid || 0);
                return `
                  <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; margin-bottom:4px; background:${atrasada ? "rgba(255,82,82,0.08)" : "rgba(255,255,255,0.02)"}; border-radius:8px; border-left:3px solid ${atrasada ? "var(--error)" : p.paid ? "var(--success)" : "var(--warning)"};">
                    <div style="display:flex; align-items:center; gap:12px; flex:1;">
                      <span style="font-weight:600; font-size:0.85rem; min-width:40px;">${p.installment_number}ª</span>
                      <div>
                        <div style="font-size:0.75rem; color:var(--gray);">
                          Vence: ${formatDate(p.due_date)}
                          ${p.paid_date ? `• Pago em: ${formatDate(p.paid_date)}` : ""}
                        </div>
                        ${jurosMulta > 0 ? `<div style="font-size:0.65rem; color:var(--gray-dark);">Juros/Multa: ${formatCurrency(jurosMulta)}</div>` : ""}
                      </div>
                    </div>
                    <div style="text-align:right; flex-shrink:0; margin-left:12px;">
                      <div style="font-weight:700; font-size:0.9rem;">${formatCurrency(p.amount)}</div>
                      <div style="font-size:0.6rem; color:${p.paid ? "var(--success)" : atrasada ? "var(--error)" : "var(--warning)"};">${p.paid ? "✅ Paga" : atrasada ? "🔴 Vencida" : "⏳ Pendente"}</div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }

      const credorExibicao = divida.creditor || "Credor não informado";
      const isQuitada = divida.status === "quitada";

      const html = `
        <div style="display:grid; gap:12px;">
          <div style="background:${isQuitada ? "rgba(76,175,80,0.08)" : "rgba(212,160,23,0.08)"}; border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px; border-left:4px solid ${isQuitada ? "var(--success)" : "var(--gold-light)"};">
            <div style="width:48px; height:48px; background:${isQuitada ? "rgba(76,175,80,0.15)" : "rgba(212,160,23,0.15)"}; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.3rem; color:${isQuitada ? "var(--success)" : "var(--gold-light)"};">
              <i class="ph ${isQuitada ? "ph-check-circle" : "ph-warning-circle"}"></i>
            </div>
            <div style="flex:1;">
              <h4 style="margin:0; font-size:1rem;">${escapeHtml(credorExibicao)}</h4>
              <small style="color:var(--gray);">${formatarTipoDivida(divida.type)}</small>
            </div>
            <div style="flex-shrink:0;">
              <span class="item-badge ${isQuitada ? "badge-status-entregue" : "badge-status-em_costura"}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">
                ${isQuitada ? "✅ Quitada" : "🟡 Ativa"}
              </span>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(255,255,255,0.02); border-radius:8px; padding:12px;">
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Valor Total</span><br><span style="font-size:0.85rem; color:var(--gold-light);">${formatCurrency(divida.total_amount)}</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Valor Original</span><br><span style="font-size:0.85rem;">${formatCurrency(divida.original_total_amount || divida.total_amount)}</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Taxa de Juros</span><br><span style="font-size:0.85rem;">${divida.interest_rate || 0}% ao mês</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Parcelas</span><br><span style="font-size:0.85rem;">${divida.total_installments} x ${formatCurrency(divida.installment_value || 0)}</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Total Pago</span><br><span style="font-size:0.85rem; color:var(--success);">${formatCurrency(totalPago)}</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Saldo Devedor</span><br><span style="font-size:0.85rem; color:${saldo > 0 ? "var(--error)" : "var(--success)"};">${formatCurrency(saldo)}</span></div>
          </div>

          ${divida.notes ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">Observações</span><br><span style="font-size:0.85rem;">${escapeHtml(divida.notes)}</span></div>` : ""}

          ${parcelasHtml}

          <div style="margin-top:8px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
            ${
              !isQuitada
                ? `
              <button class="btn-action btn-action-success" onclick="window.Dividas.quitarParcela('${divida.id}')" style="padding:6px 14px; min-height:36px;">
                <i class="ph ph-check-circle"></i> Quitar Parcela
              </button>
              <button class="btn-action btn-action-primary" onclick="window.Dividas.quitarDivida('${divida.id}')" style="padding:6px 14px; min-height:36px;">
                <i class="ph ph-check-square"></i> Quitar Tudo
              </button>
            `
                : ""
            }
            <button class="btn-action btn-action-ghost" onclick="window.Dividas.editarDivida('${divida.id}')" style="padding:6px 14px; min-height:36px;">
              <i class="ph ph-pencil-simple"></i> Editar
            </button>
            <button class="btn-action btn-action-ghost" onclick="window.Dividas.excluirDivida('${divida.id}')" style="padding:6px 14px; min-height:36px; color:var(--error);">
              <i class="ph ph-trash"></i> Excluir
            </button>
          </div>

          <div style="font-size:0.6rem;color:var(--gray-dark);text-align:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);">ID: ${divida.id}</div>
        </div>
      `;

      UI.openModal(`Detalhes da Dívida`, html);
    } catch (e) {
      console.error("Erro ao abrir modal da dívida:", e);
      UI.showToast("Erro", "Falha ao carregar detalhes da dívida.", "error");
    }
  };

  // ============================================================
  // FUNÇÕES DE CRUD - EDIÇÃO E EXCLUSÃO
  // ============================================================

  /**
   * Edita uma dívida
   */
  window.editarDivida = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: divida } = await supabase
        .from("debts")
        .select("*")
        .eq("id", id)
        .single();

      if (!divida) {
        UI.showToast("Erro", "Dívida não encontrada.", "error");
        return;
      }

      const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
      if (!loginResult) {
        UI.showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }

      const html = `
        <div style="display:grid; gap:12px;">
          <div class="form-group">
            <label class="form-label"><i class="ph ph-user"></i> Credor *</label>
            <input id="editCredor" class="form-input" value="${escapeHtml(divida.creditor)}" required>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-tag"></i> Tipo *</label>
            <select id="editTipo" class="form-select" required>
              <option value="bancaria" ${divida.type === "bancaria" ? "selected" : ""}>🏦 Bancária</option>
              <option value="fornecedor" ${divida.type === "fornecedor" ? "selected" : ""}>🚚 Fornecedor</option>
              <option value="imposto" ${divida.type === "imposto" ? "selected" : ""}>📋 Imposto</option>
              <option value="pessoal" ${divida.type === "pessoal" ? "selected" : ""}>👤 Pessoal</option>
              <option value="outro" ${divida.type === "outro" ? "selected" : ""}>📌 Outro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-currency-circle-dollar"></i> Valor Total *</label>
            <input id="editTotal" type="number" step="0.01" class="form-input" value="${divida.total_amount}" required>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-info"></i> Status *</label>
            <select id="editStatus" class="form-select" required>
              <option value="ativa" ${divida.status === "ativa" ? "selected" : ""}>🟡 Ativa</option>
              <option value="quitada" ${divida.status === "quitada" ? "selected" : ""}>✅ Quitada</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-note"></i> Observações</label>
            <textarea id="editObs" class="form-input" rows="2">${divida.notes || ""}</textarea>
          </div>
        </div>
      `;

      UI.modalComConfirmacao(
        "Editar Dívida",
        html,
        async () => {
          const creditor = document.getElementById("editCredor").value.trim();
          const type = document.getElementById("editTipo").value;
          const total_amount = parseFloat(
            document.getElementById("editTotal").value,
          );
          const status = document.getElementById("editStatus").value;
          const notes = document.getElementById("editObs").value.trim() || null;

          if (!creditor || !total_amount) {
            UI.showToast("Erro", "Preencha os campos obrigatórios.", "error");
            return;
          }

          const { error } = await supabase
            .from("debts")
            .update({ creditor, type, total_amount, status, notes })
            .eq("id", id);

          if (error) {
            UI.showToast("Erro", error.message, "error");
          } else {
            UI.showToast("Sucesso", "Dívida atualizada!", "success");
            document.getElementById("modalContainer").innerHTML = "";
            await carregarDividasPeriodo();

            if (global.Dashboard && global.Dashboard.atualizarDados) {
              global.Dashboard.atualizarDados();
            }
          }
        },
        null,
        "560px",
      );
    } catch (e) {
      console.error("Erro ao editar dívida:", e);
      UI.showToast("Erro", "Falha ao carregar dados para edição.", "error");
    }
  };

  /**
   * Exclui uma dívida
   */
  window.excluirDivida = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: divida } = await supabase
        .from("debts")
        .select("creditor, status")
        .eq("id", id)
        .single();

      if (!divida) {
        UI.showToast("Erro", "Dívida não encontrada.", "error");
        return;
      }

      UI.openConfirmModal(
        "Excluir Dívida",
        `<p>Deseja excluir a dívida com <strong>${escapeHtml(divida.creditor)}</strong>?</p>
         <p style="color:var(--gray-dark);font-size:0.8rem;">
           Todas as parcelas e anexos serão removidos. 
           Esta ação <strong style="color:var(--error);">não pode ser desfeita</strong>.
         </p>`,
        async () => {
          const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
          if (!loginResult) {
            UI.showToast(
              "Ação cancelada",
              "Você precisa estar autenticado.",
              "warning",
            );
            return;
          }

          try {
            // Remover parcelas
            await supabase.from("debt_installments").delete().eq("debt_id", id);

            // Remover anexos
            await supabase.from("debt_attachments").delete().eq("debt_id", id);

            // Remover dívida
            const { error } = await supabase
              .from("debts")
              .delete()
              .eq("id", id);

            if (error) throw error;

            UI.showToast("Sucesso", "Dívida excluída!", "success");
            await carregarDividasPeriodo();

            if (global.Dashboard && global.Dashboard.atualizarDados) {
              global.Dashboard.atualizarDados();
            }
          } catch (error) {
            console.error("Erro ao excluir dívida:", error);
            UI.showToast("Erro", "Falha ao excluir dívida.", "error");
          }
        },
      );
    } catch (e) {
      console.error("Erro ao excluir dívida:", e);
      UI.showToast("Erro", "Falha ao excluir dívida.", "error");
    }
  };

  // ============================================================
  // FUNÇÕES DE QUITAÇÃO
  // ============================================================

  /**
   * Quita uma parcela específica
   */
  window.quitarParcela = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: divida, error: errDebt } = await supabase
        .from("debts")
        .select("id, creditor, interest_rate, late_fee_percent")
        .eq("id", id)
        .single();

      if (errDebt || !divida) {
        UI.showToast("Erro", "Dívida não encontrada.", "error");
        return;
      }

      const { data: parcelasPendentes } = await supabase
        .from("debt_installments")
        .select("*")
        .eq("debt_id", id)
        .eq("paid", false)
        .order("installment_number", { ascending: true });

      if (!parcelasPendentes || parcelasPendentes.length === 0) {
        UI.showToast("Aviso", "Não há parcelas pendentes.", "info");
        return;
      }

      const options = parcelasPendentes
        .map((p) => {
          const diasAtraso = Math.max(
            0,
            Math.ceil(
              (new Date() - new Date(p.due_date)) / (1000 * 60 * 60 * 24),
            ),
          );
          const jurosCalc =
            (divida.interest_rate / 100) * p.amount * (diasAtraso / 30);
          const multaCalc = (divida.late_fee_percent / 100) * p.amount;
          return `<option value="${p.id}" data-juros="${jurosCalc.toFixed(2)}" data-multa="${multaCalc.toFixed(2)}" data-valor="${p.amount}" data-venc="${p.due_date}">
            ${p.installment_number}ª - ${formatCurrency(p.amount)} (venc. ${formatDate(p.due_date)})
          </option>`;
        })
        .join("");

      const formHtml = `
        <div class="form-group">
          <label class="form-label"><i class="ph ph-receipt"></i> Selecione a parcela</label>
          <select id="parcelaId" class="form-select" required>${options}</select>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-calendar"></i> Data do Pagamento</label>
          <input id="dataPagamento" type="date" class="form-input" value="${todayISO()}" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-credit-card"></i> Forma de Pagamento</label>
          <select id="formaPagamento" class="form-select">
            <option value="">Selecione...</option>
            <option value="PIX">PIX</option>
            <option value="Boleto">Boleto</option>
            <option value="Transferência">Transferência</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Cartão">Cartão</option>
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label"><i class="ph ph-percent"></i> Juros (R$)</label>
            <input id="jurosParcela" type="number" step="0.01" class="form-input" value="0">
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-warning"></i> Multa (R$)</label>
            <input id="multaParcela" type="number" step="0.01" class="form-input" value="0">
          </div>
        </div>
      `;

      UI.modalComConfirmacao(
        `Quitar Parcela - ${divida.creditor}`,
        formHtml,
        async () => {
          await confirmarQuitarParcela(id, divida);
        },
        null,
        "560px",
      );

      // Auto calcular juros/multa ao selecionar parcela
      setTimeout(() => {
        const select = document.getElementById("parcelaId");
        if (select) {
          select.addEventListener("change", function () {
            const option = this.options[this.selectedIndex];
            document.getElementById("jurosParcela").value =
              option.dataset.juros || "0";
            document.getElementById("multaParcela").value =
              option.dataset.multa || "0";
          });
          select.dispatchEvent(new Event("change"));
        }
      }, 100);
    } catch (e) {
      console.error("Erro ao quitar parcela:", e);
      UI.showToast("Erro", "Falha ao carregar dados.", "error");
    }
  };

  /**
   * Confirma a quitação de uma parcela
   */
  async function confirmarQuitarParcela(debtId, divida) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const parcelaId = document.getElementById("parcelaId").value;
      const dataPag = document.getElementById("dataPagamento").value;
      const formaPagamento =
        document.getElementById("formaPagamento").value.trim() || null;
      const juros =
        parseFloat(document.getElementById("jurosParcela").value) || 0;
      const multa =
        parseFloat(document.getElementById("multaParcela").value) || 0;

      if (!parcelaId || !dataPag) {
        UI.showToast("Erro", "Preencha todos os campos.", "error");
        return;
      }

      const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
      if (!loginResult) {
        UI.showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }

      const { data: parcelaAtual } = await supabase
        .from("debt_installments")
        .select("*")
        .eq("id", parcelaId)
        .single();

      if (!parcelaAtual) {
        UI.showToast("Erro", "Parcela não encontrada.", "error");
        return;
      }

      // Buscar categoria de despesa
      const { data: categoria } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("type", "despesa")
        .ilike("name", "%pagamento%")
        .limit(1)
        .maybeSingle();

      const valorTotal = parseFloat(parcelaAtual.amount) + juros + multa;

      // Criar lançamento financeiro
      if (categoria) {
        await supabase.from("financial_transactions").insert({
          type: "pagar",
          amount: -valorTotal,
          date: dataPag,
          due_date: parcelaAtual.due_date,
          payment_date: dataPag,
          status: "pago",
          description: `Parcela ${parcelaAtual.installment_number} - ${divida.creditor}`,
          category_id: categoria.id,
          payment_method: formaPagamento,
          notes: `Quitação de parcela da dívida com ${divida.creditor}`,
        });
      }

      // Atualizar parcela
      await supabase
        .from("debt_installments")
        .update({
          paid: true,
          paid_date: dataPag,
          payment_method: formaPagamento,
          interest_paid: juros,
          late_fee_paid: multa,
        })
        .eq("id", parcelaId);

      // Verificar se todas as parcelas foram pagas
      const { data: restantes } = await supabase
        .from("debt_installments")
        .select("id")
        .eq("debt_id", debtId)
        .eq("paid", false)
        .limit(1);

      if (!restantes || restantes.length === 0) {
        await supabase
          .from("debts")
          .update({ status: "quitada" })
          .eq("id", debtId);
      }

      UI.showToast("Sucesso", "Parcela quitada!", "success");
      document.getElementById("modalContainer").innerHTML = "";
      await carregarDividasPeriodo();

      if (global.Dashboard && global.Dashboard.atualizarDados) {
        global.Dashboard.atualizarDados();
      }
    } catch (e) {
      console.error("Erro ao confirmar quitação:", e);
      UI.showToast("Erro", "Falha ao quitar parcela.", "error");
    }
  }

  /**
   * Quita todas as parcelas de uma dívida
   */
  window.quitarDivida = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: divida } = await supabase
        .from("debts")
        .select("*")
        .eq("id", id)
        .single();

      if (!divida) {
        UI.showToast("Erro", "Dívida não encontrada.", "error");
        return;
      }

      const { data: parcelasPendentes } = await supabase
        .from("debt_installments")
        .select("*")
        .eq("debt_id", id)
        .eq("paid", false)
        .order("installment_number", { ascending: true });

      if (!parcelasPendentes || parcelasPendentes.length === 0) {
        UI.showToast("Aviso", "Esta dívida já está quitada.", "info");
        return;
      }

      const valorTotalParcelas = parcelasPendentes.reduce(
        (s, p) => s + parseFloat(p.amount),
        0,
      );

      UI.openConfirmModal(
        "Quitar Dívida",
        `<p>Deseja quitar as <strong>${parcelasPendentes.length}</strong> parcelas restantes?</p>
         <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:12px; margin:8px 0;">
           <p style="margin:4px 0;"><strong>${escapeHtml(divida.creditor)}</strong></p>
           <p style="margin:4px 0; color:var(--gray); font-size:0.85rem;">
             Total a pagar: ${formatCurrency(valorTotalParcelas)}
           </p>
         </div>`,
        async () => {
          const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
          if (!loginResult) {
            UI.showToast(
              "Ação cancelada",
              "Você precisa estar autenticado.",
              "warning",
            );
            return;
          }

          try {
            const dataPag = todayISO();

            // Buscar categoria de despesa
            const { data: categoria } = await supabase
              .from("chart_of_accounts")
              .select("id")
              .eq("type", "despesa")
              .ilike("name", "%pagamento%")
              .limit(1)
              .maybeSingle();

            // Quitar todas as parcelas pendentes
            for (const p of parcelasPendentes) {
              await supabase
                .from("debt_installments")
                .update({
                  paid: true,
                  paid_date: dataPag,
                })
                .eq("id", p.id);
            }

            // Atualizar status da dívida
            await supabase
              .from("debts")
              .update({ status: "quitada" })
              .eq("id", id);

            // Criar lançamento financeiro consolidado
            if (categoria) {
              await supabase.from("financial_transactions").insert({
                type: "pagar",
                amount: -valorTotalParcelas,
                date: dataPag,
                due_date: dataPag,
                payment_date: dataPag,
                status: "pago",
                description: `Quitação total - ${divida.creditor}`,
                category_id: categoria.id,
                notes: `Quitação completa da dívida com ${divida.creditor}`,
              });
            }

            UI.showToast("Sucesso", "Dívida totalmente quitada!", "success");
            await carregarDividasPeriodo();

            if (global.Dashboard && global.Dashboard.atualizarDados) {
              global.Dashboard.atualizarDados();
            }
          } catch (error) {
            console.error("Erro ao quitar dívida:", error);
            UI.showToast("Erro", "Falha ao quitar dívida.", "error");
          }
        },
      );
    } catch (e) {
      console.error("Erro ao quitar dívida:", e);
      UI.showToast("Erro", "Falha ao quitar dívida.", "error");
    }
  };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("💰 Dívidas: Inicializando...");

    // Configurar eventos
    const btnNovaDivida = document.getElementById("btnNovaDivida");
    if (btnNovaDivida) {
      btnNovaDivida.addEventListener("click", novaDivida);
    }

    // Carregar dados iniciais
    await carregarDividasPeriodo();

    console.log("✅ Dívidas: Inicializado com sucesso");
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.Dividas = {
    // Dados
    dados,
    carregando,
    filtros,
    ordenacao,
    limiteAtual,
    totalRegistros,

    // Constantes
    LIMITE_PADRAO,

    // Carregamento
    carregarDividasPeriodo,

    // Renderização
    renderizarDividas,

    // CRUD
    novaDivida,
    editarDivida: window.editarDivida,
    excluirDivida: window.excluirDivida,

    // Quitação
    quitarParcela: window.quitarParcela,
    quitarDivida: window.quitarDivida,

    // Visualização
    abrirModalDivida: window.abrirModalDivida,

    // Filtros
    configurarFiltros,

    // Inicialização
    init,
  };

  console.log("✅ Dívidas exportado globalmente como window.Dividas");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
