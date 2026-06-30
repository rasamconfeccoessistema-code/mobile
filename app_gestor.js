// ============================================================
// APP GESTOR - FACÇÃO JEANS
// JavaScript completo para o aplicativo do gestor
// VERSÃO 4.3 - CORREÇÃO DE CONFLITOS DE CONTAS RECORRENTES
// ============================================================

(function () {
  "use strict";

  console.log("🚀 App do Gestor - Versão 4.3 com Correção de Recorrências");

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
  // SISTEMA DE AUTENTICAÇÃO COM CACHE DE 30 MINUTOS
  // ============================================================

  const SESSION_DURATION = 30 * 60 * 1000;

  let usuarioAutenticado = null;
  let sessionTimeout = null;
  let loginModalAberto = false;

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
      console.log(
        "⏰ Sessão expirada automaticamente após 30 minutos de inatividade",
      );
      localStorage.removeItem("gestor_session");
      usuarioAutenticado = null;
      atualizarIndicadorSessao();
      if (!loginModalAberto) {
        showToast(
          "Sessão expirada",
          "Sua sessão expirou após 30 minutos de inatividade. Faça login novamente.",
          "warning",
          5000,
        );
        setTimeout(() => {
          abrirModalLoginObrigatorio("continuar usando o app");
        }, 1000);
      }
    }, SESSION_DURATION);
    console.log(
      `💾 Sessão salva para: ${usuario.email} (expira em 30 minutos)`,
    );
    atualizarIndicadorSessao();
  }

  function renovarSessao() {
    if (usuarioAutenticado) {
      const session = {
        usuario: usuarioAutenticado,
        timestamp: Date.now(),
      };
      localStorage.setItem("gestor_session", JSON.stringify(session));
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
      sessionTimeout = setTimeout(() => {
        console.log(
          "⏰ Sessão expirada automaticamente após 30 minutos de inatividade",
        );
        localStorage.removeItem("gestor_session");
        usuarioAutenticado = null;
        atualizarIndicadorSessao();
        if (!loginModalAberto) {
          showToast(
            "Sessão expirada",
            "Sua sessão expirou após 30 minutos de inatividade. Faça login novamente.",
            "warning",
            5000,
          );
          setTimeout(() => {
            abrirModalLoginObrigatorio("continuar usando o app");
          }, 1000);
        }
      }, SESSION_DURATION);
      console.log("🔄 Sessão renovada por mais 30 minutos");
    }
  }

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

  function isAutenticado() {
    if (!usuarioAutenticado) {
      carregarSessao();
    }
    return !!usuarioAutenticado;
  }

  function getUsuarioAtual() {
    if (!usuarioAutenticado) {
      carregarSessao();
    }
    return usuarioAutenticado;
  }

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

  function abrirModalLoginObrigatorio(acao = "acessar o app") {
    return new Promise((resolve) => {
      loginModalAberto = true;
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.display = "none";
      }
      const overlay = document.createElement("div");
      overlay.id = "loginObrigatorioOverlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.92);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 20px;
        animation: fadeInOverlay 0.4s ease;
      `;
      if (!document.getElementById("loginStyles")) {
        const style = document.createElement("style");
        style.id = "loginStyles";
        style.textContent = `
          @keyframes fadeInOverlay {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUpLogin {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .login-modal-sheet {
            animation: slideUpLogin 0.4s cubic-bezier(0.32, 0.72, 0, 1);
          }
          #loginObrigatorioOverlay .form-input:focus {
            border-color: #e91e63 !important;
            box-shadow: 0 0 0 3px rgba(233,30,99,0.15) !important;
            outline: none;
          }
          #loginObrigatorioOverlay .form-input {
            transition: all 0.3s ease;
          }
          #loginObrigatorioOverlay .btn-login:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(233,30,99,0.3);
          }
          #loginObrigatorioOverlay .btn-login:active {
            transform: scale(0.98);
          }
          .spinning {
            animation: spin 0.8s infinite linear;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
      overlay.innerHTML = `
        <div class="login-modal-sheet" style="
          max-width: 420px; 
          width: 100%; 
          background: #1a1a1a;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.08);
          padding: 32px 24px 28px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.8);
        ">
          <div style="text-align: center; margin-bottom: 28px;">
            <div style="
              width: 80px; 
              height: 80px; 
              background: linear-gradient(135deg, #c2185b, #d4a017); 
              border-radius: 50%; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              font-size: 32px; 
              margin: 0 auto 16px;
              box-shadow: 0 8px 32px rgba(233,30,99,0.3);
            ">
              <i class="ph ph-lock-simple" style="color: white;"></i>
            </div>
            <h2 style="color: #f0c75e; margin: 0; font-size: 1.5rem; letter-spacing: -0.5px; font-weight: 700;">
              Facção Jeans
            </h2>
            <p style="color: #9e9e9e; font-size: 0.85rem; margin-top: 4px; font-weight: 400;">
              App do Gestor
            </p>
            <p style="color: #555; font-size: 0.75rem; margin-top: 12px;">
              Faça login para <strong style="color: #f0c75e;">${acao}</strong>
            </p>
          </div>

          <div id="loginObrigatorioStatus" style="
            color: #ff5252; 
            font-size: 0.8rem; 
            text-align: center; 
            min-height: 24px; 
            margin-bottom: 12px;
            font-weight: 500;
          "></div>

          <div class="form-group" style="margin-bottom: 14px;">
            <label style="color: #9e9e9e; font-size: 0.7rem; display: block; margin-bottom: 4px; font-weight: 500; letter-spacing: 0.3px;">
              <i class="ph ph-envelope"></i> Email
            </label>
            <input id="loginObrigatorioEmail" type="email" class="form-input" placeholder="seu@email.com" style="
              width: 100%; 
              padding: 12px 16px; 
              background: rgba(255,255,255,0.05); 
              border: 1px solid rgba(255,255,255,0.1); 
              border-radius: 10px; 
              color: #f5f5f5; 
              font-size: 0.95rem;
              outline: none;
            " autofocus>
          </div>

          <div class="form-group" style="margin-bottom: 20px;">
            <label style="color: #9e9e9e; font-size: 0.7rem; display: block; margin-bottom: 4px; font-weight: 500; letter-spacing: 0.3px;">
              <i class="ph ph-key"></i> Senha
            </label>
            <input id="loginObrigatorioSenha" type="password" class="form-input" placeholder="••••••••" style="
              width: 100%; 
              padding: 12px 16px; 
              background: rgba(255,255,255,0.05); 
              border: 1px solid rgba(255,255,255,0.1); 
              border-radius: 10px; 
              color: #f5f5f5; 
              font-size: 0.95rem;
              outline: none;
            ">
          </div>

          <button id="confirmarLoginObrigatorio" class="btn-login" style="
            width: 100%; 
            padding: 14px; 
            font-size: 1rem; 
            border-radius: 10px; 
            background: linear-gradient(135deg, #c2185b, #d4a017); 
            border: none; 
            color: white; 
            font-weight: 600; 
            cursor: pointer; 
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          ">
            <i class="ph ph-check-circle"></i> Entrar
          </button>

          <div style="text-align: center; margin-top: 16px;">
            <span style="color: #555; font-size: 0.6rem; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <i class="ph ph-info"></i> Sessão válida por 30 minutos de atividade
            </span>
          </div>
        </div>
      `;
      const oldOverlay = document.getElementById("loginObrigatorioOverlay");
      if (oldOverlay) {
        oldOverlay.remove();
      }
      document.body.appendChild(overlay);
      setTimeout(() => {
        const emailInput = document.getElementById("loginObrigatorioEmail");
        if (emailInput) {
          emailInput.focus();
        }
      }, 300);
      document
        .getElementById("loginObrigatorioEmail")
        ?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            document.getElementById("loginObrigatorioSenha")?.focus();
          }
        });
      document
        .getElementById("loginObrigatorioSenha")
        ?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            document.getElementById("confirmarLoginObrigatorio")?.click();
          }
        });
      document
        .getElementById("confirmarLoginObrigatorio")
        ?.addEventListener("click", async function () {
          const email = document
            .getElementById("loginObrigatorioEmail")
            .value.trim();
          const senha = document
            .getElementById("loginObrigatorioSenha")
            .value.trim();
          const statusEl = document.getElementById("loginObrigatorioStatus");
          if (!email || !senha) {
            statusEl.textContent = "❌ Preencha email e senha";
            statusEl.style.color = "#ff5252";
            return;
          }
          statusEl.textContent = "⏳ Verificando...";
          statusEl.style.color = "#f0c75e";
          this.disabled = true;
          this.innerHTML = '<i class="ph ph-spinner spinning"></i> Entrando...';
          const result = await fazerLogin(email, senha);
          if (result.success) {
            statusEl.textContent = `✅ Bem-vindo, ${result.usuario.user_metadata?.full_name || email}!`;
            statusEl.style.color = "#4caf50";
            const overlayEl = document.getElementById(
              "loginObrigatorioOverlay",
            );
            if (overlayEl) {
              overlayEl.remove();
            }
            loginModalAberto = false;
            const appContainer = document.querySelector(".app-container");
            if (appContainer) {
              appContainer.style.display = "flex";
            }
            carregarDadosIniciais();
            resolve({ success: true, usuario: usuarioAutenticado });
          } else {
            statusEl.textContent = `❌ ${result.error || "Erro ao fazer login"}`;
            statusEl.style.color = "#ff5252";
            this.disabled = false;
            this.innerHTML = '<i class="ph ph-check-circle"></i> Entrar';
          }
        });
    });
  }

  function abrirModalLogin(acao) {
    return new Promise((resolve) => {
      if (isAutenticado()) {
        renovarSessao();
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
              <i class="ph ph-info"></i> Sessão válida por 30 minutos de atividade
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

  function setupActivityDetection() {
    const events = [
      "click",
      "touchstart",
      "touchmove",
      "scroll",
      "keydown",
      "input",
      "change",
      "focus",
      "blur",
    ];
    let activityTimer = null;
    const handleActivity = () => {
      if (isAutenticado()) {
        renovarSessao();
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {}, 5000);
      }
    };
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });
    console.log(
      "🔄 Detector de atividade configurado - sessão será renovada com interação",
    );
  }

  // ============================================================
  // TOAST NOTIFICATIONS (Mobile-first)
  // ============================================================

  function showToast(title, message, type = "info", duration = 4000) {
    const container = document.querySelector(".toast-container");
    if (!container) {
      const newContainer = document.createElement("div");
      newContainer.className = "toast-container";
      document.body.appendChild(newContainer);
    }

    const icons = {
      success: "ph-check-circle",
      error: "ph-warning-circle",
      warning: "ph-warning",
      info: "ph-info",
    };

    const colors = {
      success: "var(--success)",
      error: "var(--error)",
      warning: "var(--warning)",
      info: "var(--info)",
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="ph ${icons[type] || icons.info} toast-icon" style="color: ${colors[type] || colors.info};"></i>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close"><i class="ph ph-x"></i></button>
    `;

    const containerEl = document.querySelector(".toast-container");
    containerEl.appendChild(toast);

    toast.querySelector(".toast-close").addEventListener("click", () => {
      removeToast(toast);
    });

    setTimeout(() => removeToast(toast), duration);
  }

  function removeToast(toast) {
    if (!toast) return;
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
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
      recebido: "📥 Lote Recebido",
      em_costura: "🧵 Em Costura",
      costurado: "✅ Costurado",
      em_revisao: "🔍 Em Revisão",
      entregue: "📦 Entregue",
      cancelado: "❌ Cancelado",
      parcialmente_entregue: "📦 Parcialmente Entregue",
      aguardando_pagamento: "💰 Pagamento Pendente",
      pago: "💳 Pago",
    };
    return map[s] || s || "-";
  }

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

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function getPaymentStatusInfo(status) {
    const map = {
      pendente: {
        label: "⏳ Pagamento Pendente",
        icon: "ph-clock",
        color: "#ffc107",
        bg: "rgba(255,193,7,0.15)",
        border: "1px solid rgba(255,193,7,0.3)",
        description: "Aguardando pagamento",
      },
      pago: {
        label: "✅ Pagamento Recebido",
        icon: "ph-check-circle",
        color: "#4caf50",
        bg: "rgba(76,175,80,0.15)",
        border: "1px solid rgba(76,175,80,0.3)",
        description: "Pagamento confirmado",
      },
      atrasado: {
        label: "🔴 Pagamento Atrasado",
        icon: "ph-warning-circle",
        color: "#ff5252",
        bg: "rgba(255,82,82,0.15)",
        border: "1px solid rgba(255,82,82,0.3)",
        description: "Pagamento vencido",
      },
      parcial: {
        label: "🟡 Pagamento Parcial",
        icon: "ph-clock",
        color: "#ff9800",
        bg: "rgba(255,152,0,0.15)",
        border: "1px solid rgba(255,152,0,0.3)",
        description: "Pagamento parcial",
      },
    };
    return map[status] || map.pendente;
  }

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

  function getMonthRangeForDate(date) {
    const now = new Date(date);
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

  function calcularDiasRestantes(endDate) {
    if (!endDate) return 0;
    const hoje = new Date();
    const fim = new Date(endDate);
    const diffTime = fim - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function getLeaveTypeLabel(type) {
    const map = {
      atestado: "📋 Atestado Médico",
      licenca_maternidade: "👶 Licença Maternidade",
      licenca_paternidade: "👨 Licença Paternidade",
      acidente_trabalho: "⚠️ Acidente de Trabalho",
      cirurgia: "🔬 Cirurgia",
      doenca: "🤒 Doença",
      tratamento_medico: "🏥 Tratamento Médico",
      luto: "💔 Luto",
      casamento: "💍 Casamento",
      outro: "📌 Outro",
    };
    return map[type] || type || "📌 Outro";
  }

  function getLeaveStatusLabel(status) {
    const map = {
      pendente: "⏳ Pendente",
      aprovado: "✅ Aprovado",
      recusado: "❌ Recusado",
      encerrado: "🔴 Encerrado",
    };
    return map[status] || status || "⏳ Pendente";
  }

  // ============================================================
  // FUNÇÕES PARA CONTAS RECORRENTES (GERAÇÃO DE TRANSAÇÕES)
  // ============================================================

  async function verificarEGerarRecorrentesPorPeriodo(
    dataInicio,
    dataFim,
    gerarFuturos = true,
  ) {
    console.log(
      `🔄 Verificando contas recorrentes para o período: ${dataInicio} a ${dataFim}`,
    );

    try {
      // Buscar todas as contas recorrentes ativas
      const { data: recorrentes, error: recError } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("active", true);

      if (recError) {
        console.error("❌ Erro ao buscar contas recorrentes:", recError);
        return;
      }

      if (!recorrentes || recorrentes.length === 0) {
        console.log("📭 Nenhuma conta recorrente ativa encontrada.");
        return;
      }

      console.log(`📋 ${recorrentes.length} contas recorrentes encontradas.`);

      // Para cada conta recorrente, gerar transações faltantes
      for (const rec of recorrentes) {
        await gerarTransacoesRecorrentes(
          rec,
          dataInicio,
          dataFim,
          gerarFuturos,
        );
      }

      console.log("✅ Verificação de contas recorrentes concluída.");
    } catch (e) {
      console.error("❌ Erro ao verificar contas recorrentes:", e);
    }
  }

  async function gerarTransacoesRecorrentes(
    rec,
    dataInicio,
    dataFim,
    gerarFuturos = true,
  ) {
    try {
      const dataInicioDate = new Date(dataInicio + "T12:00:00");
      const dataFimDate = new Date(dataFim + "T12:00:00");

      // Se gerarFuturos for true, gerar também para os próximos 12 meses
      const dataFimGeracao = new Date(dataFimDate);
      if (gerarFuturos) {
        dataFimGeracao.setMonth(dataFimGeracao.getMonth() + 12);
      }

      // Buscar transações existentes para esta recorrência no período (TODAS, incluindo canceladas)
      const { data: transacoesExistentes, error: existError } = await supabase
        .from("financial_transactions")
        .select("id, due_date, status")
        .eq("recurring_id", rec.id)
        .gte("due_date", dataInicio)
        .lte("due_date", dataFimGeracao.toISOString().split("T")[0]);

      if (existError) {
        console.error(
          `❌ Erro ao buscar transações existentes para rec ${rec.id}:`,
          existError,
        );
        return;
      }

      const datasExistentes = new Set();
      if (transacoesExistentes) {
        transacoesExistentes.forEach((t) => {
          datasExistentes.add(t.due_date);
        });
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
        else {
          const { data: novaCat, error: createCatError } = await supabase
            .from("chart_of_accounts")
            .insert({
              code: `9.9.${Date.now()}`,
              name: `Geral ${rec.type === "pagar" ? "Despesa" : "Receita"}`,
              type: rec.type === "pagar" ? "despesa" : "receita",
              active: true,
            })
            .select("id")
            .single();
          if (createCatError) {
            console.error("❌ Erro ao criar categoria:", createCatError);
            return;
          }
          categoriaId = novaCat.id;
        }
      }

      // Gerar transações para cada mês
      const transacoesParaInserir = [];
      let dataAtual = new Date(dataInicioDate);

      while (dataAtual <= dataFimGeracao) {
        const ano = dataAtual.getFullYear();
        const mes = dataAtual.getMonth();
        const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
        let dia = rec.due_day;
        if (dia > ultimoDiaMes) dia = ultimoDiaMes;

        const dueDate = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

        // Verificar se já existe transação para esta data
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

        // Avançar para o próximo mês
        dataAtual.setMonth(dataAtual.getMonth() + 1);
      }

      if (transacoesParaInserir.length > 0) {
        console.log(
          `📝 Criando ${transacoesParaInserir.length} transações para recorrência: ${rec.description}`,
        );

        // Inserir em lotes usando upsert para evitar conflitos
        const lote = 50;
        for (let i = 0; i < transacoesParaInserir.length; i += lote) {
          const loteAtual = transacoesParaInserir.slice(i, i + lote);

          // Usar upsert com ignoreDuplicates para evitar erro 409
          const { error: insertError } = await supabase
            .from("financial_transactions")
            .upsert(loteAtual, {
              onConflict: "recurring_id, due_date",
              ignoreDuplicates: true,
            });

          if (insertError) {
            console.error(
              `❌ Erro ao inserir transações recorrentes (lote ${i}):`,
              insertError,
            );
          } else {
            console.log(
              `✅ ${loteAtual.length} transações inseridas/atualizadas para recorrência: ${rec.description}`,
            );
          }
        }
      } else {
        console.log(
          `✅ Nenhuma nova transação necessária para: ${rec.description}`,
        );
      }
    } catch (e) {
      console.error(`❌ Erro ao gerar transações para rec ${rec.id}:`, e);
    }
  }

  async function criarTransacoesParaNovaRecorrente(rec) {
    try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth();
      const anoAtual = hoje.getFullYear();

      // Criar transações desde o mês atual até 12 meses à frente
      const dataInicio = new Date(anoAtual, mesAtual, 1);
      const dataFim = new Date(anoAtual, mesAtual + 12, 0);

      const dataInicioStr = dataInicio.toISOString().split("T")[0];
      const dataFimStr = dataFim.toISOString().split("T")[0];

      console.log(
        `📝 Criando transações para nova recorrência de ${dataInicioStr} a ${dataFimStr}`,
      );

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
        else {
          const { data: novaCat, error: createCatError } = await supabase
            .from("chart_of_accounts")
            .insert({
              code: `9.9.${Date.now()}`,
              name: `Geral ${rec.type === "pagar" ? "Despesa" : "Receita"}`,
              type: rec.type === "pagar" ? "despesa" : "receita",
              active: true,
            })
            .select("id")
            .single();
          if (createCatError) {
            console.error("❌ Erro ao criar categoria:", createCatError);
            return;
          }
          categoriaId = novaCat.id;
        }
      }

      const transacoesParaInserir = [];
      let dataAtual = new Date(dataInicio);

      while (dataAtual <= dataFim) {
        const ano = dataAtual.getFullYear();
        const mes = dataAtual.getMonth();
        const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
        let dia = rec.due_day;
        if (dia > ultimoDiaMes) dia = ultimoDiaMes;

        const dueDate = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

        transacoesParaInserir.push({
          type: rec.type,
          amount:
            rec.type === "pagar" ? -Math.abs(rec.amount) : Math.abs(rec.amount),
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

        dataAtual.setMonth(dataAtual.getMonth() + 1);
      }

      if (transacoesParaInserir.length > 0) {
        // Usar upsert com ignoreDuplicates para evitar conflitos
        const { error: insertError } = await supabase
          .from("financial_transactions")
          .upsert(transacoesParaInserir, {
            onConflict: "recurring_id, due_date",
            ignoreDuplicates: true,
          });

        if (insertError) {
          console.error(
            "❌ Erro ao inserir transações para nova recorrência:",
            insertError,
          );
        } else {
          console.log(
            `✅ ${transacoesParaInserir.length} transações criadas para nova recorrência: ${rec.description}`,
          );
        }
      }
    } catch (e) {
      console.error("❌ Erro ao criar transações para nova recorrência:", e);
    }
  }

  // ============================================================
  // SELETOR DE PERÍODO
  // ============================================================

  const periodState = {
    producao: new Date(),
    financeiro: new Date(),
    rh: new Date(),
  };

  function getPeriodDisplay(date) {
    return date.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  }

  function updatePeriodDisplay(aba) {
    const display = document.getElementById(
      `periodDisplay${capitalizeFirst(aba)}`,
    );
    if (display) {
      display.textContent = getPeriodDisplay(periodState[aba]);
    }
  }

  function navigatePeriod(aba, direction) {
    const date = new Date(periodState[aba]);
    date.setMonth(date.getMonth() + direction);
    periodState[aba] = date;
    updatePeriodDisplay(aba);

    // Recarregar dados da aba específica com o novo período
    if (aba === "producao") {
      carregarProducaoPeriodo();
    } else if (aba === "financeiro") {
      carregarFinanceiroPeriodo();
    } else if (aba === "rh") {
      carregarRHPeriodo();
    }
  }

  function resetPeriod(aba) {
    periodState[aba] = new Date();
    updatePeriodDisplay(aba);

    // Recarregar dados da aba específica com o mês atual
    if (aba === "producao") {
      carregarProducaoPeriodo();
    } else if (aba === "financeiro") {
      carregarFinanceiroPeriodo();
    } else if (aba === "rh") {
      carregarRHPeriodo();
    }
  }

  function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // ============================================================
  // MODAL FUNCTIONS
  // ============================================================
  function openModal(title, html) {
    const container = document.getElementById("modalContainer");
    container.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-sheet" id="modalSheet">
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
      setupModalDrag();
    }, 50);
  }

  // ============================================================
  // DRAG TO CLOSE MODAL (Mobile-first)
  // ============================================================

  function setupModalDrag() {
    const modal = document.querySelector(".modal-sheet");
    if (!modal) return;

    // Remover drag area existente
    const existingDrag = modal.querySelector(".drag-area");
    if (existingDrag) existingDrag.remove();

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const dragArea = document.createElement("div");
    dragArea.className = "drag-area";
    dragArea.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 50px;
      cursor: grab;
      z-index: 10;
    `;
    modal.style.position = "relative";
    modal.prepend(dragArea);

    dragArea.addEventListener(
      "touchstart",
      function (e) {
        startY = e.touches[0].clientY;
        isDragging = true;
        modal.classList.add("dragging");
      },
      { passive: true },
    );

    dragArea.addEventListener(
      "touchmove",
      function (e) {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) {
          modal.style.transform = `translateY(${deltaY}px)`;
          modal.style.opacity = 1 - deltaY / 350;
          modal.style.transition = "none";
        }
      },
      { passive: true },
    );

    dragArea.addEventListener(
      "touchend",
      function (e) {
        if (!isDragging) return;
        isDragging = false;
        modal.classList.remove("dragging");

        const deltaY = currentY - startY;
        if (deltaY > 150) {
          // Fechar modal
          document.getElementById("modalContainer").innerHTML = "";
        } else {
          // Voltar à posição original
          modal.style.transform = "";
          modal.style.opacity = "";
          modal.style.transition = "";
        }
      },
      { passive: true },
    );
  }

  // ============================================================
  // MODAL CUSTOM PARA FORMULÁRIOS COM BOTÃO DE SUBMIT
  // ============================================================
  function openFormModal(title, formHtml, onSubmit, maxWidth = "520px") {
    const html = `
      <div class="modal-overlay" id="formOverlay">
        <div class="modal-sheet" id="modalSheet" style="max-width:${maxWidth}; width:95%; max-height:92vh; display:flex; flex-direction:column;">
          <div class="handle"></div>
          <div class="modal-header" style="flex-shrink:0;">
            <h2><i class="ph ph-${getIconForTitle(title)}"></i> ${title}</h2>
            <button class="btn-close" id="closeFormModal"><i class="ph ph-x"></i> Fechar</button>
          </div>
          <div class="modal-body" style="flex:1; overflow-y:auto; padding:16px 20px;">
            <form id="dynamicForm" novalidate style="display:flex; flex-direction:column; gap:8px;">
              ${formHtml}
              <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
                <button type="button" class="btn-ghost" id="cancelFormModal" style="padding:8px 16px;">Cancelar</button>
                <button type="submit" class="btn-primary" style="padding:8px 20px;">
                  <i class="ph ph-check-circle"></i> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    const container = document.getElementById("modalContainer");
    if (!container) return;
    container.innerHTML = html;

    const closeModal = () => {
      container.innerHTML = "";
    };

    document
      .getElementById("closeFormModal")
      .addEventListener("click", closeModal);
    document
      .getElementById("cancelFormModal")
      .addEventListener("click", closeModal);
    document.getElementById("formOverlay").addEventListener("click", (e) => {
      if (e.target.id === "formOverlay") closeModal();
    });
    document.addEventListener("keydown", function escForm(e) {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", escForm);
      }
    });

    document
      .getElementById("dynamicForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        if (typeof onSubmit === "function") {
          await onSubmit();
        }
        closeModal();
      });

    setTimeout(setupModalDrag, 100);
  }

  function getIconForTitle(title) {
    const icons = {
      "Nova Dívida": "plus-circle",
      "Editar Dívida": "pencil-simple",
      "Detalhes da Dívida": "eye",
      "Quitar Parcela": "check-circle",
      "Quitar Dívida Completa": "check-square",
      "Simulação de Quitação Antecipada": "chart-line",
      "Renegociar Dívida": "arrows-clockwise",
      Anexos: "paperclip",
      "Editar Parcelas": "receipt",
      "Confirmar Exclusão": "trash",
      "Novo Afastamento": "plus-circle",
      "Editar Afastamento": "pencil-simple",
      "Detalhes do Afastamento": "eye",
    };
    return icons[title] || "file";
  }

  // ============================================================
  // KEYBOARD AVOIDANCE (Mobile-first)
  // ============================================================

  function setupKeyboardAvoidance() {
    const inputs = document.querySelectorAll("input, textarea, select");

    inputs.forEach((input) => {
      input.addEventListener("focus", function () {
        setTimeout(() => {
          const rect = this.getBoundingClientRect();
          const scrollY = window.scrollY || window.pageYOffset;
          const targetY = rect.top + scrollY - 80;

          const appContent = document.querySelector(".app-content");
          if (appContent) {
            appContent.scrollTo({
              top: targetY,
              behavior: "smooth",
            });
          }
        }, 300);
      });
    });
  }

  // ============================================================
  // SWIPE PARA VOLTAR (Mobile-first)
  // ============================================================

  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  function setupSwipeNavigation() {
    document.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwiping = false;
      },
      { passive: true },
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
          isSwiping = true;
        }
      },
      { passive: true },
    );

    document.addEventListener(
      "touchend",
      function (e) {
        if (!isSwiping) return;

        const deltaX = e.changedTouches[0].clientX - touchStartX;

        // Verificar se há modal aberto
        const modal = document.querySelector(".modal-overlay");
        if (modal) {
          if (deltaX > 80) {
            document.getElementById("modalContainer").innerHTML = "";
          }
          isSwiping = false;
          return;
        }

        // Voltar aba anterior (swipe da esquerda para direita)
        if (deltaX > 80) {
          const tabs = ["geral", "producao", "financeiro", "rh", "dividas"];
          const currentIndex = tabs.indexOf(abaAtual);
          if (currentIndex > 0) {
            mostrarAba(tabs[currentIndex - 1]);
          }
        }

        // Avançar aba (swipe da direita para esquerda)
        if (deltaX < -80) {
          const tabs = ["geral", "producao", "financeiro", "rh", "dividas"];
          const currentIndex = tabs.indexOf(abaAtual);
          if (currentIndex < tabs.length - 1) {
            mostrarAba(tabs[currentIndex + 1]);
          }
        }

        isSwiping = false;
      },
      { passive: true },
    );
  }

  // ============================================================
  // MENU DE AÇÕES MOBILE (Toggle com backdrop)
  // ============================================================

  window.toggleMenu = function (menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;

    // Fechar outros menus
    document.querySelectorAll(".dropdown-actions-menu").forEach((m) => {
      if (m.id !== menuId) m.style.display = "none";
    });

    // Remover backdrops existentes
    document.querySelectorAll(".menu-backdrop").forEach((b) => b.remove());

    const isOpen = menu.style.display === "block";

    if (isOpen) {
      menu.style.display = "none";
    } else {
      menu.style.display = "block";

      // Adicionar backdrop para fechar ao tocar fora
      const backdrop = document.createElement("div");
      backdrop.className = "menu-backdrop";
      backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 199;
        background: rgba(0,0,0,0.4);
        animation: fadeInOverlay 0.2s ease;
      `;
      backdrop.addEventListener("click", function () {
        menu.style.display = "none";
        this.remove();
      });
      document.body.appendChild(backdrop);
    }
  };

  // ============================================================
  // CONFIGURAR SELETORES DE PERÍODO
  // ============================================================

  function setupPeriodSelectors() {
    // Produção
    const periodNavsProd = document.querySelectorAll(
      "#periodSelectorProducao .period-nav",
    );
    periodNavsProd.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const direction = parseInt(this.dataset.direction === "prev" ? -1 : 1);
        navigatePeriod("producao", direction);
      });
    });
    const todayBtnProd = document.querySelector(
      "#periodSelectorProducao .period-today",
    );
    if (todayBtnProd) {
      todayBtnProd.addEventListener("click", function (e) {
        e.stopPropagation();
        resetPeriod("producao");
      });
    }

    // Financeiro
    const periodNavsFin = document.querySelectorAll(
      "#periodSelectorFinanceiro .period-nav",
    );
    periodNavsFin.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const direction = parseInt(this.dataset.direction === "prev" ? -1 : 1);
        navigatePeriod("financeiro", direction);
      });
    });
    const todayBtnFin = document.querySelector(
      "#periodSelectorFinanceiro .period-today",
    );
    if (todayBtnFin) {
      todayBtnFin.addEventListener("click", function (e) {
        e.stopPropagation();
        resetPeriod("financeiro");
      });
    }

    // RH
    const periodNavsRH = document.querySelectorAll(
      "#periodSelectorRH .period-nav",
    );
    periodNavsRH.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const direction = parseInt(this.dataset.direction === "prev" ? -1 : 1);
        navigatePeriod("rh", direction);
      });
    });
    const todayBtnRH = document.querySelector(
      "#periodSelectorRH .period-today",
    );
    if (todayBtnRH) {
      todayBtnRH.addEventListener("click", function (e) {
        e.stopPropagation();
        resetPeriod("rh");
      });
    }

    // Inicializar displays
    updatePeriodDisplay("producao");
    updatePeriodDisplay("financeiro");
    updatePeriodDisplay("rh");
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
  // FUNÇÃO PARA BUSCAR CATEGORIA DE RECEITA
  // ============================================================
  async function obterCategoriaReceitaVenda() {
    let { data: categoria } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("type", "receita")
      .ilike("name", "%faturamento%")
      .limit(1)
      .maybeSingle();
    if (!categoria) {
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
    return categoria.id;
  }

  // ============================================================
  // FUNÇÃO PARA CRIAR/ATUALIZAR CONTA A RECEBER
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
    const dueDateStr = dataReferencia;
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
      }
    } else {
      const { error } = await supabase.from("financial_transactions").insert({
        type: "receber",
        amount: valorTotal,
        description: descricao,
        date: new Date().toISOString().split("T")[0],
        due_date: dueDateStr,
        status: "pendente",
        account_id: categoriaId,
        category_id: categoriaId,
        service_order_id: osId,
        notes: `Gerado do lote. Cliente: ${clienteNome}`,
      });
      if (error) {
        console.error("❌ Erro ao criar conta a receber:", error);
      }
    }
  }

  // ============================================================
  // FUNÇÃO PARA ATUALIZAR CONTA A RECEBER
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
    }
  }

  // ============================================================
  // VARIÁVEIS GLOBAIS
  // ============================================================
  let abaAtual = "geral";
  let dados = {};
  let carregando = false;
  let visualizacaoFinanceiro = "cards";

  // ============================================================
  // ELEMENTOS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const appContent = $("appContent");
  const refreshIcon = $("refreshIcon");
  const pullIndicator = $("pullIndicator");
  const scrollTopBtn = $("scrollTopBtn");

  // ============================================================
  // FUNÇÃO PARA BUSCAR PARCELAS DE UMA TRANSAÇÃO
  // ============================================================
  async function buscarParcelasDaTransacao(transactionId) {
    try {
      const { data, error } = await supabase
        .from("financial_installments")
        .select("*")
        .eq("transaction_id", transactionId)
        .order("numero_parcela", { ascending: true });
      if (error) {
        console.error("Erro ao buscar parcelas:", error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error("Erro ao buscar parcelas:", e);
      return [];
    }
  }

  // ============================================================
  // CARREGAR DADOS INICIAIS (DADOS QUE NÃO DEPENDEM DE PERÍODO)
  // ============================================================
  async function carregarDadosIniciais() {
    console.log("🔄 Carregando dados iniciais do Supabase...");
    if (carregando) return;
    carregando = true;
    refreshIcon.className = "ph ph-spinner spinning";

    try {
      // Carregar funcionários (não depende de período)
      const { data: funcionarios, error: errFunc } = await supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("full_name");
      if (errFunc) console.error("❌ Erro funcionários:", errFunc);

      // Carregar dívidas (não depende de período)
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

      // Armazenar dados que não dependem de período
      dados.funcionarios = funcionarios || [];
      dados.dividas = dividas || [];
      dados.totalDividas = totalDividas || 0;
      dados.saldoDevedor = saldoDevedor || 0;

      // Carregar dados do período atual para cada aba
      await carregarProducaoPeriodo();
      await carregarFinanceiroPeriodo();
      await carregarRHPeriodo();

      console.log("✅ Dados iniciais carregados!");
    } catch (e) {
      console.error("❌ Erro ao carregar dados iniciais:", e);
      showToast("Erro", "Falha ao carregar dados do Supabase.", "error");
    } finally {
      carregando = false;
      refreshIcon.className = "ph ph-arrows-clockwise";
      pullIndicator.classList.remove("active");
    }
  }

  // ============================================================
  // CARREGAR PRODUÇÃO POR PERÍODO
  // ============================================================
  async function carregarProducaoPeriodo() {
    try {
      const periodo = periodState.producao;
      const mesRange = getMonthRangeForDate(periodo);

      console.log(
        `📊 Carregando produção para: ${mesRange.mes}/${mesRange.ano}`,
      );

      // Buscar OS do período
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
        .or(
          `received_date.gte.${mesRange.inicio},received_date.lte.${mesRange.fim},expected_delivery.gte.${mesRange.inicio},expected_delivery.lte.${mesRange.fim}`,
        )
        .order("created_at", { ascending: false });

      const { data: todasOS, error: errOs } = await queryOS;
      if (errOs) {
        console.error("❌ Erro ao buscar OS:", errOs);
        return;
      }

      const osAtivas = (todasOS || []).filter(
        (o) => !["cancelado"].includes(o.status),
      );

      // Buscar progresso das OS
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

      dados.osAtivas = osAtivas || [];
      dados.progressoMap = progressoMap || {};
      dados.emCostura = osAtivas.filter(
        (o) => o.status === "em_costura",
      ).length;
      dados.costurados = osAtivas.filter(
        (o) => o.status === "costurado",
      ).length;

      // Renderizar produção
      renderizarProducao(dados);
      console.log(`✅ Produção carregada: ${osAtivas.length} OS`);
    } catch (e) {
      console.error("❌ Erro ao carregar produção:", e);
      showToast("Erro", "Falha ao carregar dados de produção.", "error");
    }
  }

  // ============================================================
  // CARREGAR FINANCEIRO POR PERÍODO (COM GERAÇÃO DE RECORRENTES)
  // ============================================================
  async function carregarFinanceiroPeriodo() {
    try {
      const periodo = periodState.financeiro;
      const mesRange = getMonthRangeForDate(periodo);

      console.log(
        `💰 Carregando financeiro para: ${mesRange.mes}/${mesRange.ano}`,
      );

      // ========== VERIFICAR E GERAR CONTAS RECORRENTES ==========
      // Sempre gerar transações futuras quando carregar o financeiro
      await verificarEGerarRecorrentesPorPeriodo(
        mesRange.inicio,
        mesRange.fim,
        true, // gerarFuturos = true
      );

      // Buscar transações avulsas do período
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

      // Buscar parcelas do período
      const { data: parcelasPeriodo, error: errParc } = await supabase
        .from("financial_installments")
        .select(
          "transaction_id, id, numero_parcela, valor, vencimento, status, payment_date, interest_paid, late_fee_paid",
        )
        .gte("vencimento", mesRange.inicio)
        .lte("vencimento", mesRange.fim)
        .order("vencimento", { ascending: true });
      if (errParc) console.error("❌ Erro parcelas:", errParc);

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
        if (errParceladas) console.error("❌ Erro parceladas:", errParceladas);
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

      dados.eventosFinanceiros = eventosFinanceiros || [];
      dados.totalReceitas = totalReceitas || 0;
      dados.totalDespesas = totalDespesas || 0;
      dados.totalPagar = totalPagar || 0;
      dados.totalReceber = totalReceber || 0;
      dados.contasVencidas = contasVencidas || 0;

      // Renderizar financeiro
      renderizarFinanceiro(dados);
      console.log(
        `✅ Financeiro carregado: ${eventosFinanceiros.length} eventos`,
      );
    } catch (e) {
      console.error("❌ Erro ao carregar financeiro:", e);
      showToast("Erro", "Falha ao carregar dados financeiros.", "error");
    }
  }

  // ============================================================
  // CARREGAR RH POR PERÍODO
  // ============================================================
  async function carregarRHPeriodo() {
    try {
      const periodo = periodState.rh;
      const mesRange = getMonthRangeForDate(periodo);
      const hoje = todayISO();

      console.log(`👤 Carregando RH para: ${mesRange.mes}/${mesRange.ano}`);

      // Buscar férias do período
      const { data: ferias, error: errFer } = await supabase
        .from("employee_vacations")
        .select(
          "*, employees(full_name, role, photo_url, phone_cell, email_personal)",
        )
        .eq("status", "agendada")
        .lte("start_date", mesRange.fim)
        .gte("end_date", mesRange.inicio)
        .order("start_date", { ascending: true });
      if (errFer) console.error("❌ Erro férias:", errFer);

      // Buscar afastamentos do período
      const { data: afastamentos, error: errAbs } = await supabase
        .from("absences")
        .select(
          `
          *,
          employees(full_name, role, photo_url, phone_cell, email_personal)
        `,
        )
        .lte("start_date", mesRange.fim)
        .gte("end_date", mesRange.inicio)
        .order("start_date", { ascending: false });
      if (errAbs) console.error("❌ Erro afastamentos:", errAbs);

      dados.ferias = ferias || [];
      dados.afastamentos = afastamentos || [];

      // Renderizar RH
      renderizarRH(dados);
      console.log(
        `✅ RH carregado: ${ferias.length} férias, ${afastamentos.length} afastamentos`,
      );
    } catch (e) {
      console.error("❌ Erro ao carregar RH:", e);
      showToast("Erro", "Falha ao carregar dados de RH.", "error");
    }
  }

  // ============================================================
  // FUNÇÃO PARA ABRIR MODAL COM DETALHES COMPLETOS DA CONTA (INCLUINDO PARCELAS)
  // ============================================================
  window.abrirModalConta = async function (id) {
    const evento = dados.eventosFinanceiros?.find((e) => e.id === id);
    if (!evento) {
      showToast("Erro", "Conta não encontrada.", "error");
      return;
    }

    const transactionId = evento.transaction_id || id;
    const transacaoOriginal = evento.transacao_original || null;
    const isParcelada =
      evento.isParcela ||
      (transacaoOriginal && transacaoOriginal.installments === true);

    let todasParcelas = [];
    let parcelasHtml = "";

    if (isParcelada) {
      todasParcelas = await buscarParcelasDaTransacao(transactionId);

      if (todasParcelas && todasParcelas.length > 0) {
        const hoje = new Date();
        const totalParcelas = todasParcelas.length;
        const pagas = todasParcelas.filter((p) => p.status === "pago").length;
        const pendentes = totalParcelas - pagas;
        const totalValor = todasParcelas.reduce(
          (sum, p) => sum + parseFloat(p.valor),
          0,
        );
        const totalPago = todasParcelas
          .filter((p) => p.status === "pago")
          .reduce((sum, p) => sum + parseFloat(p.valor), 0);

        parcelasHtml = `
          <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h4 style="margin: 0; color: var(--gold-light); font-size: 0.9rem;">
                <i class="ph ph-receipt"></i> Parcelas (${pagas}/${totalParcelas})
              </h4>
              <div style="font-size: 0.7rem; color: var(--gray);">
                Total: ${formatCurrency(totalValor)} | Pago: ${formatCurrency(totalPago)}
              </div>
            </div>
            <div style="max-height: 300px; overflow-y: auto;">
              ${todasParcelas
                .map((p) => {
                  const isPaga = p.status === "pago";
                  const isVencida = !isPaga && new Date(p.vencimento) < hoje;
                  const isMesAtual =
                    !isPaga &&
                    !isVencida &&
                    new Date(p.vencimento).getMonth() === hoje.getMonth() &&
                    new Date(p.vencimento).getFullYear() === hoje.getFullYear();

                  let statusCor = "var(--gray)";
                  let statusTexto = "⏳ Pendente";
                  let bgCor = "rgba(255,255,255,0.02)";
                  let borderCor = "var(--gray)";

                  if (isPaga) {
                    statusCor = "var(--success)";
                    statusTexto = "✅ Paga";
                    bgCor = "rgba(76,175,80,0.05)";
                    borderCor = "var(--success)";
                  } else if (isVencida) {
                    statusCor = "var(--error)";
                    statusTexto = "🔴 Vencida";
                    bgCor = "rgba(255,82,82,0.08)";
                    borderCor = "var(--error)";
                  } else if (isMesAtual) {
                    statusCor = "var(--warning)";
                    statusTexto = "🟡 Mês atual";
                    bgCor = "rgba(255,193,7,0.08)";
                    borderCor = "var(--warning)";
                  }

                  return `
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    margin-bottom: 4px;
                    background: ${bgCor};
                    border-radius: 8px;
                    border-left: 3px solid ${borderCor};
                  ">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                      <span style="font-weight: 600; font-size: 0.85rem; min-width: 40px;">
                        ${p.numero_parcela}ª
                      </span>
                      <div>
                        <div style="font-size: 0.75rem; color: var(--gray);">
                          Vence: ${formatDate(p.vencimento)}
                          ${p.payment_date ? `• Pago em: ${formatDate(p.payment_date)}` : ""}
                        </div>
                        ${
                          p.interest_paid > 0 || p.late_fee_paid > 0
                            ? `
                          <div style="font-size: 0.65rem; color: var(--gray-dark);">
                            ${p.interest_paid > 0 ? `Juros: ${formatCurrency(p.interest_paid)}` : ""}
                            ${p.late_fee_paid > 0 ? `• Multa: ${formatCurrency(p.late_fee_paid)}` : ""}
                          </div>
                        `
                            : ""
                        }
                      </div>
                    </div>
                    <div style="text-align: right; flex-shrink: 0; margin-left: 12px;">
                      <div style="font-weight: 700; font-size: 0.9rem;">
                        ${formatCurrency(p.valor)}
                      </div>
                      <div style="font-size: 0.6rem; color: ${statusCor};">
                        ${statusTexto}
                      </div>
                    </div>
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        `;
      }
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

    let infoParcelas = "";
    if (isParcelada && todasParcelas.length > 0) {
      const pagas = todasParcelas.filter((p) => p.status === "pago").length;
      const total = todasParcelas.length;
      infoParcelas = ` • ${pagas}/${total} parcelas pagas`;
    }

    const html = `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:1.1rem;color:var(--gold-light);">${evento.descricao}</h3>
        <p style="color:var(--gray);font-size:0.85rem;">${evento.categoria || "Sem categoria"}${infoParcelas}</p>
        <p style="color:${statusColor};font-weight:600;font-size:0.9rem;margin-top:4px;">${statusText}</p>
      </div>
      <div class="info-row"><span class="label">Valor</span><span class="value gold">${formatCurrency(evento.valor)}</span></div>
      <div class="info-row"><span class="label">Vencimento</span><span class="value">${formatDate(evento.vencimento)}</span></div>
      <div class="info-row"><span class="label">Tipo</span><span class="value ${isPagar ? "danger" : "success"}">${isPagar ? "A Pagar" : "A Receber"}</span></div>
      ${evento.payment_method ? `<div class="info-row"><span class="label">Forma de Pagamento</span><span class="value">${evento.payment_method}</span></div>` : ""}
      ${
        evento.isParcela
          ? `
        <div class="info-row"><span class="label">Parcela</span><span class="value">${evento.numero_parcela}/${evento.total_parcelas}</span></div>
        ${evento.interest_paid ? `<div class="info-row"><span class="label">Juros pagos</span><span class="value">${formatCurrency(evento.interest_paid)}</span></div>` : ""}
        ${evento.late_fee_paid ? `<div class="info-row"><span class="label">Multa paga</span><span class="value">${formatCurrency(evento.late_fee_paid)}</span></div>` : ""}
      `
          : ""
      }
      ${parcelasHtml}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.7rem;color:var(--gray-dark);text-align:center;">ID: ${evento.id}</div>
      </div>
    `;

    openModal("Detalhes da Conta", html);
  };

  // ============================================================
  // FUNÇÃO PARA VISUALIZAR LOTE
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
      showToast("Erro", "Lote não encontrado.", "error");
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
    const paymentStatus = lote.payment_status || "pendente";
    const paymentInfo = getPaymentStatusInfo(paymentStatus);
    const statusColor = getStatusColor(lote.status);
    const statusIcon = getStatusIcon(lote.status);
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
    const html = `
      <div style="display:grid; gap:10px;">
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
      showToast("Erro", "OS não encontrada.", "error");
      return;
    }
    const { data: items } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", id)
      .order("size");
    if (!items || items.length === 0) {
      showToast(
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
          showToast(
            "Aviso",
            "Informe pelo menos uma quantidade costurada.",
            "warning",
          );
          return;
        }
        const loginResult = await abrirModalLogin("registrar costura parcial");
        if (!loginResult.success) {
          showToast(
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
                showToast(
                  "Sucesso",
                  "Costura registrada com sucesso!",
                  "success",
                );
                setTimeout(() => carregarProducaoPeriodo(), 500);
              });
            document
              .getElementById("concluirCosturaAgora")
              ?.addEventListener("click", async () => {
                await supabase
                  .from("service_orders")
                  .update({ status: "costurado" })
                  .eq("id", id);
                document.getElementById("modalContainer").innerHTML = "";
                showToast(
                  "Sucesso",
                  "Costura registrada e lote marcado como Costurado!",
                  "success",
                );
                setTimeout(() => carregarProducaoPeriodo(), 500);
              });
          } else {
            showToast(
              "Sucesso",
              `${totalCosturadoAgora} peça(s) registrada(s)! Total costurado: ${totalCosturado}/${os.total_quantity}`,
              "success",
            );
            setTimeout(() => carregarProducaoPeriodo(), 500);
          }
        } catch (error) {
          console.error("Erro ao registrar costura:", error);
          showToast("Erro", "Falha ao registrar costura.", "error");
        }
      });
  };

  // ============================================================
  // CRUD DE LOTES COM CONTROLE DE PAGAMENTO INTEGRADO
  // ============================================================

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
            showToast(
              "Erro",
              "Preencha todos os campos obrigatórios.",
              "error",
            );
            return;
          }
          const loginResult = await abrirModalLogin("cadastrar novo lote");
          if (!loginResult.success) {
            showToast(
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
              showToast(
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
              showToast(
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
            const descricaoConta = `Lote ${orderNumber} - ${produto}`;
            await criarContaReceber(
              novaOS.id,
              total,
              descricaoConta,
              prazo,
              cliente,
              "recebido",
            );
            document.getElementById("modalContainer").innerHTML = "";
            showToast(
              "Sucesso",
              `Lote ${orderNumber} criado com referência ${referencia}! 💰 Conta a receber gerada com vencimento em ${formatDate(prazo)}.`,
              "success",
            );
            setTimeout(() => carregarProducaoPeriodo(), 500);
          } catch (error) {
            console.error("Erro ao criar lote:", error);
            showToast("Erro", "Falha ao criar lote: " + error.message, "error");
          }
        });
    });

  window.iniciarCosturaLote = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("iniciar costura");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
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
      showToast("Sucesso", `🧵 Lote ${orderNumber} em costura!`, "success");
      setTimeout(() => carregarProducaoPeriodo(), 500);
    } catch (error) {
      console.error("Erro ao iniciar costura:", error);
      showToast("Erro", "Falha ao iniciar costura.", "error");
    }
  };

  window.finalizarCosturaLote = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("finalizar costura");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
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
      showToast(
        "Sucesso",
        `✅ Lote ${orderNumber} costurado! Aguardando entrega.`,
        "success",
      );
      setTimeout(() => carregarProducaoPeriodo(), 500);
    } catch (error) {
      console.error("Erro ao finalizar costura:", error);
      showToast("Erro", "Falha ao finalizar costura.", "error");
    }
  };

  window.marcarEntregue = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("marcar lote como entregue");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
      return;
    }
    try {
      const { data: lote } = await supabase
        .from("service_orders")
        .select("*, customers(company_name, trade_name)")
        .eq("id", id)
        .single();
      if (!lote) {
        showToast("Erro", "Lote não encontrado.", "error");
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
      showToast(
        "Sucesso",
        `📦 Lote ${orderNumber} entregue! 💰 Conta a receber gerada com vencimento em ${formatDate(lote.expected_delivery)}.`,
        "success",
      );
      setTimeout(() => {
        carregarProducaoPeriodo();
        carregarFinanceiroPeriodo();
      }, 500);
    } catch (error) {
      console.error("Erro ao marcar como entregue:", error);
      showToast("Erro", "Falha ao marcar lote como entregue.", "error");
    }
  };

  window.marcarPago = async function (id, orderNumber) {
    const loginResult = await abrirModalLogin("marcar lote como pago");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
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
      showToast(
        "Sucesso",
        `💳 Lote ${orderNumber} marcado como pago!`,
        "success",
      );
      setTimeout(() => {
        carregarProducaoPeriodo();
        carregarFinanceiroPeriodo();
      }, 500);
    } catch (error) {
      console.error("Erro ao marcar como pago:", error);
      showToast("Erro", "Falha ao marcar lote como pago.", "error");
    }
  };

  window.cancelarLote = async function (id, orderNumber) {
    const { data: conta, error: contaError } = await supabase
      .from("financial_transactions")
      .select("id, status, amount")
      .eq("service_order_id", id)
      .eq("type", "receber")
      .maybeSingle();
    if (conta && conta.status === "pago") {
      const htmlBloqueio = `
        <div style="text-align: center; padding: 12px 0;">
          <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
          <h3 style="color: var(--error); margin-bottom: 8px;">Não é possível cancelar!</h3>
          <p style="color: var(--gray); font-size: 0.95rem;">
            Este lote já possui <strong style="color: var(--success);">pagamento confirmado</strong>.
          </p>
          <p style="color: var(--gray-dark); font-size: 0.85rem; margin-top: 4px;">
            Valor: ${formatCurrency(conta.amount)}
          </p>
          <div style="background: rgba(255,82,82,0.08); border-radius: 8px; padding: 12px; margin-top: 12px; border-left: 3px solid var(--error);">
            <p style="color: var(--gray); font-size: 0.8rem; margin: 0;">
              <i class="ph ph-info"></i> Para cancelar, primeiro estorne o pagamento.
            </p>
          </div>
          <button class="btn btn-primary" id="btnEntendiCancelar" style="margin-top: 16px; width: 100%;">
            <i class="ph ph-check-circle"></i> Entendi
          </button>
        </div>
      `;
      openModal("⚠️ Ação Bloqueada", htmlBloqueio);
      document
        .getElementById("btnEntendiCancelar")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
        });
      return;
    }
    if (!confirm(`Cancelar o lote ${orderNumber}?`)) return;
    const loginResult = await abrirModalLogin("cancelar lote");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
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
        console.log(
          `✅ Conta a receber removida por cancelamento: ${conta.id}`,
        );
      }
      const { error } = await supabase
        .from("service_orders")
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) throw error;
      const card = document.querySelector(`.list-item[data-id="${id}"]`);
      if (card) pulseElement(card);
      showToast("Sucesso", `❌ Lote ${orderNumber} cancelado.`, "success");
      setTimeout(() => {
        carregarProducaoPeriodo();
        carregarFinanceiroPeriodo();
      }, 500);
    } catch (error) {
      console.error("Erro ao cancelar lote:", error);
      showToast("Erro", "Falha ao cancelar lote.", "error");
    }
  };

  window.excluirLote = async function (id, orderNumber) {
    try {
      const { data: conta, error: contaError } = await supabase
        .from("financial_transactions")
        .select("id, status, amount")
        .eq("service_order_id", id)
        .eq("type", "receber")
        .maybeSingle();
      if (conta && conta.status === "pago") {
        const htmlBloqueio = `
          <div style="text-align: center; padding: 12px 0;">
            <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
            <h3 style="color: var(--error); margin-bottom: 8px;">Não é possível excluir!</h3>
            <p style="color: var(--gray); font-size: 0.95rem;">
              Este lote já possui <strong style="color: var(--success);">pagamento confirmado</strong>.
            </p>
            <p style="color: var(--gray-dark); font-size: 0.85rem; margin-top: 4px;">
              Valor: ${formatCurrency(conta.amount)}
            </p>
            <div style="background: rgba(255,82,82,0.08); border-radius: 8px; padding: 12px; margin-top: 12px; border-left: 3px solid var(--error);">
              <p style="color: var(--gray); font-size: 0.8rem; margin: 0;">
                <i class="ph ph-info"></i> Para excluir, primeiro estorne o pagamento.
              </p>
            </div>
            <button class="btn btn-primary" id="btnEntendiExcluir" style="margin-top: 16px; width: 100%;">
              <i class="ph ph-check-circle"></i> Entendi
            </button>
          </div>
        `;
        openModal("⚠️ Ação Bloqueada", htmlBloqueio);
        document
          .getElementById("btnEntendiExcluir")
          ?.addEventListener("click", () => {
            document.getElementById("modalContainer").innerHTML = "";
          });
        return;
      }
      let mensagemAdicional = "";
      if (conta && conta.status === "pendente") {
        mensagemAdicional = `
          <div style="background: rgba(255,193,7,0.08); border-radius: 8px; padding: 12px; margin-top: 8px; border-left: 3px solid var(--warning);">
            <p style="color: var(--gray); font-size: 0.8rem; margin: 0;">
              <i class="ph ph-info"></i> A conta a receber de <strong>${formatCurrency(conta.amount)}</strong> 
              será removida automaticamente.
            </p>
          </div>
        `;
      }
      const htmlConfirmacao = `
        <div style="text-align: center; padding: 8px 0;">
          <div style="font-size: 3rem; margin-bottom: 12px;">🗑️</div>
          <h3 style="color: var(--error); margin-bottom: 8px;">Excluir Lote</h3>
          <p style="color: var(--gold-light); font-size: 1.1rem; font-weight: 600;">
            ${orderNumber}
          </p>
          <p style="color: var(--gray); font-size: 0.9rem;">
            Tem certeza que deseja excluir este lote?
          </p>
          <p style="color: var(--gray-dark); font-size: 0.8rem;">
            Esta ação <strong style="color: var(--error);">não pode ser desfeita</strong>.
          </p>
          ${mensagemAdicional}
          <div style="display: flex; gap: 8px; margin-top: 16px;">
            <button class="btn btn-ghost" id="btnCancelarExclusao" style="flex: 1; padding: 12px;">
              <i class="ph ph-x-circle"></i> Cancelar
            </button>
            <button class="btn btn-primary" id="btnConfirmarExclusao" style="flex: 1; padding: 12px; background: var(--error); border-color: var(--error);">
              <i class="ph ph-trash"></i> Excluir
            </button>
          </div>
          ${
            conta && conta.status === "pendente"
              ? `
            <p style="color: var(--gray-dark); font-size: 0.7rem; margin-top: 12px;">
              <i class="ph ph-currency-circle-dollar"></i> Conta a receber de ${formatCurrency(conta.amount)} será removida
            </p>
          `
              : ""
          }
        </div>
      `;
      openModal("⚠️ Confirmar Exclusão", htmlConfirmacao);
      document
        .getElementById("btnCancelarExclusao")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
        });
      document
        .getElementById("btnConfirmarExclusao")
        ?.addEventListener("click", async function () {
          this.disabled = true;
          this.innerHTML =
            '<i class="ph ph-spinner spinning"></i> Excluindo...';
          const loginResult = await abrirModalLogin("excluir lote");
          if (!loginResult.success) {
            document.getElementById("modalContainer").innerHTML = "";
            showToast(
              "Ação cancelada",
              "Você precisa estar autenticado.",
              "warning",
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
              console.log(`✅ Conta a receber removida: ${conta.id}`);
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
            await supabase
              .from("shipments")
              .delete()
              .eq("service_order_id", id);
            await supabase
              .from("material_consumption")
              .delete()
              .eq("service_order_id", id);
            const { error } = await supabase
              .from("service_orders")
              .delete()
              .eq("id", id);
            if (error) throw error;
            document.getElementById("modalContainer").innerHTML = "";
            showToast(
              "Sucesso",
              `Lote ${orderNumber} excluído com sucesso!`,
              "success",
            );
            setTimeout(() => carregarProducaoPeriodo(), 500);
          } catch (error) {
            console.error("Erro ao excluir lote:", error);
            document.getElementById("modalContainer").innerHTML = "";
            showToast(
              "Erro",
              "Falha ao excluir lote: " + error.message,
              "error",
            );
          }
        });
    } catch (error) {
      console.error("Erro ao excluir lote:", error);
      showToast("Erro", "Falha ao excluir lote.", "error");
    }
  };

  window.editarLote = async function (id) {
    const { data: lote, error: fetchError } = await supabase
      .from("service_orders")
      .select("*, customers(company_name, trade_name)")
      .eq("id", id)
      .single();
    if (fetchError || !lote) {
      showToast("Erro", "Lote não encontrado.", "error");
      return;
    }
    const loginResult = await abrirModalLogin("editar lote");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
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
              <option value="recebido" ${lote.status === "recebido" ? "selected" : ""}>📥 Lote Recebido</option>
              <option value="em_costura" ${lote.status === "em_costura" ? "selected" : ""}>🧵 Em Costura</option>
              <option value="costurado" ${lote.status === "costurado" ? "selected" : ""}>✅ Costurado</option>
              <option value="entregue" ${lote.status === "entregue" ? "selected" : ""}>📦 Entregue</option>
              <option value="cancelado" ${lote.status === "cancelado" ? "selected" : ""}>❌ Cancelado</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status de Pagamento</label>
            <select id="editPagamento" class="form-select">
              <option value="pendente" ${lote.payment_status === "pendente" || !lote.payment_status ? "selected" : ""}>⏳ Pagamento Pendente</option>
              <option value="pago" ${lote.payment_status === "pago" ? "selected" : ""}>✅ Pagamento Recebido</option>
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
          showToast("Erro", "Preencha todos os campos obrigatórios.", "error");
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
          showToast(
            "Sucesso",
            `✅ Lote ${lote.order_number} atualizado!`,
            "success",
          );
          setTimeout(() => {
            carregarProducaoPeriodo();
            carregarFinanceiroPeriodo();
          }, 500);
        } catch (error) {
          console.error("Erro ao editar lote:", error);
          showToast("Erro", "Falha ao editar lote: " + error.message, "error");
        }
      });
  };

  window.enviarRevisao = async function (id, orderNumber) {
    if (!confirm(`Enviar o lote ${orderNumber} para revisão?`)) return;
    const loginResult = await abrirModalLogin("enviar para revisão");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
      return;
    }
    try {
      const { error } = await supabase
        .from("service_orders")
        .update({ status: "em_revisao" })
        .eq("id", id);
      if (error) throw error;
      showToast(
        "Sucesso",
        `🔍 Lote ${orderNumber} enviado para revisão.`,
        "success",
      );
      setTimeout(() => carregarProducaoPeriodo(), 500);
    } catch (error) {
      console.error("Erro ao enviar para revisão:", error);
      showToast("Erro", "Falha ao enviar para revisão.", "error");
    }
  };

  window.voltarCostura = async function (id, orderNumber) {
    if (!confirm(`Retornar o lote ${orderNumber} para costura?`)) return;
    const loginResult = await abrirModalLogin("voltar para costura");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
      return;
    }
    try {
      const { error } = await supabase
        .from("service_orders")
        .update({ status: "em_costura" })
        .eq("id", id);
      if (error) throw error;
      showToast(
        "Sucesso",
        `🔄 Lote ${orderNumber} voltou para costura.`,
        "success",
      );
      setTimeout(() => carregarProducaoPeriodo(), 500);
    } catch (error) {
      console.error("Erro ao voltar para costura:", error);
      showToast("Erro", "Falha ao voltar para costura.", "error");
    }
  };

  // ============================================================
  // RENDERIZAR LISTA DE LOTES (PRODUÇÃO)
  // ============================================================
  function renderizarProducao(dados) {
    console.log("📊 renderizarProducao chamada com dados:", dados);
    const { osAtivas } = dados;
    const hoje = new Date();
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
    console.log("📊 Status calculados:", {
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
    const container = document.getElementById("listaProducao");
    const totalEl = document.getElementById("totalLotes");
    if (totalEl) {
      totalEl.textContent = (osAtivas || []).length + " lotes";
    }
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
            !["cancelado", "entregue", "pago"].includes(os.status);
          const paymentStatus = os.payment_status || "pendente";
          const paymentInfo = getPaymentStatusInfo(paymentStatus);
          const statusColor = getStatusColor(os.status);
          const statusIcon = getStatusIcon(os.status);
          const referencia =
            os.product_reference || os.order_number || "Sem referência";
          const orderNumber = os.order_number || "";
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
                <span>${faltamCosturar > 0 ? `⏳ Faltam ${faltamCosturar} para costurar` : "✅ Tudo costurado!"}</span>
                <span>${faltamEntregar > 0 ? `📦 Faltam ${faltamEntregar} para entregar` : "✅ Tudo entregue!"}</span>
              </div>
              ${atrasado ? '<span style="font-size:0.55rem; color:var(--error);"><i class="ph ph-warning"></i> Atrasado</span>' : ""}
            </div>
          `;
          const valorTotal = os.total_quantity * os.unit_price;
          const statusProducaoLabel = formatStatus(os.status);
          const statusPagamentoLabel = paymentInfo.label;
          let botoesPrincipais = "";
          if (os.status === "recebido") {
            botoesPrincipais = `
              <button class="btn-action btn-action-primary" onclick="event.stopPropagation(); iniciarCosturaLote('${os.id}', '${os.order_number}')" style="padding:6px 14px; font-size:0.65rem;">
                <i class="ph ph-play"></i> Iniciar Costura
              </button>
            `;
          } else if (os.status === "em_costura") {
            const pctText =
              percentCosturado > 0 ? ` (${percentCosturado}%)` : "";
            botoesPrincipais = `
              <button class="btn-action btn-action-ghost" onclick="event.stopPropagation(); registrarCosturaParcial('${os.id}')" style="padding:6px 14px; font-size:0.65rem;">
                <i class="ph ph-thread"></i> Registrar
              </button>
              <button class="btn-action btn-action-success" onclick="event.stopPropagation(); finalizarCosturaLote('${os.id}', '${os.order_number}')" style="padding:6px 14px; font-size:0.65rem;">
                <i class="ph ph-check-circle"></i> Finalizar${pctText}
              </button>
            `;
          } else if (os.status === "costurado") {
            botoesPrincipais = `
              <button class="btn-action btn-action-success" onclick="event.stopPropagation(); marcarEntregue('${os.id}', '${os.order_number}')" style="padding:6px 14px; font-size:0.65rem;">
                <i class="ph ph-truck"></i> Entregar
              </button>
            `;
          } else if (os.status === "entregue") {
            if (paymentStatus === "pendente") {
              const totalPendente = valorTotal;
              botoesPrincipais = `
                <button class="btn-action btn-action-payment" onclick="event.stopPropagation(); marcarPago('${os.id}', '${os.order_number}')" style="padding:6px 14px; font-size:0.65rem; background:rgba(76,175,80,0.2); color:#a5d6a7; border:1px solid rgba(76,175,80,0.3);">
                  <i class="ph ph-currency-dollar"></i> Receber R$ ${formatCurrency(totalPendente)}
                </button>
              `;
            } else {
              botoesPrincipais = `
                <span style="font-size:0.65rem; color:var(--success); padding:4px 12px; background:rgba(76,175,80,0.1); border-radius:20px;">
                  <i class="ph ph-check-circle"></i> Pagamento Recebido
                </span>
              `;
            }
          } else if (os.status === "cancelado") {
            botoesPrincipais = `
              <span style="font-size:0.65rem; color:var(--error); padding:4px 12px; background:rgba(255,82,82,0.1); border-radius:20px;">
                <i class="ph ph-x-circle"></i> Cancelado
              </span>
            `;
          } else {
            botoesPrincipais = `<span style="font-size:0.65rem; color:var(--gray);">${formatStatus(os.status)}</span>`;
          }
          let menuItems = "";
          menuItems += `
            <a href="#" class="action-item action-view" onclick="event.stopPropagation(); visualizarLote('${os.id}')" style="padding:6px 12px; font-size:0.7rem;">
              <i class="ph ph-eye"></i> Visualizar
            </a>
          `;
          menuItems += `
            <a href="#" class="action-item action-edit" onclick="event.stopPropagation(); editarLote('${os.id}')" style="padding:6px 12px; font-size:0.7rem;">
              <i class="ph ph-pencil-simple"></i> Editar
            </a>
          `;
          if (os.status !== "cancelado" && os.status !== "entregue") {
            menuItems += `
              <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
              <a href="#" class="action-item action-register" onclick="event.stopPropagation(); registrarCosturaParcial('${os.id}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-thread"></i> Registrar Progresso
              </a>
            `;
          }
          if (os.status === "recebido") {
            menuItems += `
              <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
              <a href="#" class="action-item action-start" onclick="event.stopPropagation(); iniciarCosturaLote('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-play"></i> Iniciar Costura
              </a>
            `;
          } else if (os.status === "em_costura") {
            menuItems += `
              <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
              <a href="#" class="action-item action-finish" onclick="event.stopPropagation(); finalizarCosturaLote('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-check-circle"></i> Finalizar Costura
              </a>
            `;
          } else if (os.status === "costurado") {
            menuItems += `
              <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
              <a href="#" class="action-item action-deliver" onclick="event.stopPropagation(); marcarEntregue('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-truck"></i> Marcar como Entregue
              </a>
              <a href="#" class="action-item action-review" onclick="event.stopPropagation(); enviarRevisao('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-warning-circle"></i> Enviar para Revisão
              </a>
              <a href="#" class="action-item action-back" onclick="event.stopPropagation(); voltarCostura('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-arrow-u-up-left"></i> Voltar para Costura
              </a>
            `;
          } else if (os.status === "em_revisao") {
            menuItems += `
              <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
              <a href="#" class="action-item action-back" onclick="event.stopPropagation(); voltarCostura('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-arrow-u-up-left"></i> Voltar para Costura
              </a>
            `;
          } else if (os.status === "entregue") {
            if (paymentStatus === "pendente") {
              menuItems += `
                <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
                <a href="#" class="action-item action-finish" onclick="event.stopPropagation(); marcarPago('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                  <i class="ph ph-currency-dollar"></i> Marcar como Pago
                </a>
              `;
            }
          }
          if (os.status !== "cancelado") {
            menuItems += `
              <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
              <a href="#" class="action-item action-cancel" onclick="event.stopPropagation(); cancelarLote('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
                <i class="ph ph-x-circle"></i> Cancelar Lote
              </a>
            `;
          }
          menuItems += `
            <div class="dropdown-divider" style="margin:4px 0; border-color:rgba(255,255,255,0.05);"></div>
            <a href="#" class="action-item action-delete" onclick="event.stopPropagation(); excluirLote('${os.id}', '${os.order_number}')" style="padding:6px 12px; font-size:0.7rem;">
              <i class="ph ph-trash"></i> Excluir
            </a>
          `;
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
                   padding: 16px 18px; 
                   margin-bottom: 14px;
                   border-radius: 12px;
                   border: 1px solid rgba(255,255,255,0.06);
                   border-left: 4px solid ${borderColor};
                   background: ${bgColor};
                   box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                   transition: all 0.25s ease;
                   cursor: pointer;
                 "
                 onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)'; this.style.transform='translateY(-2px)';"
                 onmouseleave="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'; this.style.transform='translateY(0)';"
                 onclick="visualizarLote('${os.id}')"
                 >
              
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 17px; font-weight: 700; color: ${atrasado ? "var(--error)" : "var(--gold-light)"}; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <i class="ph ${statusIcon}" style="color: ${statusColor}; font-size: 18px;"></i>
                    <span>Ref: ${referencia}</span>
                  </div>
                  
                  <div style="font-size: 11px; color: var(--gray-dark); margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px 14px;">
                    <span><i class="ph ph-files"></i> OS: ${orderNumber}</span>
                    <span><i class="ph ph-user"></i> ${cliente}</span>
                    <span><i class="ph ph-package"></i> ${os.total_quantity || 0} peças</span>
                    <span><i class="ph ph-currency-circle-dollar"></i> ${formatCurrency(os.unit_price || 0)}/un</span>
                    ${os.expected_delivery ? ` <span><i class="ph ph-calendar"></i> Entrega: ${formatDate(os.expected_delivery)}</span>` : ""}
                    ${atrasado ? ` <span style="color:var(--error);"><i class="ph ph-warning"></i> Atrasado</span>` : ""}
                  </div>
                  
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                    <span style="font-size:0.6rem; color:${statusColor}; background:${statusColor}22; padding:3px 12px; border-radius:20px; border:1px solid ${statusColor}44; font-weight:500;">
                      <i class="ph ${statusIcon}"></i> ${statusProducaoLabel}
                    </span>
                    <span style="font-size:0.6rem; color:${paymentInfo.color}; background:${paymentInfo.bg}; padding:3px 12px; border-radius:20px; border:${paymentInfo.border}; font-weight:500;">
                      <i class="ph ${paymentInfo.icon}"></i> ${statusPagamentoLabel}
                    </span>
                  </div>
                </div>
              </div>

              ${progressoHtml}

              <div style="font-size:0.6rem; color:var(--gray-dark); margin-top:6px; display:flex; gap:16px; flex-wrap:wrap; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 8px;">
                <span><strong>💰 Total:</strong> ${formatCurrency(valorTotal)}</span>
                ${paymentStatus === "pago" && os.payment_date ? ` · <span><strong>📅 Pago em:</strong> ${formatDate(os.payment_date)}</span>` : ""}
                ${paymentStatus === "pendente" && os.status === "entregue" ? ` · <span style="color:var(--warning);"><i class="ph ph-clock"></i> Aguardando pagamento</span>` : ""}
                ${os.notes ? ` · <span><i class="ph ph-note"></i> ${os.notes}</span>` : ""}
              </div>

              <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 10px; align-items: center;">
                ${botoesPrincipais}
                
                <div style="position:relative; display:inline-block;">
                  <button class="btn-action btn-action-ghost" 
                          style="padding:4px 10px; font-size:0.65rem; border-radius:8px;"
                          onclick="event.stopPropagation(); window.toggleMenu('${menuId}')">
                    <i class="ph ph-gear-six"></i>
                  </button>
                  <div id="${menuId}" class="dropdown-actions-menu" style="display:none; position:absolute; bottom:100%; right:0; margin-bottom:4px; min-width:200px; background:var(--black-medium); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:4px; z-index:100; max-height:300px; overflow-y:auto;">
                    ${menuItems}
                  </div>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    } else {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 40px 16px; color: var(--gray-dark);">
          <i class="ph ph-factory" style="font-size: 40px; display: block; margin-bottom: 12px; color: var(--gray);"></i>
          <p style="font-size: 15px; font-weight: 500;">Nenhum lote cadastrado</p>
          <p style="font-size: 12px; color: var(--gray); margin-top: 4px;">Clique em "Novo Lote" para começar</p>
        </div>
      `;
    }
  }

  // ============================================================
  // FUNÇÃO PARA ABRIR MODAL DE BAIXA DE PARCELAS (COM SELEÇÃO INTELIGENTE)
  // ============================================================
  window.abrirBaixaParcelas = async function (transactionId) {
    console.log("📋 abrirBaixaParcelas chamado para:", transactionId);
    try {
      const { data: transacao, error: transError } = await supabase
        .from("financial_transactions")
        .select(
          `
          id, description, type, amount, 
          financial_installments(id, numero_parcela, valor, vencimento, status, payment_date)
        `,
        )
        .eq("id", transactionId)
        .single();
      if (transError || !transacao) {
        showToast("Erro", "Transação não encontrada.", "error");
        return;
      }
      const parcelas = transacao.financial_installments || [];
      if (parcelas.length === 0) {
        await baixarLancamento(transactionId);
        return;
      }
      const hoje = new Date();
      const hojeISO = todayISO();
      const mesAtual = hoje.getMonth();
      const anoAtual = hoje.getFullYear();
      const parcelasPendentes = parcelas.filter((p) => p.status !== "pago");
      if (parcelasPendentes.length === 0) {
        showToast("Aviso", "Todas as parcelas já foram pagas.", "info");
        return;
      }
      const totalPendente = parcelasPendentes.reduce(
        (sum, p) => sum + parseFloat(p.valor),
        0,
      );
      let parcelasHtml = parcelasPendentes
        .map((p) => {
          const dataVenc = new Date(p.vencimento);
          const isVencida = dataVenc < hoje;
          const isMesAtual =
            dataVenc.getMonth() === mesAtual &&
            dataVenc.getFullYear() === anoAtual;
          const isPaga = p.status === "pago";
          const deveSelecionar = (isVencida || isMesAtual) && !isPaga;
          return `
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            margin-bottom: 6px;
            background: ${isVencida ? "rgba(255,82,82,0.08)" : isMesAtual ? "rgba(255,193,7,0.08)" : "rgba(255,255,255,0.02)"};
            border-radius: 10px;
            border-left: 3px solid ${isVencida ? "var(--error)" : isMesAtual ? "var(--warning)" : "var(--gold-light)"};
          ">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
              <input type="checkbox" class="parcela-checkbox" 
                     data-id="${p.id}" 
                     data-valor="${p.valor}"
                     ${deveSelecionar ? "checked" : ""}
                     style="width: 18px; height: 18px; accent-color: var(--gold-light); cursor: pointer;">
              <div>
                <div style="font-weight: 600; font-size: 0.9rem;">
                  Parcela ${p.numero_parcela}ª
                  ${isVencida ? '<span style="color: var(--error); font-size: 0.65rem; margin-left: 6px;"><i class="ph ph-warning"></i> Vencida</span>' : ""}
                  ${isMesAtual && !isVencida ? '<span style="color: var(--warning); font-size: 0.65rem; margin-left: 6px;"><i class="ph ph-clock"></i> Mês atual</span>' : ""}
                </div>
                <div style="font-size: 0.7rem; color: var(--gray);">
                  Vence: ${formatDate(p.vencimento)}
                </div>
              </div>
            </div>
            <div style="font-weight: 700; color: ${isVencida ? "var(--error)" : isMesAtual ? "var(--warning)" : "var(--white)"};">
              ${formatCurrency(p.valor)}
            </div>
          </div>
        `;
        })
        .join("");
      const loginResult = await abrirModalLogin("baixar parcelas");
      if (!loginResult.success) {
        showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }
      const html = `
        <div style="display: grid; gap: 12px;">
          <div style="background: rgba(212,160,23,0.06); border-radius: 12px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h4 style="margin: 0; color: var(--gold-light); font-size: 1rem;">
                  ${transacao.description}
                </h4>
                <div style="font-size: 0.75rem; color: var(--gray); margin-top: 2px;">
                  ${parcelasPendentes.length} parcelas pendentes
                </div>
                <div style="font-size: 0.65rem; color: var(--warning); margin-top: 2px;">
                  <i class="ph ph-info"></i> Selecionadas automaticamente: vencidas + mês atual
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 0.7rem; color: var(--gray);">Total Pendente</div>
                <div style="font-weight: 700; font-size: 1.2rem; color: var(--error);">
                  ${formatCurrency(totalPendente)}
                </div>
              </div>
            </div>
          </div>

          <div style="max-height: 350px; overflow-y: auto; padding-right: 4px;">
            ${parcelasHtml}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button class="btn btn-ghost btn-sm" id="selecionarVencidasMesAtual" style="font-size: 0.7rem; background: rgba(255,193,7,0.1);">
                <i class="ph ph-clock"></i> Vencidas + Mês Atual
              </button>
              <button class="btn btn-ghost btn-sm" id="selecionarTodasParcelas" style="font-size: 0.7rem;">
                <i class="ph ph-check-square"></i> Todas
              </button>
              <button class="btn btn-ghost btn-sm" id="desmarcarTodasParcelas" style="font-size: 0.7rem;">
                <i class="ph ph-square"></i> Desmarcar
              </button>
            </div>
            <div>
              <span style="font-size: 0.75rem; color: var(--gray);">Selecionadas: </span>
              <span id="totalSelecionadoParcelas" style="font-weight: 700; color: var(--gold-light);">
                ${formatCurrency(totalPendente)}
              </span>
            </div>
          </div>

          <div style="display: flex; gap: 8px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
            <button class="btn btn-ghost" id="cancelarBaixaParcelas" style="padding: 8px 16px;">
              <i class="ph ph-x-circle"></i> Cancelar
            </button>
            <button class="btn btn-primary" id="confirmarBaixaParcelas" style="padding: 8px 20px; background: var(--success);">
              <i class="ph ph-check-circle"></i> Baixar Selecionadas
            </button>
          </div>
        </div>
      `;
      openModal("💰 Baixar Parcelas", html);
      function atualizarTotalSelecionado() {
        const checks = document.querySelectorAll(".parcela-checkbox:checked");
        let total = 0;
        checks.forEach((cb) => {
          total += parseFloat(cb.dataset.valor) || 0;
        });
        document.getElementById("totalSelecionadoParcelas").textContent =
          formatCurrency(total);
      }
      document
        .getElementById("selecionarVencidasMesAtual")
        ?.addEventListener("click", () => {
          document.querySelectorAll(".parcela-checkbox").forEach((cb) => {
            const tr = cb.closest('div[style*="border-left"]');
            if (tr) {
              const isVencida =
                tr.style.borderLeftColor === "var(--error)" ||
                tr.style.borderLeftColor === "#ff5252";
              const isMesAtual =
                tr.style.borderLeftColor === "var(--warning)" ||
                tr.style.borderLeftColor === "#ffc107";
              cb.checked = isVencida || isMesAtual;
            }
          });
          atualizarTotalSelecionado();
        });
      document
        .getElementById("selecionarTodasParcelas")
        ?.addEventListener("click", () => {
          document
            .querySelectorAll(".parcela-checkbox")
            .forEach((cb) => (cb.checked = true));
          atualizarTotalSelecionado();
        });
      document
        .getElementById("desmarcarTodasParcelas")
        ?.addEventListener("click", () => {
          document
            .querySelectorAll(".parcela-checkbox")
            .forEach((cb) => (cb.checked = false));
          atualizarTotalSelecionado();
        });
      document.querySelectorAll(".parcela-checkbox").forEach((cb) => {
        cb.addEventListener("change", atualizarTotalSelecionado);
      });
      document
        .getElementById("cancelarBaixaParcelas")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
        });
      document
        .getElementById("confirmarBaixaParcelas")
        ?.addEventListener("click", async function () {
          const checks = document.querySelectorAll(".parcela-checkbox:checked");
          if (checks.length === 0) {
            showToast("Aviso", "Selecione pelo menos uma parcela.", "warning");
            return;
          }
          const totalSelecionado = Array.from(checks).reduce(
            (sum, cb) => sum + parseFloat(cb.dataset.valor),
            0,
          );
          const qtdSelecionadas = checks.length;
          const confirmHtml = `
          <div style="text-align: center; padding: 12px 0;">
            <div style="font-size: 3rem; margin-bottom: 12px;">💳</div>
            <h3 style="color: var(--gold-light); margin-bottom: 8px;">Confirmar Baixa</h3>
            <p style="color: var(--gray); font-size: 0.95rem;">
              Deseja realmente baixar <strong>${qtdSelecionadas}</strong> parcela(s)?
            </p>
            <p style="color: var(--gray-dark); font-size: 0.85rem; margin-top: 4px;">
              Total: <strong style="color: var(--success);">${formatCurrency(totalSelecionado)}</strong>
            </p>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
              <button class="btn btn-ghost" id="cancelarConfirmacaoBaixa" style="flex: 1; padding: 12px;">
                <i class="ph ph-x-circle"></i> Cancelar
              </button>
              <button class="btn btn-primary" id="confirmarBaixaFinal" style="flex: 1; padding: 12px; background: var(--success);">
                <i class="ph ph-check-circle"></i> Confirmar
              </button>
            </div>
          </div>
        `;
          const modalContainer = document.getElementById("modalContainer");
          const modalHtml = `
          <div class="modal-overlay" id="modalOverlay">
            <div class="modal-sheet">
              <div class="handle"></div>
              <div class="modal-header">
                <h2><i class="ph ph-currency-circle-dollar"></i> Confirmar Baixa</h2>
                <button class="btn-close" id="closeModalBtn"><i class="ph ph-x"></i> Fechar</button>
              </div>
              <div class="modal-body">${confirmHtml}</div>
            </div>
          </div>
        `;
          modalContainer.innerHTML = modalHtml;
          document
            .getElementById("closeModalBtn")
            ?.addEventListener("click", () => {
              document.getElementById("modalContainer").innerHTML = "";
            });
          document
            .getElementById("cancelarConfirmacaoBaixa")
            ?.addEventListener("click", () => {
              document.getElementById("modalContainer").innerHTML = "";
            });
          document
            .getElementById("confirmarBaixaFinal")
            ?.addEventListener("click", async function () {
              this.disabled = true;
              this.innerHTML =
                '<i class="ph ph-spinner spinning"></i> Processando...';
              try {
                let sucessos = 0;
                let erros = 0;
                for (const cb of checks) {
                  const parcelaId = cb.dataset.id;
                  const { error } = await supabase
                    .from("financial_installments")
                    .update({
                      status: "pago",
                      payment_date: new Date().toISOString().split("T")[0],
                    })
                    .eq("id", parcelaId);
                  if (error) {
                    console.error("Erro ao baixar parcela:", error);
                    erros++;
                  } else {
                    sucessos++;
                  }
                }
                const { data: parcelasRestantes } = await supabase
                  .from("financial_installments")
                  .select("status")
                  .eq("transaction_id", transactionId)
                  .neq("status", "pago");
                const todasPagas =
                  !parcelasRestantes || parcelasRestantes.length === 0;
                await supabase
                  .from("financial_transactions")
                  .update({
                    status: todasPagas ? "pago" : "pendente",
                    payment_date: todasPagas
                      ? new Date().toISOString().split("T")[0]
                      : null,
                  })
                  .eq("id", transactionId);
                document.getElementById("modalContainer").innerHTML = "";
                if (erros === 0) {
                  showToast(
                    "Sucesso",
                    `${sucessos} parcela(s) baixada(s) com sucesso!`,
                    "success",
                  );
                  setTimeout(() => carregarFinanceiroPeriodo(), 500);
                } else {
                  showToast(
                    "Aviso",
                    `${sucessos} parcela(s) baixada(s), ${erros} erro(s).`,
                    "warning",
                  );
                  setTimeout(() => carregarFinanceiroPeriodo(), 500);
                }
              } catch (error) {
                console.error("Erro ao baixar parcelas:", error);
                showToast("Erro", "Falha ao baixar parcelas.", "error");
                document.getElementById("modalContainer").innerHTML = "";
              }
            });
          document
            .getElementById("modalOverlay")
            ?.addEventListener("click", (e) => {
              if (e.target.id === "modalOverlay") {
                document.getElementById("modalContainer").innerHTML = "";
              }
            });
        });
    } catch (error) {
      console.error("Erro ao abrir baixa de parcelas:", error);
      showToast("Erro", "Falha ao carregar parcelas.", "error");
    }
  };

  // ============================================================
  // FUNÇÃO PARA BAIXAR LANÇAMENTO (COM CONFIRMAÇÃO)
  // ============================================================
  window.baixarLancamento = async function (transactionId) {
    console.log("💰 baixarLancamento chamado para:", transactionId);
    try {
      const { data: parcelas, error: parcelasError } = await supabase
        .from("financial_installments")
        .select("id, status")
        .eq("transaction_id", transactionId);
      if (parcelasError) {
        console.error("Erro ao verificar parcelas:", parcelasError);
      }
      if (parcelas && parcelas.length > 0) {
        const pendentes = parcelas.filter((p) => p.status !== "pago");
        if (pendentes.length > 0) {
          await abrirBaixaParcelas(transactionId);
          return;
        }
      }
      const { data: lancamento, error: lancError } = await supabase
        .from("financial_transactions")
        .select("description, amount, due_date, type")
        .eq("id", transactionId)
        .single();
      if (lancError || !lancamento) {
        showToast("Erro", "Lançamento não encontrado.", "error");
        return;
      }
      const valor = Math.abs(lancamento.amount);
      const tipo = lancamento.type === "receber" ? "Receber" : "Pagar";
      const confirmHtml = `
        <div style="text-align: center; padding: 12px 0;">
          <div style="font-size: 3rem; margin-bottom: 12px;">💳</div>
          <h3 style="color: var(--gold-light); margin-bottom: 8px;">Confirmar Baixa</h3>
          <p style="color: var(--gray); font-size: 0.95rem;">
            Deseja realmente baixar este lançamento?
          </p>
          <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 12px; margin: 12px 0;">
            <p style="margin: 4px 0;"><strong>${lancamento.description}</strong></p>
            <p style="margin: 4px 0; color: var(--gray); font-size: 0.85rem;">
              ${tipo} • ${formatCurrency(valor)} • Vence: ${formatDate(lancamento.due_date)}
            </p>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 16px;">
            <button class="btn btn-ghost" id="cancelarConfirmacaoBaixa" style="flex: 1; padding: 12px;">
              <i class="ph ph-x-circle"></i> Cancelar
            </button>
            <button class="btn btn-primary" id="confirmarBaixaFinal" style="flex: 1; padding: 12px; background: var(--success);">
              <i class="ph ph-check-circle"></i> Confirmar
            </button>
          </div>
        </div>
      `;
      const modalContainer = document.getElementById("modalContainer");
      const modalHtml = `
        <div class="modal-overlay" id="modalOverlay">
          <div class="modal-sheet">
            <div class="handle"></div>
            <div class="modal-header">
              <h2><i class="ph ph-currency-circle-dollar"></i> Confirmar Baixa</h2>
              <button class="btn-close" id="closeModalBtn"><i class="ph ph-x"></i> Fechar</button>
            </div>
            <div class="modal-body">${confirmHtml}</div>
          </div>
        </div>
      `;
      modalContainer.innerHTML = modalHtml;
      document
        .getElementById("closeModalBtn")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
        });
      document
        .getElementById("cancelarConfirmacaoBaixa")
        ?.addEventListener("click", () => {
          document.getElementById("modalContainer").innerHTML = "";
        });
      document
        .getElementById("confirmarBaixaFinal")
        ?.addEventListener("click", async function () {
          this.disabled = true;
          this.innerHTML =
            '<i class="ph ph-spinner spinning"></i> Processando...';
          const loginResult = await abrirModalLogin("baixar lançamento");
          if (!loginResult.success) {
            document.getElementById("modalContainer").innerHTML = "";
            showToast(
              "Ação cancelada",
              "Você precisa estar autenticado.",
              "warning",
            );
            return;
          }
          try {
            const dataPag = new Date().toISOString().split("T")[0];
            const { error } = await supabase
              .from("financial_transactions")
              .update({
                status: "pago",
                payment_date: dataPag,
              })
              .eq("id", transactionId);
            if (error) throw error;
            document.getElementById("modalContainer").innerHTML = "";
            showToast("Sucesso", "Lançamento baixado com sucesso!", "success");
            setTimeout(() => carregarFinanceiroPeriodo(), 500);
          } catch (error) {
            console.error("Erro ao baixar lançamento:", error);
            document.getElementById("modalContainer").innerHTML = "";
            showToast("Erro", "Falha ao baixar lançamento.", "error");
          }
        });
      document
        .getElementById("modalOverlay")
        ?.addEventListener("click", (e) => {
          if (e.target.id === "modalOverlay") {
            document.getElementById("modalContainer").innerHTML = "";
          }
        });
    } catch (error) {
      console.error("Erro ao baixar lançamento:", error);
      showToast("Erro", "Falha ao baixar lançamento.", "error");
    }
  };

  // ============================================================
  // FUNÇÃO PARA ALTERNAR VISUALIZAÇÃO DO FINANCEIRO
  // ============================================================
  function alternarVisualizacaoFinanceiro() {
    visualizacaoFinanceiro =
      visualizacaoFinanceiro === "cards" ? "calendario" : "cards";
    console.log(`📊 Alternando visualização para: ${visualizacaoFinanceiro}`);
    renderizarFinanceiro(dados);

    const btnToggle = document.getElementById(
      "btnToggleVisualizacaoFinanceiro",
    );
    if (btnToggle) {
      if (visualizacaoFinanceiro === "cards") {
        btnToggle.innerHTML = '<i class="ph ph-calendar"></i> Calendário';
        btnToggle.title = "Alternar para visão em calendário";
      } else {
        btnToggle.innerHTML = '<i class="ph ph-list"></i> Lista';
        btnToggle.title = "Alternar para visão em lista";
      }
    }
  }

  // ============================================================
  // RENDERIZAR - ABA FINANCEIRO
  // ============================================================
  function renderizarFinanceiro(dados) {
    const { eventosFinanceiros, totalPagar, totalReceber } = dados;
    console.log(
      "💰 renderizarFinanceiro chamada com",
      eventosFinanceiros?.length || 0,
      "eventos",
    );

    document.getElementById("finTotalPagar").textContent =
      formatCurrency(totalPagar);
    document.getElementById("finTotalReceber").textContent =
      formatCurrency(totalReceber);

    let saldoMes = 0;
    let contasVencidas = 0;
    let contasPagas = 0;
    let contasPendentes = 0;
    const hoje = new Date();

    for (const e of eventosFinanceiros) {
      if (e.tipo === "receber") {
        saldoMes += e.valor;
      } else {
        saldoMes -= e.valor;
      }
      if (e.status === "pago" || e.status === "recebido") {
        contasPagas++;
      } else if (e.status === "pendente" || e.status === "atrasado") {
        contasPendentes++;
        if (new Date(e.vencimento) < hoje) {
          contasVencidas++;
        }
      }
    }

    document.getElementById("finSaldoMes").textContent =
      formatCurrency(saldoMes);
    document.getElementById("finContasVencidas").textContent = contasVencidas;

    const container = document.getElementById("listaFinanceiro");
    document.getElementById("totalLancamentos").textContent =
      (eventosFinanceiros || []).length + " contas";

    let toggleContainer = document.getElementById(
      "toggleVisualizacaoFinanceiro",
    );
    if (!toggleContainer) {
      const panelHeader = document.querySelector(
        "#tab-financeiro .panel-header",
      );
      if (panelHeader) {
        toggleContainer = document.createElement("div");
        toggleContainer.id = "toggleVisualizacaoFinanceiro";
        toggleContainer.style.cssText =
          "display:flex; gap:8px; align-items:center;";
        const btn = document.createElement("button");
        btn.id = "btnToggleVisualizacaoFinanceiro";
        btn.className = "btn btn-ghost btn-sm";
        btn.innerHTML = '<i class="ph ph-calendar"></i> Calendário';
        btn.title = "Alternar para visão em calendário";
        btn.addEventListener("click", alternarVisualizacaoFinanceiro);
        toggleContainer.appendChild(btn);
        panelHeader.appendChild(toggleContainer);
      }
    } else {
      const btn = document.getElementById("btnToggleVisualizacaoFinanceiro");
      if (btn) {
        if (visualizacaoFinanceiro === "cards") {
          btn.innerHTML = '<i class="ph ph-calendar"></i> Calendário';
          btn.title = "Alternar para visão em calendário";
        } else {
          btn.innerHTML = '<i class="ph ph-list"></i> Lista';
          btn.title = "Alternar para visão em lista";
        }
      }
    }

    if (visualizacaoFinanceiro === "calendario") {
      renderizarCalendarioFinanceiro(eventosFinanceiros);
      return;
    }

    if (eventosFinanceiros && eventosFinanceiros.length > 0) {
      const ordenados = [...eventosFinanceiros].sort((a, b) => {
        return new Date(a.vencimento) - new Date(b.vencimento);
      });

      container.innerHTML = ordenados
        .slice(0, 20)
        .map((e) => {
          const isPagar = e.tipo === "pagar";
          const vencido =
            e.status === "pendente" && new Date(e.vencimento) < new Date();
          const pago = e.status === "pago" || e.status === "recebido";
          const hoje = new Date();
          const diasFalta = Math.ceil(
            (new Date(e.vencimento) - hoje) / (1000 * 60 * 60 * 24),
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
          else if (
            catLower.includes("internet") ||
            catLower.includes("telefone")
          )
            catIcon = "ph-wifi";

          const temParcelas =
            e.isParcela ||
            (e.transacao_original &&
              e.transacao_original.installments === true);
          const transactionId = e.transaction_id;

          return `
            <div class="card-financeiro" 
                 style="
                   background: var(--black-soft);
                   border: 1px solid ${pago ? "rgba(76,175,80,0.2)" : vencido ? "rgba(255,82,82,0.2)" : "rgba(255,255,255,0.06)"};
                   border-radius: 16px;
                   padding: 14px 16px;
                   margin-bottom: 10px;
                   transition: all 0.2s ease;
                   cursor: pointer;
                   box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                 "
                 onclick="abrirModalConta('${e.id}')"
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
                      ${e.descricao}
                    </div>
                    <div style="
                      font-size: 0.65rem;
                      color: var(--gray);
                      display: flex;
                      gap: 8px;
                      flex-wrap: wrap;
                    ">
                      <span><i class="ph ph-tag"></i> ${e.categoria || "Sem categoria"}</span>
                      <span>•</span>
                      <span><i class="ph ph-calendar"></i> ${formatDate(e.vencimento)}</span>
                      <span>•</span>
                      <span style="color: var(--gray-dark);">${tipoLabel}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style="
                display: flex;
                justify-content: flex-end;
                gap: 6px;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid rgba(255,255,255,0.04);
                flex-wrap: wrap;
              ">
                ${
                  !pago
                    ? `
                  ${
                    temParcelas
                      ? `
                    <button class="btn-action btn-action-primary" 
                            onclick="event.stopPropagation(); abrirBaixaParcelas('${transactionId}')" 
                            style="padding:4px 12px; font-size:0.6rem; background:rgba(33,150,243,0.15); color:#64b5f6; border:1px solid rgba(33,150,243,0.2); border-radius:16px;">
                      <i class="ph ph-receipt"></i> Baixar Parcelas
                    </button>
                  `
                      : `
                    <button class="btn-action btn-action-success" 
                            onclick="event.stopPropagation(); baixarLancamento('${transactionId}')" 
                            style="padding:4px 12px; font-size:0.6rem; background:rgba(76,175,80,0.15); color:#a5d6a7; border:1px solid rgba(76,175,80,0.2); border-radius:16px;">
                      <i class="ph ph-check-circle"></i> Baixar
                    </button>
                  `
                  }
                `
                    : `
                  <button class="btn-action btn-action-ghost" 
                          onclick="event.stopPropagation(); abrirModalConta('${e.id}')" 
                          style="padding:4px 12px; font-size:0.6rem;">
                    <i class="ph ph-eye"></i> Detalhes
                  </button>
                `
                }
                <button class="btn-action btn-action-ghost" 
                        onclick="event.stopPropagation(); editarLancamento('${transactionId}')" 
                        style="padding:4px 12px; font-size:0.6rem;">
                  <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="btn-action btn-action-ghost" 
                        onclick="event.stopPropagation(); excluirLancamento('${transactionId}')" 
                        style="padding:4px 12px; font-size:0.6rem; color:var(--error);">
                  <i class="ph ph-trash"></i>
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    } else {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center;padding:40px 16px;color:var(--gray-dark);">
          <i class="ph ph-currency-circle-dollar" style="font-size:40px;display:block;margin-bottom:12px;color:var(--gray);"></i>
          <p style="font-size:15px;font-weight:500;">Nenhuma conta no mês</p>
          <p style="font-size:12px;color:var(--gray);margin-top:4px;">Clique em "Novo Lançamento" para começar</p>
        </div>
      `;
    }
  }

  // ============================================================
  // RENDERIZAR CALENDÁRIO FINANCEIRO
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
          `,
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
          (e) => e.status === "pago" || e.status === "recebido",
        );
        const temVencido = eventosDia.some(
          (e) => e.status === "pendente" && new Date(e.vencimento) < new Date(),
        );
        const temPendente = eventosDia.some(
          (e) => e.status === "pendente" || e.status === "atrasado",
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
            onclick="abrirModalConta('${e.id}')"
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

  // ============================================================
  // FUNÇÃO PARA SELECIONAR DIA NO CALENDÁRIO
  // ============================================================
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
  // FUNÇÃO PARA CAPITALIZAR PRIMEIRA LETRA
  // ============================================================
  function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // ============================================================
  // FUNÇÕES PARA LANÇAMENTOS FINANCEIROS
  // ============================================================

  window.editarLancamento = async function (transactionId) {
    const { data: t } = await supabase
      .from("financial_transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (!t) {
      showToast("Erro", "Lançamento não encontrado.", "error");
      return;
    }

    showToast(
      "Info",
      "Edição de lançamento em desenvolvimento. Use o sistema web para editar.",
      "info",
    );
  };

  window.excluirLancamento = async function (transactionId) {
    const loginResult = await abrirModalLogin("excluir lançamento");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
      return;
    }

    if (!confirm("Deseja realmente excluir este lançamento?")) return;

    try {
      const { error } = await supabase
        .from("financial_transactions")
        .delete()
        .eq("id", transactionId);

      if (error) throw error;

      showToast("Sucesso", "Lançamento excluído!", "success");
      setTimeout(() => carregarFinanceiroPeriodo(), 500);
    } catch (error) {
      console.error("Erro ao excluir lançamento:", error);
      showToast("Erro", "Falha ao excluir lançamento.", "error");
    }
  };

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
      afastamentos,
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
    const afastamentosAtivos = (afastamentos || []).filter(
      (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date(),
    );
    if (afastamentosAtivos.length > 0)
      alertas.push({
        prioridade: "high",
        icone: "ph-hospital",
        texto: `${afastamentosAtivos.length} funcionário(s) em afastamento`,
        tag: "urgente",
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
  // RENDERIZAR - ABA RH
  // ============================================================
  function renderizarRH(dados) {
    const { funcionarios, ferias, afastamentos } = dados;

    const totalFuncionarios = funcionarios?.length || 0;
    const emFerias = ferias?.length || 0;
    const emAfastamento = (afastamentos || []).filter(
      (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date(),
    ).length;
    const acidenteTrabalho = (afastamentos || []).filter(
      (a) => a.work_accident === true && a.status !== "encerrado",
    ).length;

    document.getElementById("rhTotalFuncionarios").textContent =
      totalFuncionarios;
    document.getElementById("rhEmFerias").textContent = emFerias;
    document.getElementById("rhEmAfastamento").textContent = emAfastamento;
    document.getElementById("rhAcidenteTrabalho").textContent =
      acidenteTrabalho;

    // Renderizar férias (existente)
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

    // Renderizar afastamentos (NOVO)
    const containerAfastamentos = document.getElementById(
      "listaRHAfastamentos",
    );
    document.getElementById("totalAfastamentos").textContent =
      (afastamentos || []).length + " registros";

    if (afastamentos && afastamentos.length > 0) {
      const hoje = new Date();
      containerAfastamentos.innerHTML = afastamentos
        .slice(0, 15)
        .map((a) => {
          const func = a.employees;
          const diasRestantes = calcularDiasRestantes(a.end_date);
          const emAndamento = diasRestantes > 0 && a.status !== "encerrado";
          const isAcidente = a.work_accident === true;

          let borderColor = "var(--warning)";
          let statusLabel = "🟡 Em andamento";
          if (a.status === "encerrado") {
            borderColor = "var(--gray)";
            statusLabel = "🔴 Encerrado";
          } else if (isAcidente) {
            borderColor = "var(--error)";
            statusLabel = "⚠️ Acidente de Trabalho";
          } else if (diasRestantes <= 3) {
            borderColor = "var(--error)";
            statusLabel = "🔴 Retorno próximo";
          }

          return `
            <div class="list-item" 
                 data-id="${a.id}"
                 style="
                   display:flex;
                   align-items:center;
                   padding:10px 14px;
                   margin-bottom:8px;
                   border-radius:8px;
                   border-left:4px solid ${borderColor};
                   background:${a.status === "encerrado" ? "rgba(255,255,255,0.02)" : isAcidente ? "rgba(255,82,82,0.05)" : "rgba(255,255,255,0.02)"};
                   transition:var(--transition);
                   cursor:pointer;
                 "
                 onclick="abrirModalAfastamento('${a.id}')"
                 onmouseenter="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)';"
                 onmouseleave="this.style.boxShadow='none';"
                 >
              <div class="item-main" style="flex:1;min-width:0;">
                <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isAcidente ? "color:var(--error);" : ""}">
                  ${func?.full_name || "-"} 
                  ${isAcidente ? "⚠️" : "🏥"}
                </div>
                <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;display:flex;flex-wrap:wrap;gap:4px 8px;">
                  <span>${getLeaveTypeLabel(a.leave_type || a.type)}</span>
                  <span>•</span>
                  <span>${formatDate(a.start_date)} - ${formatDate(a.end_date)}</span>
                  <span>•</span>
                  <span style="color:${diasRestantes > 0 ? "var(--warning)" : "var(--gray)"};">${diasRestantes > 0 ? `${diasRestantes} dias restantes` : "Encerrado"}</span>
                  ${a.reason ? `<span>•</span><span style="font-size:0.55rem;color:var(--gray);">${a.reason}</span>` : ""}
                </div>
                ${a.icd_code ? `<div style="font-size:0.55rem;color:var(--gray-dark);margin-top:2px;">CID: ${a.icd_code}</div>` : ""}
              </div>
              <div class="item-right" style="text-align:right;flex-shrink:0;">
                <span class="item-badge ${emAndamento ? "badge-status-em_costura" : "badge-status-cancelado"}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">
                  ${statusLabel}
                </span>
                ${a.doctor_name ? `<div style="font-size:8px;color:var(--gray-dark);margin-top:2px;">Dr. ${a.doctor_name}</div>` : ""}
              </div>
            </div>
          `;
        })
        .join("");
    } else {
      containerAfastamentos.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);"><i class="ph ph-hospital" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i><p style="font-size:12px;">Nenhum afastamento registrado</p></div>`;
    }

    // Renderizar funcionários ativos (existente)
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
          const emAfastamentoCheck = (afastamentos || []).some(
            (a) =>
              a.employee_id === f.id &&
              a.status !== "encerrado" &&
              new Date(a.end_date) >= new Date(),
          );
          const isAcidente = (afastamentos || []).some(
            (a) =>
              a.employee_id === f.id &&
              a.work_accident === true &&
              a.status !== "encerrado",
          );

          let statusClasse = "badge-status-entregue";
          let statusTexto = "Ativo";
          let corTitulo = "";

          if (emFeriasCheck) {
            statusClasse = "badge-status-em_costura";
            statusTexto = "🌴 Férias";
            corTitulo = "color:var(--warning);";
          } else if (emAfastamentoCheck) {
            statusClasse = "badge-status-cancelado";
            statusTexto = isAcidente ? "⚠️ Acidente" : "🏥 Afastado";
            corTitulo = isAcidente
              ? "color:var(--error);"
              : "color:var(--warning);";
          }

          return `<div class="list-item ${emFeriasCheck ? "item-warning" : emAfastamentoCheck ? "item-vencido" : ""}" data-id="${f.id}" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:pointer;">
            <div class="item-main" style="flex:1;min-width:0;">
              <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${corTitulo}">${f.full_name}</div>
              <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${f.role || "-"} · ${f.contract_type === "clt" ? "CLT" : "Diarista"}</div>
            </div>
            <div class="item-right" style="text-align:right;flex-shrink:0;">
              <span class="item-badge ${statusClasse}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">${statusTexto}</span>
            </div>
          </div>`;
        })
        .join("");

      containerFunc.querySelectorAll(".list-item[data-id]").forEach((el) => {
        el.addEventListener("click", function () {
          const id = this.dataset.id;
          const func = funcionarios.find((f) => f.id == id);
          if (func) abrirModalFuncionario(func, ferias, afastamentos);
        });
      });
    } else {
      containerFunc.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);"><i class="ph ph-users" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i><p style="font-size:12px;">Nenhum funcionário ativo</p></div>`;
    }
  }

  // ============================================================
  // ABRIR MODAL FUNCIONÁRIO (ATUALIZADO COM AFASTAMENTOS)
  // ============================================================
  function abrirModalFuncionario(func, ferias, afastamentos) {
    const emFerias = (ferias || []).find((f) => f.employee_id === func.id);
    const afastamentoAtivo = (afastamentos || []).find(
      (a) =>
        a.employee_id === func.id &&
        a.status !== "encerrado" &&
        new Date(a.end_date) >= new Date(),
    );
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

    let afastamentoHtml = "";
    if (afastamentoAtivo) {
      const diasRestantes = calcularDiasRestantes(afastamentoAtivo.end_date);
      const isAcidente = afastamentoAtivo.work_accident === true;
      afastamentoHtml = `
        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; margin-top:8px;">
          <div style="background:${isAcidente ? "rgba(255,82,82,0.08)" : "rgba(255,193,7,0.08)"}; border-radius:8px; padding:12px; border-left:3px solid ${isAcidente ? "var(--error)" : "var(--warning)"};">
            <div class="info-row"><span class="label">Afastamento</span><span class="value ${isAcidente ? "danger" : "gold"}">${isAcidente ? "⚠️ Acidente de Trabalho" : "🏥 Em afastamento"}</span></div>
            <div class="info-row"><span class="label">Tipo</span><span class="value">${getLeaveTypeLabel(afastamentoAtivo.leave_type || afastamentoAtivo.type)}</span></div>
            <div class="info-row"><span class="label">Período</span><span class="value">${formatDate(afastamentoAtivo.start_date)} a ${formatDate(afastamentoAtivo.end_date)}</span></div>
            <div class="info-row"><span class="label">Dias restantes</span><span class="value ${diasRestantes <= 3 ? "danger" : "success"}">${diasRestantes} dias</span></div>
            ${afastamentoAtivo.reason ? `<div class="info-row"><span class="label">Motivo</span><span class="value">${afastamentoAtivo.reason}</span></div>` : ""}
            ${afastamentoAtivo.icd_code ? `<div class="info-row"><span class="label">CID</span><span class="value">${afastamentoAtivo.icd_code}</span></div>` : ""}
            ${afastamentoAtivo.doctor_name ? `<div class="info-row"><span class="label">Médico</span><span class="value">${afastamentoAtivo.doctor_name}</span></div>` : ""}
            ${afastamentoAtivo.document_url ? `<div class="info-row"><span class="label">Atestado</span><span class="value"><a href="${afastamentoAtivo.document_url}" target="_blank" style="color:var(--gold-light);">📎 Ver documento</a></span></div>` : ""}
          </div>
        </div>
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
      ${afastamentoHtml}
      ${func.notes ? `<div class="info-row" style="flex-direction:column;gap:4px;"><span class="label">Observações</span><span class="value" style="font-size:0.85rem;color:var(--gray);">${func.notes}</span></div>` : ""}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.7rem;color:var(--gray-dark);text-align:center;">ID: ${func.id}</div>
      </div>
    `;

    openModal(func.full_name, html);
  }

  // ============================================================
  // ABRIR MODAL AFASTAMENTO (DETALHES)
  // ============================================================
  window.abrirModalAfastamento = async function (id) {
    const { data: afastamento, error } = await supabase
      .from("absences")
      .select(
        `
        *,
        employees(full_name, role, phone_cell, email_personal, photo_url)
      `,
      )
      .eq("id", id)
      .single();

    if (error || !afastamento) {
      showToast("Erro", "Afastamento não encontrado.", "error");
      return;
    }

    const func = afastamento.employees;
    const diasRestantes = calcularDiasRestantes(afastamento.end_date);
    const emAndamento = diasRestantes > 0 && afastamento.status !== "encerrado";
    const isAcidente = afastamento.work_accident === true;

    let statusColor = "var(--warning)";
    let statusLabel = "🟡 Em andamento";
    if (afastamento.status === "encerrado") {
      statusColor = "var(--gray)";
      statusLabel = "🔴 Encerrado";
    } else if (isAcidente) {
      statusColor = "var(--error)";
      statusLabel = "⚠️ Acidente de Trabalho";
    } else if (diasRestantes <= 3) {
      statusColor = "var(--error)";
      statusLabel = "🔴 Retorno próximo";
    }

    const fotoHtml = func?.photo_url
      ? `<img src="${func.photo_url}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);">`
      : `<div style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;background:linear-gradient(135deg,var(--pink-dark),var(--gold-dark));color:#fff;">${getInitials(func?.full_name)}</div>`;

    const html = `
      <div style="display:grid; gap:12px;">
        <div style="background:${isAcidente ? "rgba(255,82,82,0.08)" : "rgba(255,193,7,0.08)"}; border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px; border-left:4px solid ${statusColor};">
          ${fotoHtml}
          <div>
            <h4 style="margin:0;">${func?.full_name || "Funcionário"}</h4>
            <small style="color:var(--gray);">${func?.role || "-"}</small>
          </div>
          <div style="margin-left:auto;">
            <span style="font-size:0.65rem; color:${statusColor}; background:${statusColor}22; padding:3px 12px; border-radius:20px; border:1px solid ${statusColor}44; font-weight:500;">
              ${statusLabel}
            </span>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div><strong><i class="ph ph-tag"></i> Tipo:</strong> ${getLeaveTypeLabel(afastamento.leave_type || afastamento.type)}</div>
          <div><strong><i class="ph ph-calendar"></i> Período:</strong> ${formatDate(afastamento.start_date)} a ${formatDate(afastamento.end_date)}</div>
          <div><strong><i class="ph ph-clock"></i> Dias totais:</strong> ${afastamento.days_off || 0} dias</div>
          <div><strong><i class="ph ph-hourglass"></i> Dias restantes:</strong> ${diasRestantes > 0 ? diasRestantes : "0"} dias</div>
        </div>
        ${afastamento.reason ? `<div><strong><i class="ph ph-note"></i> Motivo:</strong> ${escapeHtml(afastamento.reason)}</div>` : ""}
        ${afastamento.icd_code ? `<div><strong><i class="ph ph-clipboard"></i> CID:</strong> ${escapeHtml(afastamento.icd_code)}</div>` : ""}
        ${afastamento.doctor_name ? `<div><strong><i class="ph ph-user-md"></i> Médico:</strong> ${escapeHtml(afastamento.doctor_name)}</div>` : ""}
        ${afastamento.hospital_name ? `<div><strong><i class="ph ph-building"></i> Hospital:</strong> ${escapeHtml(afastamento.hospital_name)}</div>` : ""}
        ${afastamento.document_url ? `<div><strong><i class="ph ph-paperclip"></i> Atestado:</strong> <a href="${afastamento.document_url}" target="_blank" style="color:var(--gold-light);">📎 Ver documento</a></div>` : ""}
        ${afastamento.notes ? `<div><strong><i class="ph ph-info"></i> Observações:</strong> ${escapeHtml(afastamento.notes)}</div>` : ""}
        <div style="margin-top:8px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:8px; justify-content:flex-end;">
          ${
            afastamento.status !== "encerrado"
              ? `
            <button class="btn-action btn-action-success" onclick="encerrarAfastamento('${afastamento.id}')" style="padding:6px 14px;">
              <i class="ph ph-check-circle"></i> Encerrar
            </button>
          `
              : ""
          }
          <button class="btn-action btn-action-ghost" onclick="editarAfastamento('${afastamento.id}')" style="padding:6px 14px;">
            <i class="ph ph-pencil-simple"></i> Editar
          </button>
          <button class="btn-action btn-action-ghost" onclick="excluirAfastamento('${afastamento.id}')" style="padding:6px 14px; color:var(--error);">
            <i class="ph ph-trash"></i> Excluir
          </button>
        </div>
      </div>
    `;

    openModal(`Detalhes do Afastamento`, html);
  };

  // ============================================================
  // NOVO AFASTAMENTO
  // ============================================================
  window.novoAfastamento = function () {
    const html = `
      <div style="display:grid; gap:12px;">
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user"></i> Funcionário *</label>
          <select id="afastamentoFuncionario" class="form-select" required>
            <option value="">Selecione o funcionário...</option>
            ${(dados.funcionarios || [])
              .filter((f) => f.active === true)
              .map((f) => `<option value="${f.id}">${f.full_name}</option>`)
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Tipo de Afastamento *</label>
          <select id="afastamentoTipo" class="form-select" required>
            <option value="atestado">📋 Atestado Médico</option>
            <option value="acidente_trabalho">⚠️ Acidente de Trabalho</option>
            <option value="cirurgia">🔬 Cirurgia</option>
            <option value="doenca">🤒 Doença</option>
            <option value="licenca_maternidade">👶 Licença Maternidade</option>
            <option value="licenca_paternidade">👨 Licença Paternidade</option>
            <option value="tratamento_medico">🏥 Tratamento Médico</option>
            <option value="luto">💔 Luto</option>
            <option value="casamento">💍 Casamento</option>
            <option value="outro">📌 Outro</option>
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label"><i class="ph ph-calendar"></i> Data Início *</label>
            <input id="afastamentoInicio" type="date" class="form-input" value="${todayISO()}" required>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-calendar-check"></i> Data Fim *</label>
            <input id="afastamentoFim" type="date" class="form-input" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-note"></i> Motivo / Descrição</label>
          <textarea id="afastamentoMotivo" class="form-input" rows="2" placeholder="Descreva o motivo do afastamento..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-clipboard"></i> CID (Código da Doença)</label>
          <input id="afastamentoCID" class="form-input" placeholder="Ex: M54.5 - Dor Lombar">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user-md"></i> Médico Responsável</label>
          <input id="afastamentoMedico" class="form-input" placeholder="Nome do médico">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-building"></i> Hospital</label>
          <input id="afastamentoHospital" class="form-input" placeholder="Nome do hospital">
        </div>
        <div class="form-group" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="afastamentoAcidente" style="width:18px; height:18px;">
          <label class="form-label" style="margin:0;">⚠️ Acidente de Trabalho?</label>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-paperclip"></i> URL do Atestado</label>
          <input id="afastamentoDocumento" class="form-input" placeholder="Link para imagem/PDF do atestado">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-info"></i> Observações</label>
          <textarea id="afastamentoObs" class="form-input" rows="2" placeholder="Informações adicionais..."></textarea>
        </div>
      </div>
    `;

    openFormModal(
      "Novo Afastamento",
      html,
      async () => {
        const employee_id = document.getElementById(
          "afastamentoFuncionario",
        ).value;
        const leave_type = document.getElementById("afastamentoTipo").value;
        const start_date = document.getElementById("afastamentoInicio").value;
        const end_date = document.getElementById("afastamentoFim").value;
        const reason =
          document.getElementById("afastamentoMotivo").value.trim() || null;
        const icd_code =
          document.getElementById("afastamentoCID").value.trim() || null;
        const doctor_name =
          document.getElementById("afastamentoMedico").value.trim() || null;
        const hospital_name =
          document.getElementById("afastamentoHospital").value.trim() || null;
        const work_accident = document.getElementById(
          "afastamentoAcidente",
        ).checked;
        const document_url =
          document.getElementById("afastamentoDocumento").value.trim() || null;
        const notes =
          document.getElementById("afastamentoObs").value.trim() || null;

        if (!employee_id || !leave_type || !start_date || !end_date) {
          showToast("Erro", "Preencha todos os campos obrigatórios.", "error");
          return;
        }

        if (new Date(end_date) < new Date(start_date)) {
          showToast(
            "Erro",
            "A data de fim não pode ser anterior à data de início.",
            "error",
          );
          return;
        }

        const loginResult = await abrirModalLogin("registrar afastamento");
        if (!loginResult.success) {
          showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
          );
          return;
        }

        // Calcular dias de afastamento
        const diffTime = Math.abs(new Date(end_date) - new Date(start_date));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        try {
          const { error } = await supabase.from("absences").insert({
            employee_id,
            type: "atestado",
            leave_type: leave_type,
            start_date,
            end_date,
            days_off: diffDays,
            reason,
            icd_code,
            doctor_name,
            hospital_name,
            work_accident,
            document_url,
            notes,
            status: "aprovado",
          });

          if (error) throw error;

          showToast(
            "Sucesso",
            "Afastamento registrado com sucesso!",
            "success",
          );
          setTimeout(() => {
            carregarRHPeriodo();
            if (abaAtual === "rh") {
              loadGestaoAfastamentos();
            }
          }, 500);
        } catch (error) {
          console.error("Erro ao registrar afastamento:", error);
          showToast(
            "Erro",
            `Falha ao registrar afastamento: ${error.message}`,
            "error",
          );
        }
      },
      "560px",
    );
  };

  // ============================================================
  // ENCERRAR AFASTAMENTO
  // ============================================================
  window.encerrarAfastamento = async function (id) {
    if (!confirm("Deseja encerrar este afastamento?")) return;

    const loginResult = await abrirModalLogin("encerrar afastamento");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
      return;
    }

    try {
      const { error } = await supabase
        .from("absences")
        .update({
          status: "encerrado",
          end_date: todayISO(),
        })
        .eq("id", id);

      if (error) throw error;

      document.getElementById("modalContainer").innerHTML = "";
      showToast("Sucesso", "Afastamento encerrado!", "success");
      setTimeout(() => {
        carregarRHPeriodo();
        if (abaAtual === "rh") {
          loadGestaoAfastamentos();
        }
      }, 500);
    } catch (error) {
      console.error("Erro ao encerrar afastamento:", error);
      showToast(
        "Erro",
        `Falha ao encerrar afastamento: ${error.message}`,
        "error",
      );
    }
  };

  // ============================================================
  // EDITAR AFASTAMENTO
  // ============================================================
  window.editarAfastamento = async function (id) {
    const { data: afastamento } = await supabase
      .from("absences")
      .select("*")
      .eq("id", id)
      .single();

    if (!afastamento) {
      showToast("Erro", "Afastamento não encontrado.", "error");
      return;
    }

    const html = `
      <div style="display:grid; gap:12px;">
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Tipo de Afastamento *</label>
          <select id="editAfastamentoTipo" class="form-select" required>
            <option value="atestado" ${afastamento.leave_type === "atestado" || afastamento.type === "atestado" ? "selected" : ""}>📋 Atestado Médico</option>
            <option value="acidente_trabalho" ${afastamento.leave_type === "acidente_trabalho" || afastamento.type === "acidente_trabalho" ? "selected" : ""}>⚠️ Acidente de Trabalho</option>
            <option value="cirurgia" ${afastamento.leave_type === "cirurgia" ? "selected" : ""}>🔬 Cirurgia</option>
            <option value="doenca" ${afastamento.leave_type === "doenca" ? "selected" : ""}>🤒 Doença</option>
            <option value="licenca_maternidade" ${afastamento.leave_type === "licenca_maternidade" ? "selected" : ""}>👶 Licença Maternidade</option>
            <option value="licenca_paternidade" ${afastamento.leave_type === "licenca_paternidade" ? "selected" : ""}>👨 Licença Paternidade</option>
            <option value="tratamento_medico" ${afastamento.leave_type === "tratamento_medico" ? "selected" : ""}>🏥 Tratamento Médico</option>
            <option value="luto" ${afastamento.leave_type === "luto" ? "selected" : ""}>💔 Luto</option>
            <option value="casamento" ${afastamento.leave_type === "casamento" ? "selected" : ""}>💍 Casamento</option>
            <option value="outro" ${afastamento.leave_type === "outro" ? "selected" : ""}>📌 Outro</option>
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label"><i class="ph ph-calendar"></i> Data Início *</label>
            <input id="editAfastamentoInicio" type="date" class="form-input" value="${afastamento.start_date}" required>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="ph ph-calendar-check"></i> Data Fim *</label>
            <input id="editAfastamentoFim" type="date" class="form-input" value="${afastamento.end_date}" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-note"></i> Motivo / Descrição</label>
          <textarea id="editAfastamentoMotivo" class="form-input" rows="2">${afastamento.reason || ""}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-clipboard"></i> CID</label>
          <input id="editAfastamentoCID" class="form-input" value="${afastamento.icd_code || ""}">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user-md"></i> Médico</label>
          <input id="editAfastamentoMedico" class="form-input" value="${afastamento.doctor_name || ""}">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-building"></i> Hospital</label>
          <input id="editAfastamentoHospital" class="form-input" value="${afastamento.hospital_name || ""}">
        </div>
        <div class="form-group" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="editAfastamentoAcidente" ${afastamento.work_accident ? "checked" : ""} style="width:18px; height:18px;">
          <label class="form-label" style="margin:0;">⚠️ Acidente de Trabalho?</label>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-paperclip"></i> URL do Atestado</label>
          <input id="editAfastamentoDocumento" class="form-input" value="${afastamento.document_url || ""}">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-info"></i> Observações</label>
          <textarea id="editAfastamentoObs" class="form-input" rows="2">${afastamento.notes || ""}</textarea>
        </div>
      </div>
    `;

    openFormModal(
      "Editar Afastamento",
      html,
      async () => {
        const leave_type = document.getElementById("editAfastamentoTipo").value;
        const start_date = document.getElementById(
          "editAfastamentoInicio",
        ).value;
        const end_date = document.getElementById("editAfastamentoFim").value;
        const reason =
          document.getElementById("editAfastamentoMotivo").value.trim() || null;
        const icd_code =
          document.getElementById("editAfastamentoCID").value.trim() || null;
        const doctor_name =
          document.getElementById("editAfastamentoMedico").value.trim() || null;
        const hospital_name =
          document.getElementById("editAfastamentoHospital").value.trim() ||
          null;
        const work_accident = document.getElementById(
          "editAfastamentoAcidente",
        ).checked;
        const document_url =
          document.getElementById("editAfastamentoDocumento").value.trim() ||
          null;
        const notes =
          document.getElementById("editAfastamentoObs").value.trim() || null;

        if (!start_date || !end_date) {
          showToast("Erro", "Preencha as datas de início e fim.", "error");
          return;
        }

        if (new Date(end_date) < new Date(start_date)) {
          showToast(
            "Erro",
            "A data de fim não pode ser anterior à data de início.",
            "error",
          );
          return;
        }

        const loginResult = await abrirModalLogin("editar afastamento");
        if (!loginResult.success) {
          showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
          );
          return;
        }

        const diffTime = Math.abs(new Date(end_date) - new Date(start_date));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        try {
          const { error } = await supabase
            .from("absences")
            .update({
              leave_type,
              start_date,
              end_date,
              days_off: diffDays,
              reason,
              icd_code,
              doctor_name,
              hospital_name,
              work_accident,
              document_url,
              notes,
            })
            .eq("id", id);

          if (error) throw error;

          showToast("Sucesso", "Afastamento atualizado!", "success");
          setTimeout(() => {
            carregarRHPeriodo();
            if (abaAtual === "rh") {
              loadGestaoAfastamentos();
            }
          }, 500);
        } catch (error) {
          console.error("Erro ao editar afastamento:", error);
          showToast(
            "Erro",
            `Falha ao editar afastamento: ${error.message}`,
            "error",
          );
        }
      },
      "560px",
    );
  };

  // ============================================================
  // EXCLUIR AFASTAMENTO
  // ============================================================
  window.excluirAfastamento = async function (id) {
    if (!confirm("Deseja realmente excluir este afastamento?")) return;

    const loginResult = await abrirModalLogin("excluir afastamento");
    if (!loginResult.success) {
      showToast("Ação cancelada", "Você precisa estar autenticado.", "warning");
      return;
    }

    try {
      const { error } = await supabase.from("absences").delete().eq("id", id);

      if (error) throw error;

      document.getElementById("modalContainer").innerHTML = "";
      showToast("Sucesso", "Afastamento excluído!", "success");
      setTimeout(() => {
        carregarRHPeriodo();
        if (abaAtual === "rh") {
          loadGestaoAfastamentos();
        }
      }, 500);
    } catch (error) {
      console.error("Erro ao excluir afastamento:", error);
      showToast(
        "Erro",
        `Falha ao excluir afastamento: ${error.message}`,
        "error",
      );
    }
  };

  // ============================================================
  // LOAD GESTÃO DE AFASTAMENTOS
  // ============================================================
  async function loadGestaoAfastamentos() {
    try {
      const hoje = todayISO();
      const { data: afastamentos, error } = await supabase
        .from("absences")
        .select(
          `
          *,
          employees(full_name, role, photo_url, phone_cell, email_personal)
        `,
        )
        .order("start_date", { ascending: false });

      if (error) {
        console.error("Erro ao carregar afastamentos:", error);
        return;
      }

      // Atualizar dados globais
      dados.afastamentos = afastamentos || [];

      // Re-renderizar RH com os novos dados
      renderizarRH(dados);
    } catch (e) {
      console.error("Erro em loadGestaoAfastamentos:", e);
    }
  }

  // ============================================================
  // RENDERIZAR DÍVIDAS - DASHBOARD (RESUMO)
  // ============================================================
  function renderizarDividasDashboard(dados) {
    const { dividas, totalDividas, saldoDevedor } = dados;

    const kpiDividas = document.getElementById("kpiDividasAtivas");
    if (kpiDividas) {
      kpiDividas.textContent = formatCurrency(saldoDevedor);
    }

    const maxDivida = Math.max(saldoDevedor, 1000);
    const pct = Math.min(Math.round((saldoDevedor / maxDivida) * 100), 100);
    const circumference = 188.5;
    const offset = circumference - (pct / 100) * circumference;
    const gaugeFill = document.getElementById("gaugeFill");
    if (gaugeFill) {
      gaugeFill.style.strokeDashoffset = offset;
    }
    const gaugePercent = document.getElementById("gaugePercent");
    if (gaugePercent) {
      gaugePercent.textContent = pct + "%";
    }
  }

  // ============================================================
  // GESTÃO DE DÍVIDAS - FUNÇÕES DO MÓDULO DESKTOP
  // ============================================================

  // Variáveis de estado para dívidas
  let filtrosDividas = {
    credor: "",
    status: "",
    tipo: "",
    vencimentoInicio: "",
    vencimentoFim: "",
    fornecedorId: "",
  };

  let ordenacaoDividas = {
    coluna: "due_date",
    ascendente: true,
  };

  let LIMITE_PADRAO_DIV = 20;
  let limiteAtualDiv = LIMITE_PADRAO_DIV;
  let totalRegistrosDiv = 0;

  // Carregar dados da aba de dívidas
  async function loadGestaoDividas(resetLimite = true) {
    if (resetLimite) limiteAtualDiv = LIMITE_PADRAO_DIV;

    try {
      let query = supabase
        .from("debts")
        .select("*", { count: "exact" })
        .order(ordenacaoDividas.coluna, {
          ascending: ordenacaoDividas.ascendente,
        })
        .range(limiteAtualDiv - LIMITE_PADRAO_DIV, limiteAtualDiv - 1);

      if (filtrosDividas.credor) {
        query = query.ilike("creditor", `%${filtrosDividas.credor}%`);
      }
      if (filtrosDividas.status) {
        query = query.eq("status", filtrosDividas.status);
      }
      if (filtrosDividas.tipo) {
        query = query.eq("type", filtrosDividas.tipo);
      }
      if (filtrosDividas.vencimentoInicio) {
        query = query.gte("due_date", filtrosDividas.vencimentoInicio);
      }
      if (filtrosDividas.vencimentoFim) {
        query = query.lte("due_date", filtrosDividas.vencimentoFim);
      }
      if (filtrosDividas.fornecedorId) {
        query = query.eq("supplier_id", filtrosDividas.fornecedorId);
      }

      const { data: dividas, error, count } = await query;
      if (error) {
        console.error("Erro ao carregar dívidas:", error);
        showToast("Erro", "Falha ao carregar dívidas.", "error");
        return;
      }

      totalRegistrosDiv = count || 0;

      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, company_name");
      const suppliersMap = {};
      if (suppliers) {
        suppliers.forEach((s) => (suppliersMap[s.id] = s.company_name));
      }

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

      const dividasComFornecedor = dividas.map((d) => ({
        ...d,
        suppliers: d.supplier_id
          ? { company_name: suppliersMap[d.supplier_id] }
          : null,
      }));

      renderizarCardsResumoDividas(dividasComFornecedor || [], parcelasMap);
      renderizarTabelaDividas(
        dividasComFornecedor || [],
        parcelasMap,
        anexosMap,
      );
      renderizarPaginacaoDividas();
      configurarFiltrosDividas();
    } catch (e) {
      console.error("Erro em loadGestaoDividas:", e);
    }
  }

  // Renderizar cards de resumo de dívidas
  function renderizarCardsResumoDividas(dividas, parcelasMap) {
    const container = document.querySelector("#tab-dividas .cards-grid");
    if (!container) return;

    const hoje = todayISO();
    let totalDivida = 0,
      totalPago = 0,
      vencidas = 0,
      ativas = 0,
      parcelasVencerProximas = 0;

    for (const d of dividas) {
      const parcelas = parcelasMap[d.id] || [];
      const valorTotal = parseFloat(d.total_amount) || 0;
      totalDivida += valorTotal;

      const valorPago = parcelas
        .filter((p) => p.paid === true)
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
      totalPago += valorPago;

      if (d.status === "ativa") ativas++;

      const parcelaVencida = parcelas.some((p) => !p.paid && p.due_date < hoje);
      if (parcelaVencida) vencidas++;

      const parcelaProxima = parcelas.some(
        (p) =>
          !p.paid &&
          p.due_date >= hoje &&
          new Date(p.due_date) <= new Date(Date.now() + 7 * 86400000),
      );
      if (parcelaProxima) parcelasVencerProximas++;
    }

    const cardsHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Dívidas Ativas</div>
        <div class="kpi-value warning">${ativas}</div>
        <div class="kpi-detail">em aberto</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Devido</div>
        <div class="kpi-value">${formatCurrency(totalDivida)}</div>
        <div class="kpi-detail">valor original</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Pago</div>
        <div class="kpi-value success">${formatCurrency(totalPago)}</div>
        <div class="kpi-detail">${((totalPago / totalDivida) * 100 || 0).toFixed(1)}% quitado</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Parcelas Vencidas</div>
        <div class="kpi-value ${vencidas > 0 ? "danger" : ""}">${vencidas}</div>
        <div class="kpi-detail">em atraso</div>
      </div>
      <div class="kpi-card" style="border:1px solid rgba(212,160,23,0.3);">
        <div class="kpi-label">Vencem em 7 dias</div>
        <div class="kpi-value warning">${parcelasVencerProximas}</div>
        <div class="kpi-detail">atenção!</div>
      </div>
    `;

    container.innerHTML = cardsHtml;
  }

  // Renderizar tabela de dívidas
  function renderizarTabelaDividas(dividas, parcelasMap, anexosMap) {
    const container = document.getElementById("listaDividas");
    if (!container) return;

    const totalEl = document.getElementById("totalDividas");
    if (totalEl) {
      totalEl.textContent = (dividas || []).length + " registros";
    }

    if (!dividas || dividas.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center;padding:40px 16px;color:var(--gray-dark);">
          <i class="ph ph-warning-circle" style="font-size:40px;display:block;margin-bottom:12px;color:var(--gray);"></i>
          <p style="font-size:15px;font-weight:500;">Nenhuma dívida cadastrada</p>
          <p style="font-size:12px;color:var(--gray);margin-top:4px;">Clique em "Nova Dívida" para começar</p>
        </div>
      `;
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

        const credorExibicao =
          d.creditor || d.creditor || "Credor não informado";

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
               onclick="abrirModalDivida('${d.id}')"
               onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)'; this.style.transform='translateY(-2px)';"
               onmouseleave="this.style.boxShadow='none'; this.style.transform='translateY(0)';"
               >
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 15px; font-weight: 700; color: ${vencida ? "var(--error)" : d.status === "quitada" ? "var(--success)" : "var(--gold-light)"};">
                  ${escapeHtml(credorExibicao)}
                </div>
                <div style="font-size: 11px; color: var(--gray-dark); margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px 14px;">
                  <span><i class="ph ph-tag"></i> ${formatarTipoDivida(d.type)}</span>
                  <span><i class="ph ph-truck"></i> ${fornecedorNome}</span>
                  <span><i class="ph ph-currency-circle-dollar"></i> ${formatCurrency(d.total_amount)}</span>
                  <span><i class="ph ph-receipt"></i> ${pagas}/${totalParcelas}</span>
                  <span><i class="ph ph-calendar"></i> Próx.: ${proxVenc}</span>
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
                      onclick="event.stopPropagation(); abrirModalDivida('${d.id}')" 
                      style="padding:4px 12px; font-size:0.6rem;">
                <i class="ph ph-eye"></i> Detalhes
              </button>
              <button class="btn-action btn-action-ghost" 
                      onclick="event.stopPropagation(); editarDivida('${d.id}')" 
                      style="padding:4px 12px; font-size:0.6rem;">
                <i class="ph ph-pencil-simple"></i> Editar
              </button>
              ${
                d.status !== "quitada"
                  ? `
                <button class="btn-action btn-action-success" 
                        onclick="event.stopPropagation(); quitarParcela('${d.id}')" 
                        style="padding:4px 12px; font-size:0.6rem; background:rgba(76,175,80,0.15); color:#a5d6a7; border:1px solid rgba(76,175,80,0.2); border-radius:16px;">
                  <i class="ph ph-check-circle"></i> Quitar Parcela
                </button>
                <button class="btn-action btn-action-primary" 
                        onclick="event.stopPropagation(); quitarDivida('${d.id}')" 
                        style="padding:4px 12px; font-size:0.6rem; background:rgba(33,150,243,0.15); color:#64b5f6; border:1px solid rgba(33,150,243,0.2); border-radius:16px;">
                  <i class="ph ph-check-square"></i> Quitar Tudo
                </button>
              `
                  : ""
              }
              <button class="btn-action btn-action-ghost" 
                      onclick="event.stopPropagation(); excluirDivida('${d.id}')" 
                      style="padding:4px 12px; font-size:0.6rem; color:var(--error);">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Paginação de dívidas
  function renderizarPaginacaoDividas() {
    const container = document.getElementById("paginacaoDividas");
    if (!container) return;

    if (totalRegistrosDiv <= limiteAtualDiv) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `
      <div style="text-align:center; margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="btnCarregarMaisDividas">
          <i class="ph ph-plus-circle"></i> Carregar mais (${totalRegistrosDiv - limiteAtualDiv} restantes)
        </button>
      </div>
    `;

    const btn = document.getElementById("btnCarregarMaisDividas");
    if (btn) {
      btn.addEventListener("click", () => {
        limiteAtualDiv += LIMITE_PADRAO_DIV;
        loadGestaoDividas(false);
      });
    }
  }

  // Configurar filtros de dívidas
  function configurarFiltrosDividas() {
    const container = document.getElementById("filtrosDividas");
    if (!container) return;

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; width:100%;">
        <div class="form-group" style="position:relative; margin-bottom:0;">
          <input type="text" id="filtroCredor" class="form-input" placeholder="Buscar credor..." value="${filtrosDividas.credor}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <select id="filtroStatus" class="form-select">
            <option value="">Todos Status</option>
            <option value="ativa" ${filtrosDividas.status === "ativa" ? "selected" : ""}>Ativa</option>
            <option value="quitada" ${filtrosDividas.status === "quitada" ? "selected" : ""}>Quitada</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <select id="filtroTipo" class="form-select">
            <option value="">Todos Tipos</option>
            <option value="bancaria" ${filtrosDividas.tipo === "bancaria" ? "selected" : ""}>Bancária</option>
            <option value="fornecedor" ${filtrosDividas.tipo === "fornecedor" ? "selected" : ""}>Fornecedor</option>
            <option value="imposto" ${filtrosDividas.tipo === "imposto" ? "selected" : ""}>Imposto</option>
            <option value="pessoal" ${filtrosDividas.tipo === "pessoal" ? "selected" : ""}>Pessoal</option>
            <option value="outro" ${filtrosDividas.tipo === "outro" ? "selected" : ""}>Outro</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <input type="date" id="filtroVencimentoInicio" class="form-input" title="Vencimento Inicial" value="${filtrosDividas.vencimentoInicio}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <input type="date" id="filtroVencimentoFim" class="form-input" title="Vencimento Final" value="${filtrosDividas.vencimentoFim}">
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn btn-primary btn-sm" id="btnAplicarFiltrosDividas"><i class="ph ph-funnel"></i> Aplicar</button>
          <button class="btn btn-ghost btn-sm" id="btnLimparFiltrosDividas"><i class="ph ph-x"></i> Limpar</button>
        </div>
      </div>
    `;

    document
      .getElementById("btnAplicarFiltrosDividas")
      ?.addEventListener("click", () => {
        filtrosDividas.credor = document.getElementById("filtroCredor").value;
        filtrosDividas.status = document.getElementById("filtroStatus").value;
        filtrosDividas.tipo = document.getElementById("filtroTipo").value;
        filtrosDividas.vencimentoInicio = document.getElementById(
          "filtroVencimentoInicio",
        ).value;
        filtrosDividas.vencimentoFim = document.getElementById(
          "filtroVencimentoFim",
        ).value;
        loadGestaoDividas();
      });

    document
      .getElementById("btnLimparFiltrosDividas")
      ?.addEventListener("click", () => {
        filtrosDividas = {
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
        loadGestaoDividas();
      });
  }

  // ============================================================
  // FUNÇÕES DE DÍVIDAS - MODAL E AÇÕES
  // ============================================================

  // Abrir modal de detalhes da dívida
  window.abrirModalDivida = async function (id) {
    const { data: divida, error } = await supabase
      .from("debts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !divida) {
      showToast("Erro", "Dívida não encontrada.", "error");
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
      parcelasHtml = `
        <h4 style="margin:16px 0 8px 0; font-size:0.9rem;"><i class="ph ph-receipt"></i> Parcelas</h4>
        <div style="max-height:300px; overflow-y:auto;">
          ${parcelas
            .map((p) => {
              const atrasada = !p.paid && new Date(p.due_date) < new Date();
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

    const html = `
      <div style="display:grid; gap:12px;">
        <div style="background:rgba(255,255,255,0.03); border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px;">
          <div style="width:48px; height:48px; background:rgba(212,160,23,0.15); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.3rem; color:var(--gold-light);"><i class="ph ph-warning-circle"></i></div>
          <div><h4 style="margin:0;">${escapeHtml(credorExibicao)}</h4><small style="color:var(--gray);">${formatarTipoDivida(divida.type)}</small></div>
          <div style="margin-left:auto;"><span class="status-badge status-${divida.status === "quitada" ? "entregue" : "em_costura"}">${divida.status === "quitada" ? "✅ Quitada" : "🟡 Ativa"}</span></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div><strong><i class="ph ph-currency-circle-dollar"></i> Valor Total:</strong> ${formatCurrency(divida.total_amount)}</div>
          <div><strong><i class="ph ph-arrow-circle-up"></i> Valor Original:</strong> ${formatCurrency(divida.original_total_amount || divida.total_amount)}</div>
          <div><strong><i class="ph ph-percent"></i> Taxa de Juros:</strong> ${divida.interest_rate || 0}% ao mês</div>
          <div><strong><i class="ph ph-receipt"></i> Parcelas:</strong> ${divida.total_installments} x ${formatCurrency(divida.installment_value || 0)}</div>
          <div><strong><i class="ph ph-check-circle"></i> Total Pago:</strong> ${formatCurrency(totalPago)}</div>
          <div><strong><i class="ph ph-warning"></i> Saldo Devedor:</strong> ${formatCurrency(saldo)}</div>
        </div>
        ${divida.notes ? `<div><strong><i class="ph ph-note"></i> Obs:</strong> ${escapeHtml(divida.notes)}</div>` : ""}
        ${parcelasHtml}
      </div>
    `;

    openModal(`Detalhes da Dívida - ${credorExibicao}`, html);
  };

  // Nova dívida
  window.novaDivida = function () {
    const formHtml = `
      <div style="display:grid; gap:12px;">
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user"></i> Credor *</label>
          <input id="divCredor" class="form-input" placeholder="Nome do credor" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Tipo *</label>
          <select id="divTipo" class="form-select" required>
            <option value="bancaria">Bancária</option>
            <option value="fornecedor">Fornecedor</option>
            <option value="imposto">Imposto</option>
            <option value="pessoal">Pessoal</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-currency-circle-dollar"></i> Valor Total *</label>
          <input id="divTotal" type="number" step="0.01" min="0.01" class="form-input" required>
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
          <small style="color:var(--gray);">Se houver juros, o valor das parcelas será recalculado</small>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-note"></i> Observações</label>
          <textarea id="divObs" class="form-input" rows="2"></textarea>
        </div>
      </div>
    `;

    openFormModal("Nova Dívida", formHtml, async () => {
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
        showToast("Erro", "Preencha todos os campos obrigatórios.", "error");
        return;
      }

      const loginResult = await abrirModalLogin("criar nova dívida");
      if (!loginResult.success) {
        showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }

      let valorParcela = total / numParcelas;
      let jurosEfetivo = 0;
      if (jurosMensal > 0) {
        const i = jurosMensal / 100;
        const fator = Math.pow(1 + i, numParcelas);
        valorParcela = total * ((i * fator) / (fator - 1));
        jurosEfetivo = jurosMensal;
      }

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
        showToast(
          "Erro",
          `Falha ao criar dívida: ${insertError.message}`,
          "error",
        );
        return;
      }

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
        console.error("Erro ao gerar parcelas:", parcelasError);
        showToast(
          "Aviso",
          "Dívida criada, mas houve falha ao gerar parcelas.",
          "warning",
        );
      } else {
        showToast(
          "Sucesso",
          `Dívida com ${numParcelas} parcelas criada!`,
          "success",
        );
        setTimeout(() => {
          loadGestaoDividas();
          carregarDadosIniciais();
        }, 500);
      }
    });
  };

  // Editar dívida
  window.editarDivida = async function (id) {
    const { data: divida } = await supabase
      .from("debts")
      .select("*")
      .eq("id", id)
      .single();

    if (!divida) {
      showToast("Erro", "Dívida não encontrada.", "error");
      return;
    }

    const formHtml = `
      <div style="display:grid; gap:12px;">
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user"></i> Credor *</label>
          <input id="editCredor" class="form-input" value="${escapeHtml(divida.creditor)}" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-tag"></i> Tipo *</label>
          <select id="editTipo" class="form-select" required>
            <option value="bancaria" ${divida.type === "bancaria" ? "selected" : ""}>Bancária</option>
            <option value="fornecedor" ${divida.type === "fornecedor" ? "selected" : ""}>Fornecedor</option>
            <option value="imposto" ${divida.type === "imposto" ? "selected" : ""}>Imposto</option>
            <option value="pessoal" ${divida.type === "pessoal" ? "selected" : ""}>Pessoal</option>
            <option value="outro" ${divida.type === "outro" ? "selected" : ""}>Outro</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-currency-circle-dollar"></i> Valor Total *</label>
          <input id="editTotal" type="number" step="0.01" class="form-input" value="${divida.total_amount}" required>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-info"></i> Status *</label>
          <select id="editStatus" class="form-select" required>
            <option value="ativa" ${divida.status === "ativa" ? "selected" : ""}>Ativa</option>
            <option value="quitada" ${divida.status === "quitada" ? "selected" : ""}>Quitada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="ph ph-note"></i> Observações</label>
          <textarea id="editObs" class="form-input" rows="2">${divida.notes || ""}</textarea>
        </div>
      </div>
    `;

    openFormModal("Editar Dívida", formHtml, async () => {
      const creditor = document.getElementById("editCredor").value.trim();
      const type = document.getElementById("editTipo").value;
      const total_amount = parseFloat(
        document.getElementById("editTotal").value,
      );
      const status = document.getElementById("editStatus").value;
      const notes = document.getElementById("editObs").value.trim() || null;

      if (!creditor || !total_amount) {
        showToast("Erro", "Preencha os campos obrigatórios.", "error");
        return;
      }

      const loginResult = await abrirModalLogin("editar dívida");
      if (!loginResult.success) {
        showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }

      const { error } = await supabase
        .from("debts")
        .update({ creditor, type, total_amount, status, notes })
        .eq("id", id);

      if (error) {
        showToast("Erro", error.message, "error");
      } else {
        showToast("Sucesso", "Dívida atualizada!", "success");
        setTimeout(() => {
          loadGestaoDividas();
          carregarDadosIniciais();
        }, 500);
      }
    });
  };

  // Excluir dívida
  window.excluirDivida = async function (id) {
    const { data: divida } = await supabase
      .from("debts")
      .select("creditor")
      .eq("id", id)
      .single();

    if (!divida) {
      showToast("Erro", "Dívida não encontrada.", "error");
      return;
    }

    const confirmHtml = `
      <div style="text-align:center; padding:12px 0;">
        <div style="font-size:3rem; margin-bottom:12px;">🗑️</div>
        <h3 style="color:var(--error); margin-bottom:8px;">Confirmar Exclusão</h3>
        <p style="color:var(--gray); font-size:0.95rem;">
          Excluir dívida com <strong>${escapeHtml(divida.creditor)}</strong>?
        </p>
        <p style="color:var(--gray-dark); font-size:0.8rem;">
          Todas as parcelas e anexos serão removidos. Esta ação <strong style="color:var(--error);">não pode ser desfeita</strong>.
        </p>
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button class="btn btn-ghost" id="cancelarExclusao" style="flex:1; padding:12px;">
            <i class="ph ph-x-circle"></i> Cancelar
          </button>
          <button class="btn btn-primary" id="confirmarExclusao" style="flex:1; padding:12px; background:var(--error); border-color:var(--error);">
            <i class="ph ph-trash"></i> Excluir
          </button>
        </div>
      </div>
    `;

    openModal("Confirmar Exclusão", confirmHtml);

    document
      .getElementById("cancelarExclusao")
      ?.addEventListener("click", () => {
        document.getElementById("modalContainer").innerHTML = "";
      });

    document
      .getElementById("confirmarExclusao")
      ?.addEventListener("click", async function () {
        const loginResult = await abrirModalLogin("excluir dívida");
        if (!loginResult.success) {
          document.getElementById("modalContainer").innerHTML = "";
          showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
          );
          return;
        }

        try {
          await supabase.from("debt_installments").delete().eq("debt_id", id);
          await supabase.from("debt_attachments").delete().eq("debt_id", id);
          const { error } = await supabase.from("debts").delete().eq("id", id);

          if (error) throw error;

          document.getElementById("modalContainer").innerHTML = "";
          showToast("Sucesso", "Dívida excluída!", "success");
          setTimeout(() => {
            loadGestaoDividas();
            carregarDadosIniciais();
          }, 500);
        } catch (error) {
          console.error("Erro ao excluir dívida:", error);
          showToast("Erro", "Falha ao excluir dívida.", "error");
        }
      });
  };

  // Quitar parcela
  window.quitarParcela = async function (id) {
    const { data: divida, error: errDebt } = await supabase
      .from("debts")
      .select("id, creditor, interest_rate, late_fee_percent")
      .eq("id", id)
      .single();

    if (errDebt || !divida) {
      showToast("Erro", "Dívida não encontrada.", "error");
      return;
    }

    const { data: parcelasPendentes } = await supabase
      .from("debt_installments")
      .select("*")
      .eq("debt_id", id)
      .eq("paid", false)
      .order("installment_number", { ascending: true });

    if (!parcelasPendentes || parcelasPendentes.length === 0) {
      showToast("Aviso", "Não há parcelas pendentes.", "info");
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

    openFormModal(`Quitar Parcela - ${divida.creditor}`, formHtml, async () => {
      const parcelaId = document.getElementById("parcelaId").value;
      const dataPag = document.getElementById("dataPagamento").value;
      const formaPagamento =
        document.getElementById("formaPagamento").value.trim() || null;
      const juros =
        parseFloat(document.getElementById("jurosParcela").value) || 0;
      const multa =
        parseFloat(document.getElementById("multaParcela").value) || 0;

      if (!parcelaId || !dataPag) {
        showToast("Erro", "Preencha todos os campos.", "error");
        return;
      }

      const loginResult = await abrirModalLogin("quitar parcela");
      if (!loginResult.success) {
        showToast(
          "Ação cancelada",
          "Você precisa estar autenticado.",
          "warning",
        );
        return;
      }

      try {
        const { data: parcelaAtual } = await supabase
          .from("debt_installments")
          .select("*")
          .eq("id", parcelaId)
          .single();

        if (!parcelaAtual) {
          showToast("Erro", "Parcela não encontrada.", "error");
          return;
        }

        // Criar lançamento financeiro
        const { data: categoria } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("type", "despesa")
          .ilike("name", "%pagamento%")
          .limit(1)
          .maybeSingle();

        if (categoria) {
          const valorTotal = parseFloat(parcelaAtual.amount) + juros + multa;
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
          .eq("debt_id", id)
          .eq("paid", false)
          .limit(1);

        if (!restantes || restantes.length === 0) {
          await supabase
            .from("debts")
            .update({ status: "quitada" })
            .eq("id", id);
        }

        showToast("Sucesso", "Parcela quitada!", "success");
        setTimeout(() => {
          loadGestaoDividas();
          carregarDadosIniciais();
        }, 500);
      } catch (error) {
        console.error("Erro ao quitar parcela:", error);
        showToast("Erro", "Falha ao quitar parcela.", "error");
      }
    });

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
  };

  // Quitar dívida inteira
  window.quitarDivida = async function (id) {
    const { data: divida } = await supabase
      .from("debts")
      .select("*")
      .eq("id", id)
      .single();

    if (!divida) {
      showToast("Erro", "Dívida não encontrada.", "error");
      return;
    }

    const { data: parcelasPendentes } = await supabase
      .from("debt_installments")
      .select("*")
      .eq("debt_id", id)
      .eq("paid", false)
      .order("installment_number", { ascending: true });

    if (!parcelasPendentes || parcelasPendentes.length === 0) {
      showToast("Aviso", "Esta dívida já está quitada.", "info");
      return;
    }

    const valorTotalParcelas = parcelasPendentes.reduce(
      (s, p) => s + parseFloat(p.amount),
      0,
    );

    const confirmHtml = `
      <div style="text-align:center; padding:12px 0;">
        <div style="font-size:3rem; margin-bottom:12px;">💳</div>
        <h3 style="color:var(--gold-light); margin-bottom:8px;">Quitar Dívida</h3>
        <p style="color:var(--gray); font-size:0.95rem;">
          Deseja quitar as <strong>${parcelasPendentes.length}</strong> parcelas restantes?
        </p>
        <div style="background:rgba(255,255,255,0.03); border-radius:10px; padding:12px; margin:12px 0;">
          <p style="margin:4px 0;"><strong>${escapeHtml(divida.creditor)}</strong></p>
          <p style="margin:4px 0; color:var(--gray); font-size:0.85rem;">
            Total a pagar: ${formatCurrency(valorTotalParcelas)}
          </p>
        </div>
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button class="btn btn-ghost" id="cancelarQuitacao" style="flex:1; padding:12px;">
            <i class="ph ph-x-circle"></i> Cancelar
          </button>
          <button class="btn btn-primary" id="confirmarQuitacao" style="flex:1; padding:12px; background:var(--success);">
            <i class="ph ph-check-circle"></i> Confirmar
          </button>
        </div>
      </div>
    `;

    openModal("Quitar Dívida", confirmHtml);

    document
      .getElementById("cancelarQuitacao")
      ?.addEventListener("click", () => {
        document.getElementById("modalContainer").innerHTML = "";
      });

    document
      .getElementById("confirmarQuitacao")
      ?.addEventListener("click", async function () {
        const loginResult = await abrirModalLogin("quitar dívida");
        if (!loginResult.success) {
          document.getElementById("modalContainer").innerHTML = "";
          showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
          );
          return;
        }

        try {
          const dataPag = todayISO();

          // Buscar categoria de pagamento
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
            });
          }

          document.getElementById("modalContainer").innerHTML = "";
          showToast("Sucesso", "Dívida totalmente quitada!", "success");
          setTimeout(() => {
            loadGestaoDividas();
            carregarDadosIniciais();
          }, 500);
        } catch (error) {
          console.error("Erro ao quitar dívida:", error);
          showToast("Erro", "Falha ao quitar dívida.", "error");
        }
      });
  };

  // ============================================================
  // INICIALIZAÇÃO - CARREGAR DADOS INICIAIS
  // ============================================================
  function carregarDados() {
    carregarDadosIniciais();
  }

  // ============================================================
  // NAVEGAÇÃO POR ABAS - COM INICIALIZAÇÃO DAS ABAS
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

    // Inicializar abas específicas quando ativadas
    if (aba === "dividas") {
      setTimeout(() => {
        loadGestaoDividas();
      }, 100);
    }
    if (aba === "rh") {
      setTimeout(() => {
        loadGestaoAfastamentos();
      }, 100);
    }

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
  // PULL-TO-REFRESH MELHORADO
  // ============================================================
  let pullTouchStartY = 0;
  let pullTouchMoved = false;

  appContent.addEventListener(
    "touchstart",
    function (e) {
      if (this.scrollTop === 0) {
        pullTouchStartY = e.touches[0].clientY;
        pullTouchMoved = false;
        pullIndicator.classList.remove("active");
      }
    },
    { passive: true },
  );
  appContent.addEventListener(
    "touchmove",
    function (e) {
      if (this.scrollTop === 0 && pullTouchStartY > 0) {
        const deltaY = e.touches[0].clientY - pullTouchStartY;
        if (deltaY > 40) {
          pullTouchMoved = true;
          pullIndicator.classList.add("active");
          pullIndicator.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <i class="ph ph-arrow-down pull-arrow"></i>
              <span>Solte para atualizar</span>
            </div>
          `;
        } else if (deltaY > 10) {
          pullIndicator.classList.add("active");
          pullIndicator.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <i class="ph ph-arrow-down" style="transform: translateY(${Math.min(deltaY - 10, 30)}px);"></i>
              <span>Puxe para atualizar</span>
            </div>
          `;
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
      if (pullTouchMoved && this.scrollTop === 0) {
        pullIndicator.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="ph ph-spinner spinning"></i>
            <span>Atualizando...</span>
          </div>
        `;
        carregarDadosIniciais().then(() =>
          pullIndicator.classList.remove("active"),
        );
      }
      pullTouchStartY = 0;
      pullTouchMoved = false;
    },
    { passive: true },
  );

  // ============================================================
  // REFRESH
  // ============================================================
  $("btnRefresh").addEventListener("click", carregarDadosIniciais);

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================
  document.addEventListener("DOMContentLoaded", async function () {
    const sessaoValida = carregarSessao();

    if (sessaoValida && usuarioAutenticado) {
      console.log("✅ Sessão válida encontrada, carregando app...");
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.display = "flex";
      }
      mostrarAba("geral");
      await carregarDadosIniciais();
      setupActivityDetection();
      setupSwipeNavigation();
      setupKeyboardAvoidance();
      setupPeriodSelectors();
    } else {
      console.log("🔐 Sessão não encontrada, exibindo login...");
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.display = "none";
      }

      await abrirModalLoginObrigatorio("acessar o app");
      setupActivityDetection();
      setupSwipeNavigation();
      setupKeyboardAvoidance();
      setupPeriodSelectors();

      setInterval(
        () => {
          if (isAutenticado()) {
            renovarSessao();
            console.log("🔄 Sessão renovada automaticamente (keep-alive)");
          }
        },
        25 * 60 * 1000,
      );
    }

    setInterval(() => {
      if (isAutenticado()) {
        carregarDadosIniciais();
      }
    }, 60000);
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
  window.enviarRevisao = window.enviarRevisao;
  window.voltarCostura = window.voltarCostura;
  window.baixarLancamento = window.baixarLancamento;
  window.editarLancamento = window.editarLancamento;
  window.excluirLancamento = window.excluirLancamento;
  window.abrirBaixaParcelas = window.abrirBaixaParcelas;
  window.alternarVisualizacaoFinanceiro = alternarVisualizacaoFinanceiro;
  window.selecionarDiaCalendarioFinanceiro =
    window.selecionarDiaCalendarioFinanceiro;
  window.buscarParcelasDaTransacao = buscarParcelasDaTransacao;

  // Exportar funções de dívidas
  window.loadGestaoDividas = loadGestaoDividas;
  window.novaDivida = window.novaDivida;
  window.editarDivida = window.editarDivida;
  window.excluirDivida = window.excluirDivida;
  window.quitarParcela = window.quitarParcela;
  window.quitarDivida = window.quitarDivida;
  window.abrirModalDivida = window.abrirModalDivida;

  // Exportar funções de afastamentos
  window.novoAfastamento = window.novoAfastamento;
  window.editarAfastamento = window.editarAfastamento;
  window.excluirAfastamento = window.excluirAfastamento;
  window.encerrarAfastamento = window.encerrarAfastamento;
  window.abrirModalAfastamento = window.abrirModalAfastamento;
  window.loadGestaoAfastamentos = loadGestaoAfastamentos;

  // Exportar funções de toast
  window.showToast = showToast;
  window.showFeedback = showToast;

  // Exportar funções de período
  window.navigatePeriod = navigatePeriod;
  window.resetPeriod = resetPeriod;
  window.periodState = periodState;
  window.carregarProducaoPeriodo = carregarProducaoPeriodo;
  window.carregarFinanceiroPeriodo = carregarFinanceiroPeriodo;
  window.carregarRHPeriodo = carregarRHPeriodo;

  // Exportar funções de contas recorrentes
  window.verificarEGerarRecorrentesPorPeriodo =
    verificarEGerarRecorrentesPorPeriodo;
  window.criarTransacoesParaNovaRecorrente = criarTransacoesParaNovaRecorrente;
  window.gerarTransacoesRecorrentes = gerarTransacoesRecorrentes;
})();
