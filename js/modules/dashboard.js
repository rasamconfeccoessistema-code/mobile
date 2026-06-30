// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Dashboard (dashboard.js) - Aba Geral
// Versão 1.0 - Dashboard com KPIs, gráficos e alertas
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Dashboard carregado");

  // ============================================================
  // DEPENDÊNCIAS
  // ============================================================

  const Utils = global.Utils || {};
  const Supabase = global.Supabase || {};
  const UI = global.UI || {};

  const {
    todayISO,
    formatDate,
    formatCurrency,
    formatTime,
    getMonthRange,
    getMonthRangeForDate,
    escapeHtml,
    capitalizeFirst,
    showToast: toast,
  } = Utils;

  // ============================================================
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let dados = {};
  let carregando = false;
  let periodState = {
    producao: new Date(),
    financeiro: new Date(),
    rh: new Date(),
  };

  // ============================================================
  // ELEMENTOS DO DOM (Cache)
  // ============================================================

  const $ = (id) => document.getElementById(id);

  // ============================================================
  // FUNÇÕES DE CARREGAMENTO DE DADOS
  // ============================================================

  /**
   * Carrega os dados iniciais do Supabase
   * @returns {Promise<Object>} Dados carregados
   */
  async function carregarDadosIniciais() {
    console.log("🔄 Dashboard: Carregando dados iniciais...");

    if (carregando) {
      console.log("⏳ Dashboard: Já está carregando, aguarde...");
      return dados;
    }

    carregando = true;

    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        throw new Error("Cliente Supabase não disponível");
      }

      const hoje = todayISO();
      const mesRange = getMonthRange();
      console.log(`📅 Dashboard: Mês atual: ${mesRange.mes}/${mesRange.ano}`);

      // ========== BUSCAR OS (Service Orders) ==========
      console.log("📊 Dashboard: Buscando OS...");
      let queryOS = supabase
        .from("service_orders")
        .select(
          `
          id, order_number, product_description, product_reference,
          total_quantity, unit_price, status, payment_status, payment_date, payment_method,
          expected_delivery, received_date, notes, updated_at,
          customers(company_name, trade_name)
        `,
        )
        .order("created_at", { ascending: false });

      const { data: todasOS, error: errOs } = await queryOS;
      if (errOs) {
        console.error("❌ Dashboard: Erro ao buscar OS:", errOs);
      }

      const osAtivas = (todasOS || []).filter(
        (o) => !["cancelado"].includes(o.status),
      );

      // ========== BUSCAR PROGRESSO DAS OS ==========
      const osIds = osAtivas.map((o) => o.id);
      let progressoMap = {};
      if (osIds.length > 0) {
        const { data: items } = await supabase
          .from("service_order_items")
          .select(
            "service_order_id, quantity, sewn_quantity, delivered_quantity",
          )
          .in("service_order_id", osIds);

        if (items) {
          items.forEach((item) => {
            if (!progressoMap[item.service_order_id]) {
              progressoMap[item.service_order_id] = {
                total: 0,
                costurado: 0,
                entregue: 0,
              };
            }
            progressoMap[item.service_order_id].total += item.quantity;
            progressoMap[item.service_order_id].costurado +=
              item.sewn_quantity || 0;
            progressoMap[item.service_order_id].entregue +=
              item.delivered_quantity || 0;
          });
        }
      }

      // ========== BUSCAR TRANSAÇÕES FINANCEIRAS ==========
      console.log("💰 Dashboard: Buscando transações financeiras...");

      // Buscar avulsas
      let queryAvulsas = supabase
        .from("financial_transactions")
        .select(
          `
          id, description, amount, due_date, date, status, type,
          payment_method, account_id, category_id,
          installments, total_installments, entry_amount, notes,
          chart_of_accounts(id, code, name, type)
        `,
        )
        .or("installments.is.null,installments.eq.false")
        .gte("due_date", mesRange.inicio)
        .lte("due_date", mesRange.fim)
        .neq("status", "cancelado");

      const { data: avulsas, error: errAvulsas } = await queryAvulsas;
      if (errAvulsas) console.error("❌ Dashboard: Erro avulsas:", errAvulsas);

      // Buscar parcelas do período
      const { data: parcelasPeriodo, error: errParc } = await supabase
        .from("financial_installments")
        .select(
          "transaction_id, id, numero_parcela, valor, vencimento, status, payment_date, interest_paid, late_fee_paid",
        )
        .gte("vencimento", mesRange.inicio)
        .lte("vencimento", mesRange.fim)
        .order("vencimento", { ascending: true });

      if (errParc) console.error("❌ Dashboard: Erro parcelas:", errParc);

      // Buscar transações das parcelas
      const idsTransacoes = [
        ...new Set(
          parcelasPeriodo?.map((p) => p.transaction_id).filter((id) => id) ||
            [],
        ),
      ];

      let transacoesParceladas = [];
      if (idsTransacoes.length > 0) {
        let queryParceladas = supabase
          .from("financial_transactions")
          .select(
            `
            id, description, amount, due_date, date, status, type,
            payment_method, account_id, category_id,
            installments, total_installments, entry_amount, notes,
            chart_of_accounts(id, code, name, type)
          `,
          )
          .in("id", idsTransacoes)
          .eq("installments", true)
          .neq("status", "cancelado");

        const { data: parceladas, error: errParceladas } =
          await queryParceladas;
        if (errParceladas)
          console.error("❌ Dashboard: Erro parceladas:", errParceladas);
        transacoesParceladas = parceladas || [];
      }

      // Montar transações com parcelas
      const transacoesComParcelas = [];

      for (const t of avulsas || []) {
        transacoesComParcelas.push({
          ...t,
          financial_installments: [],
        });
      }

      for (const t of transacoesParceladas) {
        const parcelasDaTransacao =
          parcelasPeriodo?.filter((p) => p.transaction_id === t.id) || [];
        transacoesComParcelas.push({
          ...t,
          financial_installments: parcelasDaTransacao,
        });
      }

      // Gerar eventos financeiros
      const eventosFinanceiros = gerarEventosFinanceiros(transacoesComParcelas);

      let totalReceitas = 0,
        totalDespesas = 0;
      let totalPagar = 0,
        totalReceber = 0;
      let contasVencidas = 0;

      for (const e of eventosFinanceiros) {
        if (e.tipo === "receber") {
          totalReceitas += e.valor;
          if (e.status === "pendente" || e.status === "atrasado") {
            totalReceber += e.valor;
          }
        } else {
          totalDespesas += e.valor;
          if (e.status === "pendente" || e.status === "atrasado") {
            totalPagar += e.valor;
          }
        }

        if (e.status === "pendente" && new Date(e.vencimento) < new Date()) {
          contasVencidas++;
        }
      }

      // ========== BUSCAR FUNCIONÁRIOS ==========
      console.log("👤 Dashboard: Buscando funcionários...");
      const { data: funcionarios, error: errFunc } = await supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("full_name");
      if (errFunc) console.error("❌ Dashboard: Erro funcionários:", errFunc);

      // ========== BUSCAR FÉRIAS ==========
      console.log("🌴 Dashboard: Buscando férias...");
      const { data: ferias, error: errFer } = await supabase
        .from("employee_vacations")
        .select(
          "*, employees(full_name, role, photo_url, phone_cell, email_personal)",
        )
        .eq("status", "agendada")
        .lte("start_date", hoje)
        .gte("end_date", hoje)
        .order("start_date", { ascending: true });
      if (errFer) console.error("❌ Dashboard: Erro férias:", errFer);

      // ========== BUSCAR AFASTAMENTOS ==========
      console.log("🏥 Dashboard: Buscando afastamentos...");
      const { data: afastamentos, error: errAbs } = await supabase
        .from("absences")
        .select(
          `
          *,
          employees(full_name, role, photo_url, phone_cell, email_personal)
        `,
        )
        .order("start_date", { ascending: false });
      if (errAbs) console.error("❌ Dashboard: Erro afastamentos:", errAbs);

      // ========== BUSCAR DÍVIDAS ==========
      console.log("⚠️ Dashboard: Buscando dívidas...");
      const { data: dividas, error: errDiv } = await supabase
        .from("debts")
        .select("*")
        .order("created_at", { ascending: false });
      if (errDiv) console.error("❌ Dashboard: Erro dívidas:", errDiv);

      let totalDividas = 0,
        totalPago = 0;
      for (const d of dividas || []) {
        totalDividas += parseFloat(d.total_amount) || 0;
        totalPago += parseFloat(d.paid_amount) || 0;
      }
      const saldoDevedor = totalDividas - totalPago;

      // ========== MONTAR OBJETO DE DADOS ==========
      dados = {
        osAtivas: osAtivas || [],
        progressoMap: progressoMap || {},
        eventosFinanceiros: eventosFinanceiros || [],
        totalReceitas: totalReceitas || 0,
        totalDespesas: totalDespesas || 0,
        totalPagar: totalPagar || 0,
        totalReceber: totalReceber || 0,
        contasVencidas: contasVencidas || 0,
        funcionarios: funcionarios || [],
        ferias: ferias || [],
        afastamentos: afastamentos || [],
        dividas: dividas || [],
        totalDividas: totalDividas || 0,
        saldoDevedor: saldoDevedor || 0,
        mesRange: mesRange,
        emCostura:
          osAtivas.filter((o) => o.status === "em_costura").length || 0,
        costurados:
          osAtivas.filter((o) => o.status === "costurado").length || 0,
      };

      console.log("✅ Dashboard: Dados carregados com sucesso!");
      return dados;
    } catch (e) {
      console.error("❌ Dashboard: Erro ao carregar dados:", e);
      if (UI.showToast) {
        UI.showToast("Erro", "Falha ao carregar dados do Supabase.", "error");
      }
      return dados;
    } finally {
      carregando = false;
    }
  }

  // ============================================================
  // FUNÇÃO PARA GERAR EVENTOS FINANCEIROS
  // ============================================================

  function gerarEventosFinanceiros(transacoes) {
    const eventos = [];
    for (const t of transacoes || []) {
      const transacaoParcelada = t.installments === true;
      if (transacaoParcelada && t.financial_installments?.length) {
        for (const parcela of t.financial_installments) {
          eventos.push({
            id: parcela.id,
            transaction_id: t.id,
            descricao: t.description || "Sem descrição",
            categoria: t.chart_of_accounts?.name || "-",
            tipo: t.type,
            valor: Number(parcela.valor),
            vencimento: parcela.vencimento,
            status: parcela.status || t.status,
            numero_parcela: parcela.numero_parcela,
            total_parcelas: t.total_installments || 1,
            payment_method: t.payment_method,
            payment_date: parcela.payment_date,
            interest_paid: parcela.interest_paid || 0,
            late_fee_paid: parcela.late_fee_paid || 0,
            isParcela: true,
            parcela_original: parcela,
            transacao_original: t,
          });
        }
      } else {
        eventos.push({
          id: t.id,
          transaction_id: t.id,
          descricao: t.description || "Sem descrição",
          categoria: t.chart_of_accounts?.name || "-",
          tipo: t.type,
          valor: Math.abs(Number(t.amount)),
          vencimento: t.due_date || t.date,
          status: t.status,
          numero_parcela: 1,
          total_parcelas: 1,
          payment_method: t.payment_method,
          payment_date: t.payment_date,
          interest_paid: t.interest || 0,
          late_fee_paid: 0,
          isParcela: false,
          parcela_original: null,
          transacao_original: t,
        });
      }
    }
    eventos.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    return eventos;
  }

  // ============================================================
  // RENDERIZAR - ABA GERAL (DASHBOARD)
  // ============================================================

  function renderizarGeral(dados) {
    console.log("📊 Dashboard: Renderizando Geral...");

    if (!dados || Object.keys(dados).length === 0) {
      console.warn("⚠️ Dashboard: Sem dados para renderizar");
      return;
    }

    const {
      osAtivas,
      eventosFinanceiros,
      totalReceitas,
      totalDespesas,
      contasVencidas,
      ferias,
      afastamentos,
      dividas,
      saldoDevedor,
    } = dados;

    const saldo = (totalReceitas || 0) - (totalDespesas || 0);

    // ========== ATUALIZAR RELÓGIO ==========
    const agora = new Date();
    const statusTime = document.getElementById("statusTime");
    const statusDate = document.getElementById("statusDate");
    const headerHora = document.getElementById("headerHora");
    const headerData = document.getElementById("headerData");

    if (statusTime) statusTime.textContent = formatTime();
    if (statusDate) statusDate.textContent = agora.toLocaleDateString("pt-BR");
    if (headerHora) headerHora.textContent = formatTime();
    if (headerData) {
      headerData.textContent = agora.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
    }

    // ========== KPI CARDS ==========
    const kpiEmProducao = document.getElementById("kpiEmProducao");
    const kpiContasVencidas = document.getElementById("kpiContasVencidas");
    const kpiFerias = document.getElementById("kpiFerias");
    const kpiSaldoMes = document.getElementById("kpiSaldoMes");
    const kpiEntregasMes = document.getElementById("kpiEntregasMes");
    const kpiDividasAtivas = document.getElementById("kpiDividasAtivas");

    if (kpiEmProducao) kpiEmProducao.textContent = (osAtivas || []).length;
    if (kpiContasVencidas) kpiContasVencidas.textContent = contasVencidas || 0;
    if (kpiFerias) kpiFerias.textContent = (ferias || []).length;
    if (kpiSaldoMes) kpiSaldoMes.textContent = formatCurrency(saldo);
    if (kpiEntregasMes) {
      kpiEntregasMes.textContent =
        (osAtivas || []).filter((o) => o.status === "entregue").length || 0;
    }
    if (kpiDividasAtivas)
      kpiDividasAtivas.textContent = formatCurrency(saldoDevedor || 0);

    // ========== GAUGE - DÍVIDAS ==========
    const maxDivida = Math.max(saldoDevedor || 0, 1000);
    const pct = Math.min(
      Math.round(((saldoDevedor || 0) / maxDivida) * 100),
      100,
    );
    const circumference = 188.5;
    const offset = circumference - (pct / 100) * circumference;

    const gaugeFill = document.getElementById("gaugeFill");
    const gaugePercent = document.getElementById("gaugePercent");

    if (gaugeFill) {
      gaugeFill.style.strokeDashoffset = offset;
    }
    if (gaugePercent) {
      gaugePercent.textContent = pct + "%";
    }

    // ========== ALERTAS ==========
    const alertas = [];

    if ((contasVencidas || 0) > 0) {
      alertas.push({
        prioridade: "high",
        icone: "ph-currency-circle-dollar",
        texto: `${contasVencidas} conta(s) vencida(s) no mês`,
        tag: "urgente",
      });
    }

    const divAtivas = (dividas || []).filter(
      (d) => d.status !== "quitada",
    ).length;
    if (divAtivas > 0) {
      alertas.push({
        prioridade: "medium",
        icone: "ph-warning",
        texto: `${divAtivas} dívida(s) ativa(s) em aberto`,
        tag: "atenção",
      });
    }

    if ((ferias || []).length > 0) {
      alertas.push({
        prioridade: "medium",
        icone: "ph-sun",
        texto: `${ferias.length} funcionário(s) em férias`,
        tag: "atenção",
      });
    }

    const afastamentosAtivos = (afastamentos || []).filter(
      (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date(),
    );
    if (afastamentosAtivos.length > 0) {
      alertas.push({
        prioridade: "high",
        icone: "ph-hospital",
        texto: `${afastamentosAtivos.length} funcionário(s) em afastamento`,
        tag: "urgente",
      });
    }

    if ((osAtivas || []).length === 0) {
      alertas.push({
        prioridade: "low",
        icone: "ph-factory",
        texto: "Nenhuma OS em produção no mês",
        tag: "info",
      });
    }

    const alertasCount = document.getElementById("alertasCount");
    const alertasContainer = document.getElementById("alertasContainer");

    if (alertasCount) alertasCount.textContent = alertas.length;

    if (alertasContainer) {
      if (alertas.length === 0) {
        alertasContainer.innerHTML = `
          <div class="alert-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
            <i class="ph ph-check-circle" style="color:var(--success);font-size:14px;flex-shrink:0;"></i>
            <span style="flex:1;color:var(--gray);">Tudo em dia! ✅</span>
          </div>
        `;
      } else {
        alertasContainer.innerHTML = alertas
          .map(
            (a) => `
            <div class="alert-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
              <i class="ph ${a.icone}" style="color:${a.prioridade === "high" ? "var(--error)" : a.prioridade === "medium" ? "var(--warning)" : "var(--info)"};font-size:14px;flex-shrink:0;"></i>
              <span style="flex:1;color:var(--gray);">${a.texto}</span>
              <span class="alert-tag ${a.prioridade === "high" ? "tag-high" : a.prioridade === "medium" ? "tag-medium" : "tag-low"}">${a.tag}</span>
            </div>
          `,
          )
          .join("");
      }
    }

    // ========== BAR CHART (Resumo Financeiro) ==========
    const maxValor = Math.max(totalReceitas || 0, totalDespesas || 0, 1);
    const pctReceita = Math.round(((totalReceitas || 0) / maxValor) * 100);
    const pctDespesa = Math.round(((totalDespesas || 0) / maxValor) * 100);

    const barReceita = document.getElementById("barReceita");
    const barDespesa = document.getElementById("barDespesa");
    const valorReceita = document.getElementById("valorReceita");
    const valorDespesa = document.getElementById("valorDespesa");
    const saldoFinal = document.getElementById("saldoFinal");
    const resumoPeriodo = document.getElementById("resumoPeriodo");

    if (barReceita) {
      barReceita.style.width = Math.min(pctReceita, 100) + "%";
    }
    if (barDespesa) {
      barDespesa.style.width = Math.min(pctDespesa, 100) + "%";
    }
    if (valorReceita) {
      valorReceita.textContent = formatCurrency(totalReceitas || 0);
    }
    if (valorDespesa) {
      valorDespesa.textContent = formatCurrency(totalDespesas || 0);
    }
    if (saldoFinal) {
      saldoFinal.textContent = formatCurrency(saldo);
    }
    if (resumoPeriodo) {
      const mesNome = new Date().toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
      resumoPeriodo.textContent = mesNome;
    }

    console.log("✅ Dashboard: Renderização concluída");
  }

  // ============================================================
  // FUNÇÃO PARA ATUALIZAR OS DADOS (Refresh)
  // ============================================================

  async function atualizarDados() {
    console.log("🔄 Dashboard: Atualizando dados...");
    const dadosAtualizados = await carregarDadosIniciais();
    renderizarGeral(dadosAtualizados);
    return dadosAtualizados;
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.Dashboard = {
    // Dados
    dados,
    carregando,
    periodState,

    // Carregamento
    carregarDadosIniciais,
    atualizarDados,

    // Renderização
    renderizarGeral,

    // Utilitários
    gerarEventosFinanceiros,
  };

  console.log("✅ Dashboard exportado globalmente como window.Dashboard");

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("📊 Dashboard: Inicializando...");

    // Carregar dados iniciais
    await carregarDadosIniciais();

    // Renderizar
    renderizarGeral(dados);

    console.log("✅ Dashboard: Inicializado com sucesso");
  }

  global.Dashboard.init = init;

  // Inicializar automaticamente após o DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
