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
import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { ProjectsHelper } from '/@/helpers/projects-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import type { IssueInfo } from '/@/info/issue-info';
import { ApplyProjectsOnIssuesLogic } from '/@/logic/apply-issue-in-backlog-projects';

describe('applyProjectsOnIssuesLogic', () => {
  let container: Container;
  let setBacklogProjectsMock: ReturnType<typeof vi.fn<(issueInfo: IssueInfo) => Promise<undefined>>>;
  let repositoriesHelper: RepositoriesHelper;

  function createEvent(owner: string, repo: string, issueNumber = 42): EmitterWebhookEvent<'issues.opened'> {
    return {
      id: 'event-id',
      name: 'issues',
      payload: {
        action: 'opened',
        issue: {
          node_id: 'I_node_123',
          number: issueNumber,
          html_url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
          labels: [{ name: 'bug' }, { name: 'enhancement' }],
        },
        repository: {
          name: repo,
          owner: { login: owner },
        },
      },
    } as unknown as EmitterWebhookEvent<'issues.opened'>;
  }

  beforeEach(() => {
    vi.resetAllMocks();

    setBacklogProjectsMock = vi.fn<(issueInfo: IssueInfo) => Promise<undefined>>().mockResolvedValue(undefined);
    const projectsHelper = {
      setBacklogProjects: setBacklogProjectsMock,
    } as unknown as ProjectsHelper;
    repositoriesHelper = {
      isKnownRepository: vi.fn<(owner: string, repo: string) => boolean>().mockReturnValue(true),
    } as unknown as RepositoriesHelper;

    container = new Container();
    container.bind(ApplyProjectsOnIssuesLogic).toSelf().inSingletonScope();
    container.bind(ProjectsHelper).toConstantValue(projectsHelper);
    container.bind(RepositoriesHelper).toConstantValue(repositoriesHelper);
  });

  test('calls setBacklogProjects for issue from a known repository', async () => {
    expect.assertions(1);

    const event = createEvent('test-org', 'some-repo');
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);

    expect(setBacklogProjectsMock).toHaveBeenCalledTimes(1);
  });

  test('skips issue from an unknown repository', async () => {
    expect.assertions(1);

    vi.mocked(repositoriesHelper.isKnownRepository).mockReturnValue(false);
    const event = createEvent('unknown-owner', 'unknown-repo');
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);

    expect(setBacklogProjectsMock).not.toHaveBeenCalled();
  });

  test('builds IssueInfo with correct id, owner, repo, and number from webhook payload', async () => {
    expect.assertions(4);

    const event = createEvent('test-org', 'repo-alpha', 99);
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);
    const issueInfo = setBacklogProjectsMock.mock.calls[0][0];

    expect(issueInfo.id).toBe('I_node_123');
    expect(issueInfo.owner).toBe('test-org');
    expect(issueInfo.repo).toBe('repo-alpha');
    expect(issueInfo.number).toBe(99);
  });

  test('builds IssueInfo with correct labels and htmlLink from webhook payload', async () => {
    expect.assertions(2);

    const event = createEvent('test-org', 'repo-alpha', 99);
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);
    const issueInfo = setBacklogProjectsMock.mock.calls[0][0];

    expect(issueInfo.labels).toStrictEqual(['bug', 'enhancement']);
    expect(issueInfo.htmlLink).toBe('https://github.com/test-org/repo-alpha/issues/99');
  });

  test('handles string labels in webhook payload', async () => {
    expect.assertions(1);

    const event = createEvent('test-org', 'repo-alpha');
    (event.payload.issue as Record<string, unknown>).labels = ['string-label'];
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);
    const issueInfo = setBacklogProjectsMock.mock.calls[0][0];

    expect(issueInfo.labels).toStrictEqual(['string-label']);
  });

  test('handles labels with missing name in webhook payload', async () => {
    expect.assertions(1);

    const event = createEvent('test-org', 'repo-alpha');
    (event.payload.issue as Record<string, unknown>).labels = [{}];
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);
    const issueInfo = setBacklogProjectsMock.mock.calls[0][0];

    expect(issueInfo.labels).toStrictEqual(['']);
  });

  test('handles undefined labels in webhook payload', async () => {
    expect.assertions(1);

    const event = createEvent('test-org', 'repo-alpha');
    (event.payload.issue as Record<string, unknown>).labels = undefined;
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    await logic.execute(event);
    const issueInfo = setBacklogProjectsMock.mock.calls[0][0];

    expect(issueInfo.labels).toStrictEqual([]);
  });
});
