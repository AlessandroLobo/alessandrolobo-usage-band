# CLAUDE.md — usage-band

Contexto do projeto para sessões futuras do Claude Code. Responda e documente em **português (pt-BR)**.

## O que é

Plugin ("mod") do **Claude Code Desktop e terminal** que desenha uma barra acima do prompt com o uso da sessão e, com `/uso painel`, um painel com barras de progresso. Repositório e marketplace: `AlessandroLobo/alessandrolobo-usage-band`, marketplace `eficaz-mods`, plugin `usage-band@eficaz-mods`. Projeto irmão para VS Code/Antigravity: `claude-usage-statusbar` (extensão).

**Por que existem os dois:** a extensão do Claude Code para o editor não desenha UI de plugins (`ui_render`/`AbovePrompt`); o plugin só aparece no Desktop e no terminal. No editor, a extensão faz o papel dele.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifesto (`version` sobe a cada release). |
| `.claude-plugin/marketplace.json` | Marketplace `eficaz-mods` apontando para a raiz do repositório. |
| `hooks/hooks.json` → `hooks/register.tsx` | Módulo do plugin: barra (`ui.render` `AbovePrompt`), painel (`ui.render` `Pane`, id `usage-band.painel`), comando `/uso [painel]`, aviso a 90%. |
| `types/index.d.ts` | Contrato do estado (`PluginState['usage-band']`: `snapshot`, `lastTurnMs`, `isHidden`) e tipos `UsageSnapshot`/`UsageLimit` (com `resetsAt` em ms). |
| `tests/band.test.tsx` | Testes da barra e do painel em `terminal` e `desktop` (`claude plugin test .`). |
| `docs/barra-desktop-0.2.png` | Captura real usada no README. |

## Como funciona

- Dados **ao vivo do próprio Claude Code**: `$.session.usage()` no `session.start` e o evento `session.measure` a cada resposta (`context`, `rateLimits` com `percentUsed`/`resetsAt`, `cost.usd`). Sem rede, sem token, sem arquivos.
- Duração do turno: `prompt.submit` → `turn.complete` com `$.clock.now()`.
- Barra: segmentos `Text` separados por `·` esmaecidos; cada limite com cor própria e `↻` + tempo até reiniciar.
- Cores: mesmo degradê por uso da extensão do VS Code (`usageColor`): limites 5h/7d com base verde `#89d185` até 50%, âmbar `#e5a50a` em 75% e vermelho `#f14c4c` a partir de 90%; contexto sem cor até 75% (barra do painel verde `#89d185` com o mesmo degradê). Mudou lá, mude aqui.
- Painel: barras de texto `█`/`░` com largura `min(40, bodyColumns − 2)`; `/uso painel` informa quando a tela não comporta painel (`isPlaced` falso).

## Onde mostrar

`userConfig.showAbovePrompt` (boolean, padrão `true`) desliga só a barra do `AbovePrompt`; o painel e o `/uso painel` seguem. Lido em `register(on, options)`; mudar no menu de configuração recarrega o módulo. A extensão `claude-usage-statusbar` tem o equivalente `claudeUsageBar.showStatusBar`. Teste: `{ options: { showAbovePrompt: false } }` em `tests/band.test.tsx`.

## Verificar

```
claude plugin validate .
claude plugin test .
```

Checagem de tipos: tsconfig fora da pasta do plugin, com `files` apontando para o `claude-code.d.ts` da versão instalada do Claude Code (o skill `plugin-authoring` diz onde fica) e `include` de `hooks`, `types`, `tests`; opções do cabeçalho daquele arquivo (`jsx: react`, `jsxFactory: h`, `strict`, `noUncheckedIndexedAccess`, `lib: es2023`). Rodar com `npx -p typescript tsc -p <tsconfig>`. Filhos de JSX montados em array devem ser `RenderChildren[]`.

O aviso `gating hook without .catch: prompt.submit` do `validate` é informativo, não erro.

## Publicar e atualizar

1. Aumentar `version` em `.claude-plugin/plugin.json`; commit; push (não precisa de tag).
2. Usuários: `claude plugin marketplace update eficaz-mods; claude plugin update usage-band@eficaz-mods` e reiniciar o Claude Code.
3. Instalação nova em um comando: `claude plugin install usage-band --marketplace AlessandroLobo/alessandrolobo-usage-band` (escopo user).
4. A cópia instalada fica em `~/.claude/plugins/cache/eficaz-mods/usage-band/<versão>`; editar o repositório não muda o que roda até atualizar pelo marketplace.

## Convenções

- Código e docs em pt-BR; comentários de 1 linha descrevendo o comportamento atual.
- Mudança visual: manter as cores alinhadas com a extensão `claude-usage-statusbar` (e vice-versa) e atualizar a tabela de cores dos dois READMEs.
- Toda função nova com teste em `tests/` cobrindo `terminal` e `desktop`.

## Pendências / ideias

- Confirmar como o Desktop exibe o painel (`/uso painel`) na prática.
- Cores fixas ficam suaves em tema claro; avaliar uma opção (`userConfig`) para escolher paleta.
- Balão ao passar o mouse não cabe na área acima do prompt (o recorte é a própria barra); o painel cumpre esse papel.
