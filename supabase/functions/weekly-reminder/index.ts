/**
 * PMI Tracker — Weekly Reminder (Slack DMs only)
 * Supabase Edge Function
 *
 * Roda toda segunda-feira às 09:00 BRT via pg_cron.
 * Para cada usuário com tarefas atribuídas → DM personalizada no Slack
 * Para cada líder com liderados com pendências → DM com visão do time
 *
 * Variáveis de ambiente (Supabase Dashboard > Settings > Edge Functions > Secrets):
 *   SLACK_BOT_TOKEN   — xoxb-... (Bot User OAuth Token)
 *   PMI_TRACKER_URL   — URL pública do tracker
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Env ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLACK_BOT_TOKEN      = Deno.env.get('SLACK_BOT_TOKEN') ?? ''
const PMI_TRACKER_URL      = Deno.env.get('PMI_TRACKER_URL') ?? 'https://bhub.ai/pmi-tracker'

// ─── Gatilhos por área (espelho de AREA_TRIGGERS no front-end) ───────────────

const AREA_TRIGGERS: Record<string, string> = {
  'Financeiro':                                   'Thiago Lobato / Vinicius Cavalcanti',
  'CExp':                                         'Rodrigo Papa / Tatiane Steffani',
  'P&C':                                          'Thiago Lobato / Vinicius Cavalcanti',
  'System Integration / TI / Digital Workplace':  'Rodrigo Papa / Tatiane Steffani',
  'Marketing & Comunicação':                       'Thiago Lobato / Vinicius Cavalcanti',
  'Comercial':                                    'Thiago Lobato / Vinicius Cavalcanti',
  'Operações':                                    'Rodrigo Papa / Tatiane Steffani',
  'Tech':                                         'Rodrigo Papa / Tatiane Steffani',
  'PMI / M&A':                                    'Thiago Lobato / Vinicius Cavalcanti',
  'Treinamentos para colaboradores':              'Rodrigo Papa / Tatiane Steffani',
}

// ─── Helpers (replicam pure.js) ───────────────────────────────────────────────

function parseDate(val: unknown): Date | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d
}

function addBusinessDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  let remaining = Math.abs(Math.round(n))
  const dir = n >= 0 ? 1 : -1
  while (remaining > 0) {
    d.setDate(d.getDate() + dir)
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--
  }
  return d
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface TaskEntry {
  companyName:  string
  task:         string
  area:         string
  bloco:        string
  owner:        string
  dataPrevista: Date | null
  status:       'done' | 'late' | 'ontrack' | 'empty'
  daysLate:     number
  bloqueio:     boolean
  raidTitle:    string | null
  raidOwner:    string | null
}

interface Profile {
  username:         string
  name:             string   // vem de auth.users.raw_user_meta_data->full_name
  email:            string | null
  role:             string
  manager_username: string | null
}

// ─── Slack helpers ────────────────────────────────────────────────────────────

async function slackApi(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type':  'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

/** Busca o Slack User ID a partir do email */
async function slackUserIdByEmail(email: string): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` } }
  )
  const data = await res.json()
  return data.ok ? data.user?.id : null
}

/** Abre um DM e retorna o channel ID */
async function openDm(userId: string): Promise<string | null> {
  const data = await slackApi('conversations.open', { users: userId })
  return data.ok ? data.channel?.id : null
}

/** Envia uma mensagem em blocos para um canal/DM */
async function sendMessage(channelId: string, blocks: unknown[], text: string) {
  return slackApi('chat.postMessage', { channel: channelId, blocks, text })
}

// ─── Edge Function ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (!SLACK_BOT_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'SLACK_BOT_TOKEN não configurado' }), { status: 500 })
  }

  // Modo teste: se passar { "test_email": "..." } no body, só envia para esse email
  // Modo debug: se passar { "debug": true } retorna dados sem enviar Slack
  let testEmail: string | null = null
  let debugMode = false
  try {
    const body = await req.json().catch(() => ({}))
    testEmail = body?.test_email ?? null
    debugMode = body?.debug === true
  } catch { /* body vazio */ }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in10 = new Date(today)
  in10.setDate(in10.getDate() + 10)

  // 1. Busca companies (para sign_date e nome)
  const { data: companies, error: compErr } = await supabase
    .from('companies')
    .select('id, name, sign_date')

  const companyMap = new Map((companies ?? []).map((c: any) => [c.id, c]))

  // 2. Busca tasks diretamente da tabela tasks (paginação para passar do limite de 1000)
  let rawTasks: any[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data: page } = await supabase
      .from('tasks')
      .select('id, company_id, task, area, bloco, owner, prazo, data_real_conclusao, completado, bloqueio, raid_id')
      .not('owner', 'is', null)
      .neq('owner', '')
      .range(from, from + PAGE - 1)
    if (!page || page.length === 0) break
    rawTasks = rawTasks.concat(page)
    if (page.length < PAGE) break
    from += PAGE
  }

  // 2b. Busca RAID items para enriquecer bloqueios com título e owner
  const { data: raidRows } = await supabase
    .from('raid_items')
    .select('id, title, owner, status')
    .neq('status', 'closed')
  const raidMap = new Map<string, { title: string; owner: string }>()
  for (const r of (raidRows ?? [])) {
    raidMap.set(r.id, { title: r.title ?? '', owner: r.owner ?? '' })
  }

  // 3. Computa status de cada tarefa
  const allTasks: TaskEntry[] = []

  for (const t of (rawTasks ?? [])) {
    if (!t?.task) continue

    const company  = companyMap.get(t.company_id)
    const signDate = company ? parseDate(company.sign_date) : null

    const prazo        = parseInt(t.prazo) || 0
    const dataPrevista = (signDate && prazo > 0) ? addBusinessDays(signDate, prazo) : null
    const dataReal     = t.data_real_conclusao ? parseDate(t.data_real_conclusao) : null
    const completado   = Number(t.completado) || 0

    let status: TaskEntry['status'] = 'empty'
    let daysLate = 0

    if (dataReal || completado >= 100) {
      status = 'done'
    } else if (dataPrevista) {
      if (today > dataPrevista) {
        status   = 'late'
        daysLate = Math.round((today.getTime() - dataPrevista.getTime()) / 86400000)
      } else {
        status   = 'ontrack'
        daysLate = -Math.round((dataPrevista.getTime() - today.getTime()) / 86400000)
      }
    }

    const owner = (t.owner || '').trim()
    if (!owner) continue

    const isBloqueio = t.bloqueio === 'Sim'
    const raid       = t.raid_id ? raidMap.get(t.raid_id) : null
    allTasks.push({
      companyName: company?.name ?? 'Empresa desconhecida',
      task:        t.task,
      area:        t.area  || '',
      bloco:       t.bloco || '',
      owner,
      dataPrevista,
      status,
      daysLate,
      bloqueio:  isBloqueio,
      raidTitle: raid?.title ?? null,
      raidOwner: raid?.owner ?? null,
    })
  }

  // 3. Busca perfis + email + nome via join com auth.users (requer service_role)
  const { data: profileRows, error: profileErr } = await supabase.rpc('get_profiles_with_email')

  // Fallback: query direta se a RPC não existir
  let normalizedProfiles: Profile[] = []
  if (profileErr || !profileRows) {
    // Query raw via REST
    const { data: rawProfiles } = await supabase
      .from('profiles')
      .select('id, username, role, manager_username')

    // Busca emails do auth.users um a um via admin API
    const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users`
    const authRes  = await fetch(`${adminUrl}?per_page=200`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
    })
    const authData = await authRes.json()
    const authUsers: Record<string, { email: string; name: string }> = {}
    for (const u of (authData.users ?? [])) {
      authUsers[u.id] = {
        email: u.email ?? '',
        name:  u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? '',
      }
    }

    normalizedProfiles = (rawProfiles ?? []).map((p: any) => ({
      username:         p.username,
      role:             p.role,
      manager_username: p.manager_username,
      email:            authUsers[p.id]?.email ?? null,
      name:             authUsers[p.id]?.name   ?? p.username,
    })).filter((p: Profile) => !!p.email)
  } else {
    normalizedProfiles = profileRows
  }

  // Deduplica por username — garante que nenhum usuário receba mensagem duplicada
  const _seenUsernames = new Set<string>()
  normalizedProfiles = normalizedProfiles.filter((p: Profile) => {
    if (_seenUsernames.has(p.username)) return false
    _seenUsernames.add(p.username)
    return true
  })

  const profileMap = new Map<string, Profile>(
    normalizedProfiles.map((p: Profile) => [p.username, p])
  )

  // Debug mode: retorna dados brutos sem enviar Slack
  if (debugMode) {
    const taskOwners = [...new Set(allTasks.map(t => t.owner))]
    const profileUsernames = normalizedProfiles.map(p => p.username)
    const lateCount = allTasks.filter(t => t.status === 'late').length
    const ontrackCount = allTasks.filter(t => t.status === 'ontrack').length
    // Amostra de tasks brutas para debug
    const sampleRaw = rawTasks.slice(0, 3).map((t: any) => ({
      task: t.task, owner: t.owner, prazo: t.prazo,
      data_real_conclusao: t.data_real_conclusao, completado: t.completado,
      company: companyMap.get(t.company_id),
    }))
    return new Response(JSON.stringify({
      debug: true,
      totalTasks: allTasks.length,
      lateCount,
      ontrackCount,
      sampleRaw,
      companyCount: companies?.length ?? 0,
      companyError: compErr?.message ?? null,
      sampleCompany: companies?.[0] ?? null,
      taskOwners,
      profiles: normalizedProfiles.map(p => ({ username: p.username, email: p.email, role: p.role })),
      profileUsernames,
      matchedOwners: taskOwners.filter(o => profileUsernames.includes(o)),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  const results: string[] = []

  // Modo teste: resolve o canal do testEmail uma vez e redireciona tudo pra lá
  let testChannelId: string | null = null
  if (testEmail) {
    const testSlackId = await slackUserIdByEmail(testEmail)
    if (testSlackId) testChannelId = await openDm(testSlackId)
    if (!testChannelId) {
      return new Response(
        JSON.stringify({ ok: false, error: `Não encontrei o Slack de ${testEmail}` }),
        { status: 400 }
      )
    }
  }

  /** Envia para o canal real OU redireciona para o canal de teste com banner */
  async function dispatch(
    realEmail: string,
    displayName: string,
    blocks: unknown[],
    text: string,
    label: string
  ) {
    if (testChannelId) {
      // Injeta banner dizendo para quem seria
      const banner = {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `🧪 *[TESTE]* Esta mensagem seria enviada para *${displayName}* (${realEmail})`,
        }],
      }
      await sendMessage(testChannelId, [banner, { type: 'divider' }, ...blocks as object[]], `[TESTE] ${label}`)
      results.push(`${label} → redirecionado para ${testEmail} ✓`)
      return
    }
    const slackId = await slackUserIdByEmail(realEmail)
    if (!slackId) { results.push(`${label}: Slack user não encontrado para ${realEmail}`); return }
    const dmChannel = await openDm(slackId)
    if (!dmChannel) { results.push(`${label}: não foi possível abrir DM`); return }
    const res = await sendMessage(dmChannel, blocks, text)
    results.push(`${label}: ${res.ok ? 'enviado ✓' : res.error}`)
  }

  // 4. DM personalizada para cada usuário com pendências
  for (const [username, profile] of profileMap) {
    if (!profile.email) continue
    if (profile.role?.toLowerCase() === 'leitor') continue

    const late = allTasks
      .filter(t => t.owner === username && t.status === 'late')
      .sort((a, b) => b.daysLate - a.daysLate)

    const upcoming = allTasks
      .filter(t =>
        t.owner === username &&
        t.status === 'ontrack' &&
        t.dataPrevista &&
        t.dataPrevista <= in10
      )
      .sort((a, b) => (a.dataPrevista!.getTime() - b.dataPrevista!.getTime()))

    if (late.length === 0 && upcoming.length === 0) continue

    const firstName = profile.name?.split(' ')[0] ?? username
    const blocks    = buildUserBlocks(firstName, late, upcoming, today)
    await dispatch(
      profile.email,
      profile.name ?? username,
      blocks,
      `PMI Tracker — suas pendências desta semana, ${firstName}`,
      `usuário ${username}`
    )
  }

  // 5. DM para líderes com visão do time
  // Líder = qualquer perfil (não-leitor) que tenha ao menos um liderado direto no sistema
  const leaders = normalizedProfiles.filter((p: Profile) =>
    p.email &&
    p.role?.toLowerCase() !== 'leitor' &&
    normalizedProfiles.some(other => other.manager_username === p.username)
  )

  for (const leader of leaders) {
    const liderados = normalizedProfiles.filter((p: Profile) =>
      p.manager_username === leader.username
    )
    if (!liderados.length) continue

    const allMemberData = liderados.map((l: Profile) => ({
      profile:  l,
      late:     allTasks.filter(t => t.owner === l.username && t.status === 'late'),
      upcoming: allTasks.filter(t =>
        t.owner === l.username && t.status === 'ontrack' &&
        t.dataPrevista && t.dataPrevista <= in10
      ),
    }))

    // Apenas membros com algo a mostrar no detalhamento
    const teamData = allMemberData.filter(d => d.late.length > 0 || d.upcoming.length > 0)
    if (!teamData.length) continue

    // Contagens baseadas em TODOS os liderados (não só os filtrados)
    const onTimeCount     = allMemberData.filter(d => d.late.length === 0).length
    const withIssuesCount = allMemberData.filter(d => d.late.length > 0).length

    const firstName = leader.name?.split(' ')[0] ?? leader.username
    const blocks    = buildLeaderBlocks(firstName, teamData, onTimeCount, withIssuesCount, today)
    await dispatch(
      leader.email!,
      leader.name ?? leader.username,
      blocks,
      `PMI Tracker — status do seu time, ${firstName}`,
      `líder ${leader.username}`
    )
  }

  return new Response(
    JSON.stringify({ ok: true, total: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

// ─── Escalation block helper ─────────────────────────────────────────────────
//
// Dado um conjunto de tarefas, agrupa as áreas por responsável de gatilho
// e retorna um bloco Slack compacto: "📞 Quem acionar"
// Retorna null se nenhuma área tiver gatilho configurado.

function buildEscalationBlock(tasks: TaskEntry[]): unknown | null {
  // Inverte o mapa: responsável → Set<área>
  const byContact = new Map<string, Set<string>>()
  for (const t of tasks) {
    const contact = AREA_TRIGGERS[t.area]
    if (!contact || !t.area) continue
    if (!byContact.has(contact)) byContact.set(contact, new Set())
    byContact.get(contact)!.add(t.area)
  }
  if (byContact.size === 0) return null

  const lines: string[] = []
  for (const [contact, areas] of byContact) {
    lines.push(`*${contact}* — ${[...areas].join(', ')}`)
  }

  return {
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `📞 *Quem acionar:*  ${lines.join('  ·  ')}`,
    }],
  }
}

// ─── Blocos Slack — Usuário individual ───────────────────────────────────────
//
// Hierarquia:
//   1. Resumo contextual: X atrasadas → Y sem cobertura / Z gerenciadas
//   2. 🚨 Sem cobertura — requerem ação (detalhado, máx 3)
//   3. 🛡️ Com ação de mitigação (compacto, máx 3)
//   4. 📅 Vencem em breve (máx 3)
//   5. CTA

function buildUserBlocks(
  firstName: string,
  late: TaskEntry[],
  upcoming: TaskEntry[],
  weekDate: Date
): unknown[] {
  const pl = (n: number, s = 's') => n !== 1 ? s : ''
  const weekStr = fmtDateLong(weekDate)

  const withMitigation = late.filter(t => t.bloqueio && t.raidTitle)
  const noCoverage     = late.filter(t => !(t.bloqueio && t.raidTitle))

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `👋 Boa semana, ${firstName}!`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Semana de *${weekStr}*  ·  PMI Tracker` }],
    },
  ]

  // ── Resumo contextual ──────────────────────────────────────────────────────
  if (late.length > 0) {
    let summaryText = `*${late.length} tarefa${pl(late.length)} em atraso esta semana*`

    if (noCoverage.length > 0 && withMitigation.length > 0) {
      summaryText += `\n🚨 *${noCoverage.length}* sem cobertura — requer${noCoverage.length === 1 ? '' : 'em'} atenção`
      summaryText += `\n🛡️ *${withMitigation.length}* com ação de mitigação — acompanhe o progresso`
    } else if (noCoverage.length > 0) {
      summaryText += `\n🚨 Todas requerem atenção — sem plano de mitigação`
    } else {
      summaryText += `\n🛡️ Todas têm ação de mitigação associada — acompanhe o progresso das ações`
    }

    blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summaryText } })
  }

  // ── 🚨 Sem cobertura ──────────────────────────────────────────────────────
  if (noCoverage.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🚨 *Precisam de você agora*` },
    })

    for (const t of noCoverage.slice(0, 3)) {
      let text = `*${t.task}*`
      text += `\n> 🏢 ${t.companyName}  ·  📂 ${t.area}${t.bloco ? '  ·  ' + t.bloco : ''}`
      text += `\n> 📅 Venceu em *${t.dataPrevista ? fmtDate(t.dataPrevista) : '—'}*`
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
    }

    if (noCoverage.length > 3) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_+ ${noCoverage.length - 3} outras sem cobertura — veja no tracker_` }],
      })
    }
  }

  // ── 🛡️ Com mitigação ─────────────────────────────────────────────────────
  if (withMitigation.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🛡️ *Bloqueadas com plano de ação (${withMitigation.length}) — não requerem ação imediata*\n_Acompanhe o andamento das ações de mitigação:_`,
      },
    })

    for (const t of withMitigation.slice(0, 3)) {
      let text = `• *${t.task}*`
      if (t.raidTitle) {
        text += `\n  📋 Ação: _${t.raidTitle}${t.raidOwner ? `  —  ${t.raidOwner}` : ''}_`
      }
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
    }

    if (withMitigation.length > 3) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_+ ${withMitigation.length - 3} outras com cobertura — veja no tracker_` }],
      })
    }
  }

  // ── 📅 Vencem em breve ────────────────────────────────────────────────────
  if (upcoming.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `📅 *${upcoming.length} tarefa${pl(upcoming.length)} vence${pl(upcoming.length, 'm')} nos próximos 10 dias*` },
    })

    for (const t of upcoming.slice(0, 3)) {
      let text = `*${t.task}*`
      text += `\n> 🏢 ${t.companyName}  ·  📂 ${t.area}${t.bloco ? '  ·  ' + t.bloco : ''}`
      text += `\n> 📅 Vence em *${t.dataPrevista ? fmtDate(t.dataPrevista) : '—'}*`
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
    }

    if (upcoming.length > 3) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_+ ${upcoming.length - 3} outras vencem em breve — veja no tracker_` }],
      })
    }
  }

  // ── Escalation ────────────────────────────────────────────────────────────
  // Só mostra para tarefas que precisam de ação (sem cobertura + upcoming)
  const escalationTasks = [...noCoverage, ...upcoming]
  const escalationBlock = buildEscalationBlock(escalationTasks)
  if (escalationBlock) {
    blocks.push({ type: 'divider' })
    blocks.push(escalationBlock)
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'actions',
    elements: [
      {
        type:  'button',
        text:  { type: 'plain_text', text: '📊 Abrir PMI Tracker', emoji: true },
        url:   PMI_TRACKER_URL,
        style: 'primary',
      },
    ],
  })

  return blocks
}

