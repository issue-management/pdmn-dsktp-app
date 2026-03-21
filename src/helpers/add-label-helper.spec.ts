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

import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { IssueInfoBuilder } from '/@/info/issue-info';

describe('addLabelHelper', () => {
  let container: Container;
  let addLabelHelper: AddLabelHelper;
  let mockAddLabels: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAddLabels = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});

    container = new Container();
    container.bind(AddLabelHelper).toSelf().inSingletonScope();
    container.bind(IssueInfoBuilder).toSelf().inSingletonScope();
    container
      .bind('Octokit')
      .toConstantValue({
        rest: {
          issues: {
            addLabels: mockAddLabels,
          },
        },
      })
      .whenNamed('WRITE_TOKEN');
  });

  test('should return early when all labels already exist on the issue', async () => {
    expect.assertions(1);

    addLabelHelper = container.get(AddLabelHelper);
    const issueInfoBuilder = container.get(IssueInfoBuilder);

    const issueInfo = issueInfoBuilder
      .build()
      .withOwner('org')
      .withRepo('repo')
      .withNumber(1)
      .withLabels(['bug', 'enhancement']);

    await addLabelHelper.addLabel(['bug', 'enhancement'], issueInfo);

    expect(mockAddLabels).not.toHaveBeenCalled();
  });

  test('should call addLabels with only the labels that do not exist yet', async () => {
    expect.assertions(1);

    addLabelHelper = container.get(AddLabelHelper);
    const issueInfoBuilder = container.get(IssueInfoBuilder);

    const issueInfo = issueInfoBuilder.build().withOwner('org').withRepo('repo').withNumber(42).withLabels(['bug']);

    await addLabelHelper.addLabel(['bug', 'enhancement', 'triage'], issueInfo);

    expect(mockAddLabels).toHaveBeenCalledExactlyOnceWith({
      issue_number: 42,
      labels: ['enhancement', 'triage'],
      owner: 'org',
      repo: 'repo',
    });
  });

  test('should call addLabels with all labels when none exist on the issue', async () => {
    expect.assertions(1);

    addLabelHelper = container.get(AddLabelHelper);
    const issueInfoBuilder = container.get(IssueInfoBuilder);

    const issueInfo = issueInfoBuilder.build().withOwner('org').withRepo('repo').withNumber(10).withLabels([]);

    await addLabelHelper.addLabel(['bug', 'enhancement'], issueInfo);

    expect(mockAddLabels).toHaveBeenCalledExactlyOnceWith({
      issue_number: 10,
      labels: ['bug', 'enhancement'],
      owner: 'org',
      repo: 'repo',
    });
  });
});
