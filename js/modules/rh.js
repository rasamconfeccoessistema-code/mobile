// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo RH (rh.js) - Aba de Recursos Humanos
// Versão 3.0 - MODO LEITURA (APENAS VISUALIZAÇÃO)
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo RH carregado - Modo Leitura");

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
    getInitials,
    escapeHtml,
    getLeaveTypeLabel,
    getLeaveStatusLabel,
    calcularDiasRestantes,
    getProximoDiaUtil,
    getMonthRangeForDate,
    showToast: toast,
  } = Utils;

  // ============================================================
  // VARIÁVEIS DE ESTADO
  // ============================================================

  let dados = {};
  let carregando = false;

  // ============================================================
  // ELEMENTOS DO DOM (Cache)
  // ============================================================

  const $ = (id) => document.getElementById(id);

  // ============================================================
  // FUNÇÕES DE CARREGAMENTO DE DADOS
  // ============================================================

  /**
   * Carrega os dados de RH para o período selecionado
   * @param {Date} periodo - Data de referência para o período
   * @returns {Promise<Object>} Dados de RH
   */
  async function carregarRHPeriodo(periodo) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        throw new Error("Cliente Supabase não disponível");
      }

      const mesRange = getMonthRangeForDate(periodo || new Date());
      console.log(`👤 RH: Carregando para: ${mesRange.mes}/${mesRange.ano}`);

      // Atualizar período no estado global
      if (global.App) {
        global.App.periodState.rh = periodo || new Date();
      }

      // ========== BUSCAR FUNCIONÁRIOS ==========
      const { data: funcionarios, error: errFunc } = await supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("full_name");

      if (errFunc) console.error("❌ RH: Erro funcionários:", errFunc);

      // ========== BUSCAR FÉRIAS DO PERÍODO ==========
      const { data: ferias, error: errFer } = await supabase
        .from("employee_vacations")
        .select(
          `
          *,
          employees(full_name, role, photo_url, phone_cell, email_personal)
        `
        )
        .eq("status", "agendada")
        .lte("start_date", mesRange.fim)
        .gte("end_date", mesRange.inicio)
        .order("start_date", { ascending: true });

      if (errFer) console.error("❌ RH: Erro férias:", errFer);

      // ========== BUSCAR AFASTAMENTOS DO PERÍODO ==========
      const { data: afastamentos, error: errAbs } = await supabase
        .from("absences")
        .select(
          `
          *,
          employees(full_name, role, photo_url, phone_cell, email_personal)
        `
        )
        .lte("start_date", mesRange.fim)
        .gte("end_date", mesRange.inicio)
        .order("start_date", { ascending: false });

      if (errAbs) console.error("❌ RH: Erro afastamentos:", errAbs);

      // ========== MONTAR OBJETO DE DADOS ==========
      dados = {
        funcionarios: funcionarios || [],
        ferias: ferias || [],
        afastamentos: afastamentos || [],
        mesRange: mesRange,
      };

      // Renderizar RH
      renderizarRH(dados);

      // Atualizar seletor de período
      if (global.UI && typeof global.UI.renderizarPeriodSelector === 'function') {
        const containerId = 'periodSelectorContainer_rh';
        const container = document.getElementById(containerId);
        if (container) {
          global.UI.renderizarPeriodSelector(
            containerId,
            periodo || new Date(),
            (novoPeriodo) => {
              carregarRHPeriodo(novoPeriodo);
            },
            'rh'
          );
        }
      }

      console.log(
        `✅ RH: ${funcionarios?.length || 0} funcionários, ${ferias?.length || 0} férias, ${afastamentos?.length || 0} afastamentos`
      );
      return dados;
    } catch (e) {
      console.error("❌ RH: Erro ao carregar dados:", e);
      if (UI.showToast) {
        UI.showToast("Erro", "Falha ao carregar dados de RH.", "error");
      }
      return dados;
    }
  }

  // ============================================================
  // RENDERIZAR - ABA RH (MODO LEITURA)
  // ============================================================

  function renderizarRH(dados) {
    console.log("📊 RH: Renderizando (Modo Leitura)...");

    const { funcionarios, ferias, afastamentos } = dados;

    const totalFuncionarios = funcionarios?.length || 0;
    const emFerias = ferias?.length || 0;
    const emAfastamento = (afastamentos || []).filter(
      (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date()
    ).length;
    const acidenteTrabalho = (afastamentos || []).filter(
      (a) => a.work_accident === true && a.status !== "encerrado"
    ).length;

    // ========== ATUALIZAR KPIs ==========
    const rhTotalFuncionarios = document.getElementById("rhTotalFuncionarios");
    const rhEmFerias = document.getElementById("rhEmFerias");
    const rhEmAfastamento = document.getElementById("rhEmAfastamento");
    const rhAcidenteTrabalho = document.getElementById("rhAcidenteTrabalho");

    if (rhTotalFuncionarios)
      rhTotalFuncionarios.textContent = totalFuncionarios;
    if (rhEmFerias) rhEmFerias.textContent = emFerias;
    if (rhEmAfastamento) rhEmAfastamento.textContent = emAfastamento;
    if (rhAcidenteTrabalho) rhAcidenteTrabalho.textContent = acidenteTrabalho;

    // ========== RENDERIZAR FÉRIAS ==========
    const containerFerias = document.getElementById("listaRHFerias");
    const totalFerias = document.getElementById("totalFerias");

    if (totalFerias) {
      totalFerias.textContent = (ferias || []).length + " registros";
    }

    if (containerFerias) {
      if (ferias && ferias.length > 0) {
        containerFerias.innerHTML = ferias
          .slice(0, 10)
          .map((f) => {
            const func = f.employees;
            const dataRetorno = getProximoDiaUtil(f.end_date);
            return `
              <div class="list-item" style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:default;">
                <div class="item-main" style="flex:1;min-width:0;">
                  <div class="item-title" style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(func?.full_name || "-")} 🌴</div>
                  <div class="item-sub" style="font-size:9px;color:var(--gray-dark);margin-top:1px;">${escapeHtml(func?.role || "-")} · Retorno: ${formatDate(dataRetorno.toISOString())}</div>
                </div>
                <div class="item-right" style="text-align:right;flex-shrink:0;">
                  <span class="item-badge badge-status-em_costura" style="font-size:8px;font-weight:600;padding:2px 8px;border-radius:20px;display:inline-block;">Em Gozo</span>
                  <div style="font-size:8px;color:var(--gray-dark);">${formatDate(f.start_date)} - ${formatDate(f.end_date)}</div>
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        containerFerias.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:20px 12px;color:var(--gray-dark);">
            <i class="ph ph-sun" style="font-size:24px;display:block;margin-bottom:4px;color:var(--gray);"></i>
            <p style="font-size:11px;">Nenhum funcionário em férias</p>
          </div>
        `;
      }
    }

    // ========== RENDERIZAR AFASTAMENTOS ==========
    const containerAfastamentos = document.getElementById(
      "listaRHAfastamentos"
    );
    const totalAfastamentos = document.getElementById("totalAfastamentos");

    if (totalAfastamentos) {
      totalAfastamentos.textContent =
        (afastamentos || []).length + " registros";
    }

    if (containerAfastamentos) {
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
                     padding:8px 12px;
                     margin-bottom:6px;
                     border-radius:8px;
                     border-left:4px solid ${borderColor};
                     background:${a.status === "encerrado" ? "rgba(255,255,255,0.02)" : isAcidente ? "rgba(255,82,82,0.05)" : "rgba(255,255,255,0.02)"};
                     transition:var(--transition);
                     cursor:pointer;
                     gap:4px;
                   "
                   onclick="window.RH.abrirModalAfastamento('${a.id}')"
                   onmouseenter="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)';"
                   onmouseleave="this.style.boxShadow='none';"
                   >
                <div class="item-main" style="flex:1;min-width:0;">
                  <div class="item-title" style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isAcidente ? "color:var(--error);" : ""}">
                    ${escapeHtml(func?.full_name || "-")} 
                    ${isAcidente ? "⚠️" : "🏥"}
                  </div>
                  <div class="item-sub" style="font-size:9px;color:var(--gray-dark);margin-top:1px;display:flex;flex-wrap:wrap;gap:3px 6px;">
                    <span>${getLeaveTypeLabel(a.leave_type || a.type)}</span>
                    <span>•</span>
                    <span>${formatDate(a.start_date)} - ${formatDate(a.end_date)}</span>
                    <span>•</span>
                    <span style="color:${diasRestantes > 0 ? "var(--warning)" : "var(--gray)"};">${diasRestantes > 0 ? `${diasRestantes} dias restantes` : "Encerrado"}</span>
                    ${a.reason ? `<span>•</span><span style="font-size:0.5rem;color:var(--gray);">${escapeHtml(a.reason)}</span>` : ""}
                  </div>
                  ${a.icd_code ? `<div style="font-size:0.5rem;color:var(--gray-dark);margin-top:1px;">CID: ${escapeHtml(a.icd_code)}</div>` : ""}
                </div>
                <div class="item-right" style="text-align:right;flex-shrink:0;">
                  <span class="item-badge ${emAndamento ? "badge-status-em_costura" : "badge-status-cancelado"}" style="font-size:8px;font-weight:600;padding:2px 8px;border-radius:20px;display:inline-block;">
                    ${statusLabel}
                  </span>
                  ${a.doctor_name ? `<div style="font-size:7px;color:var(--gray-dark);margin-top:1px;">Dr. ${escapeHtml(a.doctor_name)}</div>` : ""}
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        containerAfastamentos.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:20px 12px;color:var(--gray-dark);">
            <i class="ph ph-hospital" style="font-size:24px;display:block;margin-bottom:4px;color:var(--gray);"></i>
            <p style="font-size:11px;">Nenhum afastamento registrado</p>
          </div>
        `;
      }
    }

    // ========== RENDERIZAR FUNCIONÁRIOS ATIVOS ==========
    const containerFunc = document.getElementById("listaRHFuncionarios");
    const totalFuncionariosRH = document.getElementById("totalFuncionariosRH");

    if (totalFuncionariosRH) {
      totalFuncionariosRH.textContent =
        (funcionarios || []).length + " funcionários";
    }

    if (containerFunc) {
      if (funcionarios && funcionarios.length > 0) {
        containerFunc.innerHTML = funcionarios
          .slice(0, 15)
          .map((f) => {
            const emFeriasCheck = (ferias || []).some(
              (ff) => ff.employee_id === f.id
            );
            const emAfastamentoCheck = (afastamentos || []).some(
              (a) =>
                a.employee_id === f.id &&
                a.status !== "encerrado" &&
                new Date(a.end_date) >= new Date()
            );
            const isAcidente = (afastamentos || []).some(
              (a) =>
                a.employee_id === f.id &&
                a.work_accident === true &&
                a.status !== "encerrado"
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

            return `
              <div class="list-item ${emFeriasCheck ? "item-warning" : emAfastamentoCheck ? "item-vencido" : ""}" 
                   data-id="${f.id}" 
                   style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:pointer;"
                   onclick="window.RH.abrirModalFuncionario('${f.id}')">
                <div class="item-main" style="flex:1;min-width:0;">
                  <div class="item-title" style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${corTitulo}">${escapeHtml(f.full_name)}</div>
                  <div class="item-sub" style="font-size:9px;color:var(--gray-dark);margin-top:1px;">${escapeHtml(f.role || "-")} · ${f.contract_type === "clt" ? "CLT" : "Diarista"}</div>
                </div>
                <div class="item-right" style="text-align:right;flex-shrink:0;">
                  <span class="item-badge ${statusClasse}" style="font-size:8px;font-weight:600;padding:2px 8px;border-radius:20px;display:inline-block;">${statusTexto}</span>
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        containerFunc.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:20px 12px;color:var(--gray-dark);">
            <i class="ph ph-users" style="font-size:24px;display:block;margin-bottom:4px;color:var(--gray);"></i>
            <p style="font-size:11px;">Nenhum funcionário ativo</p>
          </div>
        `;
      }
    }

    console.log("✅ RH: Renderização concluída (Modo Leitura)");
  }

  // ============================================================
  // FUNÇÕES DE MODAL - FUNCIONÁRIO (MODO LEITURA)
  // ============================================================

  window.abrirModalFuncionario = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      // Buscar dados do funcionário
      const { data: func, error: funcError } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();

      if (funcError || !func) {
        UI.showToast("Erro", "Funcionário não encontrado.", "error");
        return;
      }

      // Buscar férias do funcionário
      const { data: ferias } = await supabase
        .from("employee_vacations")
        .select("*")
        .eq("employee_id", id)
        .eq("status", "agendada")
        .lte("start_date", todayISO())
        .gte("end_date", todayISO())
        .maybeSingle();

      // Buscar afastamento ativo do funcionário
      const { data: afastamento } = await supabase
        .from("absences")
        .select("*")
        .eq("employee_id", id)
        .neq("status", "encerrado")
        .gte("end_date", todayISO())
        .maybeSingle();

      // Montar HTML
      const emFerias = ferias || null;
      const afastamentoAtivo = afastamento || null;

      const fotoHtml = func.photo_url
        ? `<img src="${func.photo_url}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);">`
        : `<div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:700;background:linear-gradient(135deg,var(--pink-dark),var(--gold-dark));color:#fff;">${getInitials(func.full_name)}</div>`;

      let feriasHtml = "";
      if (emFerias) {
        const dataRetorno = getProximoDiaUtil(emFerias.end_date);
        feriasHtml = `
          <div style="background: rgba(255,193,7,0.08); border-left: 4px solid var(--warning); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: var(--warning); font-size:0.85rem;"><i class="ph ph-sun"></i> 🌴 Em Férias</span>
              <span style="font-size: 0.65rem; color: var(--gray);">Retorno: ${formatDate(dataRetorno.toISOString())}</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--gray); margin-top: 2px;">
              ${formatDate(emFerias.start_date)} → ${formatDate(emFerias.end_date)}
            </div>
          </div>
        `;
      }

      let afastamentoHtml = "";
      if (afastamentoAtivo) {
        const diasRestantes = calcularDiasRestantes(afastamentoAtivo.end_date);
        const isAcidente = afastamentoAtivo.work_accident === true;
        const statusCor = isAcidente ? "var(--error)" : "var(--warning)";
        const bgCor = isAcidente
          ? "rgba(255,82,82,0.08)"
          : "rgba(255,193,7,0.08)";

        afastamentoHtml = `
          <div style="background: ${bgCor}; border-left: 4px solid ${statusCor}; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: ${statusCor}; font-size:0.85rem;">
                ${isAcidente ? "⚠️ Acidente de Trabalho" : "🏥 Em Afastamento"}
              </span>
              <span style="font-size: 0.65rem; color: ${diasRestantes <= 3 ? "var(--error)" : "var(--gray)"};">
                ${diasRestantes} dias restantes
              </span>
            </div>
            <div style="font-size: 0.7rem; color: var(--gray); margin-top: 2px;">
              ${formatDate(afastamentoAtivo.start_date)} → ${formatDate(afastamentoAtivo.end_date)}
            </div>
            ${afastamentoAtivo.reason ? `<div style="font-size: 0.65rem; color: var(--gray-dark); margin-top: 2px;">📝 Motivo: ${escapeHtml(afastamentoAtivo.reason)}</div>` : ""}
            ${afastamentoAtivo.doctor_name ? `<div style="font-size: 0.65rem; color: var(--gray-dark);">👨‍⚕️ Médico: ${escapeHtml(afastamentoAtivo.doctor_name)}</div>` : ""}
            ${afastamentoAtivo.icd_code ? `<div style="font-size: 0.65rem; color: var(--gray-dark);">📋 CID: ${escapeHtml(afastamentoAtivo.icd_code)}</div>` : ""}
            ${afastamentoAtivo.document_url ? `<div style="font-size: 0.65rem; color: var(--gray-dark);">📎 <a href="${afastamentoAtivo.document_url}" target="_blank" style="color: var(--gold-light);">Ver atestado</a></div>` : ""}
          </div>
        `;
      }

      const html = `
        <div style="display: grid; gap: 10px;">
          <!-- Cabeçalho com foto -->
          <div style="display: flex; align-items: center; gap: 14px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 10px;">
            ${fotoHtml}
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 1rem;">${escapeHtml(func.full_name)}</div>
              <div style="color: var(--gold-light); font-size: 0.8rem;">${escapeHtml(func.role || "Sem função")}</div>
              <span style="font-size: 0.65rem; color: ${func.active ? "var(--success)" : "var(--error)"};">${func.active ? "🟢 Ativo" : "🔴 Inativo"}</span>
            </div>
          </div>

          <!-- Dados Pessoais em grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; background: rgba(255,255,255,0.02); border-radius: 8px; padding: 10px;">
            <div><span style="color: var(--gray-dark); font-size: 0.55rem;">CPF</span><br><span style="font-size: 0.8rem;">${escapeHtml(func.cpf || "-")}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.55rem;">Celular</span><br><span style="font-size: 0.8rem;">${escapeHtml(func.phone_cell || "-")}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.55rem;">E-mail</span><br><span style="font-size: 0.8rem;">${escapeHtml(func.email_personal || "-")}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.55rem;">Contrato</span><br><span style="font-size: 0.8rem;">${func.contract_type === "clt" ? "CLT" : "Diarista"}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.55rem;">Salário</span><br><span style="font-size: 0.8rem; color: var(--gold-light);">${func.contract_type === "clt" ? formatCurrency(func.monthly_salary) : formatCurrency(func.daily_rate) + "/dia"}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.55rem;">Admissão</span><br><span style="font-size: 0.8rem;">${formatDate(func.admission_date)}</span></div>
          </div>

          <!-- Férias (se tiver) -->
          ${feriasHtml}

          <!-- Afastamento (se tiver) -->
          ${afastamentoHtml}

          <!-- Observações -->
          ${
            func.notes
              ? `
            <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 8px;">
              <div style="font-size: 0.6rem; color: var(--gray-dark);"><i class="ph ph-note"></i> Observações</div>
              <div style="font-size: 0.8rem; color: var(--gray);">${escapeHtml(func.notes)}</div>
            </div>
          `
              : ""
          }

          <div style="font-size:0.55rem;color:var(--gray-dark);text-align:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">ID: ${func.id}</div>
        </div>
      `;

      UI.openModal(escapeHtml(func.full_name), html);
    } catch (e) {
      console.error("Erro ao abrir modal do funcionário:", e);
      UI.showToast("Erro", "Falha ao carregar dados do funcionário.", "error");
    }
  };

  // ============================================================
  // FUNÇÕES DE MODAL - AFASTAMENTO (MODO LEITURA)
  // ============================================================

  window.abrirModalAfastamento = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: afastamento, error } = await supabase
        .from("absences")
        .select(
          `
          *,
          employees(full_name, role, phone_cell, email_personal, photo_url)
        `
        )
        .eq("id", id)
        .single();

      if (error || !afastamento) {
        UI.showToast("Erro", "Afastamento não encontrado.", "error");
        return;
      }

      const func = afastamento.employees;
      const diasRestantes = calcularDiasRestantes(afastamento.end_date);
      const emAndamento = diasRestantes > 0 && afastamento.status !== "encerrado";
      const isAcidente = afastamento.work_accident === true;

      // ========== DEFINIR STATUS DO BANNER ==========
      let statusConfig = {};
      if (afastamento.status === "encerrado") {
        statusConfig = {
          status: "neutral",
          statusIcon: "ph-check-circle",
          statusTitle: "🔴 Afastamento Encerrado",
          statusSub: `Encerrado em ${formatDate(afastamento.end_date)}`,
        };
      } else if (isAcidente) {
        statusConfig = {
          status: "danger",
          statusIcon: "ph-warning-circle",
          statusTitle: "⚠️ Acidente de Trabalho",
          statusSub: `${diasRestantes} dias restantes`,
        };
      } else if (diasRestantes <= 3) {
        statusConfig = {
          status: "danger",
          statusIcon: "ph-clock",
          statusTitle: "🔴 Retorno Próximo",
          statusSub: `${diasRestantes} dias restantes`,
        };
      } else {
        statusConfig = {
          status: "warning",
          statusIcon: "ph-clock",
          statusTitle: "🟡 Em Afastamento",
          statusSub: `${diasRestantes} dias restantes`,
        };
      }

      // ========== INFORMAÇÕES PRINCIPAIS ==========
      const infoItems = [
        {
          label: "Funcionário",
          value: escapeHtml(func?.full_name || "Funcionário"),
          class: "highlight",
        },
        { label: "Cargo", value: escapeHtml(func?.role || "-") },
        {
          label: "Tipo",
          value: getLeaveTypeLabel(afastamento.leave_type || afastamento.type),
        },
        {
          label: "Período",
          value: `${formatDate(afastamento.start_date)} → ${formatDate(afastamento.end_date)}`,
        },
        { label: "Dias Totais", value: `${afastamento.days_off || 0} dias` },
        {
          label: "Dias Restantes",
          value: `${diasRestantes > 0 ? diasRestantes : 0} dias`,
          class: diasRestantes <= 3 ? "danger" : "success",
        },
      ];

      // ========== SEÇÕES DO MODAL ==========
      const secoes = [];

      if (afastamento.reason) {
        secoes.push({
          titulo: "Motivo",
          icon: "ph-note",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(afastamento.reason)}</div>`,
        });
      }

      if (afastamento.icd_code) {
        secoes.push({
          titulo: "CID",
          icon: "ph-clipboard",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(afastamento.icd_code)}</div>`,
        });
      }

      if (afastamento.doctor_name) {
        secoes.push({
          titulo: "Médico Responsável",
          icon: "ph-user-md",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(afastamento.doctor_name)}</div>`,
        });
      }

      if (afastamento.hospital_name) {
        secoes.push({
          titulo: "Hospital",
          icon: "ph-building",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(afastamento.hospital_name)}</div>`,
        });
      }

      if (afastamento.document_url) {
        secoes.push({
          titulo: "Atestado",
          icon: "ph-paperclip",
          html: `<a href="${afastamento.document_url}" target="_blank" style="color:var(--gold-light);font-size:0.85rem;">📎 Ver documento</a>`,
        });
      }

      if (afastamento.notes) {
        secoes.push({
          titulo: "Observações",
          icon: "ph-info",
          html: `<div style="font-size:0.85rem;color:var(--gray);padding:4px 0;">${escapeHtml(afastamento.notes)}</div>`,
        });
      }

      // ========== AÇÕES (APENAS FECHAR) ==========
      const acoes = [
        {
          label: "Fechar",
          icon: "ph-x-circle",
          class: "ghost",
          onclick: "document.getElementById('modalContainer').innerHTML = ''",
        }
      ];

      // ========== CRIAR MODAL PADRONIZADO ==========
      UI.criarModalPadronizado(
        `📋 Afastamento - ${escapeHtml(func?.full_name || "Funcionário")}`,
        {
          ...statusConfig,
          infoItems,
          secoes,
          acoes,
        }
      );

    } catch (e) {
      console.error("Erro ao abrir modal do afastamento:", e);
      UI.showToast("Erro", "Falha ao carregar dados do afastamento.", "error");
    }
  };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("👤 RH: Inicializando (Modo Leitura)...");

    // Carregar dados iniciais
    const periodo = global.App?.periodState?.rh || new Date();
    await carregarRHPeriodo(periodo);

    console.log("✅ RH: Inicializado com sucesso (Modo Leitura)");
  }

  // ============================================================
  // EXPORTAÇÃO
  // ============================================================

  global.RH = {
    // Dados
    dados,
    carregando,

    // Carregamento
    carregarRHPeriodo,

    // Renderização
    renderizarRH,

    // Funcionários
    abrirModalFuncionario: window.abrirModalFuncionario,

    // Afastamentos
    abrirModalAfastamento: window.abrirModalAfastamento,

    // Inicialização
    init,
  };

  console.log("✅ RH exportado globalmente como window.RH (Modo Leitura)");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
