-- =====================================================================
-- MIGRAÇÃO DE SCHEMA: projeto novo "pmi-tracker-bhub"
-- Cole tudo no SQL Editor do NOVO projeto e rode UMA VEZ.
-- =====================================================================

-- ============= TABLES =============

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sign_date date NULL,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  username text NULL,
  role text NULL DEFAULT 'leitor'::text,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ref text NULL,
  area text NULL,
  task text NULL,
  default_owner text NULL,
  default_prazo int4 NULL DEFAULT 0,
  ordering int4 NULL DEFAULT 0,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  ref text NULL,
  area text NULL,
  task text NULL,
  owner text NULL,
  ferramenta text NULL,
  prazo int4 NULL DEFAULT 0,
  data_real_conclusao date NULL,
  completado numeric NULL DEFAULT 0,
  evidencia text NULL,
  ultimo_update date NULL,
  proximo_passo text NULL,
  bloqueio text NULL DEFAULT 'Não'::text,
  bloqueio_descricao text NULL,
  phase_id text NULL,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.raid_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  type text NULL,
  area text NULL,
  title text NULL,
  description text NULL,
  severity text NULL DEFAULT 'med'::text,
  status text NULL DEFAULT 'open'::text,
  owner text NULL,
  due_date date NULL,
  mitigation text NULL,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.synergies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  name text NULL,
  area text NULL,
  type text NULL DEFAULT 'cost'::text,
  status text NULL DEFAULT 'identified'::text,
  target_phase text NULL,
  planned_value numeric NULL DEFAULT 0,
  realized_value numeric NULL DEFAULT 0,
  owner text NULL,
  notes text NULL,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  area text NULL,
  week_iso text NULL,
  rag text NULL DEFAULT 'g'::text,
  comment text NULL,
  owner text NULL,
  created_at timestamptz NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploader_id uuid NULL,
  uploader_email text NULL,
  uploader_name text NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  company_id uuid NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NULL,
  size_bytes int8 NULL
);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  author_id uuid NULL,
  author_email text NULL,
  author_name text NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  company_id uuid NULL,
  body text NOT NULL,
  edited bool NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  predecessor_id uuid NOT NULL,
  successor_id uuid NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq;
CREATE TABLE IF NOT EXISTS public.audit_log (
  id int8 NOT NULL DEFAULT nextval('public.audit_log_id_seq'::regclass),
  ts timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NULL,
  actor_email text NULL,
  actor_name text NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  company_id uuid NULL,
  action text NOT NULL,
  changes jsonb NULL
);
ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;

-- ============= PRIMARY KEYS / UNIQUES / CHECKS =============

ALTER TABLE public.companies         ADD CONSTRAINT companies_pkey         PRIMARY KEY (id);
ALTER TABLE public.profiles          ADD CONSTRAINT profiles_pkey          PRIMARY KEY (id);
ALTER TABLE public.profiles          ADD CONSTRAINT profiles_role_check    CHECK (role = ANY (ARRAY['admin'::text,'owner'::text,'leitor'::text]));
ALTER TABLE public.template_tasks    ADD CONSTRAINT template_tasks_pkey    PRIMARY KEY (id);
ALTER TABLE public.tasks             ADD CONSTRAINT tasks_pkey             PRIMARY KEY (id);
ALTER TABLE public.raid_items        ADD CONSTRAINT raid_items_pkey        PRIMARY KEY (id);
ALTER TABLE public.raid_items        ADD CONSTRAINT raid_items_type_check     CHECK (type     = ANY (ARRAY['risk'::text,'issue'::text,'decision'::text,'assumption'::text]));
ALTER TABLE public.raid_items        ADD CONSTRAINT raid_items_severity_check CHECK (severity = ANY (ARRAY['high'::text,'med'::text,'low'::text]));
ALTER TABLE public.raid_items        ADD CONSTRAINT raid_items_status_check   CHECK (status   = ANY (ARRAY['open'::text,'mitigated'::text,'closed'::text]));
ALTER TABLE public.synergies         ADD CONSTRAINT synergies_pkey         PRIMARY KEY (id);
ALTER TABLE public.synergies         ADD CONSTRAINT synergies_type_check   CHECK (type = ANY (ARRAY['cost'::text,'revenue'::text]));
ALTER TABLE public.health_entries    ADD CONSTRAINT health_entries_pkey    PRIMARY KEY (id);
ALTER TABLE public.health_entries    ADD CONSTRAINT health_entries_rag_check CHECK (rag = ANY (ARRAY['g'::text,'a'::text,'r'::text]));
ALTER TABLE public.health_entries    ADD CONSTRAINT health_entries_company_id_area_week_iso_key UNIQUE (company_id, area, week_iso);
ALTER TABLE public.attachments       ADD CONSTRAINT attachments_pkey       PRIMARY KEY (id);
ALTER TABLE public.comments          ADD CONSTRAINT comments_pkey          PRIMARY KEY (id);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_check CHECK (predecessor_id <> successor_id);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_predecessor_id_successor_id_key UNIQUE (predecessor_id, successor_id);
ALTER TABLE public.audit_log         ADD CONSTRAINT audit_log_pkey         PRIMARY KEY (id);

