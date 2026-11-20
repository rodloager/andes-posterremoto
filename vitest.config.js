import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const COBERTURA_MINIMA = 70;
const COBERTURA_DE_ALGORITMOS = 90;
const umbral = (valor) => ({ lines: valor, functions: valor, branches: valor, statements: valor });

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'backend/src/**/*.js',
        'etl/**/*.js',
        'database/**/*.js',
        'data/generador/**/*.js',
        'analytics/powerbi/*.js',
        'frontend/public/js/**/*.js',
        'frontend/private/js/**/*.js',
      ],
      exclude: [
        'etl/cli.js',
        'database/comandos/**',
        'analytics/powerbi/exportar.js',
        'data/generador/generar-*.js',
        'etl/tareas/**',
        'etl/extractores/arcgis.js',
        'frontend/public/js/paginas/**',
        'frontend/private/js/paginas/**',
        'frontend/private/js/acceso.js',
        'frontend/private/js/marco-privado.js',
        'frontend/public/js/componentes/marco.js',
        'frontend/public/js/componentes/mapa.js',
        'frontend/public/js/componentes/grafica.js',
      ],
      thresholds: {
        ...umbral(COBERTURA_MINIMA),
        'backend/src/algorithms/**': umbral(COBERTURA_DE_ALGORITMOS),
      },
    },
    projects: [
      {
        test: {
          name: 'unitarias',
          include: ['tests/unit/**/*.test.js'],
          exclude: ['tests/unit/interfaz/**', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'interfaz',
          include: ['tests/unit/interfaz/**/*.test.js'],
          environment: 'happy-dom',
        },
        resolve: {
          alias: [
            { find: /^\/js\//, replacement: `${path.resolve('frontend/public/js')}/` },
            { find: /^\/vendor\//, replacement: `${path.resolve('frontend/public/vendor')}/` },
          ],
        },
      },
      {
        test: {
          name: 'integracion',
          include: ['tests/integration/**/*.test.js'],
          environment: 'node',
          globalSetup: ['tests/integration/preparar-base-de-datos.js'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
