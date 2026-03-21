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
import { IssueInfo } from '/@/info/issue-info';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { ProjectsHelper } from '/@/helpers/projects-helper';
import { ApplyProjectsOnIssuesLogic } from '/@/logic/apply-issue-in-backlog-projects';

describe('applyProjectsOnIssuesLogic', () => {
  let container: Container;
  let issuesHelper: { getRecentIssues: ReturnType<typeof vi.fn> };
  let projectsHelper: { setBacklogProjects: ReturnType<typeof vi.fn> };
  const pushEvent = {} as EmitterWebhookEvent<'push'>;

  beforeEach(() => {
    vi.resetAllMocks();

    issuesHelper = {
      getRecentIssues: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    };
    projectsHelper = {
      setBacklogProjects: vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    };

    container = new Container();
    container.bind(ApplyProjectsOnIssuesLogic).toSelf().inSingletonScope();
    container.bind(IssuesHelper).toConstantValue(issuesHelper as unknown as IssuesHelper);
    container.bind(ProjectsHelper).toConstantValue(projectsHelper as unknown as ProjectsHelper);
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_ISSUES_PER_RUN');
  });

  test('no issues returns without calling setBacklogProjects', async () => {
    expect.assertions(1);

    issuesHelper.getRecentIssues.mockResolvedValue([]);

    const logic = container.get(ApplyProjectsOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(projectsHelper.setBacklogProjects).not.toHaveBeenCalled();
  });

  test('issues already in planning project are filtered out', async () => {
    expect.assertions(1);

    const issue = new IssueInfo()
      .withId('id1')
      .withLabels([])
      .withProjectItems([{ name: 'Planning', projectId: 'PVT_kwDOB71_hM4AxfY6', projectNumber: '4' }])
      .withNumber(1)
      .withOwner('owner')
      .withRepo('repo')
      .withHtmlLink('https://github.com/owner/repo/issues/1');

    issuesHelper.getRecentIssues.mockResolvedValue([issue]);

    const logic = container.get(ApplyProjectsOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(projectsHelper.setBacklogProjects).not.toHaveBeenCalled();
  });

  test('issues not in planning project get setBacklogProjects called', async () => {
    expect.assertions(1);

    const issue = new IssueInfo()
      .withId('id1')
      .withLabels([])
      .withProjectItems([])
      .withNumber(1)
      .withOwner('owner')
      .withRepo('repo')
      .withHtmlLink('https://github.com/owner/repo/issues/1');

    issuesHelper.getRecentIssues.mockResolvedValue([issue]);

    const logic = container.get(ApplyProjectsOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(projectsHelper.setBacklogProjects).toHaveBeenCalledExactlyOnceWith(issue);
  });

  test('wait method resolves after timeout', async () => {
    expect.assertions(1);

    vi.useFakeTimers();
    const logic = container.get(ApplyProjectsOnIssuesLogic);
    const promise = logic.wait(500);
    vi.advanceTimersByTime(500);
    await promise;
    vi.useRealTimers();

    expect(true).toBe(true);
  });

  test('truncates to maxSetMIssuesPerRun when exceeded', async () => {
    expect.assertions(1);

    // Set max to 2
    container.unbind('number');
    container.bind('number').toConstantValue(2).whenNamed('MAX_SET_ISSUES_PER_RUN');

    const issues = Array.from({ length: 5 }, (_, i) =>
      new IssueInfo()
        .withId(`id${i}`)
        .withLabels([])
        .withProjectItems([])
        .withNumber(i + 1)
        .withOwner('owner')
        .withRepo('repo')
        .withHtmlLink(`https://github.com/owner/repo/issues/${i + 1}`),
    );

    issuesHelper.getRecentIssues.mockResolvedValue(issues);

    const logic = container.get(ApplyProjectsOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    // Truncated to maxSetMIssuesPerRun (2), then to 1
    expect(projectsHelper.setBacklogProjects).toHaveBeenCalledTimes(1);
  });

  test('limits to 1 issue even when multiple are eligible', async () => {
    expect.assertions(2);

    const issues = Array.from({ length: 5 }, (_, i) =>
      new IssueInfo()
        .withId(`id${i}`)
        .withLabels([])
        .withProjectItems([])
        .withNumber(i + 1)
        .withOwner('owner')
        .withRepo('repo')
        .withHtmlLink(`https://github.com/owner/repo/issues/${i + 1}`),
    );

    issuesHelper.getRecentIssues.mockResolvedValue(issues);

    const logic = container.get(ApplyProjectsOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    // Should be limited to 1 due to `filteredIssues.length = 1`
    expect(projectsHelper.setBacklogProjects).toHaveBeenCalledTimes(1);
    expect(projectsHelper.setBacklogProjects).toHaveBeenCalledWith(issues[0]);
  });
});
