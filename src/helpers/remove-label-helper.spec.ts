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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Container } from 'inversify';

import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import { IssueInfoBuilder } from '/@/info/issue-info';

describe('removeLabelHelper', () => {
  let container: Container;
  let removeLabelHelper: RemoveLabelHelper;
  let mockRemoveLabel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRemoveLabel = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});

    container = new Container();
    container.bind(RemoveLabelHelper).toSelf().inSingletonScope();
    container.bind(IssueInfoBuilder).toSelf().inSingletonScope();
    container
      .bind('Octokit')
      .toConstantValue({
        rest: {
          issues: {
            removeLabel: mockRemoveLabel,
          },
        },
      })
      .whenNamed('WRITE_TOKEN');
  });

  test('should return early when label does not exist on the issue', async () => {
    expect.assertions(1);

    removeLabelHelper = container.get(RemoveLabelHelper);
    const issueInfoBuilder = container.get(IssueInfoBuilder);

    const issueInfo = issueInfoBuilder
      .build()
      .withOwner('org')
      .withRepo('repo')
      .withNumber(1)
      .withLabels(['bug', 'enhancement']);

    await removeLabelHelper.removeLabel('domain/containers/inreview', issueInfo);

    expect(mockRemoveLabel).not.toHaveBeenCalled();
  });

  test('should call removeLabel when label exists on the issue', async () => {
    expect.assertions(1);

    removeLabelHelper = container.get(RemoveLabelHelper);
    const issueInfoBuilder = container.get(IssueInfoBuilder);

    const issueInfo = issueInfoBuilder
      .build()
      .withOwner('org')
      .withRepo('repo')
      .withNumber(42)
      .withLabels(['domain/containers/inreview', 'bug']);

    await removeLabelHelper.removeLabel('domain/containers/inreview', issueInfo);

    expect(mockRemoveLabel).toHaveBeenCalledExactlyOnceWith({
      issue_number: 42,
      name: 'domain/containers/inreview',
      owner: 'org',
      repo: 'repo',
    });
  });
});
