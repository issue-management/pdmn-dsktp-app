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

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { DisplayIssuesOpenedLogic } from '/@/logic/display-issues-opened';

describe('displayIssuesOpenedLogic', () => {
  let logic: DisplayIssuesOpenedLogic;

  beforeEach(() => {
    logic = new DisplayIssuesOpenedLogic();
  });

  test('should log message when issue is opened', async () => {
    expect.assertions(1);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const event = {
      payload: {
        issue: { title: 'New issue' },
        repository: { full_name: 'podman-desktop/podman-desktop' },
      },
    } as unknown as EmitterWebhookEvent<'issues.opened'>;

    await logic.execute(event);

    expect(consoleSpy).toHaveBeenCalledExactlyOnceWith('Issue opened: New issue in podman-desktop/podman-desktop');

    consoleSpy.mockRestore();
  });
});
