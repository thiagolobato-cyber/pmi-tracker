#!/usr/bin/env node
// Testes basicos das funcoes puras do PMI Tracker.
// Extrai funcoes do index.html via regex e roda em contexto VM.
// Uso: node tests/run-tests.js

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) { console.error('Nao encontrei o bloco <script> principal.'); process.exit(2); }
const fullCode = scriptMatch[1];

// Extrai apenas declaracoes de funcoes/constantes puras necessarias.
// Regex captura "function NAME(...)" ate o "}" de fechamento balanceado.
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\b');
  const m = re.exec(fullCode);
  if (!m) throw new Error('funcao nao encontrada: ' + name);
  const start = m.index;
  let i = fullCode.indexOf('{', start);
  let depth = 0;
  let inStr = null;     // '"' | "'" | '`'
  let inRegex = false;
  let inLineCmt = false;
  let inBlockCmt = false;
  let prev = '';
  for (; i < fullCode.length; i++) {
    const c = fullCode[i];
    const next = fullCode[i+1];
    if (inLineCmt) { if (c === '\n') inLineCmt = false; prev = c; continue; }
    if (inBlockCmt) { if (c === '*' && next === '/') { inBlockCmt = false; i++; } prev = c; continue; }
    if (inStr) {
      if (c === '\\') { i++; prev = c; continue; }
      if (c === inStr) inStr = null;
      prev = c; continue;
    }
    if (inRegex) {
      if (c === '\\') { i++; prev = c; continue; }
      if (c === '[') { /* enter class */ }
      if (c === '/' ) inRegex = false;
      prev = c; continue;
    }
    if (c === '/' && next === '/') { inLineCmt = true; i++; prev = c; continue; }
    if (c === '/' && next === '*') { inBlockCmt = true; i++; prev = c; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
    // regex literal heuristica: / precedido por (, ,, =, !, &, |, ?, :, {, ;, return, etc
    if (c === '/' && /[\(,=!&|?:{;\n+\-*<>\[]/.test(prev || ' ')) { inRegex = true; prev = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    if (!/\s/.test(c)) prev = c;
  }
  return fullCode.slice(start, i);
}

function extractConst(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*');
  const m = re.exec(fullCode);
  if (!m) throw new Error('const nao encontrado: ' + name);
  // Captura ate ; no fim da declaracao top-level (heuristica simples para arrays de objetos)
  let i = m.index + m[0].length;
  let depth = 0;
  let inStr = null;
  for (; i < fullCode.length; i++) {
    const c = fullCode[i];
    if (inStr) {
      if (c === inStr && fullCode[i-1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) { i++; break; }
  }
  return fullCode.slice(m.index, i);
}

const fns = ['parseDate','toIso','fmtDate','emptyDate','addBusinessDays','businessDaysBetween','computeTaskFields','statusLabel','fmtBRL','sevRank','escapeHtml','currentIsoWeek','phaseFor','isoWeek'];
const consts = ['DEFAULT_PHASES','DEFAULT_AREAS','SEVERITIES','RAID_TYPES'];

let bundle = '';
for (const c of consts) {
  try { bundle += extractConst(c) + '\n'; } catch (e) { /* ignora se nao usado */ }
}
for (const f of fns) bundle += extractFn(f) + '\n';

// Avalia no contexto do proprio Node (mesmo realm = mesmo Date constructor)
const exportNames = fns.concat(consts.filter(c => bundle.indexOf('const ' + c) >= 0));
const factory = new Function(bundle + '\nreturn { ' + exportNames.join(', ') + ' };');
const lib = factory();

// ---------- Test runner minimalista ----------
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; failures.push({name, err: e}); console.log('  \u2717 ' + name + ' - ' + e.message); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg||'') + ' esperado=' + b + ' recebido=' + a);
}
function truthy(v, msg){ if(!v) throw new Error(msg||'esperado truthy, recebido '+v); }
function isNull(v, msg){ if(v !== null && v !== undefined) throw new Error(msg||'esperado null/undefined, recebido '+JSON.stringify(v)); }

console.log('\n=== parseDate ===');
test('parseDate Date passa direto', ()=>{
  const d = new Date(2024,0,15);
  eq(lib.parseDate(d), d);
});
test('parseDate ISO yyyy-mm-dd', ()=>{
  const d = lib.parseDate('2024-03-15');
  truthy(d instanceof Date);
  eq(d.getFullYear(), 2024);
  eq(d.getMonth(), 2);
  eq(d.getDate(), 15);
});
test('parseDate dd/mm/yyyy', ()=>{
  const d = lib.parseDate('15/03/2024');
  eq(d.getFullYear(), 2024);
  eq(d.getMonth(), 2);
  eq(d.getDate(), 15);
});
test('parseDate vazio retorna null', ()=>{ isNull(lib.parseDate('')); isNull(lib.parseDate(null)); });
test('parseDate excel serial number', ()=>{
  // 44927 = 2023-01-01 no excel base
  const d = lib.parseDate(44927);
  truthy(d instanceof Date);
});

console.log('\n=== toIso / emptyDate ===');
test('toIso formata yyyy-mm-dd', ()=>{
  eq(lib.toIso(new Date(2024, 2, 5)), '2024-03-05');
});
test('toIso para invalido retorna ""', ()=>{
  eq(lib.toIso(null), '');
  eq(lib.toIso('abc'), '');
});
test('emptyDate converte vazio para null', ()=>{
  eq(lib.emptyDate(''), null);
  eq(lib.emptyDate(null), null);
  eq(lib.emptyDate('2024-01-01'), '2024-01-01');
});

console.log('\n=== addBusinessDays ===');
test('+0 dias retorna mesma data', ()=>{
  const d = new Date(2024, 0, 15); // segunda
  const r = lib.addBusinessDays(d, 0);
  eq(r.toISOString().slice(0,10), '2024-01-15');
});
test('+5 dias uteis de segunda = segunda seguinte', ()=>{
  const d = new Date(2024, 0, 15); // 15/01/2024 segunda
  const r = lib.addBusinessDays(d, 5);
  // 15+5d.u. pulando sabado/domingo => 22/01 segunda
  eq(r.toISOString().slice(0,10), '2024-01-22');
});
test('+1 dia util de sexta = segunda', ()=>{
  const d = new Date(2024, 0, 19); // sexta
  const r = lib.addBusinessDays(d, 1);
  eq(r.toISOString().slice(0,10), '2024-01-22');
});
test('-1 dia util de segunda = sexta', ()=>{
  const d = new Date(2024, 0, 22); // segunda
  const r = lib.addBusinessDays(d, -1);
  eq(r.toISOString().slice(0,10), '2024-01-19');
});

console.log('\n=== businessDaysBetween ===');
test('mesmo dia = 0', ()=>{
  const d = new Date(2024,0,15);
  eq(lib.businessDaysBetween(d,d), 0);
});
test('segunda a sexta = 4', ()=>{
  const a = new Date(2024,0,15), b = new Date(2024,0,19);
  eq(lib.businessDaysBetween(a,b), 4);
});
test('inverte sinal quando b<a', ()=>{
  const a = new Date(2024,0,19), b = new Date(2024,0,15);
  eq(lib.businessDaysBetween(a,b), -4);
});

console.log('\n=== computeTaskFields ===');
test('done quando ha dataReal', ()=>{
  const company = { signDate: '2024-01-15' };
  const task = { prazo: 5, dataRealConclusao: '2024-01-22' };
  const r = lib.computeTaskFields(task, company);
  eq(r.status, 'done');
});
test('empty quando sem signDate', ()=>{
  const r = lib.computeTaskFields({ prazo: 5 }, {});
  eq(r.status, 'empty');
});
test('ontrack quando prazo no futuro', ()=>{
  const future = new Date(); future.setFullYear(future.getFullYear()+1);
  const sd = new Date(); sd.setMonth(sd.getMonth()-1);
  const r = lib.computeTaskFields({ prazo: 365 }, { signDate: sd.toISOString().slice(0,10) });
  truthy(r.status === 'ontrack' || r.status === 'done');
});

console.log('\n=== statusLabel ===');
test('mapeamentos', ()=>{
  eq(lib.statusLabel('done'), 'Done');
  eq(lib.statusLabel('ontrack'), 'On track');
  eq(lib.statusLabel('late'), 'Atrasado');
  eq(lib.statusLabel('empty'), '\u2014');
  eq(lib.statusLabel(undefined), '\u2014');
});

console.log('\n=== fmtBRL ===');
test('formata numero BRL', ()=>{
  const r = lib.fmtBRL(1234.5);
  // arredonda para inteiro: "R$ 1.235"
  truthy(r.indexOf('R$') >= 0 && (r.indexOf('1.235') >= 0 || r.indexOf('1.234') >= 0));
});
test('fmtBRL com 0', ()=>{
  const r = lib.fmtBRL(0);
  truthy(typeof r === 'string');
});

console.log('\n=== sevRank ===');
test('ordem severities', ()=>{
  eq(lib.sevRank('high'), 3);
  eq(lib.sevRank('med'), 2);
  eq(lib.sevRank('low'), 1);
  eq(lib.sevRank('x'), 0);
});

console.log('\n=== escapeHtml ===');
test('escapa <script>', ()=>{
  eq(lib.escapeHtml('<b>"hi"</b>'), '&lt;b&gt;&quot;hi&quot;&lt;/b&gt;');
});
test('escapa &', ()=>{
  eq(lib.escapeHtml('a & b'), 'a &amp; b');
});
test('null/undefined -> ""', ()=>{
  eq(lib.escapeHtml(null), '');
  eq(lib.escapeHtml(undefined), '');
});

console.log('\n=== phaseFor ===');
test('usa phaseId quando definido', ()=>{
  const r = lib.phaseFor({ phaseId: 'd30' }, { signDate: '2024-01-15' });
  truthy(r);
  eq(r.id, 'd30');
});
test('infere fase pelo prazo', ()=>{
  const r = lib.phaseFor({ prazo: 30 }, { signDate: '2024-01-15' });
  truthy(r);
});
test('null sem signDate e sem phaseId', ()=>{
  isNull(lib.phaseFor({ prazo: 30 }, {}));
});

console.log('\n=========================================');
console.log(`Resumo: ${passed} passou, ${failed} falhou`);
if (failed > 0) {
  console.log('\nFalhas:');
  failures.forEach(f => console.log('  - ' + f.name + ': ' + f.err.message));
  process.exit(1);
}
console.log('Todos os testes passaram.');
