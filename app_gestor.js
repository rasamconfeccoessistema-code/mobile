// ============================================================
// APP GESTOR - FACÇÃO JEANS
// JavaScript completo para o aplicativo do gestor
// VERSÃO 2.3 - CORREÇÃO: account_id OBRIGATÓRIO
// ============================================================

(function () {
  "use strict";

  console.log("🚀 App do Gestor - Versão 2.3 com correção");

  // ============================================================
  // SUPABASE
  // ============================================================
  let supabaseLib;
  if (typeof window.supabase !== "undefined") {
    supabaseLib = window.supabase;
  } else if (typeof supabase !== "undefined") {
    supabaseLib = supabase;
  } else {
    console.warn("⚠️ Supabase não encontrado, carregando...");
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = function () {
      location.reload();
    };
    script.onerror = function () {
      document.body.innerHTML =
        '<div style="padding:40px;text-align:center;color:#ff5252;"><h2 style="color:#fff;">Erro de Conexão</h2><p style="color:#9e9e9e;">Não foi possível carregar a biblioteca Supabase.</p><button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#d4a017;border:none;border-radius:8px;color:#000;font-weight:600;cursor:pointer;">Recarregar</button></div>';
    };
    document.head.appendChild(script);
    throw new Error("Carregando Supabase...");
  }

  const SUPABASE_URL = "https://evlatdyxcgklunwvnhcv.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_tn2G-m8F7M3Ey8C0LDJLNg_9MzszdAS";

  if (typeof window.__supabaseClient === "undefined") {
    window.__supabaseClient = supabaseLib.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );
    console.log("✅ Cliente Supabase criado");
  }
  const supabase = window.__supabaseClient;

  // ============================================================
  // SISTEMA DE AUTENTICAÇÃO COM CACHE DE 5 MINUTOS
  // ============================================================

  const SESSION_DURATION = 5 * 60 * 1000; // 5 minutos em milissegundos

  let usuarioAutenticado = null;
  let sessionTimeout = null;

  // ==== CARREGAR SESSÃO DO CACHE ====
  function carregarSessao() {
    try {
      const dados = localStorage.getItem("gestor_session");
      if (dados) {
        const session = JSON.parse(dados);
        const agora = Date.now();

        if (session.timestamp && agora - session.timestamp < SESSION_DURATION) {
          usuarioAutenticado = session.usuario;
          console.log(`✅ Sessão ativa para: ${usuarioAutenticado.email}`);
          atualizarIndicadorSessao();
          return true;
        } else {
          localStorage.removeItem("gestor_session");
          console.log("⏰ Sessão expirada");
          usuarioAutenticado = null;
          atualizarIndicadorSessao();
          return false;
        }
      }
      return false;
    } catch (e) {
      console.error("Erro ao carregar sessão:", e);
      return false;
    }
  }

  // ==== SALVAR SESSÃO NO CACHE ====
  function salvarSessao(usuario) {
    const session = {
      usuario: usuario,
      timestamp: Date.now(),
    };
    localStorage.setItem("gestor_session", JSON.stringify(session));
    usuarioAutenticado = usuario;

    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
    }
    sessionTimeout = setTimeout(() => {
      console.log("⏰ Sessão expirada automaticamente");
      localStorage.removeItem("gestor_session");
      usuarioAutenticado = null;
      atualizarIndicadorSessao();
      showFeedback(
        "Sessão expirada",
        "Sua sessão expirou após 5 minutos. Faça login novamente para ações que escrevem no banco.",
        "info",
      );
    }, SESSION_DURATION);

    console.log(`💾 Sessão salva para: ${usuario.email} (expira em 5 minutos)`);
    atualizarIndicadorSessao();
  }

  // ==== LIMPAR SESSÃO (LOGOUT) ====
  function limparSessao() {
    localStorage.removeItem("gestor_session");
    usuarioAutenticado = null;
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      sessionTimeout = null;
    }
    console.log("🔒 Sessão encerrada");
    atualizarIndicadorSessao();
  }

  // ==== FAZER LOGIN COM SUPABASE AUTH ====
  async function fazerLogin(email, senha) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: senha,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.user) {
        salvarSessao({
          id: data.user.id,
          email: data.user.email,
          nome: data.user.user_metadata?.full_name || data.user.email,
        });

        return { success: true, usuario: data.user };
      }

      return { success: false, error: "Usuário não encontrado" };
    } catch (error) {
      console.error("Erro no login:", error);
      return { success: false, error: error.message };
    }
  }

  // ==== VERIFICAR SE O USUÁRIO ESTÁ AUTENTICADO ====
  function isAutenticado() {
    if (!usuarioAutenticado) {
      carregarSessao();
    }
    return !!usuarioAutenticado;
  }

  // ==== OBTER USUÁRIO ATUAL ====
  function getUsuarioAtual() {
    if (!usuarioAutenticado) {
      carregarSessao();
    }
    return usuarioAutenticado;
  }

  // ==== ATUALIZAR INDICADOR DE SESSÃO ====
  function atualizarIndicadorSessao() {
    const indicator = document.getElementById("sessionIndicator");
    const icon = document.getElementById("sessionStatusIcon");
    const text = document.getElementById("sessionStatusText");

    if (isAutenticado() && usuarioAutenticado) {
      indicator.className = "session-indicator online";
      icon.style.color = "var(--success)";
      const nomeExibicao = usuarioAutenticado.nome || usuarioAutenticado.email;
      text.textContent =
        nomeExibicao.length > 15
          ? nomeExibicao.substring(0, 14) + "…"
          : nomeExibicao;
    } else {
      indicator.className = "session-indicator offline";
      icon.style.color = "var(--gray-dark)";
      text.textContent = "Offline";
    }
  }

  // ==== MODAL DE LOGIN (APENAS PARA AÇÕES QUE ESCREVEM) ====
  function abrirModalLogin(acao) {
    return new Promise((resolve) => {
      if (isAutenticado()) {
        resolve({ success: true, usuario: usuarioAutenticado });
        return;
      }

      const html = `
        <div style="display: grid; gap: 16px; padding: 8px 0;">
          <div style="text-align: center; margin-bottom: 8px;">
            <div style="width: 56px; height: 56px; background: linear-gradient(135deg, var(--pink-dark), var(--gold-dark)); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 8px;">
              <i class="ph ph-lock-simple" style="color: white;"></i>
            </div>
            <h3 style="color: var(--gold-light); margin: 0; font-size: 1.1rem;">Confirmar Ação</h3>
            <p style="color: var(--gray); font-size: 0.85rem; margin-top: 4px;">
              Digite suas credenciais para <strong>${acao}</strong>
            </p>
            <p style="color: var(--gray-dark); font-size: 0.7rem; margin-top: 2px;">
              <i class="ph ph-info"></i> Sessão válida por 5 minutos
            </p>
          </div>

          <div id="loginModalStatus" style="color: var(--error); font-size: 0.8rem; text-align: center; min-height: 20px;"></div>

          <div class="form-group">
            <label style="color: var(--gray); font-size: 0.7rem;">📧 Email</label>
            <input id="modalLoginEmail" type="email" class="form-input" placeholder="seu@email.com" style="width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white;">
          </div>

          <div class="form-group">
            <label style="color: var(--gray); font-size: 0.7rem;">🔑 Senha</label>
            <input id="modalLoginSenha" type="password" class="form-input" placeholder="••••••••" style="width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white;">
          </div>

          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
            <button class="btn-ghost" id="cancelarLoginModal" style="padding: 8px 16px;">Cancelar</button>
            <button class="btn-primary" id="confirmarLoginModal" style="padding: 8px 20px;">
              <i class="ph ph-check-circle"></i> Confirmar
            </button>
          </div>
        </div>
      `;

      openModal("🔐 Autenticação Necessária", html);

      document
        .getElementById("cancelarLoginModal")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
          resolve({
            success: false,
            error: "Ação cancelada pelo usuário",
          });
        });

      document
        .getElementById("confirmarLoginModal")
        ?.addEventListener("click", async function () {
          const email = document.getElementById("modalLoginEmail").value.trim();
          const senha = document.getElementById("modalLoginSenha").value.trim();
          const statusEl = document.getElementById("loginModalStatus");

          if (!email || !senha) {
            statusEl.textContent = "❌ Preencha email e senha";
            return;
          }

          statusEl.textContent = "⏳ Verificando...";
          statusEl.style.color = "var(--gold-light)";
          this.disabled = true;

          const result = await fazerLogin(email, senha);

          if (result.success) {
            statusEl.textContent = `✅ Bem-vindo, ${result.usuario.user_metadata?.full_name || email}!`;
            statusEl.style.color = "var(--success)";

            document.getElementById("modalContainer").innerHTML = "";
            resolve({ success: true, usuario: usuarioAutenticado });
          } else {
            statusEl.textContent = `❌ ${result.error || "Erro ao fazer login"}`;
            statusEl.style.color = "var(--error)";
            this.disabled = false;
          }
        });

      document
        .getElementById("modalLoginEmail")
        ?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            document.getElementById("modalLoginSenha")?.focus();
          }
        });
      document
        .getElementById("modalLoginSenha")
        ?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            document.getElementById("confirmarLoginModal")?.click();
          }
        });
    });
  }

  // ============================================================
  // AUXILIARES
  // ============================================================
  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }

  function formatDate(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("pt-BR");
    } catch {
      return iso;
    }
  }

  function formatDateTime(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  }

  function formatCurrency(v) {
    if (v === null || v === undefined) v = 0;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v);
  }

  function formatStatus(s) {
    const map = {
      recebido: "📥 Recebido",
      em_costura: "🧵 Em Costura",
      costurado: "✅ Costurado",
      em_revisao: "🔍 Em Revisão",
      entregue: "📦 Entregue",
      cancelado: "❌ Cancelado",
      parcialmente_entregue: "📦 Parcialmente Entregue",
      aguardando_pagamento: "💰 Aguardando Pagamento",
      pago: "💳 Pago",
    };
    return map[s] || s || "-";
  }

  // Melhoria #1: Status de pagamento mais claro com ícones e cores
  function getPaymentStatusInfo(status) {
    const map = {
      pendente: {
        label: "⏳ Pendente",
        icon: "ph-clock",
        color: "#ffc107",
        bg: "rgba(255,193,7,0.15)",
        border: "1px solid rgba(255,193,7,0.3)",
        description: "Aguardando pagamento",
      },
      pago: {
        label: "✅ Pago",
        icon: "ph-check-circle",
        color: "#4caf50",
        bg: "rgba(76,175,80,0.15)",
        border: "1px solid rgba(76,175,80,0.3)",
        description: "Pagamento confirmado",
      },
      atrasado: {
        label: "🔴 Atrasado",
        icon: "ph-warning-circle",
        color: "#ff5252",
        bg: "rgba(255,82,82,0.15)",
        border: "1px solid rgba(255,82,82,0.3)",
        description: "Pagamento vencido",
      },
      parcial: {
        label: "🟡 Parcial",
        icon: "ph-clock",
        color: "#ff9800",
        bg: "rgba(255,152,0,0.15)",
        border: "1px solid rgba(255,152,0,0.3)",
        description: "Pagamento parcial",
      },
    };
    return map[status] || map.pendente;
  }

  // Melhoria #3: Cores por status na lista
  function getStatusColor(status) {
    const map = {
      recebido: "#9e9e9e",
      em_costura: "#2196f3",
      costurado: "#4caf50",
      em_revisao: "#ff9800",
      entregue: "#d4a017",
      cancelado: "#ff5252",
      parcialmente_entregue: "#9c27b0",
      aguardando_pagamento: "#ffc107",
      pago: "#2e7d32",
    };
    return map[status] || "#9e9e9e";
  }

  function getStatusIcon(status) {
    const map = {
      recebido: "ph-inbox",
      em_costura: "ph-sewing-needle",
      costurado: "ph-check-circle",
      em_revisao: "ph-magnifying-glass",
      entregue: "ph-truck",
      cancelado: "ph-x-circle",
      parcialmente_entregue: "ph-package",
      aguardando_pagamento: "ph-currency-dollar",
      pago: "ph-check-circle",
    };
    return map[status] || "ph-circle";
  }

  // Melhoria #10: Feedback visual - animação de pulse
  function pulseElement(element) {
    if (!element) return;
    element.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
    element.style.transform = "scale(1.05)";
    element.style.boxShadow = "0 0 20px rgba(212,160,23,0.3)";
    setTimeout(() => {
      element.style.transform = "scale(1)";
      element.style.boxShadow = "none";
    }, 300);
  }

  function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatTime() {
    return new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getMonthRange() {
    const now = new Date();
    const primeiroDia = new Date(now.getFullYear(), now.getMonth(), 1);
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      inicio: primeiroDia.toISOString().split("T")[0],
      fim: ultimoDia.toISOString().split("T")[0],
      mes: now.getMonth() + 1,
      ano: now.getFullYear(),
    };
  }

  function getProximoDiaUtil(data) {
    const d = new Date(data);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  function getStatusClass(s) {
    return "badge-status-" + s;
  }

  // ============================================================
  // MODAL FUNCTIONS
  // ============================================================
  function openModal(title, html) {
    const container = document.getElementById("modalContainer");
    container.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-sheet">
          <div class="handle"></div>
          <div class="modal-header">
            <h2><i class="ph ph-user-circle"></i> ${title}</h2>
            <button class="btn-close" id="closeModalBtn"><i class="ph ph-x"></i> Fechar</button>
          </div>
          <div class="modal-body">${html}</div>
        </div>
      </div>
    `;
    document.getElementById("closeModalBtn").addEventListener("click", () => {
      container.innerHTML = "";
    });
    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") container.innerHTML = "";
    });

    setTimeout(() => {
      if (!document.querySelector("#modalContainer .modal-footer")) {
        const footer = document.createElement("div");
        footer.className = "modal-footer";
        footer.style.cssText =
          "padding: 12px 20px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: flex-end; gap: 8px;";
        footer.innerHTML = `<button class="btn btn-primary" id="modalCloseFooter"><i class="ph ph-check"></i> Fechar</button>`;
        document
          .querySelector("#modalContainer .modal-sheet")
          .appendChild(footer);
        document
          .getElementById("modalCloseFooter")
          ?.addEventListener("click", () => {
            document.getElementById("modalContainer").innerHTML = "";
          });
      }
    }, 50);
  }

  function showFeedback(title, message, type = "info", callback = null) {
    const html = `
      <div class="modal-overlay" id="feedbackOverlay">
        <div class="modal-sheet" style="max-width:400px;">
          <div class="handle"></div>
          <div class="modal-header">
            <h2><i class="ph ph-${type === "success" ? "check-circle" : type === "error" ? "warning-circle" : "info"}"></i> ${title}</h2>
            <button class="btn-close" id="closeFeedback">
              <i class="ph ph-x"></i> Fechar
            </button>
          </div>
          <div class="modal-body">
            <p style="color:var(--text-secondary);font-size:1rem;text-align:center;padding:20px 0;">${message}</p>
            <div style="display:flex; justify-content:center; padding-top:8px;">
              <button class="btn-primary" id="feedbackOk" style="background:var(--gold);border:none;color:#fff;padding:8px 20px;border-radius:8px;font-weight:600;cursor:pointer;">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const container = document.getElementById("modalContainer");
    if (!container) return;
    container.innerHTML = html;

    const closeModal = () => {
      container.innerHTML = "";
      if (typeof callback === "function") callback();
    };

    document
      .getElementById("closeFeedback")
      ?.addEventListener("click", closeModal);
    document
      .getElementById("feedbackOk")
      ?.addEventListener("click", closeModal);
    document
      .getElementById("feedbackOverlay")
      ?.addEventListener("click", (e) => {
        if (e.target.id === "feedbackOverlay") closeModal();
      });
  }

  // ============================================================
  // GERAR EVENTOS FINANCEIROS
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
  // FUNÇÃO PARA BUSCAR CATEGORIA DE RECEITA (CORRIGIDA)
  // ============================================================
  async function obterCategoriaReceitaVenda() {
    // Primeiro tenta buscar a categoria específica de faturamento de costura
    let { data: categoria } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("type", "receita")
      .ilike("name", "%faturamento%")
      .limit(1)
      .maybeSingle();

    if (!categoria) {
      // Se não encontrar, busca qualquer categoria do tipo receita
      const { data: qualquerReceita } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("type", "receita")
        .limit(1)
        .maybeSingle();
      if (qualquerReceita) categoria = qualquerReceita;
    }

    if (!categoria) {
      console.warn("Nenhuma categoria de receita encontrada.");
      return null;
    }
    console.log(`✅ Categoria de receita encontrada: ${categoria.id}`);
    return categoria.id;
  }

  // ============================================================
  // FUNÇÃO PARA CRIAR/ATUALIZAR CONTA A RECEBER (CORRIGIDA)
  // ============================================================
  async function criarContaReceber(
    osId,
    valorTotal,
    descricao,
    dataReferencia,
    clienteNome,
    statusOS,
  ) {
    const { data: contaExistente } = await supabase
      .from("financial_transactions")
      .select("id")
      .eq("service_order_id", osId)
      .eq("type", "receber")
      .maybeSingle();

    const categoriaId = await obterCategoriaReceitaVenda();
    if (!categoriaId) {
      console.warn("⚠️ Categoria de receita não encontrada. Conta não criada.");
      return;
    }

    // O vencimento da conta a receber é a data de entrega do lote
    const dueDateStr = dataReferencia; // data de entrega do lote

    if (contaExistente) {
      const { error } = await supabase
        .from("financial_transactions")
        .update({
          amount: valorTotal,
          description: descricao,
          due_date: dueDateStr,
          account_id: categoriaId,
          category_id: categoriaId,
          notes: `Referente ao lote. Status: ${statusOS}`,
        })
        .eq("id", contaExistente.id);

      if (error) {
        console.error("❌ Erro ao atualizar conta a receber:", error);
      } else {
        console.log(
          `✅ Conta a receber atualizada para OS: ${osId} com vencimento em ${dueDateStr}`,
        );
      }
    } else {
      const { error } = await supabase.from("financial_transactions").insert({
        type: "receber",
        amount: valorTotal,
        description: descricao,
        date: new Date().toISOString().split("T")[0],
        due_date: dueDateStr,
        status: "pendente",
        account_id: categoriaId, // ← CAMPO OBRIGATÓRIO
        category_id: categoriaId, // ← CAMPO OPCIONAL
        service_order_id: osId,
        notes: `Gerado do lote. Cliente: ${clienteNome}`,
      });

      if (error) {
        console.error("❌ Erro ao criar conta a receber:", error);
      } else {
        console.log(
          `✅ Conta a receber criada para OS: ${osId} com vencimento em ${dueDateStr}`,
        );
      }
    }
  }

  // ============================================================
  // FUNÇÃO PARA ATUALIZAR CONTA A RECEBER (PAGO/PENDENTE)
  // ============================================================
  async function atualizarContaReceber(
    osId,
    status,
    paymentDate,
    paymentMethod,
  ) {
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
      updateData.payment_date =
        paymentDate || new Date().toISOString().split("T")[0];
      updateData.payment_method = paymentMethod || null;
    } else {
      updateData.payment_date = null;
      updateData.payment_method = null;
    }

    const { error } = await supabase
      .from("financial_transactions")
      .update(updateData)
      .eq("id", conta.id);

    if (error) {
      console.error("❌ Erro ao atualizar conta a receber:", error);
    } else {
      console.log(`✅ Conta a receber atualizada para status: ${status}`);
    }
  }

  // ============================================================
  // VARIÁVEIS GLOBAIS
  // ============================================================
  let abaAtual = "geral";
  let dados = {};
  let carregando = false;

  // ============================================================
  // ELEMENTOS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const appContent = $("appContent");
  const refreshIcon = $("refreshIcon");
  const pullIndicator = $("pullIndicator");
  const scrollTopBtn = $("scrollTopBtn");

  // ============================================================
  // FUNÇÃO PARA VISUALIZAR LOTE (MODAL COMPLETO - MELHORIA #7)
  // ============================================================
  window.visualizarLote = async function (id) {
    const { data: lote, error } = await supabase
      .from("service_orders")
      .select(
        `
        *, 
        customers(company_name, trade_name, contact_name, phone)
      `,
      )
      .eq("id", id)
      .single();

    if (error || !lote) {
      showFeedback("Erro", "Lote não encontrado.", "error");
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
      `,
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

    // Melhoria #1: Status de pagamento mais claro
    const paymentStatus = lote.payment_status || "pendente";
    const paymentInfo = getPaymentStatusInfo(paymentStatus);
    const statusColor = getStatusColor(lote.status);
    const statusIcon = getStatusIcon(lote.status);

    // Melhoria #7: Cabeçalho colorido no modal
    const headerColor = atrasado
      ? "#ff5252"
      : paymentStatus === "pago"
        ? "#4caf50"
        : lote.status === "em_costura"
          ? "#2196f3"
          : lote.status === "costurado"
            ? "#4caf50"
            : lote.status === "entregue"
              ? "#d4a017"
              : "#9e9e9e";

    // Grade de tamanhos
    let itemsHtml = "";
    if (items && items.length > 0) {
      itemsHtml = `
        <div style="overflow-x:auto; margin-top:8px;">
          <table style="width:100%; font-size:0.7rem; border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
              <th style="text-align:left;padding:4px;">Tamanho</th>
              <th style="text-align:center;padding:4px;">Solic.</th>
              <th style="text-align:center;padding:4px;">Cost.</th>
              <th style="text-align:center;padding:4px;">Entr.</th>
              <th style="text-align:center;padding:4px;">Pend.</th>
            </tr></thead>
            <tbody>
              ${items
                .map(
                  (item) => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:4px;"><strong>${item.size}</strong></td>
                  <td style="text-align:center;padding:4px;">${item.quantity}</td>
                  <td style="text-align:center;padding:4px;">${item.sewn_quantity || 0}</td>
                  <td style="text-align:center;padding:4px;">${item.delivered_quantity || 0}</td>
                  <td style="text-align:center;padding:4px;">${item.quantity - (item.delivered_quantity || 0)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    // Registros de costura
    let costuraHtml = "";
    if (sewingRecords && sewingRecords.length > 0) {
      costuraHtml = `
        <div style="margin-top:8px;">
          <strong style="font-size:0.75rem;">🧵 Apontamentos de Costura:</strong>
          <div style="overflow-x:auto; margin-top:4px;">
            <table style="width:100%; font-size:0.65rem; border-collapse:collapse;">
              <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                <th style="text-align:left;padding:4px;">Data</th>
                <th style="text-align:left;padding:4px;">Funcionário</th>
                <th style="text-align:center;padding:4px;">Peças</th>
                <th style="text-align:center;padding:4px;">Defeitos</th>
              </tr></thead>
              <tbody>
                ${sewingRecords
                  .map(
                    (r) => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:4px;">${formatDateTime(r.start_time)}</td>
                    <td style="padding:4px;">${r.employees?.full_name || "-"}</td>
                    <td style="text-align:center;padding:4px;">${r.pieces_sewn}</td>
                    <td style="text-align:center;padding:4px;">${r.defects || 0}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    const progresso =
      totalPecas > 0
        ? Math.round(
            ((items?.reduce((s, i) => s + (i.sewn_quantity || 0), 0) || 0) /
              totalPecas) *
              100,
          )
        : 0;

    // Melhoria #7: Modal com cabeçalho colorido e melhor organização
    const html = `
      <div style="display:grid; gap:10px;">
        <!-- Cabeçalho colorido -->
        <div style="background: ${headerColor}22; border: 2px solid ${headerColor}; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <div>
            <h4 style="color: var(--gold-light); margin: 0; font-size: 1rem;">
              <i class="ph ${statusIcon}"></i> ${lote.order_number}
            </h4>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
              <span class="status-badge status-${lote.status}" style="font-size:0.65rem;">${formatStatus(lote.status)}</span>
              ${atrasado ? '<span style="color:var(--error);font-size:0.7rem;"><i class="ph ph-warning"></i> Atrasado</span>' : ""}
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-weight:700; font-size:1.1rem; color:${paymentInfo.color};">${paymentInfo.label}</span>
            <div style="font-size:0.65rem; color:var(--gray);">${paymentInfo.description}</div>
          </div>
        </div>

        <!-- Abas melhoradas -->
        <div style="display:flex; gap:4px; overflow-x:auto; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          <button class="tab-detail-btn active" data-tab="info" style="padding:6px 12px; border:none; background:rgba(212,160,23,0.15); border-radius:8px; color:var(--gold-light); font-size:0.7rem; cursor:pointer; white-space:nowrap; transition:all 0.2s;">
            <i class="ph ph-info"></i> Info
          </button>
          <button class="tab-detail-btn" data-tab="grade" style="padding:6px 12px; border:none; background:transparent; border-radius:8px; color:var(--gray); font-size:0.7rem; cursor:pointer; white-space:nowrap; transition:all 0.2s;">
            <i class="ph ph-list-numbers"></i> Grade
          </button>
          <button class="tab-detail-btn" data-tab="costura" style="padding:6px 12px; border:none; background:transparent; border-radius:8px; color:var(--gray); font-size:0.7rem; cursor:pointer; white-space:nowrap; transition:all 0.2s;">
            <i class="ph ph-sewing-needle"></i> Costura
          </button>
          <button class="tab-detail-btn" data-tab="financeiro" style="padding:6px 12px; border:none; background:transparent; border-radius:8px; color:var(--gray); font-size:0.7rem; cursor:pointer; white-space:nowrap; transition:all 0.2s;">
            <i class="ph ph-currency-circle-dollar"></i> Financeiro
          </button>
        </div>

        <!-- Conteúdo das abas -->
        <div id="tab-info" class="tab-detail-content" style="display:block;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:0.75rem;">
            <div><strong>Cliente:</strong> ${cliente}</div>
            <div><strong>Produto:</strong> ${lote.product_description || "-"}</div>
            <div><strong>Referência:</strong> ${lote.product_reference || "-"}</div>
            <div><strong>Peças:</strong> ${totalPecas}</div>
            <div><strong>Valor Unit:</strong> ${formatCurrency(lote.unit_price)}</div>
            <div><strong>Total:</strong> ${formatCurrency(valorTotal)}</div>
            <div><strong>Recebimento:</strong> ${formatDate(lote.received_date)}</div>
            <div><strong>Entrega:</strong> ${formatDate(lote.expected_delivery)}</div>
          </div>
          ${lote.notes ? `<div style="font-size:0.7rem;color:var(--gray);margin-top:8px;"><strong>Obs:</strong> ${lote.notes}</div>` : ""}
        </div>

        <div id="tab-grade" class="tab-detail-content" style="display:none;">
          ${itemsHtml || '<div style="color:var(--gray);font-size:0.7rem;">Nenhuma grade cadastrada</div>'}
        </div>

        <div id="tab-costura" class="tab-detail-content" style="display:none;">
          <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-bottom:6px;">
            <div style="width:${progresso}%; height:100%; background:linear-gradient(90deg, var(--gold), var(--pink)); border-radius:2px; transition:width 0.5s ease;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--gray); margin-bottom:6px;">
            <span>Progresso: ${progresso}% costurado</span>
            <span>${items?.reduce((s, i) => s + (i.sewn_quantity || 0), 0) || 0}/${totalPecas} peças</span>
          </div>
          ${costuraHtml || '<div style="color:var(--gray);font-size:0.7rem;">Nenhum apontamento de costura</div>'}
        </div>

        <div id="tab-financeiro" class="tab-detail-content" style="display:none;">
          <div style="background:rgba(255,255,255,0.02); border-radius:8px; padding:12px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.75rem;">
              <div><strong>Status Pagamento:</strong></div>
              <div style="color:${paymentInfo.color};">${paymentInfo.label}</div>
              <div><strong>Valor Total:</strong></div>
              <div>${formatCurrency(valorTotal)}</div>
              ${
                paymentStatus === "pago" && lote.payment_date
                  ? `
                <div><strong>Data Pagamento:</strong></div>
                <div>${formatDate(lote.payment_date)}</div>
              `
                  : ""
              }
              ${
                lote.payment_method
                  ? `
                <div><strong>Forma Pagamento:</strong></div>
                <div>${lote.payment_method}</div>
              `
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
    `;

    openModal(`📋 ${lote.order_number}`, html);

    // Configurar abas do modal
    setTimeout(() => {
      const tabBtns = document.querySelectorAll(".tab-detail-btn");
      const tabContents = document.querySelectorAll(".tab-detail-content");

      tabBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
          const tab = this.dataset.tab;
          tabBtns.forEach((b) => {
            b.style.background = "transparent";
            b.style.color = "var(--gray)";
          });
          tabContents.forEach((c) => (c.style.display = "none"));
          this.style.background = "rgba(212,160,23,0.15)";
          this.style.color = "var(--gold-light)";
          const content = document.getElementById(`tab-${tab}`);
          if (content) content.style.display = "block";
        });
      });
    }, 100);
  };

  // ============================================================
  // REGISTRAR COSTURA PARCIAL
  // ============================================================
  window.registrarCosturaParcial = async function (id) {
    const { data: os, error } = await supabase
      .from("service_orders")
      .select("id, order_number, total_quantity, status")
      .eq("id", id)
      .single();

    if (error || !os) {
      showFeedback("Erro", "OS não encontrada.", "error");
      return;
    }

    const { data: items } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", id)
      .order("size");

    if (!items || items.length === 0) {
      showFeedback(
        "Erro",
        "Esta OS não possui grade de tamanhos cadastrada.",
        "error",
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
        <p style="font-size:0.8rem;"><strong>Status atual:</strong> <span class="status-badge status-${os.status}" style="font-size:0.65rem;">${formatStatus(os.status)}</span></p>
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

    openModal("Registrar Costura Parcial", formHtml);
    document
      .getElementById("modalContainer")
      .querySelector(".modal-header h2").innerHTML =
      '<i class="ph ph-thread"></i> Registrar Costura Parcial';

    document
      .getElementById("modalContainer")
      .querySelector(".modal-footer")
      ?.remove();

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    footer.innerHTML = `
      <button class="btn btn-ghost" id="cancelarCostura"><i class="ph ph-x"></i> Cancelar</button>
      <button class="btn btn-primary" id="salvarCostura"><i class="ph ph-check-circle"></i> Salvar</button>
    `;
    document
      .getElementById("modalContainer")
      .querySelector(".modal-sheet")
      .appendChild(footer);

    document
      .getElementById("cancelarCostura")
      ?.addEventListener("click", () => {
        document.getElementById("modalContainer").innerHTML = "";
      });

    document
      .getElementById("salvarCostura")
      ?.addEventListener("click", async function () {
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
            `.costura-defeitos-item[data-item-id="${itemId}"]`,
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
          showFeedback(
            "Aviso",
            "Informe pelo menos uma quantidade costurada.",
            "warning",
          );
          return;
        }

        const loginResult = await abrirModalLogin("registrar costura parcial");
        if (!loginResult.success) {
          showFeedback(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
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
                0,
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
            openModal(
              "Costura Concluída",
              `<p>O total de peças costuradas (<strong>${totalCosturado}</strong>) atingiu ou ultrapassou a quantidade do lote (<strong>${os.total_quantity}</strong>).</p><p>Deseja marcar o lote como <strong>Costurado</strong>?</p>`,
            );
            document
              .getElementById("modalContainer")
              .querySelector(".modal-footer")
              ?.remove();
            const footer2 = document.createElement("div");
            footer2.className = "modal-footer";
            footer2.innerHTML = `
              <button class="btn btn-ghost" id="depoisCostura"><i class="ph ph-clock"></i> Depois</button>
              <button class="btn btn-primary" id="concluirCosturaAgora"><i class="ph ph-check-circle"></i> Concluir</button>
            `;
            document
              .getElementById("modalContainer")
              .querySelector(".modal-sheet")
              .appendChild(footer2);

            document
              .getElementById("depoisCostura")
              ?.addEventListener("click", () => {
                document.getElementById("modalContainer").innerHTML = "";
                showFeedback(
                  "Sucesso",
                  "Costura registrada com sucesso!",
                  "success",
                  () => carregarDados(),
                );
              });

            document
              .getElementById("concluirCosturaAgora")
              ?.addEventListener("click", async () => {
                await supabase
                  .from("service_orders")
                  .update({ status: "costurado" })
                  .eq("id", id);
                document.getElementById("modalContainer").innerHTML = "";
                showFeedback(
                  "Sucesso",
                  "Costura registrada e lote marcado como Costurado!",
                  "success",
                  () => carregarDados(),
                );
              });
          } else {
            showFeedback(
              "Sucesso",
              `${totalCosturadoAgora} peça(s) registrada(s)! Total costurado: ${totalCosturado}/${os.total_quantity}`,
              "success",
              () => carregarDados(),
            );
          }
        } catch (error) {
          console.error("Erro ao registrar costura:", error);
          showFeedback("Erro", "Falha ao registrar costura.", "error");
        }
      });
  };

  // ============================================================
  // CRUD DE LOTES COM CONTROLE DE PAGAMENTO INTEGRADO
  // ============================================================

  // 1. NOVO LOTE
  document
    .getElementById("btnNovoLote")
    ?.addEventListener("click", function () {
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
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
            <button class="btn-ghost" id="cancelarNovoLote" style="padding: 8px 16px;">Cancelar</button>
            <button class="btn-primary" id="salvarNovoLote" style="padding: 8px 20px;">Salvar Lote</button>
          </div>
        </div>
      `;

      openModal("Novo Lote", html);

      document
        .getElementById("cancelarNovoLote")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
        });

      document
        .getElementById("salvarNovoLote")
        ?.addEventListener("click", async function () {
          const cliente = document
            .getElementById("novoLoteCliente")
            .value.trim();
          const produto = document
            .getElementById("novoLoteProduto")
            .value.trim();
          const referencia = document
            .getElementById("novoLoteReferencia")
            .value.trim();
          const qtd = parseInt(document.getElementById("novoLoteQtd").value);
          const preco = parseFloat(
            document.getElementById("novoLotePreco").value,
          );
          const recebimento = document.getElementById(
            "novoLoteRecebimento",
          ).value;
          const prazo = document.getElementById("novoLotePrazo").value;
          const obs =
            document.getElementById("novoLoteObs").value.trim() || null;

          if (
            !cliente ||
            !produto ||
            !referencia ||
            !qtd ||
            !preco ||
            !recebimento ||
            !prazo
          ) {
            showFeedback(
              "Erro",
              "Preencha todos os campos obrigatórios.",
              "error",
            );
            return;
          }

          const loginResult = await abrirModalLogin("cadastrar novo lote");

          if (!loginResult.success) {
            showFeedback(
              "Ação cancelada",
              "Você precisa estar autenticado para esta ação.",
              "warning",
            );
            return;
          }

          try {
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
              showFeedback(
                "Erro",
                "Não foi possível identificar o cliente.",
                "error",
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
              console.error("❌ Erro ao criar OS:", error);
              showFeedback(
                "Erro",
                "Falha ao criar lote: " + error.message,
                "error",
              );
              return;
            }

            await supabase.from("service_order_items").insert({
              service_order_id: novaOS.id,
              size: "Único",
              quantity: qtd,
              sewn_quantity: 0,
              delivered_quantity: 0,
            });

            // ============================================================
            // ✅ CORREÇÃO: CRIAR CONTA A RECEBER COM account_id OBRIGATÓRIO
            // ============================================================
            const descricaoConta = `Lote ${orderNumber} - ${produto}`;
            await criarContaReceber(
              novaOS.id,
              total,
              descricaoConta,
              prazo, // ← DATA DE ENTREGA como vencimento
              cliente,
              "recebido",
            );

            document.getElementById("modalContainer").innerHTML = "";

            // Melhoria #10: Feedback visual com animação
            showFeedback(
              "Sucesso",
              `Lote ${orderNumber} criado com referência ${referencia}!<br>💰 Conta a receber gerada com vencimento em ${formatDate(prazo)}.`,
              "success",
              () => carregarDados(),
            );
          } catch (error) {
            console.error("Erro ao criar lote:", error);
            showFeedback(
              "Erro",
              "Falha ao criar lote: " + error.message,
              "error",
            );
          }
        });
    });

  // ==== INICIAR COSTURA ====
  window.iniciarCosturaLote = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("iniciar costura");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    try {
      const { error } = await supabase
        .from("service_orders")
        .update({
          status: "em_costura",
          started_date: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      const card = document.querySelector(`.list-item[data-id="${id}"]`);
      if (card) pulseElement(card);

      showFeedback(
        "Sucesso",
        `🧵 Lote ${orderNumber} em costura! (por ${loginResult.usuario.email})`,
        "success",
        () => carregarDados(),
      );
    } catch (error) {
      console.error("Erro ao iniciar costura:", error);
      showFeedback("Erro", "Falha ao iniciar costura.", "error");
    }
  };

  // ==== FINALIZAR COSTURA ====
  window.finalizarCosturaLote = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("finalizar costura");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    try {
      const { error } = await supabase
        .from("service_orders")
        .update({ status: "costurado" })
        .eq("id", id);

      if (error) throw error;

      const card = document.querySelector(`.list-item[data-id="${id}"]`);
      if (card) pulseElement(card);

      showFeedback(
        "Sucesso",
        `✅ Lote ${orderNumber} costurado! Aguardando entrega.`,
        "success",
        () => carregarDados(),
      );
    } catch (error) {
      console.error("Erro ao finalizar costura:", error);
      showFeedback("Erro", "Falha ao finalizar costura.", "error");
    }
  };

  // ==== MARCAR LOTE COMO ENTREGUE ====
  window.marcarEntregue = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("marcar lote como entregue");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    try {
      const { data: lote } = await supabase
        .from("service_orders")
        .select("*, customers(company_name, trade_name)")
        .eq("id", id)
        .single();

      if (!lote) {
        showFeedback("Erro", "Lote não encontrado.", "error");
        return;
      }

      const valorTotal = lote.total_quantity * lote.unit_price;
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
        clienteNome,
        "entregue",
      );

      const card = document.querySelector(`.list-item[data-id="${id}"]`);
      if (card) pulseElement(card);

      showFeedback(
        "Sucesso",
        `📦 Lote ${orderNumber} entregue!<br>💰 Conta a receber gerada com vencimento em ${formatDate(lote.expected_delivery)}.`,
        "success",
        () => carregarDados(),
      );
    } catch (error) {
      console.error("Erro ao marcar como entregue:", error);
      showFeedback("Erro", "Falha ao marcar lote como entregue.", "error");
    }
  };

  // ==== MARCAR LOTE COMO PAGO ====
  window.marcarPago = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("marcar lote como pago");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    try {
      const dataPag = new Date().toISOString().split("T")[0];

      const { error } = await supabase
        .from("service_orders")
        .update({
          payment_status: "pago",
          payment_date: dataPag,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      await atualizarContaReceber(id, "pago", dataPag, null);

      const card = document.querySelector(`.list-item[data-id="${id}"]`);
      if (card) pulseElement(card);

      showFeedback(
        "Sucesso",
        `💳 Lote ${orderNumber} marcado como pago!`,
        "success",
        () => carregarDados(),
      );
    } catch (error) {
      console.error("Erro ao marcar como pago:", error);
      showFeedback("Erro", "Falha ao marcar lote como pago.", "error");
    }
  };

  // ==== CANCELAR LOTE ====
  window.cancelarLote = async function (id, orderNumber) {
    if (!confirm(`Cancelar o lote ${orderNumber}?`)) return;

    const loginResult = await abrirModalLogin("cancelar lote");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    try {
      const { error } = await supabase
        .from("service_orders")
        .update({ status: "cancelado" })
        .eq("id", id);

      if (error) throw error;

      const card = document.querySelector(`.list-item[data-id="${id}"]`);
      if (card) pulseElement(card);

      showFeedback(
        "Sucesso",
        `❌ Lote ${orderNumber} cancelado.`,
        "success",
        () => carregarDados(),
      );
    } catch (error) {
      console.error("Erro ao cancelar lote:", error);
      showFeedback("Erro", "Falha ao cancelar lote.", "error");
    }
  };

  // ==== EXCLUIR LOTE ====
  window.excluirLote = async function (id, orderNumber) {
    if (
      !confirm(
        `Excluir permanentemente o lote ${orderNumber}? Esta ação não pode ser desfeita.`,
      )
    )
      return;

    const loginResult = await abrirModalLogin("excluir lote permanentemente");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    if (
      !confirm(`⚠️ Confirme novamente: Excluir ${orderNumber} permanentemente?`)
    )
      return;

    try {
      await supabase
        .from("service_order_items")
        .delete()
        .eq("service_order_id", id);
      await supabase
        .from("sewing_records")
        .delete()
        .eq("service_order_item.service_order_id", id);
      await supabase.from("shipments").delete().eq("service_order_id", id);

      const { error } = await supabase
        .from("service_orders")
        .delete()
        .eq("id", id);

      if (error) throw error;

      showFeedback(
        "Sucesso",
        `🗑️ Lote ${orderNumber} excluído por ${loginResult.usuario.email}.`,
        "success",
        () => carregarDados(),
      );
    } catch (error) {
      console.error("Erro ao excluir lote:", error);
      showFeedback("Erro", "Falha ao excluir lote.", "error");
    }
  };

  // ==== EDITAR LOTE ====
  window.editarLote = async function (id) {
    const { data: lote, error: fetchError } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !lote) {
      showFeedback("Erro", "Lote não encontrado.", "error");
      return;
    }

    const loginResult = await abrirModalLogin("editar lote");

    if (!loginResult.success) {
      showFeedback(
        "Ação cancelada",
        "Você precisa estar autenticado.",
        "warning",
      );
      return;
    }

    const html = `
      <div style="display: grid; gap: 10px;">
        <h4 style="color: var(--gold-light); font-size:0.9rem;">Editar Lote ${lote.order_number}</h4>
        <div class="form-group">
          <label>Cliente</label>
          <input id="editCliente" class="form-input" value="${lote.customers?.trade_name || lote.customers?.company_name || ""}" readonly style="opacity:0.7; background:rgba(255,255,255,0.02);">
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
              <option value="recebido" ${lote.status === "recebido" ? "selected" : ""}>📥 Recebido</option>
              <option value="em_costura" ${lote.status === "em_costura" ? "selected" : ""}>🧵 Em Costura</option>
              <option value="costurado" ${lote.status === "costurado" ? "selected" : ""}>✅ Costurado</option>
              <option value="entregue" ${lote.status === "entregue" ? "selected" : ""}>📦 Entregue</option>
              <option value="cancelado" ${lote.status === "cancelado" ? "selected" : ""}>❌ Cancelado</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status de Pagamento</label>
            <select id="editPagamento" class="form-select">
              <option value="pendente" ${lote.payment_status === "pendente" || !lote.payment_status ? "selected" : ""}>⏳ Pendente</option>
              <option value="pago" ${lote.payment_status === "pago" ? "selected" : ""}>✅ Pago</option>
            </select>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" id="camposPagamento" style="${lote.payment_status === "pago" ? "" : "display:none;"}">
          <div class="form-group">
            <label>Data de Pagamento</label>
            <input id="editDataPagamento" type="date" class="form-input" value="${lote.payment_date || todayISO()}">
          </div>
          <div class="form-group">
            <label>Forma de Pagamento</label>
            <select id="editFormaPagamento" class="form-select">
              <option value="">Selecione...</option>
              <option value="PIX" ${lote.payment_method === "PIX" ? "selected" : ""}>PIX</option>
              <option value="Boleto" ${lote.payment_method === "Boleto" ? "selected" : ""}>Boleto</option>
              <option value="Transferência" ${lote.payment_method === "Transferência" ? "selected" : ""}>Transferência</option>
              <option value="Dinheiro" ${lote.payment_method === "Dinheiro" ? "selected" : ""}>Dinheiro</option>
              <option value="Cartão" ${lote.payment_method === "Cartão" ? "selected" : ""}>Cartão</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Observações</label>
          <textarea id="editObs" class="form-input" rows="2">${lote.notes || ""}</textarea>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
          <button class="btn-ghost" id="cancelarEdit" style="padding: 8px 16px;">Cancelar</button>
          <button class="btn-primary" id="salvarEdit" style="padding: 8px 20px;">Salvar</button>
        </div>
      </div>
    `;

    openModal("Editar Lote", html);

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

    document.getElementById("cancelarEdit")?.addEventListener("click", () => {
      document.getElementById("modalContainer").innerHTML = "";
    });

    document
      .getElementById("salvarEdit")
      ?.addEventListener("click", async function () {
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
          showFeedback(
            "Erro",
            "Preencha todos os campos obrigatórios.",
            "error",
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
            formaPagamento,
          );

          document.getElementById("modalContainer").innerHTML = "";

          const card = document.querySelector(`.list-item[data-id="${id}"]`);
          if (card) pulseElement(card);

          showFeedback(
            "Sucesso",
            `✅ Lote ${lote.order_number} atualizado!`,
            "success",
            () => carregarDados(),
          );
        } catch (error) {
          console.error("Erro ao editar lote:", error);
          showFeedback(
            "Erro",
            "Falha ao editar lote: " + error.message,
            "error",
          );
        }
      });
  };

  // ============================================================
  // RENDERIZAR LISTA DE LOTES
  // ============================================================
  function renderizarProducao(dados) {
    const { osAtivas, emCostura, costurados } = dados;

    document.getElementById("prodEmCostura").textContent = emCostura;
    document.getElementById("prodCosturados").textContent = costurados;

    const hoje = new Date();
    const atrasados = osAtivas.filter((o) => {
      if (!o.expected_delivery) return false;
      const prazo = new Date(o.expected_delivery);
      return prazo < hoje && !["cancelado"].includes(o.status);
    }).length;

    const aguardandoPagto = osAtivas.filter(
      (o) => o.status === "entregue" && o.payment_status !== "pago",
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

    document.getElementById("prodAtrasados").textContent = atrasados;
    document.getElementById("prodAguardandoPagto").textContent =
      aguardandoPagto;
    document.getElementById("prodEntreguesHoje").textContent = entreguesHoje;
    document.getElementById("prodPagos").textContent = pagos;

    const container = document.getElementById("listaProducao");
    document.getElementById("totalLotes").textContent =
      (osAtivas || []).length + " lotes";

    if (osAtivas && osAtivas.length > 0) {
      container.innerHTML = osAtivas
        .sort(
          (a, b) =>
            new Date(a.expected_delivery) - new Date(b.expected_delivery),
        )
        .map((os) => {
          const cliente =
            os.customers?.trade_name || os.customers?.company_name || "-";
          const atrasado =
            new Date(os.expected_delivery) < new Date() &&
            !["cancelado"].includes(os.status);

          const paymentStatus = os.payment_status || "pendente";
          const paymentInfo = getPaymentStatusInfo(paymentStatus);
          const statusColor = getStatusColor(os.status);
          const statusIcon = getStatusIcon(os.status);

          const prog = dados.progressoMap?.[os.id] || {
            total: os.total_quantity,
            costurado: 0,
            entregue: 0,
          };
          const percentCosturado =
            prog.total > 0
              ? Math.round((prog.costurado / prog.total) * 100)
              : 0;
          const percentEntregue =
            prog.total > 0 ? Math.round((prog.entregue / prog.total) * 100) : 0;

          const progressoHtml = `
            <div style="font-size:0.65rem; color:var(--gray); margin-top:3px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span>🧵 Costurado: ${prog.costurado}/${prog.total}</span>
                <span>📦 Entregue: ${prog.entregue}/${prog.total}</span>
              </div>
              <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-bottom:2px;">
                <div style="height:100%; width:${percentCosturado}%; background:var(--gold); border-radius:3px; transition:width 0.5s ease;"></div>
              </div>
              <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${percentEntregue}%; background:var(--pink); border-radius:3px; transition:width 0.5s ease;"></div>
              </div>
              <div style="display:flex; justify-content:space-between; margin-top:2px;">
                <span style="font-size:0.55rem; color:var(--gray-dark);">Progresso: ${percentCosturado}% costurado</span>
                ${atrasado ? '<span style="font-size:0.55rem; color:var(--error);"><i class="ph ph-warning"></i> Atrasado</span>' : ""}
              </div>
            </div>
          `;

          const valorTotal = os.total_quantity * os.unit_price;

          let botoes = "";
          if (os.status === "recebido") {
            botoes = `
              <button class="btn-action btn-action-primary" onclick="iniciarCosturaLote('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-play"></i> Iniciar Costura
              </button>
              <button class="btn-action btn-action-ghost" onclick="editarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="btn-action btn-action-ghost" onclick="visualizarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-eye"></i>
              </button>
              <button class="btn-action btn-action-danger" onclick="excluirLote('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-trash"></i>
              </button>
            `;
          } else if (os.status === "em_costura") {
            const pctText =
              percentCosturado > 0 ? ` (${percentCosturado}%)` : "";
            botoes = `
              <button class="btn-action btn-action-ghost" onclick="registrarCosturaParcial('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-thread"></i> Registrar
              </button>
              <button class="btn-action btn-action-success" onclick="finalizarCosturaLote('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-check-circle"></i> Finalizar${pctText}
              </button>
              <button class="btn-action btn-action-ghost" onclick="editarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="btn-action btn-action-ghost" onclick="visualizarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-eye"></i>
              </button>
              <button class="btn-action btn-action-warning" onclick="cancelarLote('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-x-circle"></i>
              </button>
            `;
          } else if (os.status === "costurado") {
            botoes = `
              <button class="btn-action btn-action-success" onclick="marcarEntregue('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-truck"></i> Entregar
              </button>
              <button class="btn-action btn-action-ghost" onclick="editarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="btn-action btn-action-ghost" onclick="visualizarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-eye"></i>
              </button>
              <button class="btn-action btn-action-warning" onclick="cancelarLote('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-x-circle"></i>
              </button>
            `;
          } else if (os.status === "entregue") {
            if (paymentStatus === "pendente") {
              const totalPendente = valorTotal;
              botoes = `
                <button class="btn-action btn-action-payment" onclick="marcarPago('${os.id}', '${os.order_number}')" style="padding:6px 14px; background:rgba(76,175,80,0.2); color:#a5d6a7; border:1px solid rgba(76,175,80,0.3);">
                  <i class="ph ph-currency-dollar"></i> Receber R$ ${formatCurrency(totalPendente)}
                </button>
                <button class="btn-action btn-action-ghost" onclick="editarLote('${os.id}')" style="padding:6px 14px;">
                  <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="btn-action btn-action-ghost" onclick="visualizarLote('${os.id}')" style="padding:6px 14px;">
                  <i class="ph ph-eye"></i>
                </button>
              `;
            } else {
              botoes = `
                <span style="font-size:0.65rem; color:var(--success); padding:4px 12px; background:rgba(76,175,80,0.1); border-radius:20px;">
                  <i class="ph ph-check-circle"></i> Recebido
                </span>
                <button class="btn-action btn-action-ghost" onclick="editarLote('${os.id}')" style="padding:6px 14px;">
                  <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="btn-action btn-action-ghost" onclick="visualizarLote('${os.id}')" style="padding:6px 14px;">
                  <i class="ph ph-eye"></i>
                </button>
              `;
            }
          } else if (os.status === "cancelado") {
            botoes = `
              <span style="font-size:0.65rem; color:var(--error); padding:4px 12px; background:rgba(255,82,82,0.1); border-radius:20px;">
                <i class="ph ph-x-circle"></i> Cancelado
              </span>
              <button class="btn-action btn-action-ghost" onclick="visualizarLote('${os.id}')" style="padding:6px 14px;">
                <i class="ph ph-eye"></i>
              </button>
              <button class="btn-action btn-action-danger" onclick="excluirLote('${os.id}', '${os.order_number}')" style="padding:6px 14px;">
                <i class="ph ph-trash"></i>
              </button>
            `;
          } else {
            botoes = `<span style="font-size:0.65rem; color:var(--gray);">${formatStatus(os.status)}</span>`;
          }

          const referencia = os.product_reference
            ? ` · Ref: ${os.product_reference}`
            : "";

          const borderColor = atrasado ? "#ff5252" : statusColor;
          const bgColor = atrasado
            ? "rgba(255,82,82,0.05)"
            : "rgba(255,255,255,0.02)";

          return `
            <div class="list-item ${atrasado ? "item-vencido" : ""}" 
                 data-id="${os.id}"
                 style="display: flex; flex-direction: column; align-items: stretch; padding: 12px 14px; 
                        border-bottom: 1px solid rgba(255,255,255,0.03); gap: 8px;
                        border-left: 4px solid ${borderColor};
                        background: ${bgColor};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">
                <div style="flex: 1; min-width: 0;">
                  <div class="item-title" style="font-size: 14px; font-weight: 600; color: ${atrasado ? "var(--error)" : "var(--white)"}; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <i class="ph ${statusIcon}" style="color: ${statusColor};"></i>
                    ${os.order_number}
                    <span style="font-size:0.6rem; color:${statusColor}; background:${statusColor}22; padding:2px 10px; border-radius:12px; border:1px solid ${statusColor}44;">
                      ${formatStatus(os.status)}
                    </span>
                    <span style="font-size:0.6rem; color:${paymentInfo.color}; background:${paymentInfo.bg}; padding:2px 10px; border-radius:12px; border:${paymentInfo.border};">
                      <i class="ph ${paymentInfo.icon}"></i> ${paymentInfo.label}
                    </span>
                  </div>
                  <div class="item-sub" style="font-size: 10px; color: var(--gray-dark); margin-top: 2px;">
                    ${cliente} · ${os.total_quantity || 0} peças · ${formatCurrency(os.unit_price || 0)}/un${referencia}
                    ${os.expected_delivery ? ` · 📅 Entrega: ${formatDate(os.expected_delivery)}` : ""}
                    ${atrasado ? ` ⚠️ Atrasado` : ""}
                  </div>
                  ${progressoHtml}
                  <div style="font-size:0.6rem; color:var(--gray-dark); margin-top:3px; display:flex; gap:12px; flex-wrap:wrap;">
                    <span>💰 Total: ${formatCurrency(valorTotal)}</span>
                    ${paymentStatus === "pago" && os.payment_date ? ` · 📅 Pago em: ${formatDate(os.payment_date)}` : ""}
                    ${paymentStatus === "pendente" && os.status === "entregue" ? ` · ⏳ Aguardando pagamento` : ""}
                  </div>
                  ${os.notes ? `<div style="font-size:0.55rem; color:var(--gray); margin-top:2px;">📝 ${os.notes}</div>` : ""}
                </div>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; margin-top: 4px;">
                ${botoes}
              </div>
            </div>
          `;
        })
        .join("");
    } else {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 30px 16px; color: var(--gray-dark);">
          <i class="ph ph-factory" style="font-size: 32px; display: block; margin-bottom: 8px; color: var(--gray);"></i>
          <p style="font-size: 13px;">Nenhum lote cadastrado</p>
          <p style="font-size: 11px; color: var(--gray);">Clique em "Novo Lote" para começar</p>
        </div>
      `;
    }
  }

  // ============================================================
  // RENDERIZAR - ABA GERAL (DASHBOARD)
  // ============================================================
  function renderizarGeral(dados) {
    const {
      osAtivas,
      eventosFinanceiros,
      totalReceitas,
      totalDespesas,
      contasVencidas,
      ferias,
      dividas,
      saldoDevedor,
      mesRange,
    } = dados;

    const saldo = totalReceitas - totalDespesas;

    const agora = new Date();
    $("statusTime").textContent = formatTime();
    $("statusDate").textContent = agora.toLocaleDateString("pt-BR");
    $("headerHora").textContent = formatTime();
    $("headerData").textContent = agora.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });

    $("kpiEmProducao").textContent = (osAtivas || []).length;
    $("kpiContasVencidas").textContent = contasVencidas;
    $("kpiFerias").textContent = (ferias || []).length;
    $("kpiSaldoMes").textContent = formatCurrency(saldo);
    $("kpiEntregasMes").textContent =
      osAtivas.filter((o) => o.status === "entregue").length || 0;
    $("kpiDividasAtivas").textContent = formatCurrency(saldoDevedor);

    const maxDivida = Math.max(saldoDevedor, 1000);
    const pct = Math.min(Math.round((saldoDevedor / maxDivida) * 100), 100);
    const circumference = 188.5;
    const offset = circumference - (pct / 100) * circumference;
    const gaugeFill = document.getElementById("gaugeFill");
    gaugeFill.style.strokeDashoffset = offset;
    document.getElementById("gaugePercent").textContent = pct + "%";

    const alertas = [];
    if (contasVencidas > 0)
      alertas.push({
        prioridade: "high",
        icone: "ph-currency-circle-dollar",
        texto: `${contasVencidas} conta(s) vencida(s) no mês`,
        tag: "urgente",
      });
    const divAtivas = (dividas || []).filter(
      (d) => d.status !== "quitada",
    ).length;
    if (divAtivas > 0)
      alertas.push({
        prioridade: "medium",
        icone: "ph-warning",
        texto: `${divAtivas} dívida(s) ativa(s) em aberto`,
        tag: "atenção",
      });
    if ((ferias || []).length > 0)
      alertas.push({
        prioridade: "medium",
        icone: "ph-sun",
        texto: `${ferias.length} funcionário(s) em férias`,
        tag: "atenção",
      });
    if ((osAtivas || []).length === 0)
      alertas.push({
        prioridade: "low",
        icone: "ph-factory",
        texto: "Nenhuma OS em produção no mês",
        tag: "info",
      });

    $("alertasCount").textContent = alertas.length;
    const container = $("alertasContainer");
    if (alertas.length === 0) {
      container.innerHTML = `<div class="alert-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
        <i class="ph ph-check-circle" style="color:var(--success);font-size:14px;flex-shrink:0;"></i>
        <span style="flex:1;color:var(--gray);">Tudo em dia! ✅</span>
      </div>`;
    } else {
      container.innerHTML = alertas
        .map(
          (a) =>
            `<div class="alert-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
              <i class="ph ${a.icone}" style="color:${a.prioridade === "high" ? "var(--error)" : a.prioridade === "medium" ? "var(--warning)" : "var(--info)"};font-size:14px;flex-shrink:0;"></i>
              <span style="flex:1;color:var(--gray);">${a.texto}</span>
              <span class="alert-tag ${a.prioridade === "high" ? "tag-high" : a.prioridade === "medium" ? "tag-medium" : "tag-low"}">${a.tag}</span>
            </div>`,
        )
        .join("");
    }

    const maxValor = Math.max(totalReceitas, totalDespesas, 1);
    const pctReceita = Math.round((totalReceitas / maxValor) * 100);
    const pctDespesa = Math.round((totalDespesas / maxValor) * 100);

    document.getElementById("barReceita").style.width =
      Math.min(pctReceita, 100) + "%";
    document.getElementById("barDespesa").style.width =
      Math.min(pctDespesa, 100) + "%";
    document.getElementById("valorReceita").textContent =
      formatCurrency(totalReceitas);
    document.getElementById("valorDespesa").textContent =
      formatCurrency(totalDespesas);
    document.getElementById("saldoFinal").textContent = formatCurrency(saldo);

    const mesNome = new Date().toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    document.getElementById("resumoPeriodo").textContent = mesNome;
  }

  // ============================================================
  // RENDERIZAR - ABA FINANCEIRO
  // ============================================================
  function renderizarFinanceiro(dados) {
    const { eventosFinanceiros, totalPagar, totalReceber } = dados;

    document.getElementById("finTotalPagar").textContent =
      formatCurrency(totalPagar);
    document.getElementById("finTotalReceber").textContent =
      formatCurrency(totalReceber);

    let saldoMes = 0;
    let contasVencidas = 0;
    const hoje = new Date();

    for (const e of eventosFinanceiros) {
      if (e.tipo === "receber") {
        saldoMes += e.valor;
      } else {
        saldoMes -= e.valor;
      }
      if (e.status === "pendente" && new Date(e.vencimento) < hoje) {
        contasVencidas++;
      }
    }

    document.getElementById("finSaldoMes").textContent =
      formatCurrency(saldoMes);
    document.getElementById("finContasVencidas").textContent = contasVencidas;

    const container = document.getElementById("listaFinanceiro");
    document.getElementById("totalLancamentos").textContent =
      (eventosFinanceiros || []).length + " contas";

    if (eventosFinanceiros && eventosFinanceiros.length > 0) {
      container.innerHTML = eventosFinanceiros
        .slice(0, 15)
        .map((e) => {
          const isPagar = e.tipo === "pagar";
          const vencido =
            e.status === "pendente" && new Date(e.vencimento) < new Date();
          const pago = e.status === "pago" || e.status === "recebido";

          let classeItem = "";
          let cor = "";
          if (pago) {
            classeItem = "item-pago";
            cor = "var(--success)";
          } else if (vencido) {
            classeItem = "item-vencido";
            cor = "var(--error)";
          } else {
            cor = "var(--white)";
          }

          const statusClass = pago ? "pago" : vencido ? "vencido" : "pendente";
          const parcelaInfo = e.isParcela
            ? `Parcela ${e.numero_parcela}/${e.total_parcelas}`
            : "Avulsa";

          return `<div class="list-item ${classeItem}" onclick="abrirModalConta('${e.id}')" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:pointer;${pago ? "border-left:3px solid var(--success);background:rgba(76,175,80,0.05);" : ""}${vencido ? "border-left:3px solid var(--error);background:rgba(255,82,82,0.05);" : ""}">
            <div class="item-main" style="flex:1;min-width:0;">
              <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${cor};">${e.descricao}</div>
              <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${formatDate(e.vencimento)} ${e.isParcela ? `· ${parcelaInfo}` : ""}</div>
            </div>
            <div class="item-right" style="text-align:right;flex-shrink:0;">
              <span class="item-badge badge-status-${statusClass}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">${pago ? "✅ Pago" : vencido ? "🔴 Vencido" : "🟡 Pendente"}</span>
              <div class="item-value ${isPagar ? "item-error" : "item-success"}" style="font-size:14px;font-weight:700;color:${cor};">${isPagar ? "-" : "+"}${formatCurrency(e.valor)}</div>
            </div>
          </div>`;
        })
        .join("");
    } else {
      container.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);"><i class="ph ph-currency-circle-dollar" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i><p style="font-size:12px;">Nenhuma conta no mês</p></div>`;
    }
  }

  // ============================================================
  // RENDERIZAR - ABA RH
  // ============================================================
  function renderizarRH(dados) {
    const { funcionarios, ferias } = dados;

    const totalFuncionarios = funcionarios?.length || 0;
    const emFerias = ferias?.length || 0;

    document.getElementById("rhTotalFuncionarios").textContent =
      totalFuncionarios;
    document.getElementById("rhEmFerias").textContent = emFerias;

    const containerFerias = document.getElementById("listaRHFerias");
    document.getElementById("totalFerias").textContent =
      (ferias || []).length + " registros";

    if (ferias && ferias.length > 0) {
      containerFerias.innerHTML = ferias
        .slice(0, 10)
        .map((f) => {
          const func = f.employees;
          const dataRetorno = getProximoDiaUtil(f.end_date);
          return `<div class="list-item" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:default;">
            <div class="item-main" style="flex:1;min-width:0;">
              <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${func?.full_name || "-"} 🌴</div>
              <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${func?.role || "-"} · Retorno: ${formatDate(dataRetorno.toISOString())}</div>
            </div>
            <div class="item-right" style="text-align:right;flex-shrink:0;">
              <span class="item-badge badge-status-em_costura" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">Em Gozo</span>
              <div style="font-size:9px;color:var(--gray-dark);">${formatDate(f.start_date)} - ${formatDate(f.end_date)}</div>
            </div>
          </div>`;
        })
        .join("");
    } else {
      containerFerias.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);"><i class="ph ph-sun" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i><p style="font-size:12px;">Nenhum funcionário em férias</p></div>`;
    }

    const containerFunc = document.getElementById("listaRHFuncionarios");
    document.getElementById("totalFuncionariosRH").textContent =
      (funcionarios || []).length + " funcionários";

    if (funcionarios && funcionarios.length > 0) {
      containerFunc.innerHTML = funcionarios
        .slice(0, 15)
        .map((f) => {
          const emFeriasCheck = (ferias || []).some(
            (ff) => ff.employee_id === f.id,
          );
          return `<div class="list-item ${emFeriasCheck ? "item-warning" : ""}" data-id="${f.id}" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:pointer;">
            <div class="item-main" style="flex:1;min-width:0;">
              <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${emFeriasCheck ? "color:var(--warning);" : ""}">${f.full_name}${emFeriasCheck ? " 🌴" : ""}</div>
              <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${f.role || "-"} · ${f.contract_type === "clt" ? "CLT" : "Diarista"}</div>
            </div>
            <div class="item-right" style="text-align:right;flex-shrink:0;">
              <span class="item-badge ${emFeriasCheck ? "badge-status-em_costura" : "badge-status-entregue"}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">${emFeriasCheck ? "De Férias" : "Ativo"}</span>
            </div>
          </div>`;
        })
        .join("");

      containerFunc.querySelectorAll(".list-item[data-id]").forEach((el) => {
        el.addEventListener("click", function () {
          const id = this.dataset.id;
          const func = funcionarios.find((f) => f.id == id);
          if (func) abrirModalFuncionario(func, ferias);
        });
      });
    } else {
      containerFunc.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);"><i class="ph ph-users" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i><p style="font-size:12px;">Nenhum funcionário ativo</p></div>`;
    }
  }

  // ============================================================
  // ABRIR MODAL FUNCIONÁRIO
  // ============================================================
  function abrirModalFuncionario(func, ferias) {
    const emFerias = (ferias || []).find((f) => f.employee_id === func.id);
    const fotoHtml = func.photo_url
      ? `<img src="${func.photo_url}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);">`
      : `<div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;background:linear-gradient(135deg,var(--pink-dark),var(--gold-dark));color:#fff;">${getInitials(func.full_name)}</div>`;

    let feriasHtml =
      '<div class="info-row"><span class="label">Férias</span><span class="value">Nenhuma férias em andamento</span></div>';
    if (emFerias) {
      const dataRetorno = getProximoDiaUtil(emFerias.end_date);
      feriasHtml = `
        <div class="info-row"><span class="label">Férias</span><span class="value gold">🟡 Em andamento</span></div>
        <div class="info-row"><span class="label">Período</span><span class="value">${formatDate(emFerias.start_date)} a ${formatDate(emFerias.end_date)}</span></div>
        <div class="info-row"><span class="label">Retorno</span><span class="value success">${formatDate(dataRetorno.toISOString())}</span></div>
      `;
    }

    const html = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.06);">
        ${fotoHtml}
        <div>
          <h3 style="font-size:1.1rem;">${func.full_name}</h3>
          <p style="color:var(--gold-light);font-size:0.85rem;">${func.role || "Sem função"}</p>
          <p style="font-size:0.75rem;color:${func.active ? "var(--success)" : "var(--error)"};">${func.active ? "🟢 Ativo" : "🔴 Inativo"}</p>
        </div>
      </div>
      <div class="info-row"><span class="label">CPF</span><span class="value">${func.cpf || "-"}</span></div>
      <div class="info-row"><span class="label">Celular</span><span class="value">${func.phone_cell || "-"}</span></div>
      <div class="info-row"><span class="label">E-mail</span><span class="value">${func.email_personal || "-"}</span></div>
      <div class="info-row"><span class="label">Contrato</span><span class="value">${func.contract_type === "clt" ? "CLT" : "Diarista"}</span></div>
      <div class="info-row"><span class="label">Salário</span><span class="value gold">${func.contract_type === "clt" ? formatCurrency(func.monthly_salary) : formatCurrency(func.daily_rate) + "/dia"}</span></div>
      <div class="info-row"><span class="label">Admissão</span><span class="value">${formatDate(func.admission_date)}</span></div>
      ${feriasHtml}
      ${func.notes ? `<div class="info-row" style="flex-direction:column;gap:4px;"><span class="label">Observações</span><span class="value" style="font-size:0.85rem;color:var(--gray);">${func.notes}</span></div>` : ""}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.7rem;color:var(--gray-dark);text-align:center;">ID: ${func.id}</div>
      </div>
    `;

    openModal(func.full_name, html);
  }

  // ============================================================
  // ABRIR MODAL CONTA
  // ============================================================
  window.abrirModalConta = function (id) {
    const evento = dados.eventosFinanceiros?.find((e) => e.id === id);
    if (!evento) {
      showFeedback("Erro", "Conta não encontrada.", "error");
      return;
    }

    const isPagar = evento.tipo === "pagar";
    const vencido =
      evento.status === "pendente" && new Date(evento.vencimento) < new Date();
    const pago = evento.status === "pago" || evento.status === "recebido";

    let statusText = "";
    let statusColor = "";
    if (pago) {
      statusText = "✅ Pago";
      statusColor = "var(--success)";
    } else if (vencido) {
      statusText = "🔴 Vencido";
      statusColor = "var(--error)";
    } else {
      statusText = "🟡 Pendente";
      statusColor = "var(--warning)";
    }

    let parcelasHtml = "";
    if (evento.isParcela && evento.parcela_original) {
      parcelasHtml = `
        <div class="info-row"><span class="label">Parcela</span><span class="value">${evento.numero_parcela}/${evento.total_parcelas}</span></div>
        ${evento.interest_paid ? `<div class="info-row"><span class="label">Juros pagos</span><span class="value">${formatCurrency(evento.interest_paid)}</span></div>` : ""}
        ${evento.late_fee_paid ? `<div class="info-row"><span class="label">Multa paga</span><span class="value">${formatCurrency(evento.late_fee_paid)}</span></div>` : ""}
      `;
    }

    const html = `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:1.1rem;color:var(--gold-light);">${evento.descricao}</h3>
        <p style="color:var(--gray);font-size:0.85rem;">${evento.categoria || "Sem categoria"}</p>
        <p style="color:${statusColor};font-weight:600;font-size:0.9rem;margin-top:4px;">${statusText}</p>
      </div>
      <div class="info-row"><span class="label">Valor</span><span class="value gold">${formatCurrency(evento.valor)}</span></div>
      <div class="info-row"><span class="label">Vencimento</span><span class="value">${formatDate(evento.vencimento)}</span></div>
      <div class="info-row"><span class="label">Tipo</span><span class="value ${isPagar ? "danger" : "success"}">${isPagar ? "A Pagar" : "A Receber"}</span></div>
      ${evento.payment_method ? `<div class="info-row"><span class="label">Forma de Pagamento</span><span class="value">${evento.payment_method}</span></div>` : ""}
      ${parcelasHtml}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.7rem;color:var(--gray-dark);text-align:center;">ID: ${evento.id}</div>
      </div>
    `;

    openModal("Detalhes da Conta", html);
  };

  // ============================================================
  // ABRIR MODAL DÍVIDA
  // ============================================================
  function abrirModalDivida(div) {
    const total = div.total_amount || 0;
    const pago = div.paid_amount || 0;
    const percentual = total > 0 ? Math.round((pago / total) * 100) : 0;
    const restante = total - pago;

    let statusText = div.status === "quitada" ? "✅ Quitada" : "🟡 Ativa";
    let statusColor =
      div.status === "quitada" ? "var(--success)" : "var(--gold-light)";

    const html = `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:1.1rem;color:var(--gold-light);">${div.credor || "Credor não informado"}</h3>
        <p style="color:var(--gray);font-size:0.85rem;">${div.description || "Sem descrição"}</p>
        <p style="color:${statusColor};font-weight:600;font-size:0.9rem;margin-top:4px;">${statusText}</p>
      </div>
      <div class="info-row"><span class="label">Valor Total</span><span class="value gold">${formatCurrency(total)}</span></div>
      <div class="info-row"><span class="label">Valor Pago</span><span class="value success">${formatCurrency(pago)}</span></div>
      <div class="info-row"><span class="label">Saldo Restante</span><span class="value ${restante > 0 ? "danger" : "success"}">${formatCurrency(restante)}</span></div>
      <div class="info-row"><span class="label">Progresso</span><span class="value">${percentual}%</span></div>
      ${div.next_due_date ? `<div class="info-row"><span class="label">Próximo Vencimento</span><span class="value">${formatDate(div.next_due_date)}</span></div>` : ""}
      ${div.notes ? `<div class="info-row" style="flex-direction:column;gap:4px;"><span class="label">Observações</span><span class="value" style="font-size:0.85rem;color:var(--gray);">${div.notes}</span></div>` : ""}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.7rem;color:var(--gray-dark);text-align:center;">ID: ${div.id}</div>
      </div>
    `;

    openModal(div.credor || "Dívida", html);
  }

  // ============================================================
  // RENDERIZAR - ABA DÍVIDAS
  // ============================================================
  function renderizarDividas(dados) {
    const { dividas, totalDividas, saldoDevedor } = dados;

    document.getElementById("divTotalGeral").textContent =
      formatCurrency(totalDividas);
    document.getElementById("divSaldoDevedor").textContent =
      formatCurrency(saldoDevedor);

    const ativas = (dividas || []).filter((d) => d.status !== "quitada").length;
    const quitadas = (dividas || []).filter(
      (d) => d.status === "quitada",
    ).length;

    document.getElementById("divAtivas").textContent = ativas;
    document.getElementById("divQuitadas").textContent = quitadas;

    const container = document.getElementById("listaDividas");
    document.getElementById("totalDividas").textContent =
      (dividas || []).length + " registros";

    if (dividas && dividas.length > 0) {
      container.innerHTML = dividas
        .slice(0, 15)
        .map((d) => {
          const total = d.total_amount || 0;
          const pago = d.paid_amount || 0;
          const percentual = total > 0 ? Math.round((pago / total) * 100) : 0;
          const credor = d.credor || d.creditor || "Credor não informado";
          const descricao = d.description || d.notes || "-";
          const statusClass = d.status === "quitada" ? "quitada" : "ativa";
          const statusLabel =
            d.status === "quitada" ? "✅ Quitada" : "🟡 Ativa";

          return `<div class="list-item" data-id="${d.id}" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:pointer;">
            <div class="item-main" style="flex:1;min-width:0;">
              <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${d.status === "quitada" ? "var(--success)" : "var(--gold-light)"};">${credor}</div>
              <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${descricao} · ${percentual}% pago</div>
            </div>
            <div class="item-right" style="text-align:right;flex-shrink:0;">
              <span class="item-badge badge-status-${statusClass}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">${statusLabel}</span>
              <div style="font-size:9px;color:var(--gray-dark);">${formatCurrency(total - pago)} restante</div>
            </div>
          </div>`;
        })
        .join("");

      container.querySelectorAll(".list-item[data-id]").forEach((el) => {
        el.addEventListener("click", function () {
          const id = this.dataset.id;
          const div = dividas.find((d) => d.id == id);
          if (div) abrirModalDivida(div);
        });
      });
    } else {
      container.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);"><i class="ph ph-warning-circle" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i><p style="font-size:12px;">Nenhuma dívida cadastrada</p></div>`;
    }
  }

  // ============================================================
  // CARREGAR DADOS (TODOS DO SUPABASE)
  // ============================================================
  async function carregarDados() {
    console.log("🔄 Carregando dados do Supabase...");
    if (carregando) return;
    carregando = true;
    refreshIcon.className = "ph ph-spinner spinning";

    try {
      const hoje = todayISO();
      const mesRange = getMonthRange();
      console.log(`📅 Mês atual: ${mesRange.mes}/${mesRange.ano}`);

      // ============================================================
      // 1. TODAS AS ORDENS DE SERVIÇO (para produção)
      // ============================================================
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
      if (errOs) console.error("❌ Erro OS:", errOs);

      const osAtivas = (todasOS || []).filter(
        (o) => !["cancelado"].includes(o.status),
      );

      // Buscar progresso (itens)
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

      const emCostura = osAtivas.filter(
        (o) => o.status === "em_costura",
      ).length;
      const costurados = osAtivas.filter(
        (o) => o.status === "costurado",
      ).length;

      dados.progressoMap = progressoMap;

      // ============================================================
      // 2. FINANCEIRO
      // ============================================================
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
      if (errAvulsas) console.error("❌ Erro avulsas:", errAvulsas);

      const { data: parcelasPeriodo, error: errParc } = await supabase
        .from("financial_installments")
        .select(
          "transaction_id, id, numero_parcela, valor, vencimento, status, payment_date, interest_paid, late_fee_paid",
        )
        .gte("vencimento", mesRange.inicio)
        .lte("vencimento", mesRange.fim)
        .order("vencimento", { ascending: true });
      if (errParc) console.error("❌ Erro parcelas:", errParc);

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
        if (errParceladas) console.error("❌ Erro parceladas:", errParceladas);
        transacoesParceladas = parceladas || [];
      }

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

      // ============================================================
      // 3. RH
      // ============================================================
      const { data: funcionarios, error: errFunc } = await supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("full_name");
      if (errFunc) console.error("❌ Erro funcionários:", errFunc);

      const { data: ferias, error: errFer } = await supabase
        .from("employee_vacations")
        .select(
          "*, employees(full_name, role, photo_url, phone_cell, email_personal)",
        )
        .eq("status", "agendada")
        .lte("start_date", hoje)
        .gte("end_date", hoje)
        .order("start_date", { ascending: true });
      if (errFer) console.error("❌ Erro férias:", errFer);

      // ============================================================
      // 4. DÍVIDAS
      // ============================================================
      const { data: dividas, error: errDiv } = await supabase
        .from("debts")
        .select("*")
        .order("created_at", { ascending: false });
      if (errDiv) console.error("❌ Erro dívidas:", errDiv);

      let totalDividas = 0,
        totalPago = 0;
      for (const d of dividas || []) {
        totalDividas += parseFloat(d.total_amount) || 0;
        totalPago += parseFloat(d.paid_amount) || 0;
      }
      const saldoDevedor = totalDividas - totalPago;

      // ============================================================
      // ARMAZENA DADOS
      // ============================================================
      dados = {
        osAtivas: osAtivas || [],
        emCostura: emCostura || 0,
        costurados: costurados || 0,
        eventosFinanceiros: eventosFinanceiros || [],
        totalReceitas: totalReceitas || 0,
        totalDespesas: totalDespesas || 0,
        totalPagar: totalPagar || 0,
        totalReceber: totalReceber || 0,
        contasVencidas: contasVencidas || 0,
        funcionarios: funcionarios || [],
        ferias: ferias || [],
        dividas: dividas || [],
        totalDividas: totalDividas || 0,
        saldoDevedor: saldoDevedor || 0,
        mesRange: mesRange,
        progressoMap: progressoMap || {},
      };

      renderizarGeral(dados);
      renderizarProducao(dados);
      renderizarFinanceiro(dados);
      renderizarRH(dados);
      renderizarDividas(dados);

      const totalPendencias =
        (osAtivas || []).filter(
          (o) => o.status === "entregue" && o.payment_status !== "pago",
        ).length + contasVencidas;

      $("tabBadgeProd").textContent = (osAtivas || []).length;
      $("tabBadgeProd").style.display =
        (osAtivas || []).length > 0 ? "flex" : "none";
      $("tabBadgeFin").textContent = contasVencidas;
      $("tabBadgeFin").style.display = contasVencidas > 0 ? "flex" : "none";
      $("tabBadgeRH").textContent = (ferias || []).length;
      $("tabBadgeRH").style.display =
        (ferias || []).length > 0 ? "flex" : "none";
      const divAtivas = (dividas || []).filter(
        (d) => d.status !== "quitada",
      ).length;
      $("tabBadgeDiv").textContent = divAtivas;
      $("tabBadgeDiv").style.display = divAtivas > 0 ? "flex" : "none";

      console.log("✅ Renderização concluída!");
    } catch (e) {
      console.error("❌ Erro:", e);
      showFeedback("Erro", "Falha ao carregar dados do Supabase.", "error");
    } finally {
      carregando = false;
      refreshIcon.className = "ph ph-arrows-clockwise";
      pullIndicator.classList.remove("active");
    }
  }

  // ============================================================
  // NAVEGAÇÃO POR ABAS
  // ============================================================
  const tabItems = document.querySelectorAll(".tab-item");
  const tabContents = {
    geral: document.getElementById("tab-geral"),
    producao: document.getElementById("tab-producao"),
    financeiro: document.getElementById("tab-financeiro"),
    rh: document.getElementById("tab-rh"),
    dividas: document.getElementById("tab-dividas"),
  };

  function mostrarAba(aba) {
    abaAtual = aba;

    tabItems.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === aba);
    });

    Object.keys(tabContents).forEach((key) => {
      tabContents[key].classList.toggle("active", key === aba);
    });

    appContent.scrollTo({ top: 0, behavior: "smooth" });
  }

  tabItems.forEach((tab) => {
    tab.addEventListener("click", function () {
      mostrarAba(this.dataset.tab);
    });
  });

  // ============================================================
  // SCROLL TOP
  // ============================================================
  appContent.addEventListener("scroll", function () {
    scrollTopBtn.classList.toggle("visible", this.scrollTop > 200);
  });
  scrollTopBtn.addEventListener("click", function () {
    appContent.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ============================================================
  // PULL-TO-REFRESH
  // ============================================================
  let touchStartY = 0,
    touchMoved = false;
  appContent.addEventListener(
    "touchstart",
    function (e) {
      if (this.scrollTop === 0) {
        touchStartY = e.touches[0].clientY;
        touchMoved = false;
      }
    },
    { passive: true },
  );
  appContent.addEventListener(
    "touchmove",
    function (e) {
      if (this.scrollTop === 0 && touchStartY > 0) {
        const deltaY = e.touches[0].clientY - touchStartY;
        if (deltaY > 40) {
          touchMoved = true;
          pullIndicator.classList.add("active");
          pullIndicator.innerHTML =
            '<i class="ph ph-arrow-down"></i> Solte para atualizar';
        } else if (deltaY > 10) {
          pullIndicator.classList.add("active");
          pullIndicator.innerHTML =
            '<i class="ph ph-arrow-down"></i> Puxe para atualizar';
        } else {
          pullIndicator.classList.remove("active");
        }
      }
    },
    { passive: true },
  );
  appContent.addEventListener(
    "touchend",
    function (e) {
      if (touchMoved && this.scrollTop === 0) {
        pullIndicator.innerHTML =
          '<i class="ph ph-spinner spinning"></i> Atualizando...';
        carregarDados().then(() => pullIndicator.classList.remove("active"));
      }
      touchStartY = 0;
      touchMoved = false;
    },
    { passive: true },
  );

  // ============================================================
  // REFRESH
  // ============================================================
  $("btnRefresh").addEventListener("click", carregarDados);

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================
  document.addEventListener("DOMContentLoaded", async function () {
    carregarSessao();
    mostrarAba("geral");
    await carregarDados();
    setInterval(carregarDados, 60000);
  });

  // ============================================================
  // EXPORTAÇÃO GLOBAL
  // ============================================================
  window.carregarDados = carregarDados;
  window.mostrarAba = mostrarAba;
  window.abrirModalConta = window.abrirModalConta;
  window.iniciarCosturaLote = window.iniciarCosturaLote;
  window.finalizarCosturaLote = window.finalizarCosturaLote;
  window.marcarEntregue = window.marcarEntregue;
  window.marcarPago = window.marcarPago;
  window.cancelarLote = window.cancelarLote;
  window.excluirLote = window.excluirLote;
  window.editarLote = window.editarLote;
  window.visualizarLote = window.visualizarLote;
  window.registrarCosturaParcial = window.registrarCosturaParcial;
})();
