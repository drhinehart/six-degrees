import { defineConfig } from 'vite'

// GitHub Pages serves the project at https://drhinehart.github.io/six-degrees/.
// Build and preview use that subpath; the dev server stays at the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/six-degrees/' : '/',
}))
