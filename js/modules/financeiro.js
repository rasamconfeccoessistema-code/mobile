// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Financeiro (financeiro.js) - Aba de Finanças
// Versão 3.0 - MODO LEITURA (APENAS VISUALIZAÇÃO)
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Financeiro carregado - Modo Leitura");

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
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let dados = {};
  let carregando = false;
  let visualizacaoAtual = "cards"; // 'cards' ou 'calendario'
  let calendarioState = {
    mes: new Date().getMonth(),
    ano: new Date().getFullYear(),
    diaSelecionado: null,
  };
  let filtrosFinanceiro = {
    tipo: "",
    categoriaId: "",
    status: "",
    dataInicio: "",
    dataFim: "",
    mesReferencia: "",
  };

  // ============================================================
  // ELEMENTOS DO DOM (Cache)
  // ============================================================

  const $ = (id) => document.getElementById(id);

  // ============================================================
  // FUNÇÕES DE CARREGAMENTO DE DADOS
  // ============================================================

  /**
   * Carrega os dados financeiros para o período selecionado
   * @param {Date} periodo - Data de referência para o período
   * @returns {Promise<Object>} Dados financeiros
   */
  async function carregarFinanceiroPeriodo(periodo) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        throw new Error("Cliente Supabase não disponível");
      }

      const mesRange = getMonthRangeForDate(periodo || new Date());
      console.log(
        `💰 Financeiro: Carregando para: ${mesRange.mes}/${mesRange.ano}`
      );

      // Atualizar período no estado global
      if (global.App) {
        global.App.periodState.financeiro = periodo || new Date();
      }

      // Atualizar filtros
      filtrosFinanceiro.dataInicio = mesRange.inicio;
      filtrosFinanceiro.dataFim = mesRange.fim;
      filtrosFinanceiro.mesReferencia = `${mesRange.ano}-${String(
        mesRange.mes
      ).padStart(2, "0")}`;

      // ========== VERIFICAR E GERAR CONTAS RECORRENTES ==========
      await verificarEGerarRecorrentesPorPeriodo(mesRange.inicio, mesRange.fim);

      // ========== BUSCAR TRANSAÇÕES AVULSAS ==========
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

      if (filtrosFinanceiro.tipo) {
        queryAvulsas = queryAvulsas.eq("type", filtrosFinanceiro.tipo);
      }
      if (filtrosFinanceiro.categoriaId) {
        queryAvulsas = queryAvulsas.eq(
          "account_id",
          filtrosFinanceiro.categoriaId
        );
      }
      if (filtrosFinanceiro.status) {
        queryAvulsas = queryAvulsas.eq("status", filtrosFinanceiro.status);
      }

      const { data: avulsas, error: errAvulsas } = await queryAvulsas;
      if (errAvulsas) console.error("❌ Financeiro: Erro avulsas:", errAvulsas);

      // ========== BUSCAR PARCELAS DO PERÍODO ==========
      const { data: parcelasPeriodo, error: errParc } = await supabase
        .from("financial_installments")
        .select(
          "transaction_id, id, numero_parcela, valor, vencimento, status, payment_date, interest_paid, late_fee_paid"
        )
        .gte("vencimento", mesRange.inicio)
        .lte("vencimento", mesRange.fim)
        .order("vencimento", { ascending: true });

      if (errParc) console.error("❌ Financeiro: Erro parcelas:", errParc);

      // ========== BUSCAR TRANSAÇÕES DAS PARCELAS ==========
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

        if (filtrosFinanceiro.tipo) {
          queryParceladas = queryParceladas.eq("type", filtrosFinanceiro.tipo);
        }
        if (filtrosFinanceiro.categoriaId) {
          queryParceladas = queryParceladas.eq(
            "account_id",
            filtrosFinanceiro.categoriaId
          );
        }
        if (filtrosFinanceiro.status) {
          queryParceladas = queryParceladas.eq(
            "status",
            filtrosFinanceiro.status
          );
        }

        const { data: parceladas, error: errParceladas } =
          await queryParceladas;
        if (errParceladas)
          console.error("❌ Financeiro: Erro parceladas:", errParceladas);
        transacoesParceladas = parceladas || [];
      }

      // ========== MONTAR TRANSAÇÕES COM PARCELAS ==========
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

      // ========== GERAR EVENTOS FINANCEIROS ==========
      const eventosFinanceiros = gerarEventosFinanceiros(transacoesComParcelas);

      let totalReceitas = 0,
        totalDespesas = 0;
      let totalPagar = 0,
        totalReceber = 0;
      let contasVencidas = 0;
      let contasVencerProximas = 0;
      const hoje = new Date();
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

        if (e.status === "pendente" && new Date(e.vencimento) < hoje) {
          contasVencidas++;
        }

        if (
          e.status === "pendente" &&
          new Date(e.vencimento) >= hoje &&
          new Date(e.vencimento) <= dataLimiteProxima
        ) {
          contasVencerProximas++;
        }
      }

      dados = {
        eventosFinanceiros: eventosFinanceiros || [],
        totalReceitas: totalReceitas || 0,
        totalDespesas: totalDespesas || 0,
        totalPagar: totalPagar || 0,
        totalReceber: totalReceber || 0,
        contasVencidas: contasVencidas || 0,
        contasVencerProximas: contasVencerProximas || 0,
        mesRange: mesRange,
      };

      // Renderizar financeiro
      renderizarFinanceiro(dados);

      // Atualizar seletor de período
      if (global.UI && typeof global.UI.renderizarPeriodSelector === 'function') {
        const containerId = 'periodSelectorContainer_financeiro';
        const container = document.getElementById(containerId);
        if (container) {
          global.UI.renderizarPeriodSelector(
            containerId,
            periodo || new Date(),
            (novoPeriodo) => {
              carregarFinanceiroPeriodo(novoPeriodo);
            },
            'financeiro'
          );
        }
      }

      console.log(
        `✅ Financeiro: ${eventosFinanceiros.length} eventos carregados`
      );
      return dados;
    } catch (e) {
      console.error("❌ Financeiro: Erro ao carregar dados:", e);
      if (UI.showToast) {
        UI.showToast("Erro", "Falha ao carregar dados financeiros.", "error");
      }
      return dados;
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
  // FUNÇÕES DE CONTAS RECORRENTES
  // ============================================================

  async function verificarEGerarRecorrentesPorPeriodo(dataInicio, dataFim) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) return;

      const { data: recorrentes, error: recError } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("active", true);

      if (recError) {
        console.error(
          "❌ Financeiro: Erro ao buscar contas recorrentes:",
          recError
        );
        return;
      }

      if (!recorrentes || recorrentes.length === 0) {
        return;
      }

      for (const rec of recorrentes) {
        await gerarTransacoesRecorrentes(rec, dataInicio, dataFim);
      }
    } catch (e) {
      console.error("❌ Financeiro: Erro ao verificar recorrentes:", e);
    }
  }

  async function gerarTransacoesRecorrentes(rec, dataInicio, dataFim) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) return;

      const dataInicioDate = new Date(dataInicio + "T12:00:00");
      const dataFimDate = new Date(dataFim + "T12:00:00");
      const dataFimGeracao = new Date(dataFimDate);
      dataFimGeracao.setMonth(dataFimGeracao.getMonth() + 12);

      // Buscar transações existentes
      const { data: transacoesExistentes } = await supabase
        .from("financial_transactions")
        .select("id, due_date, status")
        .eq("recurring_id", rec.id)
        .gte("due_date", dataInicio)
        .lte("due_date", dataFimGeracao.toISOString().split("T")[0]);

      const datasExistentes = new Set();
      if (transacoesExistentes) {
        transacoesExistentes.forEach((t) => datasExistentes.add(t.due_date));
      }

      // Buscar categoria
      let categoriaId = rec.category_id;
      if (!categoriaId) {
        const { data: catPadrao } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("type", rec.type === "pagar" ? "despesa" : "receita")
          .limit(1)
          .maybeSingle();
        if (catPadrao) categoriaId = catPadrao.id;
        else return;
      }

      const transacoesParaInserir = [];
      let dataAtual = new Date(dataInicioDate);

      while (dataAtual <= dataFimGeracao) {
        const ano = dataAtual.getFullYear();
        const mes = dataAtual.getMonth();
        const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
        let dia = rec.due_day;
        if (dia > ultimoDiaMes) dia = ultimoDiaMes;

        const dueDate = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(
          dia
        ).padStart(2, "0")}`;

        if (!datasExistentes.has(dueDate)) {
          transacoesParaInserir.push({
            type: rec.type,
            amount:
              rec.type === "pagar"
                ? -Math.abs(rec.amount)
                : Math.abs(rec.amount),
            date: dueDate,
            due_date: dueDate,
            status: "pendente",
            description: rec.description,
            account_id: categoriaId,
            category_id: categoriaId,
            recurring_id: rec.id,
            notes: `Gerado automaticamente da conta recorrente (dia ${rec.due_day})`,
            installments: false,
            total_installments: 1,
            entry_amount: 0,
          });
        }

        dataAtual.setMonth(dataAtual.getMonth() + 1);
      }

      if (transacoesParaInserir.length > 0) {
        const lote = 50;
        for (let i = 0; i < transacoesParaInserir.length; i += lote) {
          const loteAtual = transacoesParaInserir.slice(i, i + lote);
          await supabase
            .from("financial_transactions")
            .upsert(loteAtual, { onConflict: "recurring_id, due_date" });
        }
      }
    } catch (e) {
      console.error("❌ Financeiro: Erro ao gerar transações recorrentes:", e);
    }
  }

  // ============================================================
  // RENDERIZAR - ABA FINANCEIRO (MODO LEITURA)
  // ============================================================

  function renderizarFinanceiro(dados) {
    console.log("📊 Financeiro: Renderizando (Modo Leitura)...");

    const { eventosFinanceiros, totalPagar, totalReceber, contasVencidas, contasVencerProximas } =
      dados;

    // ========== ATUALIZAR KPIs ==========
    const finTotalPagar = document.getElementById("finTotalPagar");
    const finTotalReceber = document.getElementById("finTotalReceber");
    const finSaldoMes = document.getElementById("finSaldoMes");
    const finContasVencidas = document.getElementById("finContasVencidas");
    const totalLancamentos = document.getElementById("totalLancamentos");

    if (finTotalPagar)
      finTotalPagar.textContent = formatCurrency(totalPagar || 0);
    if (finTotalReceber)
      finTotalReceber.textContent = formatCurrency(totalReceber || 0);

    const saldo = (totalReceber || 0) - (totalPagar || 0);
    if (finSaldoMes) {
      finSaldoMes.textContent = formatCurrency(saldo);
      finSaldoMes.style.color = saldo >= 0 ? "var(--success)" : "var(--error)";
    }
    if (finContasVencidas) finContasVencidas.textContent = contasVencidas || 0;
    if (totalLancamentos) {
      totalLancamentos.textContent =
        (eventosFinanceiros || []).length + " contas";
    }

    // ========== RENDERIZAR LISTA ==========
    const container = document.getElementById("listaFinanceiro");
    if (!container) {
      console.error("❌ Financeiro: Container #listaFinanceiro não encontrado");
      return;
    }

    if (!eventosFinanceiros || eventosFinanceiros.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center;padding:40px 16px;color:var(--gray-dark);">
          <i class="ph ph-currency-circle-dollar" style="font-size:40px;display:block;margin-bottom:12px;color:var(--gray);"></i>
          <p style="font-size:15px;font-weight:500;">Nenhuma conta no mês</p>
          <p style="font-size:12px;color:var(--gray);margin-top:4px;">Não há lançamentos para este período</p>
        </div>
      `;
      return;
    }

    // Ordenar por vencimento
    const ordenados = [...eventosFinanceiros].sort((a, b) => {
      return new Date(a.vencimento) - new Date(b.vencimento);
    });

    container.innerHTML = ordenados
      .map((e) => {
        const isPagar = e.tipo === "pagar";
        const vencido =
          e.status === "pendente" && new Date(e.vencimento) < new Date();
        const pago = e.status === "pago" || e.status === "recebido";
        const hoje = new Date();
        const diasFalta = Math.ceil(
          (new Date(e.vencimento) - hoje) / (1000 * 60 * 60 * 24)
        );

        let statusIcon = "";
        let statusColor = "";
        let statusBg = "";
        let statusLabel = "";

        if (pago) {
          statusIcon = "ph-check-circle";
          statusColor = "var(--success)";
          statusBg = "rgba(76,175,80,0.12)";
          statusLabel = "Pago ✅";
        } else if (vencido) {
          statusIcon = "ph-warning-circle";
          statusColor = "var(--error)";
          statusBg = "rgba(255,82,82,0.12)";
          statusLabel = `Vencido há ${Math.abs(diasFalta)} dias`;
        } else if (diasFalta <= 3) {
          statusIcon = "ph-clock";
          statusColor = "var(--warning)";
          statusBg = "rgba(255,193,7,0.12)";
          statusLabel = `Vence em ${diasFalta} dias`;
        } else {
          statusIcon = "ph-hourglass";
          statusColor = "var(--gray)";
          statusBg = "rgba(255,255,255,0.03)";
          statusLabel = `Vence em ${diasFalta} dias`;
        }

        const valor = e.valor || 0;
        const sinal = isPagar ? "-" : "+";
        const corValor = isPagar ? "var(--error)" : "var(--success)";
        const tipoLabel = isPagar ? "💰 A Pagar" : "📈 A Receber";
        const parcelaInfo = e.isParcela
          ? `Parcela ${e.numero_parcela}/${e.total_parcelas}`
          : "Avulsa";

        let catIcon = "ph-file";
        const catLower = (e.categoria || "").toLowerCase();
        if (catLower.includes("venda") || catLower.includes("faturamento"))
          catIcon = "ph-shopping-cart";
        else if (catLower.includes("salário") || catLower.includes("folha"))
          catIcon = "ph-users";
        else if (catLower.includes("aluguel")) catIcon = "ph-building";
        else if (catLower.includes("material") || catLower.includes("insumo"))
          catIcon = "ph-package";
        else if (catLower.includes("imposto") || catLower.includes("taxa"))
          catIcon = "ph-receipt";
        else if (
          catLower.includes("energia") ||
          catLower.includes("agua") ||
          catLower.includes("luz")
        )
          catIcon = "ph-lightning";
        else if (catLower.includes("internet") || catLower.includes("telefone"))
          catIcon = "ph-wifi";

        return `
          <div class="card-financeiro" 
               style="
                 background: var(--black-soft);
                 border: 1px solid ${
                   pago
                     ? "rgba(76,175,80,0.2)"
                     : vencido
                     ? "rgba(255,82,82,0.2)"
                     : "rgba(255,255,255,0.06)"
                 };
                 border-radius: 16px;
                 padding: 14px 16px;
                 margin-bottom: 10px;
                 transition: all 0.2s ease;
                 cursor: pointer;
                 box-shadow: 0 2px 8px rgba(0,0,0,0.1);
               "
               onclick="window.Financeiro.abrirModalConta('${e.id}')"
               onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)';"
               onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';"
               >
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="
                  background: ${statusBg};
                  color: ${statusColor};
                  padding: 2px 10px;
                  border-radius: 20px;
                  font-size: 0.6rem;
                  font-weight: 600;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <i class="ph ${statusIcon}"></i>
                  ${statusLabel}
                </span>
                <span style="
                  font-size: 0.55rem;
                  color: var(--gray-dark);
                  background: rgba(255,255,255,0.04);
                  padding: 2px 8px;
                  border-radius: 12px;
                ">
                  ${parcelaInfo}
                </span>
              </div>
              <div style="
                font-size: 1.2rem;
                font-weight: 700;
                color: ${corValor};
              ">
                ${sinal} ${formatCurrency(valor)}
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                <span style="
                  width: 32px;
                  height: 32px;
                  background: rgba(212,160,23,0.1);
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: var(--gold-light);
                  font-size: 0.9rem;
                  flex-shrink: 0;
                ">
                  <i class="ph ${catIcon}"></i>
                </span>
                <div style="flex: 1; min-width: 0;">
                  <div style="
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--white);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  ">
                    ${escapeHtml(e.descricao)}
                  </div>
                  <div style="
                    font-size: 0.65rem;
                    color: var(--gray);
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                  ">
                    <span><i class="ph ph-tag"></i> ${escapeHtml(
                      e.categoria || "Sem categoria"
                    )}</span>
                    <span>•</span>
                    <span><i class="ph ph-calendar"></i> ${formatDate(
                      e.vencimento
                    )}</span>
                    <span>•</span>
                    <span style="color: var(--gray-dark);">${tipoLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style="
              display: flex;
              justify-content: flex-end;
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px solid rgba(255,255,255,0.04);
            ">
              <button class="btn-action btn-action-ghost" 
                      style="padding:6px 14px; font-size:0.65rem; border-radius:8px; min-height:36px;"
                      onclick="event.stopPropagation(); window.Financeiro.abrirModalConta('${e.id}')">
                <i class="ph ph-eye"></i> Visualizar
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    console.log(`✅ Financeiro: ${ordenados.length} contas renderizadas (Modo Leitura)`);
  }

  // ============================================================
  // FUNÇÃO PARA ALTERNAR VISUALIZAÇÃO
  // ============================================================

  function alternarVisualizacaoFinanceiro() {
    visualizacaoAtual =
      visualizacaoAtual === "cards" ? "calendario" : "cards";
    console.log(`📊 Alternando visualização para: ${visualizacaoAtual}`);
    renderizarFinanceiro(dados);

    const btnToggle = document.getElementById(
      "btnToggleVisualizacaoFinanceiro"
    );
    if (btnToggle) {
      if (visualizacaoAtual === "cards") {
        btnToggle.innerHTML = '<i class="ph ph-calendar"></i> Calendário';
        btnToggle.title = "Alternar para visão em calendário";
      } else {
        btnToggle.innerHTML = '<i class="ph ph-list"></i> Lista';
        btnToggle.title = "Alternar para visão em lista";
      }
    }
  }

  // ============================================================
  // FUNÇÃO PARA ABRIR MODAL DA CONTA (MODO LEITURA)
  // ============================================================

  window.abrirModalConta = async function (id) {
    try {
      const evento = dados.eventosFinanceiros?.find((e) => e.id === id);
      if (!evento) {
        UI.showToast("Erro", "Conta não encontrada.", "error");
        return;
      }

      const transactionId = evento.transaction_id || id;
      const isParcelada =
        evento.isParcela ||
        (evento.transacao_original &&
          evento.transacao_original.installments === true);

      let todasParcelas = [];
      let parcelasHtml = "";

      if (isParcelada) {
        const supabase = Supabase.getSupabaseClient
          ? Supabase.getSupabaseClient()
          : null;
        if (supabase) {
          const { data: parcelas } = await supabase
            .from("financial_installments")
            .select("*")
            .eq("transaction_id", transactionId)
            .order("numero_parcela", { ascending: true });
          todasParcelas = parcelas || [];
        }

        if (todasParcelas && todasParcelas.length > 0) {
          const hoje = new Date();
          const totalParcelas = todasParcelas.length;
          const pagas = todasParcelas.filter((p) => p.status === "pago").length;
          const totalValor = todasParcelas.reduce(
            (sum, p) => sum + parseFloat(p.valor),
            0
          );
          const totalPago = todasParcelas
            .filter((p) => p.status === "pago")
            .reduce((sum, p) => sum + parseFloat(p.valor), 0);
          const percentual = totalParcelas > 0 ? (pagas / totalParcelas) * 100 : 0;

          let parcelasListHtml = todasParcelas
            .map((p) => {
              const isPaga = p.status === "pago";
              const isVencida = !isPaga && new Date(p.vencimento) < hoje;
              const isMesAtual =
                !isPaga &&
                !isVencida &&
                new Date(p.vencimento).getMonth() === hoje.getMonth() &&
                new Date(p.vencimento).getFullYear() === hoje.getFullYear();

              let statusClass = "futuro";
              let statusText = "📅 Futura";
              if (isPaga) {
                statusClass = "pago";
                statusText = "✅ Paga";
              } else if (isVencida) {
                statusClass = "vencido";
                statusText = "🔴 Vencida";
              } else if (isMesAtual) {
                statusClass = "pendente";
                statusText = "⏳ Mês atual";
              } else {
                statusText = "⏳ Pendente";
              }

              return `
                <div class="modal-parcela-card status-${statusClass}">
                  <div class="parcela-left">
                    <span class="parcela-numero">${p.numero_parcela}ª</span>
                    <div class="parcela-info">
                      <span class="parcela-valor">${formatCurrency(
                        p.valor
                      )}</span>
                      <span class="parcela-data">Vence: ${formatDate(
                        p.vencimento
                      )}</span>
                    </div>
                  </div>
                  <span class="parcela-status ${statusClass}">${statusText}</span>
                </div>
              `;
            })
            .join("");

          parcelasHtml = `
            <div class="modal-parcelas-resumo">
              <span class="resumo-item">
                Total: <strong class="valor">${formatCurrency(
                  totalValor
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
              ${parcelasListHtml}
            </div>
          `;
        }
      }

      const isPagar = evento.tipo === "pagar";
      const vencido =
        evento.status === "pendente" && new Date(evento.vencimento) < new Date();
      const pago = evento.status === "pago" || evento.status === "recebido";

      let statusConfig = {};
      if (pago) {
        statusConfig = {
          status: "success",
          statusIcon: "ph-check-circle",
          statusTitle: "✅ Conta Paga",
          statusSub: `Paga em ${formatDate(evento.payment_date) || "data não informada"}`,
        };
      } else if (vencido) {
        statusConfig = {
          status: "danger",
          statusIcon: "ph-warning-circle",
          statusTitle: "🔴 Conta Vencida",
          statusSub: `Venceu em ${formatDate(evento.vencimento)}`,
        };
      } else {
        statusConfig = {
          status: "warning",
          statusIcon: "ph-clock",
          statusTitle: "⏳ Conta Pendente",
          statusSub: `Vence em ${formatDate(evento.vencimento)}`,
        };
      }

      const infoItems = [
        {
          label: "Descrição",
          value: escapeHtml(evento.descricao),
          class: "highlight",
        },
        { label: "Categoria", value: escapeHtml(evento.categoria || "Sem categoria") },
        {
          label: "Valor",
          value: formatCurrency(evento.valor),
          class: isPagar ? "danger" : "success",
        },
        {
          label: "Tipo",
          value: isPagar ? "💰 A Pagar" : "📈 A Receber",
          class: isPagar ? "danger" : "success",
        },
        { label: "Vencimento", value: formatDate(evento.vencimento) },
        ...(evento.payment_method
          ? [{ label: "Forma de Pagamento", value: evento.payment_method }]
          : []),
        ...(evento.isParcela
          ? [
              {
                label: "Parcela",
                value: `${evento.numero_parcela}/${evento.total_parcelas}`,
              },
              ...(evento.interest_paid
                ? [
                    {
                      label: "Juros pagos",
                      value: formatCurrency(evento.interest_paid),
                    },
                  ]
                : []),
              ...(evento.late_fee_paid
                ? [
                    {
                      label: "Multa paga",
                      value: formatCurrency(evento.late_fee_paid),
                    },
                  ]
                : []),
            ]
          : []),
      ];

      const secoes = [];
      if (isParcelada && todasParcelas && todasParcelas.length > 0) {
        secoes.push({
          titulo: "Parcelas",
          icon: "ph-receipt",
          badge: `${todasParcelas.filter(p => p.status === "pago").length}/${todasParcelas.length}`,
          html: parcelasHtml,
        });
      }

      // Apenas visualização - sem botões de ação
      const acoes = [
        {
          label: "Fechar",
          icon: "ph-x-circle",
          class: "ghost",
          onclick: "document.getElementById('modalContainer').innerHTML = ''",
        }
      ];

      UI.criarModalPadronizado(
        `💰 ${escapeHtml(evento.descricao)}`,
        {
          ...statusConfig,
          infoItems,
          secoes,
          acoes,
        }
      );

    } catch (e) {
      console.error("Erro ao abrir modal da conta:", e);
      UI.showToast("Erro", "Falha ao carregar detalhes da conta.", "error");
    }
  };

  // ============================================================
  // EXPORTAR PARA PDF
  // ============================================================

  function exportarPDFFinanceiro() {
    console.log("📄 Financeiro: Exportando PDF...");

    try {
      const eventos = dados.eventosFinanceiros || [];
      if (eventos.length === 0) {
        UI.showToast("Aviso", "Não há dados para exportar.", "warning");
        return;
      }

      let totalReceber = 0,
        totalPagar = 0,
        totalGeral = 0;
      for (const e of eventos) {
        if (e.tipo === "receber") {
          totalReceber += e.valor;
          totalGeral += e.valor;
        } else {
          totalPagar += e.valor;
          totalGeral -= e.valor;
        }
      }

      const mesNome = new Date().toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });

      const tableRows = eventos
        .map((e) => {
          const isPagar = e.tipo === "pagar";
          const valor = e.valor || 0;
          const sinal = isPagar ? "-" : "+";
          const status =
            e.status === "pago"
              ? "Pago"
              : e.status === "pendente"
              ? "Pendente"
              : e.status;

          return `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 10px;">${formatDate(
              e.vencimento
            )}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 10px;">${escapeHtml(
              e.descricao
            )}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 10px;">${escapeHtml(
              e.categoria || "-"
            )}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 10px; color: ${
              isPagar ? "#e91e63" : "#4caf50"
            };">${sinal} ${formatCurrency(valor)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 10px; color: ${
              status === "Pago"
                ? "#4caf50"
                : status === "Vencido"
                ? "#ff5252"
                : "#ffc107"
            };">${status}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 10px;">${
              e.isParcela
                ? `Parcela ${e.numero_parcela}/${e.total_parcelas}`
                : "Avulsa"
            }</td>
          </tr>
        `;
        })
        .join("");

      const htmlContent = `
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Relatório Financeiro - ${mesNome}</title>
            <style>
              body {
                font-family: Arial, Helvetica, sans-serif;
                margin: 20px;
                color: #333;
                background: #fff;
              }
              .header {
                text-align: center;
                padding: 20px 0;
                border-bottom: 3px solid #e91e63;
                margin-bottom: 20px;
              }
              .header h1 {
                color: #e91e63;
                margin: 0;
                font-size: 24px;
                font-weight: bold;
              }
              .header h2 {
                color: #d4a017;
                margin: 5px 0 0 0;
                font-size: 16px;
                font-weight: normal;
              }
              .header .periodo {
                color: #666;
                font-size: 14px;
                margin-top: 5px;
              }
              .summary {
                display: flex;
                justify-content: space-between;
                background: #f5f5f5;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                border-left: 4px solid #e91e63;
              }
              .summary .item {
                text-align: center;
              }
              .summary .item .label {
                font-size: 11px;
                color: #666;
                font-weight: bold;
                text-transform: uppercase;
              }
              .summary .item .value {
                font-size: 18px;
                font-weight: bold;
                margin-top: 4px;
              }
              .summary .item .value.receber { color: #4caf50; }
              .summary .item .value.pagar { color: #e91e63; }
              .summary .item .value.saldo { color: ${
                totalGeral >= 0 ? "#4caf50" : "#e91e63"
              }; }
              .table-container {
                overflow-x: auto;
                margin-top: 20px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
              }
              table th {
                background: #e91e63;
                color: #fff;
                padding: 10px 8px;
                text-align: center;
                font-weight: bold;
                border: 1px solid #c2185b;
              }
              table td {
                border: 1px solid #ddd;
                padding: 8px;
              }
              table tr:nth-child(even) {
                background: #f9f9f9;
              }
              .footer {
                text-align: center;
                padding: 20px 0;
                border-top: 1px solid #ddd;
                margin-top: 20px;
                color: #999;
                font-size: 11px;
              }
              .footer .pink {
                color: #e91e63;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🏭 Facção Jeans</h1>
              <h2>Relatório Financeiro</h2>
              <div class="periodo">${capitalizeFirst(mesNome)}</div>
            </div>

            <div class="summary">
              <div class="item">
                <div class="label">💰 Total a Receber</div>
                <div class="value receber">${formatCurrency(totalReceber)}</div>
              </div>
              <div class="item">
                <div class="label">💳 Total a Pagar</div>
                <div class="value pagar">${formatCurrency(totalPagar)}</div>
              </div>
              <div class="item">
                <div class="label">📊 Saldo do Mês</div>
                <div class="value saldo">${formatCurrency(totalGeral)}</div>
              </div>
              <div class="item">
                <div class="label">📋 Total de Contas</div>
                <div class="value" style="color: #d4a017;">${eventos.length}</div>
              </div>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Parcela</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>

            <div class="footer">
              <p>Gerado em ${formatDateTime(new Date().toISOString())}</p>
              <p style="color: #999; font-size: 10px;">
                <span class="pink">❤️</span> Dados em tempo real do sistema Facção Jeans 
                <span class="pink">❤️</span>
              </p>
            </div>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Relatorio_Financeiro_${mesNome.replace(/\s/g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      UI.showToast("Sucesso", "PDF exportado com sucesso!", "success");
    } catch (e) {
      console.error("Erro ao exportar PDF:", e);
      UI.showToast("Erro", "Falha ao exportar PDF.", "error");
    }
  }

  // ============================================================
  // RENDERIZAR CALENDÁRIO
  // ============================================================

  function renderizarCalendarioFinanceiro(eventos) {
    const container = document.getElementById("listaFinanceiro");

    if (!window.calendarioState) {
      const hoje = new Date();
      window.calendarioState = {
        mes: hoje.getMonth(),
        ano: hoje.getFullYear(),
        diaSelecionado: hoje.getDate(),
      };
    }

    const { mes, ano, diaSelecionado } = window.calendarioState;

    const nomeMes = new Date(ano, mes, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const primeiroDiaSemana = primeiroDia.getDay();

    const eventosPorDia = {};
    for (const e of eventos) {
      if (!e.vencimento) continue;
      const data = new Date(e.vencimento);
      const dia = data.getDate();
      const mesEvento = data.getMonth();
      const anoEvento = data.getFullYear();
      if (mesEvento === mes && anoEvento === ano) {
        if (!eventosPorDia[dia]) eventosPorDia[dia] = [];
        eventosPorDia[dia].push(e);
      }
    }

    let calendarioHtml = `
      <div style="background: rgba(255,255,255,0.02); border-radius: 16px; padding: 16px; border: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn btn-ghost btn-sm" id="btnMesAnteriorFinanceiro" style="padding: 4px 8px;">
              <i class="ph ph-caret-left"></i>
            </button>
            <h4 style="margin: 0; color: var(--gold-light); font-size: 1rem;">
              ${capitalizeFirst(nomeMes)}
            </h4>
            <button class="btn btn-ghost btn-sm" id="btnMesProximoFinanceiro" style="padding: 4px 8px;">
              <i class="ph ph-caret-right"></i>
            </button>
          </div>
          <button class="btn btn-ghost btn-sm" id="btnHojeFinanceiro" style="font-size: 0.65rem;">
            <i class="ph ph-calendar-check"></i> Hoje
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 12px;">
          ${diasSemana
            .map(
              (d) => `
            <div style="text-align: center; font-size: 0.6rem; color: var(--gray-dark); font-weight: 600; padding: 4px 0;">
              ${d}
            </div>
          `
            )
            .join("")}
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;">
    `;

    for (let i = 0; i < primeiroDiaSemana; i++) {
      calendarioHtml += `<div style="opacity: 0.2; padding: 8px; text-align: center; font-size: 0.7rem;">&nbsp;</div>`;
    }

    const hoje = new Date();
    const hojeNum = hoje.getDate();
    const hojeMes = hoje.getMonth();
    const hojeAno = hoje.getFullYear();

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const eventosDia = eventosPorDia[dia] || [];
      const temEventos = eventosDia.length > 0;
      const isHoje = dia === hojeNum && mes === hojeMes && ano === hojeAno;
      const isSelecionado =
        dia === diaSelecionado &&
        mes === window.calendarioState.mes &&
        ano === window.calendarioState.ano;

      let corFundo = "transparent";
      let corBorda = "transparent";
      let indicador = "";
      let tooltip = "";

      if (temEventos) {
        const temPago = eventosDia.some(
          (e) => e.status === "pago" || e.status === "recebido"
        );
        const temVencido = eventosDia.some(
          (e) => e.status === "pendente" && new Date(e.vencimento) < new Date()
        );
        const temPendente = eventosDia.some(
          (e) => e.status === "pendente" || e.status === "atrasado"
        );

        if (temVencido) {
          corFundo = "rgba(255,82,82,0.12)";
          corBorda = "2px solid var(--error)";
          indicador = "🔴";
          tooltip = `${eventosDia.length} conta(s) - Vencidas!`;
        } else if (temPago && !temPendente) {
          corFundo = "rgba(76,175,80,0.08)";
          corBorda = "2px solid var(--success)";
          indicador = "✅";
          tooltip = `${eventosDia.length} conta(s) pagas`;
        } else if (temPendente) {
          corFundo = "rgba(255,193,7,0.08)";
          corBorda = "2px solid var(--warning)";
          indicador = "⏳";
          tooltip = `${eventosDia.length} conta(s) pendentes`;
        }
      }

      const isDiaComEvento = temEventos ? "cursor: pointer;" : "";

      calendarioHtml += `
        <div 
          class="dia-calendario-financeiro"
          data-dia="${dia}"
          data-mes="${mes}"
          data-ano="${ano}"
          onclick="${temEventos ? `selecionarDiaCalendarioFinanceiro(${dia}, ${mes}, ${ano})` : ""}"
          style="
            background: ${corFundo};
            border: ${isSelecionado ? "2px solid var(--gold-light)" : isHoje ? "1px solid rgba(212,160,23,0.3)" : corBorda};
            border-radius: 8px;
            padding: 6px 4px;
            text-align: center;
            ${isDiaComEvento}
            transition: all 0.2s ease;
            min-height: 48px;
            position: relative;
            ${isHoje ? "box-shadow: 0 0 12px rgba(212,160,23,0.1);" : ""}
          "
          ${temEventos ? `title="${tooltip}"` : ""}
        >
          <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
            <span style="
              font-size: 0.8rem; 
              font-weight: ${isHoje ? "700" : "400"};
              color: ${isHoje ? "var(--gold-light)" : "var(--white)"};
            ">
              ${dia}
            </span>
            ${
              temEventos
                ? `
              <span style="font-size: 0.55rem; color: var(--gray);">
                ${indicador} ${eventosDia.length}
              </span>
            `
                : ""
            }
            ${isHoje ? '<span style="font-size: 0.45rem; color: var(--gold-light);">●</span>' : ""}
          </div>
        </div>
      `;
    }

    calendarioHtml += `
        </div>

        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.6rem; color: var(--gray);">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--error);margin-right:4px;"></span> Vencidas</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--warning);margin-right:4px;"></span> Pendentes</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--success);margin-right:4px;"></span> Pagas</span>
        </div>
      </div>
    `;

    const eventosDiaSelecionado = eventos.filter((e) => {
      if (!e.vencimento) return false;
      const data = new Date(e.vencimento);
      return (
        data.getDate() === diaSelecionado &&
        data.getMonth() === mes &&
        data.getFullYear() === ano
      );
    });

    let detalhesHtml = `
      <div style="margin-top: 16px; background: rgba(255,255,255,0.02); border-radius: 12px; padding: 14px; border: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h5 style="margin: 0; color: var(--gold-light); font-size: 0.9rem;">
            <i class="ph ph-calendar-check"></i> ${String(diaSelecionado).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${ano}
          </h5>
          <span style="font-size: 0.7rem; color: var(--gray);">${eventosDiaSelecionado.length} conta(s)</span>
        </div>
    `;

    if (eventosDiaSelecionado.length === 0) {
      detalhesHtml += `
        <div style="text-align: center; padding: 20px 0; color: var(--gray-dark);">
          <i class="ph ph-calendar-blank" style="font-size: 1.5rem; display: block; margin-bottom: 8px;"></i>
          Nenhuma conta neste dia
        </div>
      `;
    } else {
      detalhesHtml += eventosDiaSelecionado
        .sort((a, b) => {
          const vA = a.status === "pago" ? 1 : a.status === "pendente" ? 0 : 2;
          const vB = b.status === "pago" ? 1 : b.status === "pendente" ? 0 : 2;
          return vA - vB;
        })
        .map((e) => {
          const isPagar = e.tipo === "pagar";
          const vencido =
            e.status === "pendente" && new Date(e.vencimento) < new Date();
          const pago = e.status === "pago" || e.status === "recebido";
          const valor = e.valor || 0;
          const sinal = isPagar ? "-" : "+";
          const corValor = isPagar ? "var(--error)" : "var(--success)";

          let statusBadge = "";
          let statusColor = "";
          if (pago) {
            statusBadge = "✅ Pago";
            statusColor = "var(--success)";
          } else if (vencido) {
            statusBadge = "🔴 Vencido";
            statusColor = "var(--error)";
          } else {
            statusBadge = "⏳ Pendente";
            statusColor = "var(--warning)";
          }

          return `
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 12px;
              margin-bottom: 6px;
              background: rgba(255,255,255,0.02);
              border-radius: 8px;
              border-left: 3px solid ${statusColor};
              cursor: pointer;
              transition: all 0.2s ease;
            "
            onclick="window.Financeiro.abrirModalConta('${e.id}')"
            onmouseenter="this.style.background='rgba(255,255,255,0.05)'"
            onmouseleave="this.style.background='rgba(255,255,255,0.02)'"
            >
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${e.descricao}
                </div>
                <div style="font-size: 0.65rem; color: var(--gray);">
                  ${e.categoria || "Sem categoria"} ${e.isParcela ? `• Parcela ${e.numero_parcela}/${e.total_parcelas}` : ""}
                </div>
              </div>
              <div style="text-align: right; flex-shrink: 0; margin-left: 12px;">
                <div style="font-weight: 700; color: ${corValor};">
                  ${sinal} ${formatCurrency(valor)}
                </div>
                <div style="font-size: 0.6rem; color: ${statusColor};">
                  ${statusBadge}
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    detalhesHtml += `</div>`;
    calendarioHtml += detalhesHtml;

    container.innerHTML = calendarioHtml;

    document
      .getElementById("btnMesAnteriorFinanceiro")
      ?.addEventListener("click", () => {
        window.calendarioState.mes--;
        if (window.calendarioState.mes < 0) {
          window.calendarioState.mes = 11;
          window.calendarioState.ano--;
        }
        renderizarFinanceiro(dados);
      });

    document
      .getElementById("btnMesProximoFinanceiro")
      ?.addEventListener("click", () => {
        window.calendarioState.mes++;
        if (window.calendarioState.mes > 11) {
          window.calendarioState.mes = 0;
          window.calendarioState.ano++;
        }
        renderizarFinanceiro(dados);
      });

    document
      .getElementById("btnHojeFinanceiro")
      ?.addEventListener("click", () => {
        const hoje = new Date();
        window.calendarioState.mes = hoje.getMonth();
        window.calendarioState.ano = hoje.getFullYear();
        window.calendarioState.diaSelecionado = hoje.getDate();
        renderizarFinanceiro(dados);
      });
  }

  window.selecionarDiaCalendarioFinanceiro = function (dia, mes, ano) {
    if (!window.calendarioState) {
      window.calendarioState = {
        mes: new Date().getMonth(),
        ano: new Date().getFullYear(),
        diaSelecionado: new Date().getDate(),
      };
    }
    window.calendarioState.diaSelecionado = dia;
    window.calendarioState.mes = mes;
    window.calendarioState.ano = ano;
    renderizarFinanceiro(dados);
  };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("🏦 Financeiro: Inicializando (Modo Leitura)...");

    // Configurar eventos
    const btnExportPDF = document.getElementById("btnExportPDFFinanceiro");
    if (btnExportPDF) {
      btnExportPDF.addEventListener("click", exportarPDFFinanceiro);
    }

    // Carregar dados iniciais
    const periodo = global.App?.periodState?.financeiro || new Date();
    await carregarFinanceiroPeriodo(periodo);

    console.log("✅ Financeiro: Inicializado com sucesso (Modo Leitura)");
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.Financeiro = {
    // Dados
    dados,
    carregando,
    visualizacaoAtual,
    calendarioState,
    filtrosFinanceiro,

    // Carregamento
    carregarFinanceiroPeriodo,

    // Renderização
    renderizarFinanceiro,

    // Ações
    abrirModalConta: window.abrirModalConta,
    alternarVisualizacao: alternarVisualizacaoFinanceiro,

    // Exportação
    exportarPDFFinanceiro,

    // Calendário
    selecionarDiaCalendario: window.selecionarDiaCalendarioFinanceiro,

    // Utilitários
    gerarEventosFinanceiros,

    // Inicialização
    init,
  };

  console.log("✅ Financeiro exportado globalmente como window.Financeiro (Modo Leitura)");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
