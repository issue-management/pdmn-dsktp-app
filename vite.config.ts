/*******************************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

import { builtinModules } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';

const PACKAGE_ROOT = __dirname;

export default defineConfig({
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  resolve: {
    alias: {
      '/@domains.json': path.resolve(PACKAGE_ROOT, 'domains.json'),
      '/@extra-domains.json': path.resolve(PACKAGE_ROOT, 'extra-domains.json'),
      '/@folder-domains.json': path.resolve(PACKAGE_ROOT, 'folder-domains.json'),
      '/@users.json': path.resolve(PACKAGE_ROOT, 'users.json'),
      '/@': path.resolve(PACKAGE_ROOT, 'src'),
    },
  },
  build: {
    sourcemap: 'inline',
    target: 'esnext',
    outDir: 'dist',
    assetsDir: '.',
    minify: process.env.MODE === 'production' ? 'esbuild' : false,
    lib: {
      entry: 'src/entrypoint.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: [...builtinModules.flatMap(p => [p, `node:${p}`])],
      output: {
        entryFileNames: '[name].js',
      },
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    exclude: ['dist/**'],
  },
});
