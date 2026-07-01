// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Ponto de Entrada Principal (main.js)
// Versão 1.5 - Com suporte aos módulos Produção, Financeiro, RH, Dívidas e seletores dinâmicos
// ============================================================

(function (global) {
  "use strict";

  console.log("🚀 App do Gestor - Inicializando (main.js)");

  // ============================================================
  // VERIFICAÇÃO DE DEPENDÊNCIAS
  // ============================================================

  const dependencias = [
    "Utils",
    "Supabase",
    "UI",
    "Auth",
    "Dashboard",
    "Producao",
    "Financeiro",
    "RH",
    "Dividas",
  ];
  const faltando = dependencias.filter((dep) => !global[dep]);

  if (faltando.length > 0) {
    console.error("❌ Módulos faltando:", faltando);
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;padding:20px;font-family:sans-serif;">
        <div style="max-width:400px;width:100%;background:#1a1a1a;border-radius:16px;padding:32px 24px;border:1px solid rgba(255,255,255,0.08);text-align:center;">
          <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
          <h2 style="color:#f0c75e;margin:0 0 8px 0;font-size:1.2rem;">Erro de Carregamento</h2>
          <p style="color:#9e9e9e;font-size:0.9rem;margin-bottom:16px;">
            Módulos necessários não foram carregados:
          </p>
          <div style="background:rgba(255,82,82,0.1);border-radius:8px;padding:12px;margin-bottom:16px;border-left:3px solid #ff5252;">
            <p style="color:#ff8a80;font-size:0.8rem;margin:0;font-family:monospace;">
              ${faltando.join(", ")}
            </p>
          </div>
          <button onclick="location.reload()" style="
            background:linear-gradient(135deg, #c2185b, #d4a017);
            border:none;
            color:white;
            padding:10px 24px;
            border-radius:8px;
            font-weight:600;
            font-size:0.9rem;
            cursor:pointer;
            transition:all 0.3s ease;
          ">
            <i class="ph ph-arrows-clockwise"></i> Recarregar
          </button>
        </div>
      </div>
    `;
    return;
  }

  // ============================================================
  // REFERÊNCIAS AOS MÓDULOS
  // ============================================================

  const Utils = global.Utils;
  const Supabase = global.Supabase;
  const UI = global.UI;
  const Auth = global.Auth;
  const Dashboard = global.Dashboard;
  const Producao = global.Producao;
  const Financeiro = global.Financeiro;
  const RH = global.RH;
  const Dividas = global.Dividas;

  console.log("✅ Todos os módulos carregados com sucesso.");

  // ============================================================
  // VARIÁVEIS GLOBAIS DO APP
  // ============================================================

  let abaAtual = "geral";
  let dados = {};
  let carregando = false;
  let visualizacaoFinanceiro = "cards";
  const periodState = {
    producao: new Date(),
    financeiro: new Date(),
    rh: new Date(),
  };

  // ============================================================
  // ELEMENTOS DO DOM
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const appContent = $("appContent");
  const refreshIcon = $("refreshIcon");
  const pullIndicator = $("pullIndicator");
  const scrollTopBtn = $("scrollTopBtn");

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

  /**
   * Mostra a aba selecionada e carrega dados específicos
   * @param {string} aba - Nome da aba ('geral', 'producao', 'financeiro', 'rh', 'dividas')
   */
  function mostrarAba(aba) {
    console.log(`📱 Navegando para aba: ${aba}`);
    abaAtual = aba;

    // Atualizar tabs
    tabItems.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === aba);
    });

    // Atualizar conteúdo
    Object.keys(tabContents).forEach((key) => {
      tabContents[key].classList.toggle("active", key === aba);
    });

    // Carregar dados específicos da aba
    if (aba === "producao") {
      setTimeout(() => {
        const periodo = periodState.producao || new Date();
        if (typeof Producao.carregarProducaoPeriodo === "function") {
          Producao.carregarProducaoPeriodo(periodo);
        }
      }, 100);
    }

    if (aba === "financeiro") {
      setTimeout(() => {
        const periodo = periodState.financeiro || new Date();
        if (typeof Financeiro.carregarFinanceiroPeriodo === "function") {
          Financeiro.carregarFinanceiroPeriodo(periodo);
        }
      }, 100);
    }

    if (aba === "dividas") {
      setTimeout(() => {
        if (typeof Dividas.carregarDividasPeriodo === "function") {
          Dividas.carregarDividasPeriodo();
        }
      }, 100);
    }

    if (aba === "rh") {
      setTimeout(() => {
        const periodo = periodState.rh || new Date();
        if (typeof RH.carregarRHPeriodo === "function") {
          RH.carregarRHPeriodo(periodo);
        }
      }, 100);
    }

    // Scroll para o topo
    if (appContent) {
      appContent.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ============================================================
  // CARREGAR DADOS INICIAIS
  // ============================================================

  /**
   * Carrega todos os dados iniciais do Supabase
   * Utiliza os módulos Dashboard, Producao, Financeiro, RH e Dividas
   */
  async function carregarDadosIniciais() {
    console.log("🔄 Carregando dados iniciais...");
    if (carregando) return;
    carregando = true;
    if (refreshIcon) {
      refreshIcon.className = "ph ph-spinner spinning";
    }

    try {
      // Carregar dados do Dashboard (Geral)
      if (typeof Dashboard.carregarDadosIniciais === "function") {
        dados = await Dashboard.carregarDadosIniciais();
        console.log("✅ Dados carregados via Dashboard:", Object.keys(dados));
      } else {
        console.warn("⚠️ Dashboard.carregarDadosIniciais não encontrado");
        if (typeof global.carregarDadosIniciais === "function") {
          dados = await global.carregarDadosIniciais();
        }
      }

      // Carregar dados da Produção se a aba atual for produção
      if (
        abaAtual === "producao" &&
        typeof Producao.carregarProducaoPeriodo === "function"
      ) {
        const periodo = periodState.producao || new Date();
        await Producao.carregarProducaoPeriodo(periodo);
      }

      // Carregar dados do Financeiro se a aba atual for financeiro
      if (
        abaAtual === "financeiro" &&
        typeof Financeiro.carregarFinanceiroPeriodo === "function"
      ) {
        const periodo = periodState.financeiro || new Date();
        await Financeiro.carregarFinanceiroPeriodo(periodo);
      }

      // Carregar dados do RH se a aba atual for rh
      if (
        abaAtual === "rh" &&
        typeof RH.carregarRHPeriodo === "function"
      ) {
        const periodo = periodState.rh || new Date();
        await RH.carregarRHPeriodo(periodo);
      }

      // Carregar dados das Dívidas se a aba atual for dividas
      if (
        abaAtual === "dividas" &&
        typeof Dividas.carregarDividasPeriodo === "function"
      ) {
        await Dividas.carregarDividasPeriodo();
      }

      // Renderizar a aba atual
      if (
        abaAtual === "geral" &&
        typeof Dashboard.renderizarGeral === "function"
      ) {
        Dashboard.renderizarGeral(dados);
      }

      // Atualizar badges das abas
      atualizarBadges();

      // Atualizar seletores de período
      atualizarTodosPeriodSelectors();

      console.log("✅ Dados iniciais carregados com sucesso!");
    } catch (e) {
      console.error("❌ Erro ao carregar dados:", e);
      if (typeof UI.showToast === "function") {
        UI.showToast(
          "Erro",
          "Falha ao carregar dados. Verifique sua conexão.",
          "error"
        );
      }
    } finally {
      carregando = false;
      if (refreshIcon) {
        refreshIcon.className = "ph ph-arrows-clockwise";
      }
      if (pullIndicator) {
        pullIndicator.classList.remove("active");
      }
    }
  }

  // ============================================================
  // ATUALIZAR BADGES DAS ABAS
  // ============================================================

  function atualizarBadges() {
    try {
      // Produção
      const badgeProd = document.getElementById("tabBadgeProd");
      if (badgeProd && dados.osAtivas) {
        const count = dados.osAtivas.length;
        badgeProd.textContent = count;
        badgeProd.style.display = count > 0 ? "flex" : "none";
      }

      // Financeiro
      const badgeFin = document.getElementById("tabBadgeFin");
      if (badgeFin && dados.contasVencidas !== undefined) {
        const count = dados.contasVencidas || 0;
        badgeFin.textContent = count;
        badgeFin.style.display = count > 0 ? "flex" : "none";
      }

      // RH
      const badgeRH = document.getElementById("tabBadgeRH");
      if (badgeRH) {
        let ferias = dados.ferias || [];
        let afastamentos = dados.afastamentos || [];
        
        if (RH.dados) {
          ferias = RH.dados.ferias || ferias;
          afastamentos = RH.dados.afastamentos || afastamentos;
        }
        
        const ativos = afastamentos.filter(
          (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date()
        );
        const count = ferias.length + ativos.length;
        badgeRH.textContent = count;
        badgeRH.style.display = count > 0 ? "flex" : "none";
      }

      // Dívidas
      const badgeDiv = document.getElementById("tabBadgeDiv");
      if (badgeDiv) {
        let dividas = dados.dividas || [];
        if (Dividas.dados && Dividas.dados.dividas) {
          dividas = Dividas.dados.dividas;
        }
        const count = dividas.filter(
          (d) => d.status !== "quitada"
        ).length;
        badgeDiv.textContent = count;
        badgeDiv.style.display = count > 0 ? "flex" : "none";
      }
    } catch (e) {
      console.warn("⚠️ Erro ao atualizar badges:", e);
    }
  }

  // ============================================================
  // ATUALIZAR SELETORES DE PERÍODO
  // ============================================================

  function atualizarTodosPeriodSelectors() {
    if (global.UI && typeof global.UI.atualizarTodosPeriodSelectors === 'function') {
      global.UI.atualizarTodosPeriodSelectors();
    }
  }

  // ============================================================
  // INICIALIZAÇÃO DO APP
  // ============================================================

  async function initApp() {
    console.log("🚀 Inicializando App...");

    // Inicializar módulo de UI (se necessário)
    if (typeof UI.init === "function") {
      UI.init();
    }

    // Inicializar autenticação
    if (typeof Auth.init === "function") {
      Auth.init();
    }

    // Inicializar módulo de Produção
    if (typeof Producao.init === "function") {
      Producao.init();
    }

    // Inicializar módulo de Financeiro
    if (typeof Financeiro.init === "function") {
      Financeiro.init();
    }

    // Inicializar módulo de RH
    if (typeof RH.init === "function") {
      RH.init();
    }

    // Inicializar módulo de Dívidas
    if (typeof Dividas.init === "function") {
      Dividas.init();
    }

    // Verificar sessão
    const sessaoValida = Auth.isAutenticado ? Auth.isAutenticado() : false;

    if (sessaoValida) {
      console.log("✅ Sessão válida encontrada, carregando app...");
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.display = "flex";
      }

      // Mostrar aba geral
      mostrarAba("geral");

      // Carregar dados
      await carregarDadosIniciais();

      // Configurar detecção de atividade
      if (typeof Auth.setupActivityDetection === "function") {
        Auth.setupActivityDetection();
      }
    } else {
      console.log("🔐 Sessão não encontrada, exibindo login...");
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.display = "none";
      }

      // Abrir modal de login
      if (typeof Auth.abrirModalLoginObrigatorio === "function") {
        await Auth.abrirModalLoginObrigatorio("acessar o app");
        // Após login, recarregar dados
        await carregarDadosIniciais();
        if (typeof Auth.setupActivityDetection === "function") {
          Auth.setupActivityDetection();
        }
      }
    }

    // Configurar keyboard avoidance
    if (typeof UI.setupKeyboardAvoidance === "function") {
      UI.setupKeyboardAvoidance();
    }

    console.log("✅ App inicializado com sucesso!");
  }

  // ============================================================
  // EVENTOS
  // ============================================================

  // Navegação por abas
  tabItems.forEach((tab) => {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      const aba = this.dataset.tab;
      if (aba) {
        mostrarAba(aba);
      }
    });
  });

  // Scroll Top
  if (appContent && scrollTopBtn) {
    appContent.addEventListener("scroll", function () {
      scrollTopBtn.classList.toggle("visible", this.scrollTop > 200);
    });

    scrollTopBtn.addEventListener("click", function () {
      appContent.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Refresh
  const btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", function () {
      carregarDadosIniciais();
    });
  }

  // ============================================================
  // PULL-TO-REFRESH
  // ============================================================

  let pullTouchStartY = 0;
  let pullTouchMoved = false;

  if (appContent && pullIndicator) {
    appContent.addEventListener(
      "touchstart",
      function (e) {
        if (this.scrollTop === 0) {
          pullTouchStartY = e.touches[0].clientY;
          pullTouchMoved = false;
          pullIndicator.classList.remove("active");
        }
      },
      { passive: true }
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
      { passive: true }
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
          carregarDadosIniciais().then(() => {
            if (pullIndicator) {
              pullIndicator.classList.remove("active");
            }
          });
        }
        pullTouchStartY = 0;
        pullTouchMoved = false;
      },
      { passive: true }
    );
  }

  // ============================================================
  // SWIPE PARA VOLTAR / AVANÇAR
  // ============================================================

  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  document.addEventListener(
    "touchstart",
    function (e) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isSwiping = false;
    },
    { passive: true }
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
    { passive: true }
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
          const container = document.getElementById("modalContainer");
          if (container) container.innerHTML = "";
        }
        isSwiping = false;
        return;
      }

      // Navegação entre abas
      const tabs = ["geral", "producao", "financeiro", "rh", "dividas"];
      const currentIndex = tabs.indexOf(abaAtual);

      // Swipe da esquerda para direita = voltar
      if (deltaX > 80 && currentIndex > 0) {
        mostrarAba(tabs[currentIndex - 1]);
      }

      // Swipe da direita para esquerda = avançar
      if (deltaX < -80 && currentIndex < tabs.length - 1) {
        mostrarAba(tabs[currentIndex + 1]);
      }

      isSwiping = false;
    },
    { passive: true }
  );

  // ============================================================
  // KEEP-ALIVE (Atualização automática)
  // ============================================================

  // Atualizar dados a cada 60 segundos
  setInterval(() => {
    if (Auth.isAutenticado ? Auth.isAutenticado() : false) {
      console.log("🔄 Atualização automática (keep-alive)");
      carregarDadosIniciais();
    }
  }, 60000);

  // ============================================================
  // EXPORTAÇÃO GLOBAL
  // ============================================================

  global.App = {
    abaAtual,
    dados,
    carregando,
    visualizacaoFinanceiro,
    periodState,
    mostrarAba,
    carregarDadosIniciais,
    carregarDados: carregarDadosIniciais,
    atualizarBadges,
    atualizarTodosPeriodSelectors,
    init: initApp,
    // Expor referências dos módulos
    Utils,
    Supabase,
    UI,
    Auth,
    Dashboard,
    Producao,
    Financeiro,
    RH,
    Dividas,
  };

  console.log("✅ App registrado globalmente como window.App");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  // Aguardar DOM carregar antes de iniciar
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})(window);
