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

import { DisplayIssuesClosedLogic } from '/@/logic/display-issues-closed';

describe('displayIssuesClosedLogic', () => {
  let logic: DisplayIssuesClosedLogic;

  beforeEach(() => {
    logic = new DisplayIssuesClosedLogic();
  });

  test('should log message when issue is closed', async () => {
    expect.assertions(1);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const event = {
      payload: {
        issue: { title: 'Closed issue' },
        repository: { full_name: 'org/repo' },
      },
    } as unknown as EmitterWebhookEvent<'issues.closed'>;

    await logic.execute(event);

    expect(consoleSpy).toHaveBeenCalledExactlyOnceWith('Issue closed: Closed issue in org/repo');

    consoleSpy.mockRestore();
  });
});
