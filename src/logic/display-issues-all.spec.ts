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

import { DisplayIssuesAllLogic } from '/@/logic/display-issues-all';

describe('displayIssuesAllLogic', () => {
  let logic: DisplayIssuesAllLogic;

  beforeEach(() => {
    logic = new DisplayIssuesAllLogic();
  });

  test('should log message when issue is opened', async () => {
    expect.assertions(1);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const event = {
      payload: {
        issue: { title: 'My issue' },
        repository: { full_name: 'org/repo' },
      },
    } as unknown as EmitterWebhookEvent<'issues.opened'>;

    await logic.execute(event);

    expect(consoleSpy).toHaveBeenCalledExactlyOnceWith('Issue (re)opened: My issue in org/repo');

    consoleSpy.mockRestore();
  });

  test('should log message when issue is reopened', async () => {
    expect.assertions(1);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const event = {
      payload: {
        issue: { title: 'Reopened issue' },
        repository: { full_name: 'podman-desktop/podman-desktop' },
      },
    } as unknown as EmitterWebhookEvent<'issues.reopened'>;

    await logic.execute(event);

    expect(consoleSpy).toHaveBeenCalledExactlyOnceWith(
      'Issue (re)opened: Reopened issue in podman-desktop/podman-desktop',
    );

    consoleSpy.mockRestore();
  });
});
