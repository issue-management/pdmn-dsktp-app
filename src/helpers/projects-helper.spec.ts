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

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Container } from 'inversify';
import { graphql } from '@octokit/graphql';
import { ProjectsHelper } from '/@/helpers/projects-helper';
import { IssueInfo } from '/@/info/issue-info';

vi.mock(import('@octokit/graphql'));

describe('projectsHelper', () => {
  let container: Container;

  beforeEach(() => {
    vi.resetAllMocks();
    container = new Container();
    container.bind(ProjectsHelper).toSelf().inSingletonScope();
    container.bind('string').toConstantValue('fake-graphql-token').whenNamed('GRAPHQL_WRITE_TOKEN');
  });

  test('setBacklogProjects calls graphql twice with correct params', async () => {
    expect.assertions(3);

    const projectsHelper = container.get(ProjectsHelper);

    const issueInfo = new IssueInfo()
      .withId('content-id-456')
      .withLabels([])
      .withProjectItems([])
      .withNumber(42)
      .withOwner('podman-desktop')
      .withRepo('podman-desktop')
      .withHtmlLink('https://github.com/podman-desktop/podman-desktop/issues/42');

    vi.mocked(graphql).mockResolvedValueOnce({
      addProjectV2ItemById: { item: { id: 'item-123' } },
    });
    vi.mocked(graphql).mockResolvedValueOnce({});

    await projectsHelper.setBacklogProjects(issueInfo);

    expect(graphql).toHaveBeenCalledTimes(2);

    // First call: addProjectV2ItemById
    expect(graphql).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('addProjectV2ItemById'),
      expect.objectContaining({
        projectId: 'PVT_kwDOB71_hM4AxfY6',
        contentId: 'content-id-456',
        headers: { authorization: 'fake-graphql-token' },
      }),
    );

    // Second call: updateProjectV2ItemFieldValue
    expect(graphql).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('updateProjectV2ItemFieldValue'),
      expect.objectContaining({
        projectId: 'PVT_kwDOB71_hM4AxfY6',
        itemId: 'item-123',
        statusField: 'PVTSSF_lADOB71_hM4AxfY6zgnmBDo',
        statusValue: 'bd2b3a2d',
        headers: { authorization: 'fake-graphql-token' },
      }),
    );
  });
});
