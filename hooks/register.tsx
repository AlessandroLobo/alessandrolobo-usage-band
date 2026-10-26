import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { UsageLimit, UsageSnapshot } from '../types'

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)
const lastTurnMs = atom({ plugin: 'usage-band', key: 'lastTurnMs' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const PANE = 'usage-band.painel'
const PANE_TITLE = 'Uso do Claude'

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'gasto' }
const LIMIT_TITLES: Record<string, string> = { five_hour: 'Sessão (5h)', seven_day: 'Semanal (7 dias)', spend_limit: 'Gasto' }

// Mesmo degradê da extensão do VS Code: cor-base até 50%, âmbar em 75% e vermelho a partir de 90%.
const COLORS = { limit: '#89d185', context: '#89d185' }
const RAMP = { start: 50, amber: 75, red: 90 }
const AMBER: Rgb = [229, 165, 10]
const RED: Rgb = [241, 76, 76]

type Rgb = [number, number, number]
const parseHex = (c: string): Rgb => [0, 2, 4].map(i => parseInt(c.slice(1 + i, 3 + i), 16)) as Rgb
const toHex = (rgb: Rgb): string => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// Cor para um uso de 0–100: `base` até `start`, depois âmbar e vermelho; sem `base`, só colore a partir do âmbar.
const usageColor = (percent: number, base?: string): string | undefined => {
  const p = Math.min(100, Math.max(0, percent))
  if (p <= (base ? RAMP.start : RAMP.amber)) return base
  if (p >= RAMP.red) return toHex(RED)
  if (p >= RAMP.amber) return toHex(mix(AMBER, RED, (p - RAMP.amber) / (RAMP.red - RAMP.amber)))
  return toHex(mix(parseHex(base as string), AMBER, (p - RAMP.start) / (RAMP.amber - RAMP.start)))
}
const limitColor = (l: UsageLimit): string | undefined => usageColor(l.percentUsed, COLORS.limit)
const contextColor = (percent: number | null): string | undefined => (percent === null ? undefined : usageColor(percent))

const toMs = (iso: string | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

const toSnapshot = (
  startedAt: number | null,
  context: SessionContextUsage,
  rateLimits: SessionRateLimit[],
  cost: SessionCost | undefined,
): UsageSnapshot => ({
  startedAt,
  contextPercent: context.percent ?? null,
  contextTokens: context.tokens ?? null,
  contextWindow: context.window,
  limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: toMs(l.resetsAt) })),
  costUsd: cost?.usd ?? null,
})

const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const formatElapsed = (ms: number): string => {
  const min = Math.floor(ms / 60_000)
  return min > 60 ? `${Math.floor(min / 60)}h${`${min % 60}`.padStart(2, '0')}` : `${min}m`
}

const formatRemaining = (ms: number): string => {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min >= 1440) return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`
  if (min >= 60) return `${Math.floor(min / 60)}h${`${min % 60}`.padStart(2, '0')}`
  return `${min}m`
}

// Momento do reinício: "às 18:41" se for hoje, "ter. às 21:00" nos outros dias.
const resetClock = (resetsAt: number, now: number): string => {
  const d = new Date(resetsAt)
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date(now).toDateString() ? `às ${time}` : `${d.toLocaleDateString('pt-BR', { weekday: 'short' })} às ${time}`
}

const formatTurn = (ms: number): string => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`
}

const contextText = (s: UsageSnapshot): string =>
  s.contextTokens === null
    ? `–/${formatTokens(s.contextWindow)}`
    : `${formatTokens(s.contextTokens)}/${formatTokens(s.contextWindow)} (${s.contextPercent ?? 0}%)`

const limitText = (l: UsageLimit, now: number): string =>
  `${LIMIT_LABELS[l.kind] ?? l.kind} ${l.percentUsed}%${l.resetsAt === null ? '' : ` ↻${formatRemaining(l.resetsAt - now)}`}`

type Segment = { text: string; color?: string }

const colorProps = (color: string | undefined) => (color ? { color } : {})

