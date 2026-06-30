// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo de Autenticação (auth.js)
// Versão 1.0 - Gerenciamento de sessão e login
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Auth carregado");

  // ============================================================
  // DEPENDÊNCIAS
  // ============================================================

  const Utils = global.Utils || {};
  const Supabase = global.Supabase || {};
  const UI = global.UI || {};

  // ============================================================
  // CONSTANTES
  // ============================================================

  const SESSION_DURATION = 30 * 60 * 1000; // 30 minutos
  const SESSION_KEY = "gestor_session";

  // ============================================================
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let usuarioAutenticado = null;
  let sessionTimeout = null;
  let loginModalAberto = false;

  // ============================================================
  // FUNÇÕES DE SESSÃO
  // ============================================================

  /**
   * Carrega a sessão do localStorage
   * @returns {boolean} True se a sessão é válida
   */
  function carregarSessao() {
    try {
      const dados = localStorage.getItem(SESSION_KEY);
      if (!dados) {
        console.log("📭 Nenhuma sessão encontrada");
        return false;
      }

      const session = JSON.parse(dados);
      const agora = Date.now();

      // Verificar se a sessão expirou
      if (!session.timestamp || agora - session.timestamp >= SESSION_DURATION) {
        console.log("⏰ Sessão expirada");
        localStorage.removeItem(SESSION_KEY);
        usuarioAutenticado = null;
        atualizarIndicadorSessao();
        return false;
      }

      usuarioAutenticado = session.usuario;
      console.log(`✅ Sessão ativa para: ${usuarioAutenticado.email}`);
      atualizarIndicadorSessao();

      // Renovar timeout
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
      sessionTimeout = setTimeout(() => {
        console.log("⏰ Sessão expirada automaticamente");
        localStorage.removeItem(SESSION_KEY);
        usuarioAutenticado = null;
        atualizarIndicadorSessao();
        if (!loginModalAberto && typeof UI.showToast === "function") {
          UI.showToast(
            "Sessão expirada",
            "Sua sessão expirou. Faça login novamente.",
            "warning",
            5000,
          );
          setTimeout(() => {
            abrirModalLoginObrigatorio("continuar usando o app");
          }, 1000);
        }
      }, SESSION_DURATION);

      return true;
    } catch (e) {
      console.error("Erro ao carregar sessão:", e);
      return false;
    }
  }

  /**
   * Salva a sessão no localStorage
   * @param {Object} usuario - Dados do usuário
   */
  function salvarSessao(usuario) {
    const session = {
      usuario: usuario,
      timestamp: Date.now(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    usuarioAutenticado = usuario;

    // Configurar timeout para expiração automática
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
    }
    sessionTimeout = setTimeout(() => {
      console.log("⏰ Sessão expirada automaticamente");
      localStorage.removeItem(SESSION_KEY);
      usuarioAutenticado = null;
      atualizarIndicadorSessao();
      if (!loginModalAberto && typeof UI.showToast === "function") {
        UI.showToast(
          "Sessão expirada",
          "Sua sessão expirou. Faça login novamente.",
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

  /**
   * Renova a sessão (resetando o timeout)
   */
  function renovarSessao() {
    if (!usuarioAutenticado) return;

    const session = {
      usuario: usuarioAutenticado,
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
    }
    sessionTimeout = setTimeout(() => {
      console.log("⏰ Sessão expirada automaticamente");
      localStorage.removeItem(SESSION_KEY);
      usuarioAutenticado = null;
      atualizarIndicadorSessao();
      if (!loginModalAberto && typeof UI.showToast === "function") {
        UI.showToast(
          "Sessão expirada",
          "Sua sessão expirou. Faça login novamente.",
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

  /**
   * Limpa a sessão (logout)
   */
  function limparSessao() {
    localStorage.removeItem(SESSION_KEY);
    usuarioAutenticado = null;
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      sessionTimeout = null;
    }
    console.log("🔒 Sessão encerrada");
    atualizarIndicadorSessao();
  }

  // ============================================================
  // INDICADOR DE SESSÃO
  // ============================================================

  /**
   * Atualiza o indicador visual de sessão no header
   */
  function atualizarIndicadorSessao() {
    const indicator = document.getElementById("sessionIndicator");
    const icon = document.getElementById("sessionStatusIcon");
    const text = document.getElementById("sessionStatusText");

    if (!indicator) return;

    if (isAutenticado() && usuarioAutenticado) {
      indicator.className = "session-indicator online";
      if (icon) icon.style.color = "var(--success)";
      const nomeExibicao = usuarioAutenticado.nome || usuarioAutenticado.email;
      if (text) {
        text.textContent =
          nomeExibicao.length > 15
            ? nomeExibicao.substring(0, 14) + "…"
            : nomeExibicao;
      }
    } else {
      indicator.className = "session-indicator offline";
      if (icon) icon.style.color = "var(--gray-dark)";
      if (text) text.textContent = "Offline";
    }
  }

  // ============================================================
  // FUNÇÕES DE AUTENTICAÇÃO
  // ============================================================

  /**
   * Verifica se o usuário está autenticado
   * @returns {boolean} True se autenticado
   */
  function isAutenticado() {
    if (!usuarioAutenticado) {
      carregarSessao();
    }
    return !!usuarioAutenticado;
  }

  /**
   * Obtém o usuário atual
   * @returns {Object|null} Dados do usuário ou null
   */
  function getUsuarioAtual() {
    if (!usuarioAutenticado) {
      carregarSessao();
    }
    return usuarioAutenticado;
  }

  /**
   * Realiza login
   * @param {string} email - Email do usuário
   * @param {string} senha - Senha do usuário
   * @returns {Promise<Object>} Resultado do login
   */
  async function fazerLogin(email, senha) {
    try {
      // Usar o módulo Supabase
      if (typeof Supabase.signIn === "function") {
        const result = await Supabase.signIn(email, senha);
        if (result.success && result.user) {
          salvarSessao({
            id: result.user.id,
            email: result.user.email,
            nome: result.user.user_metadata?.full_name || result.user.email,
          });
          return { success: true, usuario: result.user };
        }
        return { success: false, error: result.error || "Erro ao fazer login" };
      }

      // Fallback: usar Supabase diretamente
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        return { success: false, error: "Cliente Supabase não disponível" };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: senha,
      });

      if (error) {
        return { success: false, error: error.message };
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

  /**
   * Realiza logout
   * @returns {Promise<Object>} Resultado do logout
   */
  async function fazerLogout() {
    try {
      limparSessao();

      // Usar o módulo Supabase
      if (typeof Supabase.signOut === "function") {
        await Supabase.signOut();
      } else {
        // Fallback: usar Supabase diretamente
        const supabase = Supabase.getSupabaseClient
          ? Supabase.getSupabaseClient()
          : null;
        if (supabase) {
          await supabase.auth.signOut();
        }
      }

      // Recarregar a página para resetar o estado
      window.location.reload();
      return { success: true };
    } catch (e) {
      console.error("Erro no logout:", e);
      return { success: false, error: e.message };
    }
  }

  // ============================================================
  // MODAL DE LOGIN OBRIGATÓRIO
  // ============================================================

  /**
   * Abre o modal de login obrigatório
   * @param {string} acao - Ação que está sendo realizada
   * @returns {Promise} Promise que resolve quando o login é concluído
   */
  function abrirModalLoginObrigatorio(acao = "acessar o app") {
    return new Promise((resolve) => {
      loginModalAberto = true;

      // Esconder o app
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.display = "none";
      }

      // Criar overlay
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

      // Adicionar estilos se não existirem
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

      // Remover overlay antigo
      const oldOverlay = document.getElementById("loginObrigatorioOverlay");
      if (oldOverlay) {
        oldOverlay.remove();
      }
      document.body.appendChild(overlay);

      // Focar no campo email
      setTimeout(() => {
        const emailInput = document.getElementById("loginObrigatorioEmail");
        if (emailInput) {
          emailInput.focus();
        }
      }, 300);

      // Eventos de teclado
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

      // Evento de login
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

  // ============================================================
  // DETECTOR DE ATIVIDADE
  // ============================================================

  /**
   * Configura o detector de atividade para renovar a sessão
   */
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
        if (activityTimer) {
          clearTimeout(activityTimer);
        }
        activityTimer = setTimeout(() => {}, 5000);
      }
    };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    console.log("🔄 Detector de atividade configurado");
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.Auth = {
    // Constantes
    SESSION_DURATION,
    SESSION_KEY,

    // Sessão
    carregarSessao,
    salvarSessao,
    renovarSessao,
    limparSessao,

    // Estado
    isAutenticado,
    getUsuarioAtual,
    atualizarIndicadorSessao,

    // Login/Logout
    fazerLogin,
    fazerLogout,

    // UI
    abrirModalLoginObrigatorio,

    // Utilitários
    setupActivityDetection,
  };

  console.log("✅ Auth exportado globalmente como window.Auth");

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function init() {
    // Tentar carregar sessão automaticamente
    carregarSessao();
    console.log("🔐 Auth inicializado");
  }

  // Exportar init
  global.Auth.init = init;

  // Inicializar automaticamente
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
