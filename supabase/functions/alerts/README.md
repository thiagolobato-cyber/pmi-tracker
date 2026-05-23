# Edge Function: alerts

Digest diario por email para owners com tarefas atrasadas ou proximas do prazo.

## Setup

1. Instale Supabase CLI: <https://supabase.com/docs/guides/cli>
2. Faca login: `supabase login`
3. Link ao projeto: `supabase link --project-ref dcysotuufmptamgluwah`
4. Crie conta no [Resend](https://resend.com) (ou substitua o provedor de email no codigo).
5. Configure secrets:

   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxx
   supabase secrets set ALERT_FROM="PMI Tracker <alerts@seu-dominio.com>"
   supabase secrets set ALERT_LOOKAHEAD_DAYS=5
   ```

6. Deploy:

   ```bash
   supabase functions deploy alerts --no-verify-jwt
   ```

7. Teste manual:

   ```bash
   curl -X POST https://dcysotuufmptamgluwah.functions.supabase.co/alerts \
        -H "Authorization: Bearer <anon-key>"
   ```

## Agendamento (cron)

Use a extensao `pg_cron` + `pg_net` no Supabase:

```sql
select cron.schedule(
  'pmi-alerts-daily',
  '0 10 * * *',  -- 10 UTC = 7h America/Sao_Paulo
  $$ select net.http_post(
       url:='https://dcysotuufmptamgluwah.functions.supabase.co/alerts',
       headers := jsonb_build_object('Authorization', 'Bearer SERVICE_ROLE_KEY')
     ) $$
);
```

## Pre-requisitos no schema

- `public.profiles(id, username, email)` deve ter linha por usuario com email valido
- `public.tasks(owner)` precisa bater com `profiles.username`
- `public.companies.sign_date` deve estar preenchido

## Customizacao

Edite `index.ts`:

- `LOOKAHEAD` (default 5 dias uteis) controla janela de "vencendo em breve"
- Template HTML do email
- Para trocar provedor de email, substitua `sendEmail()` (ex: AWS SES, SendGrid)