-- ============= FOREIGN KEYS =============

ALTER TABLE public.profiles          ADD CONSTRAINT profiles_id_fkey                   FOREIGN KEY (id)             REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tasks             ADD CONSTRAINT tasks_company_id_fkey              FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.raid_items        ADD CONSTRAINT raid_items_company_id_fkey         FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.synergies         ADD CONSTRAINT synergies_company_id_fkey          FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.health_entries    ADD CONSTRAINT health_entries_company_id_fkey     FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.attachments       ADD CONSTRAINT attachments_company_id_fkey        FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.attachments       ADD CONSTRAINT attachments_uploader_id_fkey       FOREIGN KEY (uploader_id)    REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.comments          ADD CONSTRAINT comments_company_id_fkey           FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.comments          ADD CONSTRAINT comments_author_id_fkey            FOREIGN KEY (author_id)      REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_predecessor_id_fkey FOREIGN KEY (predecessor_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_successor_id_fkey   FOREIGN KEY (successor_id)   REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log         ADD CONSTRAINT audit_log_actor_id_fkey            FOREIGN KEY (actor_id)       REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log         ADD CONSTRAINT audit_log_company_id_fkey          FOREIGN KEY (company_id)     REFERENCES public.companies(id) ON DELETE SET NULL;

-- ============= INDEXES (não-PK/UNIQUE) =============

CREATE INDEX IF NOT EXISTS attachments_company_idx ON public.attachments USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attachments_entity_idx  ON public.attachments USING btree (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx     ON public.audit_log   USING btree (actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_company_idx   ON public.audit_log   USING btree (company_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx    ON public.audit_log   USING btree (entity_type, entity_id, ts DESC);
CREATE INDEX IF NOT EXISTS comments_company_idx    ON public.comments    USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_entity_idx     ON public.comments    USING btree (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS task_dep_pred_idx       ON public.task_dependencies USING btree (predecessor_id);
CREATE INDEX IF NOT EXISTS task_dep_succ_idx       ON public.task_dependencies USING btree (successor_id);

-- ============= FUNCTIONS =============

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
        select exists(
          select 1 from public.profiles
          where id = auth.uid() and role = 'admin'
        );
      $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, username, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), 'leitor');
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
  v_email text;
  v_name  text;
  v_changes jsonb;
  v_company uuid;
  v_entity_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is not null then
    select email into v_email from auth.users where id = v_actor;
    select username into v_name from public.profiles where id = v_actor;
  end if;

  -- company_id e entity_id dependem da tabela
  if TG_TABLE_NAME in ('tasks','raid_items','synergies','health_entries','attachments','comments') then
    v_company := coalesce((to_jsonb(new))->>'company_id', (to_jsonb(old))->>'company_id')::uuid;
  elsif TG_TABLE_NAME = 'companies' then
    if TG_OP = 'DELETE' then
      v_company := NULL;
    else
      v_company := coalesce(new.id, old.id);
    end if;
  end if;
  v_entity_id := coalesce((to_jsonb(new))->>'id', (to_jsonb(old))->>'id')::uuid;

  if TG_OP = 'INSERT' then
    v_changes := to_jsonb(new);
  elsif TG_OP = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('old', to_jsonb(old)->key, 'new', to_jsonb(new)->key))
      into v_changes
      from jsonb_object_keys(to_jsonb(new)) as key
      where to_jsonb(new)->key is distinct from to_jsonb(old)->key
        and key not in ('updated_at','created_at');
    if v_changes is null then return new; end if;
  elsif TG_OP = 'DELETE' then
    v_changes := to_jsonb(old);
  end if;

  insert into public.audit_log (actor_id, actor_email, actor_name, entity_type, entity_id, company_id, action, changes)
  values (v_actor, v_email, v_name, TG_TABLE_NAME, v_entity_id, v_company, lower(TG_OP), v_changes);

  return coalesce(new, old);
end;
$function$;

-- ============= TRIGGERS =============

CREATE TRIGGER audit_attachments       AFTER INSERT OR UPDATE OR DELETE ON public.attachments       FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_comments          AFTER INSERT OR UPDATE OR DELETE ON public.comments          FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_companies         AFTER INSERT OR UPDATE OR DELETE ON public.companies         FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_health_entries    AFTER INSERT OR UPDATE OR DELETE ON public.health_entries    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_raid_items        AFTER INSERT OR UPDATE OR DELETE ON public.raid_items        FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_synergies         AFTER INSERT OR UPDATE OR DELETE ON public.synergies         FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_task_dependencies AFTER INSERT OR UPDATE OR DELETE ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_tasks             AFTER INSERT OR UPDATE OR DELETE ON public.tasks             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_template_tasks    AFTER INSERT OR UPDATE OR DELETE ON public.template_tasks    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Cria perfil automaticamente quando um novo usuario se cadastra
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= RLS (Row Level Security) =============

ALTER TABLE public.companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raid_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synergies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "auth read profiles"    ON public.profiles FOR SELECT TO public         USING (auth.role() = 'authenticated'::text);
CREATE POLICY "self read profile"     ON public.profiles FOR SELECT TO public         USING (auth.uid() = id);
CREATE POLICY "admin write profile"   ON public.profiles FOR UPDATE TO authenticated  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin insert profile"  ON public.profiles FOR INSERT TO authenticated  WITH CHECK (is_admin());
CREATE POLICY "admin delete profile"  ON public.profiles FOR DELETE TO authenticated  USING (is_admin());

-- companies
CREATE POLICY "auth read companies"   ON public.companies FOR SELECT TO public  USING (auth.role() = 'authenticated'::text);
CREATE POLICY "owner write companies" ON public.companies FOR ALL    TO public  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin'::text,'owner'::text])));

-- template_tasks
CREATE POLICY "auth read template"    ON public.template_tasks FOR SELECT TO public  USING (auth.role() = 'authenticated'::text);
CREATE POLICY "owner write template"  ON public.template_tasks FOR ALL    TO public  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin'::text,'owner'::text])));

-- tasks
CREATE POLICY "auth read tasks"       ON public.tasks FOR SELECT TO public  USING (auth.role() = 'authenticated'::text);
CREATE POLICY "owner write tasks"     ON public.tasks FOR ALL    TO public  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin'::text,'owner'::text])));

-- raid_items
CREATE POLICY "auth read raid"        ON public.raid_items FOR SELECT TO public  USING (auth.role() = 'authenticated'::text);
CREATE POLICY "owner write raid"      ON public.raid_items FOR ALL    TO public  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin'::text,'owner'::text])));

-- synergies
CREATE POLICY "auth read syn"         ON public.synergies FOR SELECT TO public  USING (auth.role() = 'authenticated'::text);
CREATE POLICY "owner write syn"       ON public.synergies FOR ALL    TO public  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin'::text,'owner'::text])));

-- health_entries
CREATE POLICY "auth read health"      ON public.health_entries FOR SELECT TO public  USING (auth.role() = 'authenticated'::text);
CREATE POLICY "owner write health"    ON public.health_entries FOR ALL    TO public  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin'::text,'owner'::text])));

-- attachments
CREATE POLICY "attachments read all auth" ON public.attachments FOR SELECT TO authenticated  USING (true);
CREATE POLICY "attachments insert auth"   ON public.attachments FOR INSERT TO authenticated  WITH CHECK ((uploader_id = auth.uid()) OR (auth.uid() IS NOT NULL));
CREATE POLICY "attachments delete own"    ON public.attachments FOR DELETE TO authenticated  USING ((uploader_id = auth.uid()) OR is_admin());

-- comments
CREATE POLICY "comments read all auth"    ON public.comments FOR SELECT TO authenticated  USING (true);
CREATE POLICY "comments insert auth"      ON public.comments FOR INSERT TO authenticated  WITH CHECK ((author_id = auth.uid()) OR (auth.uid() IS NOT NULL));
CREATE POLICY "comments update own"       ON public.comments FOR UPDATE TO authenticated  USING ((author_id = auth.uid()) OR is_admin()) WITH CHECK (true);
CREATE POLICY "comments delete own"       ON public.comments FOR DELETE TO authenticated  USING ((author_id = auth.uid()) OR is_admin());

-- task_dependencies
CREATE POLICY "task_deps read all auth"   ON public.task_dependencies FOR SELECT TO authenticated  USING (true);
CREATE POLICY "task_deps write edit"      ON public.task_dependencies FOR ALL    TO authenticated  USING (true) WITH CHECK (true);

-- audit_log
CREATE POLICY "audit read all auth"       ON public.audit_log FOR SELECT TO authenticated  USING (true);
CREATE POLICY "audit insert auth"         ON public.audit_log FOR INSERT TO authenticated  WITH CHECK (true);

-- =====================================================================
-- FIM DA MIGRAÇÃO. Roda agora `select count(*) from companies;` (deve dar 0).
-- =====================================================================
