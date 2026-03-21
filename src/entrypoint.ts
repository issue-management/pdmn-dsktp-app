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

import 'reflect-metadata';

import { Main } from '/@/main';

const appId = process.env.GITHUB_APP_ID;
if (!appId) {
  throw new Error('GITHUB_APP_ID environment variable is required');
}

const privateKey = process.env.GITHUB_PRIVATE_KEY;
if (!privateKey) {
  throw new Error('GITHUB_PRIVATE_KEY environment variable is required');
}

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required');
}

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const main = new Main({ appId, privateKey, webhookSecret });
main.start(port).catch((error: unknown) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
