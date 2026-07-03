# Redesign — PULSAR CENTRAL OPERACIONAL (Etapa 1.5)

Migração visual pura (nenhuma funcionalidade alterada) para o sistema de temas
claro/escuro com tokens únicos.

## Sistema de temas

- **Arquivo único de tema**: [`central/tema.css`](../central/tema.css) — todos os
  tokens dos dois temas (`:root` = claro padrão, `[data-theme="dark"]` = escuro)
  + componentes base (pill de status, badge de variação de KPI, toggle, fontes).
- **Regra absoluta cumprida**: nenhum componente usa hex direto. `index.html`,
  `central/central.css` e os estilos inline do `central/central.js` consomem só
  CSS variables (verificado por grep — restam apenas o favicon data-URI e os
  tokens do próprio tema).
- **Toggle**: botão sol/lua no rodapé da sidebar; preferência em
  `localStorage("pulsar_tema")`; script no `<head>` aplica o tema antes da
  primeira pintura (sem flash). No escuro, a logo em arquivo (preta) é trocada
  pelo wordmark do fallback (marca em accent + texto claro).

## Tokens principais

| Token | Claro | Escuro |
|---|---|---|
| `--bg` | `#F6F8FA` | `#0B0C0E` |
| `--surface` | `#FFFFFF` | `#15171A` |
| `--surface-2` | `#F0F3F6` | `#1D2024` |
| `--border` | `#E4E8EC` | `#26292E` |
| `--text` / `--text-2` | `#16181B` / `#6B7178` | `#F2F4F6` / `#9BA1A8` |
| `--accent` | `#29ABE2` (único protagonista) | idem |
| `--positive` | `#1F9D68` | `#43D69A` |
| `--negative` | `#D9435C` | `#FF7186` |
| `--warning` | `#A87A16` | `#F5C244` |
| Sombra | `0 1px 3px rgba(16,24,40,.06)` | nenhuma (elevação por borda/superfície) |

Semânticas ajustadas por tema para contraste AA sobre o fundo correspondente.

Tipografia: títulos e números de KPI em **Codec Pro** (fallback Space Grotesk),
corpo em **Inter**. KPIs 30px/700. Raio: 16px cards, 10px botões, 999px pills.

## Componentes padronizados

1. **Card de KPI**: número grande + label + badge de variação em pill
   (`.ct-var.boa/.ruim/.neutra`), estilo "128 ↑12%".
2. **Pill de status** (`.ct-badge`): Ativo=positive, Pausado/Pendente=warning,
   Erro/Alerta=negative, Conectado=accent, Em breve/Exemplo=neutro.
3. **Tabelas**: hover em `--surface-2`, números à direita, drill-down preservado
   (linhas de conjunto/anúncio em superfícies aninhadas).
4. **Gráficos**: classes base definidas no tema (`.ct-grafico-*`, gradiente do
   accent) para quando os gráficos entrarem — hoje não há gráfico nas telas.
5. **Sidebar**: barra ativa 3px em accent, seções em caps pequenas, toggle no
   rodapé. **Colapsa para ícones entre 861–1100px**; vira drawer abaixo de 860px.
6. **Tabelas no mobile** (≤860px): viram cards empilhados com rótulo de coluna
   (`data-th` aplicado automaticamente pelo `central.js`).

## Antes / Depois

Screenshots em [`docs/redesign/`](./redesign):

| Tela | Antes (claro antigo) | Depois claro | Depois escuro |
|---|---|---|---|
| Dashboard | ![antes](redesign/antes-claro-dashboard.png) | ![claro](redesign/depois-claro-dashboard.png) | ![escuro](redesign/depois-escuro-dashboard.png) |
| Clientes | ![antes](redesign/antes-claro-clientes.png) | ![claro](redesign/depois-claro-clientes.png) | ![escuro](redesign/depois-escuro-clientes.png) |
| Gestor (cliente) | ![antes](redesign/antes-claro-gestor-cliente.png) | ![claro](redesign/depois-claro-gestor-cliente.png) | ![escuro](redesign/depois-escuro-gestor-cliente.png) |
| Radar (Concorrentes) | ![antes](redesign/antes-claro-radar-concorrentes.png) | ![claro](redesign/depois-claro-radar-concorrentes.png) | ![escuro](redesign/depois-escuro-radar-concorrentes.png) |

As telas de Relatórios (Etapa 3) vivem dentro da página do cliente do Gestor e
foram migradas junto (aviso de exemplo, preview WhatsApp, link público e
histórico usam os mesmos tokens).

## Verificação

Checagem automatizada (Playwright): troca de tema aplica `--bg` correto nos dois
temas, preferência persiste após reload, zero erros de console navegando por
todas as áreas nos dois temas, sidebar 72px em 1000px de largura e tabela
empilhada com `data-th` em 480px.
