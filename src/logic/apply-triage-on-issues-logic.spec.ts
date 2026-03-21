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
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { ApplyTriageOnIssuesLogic } from '/@/logic/apply-triage-on-issues-logic';

describe('applyTriageOnIssuesLogic', () => {
  let container: Container;
  let issuesHelper: { getRecentIssues: ReturnType<typeof vi.fn> };
  let addLabelHelper: { addLabel: ReturnType<typeof vi.fn> };
  const pushEvent = {} as EmitterWebhookEvent<'push'>;

  beforeEach(() => {
    vi.resetAllMocks();

    issuesHelper = {
      getRecentIssues: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    };
    addLabelHelper = {
      addLabel: vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    };

    container = new Container();
    container.bind(ApplyTriageOnIssuesLogic).toSelf().inSingletonScope();
    container.bind(IssuesHelper).toConstantValue(issuesHelper as unknown as IssuesHelper);
    container.bind(AddLabelHelper).toConstantValue(addLabelHelper as unknown as AddLabelHelper);
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_ISSUES_PER_RUN');
  });

  test('no issues returns without calling addLabel', async () => {
    expect.assertions(1);

    issuesHelper.getRecentIssues.mockResolvedValue([]);

    const logic = container.get(ApplyTriageOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(addLabelHelper.addLabel).not.toHaveBeenCalled();
  });

  test('issues with area/* label are filtered out', async () => {
    expect.assertions(1);

    const issue = new IssueInfo()
      .withId('id1')
      .withLabels(['area/networking'])
      .withProjectItems([])
      .withNumber(1)
      .withOwner('owner')
      .withRepo('repo')
      .withHtmlLink('https://github.com/owner/repo/issues/1');

    issuesHelper.getRecentIssues.mockResolvedValue([issue]);

    const logic = container.get(ApplyTriageOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(addLabelHelper.addLabel).not.toHaveBeenCalled();
  });

  test('issues with status/need-triage label are filtered out', async () => {
    expect.assertions(1);

    const issue = new IssueInfo()
      .withId('id1')
      .withLabels(['status/need-triage'])
      .withProjectItems([])
      .withNumber(1)
      .withOwner('owner')
      .withRepo('repo')
      .withHtmlLink('https://github.com/owner/repo/issues/1');

    issuesHelper.getRecentIssues.mockResolvedValue([issue]);

    const logic = container.get(ApplyTriageOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(addLabelHelper.addLabel).not.toHaveBeenCalled();
  });

  test('issues without area/* or status/need-triage labels get addLabel called', async () => {
    expect.assertions(1);

    const issue = new IssueInfo()
      .withId('id1')
      .withLabels(['kind/bug'])
      .withProjectItems([])
      .withNumber(1)
      .withOwner('owner')
      .withRepo('repo')
      .withHtmlLink('https://github.com/owner/repo/issues/1');

    issuesHelper.getRecentIssues.mockResolvedValue([issue]);

    const logic = container.get(ApplyTriageOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    expect(addLabelHelper.addLabel).toHaveBeenCalledExactlyOnceWith(['status/need-triage'], issue);
  });

  test('wait method resolves after timeout', async () => {
    expect.assertions(1);

    vi.useFakeTimers();
    const logic = container.get(ApplyTriageOnIssuesLogic);
    const promise = logic.wait(500);
    vi.advanceTimersByTime(500);
    await promise;
    vi.useRealTimers();

    expect(true).toBe(true);
  });

  test('respects maxSetMIssuesPerRun limit', async () => {
    expect.assertions(1);

    const issues = Array.from({ length: 15 }, (_, i) =>
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

    const logic = container.get(ApplyTriageOnIssuesLogic);
    vi.spyOn(logic, 'wait').mockResolvedValue(undefined);

    await logic.execute(pushEvent);

    // Max is 10, so only 10 should be processed
    expect(addLabelHelper.addLabel).toHaveBeenCalledTimes(10);
  });
});
