// Supabase Edge Function: alerts
// Envia digest diario de tarefas atrasadas e proximas do prazo para owners (por email).
//
// Variaveis de ambiente esperadas:
//   SUPABASE_URL          -> URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY -> service_role key (somente backend)
//   RESEND_API_KEY        -> chave do provedor de email (Resend.com). Pode trocar por outro.
//   ALERT_FROM            -> email remetente verificado (ex: "PMI Tracker <alerts@seu-dominio.com>")
//   ALERT_LOOKAHEAD_DAYS  -> opcional, default 5 (avisa tarefas com vencimento ate N dias)
//
// Trigger sugerido: cron diario as 7h America/Sao_Paulo
//   select cron.schedule('pmi-alerts-daily', '0 10 * * *',
//     $$ select net.http_post(url:='https://<ref>.functions.supabase.co/alerts',
//        headers := jsonb_build_object('Authorization', 'Bearer <anon ou service>')) $$);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY") || "";
const ALERT_FROM   = Deno.env.get("ALERT_FROM") || "PMI Tracker <onboarding@resend.dev>";
const LOOKAHEAD    = parseInt(Deno.env.get("ALERT_LOOKAHEAD_DAYS") || "5", 10);

// Calcula data prevista = sign_date + prazo dias uteis
function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  const sign = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) {
    console.log("[alerts] RESEND_API_KEY ausente; pulando envio para", to);
    return { skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({ from: ALERT_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`resend ${res.status}: ${t}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const horizon = addBusinessDays(today, LOOKAHEAD);

    // 1. Buscar companies (id, name, sign_date)
    const { data: companies, error: cErr } = await sb
      .from("companies")
      .select("id, name, sign_date");
    if (cErr) throw cErr;
    const companyMap = new Map<string, { id: string; name: string; sign_date: string | null }>();
    (companies || []).forEach((c) => companyMap.set(c.id, c));

    // 2. Buscar tasks abertas (sem data_real_conclusao)
    const { data: tasks, error: tErr } = await sb
      .from("tasks")
      .select("id, company_id, task, owner, prazo, data_real_conclusao, area")
      .is("data_real_conclusao", null);
    if (tErr) throw tErr;

    // 3. Calcular status e agrupar por owner
    type Item = {
      task: string;
      company: string;
      area: string;
      due: string;
      status: "late" | "due-soon";
      days: number;
    };
    const byOwner = new Map<string, Item[]>();

    for (const t of tasks || []) {
      if (!t.owner) continue;
      const c = companyMap.get(t.company_id);
      if (!c || !c.sign_date) continue;
      const sd = new Date(c.sign_date);
      const due = addBusinessDays(sd, t.prazo || 0);
      const dayDiff = Math.round((due.getTime() - today.getTime()) / 86400000);
      let status: Item["status"] | null = null;
      if (dayDiff < 0) status = "late";
      else if (dayDiff <= LOOKAHEAD) status = "due-soon";
      if (!status) continue;
      const owner = t.owner.trim();
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner)!.push({
        task: t.task || "(sem titulo)",
        company: c.name,
        area: t.area || "",
        due: fmt(due),
        status,
        days: dayDiff,
      });
    }

    // 4. Resolver email dos owners via profiles (assumindo username == owner)
    const ownerNames = Array.from(byOwner.keys());
    let profileMap = new Map<string, { email: string; username: string }>();
    if (ownerNames.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, username, email")
        .in("username", ownerNames);
      (profs || []).forEach((p) => {
        if (p.username && p.email) profileMap.set(p.username, { email: p.email, username: p.username });
      });
    }

    // 5. Enviar emails
    const sent: Array<{ owner: string; email: string; count: number; status: string }> = [];
    for (const [owner, items] of byOwner.entries()) {
      const prof = profileMap.get(owner);
      if (!prof?.email) {
        sent.push({ owner, email: "(sem email)", count: items.length, status: "skipped-no-email" });
        continue;
      }
      const late = items.filter((i) => i.status === "late").sort((a, b) => a.days - b.days);
      const soon = items.filter((i) => i.status === "due-soon").sort((a, b) => a.days - b.days);

      const rowsHtml = (arr: Item[]) =>
        arr
          .map(
            (i) =>
              `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.task)}</td>` +
              `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.company)}</td>` +
              `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.area)}</td>` +
              `<td style="padding:6px 8px;border-bottom:1px solid #eee">${i.due}</td>` +
              `<td style="padding:6px 8px;border-bottom:1px solid #eee;color:${i.status === "late" ? "#dc2626" : "#d97706"}">${i.status === "late" ? `${Math.abs(i.days)} d atrasado` : `em ${i.days} d`}</td></tr>`,
          )
          .join("");

      const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0F1727">
        <h2 style="color:#0F1727">Resumo diario PMI Tracker</h2>
        <p>Ola ${escapeHtml(owner)},</p>
        <p>Voce tem <b>${late.length}</b> tarefa(s) atrasada(s) e <b>${soon.length}</b> com vencimento nos proximos ${LOOKAHEAD} dias uteis.</p>
        ${late.length ? `<h3 style="color:#dc2626;margin-top:24px">Atrasadas</h3><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#fee2e2"><th style="text-align:left;padding:6px 8px">Tarefa</th><th style="text-align:left;padding:6px 8px">Empresa</th><th style="text-align:left;padding:6px 8px">Area</th><th style="text-align:left;padding:6px 8px">Prazo</th><th style="text-align:left;padding:6px 8px">Status</th></tr></thead><tbody>${rowsHtml(late)}</tbody></table>` : ""}
        ${soon.length ? `<h3 style="color:#d97706;margin-top:24px">Vencendo em breve</h3><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#fef3c7"><th style="text-align:left;padding:6px 8px">Tarefa</th><th style="text-align:left;padding:6px 8px">Empresa</th><th style="text-align:left;padding:6px 8px">Area</th><th style="text-align:left;padding:6px 8px">Prazo</th><th style="text-align:left;padding:6px 8px">Status</th></tr></thead><tbody>${rowsHtml(soon)}</tbody></table>` : ""}
        <p style="margin-top:24px;color:#6b7280;font-size:12px">Email automatico do PMI Tracker. Acesse a plataforma para atualizar status.</p>
      </body></html>`;

      try {
        await sendEmail(prof.email, `[PMI] ${late.length} atrasada(s) e ${soon.length} proxima(s) do prazo`, html);
        sent.push({ owner, email: prof.email, count: items.length, status: "sent" });
      } catch (e) {
        sent.push({ owner, email: prof.email, count: items.length, status: `error: ${(e as Error).message}` });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: sent.length, sent }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
