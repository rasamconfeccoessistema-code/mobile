// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Dívidas (dividas.js) - Aba de Dívidas
// Versão 3.0 - MODO LEITURA (APENAS VISUALIZAÇÃO)
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Dívidas carregado - Modo Leitura");

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

      console.log("💰 Dívidas: Carregando dados (Modo Leitura)...");

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
          (p) => !p.paid && new Date(p.due_date) < hoje
        );
        if (parcelaVencida) vencidas++;

        const parcelaProxima = parcelas.some(
          (p) =>
            !p.paid &&
            p.due_date >= todayISO() &&
            new Date(p.due_date) <= new Date(Date.now() + 7 * 86400000)
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
        `✅ Dívidas: ${dividasComFornecedor.length} dívidas carregadas (Modo Leitura)`
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
  // RENDERIZAR - ABA DÍVIDAS (MODO LEITURA)
  // ============================================================

  function renderizarDividas(dados) {
    console.log("📊 Dívidas: Renderizando (Modo Leitura)...");

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
          <p style="font-size:12px;color:var(--gray);margin-top:4px;">Não há dívidas para este período</p>
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
                 padding: 12px 14px;
                 margin-bottom: 10px;
                 border-radius: 12px;
                 border: 1px solid ${
                   vencida
                     ? "rgba(255,82,82,0.2)"
                     : d.status === "quitada"
                     ? "rgba(76,175,80,0.2)"
                     : "rgba(255,255,255,0.06)"
                 };
                 border-left: 4px solid ${
                   vencida
                     ? "var(--error)"
                     : d.status === "quitada"
                     ? "var(--success)"
                     : "var(--warning)"
                 };
                 background: ${
                   vencida
                     ? "rgba(255,82,82,0.05)"
                     : "rgba(255,255,255,0.02)"
                 };
                 transition: all 0.2s ease;
                 cursor: pointer;
                 gap: 4px;
               "
               onclick="window.Dividas.abrirModalDivida('${d.id}')"
               onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)'; this.style.transform='translateY(-2px)';"
               onmouseleave="this.style.boxShadow='none'; this.style.transform='translateY(0)';"
               >
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; font-weight: 700; color: ${
                  vencida
                    ? "var(--error)"
                    : d.status === "quitada"
                    ? "var(--success)"
                    : "var(--gold-light)"
                }; display: flex; align-items: center; gap: 6px;">
                  <i class="ph ${catIcon}" style="font-size: 15px;"></i>
                  ${escapeHtml(credorExibicao)}
                </div>
                <div style="font-size: 10px; color: var(--gray-dark); margin-top: 1px; display: flex; flex-wrap: wrap; gap: 3px 10px;">
                  <span><i class="ph ph-tag"></i> ${formatarTipoDivida(
                    d.type
                  )}</span>
                  <span><i class="ph ph-currency-circle-dollar"></i> ${formatCurrency(
                    d.total_amount
                  )}</span>
                  <span><i class="ph ph-receipt"></i> ${pagas}/${totalParcelas}</span>
                  <span><i class="ph ph-calendar"></i> Próx.: ${proxVenc}</span>
                  ${
                    anexosCount > 0
                      ? `<span><i class="ph ph-paperclip"></i> ${anexosCount}</span>`
                      : ""
                  }
                </div>
              </div>
              <div style="text-align: right; flex-shrink: 0;">
                <span style="font-size:0.6rem; color:${statusColor}; background:${statusColor}22; padding:2px 10px; border-radius:20px; border:1px solid ${statusColor}44; font-weight:500;">
                  ${statusBadge}
                </span>
              </div>
            </div>

            <div style="margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.04);">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--gray-dark); margin-bottom: 2px;">
                    <span>Pago: ${formatCurrency(
                      parcelas
                        .filter((p) => p.paid)
                        .reduce((s, p) => s + parseFloat(p.amount), 0)
                    )}</span>
                    <span>${percentual.toFixed(0)}%</span>
                  </div>
                  <div style="width:100%; height:3px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
                    <div style="width:${Math.min(
                      percentual,
                      100
                    )}%; height:100%; background:${
          d.status === "quitada" ? "var(--success)" : "var(--gold)"
        }; border-radius:2px; transition:width 0.8s ease;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.04);">
              <button class="btn-action btn-action-ghost" 
                      style="padding:4px 12px; font-size:0.6rem; border-radius:8px; min-height:36px;"
                      onclick="event.stopPropagation(); window.Dividas.abrirModalDivida('${d.id}')">
                <i class="ph ph-eye"></i> Visualizar
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

    console.log(`✅ Dívidas: ${dividas.length} dívidas renderizadas (Modo Leitura)`);
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
  // FILTROS - BOTTOM SHEET
  // ============================================================

  function configurarFiltros() {
    const container = document.getElementById("filtrosDividas");
    if (!container) return;

    // Contar filtros ativos
    const filtrosAtivos = Object.values(filtros).filter(v => v && v !== "").length;

    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="btnAbrirFiltrosDividas" style="padding:6px 14px; font-size:0.75rem; min-height:36px;">
          <i class="ph ph-funnel"></i> Filtros
          ${filtrosAtivos > 0 ? `<span style="background:var(--pink);color:#fff;border-radius:50%;padding:0 6px;font-size:0.6rem;margin-left:4px;">${filtrosAtivos}</span>` : ''}
        </button>
        ${filtrosAtivos > 0 ? `
          <button class="btn btn-ghost btn-sm" id="btnLimparFiltrosDividas" style="padding:6px 14px; font-size:0.75rem; min-height:36px;">
            <i class="ph ph-x"></i> Limpar
          </button>
        ` : ''}
        <div style="flex:1; text-align:right; font-size:0.6rem; color:var(--gray-dark);">
          ${totalRegistros || 0} registros
        </div>
      </div>
    `;

    // Event listener para abrir filtros em bottom sheet
    document.getElementById("btnAbrirFiltrosDividas")?.addEventListener("click", () => {
      abrirFiltrosBottomSheet();
    });

    document.getElementById("btnLimparFiltrosDividas")?.addEventListener("click", () => {
      filtros = {
        credor: "",
        status: "",
        tipo: "",
        vencimentoInicio: "",
        vencimentoFim: "",
        fornecedorId: "",
      };
      carregarDividasPeriodo();
    });
  }

  /**
   * Abre bottom sheet com filtros avançados
   */
  function abrirFiltrosBottomSheet() {
    const html = `
      <div style="display:grid; gap:16px; padding:4px 0;">
        <div style="text-align:center; color:var(--gray-dark); font-size:0.7rem;">
          <i class="ph ph-funnel"></i> Filtre as dívidas
        </div>
        
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user"></i> Credor</label>
          <input id="filtroCredorBS" class="form-input" placeholder="Buscar credor..." value="${filtros.credor || ''}" style="padding:8px 12px; font-size:0.85rem;">
        </div>
        
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Status</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="filtro-chip ${filtros.status === '' ? 'active' : ''}" data-status="" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.status === '' ? 'rgba(212,160,23,0.2)' : 'transparent'}; color:${filtros.status === '' ? 'var(--gold-light)' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              Todos
            </button>
            <button class="filtro-chip ${filtros.status === 'ativa' ? 'active' : ''}" data-status="ativa" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.status === 'ativa' ? 'rgba(255,193,7,0.2)' : 'transparent'}; color:${filtros.status === 'ativa' ? '#ffe082' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              🟡 Ativa
            </button>
            <button class="filtro-chip ${filtros.status === 'quitada' ? 'active' : ''}" data-status="quitada" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.status === 'quitada' ? 'rgba(76,175,80,0.2)' : 'transparent'}; color:${filtros.status === 'quitada' ? '#a5d6a7' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              ✅ Quitada
            </button>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Tipo</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="filtro-chip-tipo ${filtros.tipo === '' ? 'active' : ''}" data-tipo="" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.tipo === '' ? 'rgba(212,160,23,0.2)' : 'transparent'}; color:${filtros.tipo === '' ? 'var(--gold-light)' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              Todos
            </button>
            <button class="filtro-chip-tipo ${filtros.tipo === 'bancaria' ? 'active' : ''}" data-tipo="bancaria" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.tipo === 'bancaria' ? 'rgba(66,165,245,0.2)' : 'transparent'}; color:${filtros.tipo === 'bancaria' ? '#64b5f6' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              🏦 Bancária
            </button>
            <button class="filtro-chip-tipo ${filtros.tipo === 'fornecedor' ? 'active' : ''}" data-tipo="fornecedor" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.tipo === 'fornecedor' ? 'rgba(212,160,23,0.2)' : 'transparent'}; color:${filtros.tipo === 'fornecedor' ? 'var(--gold-light)' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              🚚 Fornecedor
            </button>
            <button class="filtro-chip-tipo ${filtros.tipo === 'imposto' ? 'active' : ''}" data-tipo="imposto" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.tipo === 'imposto' ? 'rgba(255,82,82,0.2)' : 'transparent'}; color:${filtros.tipo === 'imposto' ? '#ff8a80' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              📋 Imposto
            </button>
            <button class="filtro-chip-tipo ${filtros.tipo === 'pessoal' ? 'active' : ''}" data-tipo="pessoal" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.tipo === 'pessoal' ? 'rgba(76,175,80,0.2)' : 'transparent'}; color:${filtros.tipo === 'pessoal' ? '#a5d6a7' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              👤 Pessoal
            </button>
            <button class="filtro-chip-tipo ${filtros.tipo === 'outro' ? 'active' : ''}" data-tipo="outro" style="padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:${filtros.tipo === 'outro' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color:${filtros.tipo === 'outro' ? 'var(--gray)' : 'var(--gray)'}; font-size:0.7rem; cursor:pointer; transition:all 0.2s ease;">
              📌 Outro
            </button>
          </div>
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label"><i class="ph ph-calendar"></i> Vencimento Início</label>
            <input id="filtroVencimentoInicioBS" type="date" class="form-input" value="${filtros.vencimentoInicio || ''}" style="padding:6px 10px; font-size:0.8rem;">
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-calendar-check"></i> Vencimento Fim</label>
            <input id="filtroVencimentoFimBS" type="date" class="form-input" value="${filtros.vencimentoFim || ''}" style="padding:6px 10px; font-size:0.8rem;">
          </div>
        </div>
        
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
          <button class="btn btn-ghost" id="cancelarFiltrosDividas" style="padding:8px 16px;">
            <i class="ph ph-x-circle"></i> Cancelar
          </button>
          <button class="btn btn-primary" id="aplicarFiltrosDividas" style="padding:8px 20px;">
            <i class="ph ph-check-circle"></i> Aplicar
          </button>
        </div>
      </div>
    `;

    UI.openModal('🔍 Filtros', html);

    // Event listeners para os chips de status
    document.querySelectorAll('.filtro-chip').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.filtro-chip').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'var(--gray)';
        });
        this.classList.add('active');
        this.style.background = 'rgba(212,160,23,0.2)';
        this.style.color = 'var(--gold-light)';
      });
    });

    // Event listeners para os chips de tipo
    document.querySelectorAll('.filtro-chip-tipo').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.filtro-chip-tipo').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'var(--gray)';
        });
        this.classList.add('active');
        this.style.background = 'rgba(212,160,23,0.2)';
        this.style.color = 'var(--gold-light)';
      });
    });

    // Cancelar
    document.getElementById('cancelarFiltrosDividas')?.addEventListener('click', () => {
      document.getElementById('modalContainer').innerHTML = '';
    });

    // Aplicar filtros
    document.getElementById('aplicarFiltrosDividas')?.addEventListener('click', () => {
      const credor = document.getElementById('filtroCredorBS').value;
      const statusChip = document.querySelector('.filtro-chip.active');
      const status = statusChip ? statusChip.dataset.status : '';
      const tipoChip = document.querySelector('.filtro-chip-tipo.active');
      const tipo = tipoChip ? tipoChip.dataset.tipo : '';
      const vencimentoInicio = document.getElementById('filtroVencimentoInicioBS').value;
      const vencimentoFim = document.getElementById('filtroVencimentoFimBS').value;

      filtros.credor = credor;
      filtros.status = status;
      filtros.tipo = tipo;
      filtros.vencimentoInicio = vencimentoInicio;
      filtros.vencimentoFim = vencimentoFim;

      document.getElementById('modalContainer').innerHTML = '';
      carregarDividasPeriodo();
    });
  }

  // ============================================================
  // FUNÇÕES DE MODAL - DÍVIDA (MODO LEITURA)
  // ============================================================

  /**
   * Abre o modal com detalhes da dívida usando o padrão de modal padronizado
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
      const isQuitada = divida.status === "quitada";
      const totalParcelas = parcelas?.length || 0;
      const pagas = parcelas?.filter((p) => p.paid).length || 0;
      const percentual = totalParcelas > 0 ? (pagas / totalParcelas) * 100 : 0;

      // ========== DEFINIR STATUS DO BANNER ==========
      let statusConfig = {};
      if (isQuitada) {
        statusConfig = {
          status: "success",
          statusIcon: "ph-check-circle",
          statusTitle: "✅ Dívida Quitada",
          statusSub: `Todas as ${totalParcelas} parcelas foram pagas`,
        };
      } else if (saldo > 0) {
        const hasVencida = parcelas?.some(
          (p) => !p.paid && new Date(p.due_date) < new Date()
        );
        if (hasVencida) {
          statusConfig = {
            status: "danger",
            statusIcon: "ph-warning-circle",
            statusTitle: "🔴 Parcelas Vencidas",
            statusSub: `Saldo devedor: ${formatCurrency(saldo)}`,
          };
        } else {
          statusConfig = {
            status: "warning",
            statusIcon: "ph-clock",
            statusTitle: "🟡 Dívida em Andamento",
            statusSub: `Saldo devedor: ${formatCurrency(saldo)}`,
          };
        }
      }

      // ========== INFORMAÇÕES PRINCIPAIS ==========
      const infoItems = [
        {
          label: "Credor",
          value: escapeHtml(divida.creditor),
          class: "highlight",
        },
        { label: "Tipo", value: formatarTipoDivida(divida.type) },
        {
          label: "Valor Total",
          value: formatCurrency(divida.total_amount),
          class: "highlight",
        },
        {
          label: "Saldo Devedor",
          value: formatCurrency(saldo),
          class: saldo > 0 ? "danger" : "success",
        },
        {
          label: "Taxa de Juros",
          value: `${divida.interest_rate || 0}% ao mês`,
        },
        { label: "Parcelas", value: `${pagas}/${totalParcelas}` },
      ];

      // ========== HTML DAS PARCELAS ==========
      let parcelasHtml = "";
      if (parcelas && parcelas.length > 0) {
        const hoje = new Date();

        // Resumo das parcelas
        parcelasHtml = `
          <div class="modal-parcelas-resumo">
            <span class="resumo-item">
              Total: <strong class="valor">${formatCurrency(
                divida.total_amount
              )}</strong>
            </span>
            <span class="resumo-item">
              Pago: <strong>${formatCurrency(totalPago)}</strong>
            </span>
            <span class="resumo-item">
              ${pagas}/${totalParcelas} parcelas
            </span>
            <div class="progresso-container">
              <div class="progresso-bar ${
                percentual >= 100
                  ? "success"
                  : percentual >= 50
                  ? "warning"
                  : "danger"
              }" 
                   style="width: ${Math.min(percentual, 100)}%;"></div>
            </div>
          </div>
          <div class="modal-parcelas-list">
            ${parcelas
              .map((p) => {
                const isPaga = p.paid === true;
                const isVencida = !isPaga && new Date(p.due_date) < hoje;
                const isProxima =
                  !isPaga &&
                  !isVencida &&
                  new Date(p.due_date) <=
                    new Date(Date.now() + 7 * 86400000);

                let statusClass = "futuro";
                let statusText = "📅 Futura";
                if (isPaga) {
                  statusClass = "pago";
                  statusText = "✅ Paga";
                } else if (isVencida) {
                  statusClass = "vencido";
                  statusText = "🔴 Vencida";
                } else if (isProxima) {
                  statusClass = "pendente";
                  statusText = "⏳ Próxima";
                } else {
                  statusText = "⏳ Pendente";
                }

                return `
              <div class="modal-parcela-card status-${statusClass}">
                <div class="parcela-left">
                  <span class="parcela-numero">${p.installment_number}ª</span>
                  <div class="parcela-info">
                    <span class="parcela-valor">${formatCurrency(
                      p.amount
                    )}</span>
                    <span class="parcela-data">Vence: ${formatDate(
                      p.due_date
                    )}</span>
                  </div>
                </div>
                <span class="parcela-status ${statusClass}">${statusText}</span>
              </div>
            `;
              })
              .join("")}
          </div>
        `;
      }

      // ========== SEÇÕES DO MODAL ==========
      const secoes = [];
      if (parcelas && parcelas.length > 0) {
        secoes.push({
          titulo: "Parcelas",
          icon: "ph-receipt",
          badge: `${pagas}/${totalParcelas}`,
          html: parcelasHtml,
        });
      }

      if (divida.notes) {
        secoes.push({
          titulo: "Observações",
          icon: "ph-note",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(
            divida.notes
          )}</div>`,
        });
      }

      // ========== AÇÕES (APENAS FECHAR) ==========
      const acoes = [
        {
          label: "Fechar",
          icon: "ph-x-circle",
          class: "ghost",
          onclick: "document.getElementById('modalContainer').innerHTML = ''",
        }
      ];

      // ========== CRIAR MODAL PADRONIZADO ==========
      UI.criarModalPadronizado(
        `📋 ${escapeHtml(divida.creditor)}`,
        {
          ...statusConfig,
          infoItems,
          secoes,
          acoes,
        }
      );
    } catch (e) {
      console.error("Erro ao abrir modal da dívida:", e);
      UI.showToast("Erro", "Falha ao carregar detalhes da dívida.", "error");
    }
  };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("💰 Dívidas: Inicializando (Modo Leitura)...");

    // Carregar dados iniciais
    await carregarDividasPeriodo();

    console.log("✅ Dívidas: Inicializado com sucesso (Modo Leitura)");
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

    // Visualização
    abrirModalDivida: window.abrirModalDivida,

    // Filtros
    configurarFiltros,

    // Inicialização
    init,
  };

  console.log("✅ Dívidas exportado globalmente como window.Dividas (Modo Leitura)");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
