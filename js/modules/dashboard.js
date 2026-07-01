// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Dashboard (dashboard.js) - Aba Geral
// Versão 2.1 - Com correções de hierarquia visual e gráficos
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
    getMonthName,
    showToast: toast,
  } = Utils;

  // ============================================================
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let dados = {};
  let carregando = false;
  let graficoPeriodo = "atual"; // atual, ultimo, 3m, 6m, 12m
  let periodState = {
    producao: new Date(),
    financeiro: new Date(),
    rh: new Date(),
  };

  // Cores para os gráficos
  const CORES_GRAFICO = {
    receita: "#4caf50",
    despesa: "#ff5252",
    bancaria: "#42a5f5",
    fornecedor: "#f0c75e",
    imposto: "#ff8a80",
    pessoal: "#a5d6a7",
    outro: "#9e9e9e",
    saldo: "#f0c75e",
    linha: "#f0c75e",
    fundo: "rgba(255,255,255,0.06)",
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
        `
        )
        .order("created_at", { ascending: false });

      const { data: todasOS, error: errOs } = await queryOS;
      if (errOs) {
        console.error("❌ Dashboard: Erro ao buscar OS:", errOs);
      }

      const osAtivas = (todasOS || []).filter(
        (o) => !["cancelado"].includes(o.status)
      );

      // ========== BUSCAR PROGRESSO DAS OS ==========
      const osIds = osAtivas.map((o) => o.id);
      let progressoMap = {};
      if (osIds.length > 0) {
        const { data: items } = await supabase
          .from("service_order_items")
          .select(
            "service_order_id, quantity, sewn_quantity, delivered_quantity"
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
        `
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
          "transaction_id, id, numero_parcela, valor, vencimento, status, payment_date, interest_paid, late_fee_paid"
        )
        .gte("vencimento", mesRange.inicio)
        .lte("vencimento", mesRange.fim)
        .order("vencimento", { ascending: true });

      if (errParc) console.error("❌ Dashboard: Erro parcelas:", errParc);

      // Buscar transações das parcelas
      const idsTransacoes = [
        ...new Set(
          parcelasPeriodo?.map((p) => p.transaction_id).filter((id) => id) || []
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
          `
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
      let contasVencerProximas = 0;
      const hojeDate = new Date();
      const dataLimiteProxima = new Date();
      dataLimiteProxima.setDate(dataLimiteProxima.getDate() + 7);

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

        if (e.status === "pendente" && new Date(e.vencimento) < hojeDate) {
          contasVencidas++;
        }

        if (
          e.status === "pendente" &&
          new Date(e.vencimento) >= hojeDate &&
          new Date(e.vencimento) <= dataLimiteProxima
        ) {
          contasVencerProximas++;
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
          "*, employees(full_name, role, photo_url, phone_cell, email_personal)"
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
        `
        )
        .order("start_date", { ascending: false });
      if (errAbs) console.error("❌ Dashboard: Erro afastamentos:", errAbs);

      // ========== BUSCAR DÍVIDAS (APENAS ATIVAS) ==========
      console.log("⚠️ Dashboard: Buscando dívidas ativas...");
      const { data: dividas, error: errDiv } = await supabase
        .from("debts")
        .select("*")
        .eq("status", "ativa")
        .order("created_at", { ascending: false });
      if (errDiv) console.error("❌ Dashboard: Erro dívidas:", errDiv);

      let totalDividasAtivas = 0,
        totalPagoDividas = 0;
      let dividasPorTipo = {
        bancaria: 0,
        fornecedor: 0,
        imposto: 0,
        pessoal: 0,
        outro: 0,
      };
      let totalDividasPorTipo = {
        bancaria: 0,
        fornecedor: 0,
        imposto: 0,
        pessoal: 0,
        outro: 0,
      };

      // Buscar parcelas das dívidas ativas
      const idsDividas = dividas?.map((d) => d.id) || [];
      let parcelasDividasMap = {};
      if (idsDividas.length > 0) {
        const { data: parcelasDividas } = await supabase
          .from("debt_installments")
          .select("*")
          .in("debt_id", idsDividas);

        if (parcelasDividas) {
          parcelasDividas.forEach((p) => {
            if (!parcelasDividasMap[p.debt_id]) {
              parcelasDividasMap[p.debt_id] = [];
            }
            parcelasDividasMap[p.debt_id].push(p);
          });
        }
      }

      for (const d of dividas || []) {
        const parcelas = parcelasDividasMap[d.id] || [];
        const valorTotal = parseFloat(d.total_amount) || 0;
        totalDividasAtivas += valorTotal;

        const valorPago = parcelas
          .filter((p) => p.paid === true)
          .reduce((sum, p) => sum + parseFloat(p.amount), 0);
        totalPagoDividas += valorPago;

        // Agrupar por tipo
        const tipo = d.type || "outro";
        if (dividasPorTipo[tipo] !== undefined) {
          dividasPorTipo[tipo] += 1;
          totalDividasPorTipo[tipo] += valorTotal;
        }
      }

      const saldoDevedorDividas = totalDividasAtivas - totalPagoDividas;
      const percentualQuitadoDividas =
        totalDividasAtivas > 0
          ? Math.round((totalPagoDividas / totalDividasAtivas) * 100)
          : 0;

      // ========== DADOS PARA GRÁFICOS (ÚLTIMOS 12 MESES) ==========
      const dadosGraficos = await carregarDadosGraficos(supabase);

      // ========== MONTAR OBJETO DE DADOS ==========
      const totalOS = osAtivas.length;
      const emCostura = osAtivas.filter((o) => o.status === "em_costura").length;
      const costurados = osAtivas.filter((o) => o.status === "costurado").length;
      const recebidos = osAtivas.filter((o) => o.status === "recebido").length;
      const entregues = osAtivas.filter((o) => o.status === "entregue").length;
      const pagos = osAtivas.filter((o) => o.payment_status === "pago").length;
      const pendentes = osAtivas.filter(
        (o) => o.payment_status === "pendente"
      ).length;
      const atrasados = osAtivas.filter((o) => {
        if (!o.expected_delivery) return false;
        const prazo = new Date(o.expected_delivery);
        return (
          prazo < new Date() && !["entregue", "cancelado", "pago"].includes(o.status)
        );
      }).length;

      // Valor total em produção (soma de todas as OS ativas)
      let valorTotalProducao = 0;
      for (const os of osAtivas) {
        valorTotalProducao += (os.total_quantity || 0) * (os.unit_price || 0);
      }

      const saldo = (totalReceitas || 0) - (totalDespesas || 0);

      dados = {
        osAtivas: osAtivas || [],
        progressoMap: progressoMap || {},
        eventosFinanceiros: eventosFinanceiros || [],
        totalReceitas: totalReceitas || 0,
        totalDespesas: totalDespesas || 0,
        totalPagar: totalPagar || 0,
        totalReceber: totalReceber || 0,
        contasVencidas: contasVencidas || 0,
        contasVencerProximas: contasVencerProximas || 0,
        funcionarios: funcionarios || [],
        ferias: ferias || [],
        afastamentos: afastamentos || [],
        dividasAtivas: dividas || [],
        totalDividasAtivas: totalDividasAtivas || 0,
        totalPagoDividas: totalPagoDividas || 0,
        saldoDevedorDividas: saldoDevedorDividas || 0,
        percentualQuitadoDividas: percentualQuitadoDividas || 0,
        dividasPorTipo: dividasPorTipo || {},
        totalDividasPorTipo: totalDividasPorTipo || {},
        mesRange: mesRange,
        // Métricas de Produção
        totalOS: totalOS || 0,
        emCostura: emCostura || 0,
        costurados: costurados || 0,
        recebidos: recebidos || 0,
        entregues: entregues || 0,
        pagos: pagos || 0,
        pendentes: pendentes || 0,
        atrasados: atrasados || 0,
        valorTotalProducao: valorTotalProducao || 0,
        saldo: saldo || 0,
        // Dados para gráficos
        dadosGraficos: dadosGraficos || {},
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
  // FUNÇÃO PARA CARREGAR DADOS DOS GRÁFICOS
  // ============================================================

  async function carregarDadosGraficos(supabase) {
    try {
      const hoje = new Date();
      const meses = [];
      const receitas = [];
      const despesas = [];
      const saldos = [];

      // Buscar dados dos últimos 12 meses
      for (let i = 11; i >= 0; i--) {
        const data = new Date(hoje);
        data.setMonth(data.getMonth() - i);
        const mes = data.getMonth() + 1;
        const ano = data.getFullYear();
        const mesStr = `${ano}-${String(mes).padStart(2, "0")}`;
        const mesNome = getMonthName(data.getMonth());

        const mesRange = getMonthRangeForDate(data);

        // Buscar transações do mês
        const { data: transacoes } = await supabase
          .from("financial_transactions")
          .select("type, amount, status")
          .gte("due_date", mesRange.inicio)
          .lte("due_date", mesRange.fim)
          .neq("status", "cancelado");

        let totalReceita = 0,
          totalDespesa = 0;
        for (const t of transacoes || []) {
          if (t.type === "receber" && t.status !== "cancelado") {
            totalReceita += Math.abs(Number(t.amount));
          } else if (t.type === "pagar" && t.status !== "cancelado") {
            totalDespesa += Math.abs(Number(t.amount));
          }
        }

        meses.push(mesNome);
        receitas.push(totalReceita);
        despesas.push(totalDespesa);
        saldos.push(totalReceita - totalDespesa);
      }

      return {
        meses,
        receitas,
        despesas,
        saldos,
      };
    } catch (e) {
      console.error("Erro ao carregar dados dos gráficos:", e);
      return {
        meses: [],
        receitas: [],
        despesas: [],
        saldos: [],
      };
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
      totalOS,
      emCostura,
      costurados,
      recebidos,
      entregues,
      pagos,
      pendentes,
      atrasados,
      valorTotalProducao,
      totalReceitas,
      totalDespesas,
      totalPagar,
      totalReceber,
      contasVencidas,
      contasVencerProximas,
      funcionarios,
      ferias,
      afastamentos,
      totalDividasAtivas,
      saldoDevedorDividas,
      percentualQuitadoDividas,
      dividasPorTipo,
      totalDividasPorTipo,
      saldo,
      dadosGraficos,
    } = dados;

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

    // ========== KPI CARDS COM HIERARQUIA VERTICAL ==========

    // Card: Produção
    const kpiProducao = document.getElementById("kpiProducao");
    if (kpiProducao) {
      kpiProducao.innerHTML = `
        <div class="kpi-label"><i class="ph ph-factory"></i> Produção</div>
        <div class="kpi-value">${totalOS || 0} lotes</div>
        <div class="kpi-detail" style="display:flex; flex-direction:column; align-items:center; gap:2px; margin-top:4px;">
          <span><i class="ph ph-inbox"></i> Recebidos: ${recebidos || 0}</span>
          <span><i class="ph ph-sewing-needle"></i> Em Costura: ${emCostura || 0}</span>
          <span><i class="ph ph-check-circle"></i> Costurados: ${costurados || 0}</span>
          <span><i class="ph ph-truck"></i> Entregues: ${entregues || 0}</span>
          <span><i class="ph ph-currency-dollar"></i> Pagos: ${pagos || 0}</span>
          <span><i class="ph ph-clock"></i> Pendentes: ${pendentes || 0}</span>
          <span style="color:var(--gold-light); font-weight:600; margin-top:2px;">
            <i class="ph ph-currency-circle-dollar"></i> Valor total: ${formatCurrency(valorTotalProducao || 0)}
          </span>
        </div>
        <div class="deco-line gold"></div>
      `;
    }

    // Card: Financeiro
    const kpiFinanceiro = document.getElementById("kpiFinanceiro");
    if (kpiFinanceiro) {
      const saldoClass = saldo >= 0 ? "success" : "danger";
      kpiFinanceiro.innerHTML = `
        <div class="kpi-label"><i class="ph ph-currency-circle-dollar"></i> Financeiro</div>
        <div class="kpi-value ${saldoClass}">${formatCurrency(saldo || 0)}</div>
        <div class="kpi-detail" style="display:flex; flex-direction:column; align-items:center; gap:2px; margin-top:4px;">
          <span><i class="ph ph-arrow-circle-up"></i> A Receber: ${formatCurrency(totalReceber || 0)}</span>
          <span><i class="ph ph-arrow-circle-down"></i> A Pagar: ${formatCurrency(totalPagar || 0)}</span>
          <span><i class="ph ph-warning-circle"></i> Vencidas: ${contasVencidas || 0}</span>
          <span><i class="ph ph-clock"></i> Vencem em 7 dias: ${contasVencerProximas || 0}</span>
        </div>
        <div class="deco-line green"></div>
      `;
    }

    // Card: RH
    const kpiRH = document.getElementById("kpiRH");
    if (kpiRH) {
      const totalFuncionarios = funcionarios?.length || 0;
      const totalFerias = ferias?.length || 0;
      const totalAfastamentos = (afastamentos || []).filter(
        (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date()
      ).length;

      kpiRH.innerHTML = `
        <div class="kpi-label"><i class="ph ph-users"></i> Recursos Humanos</div>
        <div class="kpi-value">${totalFuncionarios}</div>
        <div class="kpi-detail" style="display:flex; flex-direction:column; align-items:center; gap:2px; margin-top:4px;">
          <span><i class="ph ph-sun"></i> Em férias: ${totalFerias}</span>
          <span><i class="ph ph-hospital"></i> Em afastamento: ${totalAfastamentos}</span>
        </div>
        <div class="deco-line pink"></div>
      `;
    }

    // ========== CARD: DÍVIDAS ATIVAS ==========
    const kpiDividas = document.getElementById("kpiDividas");
    if (kpiDividas) {
      const totalDividas = dados.dividasAtivas?.length || 0;
      const pct = Math.min(percentualQuitadoDividas || 0, 100);
      const circumference = 188.5;
      const offset = circumference - (pct / 100) * circumference;

      kpiDividas.innerHTML = `
        <div class="card-label" style="display:flex; align-items:center; gap:8px;">
          <i class="ph ph-warning-circle" style="color:var(--warning);"></i>
          Dívidas Ativas
          <span style="margin-left:auto; font-size:0.6rem; color:var(--gray-dark);">${totalDividas} dívidas</span>
        </div>
        <div class="divida-card">
          <div class="left">
            <div class="card-value danger" style="font-size:24px;">
              ${formatCurrency(saldoDevedorDividas || 0)}
            </div>
            <div class="card-detail" style="font-size:10px;">
              Total original: ${formatCurrency(totalDividasAtivas || 0)} • ${pct}% quitado
            </div>
            <div style="margin-top:6px; height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, var(--warning), var(--success)); border-radius:2px; transition:width 0.8s ease;"></div>
            </div>
          </div>
          <div class="right" style="width:60px; height:60px;">
            <svg viewBox="0 0 72 72">
              <circle class="gauge-bg" cx="36" cy="36" r="30" />
              <circle
                class="gauge-fill"
                cx="36"
                cy="36"
                r="30"
                stroke-dasharray="188.5"
                stroke-dashoffset="${offset}"
                style="stroke: url(#gaugeGrad);"
              />
            </svg>
            <div class="gauge-center" style="font-size:10px;">
              <span>${pct}%</span>
            </div>
          </div>
        </div>
        <div class="deco-line gold"></div>
      `;
    }

    // ========== GRÁFICOS ==========
    renderizarGraficos(dadosGraficos);

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

    if ((atrasados || 0) > 0) {
      alertas.push({
        prioridade: "high",
        icone: "ph-warning",
        texto: `${atrasados} lote(s) atrasado(s) na produção`,
        tag: "urgente",
      });
    }

    const afastamentosAtivos = (afastamentos || []).filter(
      (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date()
    );
    if (afastamentosAtivos.length > 0) {
      alertas.push({
        prioridade: "high",
        icone: "ph-hospital",
        texto: `${afastamentosAtivos.length} funcionário(s) em afastamento`,
        tag: "urgente",
      });
    }

    const divAtivas = dados.dividasAtivas?.length || 0;
    if (divAtivas > 0) {
      alertas.push({
        prioridade: "medium",
        icone: "ph-warning-circle",
        texto: `${divAtivas} dívida(s) ativa(s) em aberto`,
        tag: "atenção",
      });
    }

    if ((contasVencerProximas || 0) > 0) {
      alertas.push({
        prioridade: "medium",
        icone: "ph-clock",
        texto: `${contasVencerProximas} conta(s) vence(m) em até 7 dias`,
        tag: "atenção",
      });
    }

    if ((ferias || []).length > 0) {
      alertas.push({
        prioridade: "low",
        icone: "ph-sun",
        texto: `${ferias.length} funcionário(s) em férias`,
        tag: "info",
      });
    }

    if ((totalOS || 0) === 0) {
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
              <i class="ph ${a.icone}" style="color:${
              a.prioridade === "high"
                ? "var(--error)"
                : a.prioridade === "medium"
                ? "var(--warning)"
                : "var(--info)"
            };font-size:14px;flex-shrink:0;"></i>
              <span style="flex:1;color:var(--gray);">${a.texto}</span>
              <span class="alert-tag ${
                a.prioridade === "high"
                  ? "tag-high"
                  : a.prioridade === "medium"
                  ? "tag-medium"
                  : "tag-low"
              }">${a.tag}</span>
            </div>
          `
          )
          .join("");
      }
    }

    console.log("✅ Dashboard: Renderização concluída");
  }

  // ============================================================
  // FUNÇÃO PARA RENDERIZAR GRÁFICOS
  // ============================================================

  function renderizarGraficos(dadosGraficos) {
    const container = document.getElementById("graficosContainer");
    if (!container) {
      console.warn("⚠️ Container #graficosContainer não encontrado");
      return;
    }

    // Verificar se dadosGraficos existe e tem dados
    if (!dadosGraficos || !dadosGraficos.meses || dadosGraficos.meses.length === 0) {
      container.innerHTML = `
        <div class="big-card" style="padding:14px 16px; margin-bottom:12px;">
          <div style="text-align:center; padding:20px 0; color:var(--gray-dark);">
            <i class="ph ph-chart-line" style="font-size:28px;display:block;margin-bottom:8px;color:var(--gray);"></i>
            <p style="font-size:12px;">Nenhum dado disponível para gráficos</p>
            <p style="font-size:10px;color:var(--gray);margin-top:4px;">Cadastre transações financeiras para visualizar os gráficos</p>
          </div>
        </div>
      `;
      return;
    }

    // Seletor de período
    const periodOptions = [
      { value: "atual", label: "Mês atual" },
      { value: "ultimo", label: "Último mês" },
      { value: "3m", label: "3 meses" },
      { value: "6m", label: "6 meses" },
      { value: "12m", label: "12 meses" },
    ];

    // Filtrar dados conforme período selecionado
    let meses = dadosGraficos.meses || [];
    let receitas = dadosGraficos.receitas || [];
    let despesas = dadosGraficos.despesas || [];
    let saldos = dadosGraficos.saldos || [];

    const totalMeses = meses.length;
    let limite = 12;
    switch (graficoPeriodo) {
      case "atual":
        limite = 1;
        break;
      case "ultimo":
        limite = 2;
        break;
      case "3m":
        limite = 3;
        break;
      case "6m":
        limite = 6;
        break;
      case "12m":
      default:
        limite = 12;
        break;
    }

    if (totalMeses > limite) {
      meses = meses.slice(-limite);
      receitas = receitas.slice(-limite);
      despesas = despesas.slice(-limite);
      saldos = saldos.slice(-limite);
    }

    // Verificar se após o filtro ainda há dados
    if (meses.length === 0) {
      container.innerHTML = `
        <div class="big-card" style="padding:14px 16px; margin-bottom:12px;">
          <div style="text-align:center; padding:20px 0; color:var(--gray-dark);">
            <i class="ph ph-chart-line" style="font-size:28px;display:block;margin-bottom:8px;color:var(--gray);"></i>
            <p style="font-size:12px;">Sem dados para o período selecionado</p>
          </div>
        </div>
      `;
      return;
    }

    const maxValor = Math.max(
      ...receitas,
      ...despesas,
      Math.max(...saldos, 0) + 1000
    );

    // ========== GRÁFICO 1: Receitas vs Despesas ==========
    let graficoBarrasHtml = "";
    if (meses.length > 0) {
      const maxBar = Math.max(...receitas, ...despesas, 1);
      graficoBarrasHtml = meses
        .map((mes, i) => {
          const pctReceita = Math.round((receitas[i] / maxBar) * 100);
          const pctDespesa = Math.round((despesas[i] / maxBar) * 100);
          return `
            <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:30px;">
              <div style="display:flex; justify-content:center; gap:2px; height:60px; align-items:flex-end;">
                <div style="width:12px; height:${Math.max(pctReceita, 2)}%; background:${CORES_GRAFICO.receita}; border-radius:3px 3px 0 0; min-height:4px; transition:height 0.6s ease;"></div>
                <div style="width:12px; height:${Math.max(pctDespesa, 2)}%; background:${CORES_GRAFICO.despesa}; border-radius:3px 3px 0 0; min-height:4px; transition:height 0.6s ease;"></div>
              </div>
              <div style="font-size:0.5rem; color:var(--gray-dark); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${mes.substring(0, 3)}</div>
            </div>
          `;
        })
        .join("");
    }

    // ========== GRÁFICO 2: Distribuição de Dívidas por Tipo ==========
    const tipos = dados.dividasPorTipo || {};
    const tiposLabels = {
      bancaria: "Bancária",
      fornecedor: "Fornecedor",
      imposto: "Imposto",
      pessoal: "Pessoal",
      outro: "Outro",
    };
    const tiposCores = {
      bancaria: CORES_GRAFICO.bancaria,
      fornecedor: CORES_GRAFICO.fornecedor,
      imposto: CORES_GRAFICO.imposto,
      pessoal: CORES_GRAFICO.pessoal,
      outro: CORES_GRAFICO.outro,
    };

    const totalDividasTipo = Object.values(totalDividasPorTipo || {}).reduce(
      (s, v) => s + v,
      0
    );

    let graficoPizzaHtml = "";
    if (totalDividasTipo > 0) {
      const tiposOrdenados = Object.entries(totalDividasPorTipo || {})
        .filter(([tipo, valor]) => valor > 0)
        .sort((a, b) => b[1] - a[1]);

      if (tiposOrdenados.length > 0) {
        graficoPizzaHtml = tiposOrdenados
          .map(([tipo, valor]) => {
            const pct = Math.round((valor / totalDividasTipo) * 100);
            const label = tiposLabels[tipo] || tipo;
            const cor = tiposCores[tipo] || "#9e9e9e";
            return `
              <div style="display:flex; align-items:center; gap:8px; padding:2px 0;">
                <div style="width:12px; height:12px; border-radius:50%; background:${cor}; flex-shrink:0;"></div>
                <span style="font-size:0.65rem; color:var(--gray); flex:1;">${label}</span>
                <span style="font-size:0.65rem; font-weight:600; color:var(--white);">${pct}%</span>
                <div style="width:60px; height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
                  <div style="width:${pct}%; height:100%; background:${cor}; border-radius:2px;"></div>
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        graficoPizzaHtml =
          '<div style="color:var(--gray-dark);font-size:0.7rem;text-align:center;padding:8px 0;">Nenhuma dívida por tipo</div>';
      }
    } else {
      graficoPizzaHtml =
        '<div style="color:var(--gray-dark);font-size:0.7rem;text-align:center;padding:8px 0;">Nenhuma dívida ativa</div>';
    }

    // ========== GRÁFICO 3: Evolução do Saldo ==========
    let graficoLinhaHtml = "";
    if (saldos.length > 0) {
      const maxSaldo = Math.max(
        Math.abs(Math.min(...saldos)),
        Math.max(...saldos),
        1000
      );
      const minSaldo = Math.min(...saldos);
      const range = Math.max(maxSaldo - minSaldo, 1);

      // Pontos do gráfico
      const pontos = saldos
        .map((saldo, i) => {
          const pct = ((saldo - minSaldo) / range) * 80 + 10;
          const isPositive = saldo >= 0;
          return `
            <div style="
              position:absolute;
              bottom:${pct}%;
              left:${(i / (saldos.length - 1)) * 100}%;
              transform:translateX(-50%);
              display:flex;
              flex-direction:column;
              align-items:center;
              gap:2px;
            ">
              <div style="
                width:8px;
                height:8px;
                border-radius:50%;
                background:${isPositive ? CORES_GRAFICO.success : CORES_GRAFICO.error};
                border:2px solid var(--black-soft);
                box-shadow:0 0 8px ${isPositive ? 'rgba(76,175,80,0.3)' : 'rgba(255,82,82,0.3)'};
                cursor:pointer;
                transition:all 0.2s ease;
              " 
              onmouseenter="this.style.transform='scale(1.3)'"
              onmouseleave="this.style.transform='scale(1)'"
              title="${formatCurrency(saldo)}">
              </div>
              <span style="font-size:0.45rem; color:var(--gray-dark);">${formatCurrency(saldo)}</span>
            </div>
          `;
        })
        .join("");

      // Linha do gráfico
      const linePoints = saldos
        .map((saldo, i) => {
          const pct = ((saldo - minSaldo) / range) * 80 + 10;
          return `${(i / (saldos.length - 1)) * 100}% ${pct}%`;
        })
        .join(", ");

      graficoLinhaHtml = `
        <div style="position:relative; width:100%; height:100px; margin:8px 0;">
          <div style="position:absolute; bottom:10%; left:0; right:0; height:1px; background:rgba(255,255,255,0.06);"></div>
          <svg style="width:100%; height:100%; overflow:visible;">
            <polyline
              points="${linePoints}"
              fill="none"
              stroke="${CORES_GRAFICO.linha}"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.6"
            />
            <polyline
              points="${linePoints}"
              fill="none"
              stroke="${CORES_GRAFICO.linha}"
              stroke-width="1"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.3"
              stroke-dasharray="4,4"
            />
          </svg>
          ${pontos}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.5rem; color:var(--gray-dark); padding:0 4px;">
          ${meses.map(m => `<span>${m.substring(0, 3)}</span>`).join('')}
        </div>
      `;
    }

    // ========== MONTAR HTML DOS GRÁFICOS ==========
    const html = `
      <!-- Seletor de Período -->
      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:12px;">
        ${periodOptions.map(opt => `
          <button class="period-grafico-btn ${graficoPeriodo === opt.value ? 'active' : ''}" 
                  data-periodo="${opt.value}"
                  style="
                    padding:4px 12px;
                    border-radius:16px;
                    border:1px solid ${graficoPeriodo === opt.value ? 'var(--gold-light)' : 'rgba(255,255,255,0.08)'};
                    background:${graficoPeriodo === opt.value ? 'rgba(212,160,23,0.15)' : 'transparent'};
                    color:${graficoPeriodo === opt.value ? 'var(--gold-light)' : 'var(--gray)'};
                    font-size:0.6rem;
                    font-weight:500;
                    cursor:pointer;
                    transition:all 0.2s ease;
                    font-family:inherit;
                    min-height:30px;
                  "
                  onmouseenter="this.style.borderColor='var(--gold-light)'; this.style.color='var(--white)';"
                  onmouseleave="this.style.borderColor='${graficoPeriodo === opt.value ? 'var(--gold-light)' : 'rgba(255,255,255,0.08)'}'; this.style.color='${graficoPeriodo === opt.value ? 'var(--gold-light)' : 'var(--gray)'}';"
                  onclick="window.Dashboard.mudarPeriodoGrafico('${opt.value}')">
            ${opt.label}
          </button>
        `).join('')}
      </div>

      <!-- Gráfico 1: Receitas vs Despesas -->
      <div class="big-card" style="padding:14px 16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:11px; font-weight:600; color:var(--gold-light); display:flex; align-items:center; gap:6px;">
            <i class="ph ph-chart-bar"></i> Receitas vs Despesas
          </div>
          <div style="display:flex; gap:10px; font-size:0.55rem;">
            <span style="display:flex; align-items:center; gap:4px;">
              <span style="display:inline-block; width:10px; height:10px; background:${CORES_GRAFICO.receita}; border-radius:3px;"></span>
              Receitas
            </span>
            <span style="display:flex; align-items:center; gap:4px;">
              <span style="display:inline-block; width:10px; height:10px; background:${CORES_GRAFICO.despesa}; border-radius:3px;"></span>
              Despesas
            </span>
          </div>
        </div>
        <div style="display:flex; gap:4px; height:80px; align-items:flex-end; padding:4px 0;">
          ${graficoBarrasHtml || '<div style="color:var(--gray-dark);font-size:0.7rem;text-align:center;width:100%;">Sem dados</div>'}
        </div>
      </div>

      <!-- Gráfico 2: Distribuição de Dívidas -->
      <div class="big-card" style="padding:14px 16px; margin-bottom:12px;">
        <div style="font-size:11px; font-weight:600; color:var(--gold-light); display:flex; align-items:center; gap:6px; margin-bottom:10px;">
          <i class="ph ph-chart-pie"></i> Distribuição de Dívidas por Tipo
        </div>
        ${graficoPizzaHtml}
      </div>

      <!-- Gráfico 3: Evolução do Saldo -->
      <div class="big-card" style="padding:14px 16px; margin-bottom:12px;">
        <div style="font-size:11px; font-weight:600; color:var(--gold-light); display:flex; align-items:center; gap:6px; margin-bottom:6px;">
          <i class="ph ph-chart-line"></i> Evolução do Saldo
        </div>
        ${graficoLinhaHtml || '<div style="color:var(--gray-dark);font-size:0.7rem;text-align:center;padding:20px 0;">Sem dados</div>'}
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================================
  // FUNÇÃO PARA MUDAR PERÍODO DOS GRÁFICOS
  // ============================================================

  window.mudarPeriodoGrafico = function (periodo) {
    graficoPeriodo = periodo;
    renderizarGraficos(dados.dadosGraficos);

    // Atualizar estilo dos botões
    document.querySelectorAll(".period-grafico-btn").forEach((btn) => {
      const isActive = btn.dataset.periodo === periodo;
      btn.style.borderColor = isActive
        ? "var(--gold-light)"
        : "rgba(255,255,255,0.08)";
      btn.style.background = isActive
        ? "rgba(212,160,23,0.15)"
        : "transparent";
      btn.style.color = isActive ? "var(--gold-light)" : "var(--gray)";
    });
  };

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
    graficoPeriodo,

    // Carregamento
    carregarDadosIniciais,
    atualizarDados,

    // Renderização
    renderizarGeral,
    renderizarGraficos,

    // Gráficos
    mudarPeriodoGrafico: window.mudarPeriodoGrafico,

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
