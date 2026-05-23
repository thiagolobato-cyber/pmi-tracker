// PMI Tracker - utilitarios puros (sem dependencias DOM/rede)
// Modulo ES nativo, usado tanto pelo app (via import dinamico no script principal)
// quanto pelos testes Node.

/* ===== Constantes ===== */

export const DEFAULT_PHASES = [
  {id:'preclose', name:'Pre-Close',  daysFromSign:-30, color:'#94a3b8'},
  {id:'day1',     name:'Day 1',      daysFromSign:0,   color:'#0171E4'},
  {id:'d30',      name:'D+30',       daysFromSign:30,  color:'#16a34a'},
  {id:'d60',      name:'D+60',       daysFromSign:60,  color:'#15803d'},
  {id:'d100',     name:'D+100',      daysFromSign:100, color:'#7c3aed'},
  {id:'year1',    name:'Year 1',     daysFromSign:365, color:'#0F1727'},
];

export const RAID_TYPES = [
  {id:'risk',       label:'Risco',     icon:'\u26A0\uFE0F'},
  {id:'issue',      label:'Issue',     icon:'\uD83D\uDD25'},
  {id:'decision',   label:'Decis\u00E3o',   icon:'\u2696\uFE0F'},
  {id:'assumption', label:'Premissa',  icon:'\uD83D\uDCA1'},
];

export const SEVERITIES = [
  {id:'high', label:'Alta'},
  {id:'med',  label:'M\u00E9dia'},
  {id:'low',  label:'Baixa'},
];

export const RAID_STATUSES = [
  {id:'open',      label:'Aberto'},
  {id:'mitigated', label:'Mitigado'},
  {id:'closed',    label:'Fechado'},
];

export const SYNERGY_TYPES = [
  {id:'cost',    label:'Custo'},
  {id:'revenue', label:'Receita'},
];

export const SYNERGY_STATUSES = [
  {id:'identified',  label:'Identificada'},
  {id:'in_progress', label:'Em captura'},
  {id:'realized',    label:'Realizada'},
  {id:'at_risk',     label:'Em risco'},
];

export const DEFAULT_AREAS = [
  {n:'1.0', name:'Financeiro'},
  {n:'2.0', name:'CExp'},
  {n:'3.0', name:'P&C'},
  {n:'4.0', name:'System Integration / TI / Digital Workplace'},
  {n:'5.0', name:'Marketing & Comunica\u00E7\u00E3o'},
  {n:'6.0', name:'Comercial'},
  {n:'7.0', name:'Opera\u00E7\u00F5es'},
  {n:'8.0', name:'Tech'},
  {n:'9.0', name:'PMI / M&A'},
  {n:'10.0', name:'Treinamentos para colaboradores'},
];

/* ===== Utils ===== */

export const uid = () => Math.random().toString(36).slice(2,10);

export function parseDate(d){
  if(!d) return null;
  if(d instanceof Date) return d;
  if(typeof d === 'number'){
    const epoch = new Date(Date.UTC(1899,11,30));
    return new Date(epoch.getTime() + d*86400000);
  }
  if(typeof d === 'string'){
    const s = d.trim();
    if(!s) return null;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(m){
      let [_,dd,mm,yy] = m;
      if(yy.length===2) yy = '20'+yy;
      return new Date(parseInt(yy),parseInt(mm)-1,parseInt(dd));
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m) return new Date(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3]));
    const dt = new Date(s);
    return isNaN(dt) ? null : dt;
  }
  return null;
}

export function fmtDate(d){
  d = parseDate(d);
  if(!d) return '';
  return d.toLocaleDateString('pt-BR');
}

export function toIso(d){
  d = parseDate(d);
  if(!d) return '';
  return d.toISOString().slice(0,10);
}

export function emptyDate(d){ return (!d || d==='') ? null : d; }
export function nullIfEmpty(s){ return (s==null || s==='') ? null : s; }

export function addBusinessDays(date, days){
  if(!date) return null;
  const d = new Date(date);
  let added = 0;
  const dir = days >= 0 ? 1 : -1;
  const target = Math.abs(days);
  while(added < target){
    d.setDate(d.getDate()+dir);
    const dow = d.getDay();
    if(dow!==0 && dow!==6) added++;
  }
  return d;
}

export function businessDaysBetween(a,b){
  a = parseDate(a); b = parseDate(b);
  if(!a||!b) return null;
  let start = new Date(a), end = new Date(b), sign = 1;
  if(start>end){ [start,end]=[end,start]; sign=-1; }
  let count = 0;
  const cur = new Date(start);
  while(cur < end){
    cur.setDate(cur.getDate()+1);
    const dow = cur.getDay();
    if(dow!==0 && dow!==6) count++;
  }
  return count*sign;
}

export function computeTaskFields(task, company){
  const signDate = parseDate(company?.signDate);
  const prazo = parseInt(task.prazo)||0;
  const dataPrevista = signDate ? addBusinessDays(signDate, prazo) : null;
  const dataReal = parseDate(task.dataRealConclusao);
  const today = new Date(); today.setHours(0,0,0,0);
  let status = 'empty';
  if(dataReal){ status = 'done'; }
  else if(dataPrevista){
    status = today <= dataPrevista ? 'ontrack' : 'late';
  }
  const atraso = (dataPrevista && dataReal) ? businessDaysBetween(dataPrevista, dataReal) : null;
  const diasReais = (signDate && dataReal) ? businessDaysBetween(signDate, dataReal) : null;
  const diasAtraso = (status==='late' && dataPrevista) ? businessDaysBetween(dataPrevista, today) : null;
  return { dataPrevista, dataReal, status, atraso, diasReais, diasAtraso };
}

export function statusLabel(s){
  return {done:'Done', ontrack:'On track', late:'Atrasado', empty:'\u2014'}[s] || '\u2014';
}

export function statusClass(s){ return 'status-'+(s==='ontrack'?'ontrack':s); }

export function fmtBRL(v){
  const n = Number(v)||0;
  return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
}

export function isoWeek(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2,'0')}`;
}

export function currentIsoWeek(){ return isoWeek(new Date()); }

export function phaseFor(task, company){
  if(!task) return null;
  if(task.phaseId) return DEFAULT_PHASES.find(p=>p.id===task.phaseId) || null;
  if(!company || !company.signDate) return null;
  const sd = parseDate(company.signDate);
  if(!sd) return null;
  const prev = (task._f && task._f.dataPrevista) || addBusinessDays(sd, task.prazo||0);
  if(!prev) return null;
  const diff = Math.round((prev - sd)/86400000);
  let best = DEFAULT_PHASES[0];
  for(const p of DEFAULT_PHASES){ if(diff >= p.daysFromSign) best = p; }
  return best;
}

export function sevRank(s){ return s==='high'?3:s==='med'?2:s==='low'?1:0; }

export function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
