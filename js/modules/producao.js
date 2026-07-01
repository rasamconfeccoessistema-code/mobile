// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo Produção (producao.js) - Aba de Produção
// Versão 2.1 - Com menu único de ações e seletor de período dinâmico
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Produção carregado");

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
    formatStatus,
    getPaymentStatusInfo,
    getStatusColor,
    getStatusIcon,
    escapeHtml,
    pulseElement,
    getMonthRangeForDate,
    showToast: toast,
  } = Utils;

  // ============================================================
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let dados = {};
  let carregando = false;
  let filtroAtual = "todos";

  // ============================================================
  // ELEMENTOS DO DOM (Cache)
  // ============================================================

  const $ = (id) => document.getElementById(id);

  // ============================================================
  // FUNÇÕES DE CARREGAMENTO DE DADOS
  // ============================================================

  /**
   * Carrega os dados de produção para o período selecionado
   * @param {Date} periodo - Data de referência para o período
   * @returns {Promise<Object>} Dados de produção
   */
  async function carregarProducaoPeriodo(periodo) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        throw new Error("Cliente Supabase não disponível");
      }

      const mesRange = getMonthRangeForDate(periodo || new Date());
      console.log(
        `📊 Produção: Carregando para: ${mesRange.mes}/${mesRange.ano}`
      );

      // Atualizar período no estado global
      if (global.App) {
        global.App.periodState.producao = periodo || new Date();
      }

      // Buscar OS do período
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
        .or(
          `received_date.gte.${mesRange.inicio},received_date.lte.${mesRange.fim},expected_delivery.gte.${mesRange.inicio},expected_delivery.lte.${mesRange.fim}`
        )
        .order("created_at", { ascending: false });

      const { data: todasOS, error: errOs } = await queryOS;
      if (errOs) {
        console.error("❌ Produção: Erro ao buscar OS:", errOs);
        return dados;
      }

      const osAtivas = (todasOS || []).filter(
        (o) => !["cancelado"].includes(o.status)
      );

      // Buscar progresso das OS
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

      dados = {
        osAtivas: osAtivas || [],
        progressoMap: progressoMap || {},
        mesRange: mesRange,
      };

      // Renderizar produção
      renderizarProducao(dados);

      // Atualizar seletor de período
      if (global.UI && typeof global.UI.renderizarPeriodSelector === 'function') {
        const containerId = 'periodSelectorContainer_producao';
        const container = document.getElementById(containerId);
        if (container) {
          global.UI.renderizarPeriodSelector(
            containerId,
            periodo || new Date(),
            (novoPeriodo) => {
              carregarProducaoPeriodo(novoPeriodo);
            },
            'producao'
          );
        }
      }

      console.log(`✅ Produção: ${osAtivas.length} OS carregadas`);
      return dados;
    } catch (e) {
      console.error("❌ Produção: Erro ao carregar dados:", e);
      if (UI.showToast) {
        UI.showToast("Erro", "Falha ao carregar dados de produção.", "error");
      }
      return dados;
    }
  }

  // ============================================================
  // RENDERIZAR - LISTA DE LOTES (PRODUÇÃO)
  // ============================================================

  function renderizarProducao(dados) {
    console.log("📊 Produção: Renderizando lista de lotes...");

    const { osAtivas, progressoMap } = dados;
    const hoje = new Date();

    // ========== ATUALIZAR KPIs ==========
    const emCostura = osAtivas.filter((o) => o.status === "em_costura").length;
    const costurados = osAtivas.filter((o) => o.status === "costurado").length;
    const recebidos = osAtivas.filter((o) => o.status === "recebido").length;
    const emRevisao = osAtivas.filter((o) => o.status === "em_revisao").length;
    const entregues = osAtivas.filter((o) => o.status === "entregue").length;
    const cancelados = osAtivas.filter((o) => o.status === "cancelado").length;

    const atrasados = osAtivas.filter((o) => {
      if (!o.expected_delivery) return false;
      const prazo = new Date(o.expected_delivery);
      return (
        prazo < hoje && !["entregue", "cancelado", "pago"].includes(o.status)
      );
    }).length;

    const aguardandoPagto = osAtivas.filter(
      (o) => o.status === "entregue" && o.payment_status !== "pago"
    ).length;

    const pagos = osAtivas.filter((o) => o.payment_status === "pago").length;

    const entreguesHoje = osAtivas.filter((o) => {
      if (!o.updated_at) return false;
      const dataAtualizacao = new Date(o.updated_at);
      return (
        o.status === "entregue" &&
        dataAtualizacao.toDateString() === hoje.toDateString()
      );
    }).length;

    console.log("📊 Produção: Status calculados:", {
      total: osAtivas.length,
      emCostura,
      costurados,
      recebidos,
      emRevisao,
      entregues,
      cancelados,
      atrasados,
      aguardandoPagto,
      pagos,
      entreguesHoje,
    });

    // Atualizar elementos dos KPIs
    const elEmCostura = document.getElementById("prodEmCostura");
    const elCosturados = document.getElementById("prodCosturados");
    const elAtrasados = document.getElementById("prodAtrasados");
    const elAguardandoPagto = document.getElementById("prodAguardandoPagto");
    const elEntreguesHoje = document.getElementById("prodEntreguesHoje");
    const elPagos = document.getElementById("prodPagos");

    if (elEmCostura) elEmCostura.textContent = emCostura;
    if (elCosturados) elCosturados.textContent = costurados;
    if (elAtrasados) elAtrasados.textContent = atrasados;
    if (elAguardandoPagto) elAguardandoPagto.textContent = aguardandoPagto;
    if (elEntreguesHoje) elEntreguesHoje.textContent = entreguesHoje;
    if (elPagos) elPagos.textContent = pagos;

    // ========== RENDERIZAR LISTA DE LOTES ==========
    const container = document.getElementById("listaProducao");
    const totalEl = document.getElementById("totalLotes");

    if (totalEl) {
      totalEl.textContent = (osAtivas || []).length + " lotes";
    }

    if (!container) {
      console.error("❌ Produção: Container #listaProducao não encontrado");
      return;
    }

    // Aplicar filtro
    let lotesFiltrados = osAtivas || [];
    if (filtroAtual && filtroAtual !== "todos") {
      if (filtroAtual === "pendente") {
        lotesFiltrados = lotesFiltrados.filter(
          (o) => o.status === "entregue" && o.payment_status !== "pago"
        );
      } else if (filtroAtual === "pago") {
        lotesFiltrados = lotesFiltrados.filter(
          (o) => o.payment_status === "pago"
        );
      } else if (filtroAtual === "atrasado") {
        lotesFiltrados = lotesFiltrados.filter((o) => {
          if (!o.expected_delivery) return false;
          const prazo = new Date(o.expected_delivery);
          return (
            prazo < hoje &&
            !["entregue", "cancelado", "pago"].includes(o.status)
          );
        });
      } else {
        lotesFiltrados = lotesFiltrados.filter((o) => o.status === filtroAtual);
      }
    }

    if (lotesFiltrados.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 40px 16px; color: var(--gray-dark);">
          <i class="ph ph-factory" style="font-size: 40px; display: block; margin-bottom: 12px; color: var(--gray);"></i>
          <p style="font-size: 15px; font-weight: 500;">Nenhum lote encontrado</p>
          <p style="font-size: 12px; color: var(--gray); margin-top: 4px;">Clique em "Novo Lote" para começar</p>
        </div>
      `;
      return;
    }

    container.innerHTML = lotesFiltrados
      .sort(
        (a, b) => new Date(a.expected_delivery) - new Date(b.expected_delivery)
      )
      .map((os) => {
        const cliente =
          os.customers?.trade_name || os.customers?.company_name || "-";
        const atrasado =
          new Date(os.expected_delivery) < new Date() &&
          !["cancelado", "entregue", "pago"].includes(os.status);
        const paymentStatus = os.payment_status || "pendente";
        const paymentInfo = getPaymentStatusInfo(paymentStatus);
        const statusColor = getStatusColor(os.status);
        const statusIcon = getStatusIcon(os.status);
        const referencia =
          os.product_reference || os.order_number || "Sem referência";
        const orderNumber = os.order_number || "";

        const prog = progressoMap?.[os.id] || {
          total: os.total_quantity || 0,
          costurado: 0,
          entregue: 0,
        };

        const percentCosturado =
          prog.total > 0 ? Math.round((prog.costurado / prog.total) * 100) : 0;
        const percentEntregue =
          prog.total > 0 ? Math.round((prog.entregue / prog.total) * 100) : 0;
        const faltamCosturar = prog.total - prog.costurado;
        const faltamEntregar = prog.total - prog.entregue;

        const progressoHtml = `
          <div style="font-size:0.65rem; color:var(--gray); margin-top:4px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
              <span>🧵 Costurado: <strong style="color:var(--gold-light);">${prog.costurado}</strong>/${prog.total}</span>
              <span>📦 Entregue: <strong style="color:var(--pink-light);">${prog.entregue}</strong>/${prog.total}</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-bottom:2px;">
              <div style="height:100%; width:${percentCosturado}%; background:var(--gold); border-radius:3px; transition:width 0.5s ease;"></div>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${percentEntregue}%; background:var(--pink); border-radius:3px; transition:width 0.5s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:2px; font-size:0.55rem; color:var(--gray-dark);">
              <span>${
                faltamCosturar > 0
                  ? `⏳ Faltam ${faltamCosturar} para costurar`
                  : "✅ Tudo costurado!"
              }</span>
              <span>${
                faltamEntregar > 0
                  ? `📦 Faltam ${faltamEntregar} para entregar`
                  : "✅ Tudo entregue!"
              }</span>
            </div>
            ${
              atrasado
                ? '<span style="font-size:0.55rem; color:var(--error);"><i class="ph ph-warning"></i> Atrasado</span>'
                : ""
            }
          </div>
        `;

        const valorTotal = (os.total_quantity || 0) * (os.unit_price || 0);
        const statusProducaoLabel = formatStatus(os.status);
        const statusPagamentoLabel = paymentInfo.label;

        // ========== BOTÃO ÚNICO DE AÇÕES (MENU) ==========
        // Construir lista de ações dinamicamente
        const acoes = [];

        // Ação Visualizar (sempre disponível)
        acoes.push({
          label: 'Visualizar',
          icon: 'ph-eye',
          color: 'var(--info)',
          onclick: `window.Producao.visualizarLote('${os.id}')`
        });

        // Ação Editar (sempre disponível)
        acoes.push({
          label: 'Editar',
          icon: 'ph-pencil-simple',
          color: 'var(--gold-light)',
          onclick: `window.Producao.editarLote('${os.id}')`
        });

        // Ações específicas por status
        if (os.status === "recebido") {
          acoes.push({
            label: 'Iniciar Costura',
            icon: 'ph-play',
            color: '#2196f3',
            onclick: `window.Producao.iniciarCosturaLote('${os.id}', '${os.order_number}')`
          });
        }

        if (os.status === "em_costura") {
          acoes.push({
            label: 'Registrar Progresso',
            icon: 'ph-thread',
            color: '#42a5f5',
            onclick: `window.Producao.registrarCosturaParcial('${os.id}')`
          });
          acoes.push({
            label: 'Finalizar Costura',
            icon: 'ph-check-circle',
            color: '#4caf50',
            onclick: `window.Producao.finalizarCosturaLote('${os.id}', '${os.order_number}')`
          });
        }

        if (os.status === "costurado") {
          acoes.push({
            label: 'Marcar como Entregue',
            icon: 'ph-truck',
            color: 'var(--gold-light)',
            onclick: `window.Producao.marcarEntregue('${os.id}', '${os.order_number}')`
          });
        }

        if (os.status === "entregue" && paymentStatus === "pendente") {
          acoes.push({
            label: `Receber ${formatCurrency(valorTotal)}`,
            icon: 'ph-currency-dollar',
            color: '#4caf50',
            onclick: `window.Producao.marcarPago('${os.id}', '${os.order_number}')`
          });
        }

        if (os.status !== "cancelado" && os.status !== "pago") {
          acoes.push({
            label: 'Cancelar Lote',
            icon: 'ph-x-circle',
            color: 'var(--warning)',
            onclick: `window.Producao.cancelarLote('${os.id}', '${os.order_number}')`
          });
        }

        // Ação Excluir (sempre disponível, mas com confirmação)
        acoes.push({
          label: 'Excluir',
          icon: 'ph-trash',
          color: 'var(--error)',
          onclick: `window.Producao.excluirLote('${os.id}', '${os.order_number}')`
        });

        // Converter ações para string para o menu
        const acoesStr = acoes.map(a => 
          `{ label: '${a.label}', icon: '${a.icon}', color: '${a.color}', onclick: '${a.onclick}' }`
        ).join(',');

        const menuId = `menu-prod-${os.id}`;
        const borderColor = atrasado ? "#ff5252" : statusColor;
        const bgColor = atrasado
          ? "rgba(255,82,82,0.05)"
          : "rgba(255,255,255,0.02)";

        return `
          <div class="list-item ${atrasado ? "item-vencido" : ""}" 
               data-id="${os.id}"
               style="
                 display: flex; 
                 flex-direction: column; 
                 padding: 14px 16px; 
                 margin-bottom: 12px;
                 border-radius: 12px;
                 border: 1px solid rgba(255,255,255,0.06);
                 border-left: 4px solid ${borderColor};
                 background: ${bgColor};
                 box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                 transition: all 0.25s ease;
                 cursor: pointer;
                 gap: 6px;
               "
               onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)'; this.style.transform='translateY(-2px)';"
               onmouseleave="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'; this.style.transform='translateY(0)';"
               onclick="window.Producao.visualizarLote('${os.id}')"
               >
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 15px; font-weight: 700; color: ${
                  atrasado ? "var(--error)" : "var(--gold-light)"
                }; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <i class="ph ${statusIcon}" style="color: ${statusColor}; font-size: 16px;"></i>
                  <span>${escapeHtml(referencia)}</span>
                </div>
                
                <div style="font-size: 10px; color: var(--gray-dark); margin-top: 1px; display: flex; flex-wrap: wrap; gap: 4px 12px;">
                  <span><i class="ph ph-user"></i> ${escapeHtml(cliente)}</span>
                  <span><i class="ph ph-package"></i> ${os.total_quantity || 0} peças</span>
                  <span><i class="ph ph-currency-circle-dollar"></i> ${formatCurrency(
                    os.unit_price || 0
                  )}</span>
                  ${
                    os.expected_delivery
                      ? ` <span><i class="ph ph-calendar"></i> ${formatDate(
                          os.expected_delivery
                        )}</span>`
                      : ""
                  }
                  ${
                    atrasado
                      ? ` <span style="color:var(--error);font-weight:600;"><i class="ph ph-warning"></i> Atrasado</span>`
                      : ""
                  }
                </div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px;">
                  <span style="font-size:0.55rem; color:${statusColor}; background:${statusColor}22; padding:2px 10px; border-radius:20px; border:1px solid ${statusColor}44; font-weight:500;">
                    <i class="ph ${statusIcon}"></i> ${statusProducaoLabel}
                  </span>
                  <span style="font-size:0.55rem; color:${paymentInfo.color}; background:${paymentInfo.bg}; padding:2px 10px; border-radius:20px; border:${paymentInfo.border}; font-weight:500;">
                    <i class="ph ${paymentInfo.icon}"></i> ${statusPagamentoLabel}
                  </span>
                </div>
              </div>
            </div>

            ${progressoHtml}

            <div style="font-size:0.55rem; color:var(--gray-dark); margin-top:4px; display:flex; gap:12px; flex-wrap:wrap; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 6px;">
              <span><strong>💰 Total:</strong> ${formatCurrency(
                valorTotal
              )}</span>
              ${
                paymentStatus === "pago" && os.payment_date
                  ? ` · <span><strong>📅 Pago em:</strong> ${formatDate(
                      os.payment_date
                    )}</span>`
                  : ""
              }
              ${
                paymentStatus === "pendente" && os.status === "entregue"
                  ? ` · <span style="color:var(--warning);"><i class="ph ph-clock"></i> Aguardando pagamento</span>`
                  : ""
              }
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.04);">
              <button class="btn-action-menu" 
                      style="min-height: 36px; min-width: 36px; padding: 6px 12px;"
                      onclick="event.stopPropagation(); window.UI.abrirMenuAcoesMobile('${os.id}', [${acoesStr}], 'Ações do Lote');">
                <i class="ph ph-gear-six"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    console.log(`✅ Produção: ${lotesFiltrados.length} lotes renderizados`);
  }

  // ============================================================
  // FUNÇÕES DE CRUD DE LOTES
  // ============================================================

  /**
   * Cria um novo lote
   */
  async function criarNovoLote() {
    console.log("📝 Produção: Criando novo lote...");

    const html = `
      <div style="display: grid; gap: 10px;">
        <div class="form-group">
          <label>Cliente *</label>
          <input id="novoLoteCliente" class="form-input" placeholder="Nome do cliente">
        </div>
        <div class="form-group">
          <label>Produto *</label>
          <input id="novoLoteProduto" class="form-input" placeholder="Descrição do produto">
        </div>
        <div class="form-group">
          <label>Referência do Produto *</label>
          <input id="novoLoteReferencia" class="form-input" placeholder="Ex: JEANS-001, CALCA-2024">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Quantidade *</label>
            <input id="novoLoteQtd" type="number" class="form-input" placeholder="Ex: 500">
          </div>
          <div class="form-group">
            <label>Valor Unitário *</label>
            <input id="novoLotePreco" type="number" step="0.01" class="form-input" placeholder="Ex: 15.00">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Data Recebimento</label>
            <input id="novoLoteRecebimento" type="date" class="form-input" value="${todayISO()}">
          </div>
          <div class="form-group">
            <label>Prazo Entrega</label>
            <input id="novoLotePrazo" type="date" class="form-input">
          </div>
        </div>
        <div class="form-group">
          <label>Observações</label>
          <textarea id="novoLoteObs" class="form-input" rows="2" placeholder="Informações adicionais..."></textarea>
        </div>
      </div>
    `;

    UI.modalComConfirmacao(
      "Novo Lote",
      html,
      async () => {
        const cliente = document.getElementById("novoLoteCliente").value.trim();
        const produto = document.getElementById("novoLoteProduto").value.trim();
        const referencia = document
          .getElementById("novoLoteReferencia")
          .value.trim();
        const qtd = parseInt(document.getElementById("novoLoteQtd").value);
        const preco = parseFloat(
          document.getElementById("novoLotePreco").value
        );
        const recebimento = document.getElementById(
          "novoLoteRecebimento"
        ).value;
        const prazo = document.getElementById("novoLotePrazo").value;
        const obs = document.getElementById("novoLoteObs").value.trim() || null;

        if (
          !cliente ||
          !produto ||
          !referencia ||
          !qtd ||
          !preco ||
          !recebimento ||
          !prazo
        ) {
          UI.showToast(
            "Erro",
            "Preencha todos os campos obrigatórios.",
            "error"
          );
          return;
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

        try {
          const supabase = Supabase.getSupabaseClient
            ? Supabase.getSupabaseClient()
            : null;
          if (!supabase) {
            throw new Error("Cliente Supabase não disponível");
          }

          // Buscar ou criar cliente
          let clienteId = null;
          const { data: clientes } = await supabase
            .from("customers")
            .select("id")
            .ilike("company_name", `%${cliente}%`)
            .limit(1);

          if (clientes && clientes.length > 0) {
            clienteId = clientes[0].id;
          } else {
            const { data: novoCliente } = await supabase
              .from("customers")
              .insert({
                company_name: cliente,
                trade_name: cliente,
                active: true,
              })
              .select("id")
              .single();
            if (novoCliente) clienteId = novoCliente.id;
          }

          if (!clienteId) {
            UI.showToast(
              "Erro",
              "Não foi possível identificar o cliente.",
              "error"
            );
            return;
          }

          const orderNumber = "OS-" + Date.now();
          const total = qtd * preco;

          const { data: novaOS, error } = await supabase
            .from("service_orders")
            .insert({
              customer_id: clienteId,
              product_description: produto,
              product_reference: referencia,
              total_quantity: qtd,
              unit_price: preco,
              received_date: recebimento,
              expected_delivery: prazo,
              status: "recebido",
              payment_status: "pendente",
              notes: obs,
              order_number: orderNumber,
              total: total,
            })
            .select("id")
            .single();

          if (error) {
            throw error;
          }

          await supabase.from("service_order_items").insert({
            service_order_id: novaOS.id,
            size: "Único",
            quantity: qtd,
            sewn_quantity: 0,
            delivered_quantity: 0,
          });

          // Criar conta a receber
          await criarContaReceber(
            novaOS.id,
            total,
            `Lote ${orderNumber} - ${produto}`,
            prazo,
            cliente
          );

          UI.showToast(
            "Sucesso",
            `Lote ${orderNumber} criado com referência ${referencia}!`,
            "success"
          );

          // Recarregar dados
          await carregarProducaoPeriodo();
          document.getElementById("modalContainer").innerHTML = "";
        } catch (error) {
          console.error("Erro ao criar lote:", error);
          UI.showToast(
            "Erro",
            "Falha ao criar lote: " + error.message,
            "error"
          );
        }
      },
      "520px"
    );
  }

  /**
   * Cria uma conta a receber para o lote
   */
  async function criarContaReceber(
    osId,
    valorTotal,
    descricao,
    dataReferencia,
    clienteNome
  ) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) return;

      // Buscar categoria de receita
      const { data: categoria } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("type", "receita")
        .ilike("name", "%faturamento%")
        .limit(1)
        .maybeSingle();

      if (!categoria) {
        console.warn(
          "⚠️ Categoria de receita não encontrada. Conta não criada."
        );
        return;
      }

      const { error } = await supabase.from("financial_transactions").insert({
        type: "receber",
        amount: valorTotal,
        description: descricao,
        date: todayISO(),
        due_date: dataReferencia,
        status: "pendente",
        account_id: categoria.id,
        category_id: categoria.id,
        service_order_id: osId,
        notes: `Gerado do lote. Cliente: ${clienteNome}`,
      });

      if (error) {
        console.error("❌ Erro ao criar conta a receber:", error);
      }
    } catch (e) {
      console.error("Erro ao criar conta a receber:", e);
    }
  }

  // ============================================================
  // FUNÇÕES DE AÇÕES DOS LOTES (VISUALIZAR - REFATORADO)
  // ============================================================

  /**
   * Visualiza um lote em detalhes usando o padrão de modal padronizado
   */
  window.visualizarLote = async function (id) {
    console.log(`👁️ Produção: Visualizando lote ${id}`);

    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: lote, error } = await supabase
        .from("service_orders")
        .select(
          `
          *, 
          customers(company_name, trade_name, contact_name, phone)
        `
        )
        .eq("id", id)
        .single();

      if (error || !lote) {
        UI.showToast("Erro", "Lote não encontrado.", "error");
        return;
      }

      const { data: items } = await supabase
        .from("service_order_items")
        .select("*")
        .eq("service_order_id", id)
        .order("size");

      const { data: sewingRecords } = await supabase
        .from("sewing_records")
        .select(
          `
          *, 
          employees(full_name),
          service_order_items!inner(service_order_id)
        `
        )
        .eq("service_order_items.service_order_id", id)
        .order("start_time", { ascending: false })
        .limit(10);

      const totalPecas = items?.length
        ? items.reduce((sum, i) => sum + i.quantity, 0)
        : lote.total_quantity;
      const valorTotal = lote.total || totalPecas * lote.unit_price;
      const cliente =
        lote.customers?.trade_name || lote.customers?.company_name || "-";
      const atrasado =
        new Date(lote.expected_delivery) < new Date() &&
        !["pago", "cancelado"].includes(lote.status);
      const paymentStatus = lote.payment_status || "pendente";
      const paymentInfo = getPaymentStatusInfo(paymentStatus);
      const statusColor = getStatusColor(lote.status);
      const statusIcon = getStatusIcon(lote.status);

      // ========== DEFINIR STATUS DO BANNER ==========
      let statusConfig = {};
      if (lote.status === "entregue" && paymentStatus === "pago") {
        statusConfig = {
          status: "success",
          statusIcon: "ph-check-circle",
          statusTitle: "✅ Lote Entregue e Pago",
          statusSub: `Pago em ${formatDate(lote.payment_date) || "data não informada"}`,
        };
      } else if (lote.status === "entregue" && paymentStatus === "pendente") {
        statusConfig = {
          status: "warning",
          statusIcon: "ph-clock",
          statusTitle: "📦 Lote Entregue - Aguardando Pagamento",
          statusSub: `Valor a receber: ${formatCurrency(valorTotal)}`,
        };
      } else if (lote.status === "costurado") {
        statusConfig = {
          status: "info",
          statusIcon: "ph-check-circle",
          statusTitle: "✅ Lote Costurado",
          statusSub: "Aguardando entrega",
        };
      } else if (lote.status === "em_costura") {
        const progresso =
          totalPecas > 0
            ? Math.round(
                (items?.reduce((s, i) => s + (i.sewn_quantity || 0), 0) /
                  totalPecas) *
                  100
              )
            : 0;
        statusConfig = {
          status: "info",
          statusIcon: "ph-sewing-needle",
          statusTitle: `🧵 Em Costura (${progresso}%)`,
          statusSub: `${items?.reduce((s, i) => s + (i.sewn_quantity || 0), 0) || 0}/${totalPecas} peças costuradas`,
        };
      } else if (atrasado) {
        statusConfig = {
          status: "danger",
          statusIcon: "ph-warning-circle",
          statusTitle: "🔴 Lote Atrasado",
          statusSub: `Prazo vencido em ${formatDate(lote.expected_delivery)}`,
        };
      } else {
        statusConfig = {
          status: "neutral",
          statusIcon: "ph-info",
          statusTitle: `📋 ${formatStatus(lote.status)}`,
          statusSub: `Entrega prevista: ${formatDate(lote.expected_delivery)}`,
        };
      }

      // ========== INFORMAÇÕES PRINCIPAIS ==========
      const infoItems = [
        {
          label: "Cliente",
          value: escapeHtml(cliente),
          class: "highlight",
        },
        { label: "Produto", value: escapeHtml(lote.product_description || "-") },
        {
          label: "Referência",
          value: escapeHtml(lote.product_reference || "-"),
        },
        { label: "Peças", value: totalPecas },
        {
          label: "Valor Unitário",
          value: formatCurrency(lote.unit_price),
        },
        {
          label: "Valor Total",
          value: formatCurrency(valorTotal),
          class: "highlight",
        },
        {
          label: "Recebimento",
          value: formatDate(lote.received_date),
        },
        {
          label: "Entrega",
          value: formatDate(lote.expected_delivery),
          class: atrasado ? "danger" : "",
        },
      ];

      // ========== HTML DOS ITENS (GRADE) ==========
      let itemsHtml = "";
      if (items && items.length > 0) {
        const itemsListHtml = items
          .map(
            (item) => `
              <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 12px;
                margin-bottom: 4px;
                background: rgba(255,255,255,0.02);
                border-radius: 6px;
                font-size: 0.75rem;
              ">
                <span style="font-weight:600; min-width:60px;">${escapeHtml(
                  item.size
                )}</span>
                <span style="color:var(--gray);">Solic: ${item.quantity}</span>
                <span style="color:var(--gold-light);">Cost: ${
                  item.sewn_quantity || 0
                }</span>
                <span style="color:var(--pink-light);">Entr: ${
                  item.delivered_quantity || 0
                }</span>
                <span style="color:var(--gray-dark);">Pend: ${item.quantity - (item.delivered_quantity || 0)}</span>
              </div>
            `
          )
          .join("");

        itemsHtml = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${itemsListHtml}
          </div>
        `;
      }

      // ========== HTML DA COSTURA ==========
      let costuraHtml = "";
      if (sewingRecords && sewingRecords.length > 0) {
        const recordsListHtml = sewingRecords
          .map(
            (r) => `
              <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 10px;
                margin-bottom: 2px;
                background: rgba(255,255,255,0.02);
                border-radius: 4px;
                font-size: 0.65rem;
              ">
                <span style="color:var(--gray);">${formatDateTime(
                  r.start_time
                )}</span>
                <span style="color:var(--gold-light);">${r.employees?.full_name || "-"}</span>
                <span style="color:var(--success);">${r.pieces_sewn} peças</span>
                ${
                  r.defects > 0
                    ? `<span style="color:var(--error);">${r.defects} defeitos</span>`
                    : ""
                }
              </div>
            `
          )
          .join("");

        costuraHtml = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${recordsListHtml}
          </div>
        `;
      }

      const progresso =
        totalPecas > 0
          ? Math.round(
              (items?.reduce((s, i) => s + (i.sewn_quantity || 0), 0) /
                totalPecas) *
                100
            )
          : 0;

      // ========== SEÇÕES DO MODAL ==========
      const secoes = [];

      // Seção: Grade
      if (items && items.length > 0) {
        secoes.push({
          titulo: "Grade de Tamanhos",
          icon: "ph-list-numbers",
          html: itemsHtml,
        });
      }

      // Seção: Costura
      if (sewingRecords && sewingRecords.length > 0) {
        secoes.push({
          titulo: "Apontamentos de Costura",
          icon: "ph-sewing-needle",
          badge: `${sewingRecords.length} registros`,
          html: `
            <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-bottom:8px;">
              <div style="width:${progresso}%; height:100%; background:linear-gradient(90deg, var(--gold), var(--pink)); border-radius:2px; transition:width 0.5s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--gray); margin-bottom:6px;">
              <span>Progresso: ${progresso}% costurado</span>
              <span>${items?.reduce((s, i) => s + (i.sewn_quantity || 0), 0) || 0}/${totalPecas} peças</span>
            </div>
            ${costuraHtml || '<div style="color:var(--gray);font-size:0.7rem;">Nenhum apontamento de costura</div>'}
          `,
        });
      }

      // Seção: Observações
      if (lote.notes) {
        secoes.push({
          titulo: "Observações",
          icon: "ph-note",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(
            lote.notes
          )}</div>`,
        });
      }

      // ========== AÇÕES ==========
      const acoes = [];
      
      if (lote.status === "recebido") {
        acoes.push({
          label: "Iniciar Costura",
          icon: "ph-play",
          class: "primary",
          onclick: `window.Producao.iniciarCosturaLote('${lote.id}', '${lote.order_number}')`,
        });
      }
      
      if (lote.status === "em_costura") {
        acoes.push({
          label: "Registrar Progresso",
          icon: "ph-thread",
          class: "primary",
          onclick: `window.Producao.registrarCosturaParcial('${lote.id}')`,
        });
        acoes.push({
          label: "Finalizar Costura",
          icon: "ph-check-circle",
          class: "success",
          onclick: `window.Producao.finalizarCosturaLote('${lote.id}', '${lote.order_number}')`,
        });
      }
      
      if (lote.status === "costurado") {
        acoes.push({
          label: "Marcar como Entregue",
          icon: "ph-truck",
          class: "success",
          onclick: `window.Producao.marcarEntregue('${lote.id}', '${lote.order_number}')`,
        });
      }
      
      if (lote.status === "entregue" && paymentStatus === "pendente") {
        acoes.push({
          label: `Receber ${formatCurrency(valorTotal)}`,
          icon: "ph-currency-dollar",
          class: "success",
          onclick: `window.Producao.marcarPago('${lote.id}', '${lote.order_number}')`,
        });
      }
      
      if (lote.status !== "cancelado" && lote.status !== "entregue" && lote.status !== "pago") {
        acoes.push({
          label: "Cancelar Lote",
          icon: "ph-x-circle",
          class: "warning",
          onclick: `window.Producao.cancelarLote('${lote.id}', '${lote.order_number}')`,
        });
      }
      
      acoes.push({
        label: "Editar",
        icon: "ph-pencil-simple",
        class: "ghost",
        onclick: `window.Producao.editarLote('${lote.id}')`,
      });
      
      acoes.push({
        label: "Excluir",
        icon: "ph-trash",
        class: "ghost danger",
        onclick: `window.Producao.excluirLote('${lote.id}', '${lote.order_number}')`,
      });

      // ========== CRIAR MODAL PADRONIZADO ==========
      UI.criarModalPadronizado(
        `📋 ${lote.order_number} - ${escapeHtml(lote.product_reference || "Lote")}`,
        {
          ...statusConfig,
          infoItems,
          secoes,
          acoes,
        }
      );

    } catch (e) {
      console.error("Erro ao visualizar lote:", e);
      UI.showToast("Erro", "Falha ao carregar detalhes do lote.", "error");
    }
  };

  // ============================================================
  // FUNÇÕES DE COSTURA
  // ============================================================

  /**
   * Inicia a costura de um lote
   */
  window.iniciarCosturaLote = async function (id, orderNumber) {
    const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
    if (!loginResult) {
      UI.showToast(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning"
      );
      return;
    }

    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { error } = await supabase
        .from("service_orders")
        .update({
          status: "em_costura",
          started_date: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      UI.showToast("Sucesso", `🧵 Lote ${orderNumber} em costura!`, "success");
      await carregarProducaoPeriodo();
    } catch (error) {
      console.error("Erro ao iniciar costura:", error);
      UI.showToast("Erro", "Falha ao iniciar costura.", "error");
    }
  };

  /**
   * Finaliza a costura de um lote
   */
  window.finalizarCosturaLote = async function (id, orderNumber) {
    const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
    if (!loginResult) {
      UI.showToast(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning"
      );
      return;
    }

    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { error } = await supabase
        .from("service_orders")
        .update({ status: "costurado" })
        .eq("id", id);

      if (error) throw error;

      UI.showToast(
        "Sucesso",
        `✅ Lote ${orderNumber} costurado! Aguardando entrega.`,
        "success"
      );
      await carregarProducaoPeriodo();
    } catch (error) {
      console.error("Erro ao finalizar costura:", error);
      UI.showToast("Erro", "Falha ao finalizar costura.", "error");
    }
  };

  /**
   * Registra costura parcial de um lote
   */
  window.registrarCosturaParcial = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: os, error: osError } = await supabase
        .from("service_orders")
        .select("id, order_number, total_quantity, status")
        .eq("id", id)
        .single();

      if (osError || !os) {
        UI.showToast("Erro", "OS não encontrada.", "error");
        return;
      }

      const { data: items } = await supabase
        .from("service_order_items")
        .select("*")
        .eq("service_order_id", id)
        .order("size");

      if (!items || items.length === 0) {
        UI.showToast(
          "Erro",
          "Esta OS não possui grade de tamanhos cadastrada.",
          "error"
        );
        return;
      }

      const { data: funcionarios } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("active", true)
        .order("full_name");

      const optsFuncionarios = funcionarios?.length
        ? funcionarios
            .map((f) => `<option value="${f.id}">${f.full_name}</option>`)
            .join("")
        : '<option value="">Nenhum funcionário cadastrado</option>';

      let gradeFields = "";
      items.forEach((item) => {
        const restante = item.quantity - (item.sewn_quantity || 0);
        gradeFields += `
          <div style="border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
              <strong style="font-size:0.8rem;">Tamanho: ${item.size}</strong>
              <span style="font-size:0.65rem; color:var(--gray);">Solic.: ${item.quantity} | Cost.: ${item.sewn_quantity || 0} | Rest.: ${restante}</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.6rem; color:var(--gray);">Qtd Costurada Agora</label>
                <input type="number" min="0" max="${restante}" class="form-input costura-qtd-item" data-item-id="${item.id}" value="0" style="padding:6px 8px; font-size:0.75rem;">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.6rem; color:var(--gray);">Defeitos</label>
                <input type="number" min="0" class="form-input costura-defeitos-item" data-item-id="${item.id}" value="0" style="padding:6px 8px; font-size:0.75rem;">
              </div>
            </div>
          </div>
        `;
      });

      const formHtml = `
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:12px; margin-bottom:12px;">
          <p style="font-size:0.8rem;"><strong>OS:</strong> ${os.order_number}</p>
          <p style="font-size:0.8rem;"><strong>Total de peças:</strong> ${os.total_quantity}</p>
          <p style="font-size:0.8rem;"><strong>Status atual:</strong> <span class="status-badge status-${os.status}" style="font-size:0.65rem;">${formatStatus(
        os.status
      )}</span></p>
        </div>
        <h4 style="font-size:0.85rem; margin-bottom:8px;"><i class="ph ph-thread"></i> Informar Produção</h4>
        ${gradeFields}
        <div class="form-group" style="margin-top:8px;">
          <label style="font-size:0.65rem; color:var(--gray);">Funcionário</label>
          <select id="costuraFuncionario" class="form-select" style="padding:6px 8px; font-size:0.75rem;">
            <option value="">Selecione o funcionário...</option>
            ${optsFuncionarios}
          </select>
        </div>
        <div class="form-group">
          <label style="font-size:0.65rem; color:var(--gray);">Máquina (opcional)</label>
          <input id="costuraMaquina" class="form-input" placeholder="Ex: Máquina 01, Overloque..." style="padding:6px 8px; font-size:0.75rem;">
        </div>
      `;

      UI.modalComConfirmacao(
        "Registrar Costura Parcial",
        formHtml,
        async () => {
          const funcionarioId =
            document.getElementById("costuraFuncionario")?.value || null;
          const maquina =
            document.getElementById("costuraMaquina")?.value?.trim() || null;
          let totalCosturadoAgora = 0;
          const updates = [];
          const records = [];

          document.querySelectorAll(".costura-qtd-item").forEach((input) => {
            const itemId = input.dataset.itemId;
            const qtd = parseInt(input.value) || 0;
            const defeitosInput = document.querySelector(
              `.costura-defeitos-item[data-item-id="${itemId}"]`
            );
            const defeitos = parseInt(defeitosInput?.value) || 0;
            if (qtd > 0) {
              totalCosturadoAgora += qtd;
              updates.push({ id: itemId, qtd, defeitos });
              records.push({
                service_order_item_id: itemId,
                employee_id: funcionarioId,
                pieces_sewn: qtd,
                defects: defeitos,
                machine_id: maquina,
                start_time: new Date().toISOString(),
              });
            }
          });

          if (totalCosturadoAgora === 0) {
            UI.showToast(
              "Aviso",
              "Informe pelo menos uma quantidade costurada.",
              "warning"
            );
            return;
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

          try {
            for (const u of updates) {
              const item = items.find((i) => i.id === u.id);
              const novaQtdCosturada = (item.sewn_quantity || 0) + u.qtd;
              await supabase
                .from("service_order_items")
                .update({ sewn_quantity: novaQtdCosturada })
                .eq("id", u.id);
            }

            if (records.length > 0) {
              await supabase.from("sewing_records").insert(records);
            }

            const { data: itemsAtualizados } = await supabase
              .from("service_order_items")
              .select("sewn_quantity, quantity")
              .eq("service_order_id", id);

            const totalCosturado = itemsAtualizados
              ? itemsAtualizados.reduce(
                  (sum, i) => sum + (i.sewn_quantity || 0),
                  0
                )
              : 0;

            let sugestaoConcluir = false;
            if (
              totalCosturado >= os.total_quantity &&
              os.status !== "costurado"
            ) {
              sugestaoConcluir = true;
            }

            document.getElementById("modalContainer").innerHTML = "";

            if (sugestaoConcluir) {
              UI.openConfirmModal(
                "Costura Concluída",
                `<p>O total de peças costuradas (<strong>${totalCosturado}</strong>) atingiu ou ultrapassou a quantidade do lote (<strong>${os.total_quantity}</strong>).</p><p>Deseja marcar o lote como <strong>Costurado</strong>?</p>`,
                async () => {
                  await supabase
                    .from("service_orders")
                    .update({ status: "costurado" })
                    .eq("id", id);
                  UI.showToast(
                    "Sucesso",
                    "Costura registrada e lote marcado como Costurado!",
                    "success"
                  );
                  await carregarProducaoPeriodo();
                },
                null,
                "Concluir",
                "Depois"
              );
            } else {
              UI.showToast(
                "Sucesso",
                `${totalCosturadoAgora} peça(s) registrada(s)! Total costurado: ${totalCosturado}/${os.total_quantity}`,
                "success"
              );
              await carregarProducaoPeriodo();
            }
          } catch (error) {
            console.error("Erro ao registrar costura:", error);
            UI.showToast("Erro", "Falha ao registrar costura.", "error");
          }
        },
        "520px"
      );
    } catch (e) {
      console.error("Erro ao registrar costura parcial:", e);
      UI.showToast("Erro", "Falha ao carregar dados.", "error");
    }
  };

  // ============================================================
  // FUNÇÕES DE ENTREGA E PAGAMENTO
  // ============================================================

  /**
   * Marca um lote como entregue
   */
  window.marcarEntregue = async function (id, orderNumber) {
    const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
    if (!loginResult) {
      UI.showToast(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning"
      );
      return;
    }

    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: lote } = await supabase
        .from("service_orders")
        .select("*, customers(company_name, trade_name)")
        .eq("id", id)
        .single();

      if (!lote) {
        UI.showToast("Erro", "Lote não encontrado.", "error");
        return;
      }

      const valorTotal = (lote.total_quantity || 0) * (lote.unit_price || 0);
      const clienteNome =
        lote.customers?.trade_name || lote.customers?.company_name || "Cliente";
      const descricao = `Lote ${lote.order_number} - ${lote.product_description || ""} - Ref: ${lote.product_reference || ""}`;

      const { error } = await supabase
        .from("service_orders")
        .update({
          status: "entregue",
          payment_status: "pendente",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      await criarContaReceber(
        id,
        valorTotal,
        descricao,
        lote.expected_delivery,
        clienteNome
      );

      UI.showToast("Sucesso", `📦 Lote ${orderNumber} entregue!`, "success");
      await carregarProducaoPeriodo();
    } catch (error) {
      console.error("Erro ao marcar como entregue:", error);
      UI.showToast("Erro", "Falha ao marcar lote como entregue.", "error");
    }
  };

  /**
   * Marca um lote como pago
   */
  window.marcarPago = async function (id, orderNumber) {
    const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
    if (!loginResult) {
      UI.showToast(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning"
      );
      return;
    }

    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const dataPag = todayISO();

      const { error } = await supabase
        .from("service_orders")
        .update({
          payment_status: "pago",
          payment_date: dataPag,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      // Atualizar conta a receber
      await atualizarContaReceber(id, "pago", dataPag, null);

      UI.showToast(
        "Sucesso",
        `💳 Lote ${orderNumber} marcado como pago!`,
        "success"
      );
      await carregarProducaoPeriodo();
    } catch (error) {
      console.error("Erro ao marcar como pago:", error);
      UI.showToast("Erro", "Falha ao marcar lote como pago.", "error");
    }
  };

  /**
   * Atualiza a conta a receber
   */
  async function atualizarContaReceber(
    osId,
    status,
    paymentDate,
    paymentMethod
  ) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) return;

      const { data: conta } = await supabase
        .from("financial_transactions")
        .select("id")
        .eq("service_order_id", osId)
        .eq("type", "receber")
        .maybeSingle();

      if (!conta) {
        console.warn(`⚠️ Conta a receber não encontrada para OS: ${osId}`);
        return;
      }

      const updateData = {
        status: status === "pago" ? "pago" : "pendente",
      };

      if (status === "pago") {
        updateData.payment_date = paymentDate || todayISO();
        updateData.payment_method = paymentMethod || null;
      } else {
        updateData.payment_date = null;
        updateData.payment_method = null;
      }

      await supabase
        .from("financial_transactions")
        .update(updateData)
        .eq("id", conta.id);
    } catch (e) {
      console.error("Erro ao atualizar conta a receber:", e);
    }
  }

  // ============================================================
  // FUNÇÕES DE EDIÇÃO E EXCLUSÃO
  // ============================================================

  /**
   * Edita um lote
   */
  window.editarLote = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: lote, error: fetchError } = await supabase
        .from("service_orders")
        .select("*, customers(company_name, trade_name)")
        .eq("id", id)
        .single();

      if (fetchError || !lote) {
        UI.showToast("Erro", "Lote não encontrado.", "error");
        return;
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

      const nomeCliente =
        lote.customers?.trade_name ||
        lote.customers?.company_name ||
        "Cliente não informado";

      const html = `
        <div style="display: grid; gap: 10px;">
          <h4 style="color: var(--gold-light); font-size:0.9rem;">Editar Lote ${lote.order_number}</h4>
          <div class="form-group">
            <label>Cliente</label>
            <input id="editCliente" class="form-input" value="${nomeCliente}" readonly style="opacity:0.7; background:rgba(255,255,255,0.02);">
          </div>
          <div class="form-group">
            <label>Produto</label>
            <input id="editProduto" class="form-input" value="${lote.product_description || ""}">
          </div>
          <div class="form-group">
            <label>Referência</label>
            <input id="editReferencia" class="form-input" value="${lote.product_reference || ""}">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label>Quantidade</label>
              <input id="editQtd" type="number" class="form-input" value="${lote.total_quantity}">
            </div>
            <div class="form-group">
              <label>Valor Unitário</label>
              <input id="editPreco" type="number" step="0.01" class="form-input" value="${lote.unit_price}">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label>Data Recebimento</label>
              <input id="editRecebimento" type="date" class="form-input" value="${lote.received_date || ""}">
            </div>
            <div class="form-group">
              <label>Prazo Entrega</label>
              <input id="editPrazo" type="date" class="form-input" value="${lote.expected_delivery || ""}">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label>Status de Produção</label>
              <select id="editStatus" class="form-select">
                <option value="recebido" ${
                  lote.status === "recebido" ? "selected" : ""
                }>📥 Lote Recebido</option>
                <option value="em_costura" ${
                  lote.status === "em_costura" ? "selected" : ""
                }>🧵 Em Costura</option>
                <option value="costurado" ${
                  lote.status === "costurado" ? "selected" : ""
                }>✅ Costurado</option>
                <option value="entregue" ${
                  lote.status === "entregue" ? "selected" : ""
                }>📦 Entregue</option>
                <option value="cancelado" ${
                  lote.status === "cancelado" ? "selected" : ""
                }>❌ Cancelado</option>
              </select>
            </div>
            <div class="form-group">
              <label>Status de Pagamento</label>
              <select id="editPagamento" class="form-select">
                <option value="pendente" ${
                  lote.payment_status === "pendente" || !lote.payment_status
                    ? "selected"
                    : ""
                }>⏳ Pagamento Pendente</option>
                <option value="pago" ${
                  lote.payment_status === "pago" ? "selected" : ""
                }>✅ Pagamento Recebido</option>
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" id="camposPagamento" style="${
            lote.payment_status === "pago" ? "" : "display:none;"
          }">
            <div class="form-group">
              <label>Data de Pagamento</label>
              <input id="editDataPagamento" type="date" class="form-input" value="${
                lote.payment_date || todayISO()
              }">
            </div>
            <div class="form-group">
              <label>Forma de Pagamento</label>
              <select id="editFormaPagamento" class="form-select">
                <option value="">Selecione...</option>
                <option value="PIX" ${
                  lote.payment_method === "PIX" ? "selected" : ""
                }>PIX</option>
                <option value="Boleto" ${
                  lote.payment_method === "Boleto" ? "selected" : ""
                }>Boleto</option>
                <option value="Transferência" ${
                  lote.payment_method === "Transferência" ? "selected" : ""
                }>Transferência</option>
                <option value="Dinheiro" ${
                  lote.payment_method === "Dinheiro" ? "selected" : ""
                }>Dinheiro</option>
                <option value="Cartão" ${
                  lote.payment_method === "Cartão" ? "selected" : ""
                }>Cartão</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Observações</label>
            <textarea id="editObs" class="form-input" rows="2">${
              lote.notes || ""
            }</textarea>
          </div>
        </div>
      `;

      UI.modalComConfirmacao(
        "Editar Lote",
        html,
        async () => {
          const produto = document.getElementById("editProduto").value.trim();
          const referencia = document
            .getElementById("editReferencia")
            .value.trim();
          const qtd = parseInt(document.getElementById("editQtd").value);
          const preco = parseFloat(document.getElementById("editPreco").value);
          const recebimento = document.getElementById("editRecebimento").value;
          const prazo = document.getElementById("editPrazo").value;
          const status = document.getElementById("editStatus").value;
          const paymentStatus = document.getElementById("editPagamento").value;
          const dataPagamento =
            document.getElementById("editDataPagamento").value || null;
          const formaPagamento =
            document.getElementById("editFormaPagamento").value || null;
          const obs = document.getElementById("editObs").value.trim() || null;

          if (
            !produto ||
            !referencia ||
            !qtd ||
            !preco ||
            !recebimento ||
            !prazo
          ) {
            UI.showToast(
              "Erro",
              "Preencha todos os campos obrigatórios.",
              "error"
            );
            return;
          }

          const total = qtd * preco;

          try {
            const updateData = {
              product_description: produto,
              product_reference: referencia,
              total_quantity: qtd,
              unit_price: preco,
              received_date: recebimento,
              expected_delivery: prazo,
              status: status,
              payment_status: paymentStatus,
              notes: obs,
              total: total,
            };

            if (paymentStatus === "pago") {
              updateData.payment_date = dataPagamento || todayISO();
              updateData.payment_method = formaPagamento;
            } else {
              updateData.payment_date = null;
              updateData.payment_method = null;
            }

            const { error } = await supabase
              .from("service_orders")
              .update(updateData)
              .eq("id", id);

            if (error) throw error;

            await atualizarContaReceber(
              id,
              paymentStatus,
              dataPagamento,
              formaPagamento
            );

            document.getElementById("modalContainer").innerHTML = "";
            UI.showToast(
              "Sucesso",
              `✅ Lote ${lote.order_number} atualizado!`,
              "success"
            );
            await carregarProducaoPeriodo();
          } catch (error) {
            console.error("Erro ao editar lote:", error);
            UI.showToast(
              "Erro",
              "Falha ao editar lote: " + error.message,
              "error"
            );
          }
        },
        "520px"
      );

      // Configurar evento para mostrar/ocultar campos de pagamento
      setTimeout(() => {
        document
          .getElementById("editPagamento")
          ?.addEventListener("change", function () {
            const campos = document.getElementById("camposPagamento");
            if (this.value === "pago") {
              campos.style.display = "grid";
              if (!document.getElementById("editDataPagamento").value) {
                document.getElementById("editDataPagamento").value = todayISO();
              }
            } else {
              campos.style.display = "none";
            }
          });

        if (lote.payment_status === "pago") {
          document.getElementById("camposPagamento").style.display = "grid";
        }
      }, 100);
    } catch (e) {
      console.error("Erro ao editar lote:", e);
      UI.showToast("Erro", "Falha ao carregar dados para edição.", "error");
    }
  };

  /**
   * Cancela um lote
   */
  window.cancelarLote = async function (id, orderNumber) {
    // Verificar se há pagamento
    const supabase = Supabase.getSupabaseClient
      ? Supabase.getSupabaseClient()
      : null;
    if (!supabase) {
      UI.showToast("Erro", "Cliente Supabase não disponível", "error");
      return;
    }

    const { data: conta } = await supabase
      .from("financial_transactions")
      .select("id, status, amount")
      .eq("service_order_id", id)
      .eq("type", "receber")
      .maybeSingle();

    if (conta && conta.status === "pago") {
      UI.openConfirmModal(
        "⚠️ Ação Bloqueada",
        `<p style="color:var(--error);">Não é possível cancelar este lote!</p>
         <p>Este lote já possui <strong style="color:var(--success);">pagamento confirmado</strong>.</p>
         <p style="color:var(--gray-dark);font-size:0.85rem;">Valor: ${formatCurrency(
           conta.amount
         )}</p>
         <p style="color:var(--gray);font-size:0.8rem;"><i class="ph ph-info"></i> Para cancelar, primeiro estorne o pagamento.</p>`,
        null,
        null,
        "Entendi"
      );
      return;
    }

    UI.openConfirmModal(
      "Cancelar Lote",
      `<p>Deseja cancelar o lote <strong>${orderNumber}</strong>?</p>
       <p style="color:var(--gray-dark);font-size:0.8rem;">Esta ação não pode ser desfeita.</p>`,
      async () => {
        const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
        if (!loginResult) {
          UI.showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning"
          );
          return;
        }

        try {
          if (conta && conta.status === "pendente") {
            await supabase
              .from("financial_installments")
              .delete()
              .eq("transaction_id", conta.id);
            await supabase
              .from("financial_transactions")
              .delete()
              .eq("id", conta.id);
          }

          const { error } = await supabase
            .from("service_orders")
            .update({ status: "cancelado" })
            .eq("id", id);

          if (error) throw error;

          UI.showToast(
            "Sucesso",
            `❌ Lote ${orderNumber} cancelado.`,
            "success"
          );
          await carregarProducaoPeriodo();
        } catch (error) {
          console.error("Erro ao cancelar lote:", error);
          UI.showToast("Erro", "Falha ao cancelar lote.", "error");
        }
      }
    );
  };

  /**
   * Exclui um lote
   */
  window.excluirLote = async function (id, orderNumber) {
    const supabase = Supabase.getSupabaseClient
      ? Supabase.getSupabaseClient()
      : null;
    if (!supabase) {
      UI.showToast("Erro", "Cliente Supabase não disponível", "error");
      return;
    }

    // Verificar se há pagamento
    const { data: conta } = await supabase
      .from("financial_transactions")
      .select("id, status, amount")
      .eq("service_order_id", id)
      .eq("type", "receber")
      .maybeSingle();

    if (conta && conta.status === "pago") {
      UI.openConfirmModal(
        "⚠️ Ação Bloqueada",
        `<p style="color:var(--error);">Não é possível excluir este lote!</p>
         <p>Este lote já possui <strong style="color:var(--success);">pagamento confirmado</strong>.</p>
         <p style="color:var(--gray-dark);font-size:0.85rem;">Valor: ${formatCurrency(
           conta.amount
         )}</p>
         <p style="color:var(--gray);font-size:0.8rem;"><i class="ph ph-info"></i> Para excluir, primeiro estorne o pagamento.</p>`,
        null,
        null,
        "Entendi"
      );
      return;
    }

    let mensagemAdicional = "";
    if (conta && conta.status === "pendente") {
      mensagemAdicional = `
        <div style="background: rgba(255,193,7,0.08); border-radius: 8px; padding: 12px; margin-top: 8px; border-left: 3px solid var(--warning);">
          <p style="color: var(--gray); font-size: 0.8rem; margin: 0;">
            <i class="ph ph-info"></i> A conta a receber de <strong>${formatCurrency(
              conta.amount
            )}</strong> 
            será removida automaticamente.
          </p>
        </div>
      `;
    }

    UI.openConfirmModal(
      "⚠️ Confirmar Exclusão",
      `<p>Deseja excluir o lote <strong>${orderNumber}</strong>?</p>
       <p style="color:var(--gray-dark);font-size:0.8rem;">Esta ação <strong style="color:var(--error);">não pode ser desfeita</strong>.</p>
       ${mensagemAdicional}`,
      async () => {
        const loginResult = Auth.isAutenticado ? Auth.isAutenticado() : false;
        if (!loginResult) {
          UI.showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning"
          );
          return;
        }

        try {
          if (conta) {
            await supabase
              .from("financial_installments")
              .delete()
              .eq("transaction_id", conta.id);
            await supabase
              .from("financial_transactions")
              .delete()
              .eq("id", conta.id);
          }

          const { data: items } = await supabase
            .from("service_order_items")
            .select("id")
            .eq("service_order_id", id);

          if (items && items.length > 0) {
            for (const item of items) {
              await supabase
                .from("sewing_records")
                .delete()
                .eq("service_order_item_id", item.id);
            }
            await supabase
              .from("service_order_items")
              .delete()
              .eq("service_order_id", id);
          }

          await supabase.from("shipments").delete().eq("service_order_id", id);

          await supabase
            .from("material_consumption")
            .delete()
            .eq("service_order_id", id);

          const { error } = await supabase
            .from("service_orders")
            .delete()
            .eq("id", id);

          if (error) throw error;

          UI.showToast(
            "Sucesso",
            `Lote ${orderNumber} excluído com sucesso!`,
            "success"
          );
          await carregarProducaoPeriodo();
        } catch (error) {
          console.error("Erro ao excluir lote:", error);
          UI.showToast(
            "Erro",
            "Falha ao excluir lote: " + error.message,
            "error"
          );
        }
      },
      null,
      "Excluir",
      "Cancelar"
    );
  };

  // ============================================================
  // FUNÇÕES DE FILTROS
  // ============================================================

  /**
   * Configura os filtros rápidos da produção
   */
  function configurarFiltros() {
    const filtros = document.querySelectorAll(
      "#filtrosRapidosProducao .filtro-rapido-btn"
    );

    filtros.forEach((btn) => {
      btn.addEventListener("click", function () {
        // Remover active de todos
        filtros.forEach((b) => b.classList.remove("active"));
        // Adicionar active no clicado
        this.classList.add("active");
        // Aplicar filtro
        filtroAtual = this.dataset.filtro || "todos";
        renderizarProducao(dados);
      });
    });
  }

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  /**
   * Inicializa o módulo de produção
   */
  async function init() {
    console.log("🏭 Produção: Inicializando...");

    // Configurar eventos
    const btnNovoLote = document.getElementById("btnNovoLote");
    if (btnNovoLote) {
      btnNovoLote.addEventListener("click", criarNovoLote);
    }

    // Configurar filtros
    configurarFiltros();

    // Carregar dados iniciais
    const periodo = global.App?.periodState?.producao || new Date();
    await carregarProducaoPeriodo(periodo);

    console.log("✅ Produção: Inicializado com sucesso");
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.Producao = {
    // Dados
    dados,
    carregando,
    filtroAtual,

    // Carregamento
    carregarProducaoPeriodo,

    // Renderização
    renderizarProducao,

    // CRUD
    criarNovoLote,
    editarLote: window.editarLote,
    excluirLote: window.excluirLote,
    cancelarLote: window.cancelarLote,

    // Costura
    iniciarCosturaLote: window.iniciarCosturaLote,
    finalizarCosturaLote: window.finalizarCosturaLote,
    registrarCosturaParcial: window.registrarCosturaParcial,

    // Entrega e Pagamento
    marcarEntregue: window.marcarEntregue,
    marcarPago: window.marcarPago,

    // Visualização
    visualizarLote: window.visualizarLote,

    // Filtros
    configurarFiltros,

    // Inicialização
    init,
  };

  console.log("✅ Produção exportado globalmente como window.Producao");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
