import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// Un único proyecto Vite construye el frontend (React) y el Worker de API,
// para desplegarse como un solo Cloudflare Worker con assets estáticos (plan Free).
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
