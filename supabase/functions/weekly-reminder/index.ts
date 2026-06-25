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
    const blocks    = buildUserBlocks(firstName, late, upcoming)
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
    const blocks    = buildLeaderBlocks(firstName, teamData, onTimeCount, withIssuesCount)
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

// ─── Blocos Slack — Usuário individual ───────────────────────────────────────

function buildUserBlocks(
  firstName: string,
  late: TaskEntry[],
  upcoming: TaskEntry[]
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `👋 Boa semana, ${firstName}!`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Aqui estão suas pendências no *PMI Tracker* para esta semana:',
      },
    },
    { type: 'divider' },
  ]

  // Seção: atrasadas
  if (late.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🔴 *${late.length} tarefa${late.length > 1 ? 's' : ''} atrasada${late.length > 1 ? 's' : ''}*` },
    })

    for (const t of late.slice(0, 5)) {
      const gatilho = AREA_TRIGGERS[t.area]
      const gatilhoTxt = gatilho ? `\n> 💬 Dúvidas? Fale com *${gatilho}*` : ''
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${t.task}*\n> 🏢 ${t.companyName}  ·  📂 ${t.area}${t.bloco ? '  ·  ' + t.bloco : ''}\n> 📅 Venceu em *${t.dataPrevista ? fmtDate(t.dataPrevista) : '—'}*${gatilhoTxt}`,
        },
      })
    }

    if (late.length > 5) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_+ ${late.length - 5} outras tarefas atrasadas — veja no tracker_` }],
      })
    }

    blocks.push({ type: 'divider' })
  }

  // Seção: próximos 10 dias
  if (upcoming.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `📅 *${upcoming.length} tarefa${upcoming.length > 1 ? 's' : ''} vence${upcoming.length > 1 ? 'm' : ''} nos próximos 10 dias*` },
    })

    for (const t of upcoming.slice(0, 5)) {
      const gatilho = AREA_TRIGGERS[t.area]
      const gatilhoTxt = gatilho ? `\n> 💬 Dúvidas? Fale com *${gatilho}*` : ''
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${t.task}*\n> 🏢 ${t.companyName}  ·  📂 ${t.area}${t.bloco ? '  ·  ' + t.bloco : ''}\n> 📅 Vence em *${t.dataPrevista ? fmtDate(t.dataPrevista) : '—'}*${gatilhoTxt}`,
        },
      })
    }

    blocks.push({ type: 'divider' })
  }

  // CTA
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text:  { type: 'plain_text', text: '📊 Abrir PMI Tracker', emoji: true },
        url:   PMI_TRACKER_URL,
        style: 'primary',
      },
    ],
  })

  return blocks
}

// ─── Blocos Slack — Líder ─────────────────────────────────────────────────────

function buildLeaderBlocks(
  firstName: string,
  teamData: { profile: Profile; late: TaskEntry[]; upcoming: TaskEntry[] }[],
  onTime: number,
  withIssues: number
): unknown[] {

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `👥 Status do seu time, ${firstName}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `✅ *Em dia:*\n${onTime} liderado${onTime !== 1 ? 's' : ''}` },
        { type: 'mrkdwn', text: `⚠️ *Com pendências:*\n${withIssues} liderado${withIssues !== 1 ? 's' : ''}` },
      ],
    },
    { type: 'divider' },
  ]

  for (const { profile, late, upcoming } of teamData) {
    const name    = profile.name?.split(' ')[0] ?? profile.username
    const upcomStr = upcoming.length > 0 ? `📅 ${upcoming.length} vence${upcoming.length > 1 ? 'm' : ''} em breve` : ''

    // Separa: bloqueadas com mitigação vs sem cobertura
    const withMitigation = late.filter(t => t.bloqueio && t.raidTitle)
    const noCoverage     = late.filter(t => !(t.bloqueio && t.raidTitle))

    const lateStr = late.length > 0
      ? `🔴 *${late.length} atrasada${late.length > 1 ? 's' : ''}*`
      : ''
    const statusLine = [lateStr, upcomStr].filter(Boolean).join('   ') || '✅ Em dia'

    let bodyText = `*${name}*   ${statusLine}`

    // Sem cobertura → destaque de urgência
    if (noCoverage.length > 0) {
      bodyText += `\n\n  🚨 *Sem cobertura — requer ação (${noCoverage.length}):*`
      for (const t of noCoverage.slice(0, 2)) {
        bodyText += `\n  › ${t.task} _(${t.companyName} · ${t.area})_`
      }
    }

    // Com mitigação → contexto tranquilizador
    if (withMitigation.length > 0) {
      bodyText += `\n\n  🛡️ *Com ação de mitigação (${withMitigation.length}):*`
      for (const t of withMitigation.slice(0, 2)) {
        const raidInfo = t.raidTitle ? ` — _${t.raidTitle}${t.raidOwner ? `, ${t.raidOwner}` : ''}_` : ''
        bodyText += `\n  › ${t.task}${raidInfo}`
      }
    }

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: bodyText },
    })
  }

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
