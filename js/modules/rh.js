// ============================================================
// APP GESTOR - FACÇÃO JEANS
// Módulo RH (rh.js) - Aba de Recursos Humanos
// Versão 1.0 - Gestão de funcionários, férias e afastamentos
// ============================================================

(function (global) {
  "use strict";

  console.log("📦 Módulo RH carregado");

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
        `,
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
        `,
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

      console.log(
        `✅ RH: ${funcionarios?.length || 0} funcionários, ${ferias?.length || 0} férias, ${afastamentos?.length || 0} afastamentos`,
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
  // RENDERIZAR - ABA RH
  // ============================================================

  function renderizarRH(dados) {
    console.log("📊 RH: Renderizando...");

    const { funcionarios, ferias, afastamentos } = dados;

    const totalFuncionarios = funcionarios?.length || 0;
    const emFerias = ferias?.length || 0;
    const emAfastamento = (afastamentos || []).filter(
      (a) => a.status !== "encerrado" && new Date(a.end_date) >= new Date(),
    ).length;
    const acidenteTrabalho = (afastamentos || []).filter(
      (a) => a.work_accident === true && a.status !== "encerrado",
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
              <div class="list-item" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:default;">
                <div class="item-main" style="flex:1;min-width:0;">
                  <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(func?.full_name || "-")} 🌴</div>
                  <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${escapeHtml(func?.role || "-")} · Retorno: ${formatDate(dataRetorno.toISOString())}</div>
                </div>
                <div class="item-right" style="text-align:right;flex-shrink:0;">
                  <span class="item-badge badge-status-em_costura" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">Em Gozo</span>
                  <div style="font-size:9px;color:var(--gray-dark);">${formatDate(f.start_date)} - ${formatDate(f.end_date)}</div>
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        containerFerias.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);">
            <i class="ph ph-sun" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i>
            <p style="font-size:12px;">Nenhum funcionário em férias</p>
          </div>
        `;
      }
    }

    // ========== RENDERIZAR AFASTAMENTOS ==========
    const containerAfastamentos = document.getElementById(
      "listaRHAfastamentos",
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
                     padding:10px 14px;
                     margin-bottom:8px;
                     border-radius:8px;
                     border-left:4px solid ${borderColor};
                     background:${a.status === "encerrado" ? "rgba(255,255,255,0.02)" : isAcidente ? "rgba(255,82,82,0.05)" : "rgba(255,255,255,0.02)"};
                     transition:var(--transition);
                     cursor:pointer;
                   "
                   onclick="window.RH.abrirModalAfastamento('${a.id}')"
                   onmouseenter="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)';"
                   onmouseleave="this.style.boxShadow='none';"
                   >
                <div class="item-main" style="flex:1;min-width:0;">
                  <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isAcidente ? "color:var(--error);" : ""}">
                    ${escapeHtml(func?.full_name || "-")} 
                    ${isAcidente ? "⚠️" : "🏥"}
                  </div>
                  <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;display:flex;flex-wrap:wrap;gap:4px 8px;">
                    <span>${getLeaveTypeLabel(a.leave_type || a.type)}</span>
                    <span>•</span>
                    <span>${formatDate(a.start_date)} - ${formatDate(a.end_date)}</span>
                    <span>•</span>
                    <span style="color:${diasRestantes > 0 ? "var(--warning)" : "var(--gray)"};">${diasRestantes > 0 ? `${diasRestantes} dias restantes` : "Encerrado"}</span>
                    ${a.reason ? `<span>•</span><span style="font-size:0.55rem;color:var(--gray);">${escapeHtml(a.reason)}</span>` : ""}
                  </div>
                  ${a.icd_code ? `<div style="font-size:0.55rem;color:var(--gray-dark);margin-top:2px;">CID: ${escapeHtml(a.icd_code)}</div>` : ""}
                </div>
                <div class="item-right" style="text-align:right;flex-shrink:0;">
                  <span class="item-badge ${emAndamento ? "badge-status-em_costura" : "badge-status-cancelado"}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">
                    ${statusLabel}
                  </span>
                  ${a.doctor_name ? `<div style="font-size:8px;color:var(--gray-dark);margin-top:2px;">Dr. ${escapeHtml(a.doctor_name)}</div>` : ""}
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        containerAfastamentos.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);">
            <i class="ph ph-hospital" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i>
            <p style="font-size:12px;">Nenhum afastamento registrado</p>
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

            return `
              <div class="list-item ${emFeriasCheck ? "item-warning" : emAfastamentoCheck ? "item-vencido" : ""}" 
                   data-id="${f.id}" 
                   style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);gap:10px;transition:var(--transition);cursor:pointer;"
                   onclick="window.RH.abrirModalFuncionario('${f.id}')">
                <div class="item-main" style="flex:1;min-width:0;">
                  <div class="item-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${corTitulo}">${escapeHtml(f.full_name)}</div>
                  <div class="item-sub" style="font-size:10px;color:var(--gray-dark);margin-top:1px;">${escapeHtml(f.role || "-")} · ${f.contract_type === "clt" ? "CLT" : "Diarista"}</div>
                </div>
                <div class="item-right" style="text-align:right;flex-shrink:0;">
                  <span class="item-badge ${statusClasse}" style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:20px;display:inline-block;">${statusTexto}</span>
                </div>
              </div>
            `;
          })
          .join("");
      } else {
        containerFunc.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:24px 16px;color:var(--gray-dark);">
            <i class="ph ph-users" style="font-size:28px;display:block;margin-bottom:6px;color:var(--gray);"></i>
            <p style="font-size:12px;">Nenhum funcionário ativo</p>
          </div>
        `;
      }
    }

    console.log("✅ RH: Renderização concluída");
  }

  // ============================================================
  // FUNÇÕES DE MODAL - FUNCIONÁRIO
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
        ? `<img src="${func.photo_url}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);">`
        : `<div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;background:linear-gradient(135deg,var(--pink-dark),var(--gold-dark));color:#fff;">${getInitials(func.full_name)}</div>`;

      let feriasHtml = "";
      if (emFerias) {
        const dataRetorno = getProximoDiaUtil(emFerias.end_date);
        feriasHtml = `
          <div style="background: rgba(255,193,7,0.08); border-left: 4px solid var(--warning); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: var(--warning);"><i class="ph ph-sun"></i> 🌴 Em Férias</span>
              <span style="font-size: 0.7rem; color: var(--gray);">Retorno: ${formatDate(dataRetorno.toISOString())}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">
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
          <div style="background: ${bgCor}; border-left: 4px solid ${statusCor}; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: ${statusCor};">
                ${isAcidente ? "⚠️ Acidente de Trabalho" : "🏥 Em Afastamento"}
              </span>
              <span style="font-size: 0.7rem; color: ${diasRestantes <= 3 ? "var(--error)" : "var(--gray)"};">
                ${diasRestantes} dias restantes
              </span>
            </div>
            <div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">
              ${formatDate(afastamentoAtivo.start_date)} → ${formatDate(afastamentoAtivo.end_date)}
            </div>
            ${afastamentoAtivo.reason ? `<div style="font-size: 0.7rem; color: var(--gray-dark); margin-top: 4px;">📝 Motivo: ${escapeHtml(afastamentoAtivo.reason)}</div>` : ""}
            ${afastamentoAtivo.doctor_name ? `<div style="font-size: 0.7rem; color: var(--gray-dark);">👨‍⚕️ Médico: ${escapeHtml(afastamentoAtivo.doctor_name)}</div>` : ""}
            ${afastamentoAtivo.icd_code ? `<div style="font-size: 0.7rem; color: var(--gray-dark);">📋 CID: ${escapeHtml(afastamentoAtivo.icd_code)}</div>` : ""}
            ${afastamentoAtivo.document_url ? `<div style="font-size: 0.7rem; color: var(--gray-dark);">📎 <a href="${afastamentoAtivo.document_url}" target="_blank" style="color: var(--gold-light);">Ver atestado</a></div>` : ""}
          </div>
        `;
      }

      const html = `
        <div style="display: grid; gap: 12px;">
          <!-- Cabeçalho com foto -->
          <div style="display: flex; align-items: center; gap: 16px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 12px;">
            ${fotoHtml}
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 1.1rem;">${escapeHtml(func.full_name)}</div>
              <div style="color: var(--gold-light); font-size: 0.85rem;">${escapeHtml(func.role || "Sem função")}</div>
              <span style="font-size: 0.7rem; color: ${func.active ? "var(--success)" : "var(--error)"};">${func.active ? "🟢 Ativo" : "🔴 Inativo"}</span>
            </div>
          </div>

          <!-- Dados Pessoais em grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px;">
            <div><span style="color: var(--gray-dark); font-size: 0.6rem;">CPF</span><br><span style="font-size: 0.85rem;">${escapeHtml(func.cpf || "-")}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.6rem;">Celular</span><br><span style="font-size: 0.85rem;">${escapeHtml(func.phone_cell || "-")}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.6rem;">E-mail</span><br><span style="font-size: 0.85rem;">${escapeHtml(func.email_personal || "-")}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.6rem;">Contrato</span><br><span style="font-size: 0.85rem;">${func.contract_type === "clt" ? "CLT" : "Diarista"}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.6rem;">Salário</span><br><span style="font-size: 0.85rem; color: var(--gold-light);">${func.contract_type === "clt" ? formatCurrency(func.monthly_salary) : formatCurrency(func.daily_rate) + "/dia"}</span></div>
            <div><span style="color: var(--gray-dark); font-size: 0.6rem;">Admissão</span><br><span style="font-size: 0.85rem;">${formatDate(func.admission_date)}</span></div>
          </div>

          <!-- Férias (se tiver) -->
          ${feriasHtml}

          <!-- Afastamento (se tiver) -->
          ${afastamentoHtml}

          <!-- Observações -->
          ${
            func.notes
              ? `
            <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 10px;">
              <div style="font-size: 0.65rem; color: var(--gray-dark);"><i class="ph ph-note"></i> Observações</div>
              <div style="font-size: 0.85rem; color: var(--gray);">${escapeHtml(func.notes)}</div>
            </div>
          `
              : ""
          }

          <div style="font-size:0.6rem;color:var(--gray-dark);text-align:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);">ID: ${func.id}</div>
        </div>
      `;

      UI.openModal(escapeHtml(func.full_name), html);
    } catch (e) {
      console.error("Erro ao abrir modal do funcionário:", e);
      UI.showToast("Erro", "Falha ao carregar dados do funcionário.", "error");
    }
  };

  // ============================================================
  // FUNÇÕES DE MODAL - AFASTAMENTO
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
        `,
        )
        .eq("id", id)
        .single();

      if (error || !afastamento) {
        UI.showToast("Erro", "Afastamento não encontrado.", "error");
        return;
      }

      const func = afastamento.employees;
      const diasRestantes = calcularDiasRestantes(afastamento.end_date);
      const emAndamento =
        diasRestantes > 0 && afastamento.status !== "encerrado";
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
          <!-- Cabeçalho -->
          <div style="background:${isAcidente ? "rgba(255,82,82,0.08)" : "rgba(255,193,7,0.08)"}; border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px; border-left:4px solid ${statusColor};">
            ${fotoHtml}
            <div style="flex:1;">
              <h4 style="margin:0; font-size:1rem;">${escapeHtml(func?.full_name || "Funcionário")}</h4>
              <small style="color:var(--gray);">${escapeHtml(func?.role || "-")}</small>
            </div>
            <div style="flex-shrink:0;">
              <span style="font-size:0.65rem; color:${statusColor}; background:${statusColor}22; padding:3px 12px; border-radius:20px; border:1px solid ${statusColor}44; font-weight:500;">
                ${statusLabel}
              </span>
            </div>
          </div>

          <!-- Informações principais -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(255,255,255,0.02); border-radius:8px; padding:12px;">
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Tipo</span><br><span style="font-size:0.85rem;">${getLeaveTypeLabel(afastamento.leave_type || afastamento.type)}</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Período</span><br><span style="font-size:0.85rem;">${formatDate(afastamento.start_date)} → ${formatDate(afastamento.end_date)}</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Dias totais</span><br><span style="font-size:0.85rem;">${afastamento.days_off || 0} dias</span></div>
            <div><span style="color:var(--gray-dark); font-size:0.6rem;">Dias restantes</span><br><span style="font-size:0.85rem; color:${diasRestantes <= 3 ? "var(--error)" : "var(--gold-light)"};">${diasRestantes > 0 ? `${diasRestantes} dias` : "0"}</span></div>
          </div>

          <!-- Detalhes adicionais -->
          ${afastamento.reason ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">Motivo</span><br><span style="font-size:0.85rem;">${escapeHtml(afastamento.reason)}</span></div>` : ""}
          ${afastamento.icd_code ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">CID</span><br><span style="font-size:0.85rem;">${escapeHtml(afastamento.icd_code)}</span></div>` : ""}
          ${afastamento.doctor_name ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">Médico</span><br><span style="font-size:0.85rem;">${escapeHtml(afastamento.doctor_name)}</span></div>` : ""}
          ${afastamento.hospital_name ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">Hospital</span><br><span style="font-size:0.85rem;">${escapeHtml(afastamento.hospital_name)}</span></div>` : ""}
          ${afastamento.document_url ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">Atestado</span><br><a href="${afastamento.document_url}" target="_blank" style="color:var(--gold-light);">📎 Ver documento</a></div>` : ""}
          ${afastamento.notes ? `<div style="background:rgba(255,255,255,0.02); border-radius:6px; padding:8px 12px;"><span style="color:var(--gray-dark); font-size:0.6rem;">Observações</span><br><span style="font-size:0.85rem;">${escapeHtml(afastamento.notes)}</span></div>` : ""}

          <!-- Ações -->
          <div style="display:flex; gap:8px; justify-content:flex-end; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); flex-wrap:wrap;">
            ${
              afastamento.status !== "encerrado"
                ? `
              <button class="btn-action btn-action-success" onclick="window.RH.encerrarAfastamento('${afastamento.id}')" style="padding:6px 14px; min-height:36px;">
                <i class="ph ph-check-circle"></i> Encerrar
              </button>
            `
                : ""
            }
            <button class="btn-action btn-action-ghost" onclick="window.RH.editarAfastamento('${afastamento.id}')" style="padding:6px 14px; min-height:36px;">
              <i class="ph ph-pencil-simple"></i> Editar
            </button>
            <button class="btn-action btn-action-ghost" onclick="window.RH.excluirAfastamento('${afastamento.id}')" style="padding:6px 14px; min-height:36px; color:var(--error);">
              <i class="ph ph-trash"></i> Excluir
            </button>
          </div>
        </div>
      `;

      UI.openModal("Detalhes do Afastamento", html);
    } catch (e) {
      console.error("Erro ao abrir modal do afastamento:", e);
      UI.showToast("Erro", "Falha ao carregar dados do afastamento.", "error");
    }
  };

  // ============================================================
  // CRUD - NOVO AFASTAMENTO
  // ============================================================

  function novoAfastamento() {
    const html = `
      <div style="display:grid; gap:12px;">
        <div class="form-group">
          <label class="form-label"><i class="ph ph-user"></i> Funcionário *</label>
          <select id="afastamentoFuncionario" class="form-select" required>
            <option value="">Selecione o funcionário...</option>
            ${(dados.funcionarios || [])
              .filter((f) => f.active === true)
              .map(
                (f) =>
                  `<option value="${f.id}">${escapeHtml(f.full_name)}</option>`,
              )
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

    UI.modalComConfirmacao(
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
          UI.showToast(
            "Erro",
            "Preencha todos os campos obrigatórios.",
            "error",
          );
          return;
        }

        if (new Date(end_date) < new Date(start_date)) {
          UI.showToast(
            "Erro",
            "A data de fim não pode ser anterior à data de início.",
            "error",
          );
          return;
        }

        const loginResult = (await Auth.fazerLogin)
          ? Auth.fazerLogin()
          : { success: true };
        if (!loginResult.success) {
          UI.showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
          );
          return;
        }

        const diffTime = Math.abs(new Date(end_date) - new Date(start_date));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        try {
          const supabase = Supabase.getSupabaseClient
            ? Supabase.getSupabaseClient()
            : null;
          if (!supabase) {
            UI.showToast("Erro", "Cliente Supabase não disponível", "error");
            return;
          }

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

          UI.showToast(
            "Sucesso",
            "Afastamento registrado com sucesso!",
            "success",
          );
          document.getElementById("modalContainer").innerHTML = "";
          await carregarRHPeriodo();
        } catch (error) {
          console.error("Erro ao registrar afastamento:", error);
          UI.showToast(
            "Erro",
            `Falha ao registrar afastamento: ${error.message}`,
            "error",
          );
        }
      },
      "560px",
    );
  }

  // ============================================================
  // CRUD - EDITAR AFASTAMENTO
  // ============================================================

  window.editarAfastamento = async function (id) {
    try {
      const supabase = Supabase.getSupabaseClient
        ? Supabase.getSupabaseClient()
        : null;
      if (!supabase) {
        UI.showToast("Erro", "Cliente Supabase não disponível", "error");
        return;
      }

      const { data: afastamento } = await supabase
        .from("absences")
        .select("*")
        .eq("id", id)
        .single();

      if (!afastamento) {
        UI.showToast("Erro", "Afastamento não encontrado.", "error");
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

      UI.modalComConfirmacao(
        "Editar Afastamento",
        html,
        async () => {
          const leave_type = document.getElementById(
            "editAfastamentoTipo",
          ).value;
          const start_date = document.getElementById(
            "editAfastamentoInicio",
          ).value;
          const end_date = document.getElementById("editAfastamentoFim").value;
          const reason =
            document.getElementById("editAfastamentoMotivo").value.trim() ||
            null;
          const icd_code =
            document.getElementById("editAfastamentoCID").value.trim() || null;
          const doctor_name =
            document.getElementById("editAfastamentoMedico").value.trim() ||
            null;
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
            UI.showToast("Erro", "Preencha as datas de início e fim.", "error");
            return;
          }

          if (new Date(end_date) < new Date(start_date)) {
            UI.showToast(
              "Erro",
              "A data de fim não pode ser anterior à data de início.",
              "error",
            );
            return;
          }

          const loginResult = (await Auth.fazerLogin)
            ? Auth.fazerLogin()
            : { success: true };
          if (!loginResult.success) {
            UI.showToast(
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

            UI.showToast("Sucesso", "Afastamento atualizado!", "success");
            document.getElementById("modalContainer").innerHTML = "";
            await carregarRHPeriodo();
          } catch (error) {
            console.error("Erro ao editar afastamento:", error);
            UI.showToast(
              "Erro",
              `Falha ao editar afastamento: ${error.message}`,
              "error",
            );
          }
        },
        "560px",
      );
    } catch (e) {
      console.error("Erro ao editar afastamento:", e);
      UI.showToast("Erro", "Falha ao carregar dados do afastamento.", "error");
    }
  };

  // ============================================================
  // CRUD - ENCERRAR AFASTAMENTO
  // ============================================================

  window.encerrarAfastamento = async function (id) {
    UI.openConfirmModal(
      "Encerrar Afastamento",
      "Deseja encerrar este afastamento?",
      async () => {
        const loginResult = (await Auth.fazerLogin)
          ? Auth.fazerLogin()
          : { success: true };
        if (!loginResult.success) {
          UI.showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
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
            .from("absences")
            .update({
              status: "encerrado",
              end_date: todayISO(),
            })
            .eq("id", id);

          if (error) throw error;

          UI.showToast("Sucesso", "Afastamento encerrado!", "success");
          document.getElementById("modalContainer").innerHTML = "";
          await carregarRHPeriodo();
        } catch (error) {
          console.error("Erro ao encerrar afastamento:", error);
          UI.showToast(
            "Erro",
            `Falha ao encerrar afastamento: ${error.message}`,
            "error",
          );
        }
      },
    );
  };

  // ============================================================
  // CRUD - EXCLUIR AFASTAMENTO
  // ============================================================

  window.excluirAfastamento = async function (id) {
    UI.openConfirmModal(
      "Excluir Afastamento",
      "Deseja realmente excluir este afastamento?",
      async () => {
        const loginResult = (await Auth.fazerLogin)
          ? Auth.fazerLogin()
          : { success: true };
        if (!loginResult.success) {
          UI.showToast(
            "Ação cancelada",
            "Você precisa estar autenticado.",
            "warning",
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
            .from("absences")
            .delete()
            .eq("id", id);

          if (error) throw error;

          UI.showToast("Sucesso", "Afastamento excluído!", "success");
          document.getElementById("modalContainer").innerHTML = "";
          await carregarRHPeriodo();
        } catch (error) {
          console.error("Erro ao excluir afastamento:", error);
          UI.showToast(
            "Erro",
            `Falha ao excluir afastamento: ${error.message}`,
            "error",
          );
        }
      },
    );
  };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function init() {
    console.log("👤 RH: Inicializando...");

    // Configurar eventos
    const btnNovoAfastamento = document.getElementById("btnNovoAfastamento");
    if (btnNovoAfastamento) {
      btnNovoAfastamento.addEventListener("click", novoAfastamento);
    }

    // Configurar seletor de período
    const periodNavs = document.querySelectorAll(
      "#periodSelectorRH .period-nav",
    );
    periodNavs.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const direction = parseInt(this.dataset.direction === "prev" ? -1 : 1);
        const date = new Date(global.App?.periodState?.rh || new Date());
        date.setMonth(date.getMonth() + direction);
        if (global.App) {
          global.App.periodState.rh = date;
        }
        carregarRHPeriodo(date);
      });
    });

    const todayBtn = document.querySelector("#periodSelectorRH .period-today");
    if (todayBtn) {
      todayBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const date = new Date();
        if (global.App) {
          global.App.periodState.rh = date;
        }
        carregarRHPeriodo(date);
      });
    }

    // Carregar dados iniciais
    const periodo = global.App?.periodState?.rh || new Date();
    await carregarRHPeriodo(periodo);

    console.log("✅ RH: Inicializado com sucesso");
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
    novoAfastamento,
    editarAfastamento: window.editarAfastamento,
    encerrarAfastamento: window.encerrarAfastamento,
    excluirAfastamento: window.excluirAfastamento,

    // Inicialização
    init,
  };

  console.log("✅ RH exportado globalmente como window.RH");

  // ============================================================
  // INICIALIZAÇÃO AUTOMÁTICA
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
