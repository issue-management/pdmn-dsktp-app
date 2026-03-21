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

import { describe, test, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';

import type { PullRequestInfo } from '/@/info/pull-request-info';
import { PullRequestInfoBuilder } from '/@/info/pull-request-info';

import { Container } from 'inversify';
import { IssueMilestoneHelper } from '/@/helpers/issue-milestone-helper';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

describe('test Helper IssuesMilestoneHelper', () => {
  let container: Container;

  let pullRequestInfoLinkedIssuesExtractor: PullRequestInfoLinkedIssuesExtractor;
  let issuesHelper: IssuesHelper;

  beforeEach(() => {
    container = new Container();
    container.bind(IssueMilestoneHelper).toSelf().inSingletonScope();

    pullRequestInfoLinkedIssuesExtractor = {} as unknown as PullRequestInfoLinkedIssuesExtractor;
    container.bind(PullRequestInfoLinkedIssuesExtractor).toConstantValue(pullRequestInfoLinkedIssuesExtractor);

    issuesHelper = {} as unknown as IssuesHelper;
    container.bind(IssuesHelper).toConstantValue(issuesHelper);

    container.bind(PullRequestInfoBuilder).toSelf().inSingletonScope();
  });

  // Check with label existing
  test('call correct API if milestone exists - lists milestones', async () => {
    expect.assertions(3);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: milestoneNumber };
    const secondItem = { title: milestoneToAdd, number: milestoneNumber };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    expect(octokit.rest.issues.listMilestones).toHaveBeenCalledWith(expect.any(Object));

    const listParams = (
      octokit.rest.issues.listMilestones.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['listMilestones']['parameters'];

    expect(listParams.owner).toBe(issueInfo.owner);
    expect(listParams.repo).toBe(issueInfo.repo);
  });

  test('call correct API if milestone exists - does not create milestone', async () => {
    expect.assertions(1);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: milestoneNumber };
    const secondItem = { title: milestoneToAdd, number: milestoneNumber };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    // Do not create as it exists
    expect(octokit.rest.issues.createMilestone).toHaveBeenCalledTimes(0);
  });

  test('call correct API if milestone exists - updates issue with milestone', async () => {
    expect.assertions(4);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: milestoneNumber };
    const secondItem = { title: milestoneToAdd, number: milestoneNumber };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    expect(octokit.rest.issues.update).toHaveBeenCalledWith(expect.any(Object));

    const issueUpdateParams = (
      octokit.rest.issues.update.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(issueUpdateParams.milestone).toBe(milestoneNumber);
    expect(issueUpdateParams.repo).toBe(issueInfo.repo);
    expect(issueUpdateParams.owner).toBe(issueInfo.owner);
  });

  test('call correct API if milestone exists - updates issue with number', async () => {
    expect.assertions(1);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: milestoneNumber };
    const secondItem = { title: milestoneToAdd, number: milestoneNumber };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    const issueUpdateParams = (
      octokit.rest.issues.update.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(issueUpdateParams.issue_number).toBe(issueInfo.number);
  });

  // Check if label does not exist on the issue
  test('call correct API if milestone does not exist - lists milestones with correct params', async () => {
    expect.assertions(3);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: 1 };
    const secondItem = { title: 'bar', number: 2 };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    const createMilestoneResponse = { data: { number: milestoneNumber } };
    vi.mocked(octokit.rest.issues.createMilestone).mockReturnValue(createMilestoneResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    expect(octokit.rest.issues.listMilestones).toHaveBeenCalledWith(expect.any(Object));

    const listParams = (
      octokit.rest.issues.listMilestones.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['listMilestones']['parameters'];

    expect(listParams.owner).toBe(issueInfo.owner);
    expect(listParams.repo).toBe(issueInfo.repo);
  });

  test('call correct API if milestone does not exist - creates milestone with title', async () => {
    expect.assertions(2);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: 1 };
    const secondItem = { title: 'bar', number: 2 };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    const createMilestoneResponse = { data: { number: milestoneNumber } };
    vi.mocked(octokit.rest.issues.createMilestone).mockReturnValue(createMilestoneResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    expect(octokit.rest.issues.createMilestone).toHaveBeenCalledWith(expect.any(Object));

    const createMilestoneParams = (
      octokit.rest.issues.createMilestone.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(createMilestoneParams.title).toBe(milestoneToAdd);
  });

  test('call correct API if milestone does not exist - creates milestone with owner and repo', async () => {
    expect.assertions(2);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: 1 };
    const secondItem = { title: 'bar', number: 2 };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    const createMilestoneResponse = { data: { number: milestoneNumber } };
    vi.mocked(octokit.rest.issues.createMilestone).mockReturnValue(createMilestoneResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    const createMilestoneParams = (
      octokit.rest.issues.createMilestone.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(createMilestoneParams.owner).toBe(issueInfo.owner);
    expect(createMilestoneParams.repo).toBe(issueInfo.repo);
  });

  test('call correct API if milestone does not exist - updates issue with milestone', async () => {
    expect.assertions(4);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: 1 };
    const secondItem = { title: 'bar', number: 2 };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    const createMilestoneResponse = { data: { number: milestoneNumber } };
    vi.mocked(octokit.rest.issues.createMilestone).mockReturnValue(createMilestoneResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    expect(octokit.rest.issues.update).toHaveBeenCalledWith(expect.any(Object));

    const issueUpdateParams = (
      octokit.rest.issues.update.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['update']['parameters'];

    expect(issueUpdateParams.milestone).toBe(milestoneNumber);
    expect(issueUpdateParams.repo).toBe(issueInfo.repo);
    expect(issueUpdateParams.owner).toBe(issueInfo.owner);
  });

  test('call correct API if milestone does not exist - updates issue with number', async () => {
    expect.assertions(1);

    const octokit = {
      rest: {
        issues: {
          listMilestones: vi.fn<() => unknown>(),
          update: vi.fn<() => unknown>(),
          createMilestone: vi.fn<() => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    const addMilestoneHelper = container.get(IssueMilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    // Merged = true
    const issueInfo: PullRequestInfo = container
      .get(PullRequestInfoBuilder)
      .build()
      .withOwner('my-owner')
      .withRepo('repository')
      .withNumber(123)
      .withMergedState(true);

    const firstItem = { title: 'foo', number: 1 };
    const secondItem = { title: 'bar', number: 2 };
    const mockListResponse = { data: [firstItem, secondItem] };
    vi.mocked(octokit.rest.issues.listMilestones).mockReturnValue(mockListResponse);

    const createMilestoneResponse = { data: { number: milestoneNumber } };
    vi.mocked(octokit.rest.issues.createMilestone).mockReturnValue(createMilestoneResponse);

    await addMilestoneHelper.setMilestone(milestoneToAdd, issueInfo);

    const issueUpdateParams = (
      octokit.rest.issues.update.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['update']['parameters'];

    expect(issueUpdateParams.issue_number).toBe(issueInfo.number);
  });
});
