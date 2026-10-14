import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const PANE = {
  component: 'Pane',
  requestId: 'usage-band.painel',
  props: { title: 'Uso do Claude', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// 1h depois do início; 5h reinicia em 1h, 7d em 2 dias; o semanal já passou de 90%.
const usage = () => ({
  value: {
    startedAt: 0,
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(7_200_000).toISOString() },
      { kind: 'seven_day', percentUsed: 93, resetsAt: new Date(3_600_000 + 2 * 86_400_000).toISOString() },
    ],
    cost: { usd: 1.5 },
  },
})

const setup = (on: On) => {
  on('session.usage', usage)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 3_600_000 }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
}

test('a barra mostra tempo, contexto, limites com reinício e cores por limite', async ($, on) => {
  setup(on)
  on('ui.render', ($$, e) => {
    const { Box } = $$.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /⏱ 60m · 50k\/200k \(25%\)/ })).toBeDefined()

    const five = await ui.find({ type: 'Text', text: /^5h 42% ↻1h00$/ })
    expect(five?.props.color).toBe('#7fbbb3')

    const week = await ui.find({ type: 'Text', text: /^7d 93% ↻2d 0h$/ })
    expect(week?.props.color).toBe('#e67e80')

    expect(await ui.find({ type: 'Text', text: /US\$ 1\.50/ })).toBeDefined()
    await ui.unmount()
  }
})

test('o painel mostra barras e o tempo até reiniciar', async ($, on) => {
  setup(on)
  on('ui.render', ($$, e) => {
    const { Box } = $$.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'Sessão (5h)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Reseta em 1h00' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Semanal (7 dias)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /█+/ })).toBeDefined()
    await ui.unmount()
  }
})

test('com showAbovePrompt desligado a barra não é desenhada, mas o painel continua', { options: { showAbovePrompt: false } }, async ($, on) => {
  setup(on)
  on('ui.render', ($$, e) => {
    const { Box } = $$.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', ...BAND })
  expect(await band.find({ type: 'Text', text: /5h 42%/ })).toBeUndefined()
  await band.unmount()

  const pane = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', ...PANE })
  expect(await pane.find({ type: 'Text', text: 'Sessão (5h)' })).toBeDefined()
  await pane.unmount()
})
