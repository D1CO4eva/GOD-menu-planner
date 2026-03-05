import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  const isProduction = mode === 'production';

  return {
    // App is deployed under /menuplanner on FTP hosting.
    base: isProduction ? '/menuplanner/' : '/',
    plugins: [
      react(),
      tailwindcss(),
      legacy({
        // Improve compatibility for older mobile Safari/Android browsers.
        targets: ['defaults', 'ios >= 12', 'safari >= 12'],
        modernPolyfills: true,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Disable HMR when DISABLE_HMR is set.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});