// ─── Blocos Slack — Líder ─────────────────────────────────────────────────────
//
// Hierarquia executiva:
//   1. Header + data
//   2. Scorecard: 🚨 Requer atenção | 🛡️ Gerenciado | ✅ Em dia
//   3. SOMENTE detalhes de quem tem tarefas sem cobertura (o problema real)
//   4. Seção compacta: quem já está gerenciado (só contagem)
//   5. CTA

function buildLeaderBlocks(
  firstName: string,
  teamData: { profile: Profile; late: TaskEntry[]; upcoming: TaskEntry[] }[],
  onTime: number,
  _withIssues: number,
  weekDate: Date
): unknown[] {
  const pl = (n: number, s = 's') => n !== 1 ? s : ''
  const weekStr = fmtDateLong(weekDate)

  // Classifica cada membro
  const membersWithUncovered = teamData.filter(d =>
    d.late.some(t => !(t.bloqueio && t.raidTitle))
  )
  const membersOnlyManaged = teamData.filter(d =>
    d.late.length > 0 &&
    d.late.every(t => t.bloqueio && t.raidTitle)
  )

  const totalUncovered = membersWithUncovered.reduce((sum, d) =>
    sum + d.late.filter(t => !(t.bloqueio && t.raidTitle)).length, 0
  )
  const totalManaged = teamData.reduce((sum, d) =>
    sum + d.late.filter(t => t.bloqueio && t.raidTitle).length, 0
  )

  // ── Header ────────────────────────────────────────────────────────────────
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `👥 Status do time, ${firstName}`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Semana de *${weekStr}*  ·  PMI Tracker` }],
    },
  ]

  // ── Scorecard ─────────────────────────────────────────────────────────────
  const scorecardFields: unknown[] = []

  if (membersWithUncovered.length > 0) {
    scorecardFields.push({
      type: 'mrkdwn',
      text: `🚨 *Requer atenção*\n${membersWithUncovered.length} pessoa${pl(membersWithUncovered.length)} · ${totalUncovered} tarefa${pl(totalUncovered)}`,
    })
  }

  if (totalManaged > 0) {
    scorecardFields.push({
      type: 'mrkdwn',
      text: `🛡️ *Gerenciado*\n${membersOnlyManaged.length + membersWithUncovered.filter(d => d.late.some(t => t.bloqueio && t.raidTitle)).length} pessoa${pl(membersOnlyManaged.length)} · ${totalManaged} tarefa${pl(totalManaged)}`,
    })
  }

  if (onTime > 0) {
    scorecardFields.push({
      type: 'mrkdwn',
      text: `✅ *Em dia*\n${onTime} liderado${pl(onTime)}`,
    })
  }

  if (scorecardFields.length > 0) {
    blocks.push({ type: 'section', fields: scorecardFields.slice(0, 2) })
    if (scorecardFields.length > 2) {
      blocks.push({ type: 'section', fields: scorecardFields.slice(2) })
    }
  }

  // ── 🚨 Requer atenção — com detalhe ──────────────────────────────────────
  if (membersWithUncovered.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🚨 *Requer sua atenção agora*` },
    })

    for (const { profile, late, upcoming } of membersWithUncovered) {
      const name        = profile.name?.split(' ')[0] ?? profile.username
      const noCoverage  = late.filter(t => !(t.bloqueio && t.raidTitle))
      const withMit     = late.filter(t => t.bloqueio && t.raidTitle)

      let text = `*${name}* — ${noCoverage.length} tarefa${pl(noCoverage.length)} sem cobertura`
      if (withMit.length > 0) {
        text += `  _(+${withMit.length} já gerenciada${pl(withMit.length)})_`
      }
      if (upcoming.length > 0) {
        text += `  ·  📅 ${upcoming.length} vence${pl(upcoming.length, 'm')} em breve`
      }

      for (const t of noCoverage.slice(0, 3)) {
        text += `\n  › ${t.task} _(${t.companyName} · ${t.area})_`
      }
      if (noCoverage.length > 3) {
        text += `\n  › _+ ${noCoverage.length - 3} mais — veja no tracker_`
      }

      blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
    }
  }

  // ── 🛡️ Gerenciado — compacto, sem detalhe ────────────────────────────────
  if (membersOnlyManaged.length > 0 || membersWithUncovered.some(d => d.late.some(t => t.bloqueio && t.raidTitle))) {
    blocks.push({ type: 'divider' })

    let managedText = `🛡️ *Gerenciado — sem ação necessária do líder*`
    managedText += `\n_Tarefas com ação de mitigação associada. Acompanhe o andamento das ações._\n`

    // Membros que só têm gerenciados
    for (const { profile, late } of membersOnlyManaged) {
      const name    = profile.name?.split(' ')[0] ?? profile.username
      const withMit = late.filter(t => t.bloqueio && t.raidTitle)
      if (!withMit.length) continue
      managedText += `\n• *${name}* — ${withMit.length} tarefa${pl(withMit.length)} com plano de ação`
    }

    // Membros que têm mix (já aparecem em 🚨, mas listar o gerenciado deles aqui)
    for (const { profile, late } of membersWithUncovered) {
      const withMit = late.filter(t => t.bloqueio && t.raidTitle)
      if (!withMit.length) continue
      const name = profile.name?.split(' ')[0] ?? profile.username
      managedText += `\n• *${name}* — ${withMit.length} tarefa${pl(withMit.length)} com plano de ação`
    }

    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: managedText } })
  }

  // ── Escalation ────────────────────────────────────────────────────────────
  // Baseado apenas nas tarefas sem cobertura (o que o líder precisa acionar)
  const allUncoveredTasks = membersWithUncovered.flatMap(d =>
    d.late.filter(t => !(t.bloqueio && t.raidTitle))
  )
  const escalationBlock = buildEscalationBlock(allUncoveredTasks)
  if (escalationBlock) {
    blocks.push({ type: 'divider' })
    blocks.push(escalationBlock)
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'actions',
    elements: [
      {
        type:  'button',
        text:  { type: 'plain_text', text: '📊 Ver Painel do Líder', emoji: true },
        url:   `${PMI_TRACKER_URL}#lider`,
        style: 'primary',
      },
    ],
  })

  return blocks
}
