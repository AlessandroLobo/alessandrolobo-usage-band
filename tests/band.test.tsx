import { test, expect } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('a barra mostra tempo, contexto e limites numa linha', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 50_000, window: 200_000, percent: 25 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
    },
  }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 3_600_000 }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.render', ($$, e) => {
    const { Box } = $$.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /50k\/200k \(25%\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⏱ 60m · 50k\/200k \(25%\) · 5h 42%/ })).toBeDefined()
    await ui.unmount()
  }

})
