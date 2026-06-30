// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo de Interface (ui.js)
// Versão 1.0 - Toasts, Modais, Drag, e elementos de UI
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo UI carregado");

  // ============================================================
  // DEPENDÊNCIAS
  // ============================================================

  const Utils = global.Utils || {};
  const { escapeHtml, getIconForTitle } = Utils;

  // ============================================================
  // TOAST NOTIFICATIONS (Mobile-first)
  // ============================================================

  /**
   * Exibe uma notificação toast
   * @param {string} title - Título do toast
   * @param {string} message - Mensagem do toast
   * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duração em ms
   */
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
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
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

  /**
   * Remove um toast da tela
   * @param {HTMLElement} toast - Elemento do toast
   */
  function removeToast(toast) {
    if (!toast) return;
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }

  // ============================================================
  // MODAL FUNCTIONS (Mobile-first com Bottom Sheet)
  // ============================================================

  /**
   * Abre um modal com o título e conteúdo HTML
   * @param {string} title - Título do modal
   * @param {string} html - Conteúdo HTML do modal
   */
  function openModal(title, html) {
    const container = document.getElementById("modalContainer");
    if (!container) {
      console.error("❌ Elemento #modalContainer não encontrado");
      return;
    }

    container.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-sheet" id="modalSheet">
          <div class="handle"></div>
          <div class="modal-header">
            <h2><i class="ph ph-user-circle"></i> ${escapeHtml(title)}</h2>
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

    // Adicionar footer se não existir
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

  /**
   * Configura o arraste para fechar o modal
   */
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

  /**
   * Abre um modal de formulário com botão de submit
   * @param {string} title - Título do modal
   * @param {string} formHtml - HTML do formulário
   * @param {Function} onSubmit - Função chamada ao submeter
   * @param {string} maxWidth - Largura máxima do modal
   */
  function openFormModal(title, formHtml, onSubmit, maxWidth = "520px") {
    const html = `
      <div class="modal-overlay" id="formOverlay">
        <div class="modal-sheet" id="modalSheet" style="max-width:${maxWidth}; width:95%; max-height:92vh; display:flex; flex-direction:column;">
          <div class="handle"></div>
          <div class="modal-header" style="flex-shrink:0;">
            <h2><i class="ph ph-${getIconForTitle(title)}"></i> ${escapeHtml(title)}</h2>
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

  // ============================================================
  // MODAL DE CONFIRMAÇÃO
  // ============================================================

  /**
   * Abre um modal de confirmação
   * @param {string} title - Título do modal
   * @param {string} message - Mensagem de confirmação
   * @param {Function} onConfirm - Função chamada ao confirmar
   * @param {Function} onCancel - Função chamada ao cancelar
   * @param {string} confirmText - Texto do botão confirmar
   * @param {string} cancelText - Texto do botão cancelar
   */
  function openConfirmModal(
    title,
    message,
    onConfirm,
    onCancel = null,
    confirmText = "Sim",
    cancelText = "Não",
  ) {
    const html = `
      <div class="modal-overlay" id="confirmOverlay">
        <div class="modal-sheet" style="max-width:450px; padding: 16px;">
          <div class="handle"></div>
          <div class="modal-header" style="margin-bottom: 8px;">
            <h3 style="font-size: 1.1rem; color: var(--gold-light);">${escapeHtml(title)}</h3>
            <button class="btn-close" id="closeConfirmModal"><i class="ph ph-x"></i> Fechar</button>
          </div>
          <div style="margin-bottom: 16px; padding: 0 4px; font-size: 0.95rem; color: var(--gray);">
            ${message}
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
            <button class="btn btn-ghost" id="confirmCancelBtn" style="padding: 8px 16px;">${escapeHtml(cancelText)}</button>
            <button class="btn btn-primary" id="confirmOkBtn" style="padding: 8px 20px; background: var(--success); border-color: var(--success);">${escapeHtml(confirmText)}</button>
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

    const handleConfirm = () => {
      closeModal();
      if (typeof onConfirm === "function") onConfirm();
    };

    const handleCancel = () => {
      closeModal();
      if (typeof onCancel === "function") onCancel();
    };

    document
      .getElementById("confirmOkBtn")
      .addEventListener("click", handleConfirm);
    document
      .getElementById("confirmCancelBtn")
      .addEventListener("click", handleCancel);
    document
      .getElementById("closeConfirmModal")
      .addEventListener("click", handleCancel);
    document.getElementById("confirmOverlay").addEventListener("click", (e) => {
      if (e.target.id === "confirmOverlay") handleCancel();
    });

    document.addEventListener("keydown", function escConfirm(e) {
      if (e.key === "Escape") {
        handleCancel();
        document.removeEventListener("keydown", escConfirm);
      }
    });

    setTimeout(setupModalDrag, 100);
  }

  // ============================================================
  // MODAL COM CONFIRMAÇÃO (Formulário com validação)
  // ============================================================

  /**
   * Abre um modal com formulário e validação de alterações não salvas
   * @param {string} title - Título do modal
   * @param {string} formHtml - HTML do formulário
   * @param {Function} onSubmit - Função chamada ao submeter
   * @param {Function} onCancel - Função chamada ao cancelar
   * @param {string} maxWidth - Largura máxima do modal
   * @returns {Object} Controle do modal (close, markModified, isModified)
   */
  function modalComConfirmacao(
    title,
    formHtml,
    onSubmit,
    onCancel,
    maxWidth = "650px",
  ) {
    let formModificado = false;
    let modalAberto = true;

    const marcarModificado = () => {
      formModificado = true;
    };

    const modalHtml = `
      <div class="modal-overlay" id="formOverlay">
        <div class="modal-sheet" style="max-width: ${maxWidth}; width: 95%; max-height: 90vh; display: flex; flex-direction: column; padding-bottom: 16px;">
          <div class="handle"></div>
          <div class="modal-header" style="margin-bottom: 12px; flex-shrink: 0;">
            <h3 style="font-size: 1.1rem; color: var(--gold-light);">
              <i class="ph ph-${getIconForTitle(title)}"></i> ${escapeHtml(title)}
            </h3>
            <button class="btn-close" id="closeFormModal" type="button"><i class="ph ph-x"></i> Fechar</button>
          </div>
          <div class="modal-body" style="flex:1; overflow-y:auto; padding:0 4px 8px 4px;">
            ${formHtml}
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
            <button type="button" class="btn btn-ghost" id="modalCancelBtn" style="padding: 8px 16px;">Cancelar</button>
            <button type="button" class="btn btn-primary" id="modalSubmitBtn" style="padding: 8px 20px;">
              <i class="ph ph-check-circle"></i> Salvar
            </button>
          </div>
        </div>
      </div>
    `;

    const container = document.getElementById("modalContainer");
    if (!container) {
      console.error("❌ modalComConfirmacao: #modalContainer não encontrado.");
      return null;
    }
    container.innerHTML = modalHtml;

    const fecharModal = () => {
      if (modalAberto) {
        modalAberto = false;
        container.innerHTML = "";
        if (typeof onCancel === "function") onCancel();
      }
    };

    const fecharComConfirmacao = () => {
      if (!modalAberto) return;
      if (formModificado) {
        openConfirmModal(
          "Alterações não salvas",
          "Você tem alterações não salvas. Deseja realmente sair?",
          () => {
            fecharModal();
          },
          () => {},
          "Sair",
          "Continuar editando",
        );
      } else {
        fecharModal();
      }
    };

    document
      .getElementById("closeFormModal")
      .addEventListener("click", fecharComConfirmacao);
    document
      .getElementById("modalCancelBtn")
      .addEventListener("click", fecharComConfirmacao);

    document.getElementById("formOverlay").addEventListener("click", (e) => {
      if (e.target.id === "formOverlay") {
        fecharComConfirmacao();
      }
    });

    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") {
        fecharComConfirmacao();
        document.removeEventListener("keydown", escHandler);
      }
    });

    document
      .querySelectorAll(
        ".modal-body input, .modal-body select, .modal-body textarea",
      )
      .forEach((el) => {
        el.addEventListener("input", marcarModificado);
        el.addEventListener("change", marcarModificado);
      });

    const submitBtn = document.getElementById("modalSubmitBtn");
    let processing = false;

    submitBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (processing) {
        showToast("Aguarde", "Já estamos processando...", "info");
        return;
      }
      if (!modalAberto) return;

      processing = true;
      this.disabled = true;
      this.innerHTML = '<i class="ph ph-spinner spinning"></i> Salvando...';

      try {
        if (typeof onSubmit === "function") {
          await onSubmit();
        }
        if (modalAberto && container.innerHTML !== "") {
          container.innerHTML = "";
          modalAberto = false;
        }
      } catch (err) {
        console.error("💥 Erro no onSubmit:", err);
      } finally {
        processing = false;
        this.disabled = false;
        this.innerHTML = '<i class="ph ph-check-circle"></i> Salvar';
      }
    });

    setTimeout(setupModalDrag, 100);

    return {
      close: fecharComConfirmacao,
      markModified: marcarModificado,
      isModified: () => formModificado,
    };
  }

  // ============================================================
  // KEYBOARD AVOIDANCE (Mobile-first)
  // ============================================================

  /**
   * Configura o ajuste de scroll para evitar que o teclado cubra inputs
   */
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
  // MENU DE AÇÕES MOBILE (Bottom Sheet)
  // ============================================================

  /**
   * Abre um menu de ações em formato bottom sheet
   * @param {string} itemId - ID do item (para referência)
   * @param {Array} acoes - Lista de ações [{ label, icon, color, onclick }]
   * @param {string} titulo - Título do menu
   */
  function abrirMenuAcoesMobile(itemId, acoes, titulo = "Ações") {
    const html = `
      <div class="modal-overlay" id="menuActionsOverlay">
        <div class="modal-sheet" style="max-height: 60vh; padding-bottom: 20px;">
          <div class="handle"></div>
          <div style="padding: 8px 16px 4px;">
            <h4 style="color: var(--gold-light); margin-bottom: 12px; font-size: 1rem;">
              <i class="ph ph-gear-six"></i> ${escapeHtml(titulo)}
            </h4>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              ${acoes
                .map(
                  (a) => `
                <button onclick="event.stopPropagation(); ${a.onclick}; document.getElementById('menuActionsOverlay').remove();" style="
                  display: flex;
                  align-items: center;
                  gap: 14px;
                  width: 100%;
                  padding: 14px 16px;
                  background: transparent;
                  border: none;
                  border-bottom: 1px solid rgba(255,255,255,0.04);
                  color: var(--white);
                  font-size: 0.95rem;
                  font-weight: 500;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  min-height: 52px;
                  text-align: left;
                  font-family: inherit;
                " 
                onmouseenter="this.style.background='rgba(255,255,255,0.04)'"
                onmouseleave="this.style.background='transparent'"
                onmousedown="this.style.transform='scale(0.98)'"
                onmouseup="this.style.transform='scale(1)'"
                ontouchstart="this.style.background='rgba(255,255,255,0.04)'"
                ontouchend="this.style.background='transparent'"
                >
                  <i class="ph ${a.icon}" style="font-size: 1.3rem; color: ${a.color || "var(--gray)"}; width: 28px; text-align: center;"></i>
                  <span style="flex: 1;">${escapeHtml(a.label)}</span>
                  ${a.shortcut ? `<span style="font-size: 0.6rem; color: var(--gray-dark); background: rgba(255,255,255,0.04); padding: 2px 8px; border-radius: 10px;">${escapeHtml(a.shortcut)}</span>` : ""}
                </button>
              `,
                )
                .join("")}
            </div>
            <button onclick="document.getElementById('menuActionsOverlay').remove()" style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              width: 100%;
              padding: 14px;
              margin-top: 12px;
              background: rgba(255,255,255,0.04);
              border: 1px solid rgba(255,255,255,0.06);
              border-radius: 12px;
              color: var(--gray);
              font-size: 0.85rem;
              cursor: pointer;
              font-family: inherit;
              transition: all 0.2s ease;
            "
            onmouseenter="this.style.background='rgba(255,255,255,0.08)'"
            onmouseleave="this.style.background='rgba(255,255,255,0.04)'"
            ontouchstart="this.style.background='rgba(255,255,255,0.08)'"
            ontouchend="this.style.background='rgba(255,255,255,0.04)'"
            >
              <i class="ph ph-x-circle"></i> Fechar
            </button>
          </div>
        </div>
      </div>
    `;

    // Remover menu anterior se existir
    const oldMenu = document.getElementById("menuActionsOverlay");
    if (oldMenu) oldMenu.remove();

    const container = document.getElementById("modalContainer");
    if (container) {
      container.innerHTML = html;

      // Fechar ao clicar fora
      document
        .getElementById("menuActionsOverlay")
        .addEventListener("click", function (e) {
          if (e.target.id === "menuActionsOverlay") {
            this.remove();
          }
        });
    }
  }

  // ============================================================
  // FEEDBACK (Mantido para compatibilidade)
  // ============================================================

  /**
   * Exibe um feedback (compatibilidade com versões anteriores)
   * @param {string} title - Título
   * @param {string} message - Mensagem
   * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
   * @param {Function} callback - Função chamada ao fechar
   */
  function showFeedback(title, message, type = "success", callback = null) {
    // Usar showToast como base
    showToast(title, message, type);
    if (typeof callback === "function") {
      setTimeout(callback, 4000);
    }
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.UI = {
    // Toasts
    showToast,
    removeToast,

    // Modais
    openModal,
    openFormModal,
    openConfirmModal,
    modalComConfirmacao,
    setupModalDrag,

    // Menu de Ações
    abrirMenuAcoesMobile,

    // Keyboard
    setupKeyboardAvoidance,

    // Feedback (compatibilidade)
    showFeedback,
  };

  console.log("✅ UI exportado globalmente como window.UI");

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function init() {
    console.log("🎨 UI inicializado");
  }

  global.UI.init = init;

  // Inicializar automaticamente
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
