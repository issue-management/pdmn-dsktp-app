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

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import type { Main } from './main';

const mockStart = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
const mockStop = vi.fn<() => void>();

vi.mock(import('./main'), () => {
  // Must use function (not arrow) so it works as a constructor with `new`
  const MockMain = vi.fn<(config: Record<string, string>) => void>().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.start = mockStart;
    this.stop = mockStop;
  });
  return { Main: MockMain as unknown as typeof Main };
});

describe('test Entrypoint', () => {
  beforeEach(() => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_PRIVATE_KEY;
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.PORT;
  });

  afterEach(() => {
    vi.resetModules();
    mockStart.mockClear();
    mockStop.mockClear();
  });

  test('entrypoint throws without GITHUB_APP_ID', async () => {
    expect.assertions(1);
    await expect(import('./entrypoint')).rejects.toThrow('GITHUB_APP_ID environment variable is required');
  });

  test('entrypoint throws without GITHUB_PRIVATE_KEY', async () => {
    expect.assertions(1);

    process.env.GITHUB_APP_ID = 'test-app-id';

    await expect(import('./entrypoint')).rejects.toThrow('GITHUB_PRIVATE_KEY environment variable is required');
  });

  test('entrypoint throws without GITHUB_WEBHOOK_SECRET', async () => {
    expect.assertions(1);

    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-private-key';

    await expect(import('./entrypoint')).rejects.toThrow('GITHUB_WEBHOOK_SECRET environment variable is required');
  });

  test('entrypoint starts Main with all env vars set', async () => {
    expect.assertions(1);

    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-private-key';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';

    await import('./entrypoint');

    expect(mockStart).toHaveBeenCalledWith(3000);
  });

  test('entrypoint uses custom PORT when set', async () => {
    expect.assertions(1);

    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-private-key';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.PORT = '8080';

    await import('./entrypoint');

    expect(mockStart).toHaveBeenCalledWith(8080);
  });

  test('entrypoint logs error and exits when start fails', async () => {
    expect.assertions(2);

    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-private-key';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';

    const startError = new Error('start failed');
    mockStart.mockRejectedValueOnce(startError);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await import('./entrypoint');

    // Wait for the .catch handler to run
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to start:', startError);
    });

    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