export const register: Register = (on, options) => {
  const showBand = options.showAbovePrompt !== false
  let turnStartedAt: number | null = null

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await update($, snapshot, () => toSnapshot(u.startedAt, u.context, u.rateLimits, u.cost))
    await $.command.register({
      name: 'uso',
      description: 'Mostra/oculta a barra de uso acima do prompt; "/uso painel" abre o painel com barras',
      argumentHint: '[painel]',
    })
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, prev => toSnapshot(prev?.startedAt ?? null, e.context, e.rateLimits, e.cost))
    if (e.changed.includes('rateLimits')) {
      for (const l of e.rateLimits) {
        if (l.percentUsed >= 90) $.ui.toast(`Limite ${LIMIT_LABELS[l.kind] ?? l.kind} em ${l.percentUsed}%`)
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now().catch(() => null)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (turnStartedAt !== null) {
      const ms = (await $.clock.now()) - turnStartedAt
      await update($, lastTurnMs, () => ms)
      turnStartedAt = null
    }
    return next(e)
  })

  on('command.run', { command: 'uso' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'painel') {
      const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
      return { text: opened.isPlaced ? 'Painel de uso aberto.' : 'Esta tela não exibe painéis agora; a barra acima do prompt continua ativa.' }
    }
    const hidden = await update($, isHidden, v => !v)
    return { text: hidden ? 'Barra de uso oculta.' : 'Barra de uso visível.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (!showBand || e.props.hasSurvey || s === null || (await read($, isHidden))) {
      return next(e)
    }

    const now = await $.clock.now()
    const turn = await read($, lastTurnMs)
    const segments: Segment[] = []

    const head = [s.startedAt !== null ? `⏱ ${formatElapsed(now - s.startedAt)}` : null, contextText(s)].filter(Boolean).join(' · ')
    segments.push({ text: head, color: contextColor(s.contextPercent) })
    for (const l of s.limits) segments.push({ text: limitText(l, now), color: limitColor(l) })
    const tail = [s.costUsd !== null ? `US$ ${s.costUsd.toFixed(2)}` : null, turn !== null ? `turno ${formatTurn(turn)}` : null]
      .filter(Boolean)
      .join(' · ')
    if (tail) segments.push({ text: tail })

    const { Box, Text } = $.ui.resolve(e)
    const children: RenderChildren[] = []
    segments.forEach((seg, i) => {
      if (i > 0) children.push(<Text dimColor>{' · '}</Text>)
      children.push(<Text {...colorProps(seg.color)}>{seg.text}</Text>)
    })

    return (
      <Box flexDirection="row" flexWrap="wrap">
        {children}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    if (s === null) return <Text dimColor>Aguardando os dados da sessão.</Text>

    const now = await $.clock.now()
    const turn = await read($, lastTurnMs)
    const width = Math.max(10, Math.min(40, e.props.bodyColumns - 2))

    const bar = (percent: number, color: string | undefined) => {
      const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
      return (
        <Box flexDirection="row">
          <Text {...colorProps(color ?? COLORS.context)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
        </Box>
      )
    }
    const row = (label: string, value: string, color?: string) => (
      <Box flexDirection="row" justifyContent="space-between" width={width}>
        <Text bold {...colorProps(color)}>
          {label}
        </Text>
        <Text {...colorProps(color)}>{value}</Text>
      </Box>
    )

    const body: RenderChildren[] = [<Text bold dimColor>USO DA ASSINATURA</Text>]
    if (s.limits.length === 0) body.push(<Text dimColor>Limites ainda não informados nesta sessão.</Text>)
    for (const l of s.limits) {
      const color = limitColor(l)
      body.push(row(LIMIT_TITLES[l.kind] ?? l.kind, `${l.percentUsed}%`, color))
      body.push(bar(l.percentUsed, color))
      if (l.resetsAt !== null) body.push(<Text dimColor>{`Reseta em ${formatRemaining(l.resetsAt - now)} (${resetClock(l.resetsAt, now)})`}</Text>)
      body.push(<Text> </Text>)
    }

    body.push(<Text bold dimColor>SESSÃO ATUAL</Text>)
    if (s.contextPercent !== null) {
      const color = contextColor(s.contextPercent)
      body.push(row('Contexto', `${s.contextPercent}%`, color))
      body.push(bar(s.contextPercent, usageColor(s.contextPercent, COLORS.context)))
      body.push(<Text dimColor>{contextText(s)}</Text>)
    }
    if (s.startedAt !== null) body.push(row('Tempo', formatElapsed(now - s.startedAt)))
    if (s.costUsd !== null) body.push(row('Custo', `US$ ${s.costUsd.toFixed(2)}`))
    if (turn !== null) body.push(row('Último turno', formatTurn(turn)))

    return <Box flexDirection="column">{body}</Box>
  })
}
