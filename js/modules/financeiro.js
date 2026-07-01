// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Financeiro (financeiro.js) - Aba de Finanças
// Versão 2.1 - Com menu único de ações e seletor de período dinâmico
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Financeiro carregado");

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

      dados = {
        eventosFinanceiros: eventosFinanceiros || [],
        totalReceitas: totalReceitas || 0,
        totalDespesas: totalDespesas || 0,
        totalPagar: totalPagar || 0,
        totalReceber: totalReceber || 0,
        contasVencidas: contasVencidas || 0,
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
  // RENDERIZAR - ABA FINANCEIRO
  // ============================================================

  function renderizarFinanceiro(dados) {
    console.log("📊 Financeiro: Renderizando...");

    const { eventosFinanceiros, totalPagar, totalReceber, contasVencidas } =
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
          <p style="font-size:12px;color:var(--gray);margin-top:4px;">Clique em "Novo Lançamento" para começar</p>
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

        const transactionId = e.transaction_id;

        // ========== CONSTRUIR MENU DE AÇÕES ==========
        const acoes = [];

        // Ação Visualizar (sempre disponível)
        acoes.push({
          label: 'Visualizar',
          icon: 'ph-eye',
          color: 'var(--info)',
          onclick: `window.Financeiro.abrirModalConta('${e.id}')`
        });

        // Ação Editar (sempre disponível)
        acoes.push({
          label: 'Editar',
          icon: 'ph-pencil-simple',
          color: 'var(--gold-light)',
          onclick: `window.Financeiro.editarLancamento('${transactionId}')`
        });

        // Ações específicas por status
        if (!pago) {
          if (e.isParcela) {
            acoes.push({
              label: 'Baixar Parcelas',
              icon: 'ph-receipt',
              color: '#42a5f5',
              onclick: `window.Financeiro.baixarParcelas('${transactionId}')`
            });
          } else {
            acoes.push({
              label: 'Baixar',
              icon: 'ph-check-circle',
              color: '#4caf50',
              onclick: `window.Financeiro.baixarLancamento('${transactionId}')`
            });
          }
        }

        if (pago) {
          acoes.push({
            label: 'Estornar',
            icon: 'ph-arrow-counter-clockwise',
            color: 'var(--warning)',
            onclick: `window.Financeiro.estornarLancamento('${transactionId}')`
          });
        }

        // Ação Excluir (sempre disponível)
        acoes.push({
          label: 'Excluir',
          icon: 'ph-trash',
          color: 'var(--error)',
          onclick: `window.Financeiro.excluirLancamento('${transactionId}')`
        });

        // Converter ações para string
        const acoesStr = acoes.map(a => 
          `{ label: '${a.label}', icon: '${a.icon}', color: '${a.color}', onclick: '${a.onclick}' }`
        ).join(',');

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
              <button class="btn-action-menu" 
                      style="min-height: 36px; min-width: 36px; padding: 6px 12px;"
                      onclick="event.stopPropagation(); window.UI.abrirMenuAcoesMobile('${e.id}', [${acoesStr}], 'Ações da Conta');">
                <i class="ph ph-gear-six"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    console.log(`✅ Financeiro: ${ordenados.length} contas renderizadas`);
  }

  // ============================================================
  // FUNÇÕES DE CRUD DE LANÇAMENTOS
  // ============================================================

  /**
   * Abre o modal para criar um novo lançamento
   */
  function novoLancamento() {
    console.log("📝 Financeiro: Criando novo lançamento...");

    const html = `
      <div style="max-height:85vh; overflow-y:auto; padding-right:4px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div class="form-group" style="margin-bottom:6px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-arrows-left-right"></i> Tipo *</label>
            <select id="finTipo" class="form-select" style="padding:6px 10px; font-size:0.8rem;" required>
              <option value="pagar">A Pagar</option>
              <option value="receber">A Receber</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:6px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-tag"></i> Categoria *</label>
            <select id="finCategoria" class="form-select" style="padding:6px 10px; font-size:0.8rem;" required>
              <option value="">Carregando categorias...</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px;">
          <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-text-aa"></i> Descrição *</label>
          <input id="finDesc" class="form-input" style="padding:6px 10px; font-size:0.8rem;" placeholder="Ex: Venda OS-123, Aluguel..." required>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div class="form-group" style="margin-bottom:6px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-currency-circle-dollar"></i> Valor Total *</label>
            <input id="finValorTotal" type="number" step="0.01" min="0.01" class="form-input" style="padding:6px 10px; font-size:0.8rem;" required>
          </div>
          <div class="form-group" style="margin-bottom:6px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-credit-card"></i> Forma de Pagamento</label>
            <select id="finFormaPag" class="form-select" style="padding:6px 10px; font-size:0.8rem;">
              <option value="">Selecione</option>
              <option value="PIX">PIX</option>
              <option value="Boleto">Boleto</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Transferência">Transferência</option>
              <option value="Cartão">Cartão</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px;">
          <label style="font-size:0.8rem;"><input type="checkbox" id="finParcelado" onchange="toggleParcelamento()"> <i class="ph ph-receipt"></i> Parcelado com entrada</label>
        </div>
        <div id="parcelaFields" style="display:none; margin-top:6px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-currency-dollar"></i> Entrada (R$)</label>
              <input id="finEntrada" type="number" step="0.01" min="0" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
            </div>
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-calendar"></i> Data Entrada</label>
              <input id="finDataEntrada" type="date" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="${todayISO()}">
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin:4px 0 6px;">
            <span style="font-size:0.8rem; font-weight:600;"><i class="ph ph-list-numbers"></i> Parcelas</span>
            <div>
              <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 10px; font-size:0.7rem;" id="btnAdicionarParcela"><i class="ph ph-plus-circle"></i> Adicionar</button>
              <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 10px; font-size:0.7rem;" id="btnRemoverParcela"><i class="ph ph-minus-circle"></i> Remover</button>
            </div>
          </div>
          <div style="overflow-x:auto; max-height:180px; overflow-y:auto; border:1px solid rgba(255,255,255,0.06); border-radius:6px;">
            <table class="table" style="font-size:0.75rem; margin:0;">
              <thead><tr><th style="padding:4px 6px;">#</th><th style="padding:4px 6px;">Valor</th><th style="padding:4px 6px;">Vencimento</th><th style="padding:4px 6px; width:40px;">Ação</th></tr></thead>
              <tbody id="parcelasBody">
                <tr class="parcela-row">
                  <td class="text-center" style="padding:4px 6px;">1</td>
                  <td style="padding:4px 6px;"><input type="number" step="0.01" class="form-input parcela-valor" style="width:90px; padding:3px 6px; font-size:0.75rem;" value="0"></td>
                  <td style="padding:4px 6px;"><input type="date" class="form-input parcela-data" style="width:130px; padding:3px 6px; font-size:0.75rem;" value="${todayISO()}"></td>
                  <td style="padding:4px 6px; text-align:center;"><button type="button" class="btn btn-ghost btn-sm remove-parcela" style="padding:0 4px; font-size:0.7rem; color:var(--error);"><i class="ph ph-x"></i></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="display:flex; gap:16px; margin-top:6px; flex-wrap:wrap; font-size:0.75rem;">
            <span><strong>Total Parcelas:</strong> <span id="somaParcelas">R$ 0,00</span></span>
            <span><strong>Total com Entrada:</strong> <span id="totalComEntrada">R$ 0,00</span></span>
          </div>
        </div>
        <div id="vencimentoSimples" class="form-group" style="margin-bottom:6px;">
          <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-calendar-blank"></i> Vencimento *</label>
          <input id="finVencimento" type="date" class="form-input" style="padding:6px 10px; font-size:0.8rem;" required>
        </div>
        <div class="form-group" style="margin-bottom:6px;">
          <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-note"></i> Observações</label>
          <textarea id="finObs" class="form-input" style="padding:6px 10px; font-size:0.8rem; height:50px;" rows="2"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:4px;">
          <label style="font-size:0.8rem;"><input type="checkbox" id="finRecorrente"> <i class="ph ph-arrows-clockwise"></i> Conta recorrente (todo mês)</label>
        </div>
      </div>
    `;

    // Carregar categorias
    carregarCategoriasSelect();

    UI.modalComConfirmacao(
      "Novo Lançamento",
      html,
      async () => {
        await salvarNovoLancamento();
      },
      null,
      "750px"
    );

    // Configurar eventos do parcelamento
    setTimeout(() => {
      window.toggleParcelamento = function () {
        const checked = document.getElementById("finParcelado").checked;
        document.getElementById("parcelaFields").style.display = checked
          ? "block"
          : "none";
        document.getElementById("vencimentoSimples").style.display = checked
          ? "none"
          : "block";
        if (checked) {
          const total =
            parseFloat(document.getElementById("finValorTotal").value) || 0;
          const entrada = Math.round(total * 0.3 * 100) / 100;
          document.getElementById("finEntrada").value = entrada.toFixed(2);
          const restante = total - entrada;
          const numParcelas = 3;
          const valorParcela = Math.round((restante / numParcelas) * 100) / 100;
          const tbody = document.getElementById("parcelasBody");
          tbody.innerHTML = "";
          for (let i = 1; i <= numParcelas; i++) {
            const data = new Date();
            data.setMonth(data.getMonth() + i);
            const dataStr = data.toISOString().split("T")[0];
            tbody.innerHTML += criarLinhaParcela(
              i,
              valorParcela.toFixed(2),
              dataStr
            );
          }
          calcularTotalParcelas();
        } else {
          document.getElementById("somaParcelas").textContent = "R$ 0,00";
          document.getElementById("totalComEntrada").textContent = "R$ 0,00";
        }
      };

      window.calcularTotalParcelas = function () {
        if (!document.getElementById("finParcelado")?.checked) {
          const parcelas = document.querySelectorAll(".parcela-valor");
          let soma = 0;
          parcelas.forEach((inp) => (soma += parseFloat(inp.value) || 0));
          const entrada =
            parseFloat(document.getElementById("finEntrada")?.value) || 0;
          document.getElementById("somaParcelas").textContent =
            formatCurrency(soma);
          document.getElementById("totalComEntrada").textContent =
            formatCurrency(entrada + soma);
          return;
        }

        const parcelas = document.querySelectorAll(".parcela-valor");
        let soma = 0;
        parcelas.forEach((inp) => (soma += parseFloat(inp.value) || 0));
        const entrada =
          parseFloat(document.getElementById("finEntrada")?.value) || 0;
        const total = entrada + soma;
        document.getElementById("finValorTotal").value = total.toFixed(2);
        document.getElementById("somaParcelas").textContent =
          formatCurrency(soma);
        document.getElementById("totalComEntrada").textContent =
          formatCurrency(total);
      };

      function criarLinhaParcela(numero, valor, data) {
        return `
          <tr class="parcela-row">
            <td class="text-center" style="padding:4px 6px;">${numero}</td>
            <td style="padding:4px 6px;"><input type="number" step="0.01" class="form-input parcela-valor" style="width:90px; padding:3px 6px; font-size:0.75rem;" value="${valor}" oninput="calcularTotalParcelas()"></td>
            <td style="padding:4px 6px;"><input type="date" class="form-input parcela-data" style="width:130px; padding:3px 6px; font-size:0.75rem;" value="${data}"></td>
            <td style="padding:4px 6px; text-align:center;"><button type="button" class="btn btn-ghost btn-sm remove-parcela" style="padding:0 4px; font-size:0.7rem; color:var(--error);"><i class="ph ph-x"></i></button></td>
          </tr>
        `;
      }

      document
        .getElementById("btnAdicionarParcela")
        ?.addEventListener("click", function () {
          const tbody = document.getElementById("parcelasBody");
          const rows = tbody.querySelectorAll(".parcela-row");
          const nextNum = rows.length + 1;
          const lastRow = rows[rows.length - 1];
          const lastValor = lastRow
            ? parseFloat(lastRow.querySelector(".parcela-valor").value) || 0
            : 0;
          const lastData = lastRow
            ? lastRow.querySelector(".parcela-data").value
            : todayISO();
          const nextDate = new Date(lastData);
          nextDate.setMonth(nextDate.getMonth() + 1);
          const dataStr = nextDate.toISOString().split("T")[0];
          tbody.insertAdjacentHTML(
            "beforeend",
            criarLinhaParcela(nextNum, lastValor.toFixed(2), dataStr)
          );
          calcularTotalParcelas();
        });

      document
        .getElementById("btnRemoverParcela")
        ?.addEventListener("click", function () {
          const tbody = document.getElementById("parcelasBody");
          if (tbody.children.length > 1) {
            tbody.removeChild(tbody.lastChild);
            tbody.querySelectorAll(".parcela-row").forEach((row, idx) => {
              row.querySelector("td:first-child").textContent = idx + 1;
            });
            calcularTotalParcelas();
          }
        });

      document
        .getElementById("parcelasBody")
        ?.addEventListener("click", function (e) {
          const btn = e.target.closest(".remove-parcela");
          if (btn) {
            const row = btn.closest(".parcela-row");
            if (row && row.parentElement.children.length > 1) {
              row.remove();
              this.querySelectorAll(".parcela-row").forEach((r, idx) => {
                r.querySelector("td:first-child").textContent = idx + 1;
              });
              calcularTotalParcelas();
            }
          }
        });

      document
        .getElementById("finEntrada")
        ?.addEventListener("input", calcularTotalParcelas);
      document
        .getElementById("finValorTotal")
        ?.addEventListener("input", function () {
          if (document.getElementById("finParcelado").checked) {
            const total = parseFloat(this.value) || 0;
            document.getElementById("totalComEntrada").textContent =
              formatCurrency(total);
          }
        });

      toggleParcelamento();
    }, 200);
  }

  async function carregarCategoriasSelect() {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) return;

      const { data: categorias } = await supabase
        .from("chart_of_accounts")
        .select("id, name, type")
        .order("name");

      const select = document.getElementById("finCategoria");
      if (!select) return;

      if (categorias?.length) {
        select.innerHTML = categorias
          .map((c) => `<option value="${c.id}">${c.name} (${c.type})</option>`)
          .join("");
      } else {
        select.innerHTML =
          '<option value="">Nenhuma categoria disponível</option>';
      }
    } catch (e) {
      console.error("Erro ao carregar categorias:", e);
    }
  }

  async function salvarNovoLancamento() {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const tipo = document.getElementById("finTipo").value;
      const categoriaId = document.getElementById("finCategoria").value;
      const descricao = document.getElementById("finDesc").value.trim();
      const formaPag = document.getElementById("finFormaPag").value || null;
      const obs = document.getElementById("finObs").value.trim() || null;
      const parcelado = document.getElementById("finParcelado").checked;
      const recorrente = document.getElementById("finRecorrente").checked;

      if (!descricao || !categoriaId) {
        UI.showToast("Erro", "Preencha os campos obrigatórios.", "error");
        return;
      }

      let valorTotal = parseFloat(
        document.getElementById("finValorTotal").value
      );
      if (isNaN(valorTotal) || valorTotal <= 0) {
        UI.showToast("Erro", "Informe um valor total válido.", "error");
        return;
      }

      let entryAmount = 0;
      let entryDate = null;
      let parcelasData = [];

      if (parcelado) {
        entryAmount =
          parseFloat(document.getElementById("finEntrada").value) || 0;
        entryDate = document.getElementById("finDataEntrada").value || null;

        const rows = document.querySelectorAll("#parcelasBody .parcela-row");
        let somaParcelas = 0;
        rows.forEach((row, index) => {
          const valor =
            parseFloat(row.querySelector(".parcela-valor").value) || 0;
          const data = row.querySelector(".parcela-data").value;
          if (valor > 0 && data) {
            parcelasData.push({
              numero: index + 1,
              valor: valor,
              vencimento: data,
              status: "pendente",
            });
            somaParcelas += valor;
          }
        });

        const totalComEntrada = entryAmount + somaParcelas;
        if (Math.abs(totalComEntrada - valorTotal) > 0.01) {
          UI.showToast(
            "Erro",
            `A soma da entrada + parcelas (${formatCurrency(
              totalComEntrada
            )}) não coincide com o valor total (${formatCurrency(
              valorTotal
            )}).`,
            "error"
          );
          return;
        }
        if (parcelasData.length === 0) {
          UI.showToast("Erro", "Adicione pelo menos uma parcela.", "error");
          return;
        }
      } else {
        const vencimento = document.getElementById("finVencimento").value;
        if (!vencimento) {
          UI.showToast("Erro", "Informe o vencimento.", "error");
          return;
        }
      }

      const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
      if (!loginResult) {
        UI.showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning"
        );
        return;
      }

      const insert = {
        type: tipo,
        account_id: categoriaId,
        category_id: categoriaId,
        description: descricao,
        amount: tipo === "pagar" ? -Math.abs(valorTotal) : Math.abs(valorTotal),
        date: parcelado
          ? entryDate || todayISO()
          : document.getElementById("finVencimento").value,
        due_date: parcelado
          ? parcelasData[0]?.vencimento || entryDate || todayISO()
          : document.getElementById("finVencimento").value,
        status: "pendente",
        payment_method: formaPag,
        notes: obs,
        installments: parcelado,
        total_installments: parcelado ? parcelasData.length : 1,
        entry_amount: entryAmount || 0,
      };

      if (recorrente) {
        const dia = new Date(insert.due_date + "T12:00:00").getDate();
        const { data: rec, error: recError } = await supabase
          .from("recurring_transactions")
          .insert({
            description: descricao,
            amount: Math.abs(valorTotal),
            category_id: categoriaId,
            due_day: dia,
            type: tipo,
            active: true,
          })
          .select("id")
          .single();

        if (recError) {
          UI.showToast(
            "Erro",
            `Falha ao criar recorrência: ${recError.message}`,
            "error"
          );
          return;
        }
        insert.recurring_id = rec.id;
      }

      const { data: novaTrans, error: insertError } = await supabase
        .from("financial_transactions")
        .insert(insert)
        .select("id")
        .single();

      if (insertError) {
        UI.showToast("Erro", `Falha ao criar: ${insertError.message}`, "error");
        return;
      }

      if (parcelado && parcelasData.length > 0) {
        const parcelasToInsert = parcelasData.map((p) => ({
          transaction_id: novaTrans.id,
          numero_parcela: p.numero,
          valor: p.valor,
          vencimento: p.vencimento,
          status: p.status,
          type: tipo,
        }));
        const { error: parcelasError } = await supabase
          .from("financial_installments")
          .insert(parcelasToInsert);
        if (parcelasError) {
          console.error("❌ Erro ao inserir parcelas:", parcelasError);
        }
      }

      UI.showToast("Sucesso", "Lançamento criado com sucesso!", "success");
      document.getElementById("modalContainer").innerHTML = "";
      await carregarFinanceiroPeriodo();
    } catch (e) {
      console.error("Erro ao criar lançamento:", e);
      UI.showToast("Erro", "Falha ao criar lançamento.", "error");
    }
  }

  // ============================================================
  // FUNÇÕES DE AÇÕES DOS LANÇAMENTOS (REFATORADO COM PADRÃO)
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

          // Construir HTML das parcelas com o novo padrão
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

      // ========== DEFINIR STATUS DO BANNER ==========
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

      // ========== INFORMAÇÕES PRINCIPAIS ==========
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

      // ========== SEÇÕES DO MODAL ==========
      const secoes = [];
      if (isParcelada && todasParcelas && todasParcelas.length > 0) {
        secoes.push({
          titulo: "Parcelas",
          icon: "ph-receipt",
          badge: `${todasParcelas.filter(p => p.status === "pago").length}/${todasParcelas.length}`,
          html: parcelasHtml,
        });
      }

      // ========== AÇÕES ==========
      const acoes = [];
      if (!pago) {
        if (isParcelada && todasParcelas && todasParcelas.length > 0) {
          acoes.push({
            label: "Baixar Parcelas",
            icon: "ph-receipt",
            class: "primary",
            onclick: `window.Financeiro.baixarParcelas('${transactionId}')`,
          });
        } else {
          acoes.push({
            label: "Baixar",
            icon: "ph-check-circle",
            class: "success",
            onclick: `window.Financeiro.baixarLancamento('${transactionId}')`,
          });
        }
      }
      if (pago) {
        acoes.push({
          label: "Estornar",
          icon: "ph-arrow-counter-clockwise",
          class: "warning",
          onclick: `window.Financeiro.estornarLancamento('${transactionId}')`,
        });
      }
      acoes.push({
        label: "Editar",
        icon: "ph-pencil-simple",
        class: "ghost",
        onclick: `window.Financeiro.editarLancamento('${transactionId}')`,
      });
      acoes.push({
        label: "Excluir",
        icon: "ph-trash",
        class: "ghost danger",
        onclick: `window.Financeiro.excluirLancamento('${transactionId}')`,
      });

      // ========== CRIAR MODAL PADRONIZADO ==========
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

      // Calcular totais
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

      // Construir tabela HTML para o PDF
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

      // Construir HTML completo do PDF
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

      // Criar blob e download
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
  // FUNÇÕES DE BAIXA E EDIÇÃO
  // ============================================================

  window.baixarLancamento = async function (transactionId) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      // Verificar se tem parcelas
      const { data: parcelas } = await supabase
        .from("financial_installments")
        .select("*")
        .eq("transaction_id", transactionId);

      if (parcelas && parcelas.length > 0) {
        await baixarParcelas(transactionId);
        return;
      }

      const { data: t } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("id", transactionId)
        .single();

      if (!t) {
        UI.showToast("Erro", "Lançamento não encontrado.", "error");
        return;
      }

      const html = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div class="form-group" style="margin-bottom:4px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-calendar"></i> Data Pagamento *</label>
            <input id="baixaData" type="date" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="${todayISO()}" required>
          </div>
          <div class="form-group" style="margin-bottom:4px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-credit-card"></i> Forma de Pagamento</label>
            <select id="baixaFormaPag" class="form-select" style="padding:4px 8px; font-size:0.8rem;">
              <option value="">Selecione</option>
              <option value="PIX">PIX</option>
              <option value="Boleto">Boleto</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Transferência">Transferência</option>
              <option value="Cartão">Cartão</option>
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
          <div class="form-group" style="margin-bottom:4px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-percent"></i> Juros (R$)</label>
            <input id="baixaJuros" type="number" step="0.01" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
          </div>
          <div class="form-group" style="margin-bottom:4px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-warning"></i> Multa (R$)</label>
            <input id="baixaMulta" type="number" step="0.01" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
          </div>
          <div class="form-group" style="margin-bottom:4px;">
            <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-tag"></i> Desconto (R$)</label>
            <input id="baixaDesconto" type="number" step="0.01" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
          </div>
        </div>
      `;

      UI.modalComConfirmacao(
        "Baixar Lançamento",
        html,
        async () => {
          const dataPag = document.getElementById("baixaData").value;
          const formaPag =
            document.getElementById("baixaFormaPag").value || null;
          const juros =
            parseFloat(document.getElementById("baixaJuros").value) || 0;
          const multa =
            parseFloat(document.getElementById("baixaMulta").value) || 0;
          const desconto =
            parseFloat(document.getElementById("baixaDesconto").value) || 0;

          if (!dataPag) {
            UI.showToast("Erro", "Informe a data do pagamento.", "error");
            return;
          }

          const { error } = await supabase
            .from("financial_transactions")
            .update({
              status: "pago",
              payment_date: dataPag,
              payment_method: formaPag,
              interest: juros,
              discount: desconto,
            })
            .eq("id", transactionId);

          if (error) {
            UI.showToast("Erro", `Falha ao baixar: ${error.message}`, "error");
          } else {
            document.getElementById("modalContainer").innerHTML = "";
            UI.showToast("Sucesso", "Lançamento baixado!", "success");
            await carregarFinanceiroPeriodo();
          }
        },
        null,
        "550px"
      );
    } catch (e) {
      console.error("Erro ao baixar lançamento:", e);
      UI.showToast("Erro", "Falha ao baixar lançamento.", "error");
    }
  };

  window.baixarParcelas = async function (transactionId) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: t } = await supabase
        .from("financial_transactions")
        .select("*, financial_installments(*)")
        .eq("id", transactionId)
        .single();

      if (!t) {
        UI.showToast("Erro", "Lançamento não encontrado.", "error");
        return;
      }

      const parcelasPendentes =
        t.financial_installments?.filter((p) => p.status !== "pago") || [];
      if (parcelasPendentes.length === 0) {
        UI.showToast("Aviso", "Não há parcelas pendentes para baixar.", "info");
        return;
      }

      const html = `
        <div style="max-height:70vh; overflow-y:auto; padding-right:4px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-calendar"></i> Data Pagamento *</label>
              <input id="baixaParcelasData" type="date" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="${todayISO()}">
            </div>
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-credit-card"></i> Forma de Pagamento</label>
              <select id="baixaParcelasForma" class="form-select" style="padding:4px 8px; font-size:0.8rem;">
                <option value="">Selecione</option>
                <option value="PIX">PIX</option>
                <option value="Boleto">Boleto</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Transferência">Transferência</option>
                <option value="Cartão">Cartão</option>
              </select>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-percent"></i> Juros (R$)</label>
              <input id="baixaParcelasJuros" type="number" step="0.01" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
            </div>
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-warning"></i> Multa (R$)</label>
              <input id="baixaParcelasMulta" type="number" step="0.01" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
            </div>
            <div class="form-group" style="margin-bottom:4px;">
              <label class="form-label" style="font-size:0.65rem;"><i class="ph ph-tag"></i> Desconto (R$)</label>
              <input id="baixaParcelasDesconto" type="number" step="0.01" class="form-input" style="padding:4px 8px; font-size:0.8rem;" value="0">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:4px;">
            <label style="font-size:0.8rem; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="selecionarTodasParcelas"> <i class="ph ph-check-square"></i> Selecionar todas
            </label>
          </div>
          <div style="overflow-x:auto; max-height:250px; overflow-y:auto; border:1px solid rgba(255,255,255,0.06); border-radius:6px;">
            <table class="table" style="font-size:0.75rem; margin:0;">
              <thead><tr><th style="padding:4px 6px;"><input type="checkbox" id="selecionarTodasParcelasTable"></th><th style="padding:4px 6px;">#</th><th style="padding:4px 6px;">Vencimento</th><th style="padding:4px 6px;">Valor</th></tr></thead>
              <tbody>
                ${parcelasPendentes
                  .map(
                    (p) => `
                  <tr>
                    <td style="padding:4px 6px; text-align:center;"><input type="checkbox" class="parcela-baixa-check" data-id="${p.id}" data-valor="${p.valor}" checked></td>
                    <td class="text-center" style="padding:4px 6px;">${p.numero_parcela}ª</td>
                    <td style="padding:4px 6px;">${formatDate(
                      p.vencimento
                    )}</td>
                    <td class="text-right" style="padding:4px 6px;">${formatCurrency(
                      p.valor
                    )}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <div style="margin-top:8px; display:flex; gap:16px; font-size:0.75rem;">
            <span><strong>Total a pagar:</strong> <span id="totalBaixaParcelas">${formatCurrency(
              parcelasPendentes.reduce((s, p) => s + p.valor, 0)
            )}</span></span>
          </div>
        </div>
      `;

      UI.modalComConfirmacao(
        "Baixar Parcelas",
        html,
        async () => {
          const dataPag = document.getElementById("baixaParcelasData").value;
          const formaPag =
            document.getElementById("baixaParcelasForma").value || null;
          const juros =
            parseFloat(document.getElementById("baixaParcelasJuros").value) || 0;
          const multa =
            parseFloat(document.getElementById("baixaParcelasMulta").value) || 0;
          const desconto =
            parseFloat(
              document.getElementById("baixaParcelasDesconto").value
            ) || 0;

          if (!dataPag) {
            UI.showToast("Erro", "Informe a data do pagamento.", "error");
            return;
          }

          const checks = document.querySelectorAll(
            ".parcela-baixa-check:checked"
          );
          if (checks.length === 0) {
            UI.showToast("Erro", "Selecione pelo menos uma parcela.", "error");
            return;
          }

          const idsPagar = Array.from(checks).map((cb) => cb.dataset.id);

          for (const parcelaId of idsPagar) {
            await supabase
              .from("financial_installments")
              .update({ status: "pago" })
              .eq("id", parcelaId);
          }

          const { data: todasParcelas } = await supabase
            .from("financial_installments")
            .select("status")
            .eq("transaction_id", transactionId);

          const restantes =
            todasParcelas?.filter((p) => p.status !== "pago") || [];
          const todasPagas = restantes.length === 0;

          const updateData = {
            status: todasPagas ? "pago" : "pendente",
            payment_date: dataPag,
            payment_method: formaPag,
            interest: juros,
            discount: desconto,
          };

          if (todasPagas) {
            const { data: todasParcelasComValor } = await supabase
              .from("financial_installments")
              .select("valor")
              .eq("transaction_id", transactionId);
            const totalPago =
              todasParcelasComValor?.reduce(
                (s, p) => s + parseFloat(p.valor),
                0
              ) || 0;
            updateData.amount =
              t.type === "pagar" ? -Math.abs(totalPago) : Math.abs(totalPago);
          }

          await supabase
            .from("financial_transactions")
            .update(updateData)
            .eq("id", transactionId);

          document.getElementById("modalContainer").innerHTML = "";
          UI.showToast(
            "Sucesso",
            `${checks.length} parcela(s) baixada(s)!`,
            "success"
          );
          await carregarFinanceiroPeriodo();
        },
        null,
        "650px"
      );

      setTimeout(() => {
        document
          .getElementById("selecionarTodasParcelas")
          ?.addEventListener("change", function () {
            const checked = this.checked;
            document
              .querySelectorAll(".parcela-baixa-check")
              .forEach((cb) => (cb.checked = checked));
          });
        document
          .getElementById("selecionarTodasParcelasTable")
          ?.addEventListener("change", function () {
            const checked = this.checked;
            document
              .querySelectorAll(".parcela-baixa-check")
              .forEach((cb) => (cb.checked = checked));
          });
      }, 100);
    } catch (e) {
      console.error("Erro ao baixar parcelas:", e);
      UI.showToast("Erro", "Falha ao baixar parcelas.", "error");
    }
  };

  window.editarLancamento = async function (transactionId) {
    UI.showToast("Info", "Edição de lançamento em desenvolvimento.", "info");
  };

  window.excluirLancamento = async function (transactionId) {
    UI.openConfirmModal(
      "Excluir Lançamento",
      "Deseja realmente excluir este lançamento? Esta ação não pode ser desfeita.",
      async () => {
        try {
          const supabase = Supabase.getSupabaseClient
            ? Supabase.getSupabaseClient()
            : null;
          if (!supabase) {
            UI.showToast("Erro", "Cliente Supabase não disponível", "error");
            return;
          }

          await supabase
            .from("financial_installments")
            .delete()
            .eq("transaction_id", transactionId);

          await supabase
            .from("financial_transactions")
            .delete()
            .eq("id", transactionId);

          UI.showToast("Sucesso", "Lançamento excluído!", "success");
          await carregarFinanceiroPeriodo();
        } catch (e) {
          console.error("Erro ao excluir lançamento:", e);
          UI.showToast("Erro", "Falha ao excluir lançamento.", "error");
        }
      }
    );
  };

  window.estornarLancamento = async function (transactionId) {
    UI.openConfirmModal(
      "Estornar Lançamento",
      "Deseja realmente estornar este lançamento?",
      async () => {
        try {
          const supabase = Supabase.getSupabaseClient
            ? Supabase.getSupabaseClient()
            : null;
          if (!supabase) {
            UI.showToast("Erro", "Cliente Supabase não disponível", "error");
            return;
          }

          await supabase
            .from("financial_transactions")
            .update({
              status: "pendente",
              payment_date: null,
              interest: 0,
              discount: 0,
            })
            .eq("id", transactionId);

          UI.showToast("Sucesso", "Lançamento estornado!", "success");
          await carregarFinanceiroPeriodo();
        } catch (e) {
          console.error("Erro ao estornar lançamento:", e);
          UI.showToast("Erro", "Falha ao estornar lançamento.", "error");
        }
      }
    );
  };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("🏦 Financeiro: Inicializando...");

    // Configurar eventos
    const btnExportPDF = document.getElementById("btnExportPDFFinanceiro");
    if (btnExportPDF) {
      btnExportPDF.addEventListener("click", exportarPDFFinanceiro);
    }

    // Carregar dados iniciais
    const periodo = global.App?.periodState?.financeiro || new Date();
    await carregarFinanceiroPeriodo(periodo);

    console.log("✅ Financeiro: Inicializado com sucesso");
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

    // CRUD
    novoLancamento,
    editarLancamento: window.editarLancamento,
    excluirLancamento: window.excluirLancamento,

    // Ações
    abrirModalConta: window.abrirModalConta,
    baixarLancamento: window.baixarLancamento,
    baixarParcelas: window.baixarParcelas,
    estornarLancamento: window.estornarLancamento,

    // Exportação
    exportarPDFFinanceiro,

    // Utilitários
    gerarEventosFinanceiros,

    // Inicialização
    init,
  };

  console.log("✅ Financeiro exportado globalmente como window.Financeiro");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
