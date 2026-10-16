export const NOMBRE_GUARDIAN = 'Open Sentinels'

export const DEMO_MODE: 'fixtures' | 'live' =
  import.meta.env.VITE_DEMO_MODE === 'fixtures' ? 'fixtures' : 'live'
