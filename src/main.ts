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

import { App } from '@octokit/app';
import { createNodeMiddleware } from '@octokit/webhooks';
import type { EmitterWebhookEvent, EmitterWebhookEventName } from '@octokit/webhooks';
import type { Container } from 'inversify';
import http from 'node:http';

import { IssuesClosedListener } from '/@/api/issues-closed-listener';
import { IssuesOpenedListener } from '/@/api/issues-opened-listener';
import { PullRequestClosedListener } from '/@/api/pull-request-closed-listener';
import { PullRequestEditedListener } from '/@/api/pull-request-edited-listener';
import { PullRequestOpenedListener } from '/@/api/pull-request-opened-listener';
import { PullRequestReviewListener } from '/@/api/pull-request-review-listener';
import { PushListener } from '/@/api/push-listener';
import { InversifyBinding } from '/@/inversify-binding';
import { IssuesListener } from '/@/api/issues-listener';
import { IssuesReopenedListener } from '/@/api/issues-reopened-listener';

export interface MainConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}

export class Main {
  private app: App;
  private server: http.Server | undefined;

  constructor(private config: MainConfig) {
    this.app = new App({
      appId: this.config.appId,
      privateKey: this.config.privateKey,
      webhooks: {
        secret: this.config.webhookSecret,
      },
    });
  }

  private async createContainer(payload: Record<string, unknown>): Promise<Container | undefined> {
    const installation = payload.installation as { id: number } | undefined;
    const installationId = installation?.id;
    if (!installationId) {
      console.error('No installation ID found in event payload');
      return undefined;
    }

    const octokit = await this.app.getInstallationOctokit(installationId);
    const token = (await octokit.auth({ type: 'installation' })) as { token: string };

    const inversifyBinding = new InversifyBinding(token.token, token.token);
    return inversifyBinding.initBindings();
  }

  private registerWebhook<E extends EmitterWebhookEventName>(eventName: E, listenerSymbol: symbol): void {
    this.app.webhooks.on(eventName, async (event: EmitterWebhookEvent<E>) => {
      console.log(`Received event: ${eventName}...`);
      const container = await this.createContainer(event.payload);
      if (!container) return;
      const listeners = container.getAll<{ execute(event: EmitterWebhookEvent<E>): Promise<void> }>(listenerSymbol, {
        optional: true,
      });
      await Promise.all(listeners.map(listener => listener.execute(event)));
      container.unload();
    });
  }

  async start(port = 3000): Promise<http.Server> {
    this.registerWebhook('push', PushListener);
    this.registerWebhook('issues.opened', IssuesOpenedListener);
    this.registerWebhook('issues.closed', IssuesClosedListener);
    this.registerWebhook('issues.reopened', IssuesReopenedListener);
    this.registerWebhook('issues', IssuesListener);
    this.registerWebhook('pull_request.opened', PullRequestOpenedListener);
    this.registerWebhook('pull_request.edited', PullRequestEditedListener);
    this.registerWebhook('pull_request.closed', PullRequestClosedListener);
    this.registerWebhook('pull_request_review', PullRequestReviewListener);

    this.app.webhooks.onError(error => {
      console.error('Webhook error:', error);
    });

    const middleware = createNodeMiddleware(this.app.webhooks);

    this.server = http.createServer((req, res) => {
      console.log(`Incoming request: ${req.method} ${req.url}`);
      // Log the event name if it's a webhook request
      if (req.headers['x-github-event']) {
        console.log(`GitHub event: ${req.headers['x-github-event']}`);
      }

      middleware(req, res, () => {
        res.writeHead(404);
        res.end('Not found');
      }).catch((error: unknown) => {
        console.error('Middleware error:', error);
      });
    });
    this.server.listen(port, () => {
      console.log(`GitHub App server listening on port ${port}`);
    });

    return this.server;
  }

  stop(): void {
    this.server?.close();
  }
}
