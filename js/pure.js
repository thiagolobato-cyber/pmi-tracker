/* ============================================================
   js/pure.js  –  Funções e constantes puras do BHub PMI
   Exportadas via ES Module e importadas pelo index.html
   ============================================================ */

// ─── Constantes ──────────────────────────────────────────────

export const DEFAULT_PHASES = [
  { id: 'pre-close', name: 'Pré-fechamento', color: '#6366f1' },
  { id: 'd0',        name: 'D0 (Fechamento)', color: '#0171E4' },
  { id: '0-100',     name: '0–100 dias',      color: '#f59e0b' },
  { id: '100-365',   name: '100–365 dias',    color: '#16a34a' },
  { id: 'pos',       name: 'Pós-Integração',  color: '#64748b' },
];

export const RAID_TYPES = [
  { id: 'risk',       label: 'Risco' },
  { id: 'assumption', label: 'Premissa' },
  { id: 'issue',      label: 'Issue' },
  { id: 'dependency', label: 'Dependência' },
];

export const SEVERITIES = [
  { id: 'high', label: 'Alta' },
  { id: 'med',  label: 'Média' },
  { id: 'low',  label: 'Baixa' },
];

export const RAID_STATUSES = [
  { id: 'open',      label: 'Aberto' },
  { id: 'mitigated', label: 'Mitigado' },
  { id: 'closed',    label: 'Encerrado' },
];

export const SYNERGY_TYPES = [
  { id: 'cost',    label: '💸 Custo' },
  { id: 'revenue', label: '📈 Receita' },
];

export const SYNERGY_STATUSES = [
  { id: 'identified',  label: 'Identificada' },
  { id: 'validated',   label: 'Validada' },
  { id: 'in_progress', label: 'Em captura' },
  { id: 'captured',    label: 'Capturada' },
];

export const DEFAULT_AREAS = [
  // Gatilho: Thiago Lobato / Vinicius Cavalcanti
  { name: 'Financeiro' },
  { name: 'P&C' },
  { name: 'Marketing & Comunicação' },
  { name: 'Comercial' },
  { name: 'PMI / M&A' },
  // Gatilho: Rodrigo Papa / Tatiane Steffani
  { name: 'CExp' },
  { name: 'System Integration / TI / Digital Workplace' },
  { name: 'Operações' },
  { name: 'Tech' },
  { name: 'Treinamentos para colaboradores' },
];

// ─── Utilitários gerais ──────────────────────────────────────

export function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Datas ───────────────────────────────────────────────────

/**
 * Parseia vários formatos de data → Date (meia-noite local) ou null.
 * Suporta: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, serial Excel (número), Date object.
 */
export function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  const s = String(val).trim();

  // YYYY-MM-DD (ISO)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(d.getTime()) ? null : d;
  }

  // Serial numérico do Excel (ex.: 45000)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 40000 && n < 60000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }

  // Fallback genérico
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Formata Date (ou string de data) → "DD/MM/YYYY" */
export function fmtDate(val) {
  const d = val instanceof Date ? val : parseDate(val);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Date (ou string) → "YYYY-MM-DD" */
export function toIso(val) {
  const d = val instanceof Date ? val : parseDate(val);
  if (!d) return '';
  const y   = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Retorna null se val é vazio/falsy, senão retorna val (para colunas de data no DB) */
export function emptyDate(val) {
  if (!val || String(val).trim() === '') return null;
  return val;
}

/** Retorna null se val é vazio/falsy, senão retorna val */
export function nullIfEmpty(val) {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  return val;
}

/** Soma n dias úteis (Seg–Sex) a uma data */
export function addBusinessDays(date, n) {
  if (!date || n == null) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  let remaining = Math.abs(Math.round(Number(n)));
  const dir = Number(n) >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + dir);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return d;
}

/**
 * Conta dias úteis entre duas datas.
 * Positivo se d2 > d1 (d2 é mais tarde), negativo se d2 < d1.
 */
export function businessDaysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(Math.min(+d1, +d2));
  const b = new Date(Math.max(+d1, +d2));
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(a);
  while (cur < b) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
  }
  return +d2 >= +d1 ? count : -count;
}

// ─── Semana ISO ──────────────────────────────────────────────

/** Número da semana ISO de uma data */
export function isoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/** Semana ISO da data atual */
export function currentIsoWeek() {
  return isoWeek(new Date());
}

// ─── Status ──────────────────────────────────────────────────

export function statusLabel(status) {
  switch (status) {
    case 'done':    return 'Done';
    case 'ontrack': return 'On track';
    case 'late':    return 'Atrasado';
    default:        return '—';
  }
}

export function statusClass(status) {
  switch (status) {
    case 'done':    return 'status-done';
    case 'ontrack': return 'status-ontrack';
    case 'late':    return 'status-late';
    default:        return 'status-empty';
  }
}

// ─── Campos calculados da tarefa ─────────────────────────────

/**
 * Calcula campos derivados de uma tarefa com base na empresa.
 *
 * Lógica (conforme README):
 *   - Done    → dataRealConclusao preenchida OU completado === 100
 *   - On track → não concluída e hoje ≤ dataPrevista
 *   - Atrasado → não concluída e hoje > dataPrevista
 *   - dataPrevista = signDate + prazo (dias úteis)
 *
 * Retorna: { status, dataPrevista, dataReal, diasAtraso, atraso }
 */
export function computeTaskFields(task, company) {
  const signDate     = parseDate(company?.signDate);
  const prazo        = parseInt(task?.prazo) || 0;
  // Prefer stored dataPrevista; fallback uses business days
  const stored       = task?.dataPrevista ? parseDate(task.dataPrevista) : null;
  const dataPrevista = stored || ((signDate && prazo > 0) ? addBusinessDays(signDate, prazo) : null);
  const dataReal     = task?.dataRealConclusao ? parseDate(task.dataRealConclusao) : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let status     = 'empty';
  let diasAtraso = null;
  let atraso     = null;

  if (dataReal || Number(task?.completado) >= 100) {
    status = 'done';
  } else if (dataPrevista) {
    if (today > dataPrevista) {
      status     = 'late';
      diasAtraso = businessDaysBetween(dataPrevista, today);
      atraso     = diasAtraso;
    } else {
      status = 'ontrack';
      atraso = businessDaysBetween(today, dataPrevista); // dias restantes (positivo)
    }
  }

  return { status, dataPrevista, dataReal, diasAtraso, atraso };
}

// ─── Fase ────────────────────────────────────────────────────

/** Retorna o objeto de fase (de DEFAULT_PHASES) para uma tarefa, ou null */
export function phaseFor(task, _company) {
  if (!task?.phaseId) return null;
  return DEFAULT_PHASES.find(p => p.id === task.phaseId) || null;
}

// ─── Severidade ──────────────────────────────────────────────

/** Rank numérico de severidade (maior = mais grave, para ordenação) */
export function sevRank(severity) {
  switch (severity) {
    case 'high': return 3;
    case 'med':  return 2;
    case 'low':  return 1;
    default:     return 0;
  }
}

// ─── Moeda ───────────────────────────────────────────────────

/** Formata número como Real Brasileiro (R$ 1.234,56) */
export function fmtBRL(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
