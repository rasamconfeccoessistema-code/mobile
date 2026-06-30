// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo de Configuração Supabase (supabase.js)
// Versão 1.0 - Cliente e configuração centralizada
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Supabase carregado");

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const SUPABASE_URL = "https://evlatdyxcgklunwvnhcv.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_tn2G-m8F7M3Ey8C0LDJLNg_9MzszdAS";

  // ============================================================
  // VARIÁVEIS INTERNAS
  // ============================================================

  let supabaseClient = null;
  let supabaseLib = null;

  // ============================================================
  // FUNÇÃO PARA CARREGAR A BIBLIOTECA SUPABASE
  // ============================================================

  function carregarSupabaseLib() {
    if (typeof window.supabase !== "undefined") {
      supabaseLib = window.supabase;
      return true;
    } else if (typeof supabase !== "undefined") {
      supabaseLib = supabase;
      return true;
    } else {
      console.warn("⚠️ Supabase não encontrado, aguardando carregamento...");
      return false;
    }
  }

  // ============================================================
  // FUNÇÃO PARA OBTER O CLIENTE SUPABASE
  // ============================================================

  /**
   * Obtém o cliente Supabase (cria se não existir)
   * @returns {Object} Cliente Supabase
   */
  function getSupabaseClient() {
    // Se já temos o cliente, retornar
    if (supabaseClient) {
      return supabaseClient;
    }

    // Se o cliente está no cache global, usar
    if (typeof window.__supabaseClient !== "undefined") {
      supabaseClient = window.__supabaseClient;
      return supabaseClient;
    }

    // Tentar carregar a biblioteca
    if (!supabaseLib) {
      if (!carregarSupabaseLib()) {
        // Se não conseguir carregar, tentar carregar via script
        console.warn("⚠️ Tentando carregar Supabase via script...");
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.async = false;
        document.head.appendChild(script);

        // Tentar novamente após o script carregar
        try {
          carregarSupabaseLib();
        } catch (e) {
          console.error("❌ Falha ao carregar Supabase:", e);
          return null;
        }
      }
    }

    // Se ainda não temos a biblioteca, retornar null
    if (!supabaseLib) {
      console.error("❌ Supabase não disponível");
      return null;
    }

    try {
      supabaseClient = supabaseLib.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
      );
      window.__supabaseClient = supabaseClient;
      console.log("✅ Cliente Supabase criado com sucesso");
      return supabaseClient;
    } catch (e) {
      console.error("❌ Erro ao criar cliente Supabase:", e);
      return null;
    }
  }

  // ============================================================
  // FUNÇÕES DE VERIFICAÇÃO
  // ============================================================

  /**
   * Verifica se o Supabase está disponível
   * @returns {boolean} True se disponível
   */
  function isSupabaseAvailable() {
    return getSupabaseClient() !== null;
  }

  /**
   * Verifica se a autenticação está ativa
   * @returns {Promise<boolean>} True se autenticado
   */
  async function isAuthenticated() {
    try {
      const client = getSupabaseClient();
      if (!client) return false;

      const { data, error } = await client.auth.getSession();
      if (error) {
        console.warn("⚠️ Erro ao verificar autenticação:", error.message);
        return false;
      }
      return !!data?.session;
    } catch (e) {
      console.warn("⚠️ Erro ao verificar autenticação:", e);
      return false;
    }
  }

  /**
   * Obtém o usuário atual
   * @returns {Promise<Object|null>} Usuário ou null
   */
  async function getCurrentUser() {
    try {
      const client = getSupabaseClient();
      if (!client) return null;

      const { data, error } = await client.auth.getUser();
      if (error) {
        console.warn("⚠️ Erro ao obter usuário:", error.message);
        return null;
      }
      return data?.user || null;
    } catch (e) {
      console.warn("⚠️ Erro ao obter usuário:", e);
      return null;
    }
  }

  // ============================================================
  // FUNÇÕES DE AUTENTICAÇÃO
  // ============================================================

  /**
   * Realiza login com email e senha
   * @param {string} email - Email do usuário
   * @param {string} password - Senha do usuário
   * @returns {Promise<Object>} Resultado do login
   */
  async function signIn(email, password) {
    try {
      const client = getSupabaseClient();
      if (!client) {
        return { success: false, error: "Cliente Supabase não disponível" };
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        user: data.user,
        session: data.session,
      };
    } catch (e) {
      console.error("❌ Erro no login:", e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Realiza logout
   * @returns {Promise<Object>} Resultado do logout
   */
  async function signOut() {
    try {
      const client = getSupabaseClient();
      if (!client) {
        return { success: false, error: "Cliente Supabase não disponível" };
      }

      const { error } = await client.auth.signOut();
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e) {
      console.error("❌ Erro no logout:", e);
      return { success: false, error: e.message };
    }
  }

  // ============================================================
  // FUNÇÕES DE UTILIDADE
  // ============================================================

  /**
   * Obtém a URL base do Supabase
   * @returns {string} URL do Supabase
   */
  function getSupabaseUrl() {
    return SUPABASE_URL;
  }

  /**
   * Obtém a chave anônima do Supabase
   * @returns {string} Chave anônima
   */
  function getSupabaseAnonKey() {
    return SUPABASE_ANON_KEY;
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.Supabase = {
    // Configuração
    SUPABASE_URL,
    SUPABASE_ANON_KEY,

    // Cliente
    getSupabaseClient,
    isSupabaseAvailable,

    // Autenticação
    isAuthenticated,
    getCurrentUser,
    signIn,
    signOut,

    // Utilitários
    getSupabaseUrl,
    getSupabaseAnonKey,
  };

  console.log("✅ Supabase exportado globalmente como window.Supabase");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA (TENTATIVA)
  // ============================================================

  // Tentar carregar a biblioteca Supabase imediatamente
  setTimeout(() => {
    if (!supabaseLib) {
      carregarSupabaseLib();
    }
    // Tentar criar o cliente
    if (!supabaseClient) {
      getSupabaseClient();
    }
  }, 100);
})(window);
