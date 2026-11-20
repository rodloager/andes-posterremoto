import js from '@eslint/js';
import globals from 'globals';

const reglaSinComentarios = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      prohibido: 'El código fuente no lleva comentarios. La documentación va en docs/.',
    },
  },
  create(contexto) {
    return {
      Program() {
        for (const comentario of contexto.sourceCode.getAllComments()) {
          contexto.report({ loc: comentario.loc, messageId: 'prohibido' });
        }
      },
    };
  },
};

export default [
  {
    ignores: ['node_modules/', 'frontend/public/vendor/', 'coverage/', 'data/raw/', 'data/processed/'],
  },
  js.configs.recommended,
  {
    plugins: { andes: { rules: { 'sin-comentarios': reglaSinComentarios } } },
    rules: {
      'andes/sin-comentarios': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'analytics/**/*.js',
      'backend/**/*.js',
      'database/**/*.js',
      'etl/**/*.js',
      'data/**/*.js',
      'scripts/**/*.js',
      'tests/**/*.js',
      '*.js',
    ],
    languageOptions: { globals: globals.node },
  },
];
