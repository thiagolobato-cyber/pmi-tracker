// Supabase Edge Function: create-user
// Cria um novo usuário autenticado com email + senha + role.
// Só pode ser chamada por quem tem role=admin (validado via JWT + profiles).
//
// Variáveis de ambiente esperadas:
//   SUPABASE_URL               -> URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY  -> service_role key (apenas backend — nunca expor no frontend)
//
// Como deployar:
//   supabase functions deploy create-user --project-ref vscrdxwgtbokgjaiging
//
// Payload esperado (POST JSON):
//   { email: string, password: string, role: "admin"|"owner"|"leitor", username?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VALID_ROLES  = ["admin", "owner", "leitor"];

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  // 1. Extrair JWT do caller
  const authHeader = req.headers.get("authorization") || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!callerToken) return json({ error: "Não autenticado" }, 401);

  // 2. Validar que o caller é admin — usa client anon com o token do caller
  const callerClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: { user: callerUser }, error: userErr } = await callerClient.auth.getUser(callerToken);
  if (userErr || !callerUser) return json({ error: "Token inválido" }, 401);

  const { data: callerProfile, error: profErr } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.id)
    .maybeSingle();

  if (profErr || callerProfile?.role !== "admin") {
    return json({ error: "Acesso negado — apenas admins podem criar usuários" }, 403);
  }

  // 3. Validar payload
  let body: { email?: string; password?: string; role?: string; username?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Payload inválido" }, 400); }

  const { email, password, role, username } = body;
  if (!email || typeof email !== "string") return json({ error: "email obrigatório" }, 400);
  if (!password || typeof password !== "string" || password.length < 6)
    return json({ error: "senha obrigatória (mínimo 6 caracteres)" }, 400);
  if (!role || !VALID_ROLES.includes(role))
    return json({ error: `role inválido — use: ${VALID_ROLES.join(", ")}` }, 400);

  // 4. Criar usuário via admin API (service_role)
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true, // confirma automaticamente — não precisa clicar em email
  });

  if (createErr) {
    // Usuário já existe?
    if (createErr.message?.toLowerCase().includes("already registered")) {
      return json({ error: "Este e-mail já está cadastrado" }, 409);
    }
    return json({ error: createErr.message || "Erro ao criar usuário" }, 500);
  }

  const userId = newUser.user?.id;
  if (!userId) return json({ error: "Usuário criado mas ID não retornado" }, 500);

  // 5. Definir profile: upsert com role e username
  const uname = (username || email.split("@")[0]).trim();
  const { error: upsertErr } = await adminClient
    .from("profiles")
    .upsert({ id: userId, username: uname, role }, { onConflict: "id" });

  if (upsertErr) {
    // Usuário foi criado mas profile falhou — tenta deletar o auth user para não deixar orfão
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return json({ error: "Usuário criado mas falhou ao salvar perfil: " + upsertErr.message }, 500);
  }

  return json({
    ok: true,
    user: { id: userId, email: email.trim().toLowerCase(), username: uname, role },
  });
});
