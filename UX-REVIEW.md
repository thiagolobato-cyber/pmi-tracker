# PMI Tracker — UX Review

> Revisão crítica e propositiva. Baseada em navegação real + leitura do código + princípios de produtos referência (Linear, Stripe, Notion, Airtable, Asana).
>
> Estrutura: princípios → top 10 problemas → auditoria por tela → plano de ação priorizado → roadmap longo prazo.

---

## 1. Princípios norteadores (proposta)

Antes das melhorias pontuais, alinhamento de filosofia. Toda mudança deve passar por esses filtros:

1. **Clareza acima de cleverness.** Cada elemento tem propósito óbvio. Se precisa de tooltip pra entender, repensa.
2. **Ação sobre status.** Não basta mostrar "3.960 atrasadas". Tem que sugerir "Comece pelas top 5 críticas →".
3. **Hierarquia visual sincera.** O que mais importa fica maior, mais cedo, mais à esquerda. KPIs não são todos iguais.
4. **Densidade calibrada.** Ar onde a decisão é difícil. Densidade onde o usuário escaneia rapidamente.
5. **Persistência > efêmero.** Filtros, ordenações, views salvas devem sobreviver entre sessões.
6. **Confiança operacional.** Toda ação destrutiva confirma. Todo erro tem mensagem acionável. Todo loading tem feedback.
7. **Acessibilidade não é opcional.** Cor não pode ser o único sinal. Foco é visível. Contraste WCAG AA.
8. **Mobile como cidadão de primeira classe.** Mesmo se o uso primário for desktop, responsivo abre portas (reuniões, reviews em campo).

---

## 2. Top 10 problemas com maior impacto

Listados em ordem de prioridade. São os que mais doem hoje ou bloqueiam crescimento.

### #1 — "% Integração Média" é enganoso
Hoje calcula **média simples entre deals**. Um deal recém-assinado com 5 tarefas pesa igual a um deal de 220 tarefas em curso. Resultado: número não reflete realidade do portfólio.

**Solução:** mudar pra **média ponderada por número de tarefas** (`sum(done) / sum(total) × 100`). Adicionar tooltip explicando o método.

---

### #2 — Não é possível gerenciar usuários pelo app
Hoje pra adicionar um usuário ou mudar role, admin precisa ir no painel do Supabase. Pra um sistema de gestão BHub, isso é grave. Quando a equipe crescer (Operações, PMI, Diretores), você vira gargalo.

**Solução:** página Usuários com:
- Botão "Convidar usuário" → email + role → enviar magic link
- Dropdown de role em cada linha (editável inline pra admin)
- Botão "Remover" com confirmação
- Coluna "Último acesso"

---

### #3 — Sino de notificação mostra alerta sem ter sistema de notificação
O `🔴 dot` no sino sinaliza "tem notificações novas", mas clicar não faz nada. **Falso positivo de UX é pior que ausência.**

**Solução:** ou remover o sino, ou implementar de verdade (lista de eventos do `audit_log` filtrada pra "menções a mim" + "tarefas atribuídas a mim que venceram"). Recomendo **implementar** porque é alto valor.

---

### #4 — Dashboard tem 8 KPIs iguais — sem hierarquia
Todos os 8 cards têm o mesmo tamanho, mesma importância visual. Mas "Deals ativos: 18" é informação **contextual**; "Atrasadas: 3.960" é **crítica** e deveria gritar.

**Solução:** estrutura hero:
- **Linha 1 (3 KPIs grandes):** % Integração Média (hero) | Atrasadas | RAID abertos
- **Linha 2 (4 KPIs pequenos):** Deals | Done/Total | On Track | Bloqueios

Hero card 2x maior, com cor de fundo distinta e texto auxiliar (ex: "↓ 2% vs. semana passada" quando tivermos histórico).

---

### #5 — Tarefas: tabela de 14 colunas é cognitivamente impossível
A tabela de tarefas dentro do deal tem 14 colunas (REF, TAREFA, FASE, STATUS, OWNER, FERRAMENTA, PRAZO, PREVISTA, REAL, %, ATRASO, ÚLT.UPD, PRÓX.PASSO, BLOQ.). O usuário rola horizontal pra ver tudo. Impossível escanear ou comparar.

**Solução:** 
- Linha visível padrão: REF, Tarefa, Status, Owner, Prazo (vencimento), % (com barra visual). **5-6 colunas.**
- Resto: click na linha expande pra mostrar os detalhes (timeline/inspector lateral à la Linear)
- Botão "Colunas" pra customizar quais aparecem
- Salva preferência no localStorage

---

