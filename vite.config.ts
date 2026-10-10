import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaBuild } from './build/pwa.mjs';

export default defineConfig({ base: './', plugins: [react(), pwaBuild()] });
