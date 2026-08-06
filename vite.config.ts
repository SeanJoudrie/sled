import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so the bundle needs a
  // matching base or every asset URL 404s. Local dev and a user/custom domain
  // both want '/', which is the default when BASE_PATH is unset.
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
