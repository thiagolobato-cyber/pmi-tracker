# BHub PMI — Acompanhamento de Integração (POC)

Sisteminha web **single-file** que reproduz o modelo da planilha `Modelo_Ouro_Integracao`
em uma interface online, hospedável estaticamente (Vercel / Netlify / S3 / GitHub Pages)
ou incorporável via `<iframe>` em outras ferramentas BHub.

## Como rodar localmente

1. Dê duplo clique em `index.html` (abre direto no navegador, sem servidor).
2. Login inicial: **admin / admin** — troque a senha em `Usuários` no primeiro acesso.
3. No Dashboard clique em **📥 Importar xlsx** e selecione
   `Modelo_Ouro_Integracao_14_05_26_GoogleDocs.xlsx` para carregar os dados existentes.
4. Use **📤 Exportar xlsx** a qualquer momento para baixar uma planilha consolidada.

> Os dados ficam em `localStorage` no navegador (cada usuário tem sua base).
> Para banco compartilhado, migrar para Supabase/Postgres é o próximo passo natural.

## Como publicar (GitHub + Vercel)

1. **Crie um repositório no GitHub** (privado): `bhub/pmi-tracker` (ou nome preferido).
2. Dentro desta pasta, rode no terminal:
   ```bash
   git init
   git add .
   git commit -m "feat: POC BHub PMI tracker"
   git branch -M main
   git remote add origin https://github.com/<org>/<repo>.git
   git push -u origin main
   ```
3. **Convide colaboradores**: GitHub → repo → *Settings* → *Collaborators* → *Add people*.
4. **Conecte à Vercel**:
   - https://vercel.com → *Add New Project* → *Import Git Repository* → selecione o repo.
   - *Framework Preset*: **Other** (é estático puro).
   - Clique *Deploy*. Em ~30s você terá a URL pública.
5. Cada `git push` na branch `main` faz redeploy automático.
6. Pull Requests viram **deploys de preview** com URL própria para revisão antes do merge.

### Fluxo de colaboração

- `main` = produção (URL principal da Vercel).
- Cada melhoria nasce numa branch: `git checkout -b feature/nova-coluna`.
- Push → abre **Pull Request** no GitHub → Vercel gera URL de preview automaticamente.
- Após review e aprovação, merge na `main` → deploy de produção.

## Funcionalidades atuais

- **Login com perfis**: `admin` (tudo), `owner` (edita), `leitor` (somente leitura).
- **Empresas / Deals**: CRUD de empresas (nome + data de assinatura) com KPIs por deal.
- **Detalhe do Deal**: tabela de tarefas agrupada por área, com status calculado
  automaticamente em dias úteis (Done / On track / Atrasado), datas previstas,
  % completado, bloqueios, próximo passo, evidências, etc. Edição em modal.
- **Template**: editor das tarefas-padrão. "Criar a partir do Template" instancia
  as tarefas para um novo deal.
- **Dashboard**: KPIs do portfólio, vencimentos em ≤10 d.u., bloqueios ativos,
  heatmap área × deal, dedo-duro (maiores atrasos) e barra de % por deal.
- **Visão Executiva**: matriz tarefa × deal por área (reuniões executivas).
- **Import xlsx**: importa a planilha existente (empresas, template e tarefas).
- **Export xlsx**: gera um xlsx com aba por deal + Empresas + Template.

## Lógica de status

- 🟢 **Done**: `DATA REAL DE CONCLUSÃO` preenchida.
- 🔵 **On track**: ainda não concluída e `hoje ≤ DATA PREVISTA`.
- 🔴 **Atrasado**: ainda não concluída e `hoje > DATA PREVISTA`.

`DATA PREVISTA = DATA DE ASSINATURA + PRAZO (em dias úteis, Seg–Sex)`.
A POC **não considera feriados nacionais**; plugar um calendário (ex.: Brasil) é trivial.

## Estrutura

```
bhub-pmi/
├── index.html        # aplicação inteira (HTML + JS + CSS via CDN)
├── vercel.json       # config de deploy (headers de segurança, cleanUrls)
├── .gitignore
└── README.md
```

## Próximos passos sugeridos

- **Backend compartilhado** (Supabase recomendado): substituir `localStorage` por API real.
- **SSO BHub** (Google Workspace / Okta) no lugar do login local.
- **Notificações** por e-mail/Slack ao se aproximar do vencimento.
- **Histórico** de updates por tarefa (timeline) e comentários.
- **Feriados brasileiros** no cálculo de dias úteis.
- **Integração** com PBI / Sheets para evidências automáticas.