### #6 — Heatmap de área truncates nomes longos e cabeçalhos verticais ficam ilegíveis
Com 18 deals + áreas como "System Integration / TI / Digital Workplace" + "Treinamentos para colaboradores", o heatmap fica ilegível.

**Solução:**
- Encurtar nomes na exibição (sigla ou primeiras 2 palavras) com tooltip pra completo
- Cabeçalho de coluna em **diagonal 45°** (padrão dataviz pra labels longos)
- Versão "compacta" e "expandida" do heatmap

---

### #7 — Dois cliques diferentes na mesma linha fazem coisas diferentes (Empresas)
Em `Empresas / Deals`, clicar no **nome** abre **resumo executivo (popup)**. Clicar em **"Abrir →"** entra no **detalhe completo**. Usuários vão errar.

**Solução:**
- Click no nome → entra no detalhe completo (comportamento esperado)
- Ícone discreto "👁" pra pré-visualizar (popup)
- Linha inteira clicável, com hover destacado

---

### #8 — Sub-tabs do deal usam emojis (📋 📊 🛡️ 💰 🚦 📜 📑) — inconsistente com sidebar nova
A sidebar agora usa SVGs limpos e profissionais. As sub-tabs ainda usam emojis cores de WhatsApp. Quebra a coerência visual.

**Solução:** trocar emojis por SVGs (mesma família visual da sidebar) ou texto puro.

---

### #9 — RAG (Red/Amber/Green) usa só cor — falha em acessibilidade
~8% dos homens têm algum grau de daltonismo. A matriz RAG mostra dots coloridos sem letras de apoio. Workstreams aparecem como bolinhas indistinguíveis.

**Solução:** combinar **cor + ícone + texto**:
- 🟢 Verde → ✓ + "OK"
- 🟡 Amarelo → ⚠ + "Atenção"
- 🔴 Vermelho → ✕ + "Risco"

E aumentar contraste; algumas combinações atuais (texto cinza claro em fundo bege) reprovam no WCAG AA.

---

### #10 — Não há "What should I do today?"
O site mostra **status** mas não orienta **ação**. Um diretor abre o Dashboard e vê "3960 atrasadas". E daí? Por onde começar?

**Solução:** uma seção (acima do dashboard ou na home pra usuários não-admin) com:
- **Minhas tarefas críticas** (atrasadas + owner = eu)
- **Decisões pendentes** (RAID type=decision aguardando minha aprovação)
- **Próximos a vencer** (≤5 d.u.)

Inspirado no "Inbox" do Linear ou "Today" do Things.

---

## 3. Auditoria detalhada por tela

### 3.1 Login

**Funcionando bem:**
- Card centralizado com gradient navy bonito
- Branding claro
- Banner amigável pra OTP expirado (já implementado)

**Problemas:**
- ❌ Não tem **"Esqueci minha senha"** — usuário que esquece fica trancado
- ❌ Subtítulo "Acessos são gerenciados pelo admin no Supabase" **vaza tecnologia interna** — clientes/leitores não precisam saber que rodam Supabase
- ❌ Não tem **toggle "Mostrar senha"** (eye icon) — friction em mobile
- ⚠️ Logo é raster (.png), poderia ser SVG pra crispness em retina

**Sugestões concretas:**
- Adicionar link discreto abaixo do botão Entrar: "Esqueci minha senha"
- Trocar subtítulo por "Entre com sua conta BHub"
- Adicionar 👁 toggle no input de senha
- Migrar `bhub-logo.png` pra SVG inline

### 3.2 Sidebar

**Funcionando bem:**
- Visual moderno, dark
- Ícones SVG consistentes
- Item ativo destacado
- Avatar+nome no rodapé

**Problemas:**
- ⚠️ "Empresas / Deals" — barra confusa; em inglês deal = transação. Deve ser só **"Deals"** ou **"Empresas"**, não os dois
- ⚠️ Avatar no rodapé é só iniciais — sem foto, sem menu (não dá pra acessar Configurações, Trocar Tema, etc.)
- ⚠️ Não tem **agrupamento/labels** ("PORTFÓLIO", "ADMIN") — quando crescer pra 8-10 itens vira pilha
- ❌ Sem **atalhos de teclado** visíveis (Linear mostra "G then D" pra navegar)
- ❌ Não dá pra **colapsar** (importante em telas menores)

**Sugestões:**
- Avatar rodapé vira menu (Settings, Tema, Logout). Move logout do topbar pra lá.
- Adicionar grupos: PORTFÓLIO (Dashboard, Visão Exec, Deals), CONFIGURAÇÕES (Template, Usuários)
- Atalho "[" / "]" pra colapsar sidebar (Linear pattern)

