// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo de Utilitários (utils.js)
// Versão 1.0 - Funções auxiliares puras
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo Utils carregado");

  // ============================================================
  // FUNÇÕES DE DATA E HORA
  // ============================================================

  /**
   * Retorna a data atual no formato ISO (YYYY-MM-DD)
   * @returns {string} Data atual no formato ISO
   */
  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * Formata uma data ISO para o formato brasileiro (DD/MM/YYYY)
   * @param {string} iso - Data no formato ISO (YYYY-MM-DD)
   * @returns {string} Data formatada ou "-" se inválida
   */
  function formatDate(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("pt-BR");
    } catch {
      return iso;
    }
  }

  /**
   * Formata uma data e hora ISO para formato brasileiro
   * @param {string} iso - Data/hora no formato ISO
   * @returns {string} Data/hora formatada ou "-" se inválida
   */
  function formatDateTime(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  }

  /**
   * Retorna a hora atual formatada (HH:MM)
   * @returns {string} Hora atual
   */
  function formatTime() {
    return new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ============================================================
  // FUNÇÕES DE FORMATAÇÃO DE MOEDA E NÚMEROS
  // ============================================================

  /**
   * Formata um valor para moeda brasileira (R$)
   * @param {number} v - Valor a ser formatado
   * @returns {string} Valor formatado em R$
   */
  function formatCurrency(v) {
    if (v === null || v === undefined) v = 0;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v);
  }

  // ============================================================
  // FUNÇÕES DE STRING E TEXTO
  // ============================================================

  /**
   * Escapa caracteres HTML para prevenir XSS
   * @param {string} str - String a ser escapada
   * @returns {string} String escapada
   */
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Capitaliza a primeira letra de uma string
   * @param {string} str - String a ser capitalizada
   * @returns {string} String com primeira letra maiúscula
   */
  function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Retorna as iniciais de um nome
   * @param {string} name - Nome completo
   * @returns {string} Iniciais (até 2 caracteres)
   */
  function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ============================================================
  // FUNÇÕES DE DATA (MÊS/ANO)
  // ============================================================

  /**
   * Retorna o primeiro e último dia do mês atual
   * @returns {Object} { inicio, fim, mes, ano }
   */
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

  /**
   * Retorna o primeiro e último dia de um mês específico
   * @param {Date} date - Data de referência
   * @returns {Object} { inicio, fim, mes, ano }
   */
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

  /**
   * Retorna o próximo dia útil após uma data
   * @param {Date} data - Data de referência
   * @returns {Date} Próximo dia útil
   */
  function getProximoDiaUtil(data) {
    const d = new Date(data);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  /**
   * Calcula o número de dias restantes até uma data
   * @param {string} endDate - Data final no formato ISO
   * @returns {number} Número de dias restantes
   */
  function calcularDiasRestantes(endDate) {
    if (!endDate) return 0;
    const hoje = new Date();
    const fim = new Date(endDate);
    const diffTime = fim - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // ============================================================
  // FUNÇÕES DE UI E ANIMAÇÃO
  // ============================================================

  /**
   * Aplica um efeito de pulso em um elemento
   * @param {HTMLElement} element - Elemento a ser animado
   */
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

  // ============================================================
  // FUNÇÕES DE FORMATAÇÃO DE STATUS
  // ============================================================

  /**
   * Formata o status de produção para exibição
   * @param {string} s - Status da OS
   * @returns {string} Status formatado com emoji
   */
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

  /**
   * Formata o tipo de dívida para exibição
   * @param {string} tipo - Tipo da dívida
   * @returns {string} Tipo formatado
   */
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

  /**
   * Retorna a classe CSS para um status
   * @param {string} s - Status
   * @returns {string} Classe CSS
   */
  function getStatusClass(s) {
    return "badge-status-" + s;
  }

  /**
   * Retorna o label do tipo de afastamento
   * @param {string} type - Tipo de afastamento
   * @returns {string} Label formatado
   */
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

  /**
   * Retorna o label do status de afastamento
   * @param {string} status - Status do afastamento
   * @returns {string} Label formatado
   */
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
  // FUNÇÕES DE STATUS DE PAGAMENTO
  // ============================================================

  /**
   * Retorna informações sobre o status de pagamento
   * @param {string} status - Status do pagamento
   * @returns {Object} Informações do status
   */
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

  /**
   * Retorna a cor associada a um status de produção
   * @param {string} status - Status da OS
   * @returns {string} Cor em hexadecimal
   */
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

  /**
   * Retorna o ícone associado a um status de produção
   * @param {string} status - Status da OS
   * @returns {string} Nome do ícone Phosphor
   */
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

  // ============================================================
  // FUNÇÕES DE ÍCONES PARA MODAIS
  // ============================================================

  /**
   * Retorna o nome do ícone Phosphor para um título de modal
   * @param {string} title - Título do modal
   * @returns {string} Nome do ícone
   */
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
  // EXPORTAÇÃO
  // ============================================================

  global.Utils = {
    // Data e Hora
    todayISO,
    formatDate,
    formatDateTime,
    formatTime,

    // Moeda e Números
    formatCurrency,

    // String e Texto
    escapeHtml,
    capitalizeFirst,
    getInitials,

    // Mês/Ano
    getMonthRange,
    getMonthRangeForDate,
    getProximoDiaUtil,
    calcularDiasRestantes,

    // UI e Animações
    pulseElement,

    // Status
    formatStatus,
    formatarTipoDivida,
    getStatusClass,
    getLeaveTypeLabel,
    getLeaveStatusLabel,
    getPaymentStatusInfo,
    getStatusColor,
    getStatusIcon,

    // Ícones
    getIconForTitle,
  };

  console.log("✅ Utils exportado globalmente como window.Utils");
})(window);
