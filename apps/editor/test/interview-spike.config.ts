import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: process.env.SPIKE_VISUAL_REPLAY === '1' ? 'interview-spike-visual.spec.ts' : 'interview-spike.spec.ts', workers: 1, retries: 0, timeout: 600000, reporter: 'list', outputDir: '../../../spike-artifacts/browser-results' });