### 3.3 Topbar

**Funcionando bem:**
- Limpo, branco
- Search + bell + perfil

**Problemas:**
- ❌ **Sino com bolinha vermelha sem sistema de notificação real** (já listado #3)
- ⚠️ **Search só busca empresas** mas placeholder promete "empresas, deals, usuários" (mentira do placeholder)
- ❌ Sem **Cmd+K** (atalho global de busca — padrão de mercado)
- ⚠️ Role pill sempre **roxa** — perde a oportunidade de diferenciar visualmente admin vs owner vs leitor

**Sugestões:**
- Cmd+K abre modal de busca global (empresas + tarefas + RAID + sinergias + usuários)
- Role admin = vermelho; owner = azul; leitor = cinza
- Bell: ou implementa notificações de verdade, ou remove

### 3.4 Dashboard

**Funcionando bem:**
- 7 KPIs com ícones coloridos discretos
- Filtros Empresa/Área/Responsável
- Empty states bonitos
- Burndown e Sinergia consolidada lado a lado
- Heatmap área × deal

**Problemas:**
- ❌ **Hierarquia uniforme** dos KPIs (#4)
- ❌ **% Médio** é avg não-ponderada (#1)
- ❌ **Sem "what to do next"** (#10)
- ⚠️ **Filtros sem chips** mostrando seleção atual — multi-select é cego visualmente
- ⚠️ **Burndown plano** (real = ideal não-cumprido) confunde — quando todo mundo tá 0%, gráfico não comunica nada útil
- ⚠️ **Heatmap RAG** sem letras (#9)
- ❌ **Bloqueios/Vencimentos** quando preenchidos viram tabelas de 5+ colunas — mesma armadilha das tarefas
- ⚠️ **Comparar Deals** existe mas é meio escondido — devia ser proeminente
- ⚠️ Não tem **export** do dashboard pra PDF/PNG (relatório executivo)

**Sugestões:**
- Reestruturar grid: Hero metric (1 grande) + 4 KPIs secundários + alertas
- Chips de filtros ativos abaixo da barra: `[Empresa: Agrocontar ✕] [Status: Atrasadas ✕]`
- Botão "Comparar Deals" mais visível, vira `Comparar (3)` quando há seleção
- "Exportar relatório executivo" — gera PDF da visão atual do dashboard

### 3.5 Visão Executiva

**Funcionando bem:**
- Foco em uma área por vez
- Sticky header
- Cell colorido por status

**Problemas:**
- ❌ **Uma área por vez** é decisão de produto questionável. Em reuniões executivas, você quer ver várias áreas. Solução: collapsible sections por área.
- ❌ **Não tem export** — visão clássica de prestação de contas e ninguém vai abrir notebook em reunião
- ⚠️ Tarefas com nome longo quebram linha — tabela vira parede
- ⚠️ Não dá pra **filtrar por status** ("só atrasadas")

**Sugestões:**
- Mostrar todas as áreas (collapsible/expandidas configurável)
- Filtros: por status, por owner, por fase
- Export PDF com cabeçalho BHub
- Modo "apresentação" (fullscreen, fonte maior, ideal pra projetor)

### 3.6 Empresas / Deals (lista)

**Funcionando bem:**
- Tabela simples
- "+ Nova empresa"

**Problemas:**
- ❌ **Dois cliques diferentes na linha** (#7)
- ⚠️ Sem **ordenação** (sempre alfabético)
- ⚠️ Sem **filtro/search** local
- ⚠️ Sem **progress bar visual** na coluna %
- ⚠️ Sem **status do deal** como um todo (ainda em D+30? Pré-close?)
- ⚠️ Tabela é a única visualização — sem **card view** alternativo

**Sugestões:**
- Click na linha inteira entra no detalhe (botão "Abrir →" vira ícone discreto à direita)
- Toggle Visualização: Tabela | Cards | Kanban (por fase)
- Coluna % vira barra
- Adicionar coluna FASE atual (D+30, D+100, etc.)
- Sort por qualquer coluna ao clicar no header

### 3.7 Detalhe do Deal

**Funcionando bem:**
- Breadcrumb back
- Deal switcher dropdown
- 6 mini-stats no topo
- 7 sub-tabs organizadas

**Problemas:**
- ❌ **6 mini-stats redundantes** com KPIs do Dashboard — info repetida
- ❌ **Sub-tabs com emojis** (#8)
- ❌ **Tabela tarefas de 14 colunas** (#5)
- ⚠️ **Editar tarefa = modal grande** — perde contexto
- ⚠️ **Sem inline-edit** — toda mudança de status/owner abre modal
- ⚠️ **Sem bulk operations** — selecionar 10 tarefas pra mudar owner em massa
- ⚠️ **Sub-tab Gantt** existe mas não vi: pode estar limitado
- ⚠️ **Briefing** soa importante mas tá escondido na última sub-tab — devia ser destaque

**Sugestões:**
- Inspector lateral (à la Linear): clica na linha, abre painel direito com todos os campos editáveis inline
- Bulk select: checkbox por linha + barra de ação no rodapé ("3 selecionadas → Marcar done | Atribuir | Mudar prazo")
- Reduzir mini-stats: 3 max (Progresso | Atrasadas | RAID abertos). Resto vira sub-tabs.
- Sub-tab "Briefing" promovida pra botão "Gerar Briefing" no topo

### 3.8 Template

**Funcionando bem:**
- Agrupado por área
- Edit per row

**Problemas:**
- ⚠️ **Limpar template** é destrutivo demais sem revisão
- ❌ **Sem reordenar** (drag-and-drop)
- ❌ **Sem importação direta de planilha aqui** (só via dashboard)
- ❌ **Sem preview** de como o template instancia em um deal (timeline calculada)
- ⚠️ **Edit = modal** (mesmo problema)

**Sugestões:**
- Drag-handle (≡) por linha pra reordenar
- "Importar planilha de template" botão local
- Painel lateral "Preview: se eu criasse um deal HOJE, as tarefas cairiam em..."
- Versionamento: snapshots do template ao longo do tempo

### 3.9 Usuários

**Problemas (todos críticos):**
- ❌ **Não dá pra adicionar usuário pela UI** (#2)
- ❌ **Não dá pra mudar role** (#2)
- ❌ **Não dá pra remover usuário** (#2)
- ⚠️ Cor das pills inconsistente com semântica de outros lugares
- ⚠️ Seção "Admin — Migração de dados" é leftover da migração — pode sair

**Sugestões:** (todas no #2 acima)

### 3.10 Empty states (geral)

**Funcionando bem (Dashboard):**
- "Nenhum risco aberto" centralizado com ícone

**Problemas em outras telas:**
- Empresas: texto seco "Nenhuma empresa cadastrada"
- Template: texto seco "Template vazio"
- Usuários: texto seco
- Tarefas (deal sem tarefas): texto seco em card

**Sugestões:**
- Mesmo padrão visual do Dashboard pra TODOS os empty states (ícone em círculo + título + CTA)
- CTA no empty state: ação que sai do estado vazio
  - Empresas vazias → "+ Adicionar primeira empresa" + "📥 Importar planilha"
  - Template vazio → "Começar do zero" + "Importar template padrão BHub"

### 3.11 Modais

**Problema sistêmico:**
- Praticamente toda edição abre modal centralizado
- Modal corta o contexto (você não vê o resto da tela)
- Cada modal tem layout próprio (alguns max-w-md, outros max-w-2xl)
- Form labels inconsistentes (alguns "text-xs", outros "text-sm")

**Sugestões:**
- Migrar gradualmente pra **side-panel pattern** (slides from right) — mantém contexto
- Padronizar form components: label + input + helper-text + error com mesmo CSS
- Modal só pra confirmações destrutivas

---

## 4. Plano de ação recomendado

Priorizei por **valor × esforço**. Faz tudo numa hora, mas comece pelos primeiros.

### Quick wins (cada um 30min-2h)

| # | Mudança | Impacto |
|---|---|---|
| 1 | **% Integração Média ponderada** + tooltip | ⭐⭐⭐⭐⭐ |
| 2 | **Sino bell**: remover ou implementar (P1: remover) | ⭐⭐⭐⭐ |
| 3 | **Sub-tabs do deal**: trocar emojis por SVGs | ⭐⭐⭐ |
| 4 | **Login**: remover menção a "Supabase" no subtítulo | ⭐⭐ |
| 5 | **Login**: adicionar "Esqueci minha senha" | ⭐⭐⭐⭐ |
| 6 | **Empresas**: clique na linha inteira abre detalhe | ⭐⭐⭐⭐ |
| 7 | **Empty states**: padronizar (Empresas, Template, Usuários) | ⭐⭐⭐ |
| 8 | **Role pills**: cor por tipo (admin=vermelho, owner=azul, leitor=cinza) | ⭐⭐ |
| 9 | **RAG cells**: adicionar letras G/A/R como já está + ícone ✓⚠✕ | ⭐⭐⭐ |
| 10 | **Heatmap**: nomes de área diagonais ou abreviados com tooltip | ⭐⭐⭐ |

### Médias (1-2 dias cada)

| # | Mudança | Impacto |
|---|---|---|
| 11 | **Dashboard hero**: 1 KPI grande + 4 pequenos + linha de alertas | ⭐⭐⭐⭐⭐ |
| 12 | **Página Usuários completa**: convidar + mudar role + remover | ⭐⭐⭐⭐⭐ |
| 13 | **Cmd+K global search** (companies, tarefas, RAID, sinergias) | ⭐⭐⭐⭐ |
| 14 | **Chips de filtros ativos** no Dashboard | ⭐⭐⭐ |
| 15 | **Sort/filter** na lista de Empresas | ⭐⭐⭐ |
| 16 | **Progress bar visual** na coluna % de Empresas | ⭐⭐ |
| 17 | **Sidebar**: agrupamento (PORTFÓLIO / CONFIGURAÇÕES) + colapsar | ⭐⭐⭐ |
| 18 | **Visão Executiva**: todas as áreas em sections collapsibles + filtros | ⭐⭐⭐⭐ |

### Big bets (1 semana+)

| # | Mudança | Impacto |
|---|---|---|
| 19 | **"What should I do today?"**: home section por usuário | ⭐⭐⭐⭐⭐ |
| 20 | **Inspector lateral** pra editar tarefas (substitui modal) | ⭐⭐⭐⭐⭐ |
| 21 | **Tabela tarefas configurável** (colunas customizáveis + expandir linha) | ⭐⭐⭐⭐ |
| 22 | **Bulk operations** em tarefas (multi-select) | ⭐⭐⭐⭐ |
| 23 | **Sistema de notificações** real (lista + filtro por mim) | ⭐⭐⭐⭐ |
| 24 | **Saved views/favorites** no Dashboard | ⭐⭐⭐ |
| 25 | **Histórico/Audit log** visível por entidade | ⭐⭐⭐ |
| 26 | **Export PDF** de Dashboard e Visão Executiva | ⭐⭐⭐ |
| 27 | **Modo "apresentação"** (fullscreen, fontes maiores) | ⭐⭐ |
| 28 | **Mobile responsivo** decente (drawer, table cards) | ⭐⭐⭐ |

---

## 5. Recomendação de "first slice"

Se você tivesse 1 dia pra fazer só uma coisa: **#1 (% Integração Média ponderada)**.

Se tivesse 1 semana: **#1, #4 (Dashboard hero), #6 (Empresas: click linha), #7 (empty states), #9 (RAG), #12 (Usuários completo)**.

Se tivesse 1 mês: a lista de Quick wins + Médias toda. Big bets ficam pra ciclo seguinte.

---

## 6. Roadmap longo prazo (visão)

**Trimestre 1** — Fundação UX (Quick wins + Médias). Site fica "profissional".

**Trimestre 2** — Diferenciação (Big bets #19-22). Site fica "delicioso de usar".

**Trimestre 3** — Plataforma. Integrações (Google Calendar pra deadlines, Slack pra notificações, e-mail pra digests). API pública.

**Trimestre 4** — IA. "Resumo automático do deal", "Quais RAIDs eu deveria priorizar?", "Quais sinergias estão em risco?". Anthropic/OpenAI sumarização do estado atual.

---

## 7. Decisões que esse review NÃO resolve (precisam de conversa com você)

1. **% deve excluir "empty" status (sem prazo) do cálculo de médio?** Hoje conta como pendente.
2. **Sinergia consolidada deveria considerar apenas deals ativos** ou histórico completo?
3. **Fluxo de criação de tarefas livre vs sempre via template** — hoje permite ambos. Política?
4. **Quem pode ver o quê?** Hoje todos autenticados veem tudo. Faz sentido um diretor de área só ver os deals dele?
5. **Onboarding de empresa nova**: ativar template automaticamente OU sempre perguntar?

---

## 8. Princípios de implementação (pra qualquer mudança)

1. Não quebre o que já funciona — mudanças visuais devem ser **aditivas**, não substitutivas (até validar)
2. Toda mudança grande tem **rollback fácil** (feature flag ou config)
3. **Mobile first** mesmo em desktop-app — força clareza
4. Use Tailwind/CSS variables já existentes; evite estilo inline
5. Acessibilidade desde o início: alt em ícone, label em input, contraste 4.5:1
6. **Não adicione library nova sem necessidade real** — projeto é single-file por filosofia, mantenha
7. Componentize **devagar**: extrair função/template helper só quando 3+ usos
8. Toda interação destrutiva tem **undo ou confirmação dupla**

---

Fim do documento.

> Última atualização: 21 de maio de 2026
> Próxima revisão sugerida: após implementar Quick wins
