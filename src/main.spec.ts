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

import { afterEach, describe, test, expect, vi, beforeEach } from 'vitest';
import 'reflect-metadata';
import type { Container } from 'inversify';
import type { App } from '@octokit/app';
import type { EmitterWebhookEventName } from '@octokit/webhooks';
import http from 'node:http';

vi.mock(import('@octokit/webhooks'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createNodeMiddleware: vi.fn<typeof actual.createNodeMiddleware>(actual.createNodeMiddleware),
  };
});

// eslint-disable-next-line import/first
import { Main } from './main';

describe('test Main', () => {
  let main: Main;

  afterEach(() => {
    main?.stop();
  });

  test('creates Main with config', () => {
    expect.assertions(1);

    main = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret: 'fake-secret',
    });

    expect(main).toBeDefined();
  });

  test('starts server on given port', async () => {
    expect.assertions(2);

    main = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret: 'fake-secret',
    });
    const server = await main.start(0);

    expect(server).toBeDefined();
    expect(server.listening).toBe(true);
  });

  test('stop without start does not throw', () => {
    expect.assertions(1);

    main = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret: 'fake-secret',
    });

    expect(() => main.stop()).not.toThrow();
  });

  test('server responds with 404 for non-webhook requests', async () => {
    expect.assertions(1);

    main = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret: 'fake-secret',
    });
    const server = await main.start(0);
    const address = server.address() as { port: number };

    const response = await new Promise<http.IncomingMessage>(resolve => {
      http.get(`http://localhost:${address.port}/not-a-webhook`, resolve);
    });

    expect(response.statusCode).toBe(404);
  });

  test('server logs incoming requests', async () => {
    expect.assertions(1);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    main = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret: 'fake-secret',
    });
    const server = await main.start(0);
    const address = server.address() as { port: number };

    await new Promise<http.IncomingMessage>(resolve => {
      http.get(`http://localhost:${address.port}/test`, resolve);
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Incoming request: GET /test'));

    logSpy.mockRestore();
  });
});

describe('main with mocked App', () => {
  const webhookSecret = 'test-webhook-secret';
  let main: Main;
  let mockGetInstallationOctokit: ReturnType<typeof vi.fn>;
  let webhookHandlers: Map<string, (event: unknown) => Promise<void>>;
  let webhookErrorHandler: ((error: Error) => void) | undefined;

  beforeEach(async () => {
    webhookHandlers = new Map();
    webhookErrorHandler = undefined;

    mockGetInstallationOctokit = vi.fn<() => Promise<{ auth: () => Promise<{ token: string }> }>>().mockResolvedValue({
      auth: vi.fn<() => Promise<{ token: string }>>().mockResolvedValue({ token: 'fake-install-token' }),
    });

    main = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret,
    });

    // Access the internal app to mock it
    const app = (main as unknown as { app: App }).app;
    app.getInstallationOctokit = mockGetInstallationOctokit as unknown as typeof app.getInstallationOctokit;

    // Intercept webhooks.on
    const originalOn = app.webhooks.on.bind(app.webhooks);
    vi.spyOn(app.webhooks, 'on').mockImplementation(((
      eventName: EmitterWebhookEventName,
      handler: (event: unknown) => Promise<void>,
    ) => {
      webhookHandlers.set(eventName, handler);
      originalOn(eventName, handler);
    }) as (...args: unknown[]) => void);

    const originalOnError = app.webhooks.onError.bind(app.webhooks);
    vi.spyOn(app.webhooks, 'onError').mockImplementation(((handler: (error: Error) => void) => {
      webhookErrorHandler = handler;
      originalOnError(handler);
    }) as (...args: unknown[]) => void);
  });

  afterEach(() => {
    main?.stop();
  });

  test('registerWebhook registers all event handlers - count and push/issues', async () => {
    expect.assertions(5);

    await main.start(0);

    const app = (main as unknown as { app: App }).app;

    expect(app.webhooks.on).toHaveBeenCalledTimes(9);
    expect(webhookHandlers.has('push')).toBe(true);
    expect(webhookHandlers.has('issues.opened')).toBe(true);
    expect(webhookHandlers.has('issues.closed')).toBe(true);
    expect(webhookHandlers.has('issues.reopened')).toBe(true);
  });

  test('registerWebhook registers all event handlers - issues and pull requests', async () => {
    expect.assertions(5);

    await main.start(0);

    expect(webhookHandlers.has('issues')).toBe(true);
    expect(webhookHandlers.has('pull_request.opened')).toBe(true);
    expect(webhookHandlers.has('pull_request.edited')).toBe(true);
    expect(webhookHandlers.has('pull_request.closed')).toBe(true);
    expect(webhookHandlers.has('pull_request_review')).toBe(true);
  });

  test('webhook error handler is registered', async () => {
    expect.assertions(1);

    await main.start(0);

    expect(webhookErrorHandler).toBeDefined();
  });

  test('webhook error handler logs errors', async () => {
    expect.assertions(1);

    await main.start(0);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    webhookErrorHandler!(new Error('test webhook error'));

    expect(errorSpy).toHaveBeenCalledWith('Webhook error:', expect.any(Error));

    errorSpy.mockRestore();
  });

  test('createContainer returns undefined when no installation ID', async () => {
    expect.assertions(2);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await main.start(0);

    const pushHandler = webhookHandlers.get('push');

    expect(pushHandler).toBeDefined();

    // Call with event that has no installation
    await pushHandler!({ payload: {} });

    expect(errorSpy).toHaveBeenCalledWith('No installation ID found in event payload');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('createContainer calls getInstallationOctokit and unloads container', async () => {
    expect.assertions(3);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock InversifyBinding to return a container with a mock listener
    const mockUnload = vi.fn<() => void>();
    const mockListener = { execute: vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined) };
    const mockContainer = {
      getAll: vi.fn<() => unknown[]>().mockReturnValue([mockListener]),
      unload: mockUnload,
    };

    const { InversifyBinding } = await import('./inversify-binding');
    vi.spyOn(InversifyBinding.prototype, 'initBindings').mockResolvedValue(mockContainer as unknown as Container);

    await main.start(0);

    const pushHandler = webhookHandlers.get('push');

    expect(pushHandler).toBeDefined();

    await pushHandler!({
      payload: {
        installation: { id: 42 },
        ref: 'refs/heads/main',
        repository: { name: 'test', owner: { login: 'test' } },
      },
    });

    expect(mockGetInstallationOctokit).toHaveBeenCalledWith(42);
    expect(mockUnload).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('middleware error is logged', async () => {
    expect.assertions(1);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock createNodeMiddleware to return a middleware that throws
    const middlewareError = new Error('middleware failure');
    const { createNodeMiddleware } = await import('@octokit/webhooks');
    vi.mocked(createNodeMiddleware).mockReturnValue((_req, _res, next) => {
      next?.();
      return Promise.reject(middlewareError);
    });

    // Re-create main so the mocked middleware is used
    const freshMain = new Main({
      appId: '12345',
      privateKey: 'fake-private-key',
      webhookSecret,
    });

    const server = await freshMain.start(0);
    const address = server.address() as { port: number };

    await new Promise<http.IncomingMessage>(resolve => {
      http.get(`http://localhost:${address.port}/test`, resolve);
    });

    // Give the catch handler time to execute
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(errorSpy).toHaveBeenCalledWith('Middleware error:', middlewareError);

    freshMain.stop();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
