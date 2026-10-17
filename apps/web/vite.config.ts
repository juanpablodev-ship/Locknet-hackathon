import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    allowedHosts: process.env.INTEGRATION_ORIGIN ? [new URL(process.env.INTEGRATION_ORIGIN).hostname] : ['localhost'],
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? `http://127.0.0.1:${process.env.INTEGRATION_API_PORT ?? '3100'}`
    }
  }
})
