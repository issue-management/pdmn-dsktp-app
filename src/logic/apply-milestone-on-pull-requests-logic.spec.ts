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

import type { Mock } from 'vitest';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import 'reflect-metadata';

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { PullRequestInfo } from '/@/info/pull-request-info';
import type { TagDefinition } from '/@/helpers/tags-helper';
import { TagsHelper } from '/@/helpers/tags-helper';

import { ApplyMilestoneOnPullRequestsLogic } from '/@/logic/apply-milestone-on-pull-requests-logic';
import { Container } from 'inversify';
import { IssueMilestoneHelper } from '/@/helpers/issue-milestone-helper';
import { PodmanDesktopVersionFetcher } from '/@/fetchers/podman-desktop-version-fetcher';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';

describe('test Apply Milestone Logic', () => {
  let container: Container;
  let octokit: {
    rest: {
      issues: {
        createMilestone: Mock<() => unknown>;
        updateMilestone: Mock<() => unknown>;
      };
    };
  };

  let issueMilestoneHelper: IssueMilestoneHelper;
  let pullRequestsHelper: PullRequestsHelper;
  let podmanDesktopVersionFetcher: PodmanDesktopVersionFetcher;
  let tagsHelper: TagsHelper;

  beforeEach(() => {
    container = new Container();

    issueMilestoneHelper = {
      setMilestone: vi.fn<() => Promise<unknown>>(),
    } as unknown as IssueMilestoneHelper;
    pullRequestsHelper = {
      getRecentMerged: vi.fn<() => Promise<unknown[]>>(),
    } as unknown as PullRequestsHelper;
    podmanDesktopVersionFetcher = {
      getVersion: vi.fn<() => Promise<string>>(),
    } as unknown as PodmanDesktopVersionFetcher;

    tagsHelper = {
      getLatestTags: vi.fn<() => Promise<unknown>>(),
    } as unknown as TagsHelper;

    container.bind(PodmanDesktopVersionFetcher).toConstantValue(podmanDesktopVersionFetcher);
    container.bind(IssueMilestoneHelper).toConstantValue(issueMilestoneHelper);
    container.bind(PullRequestsHelper).toConstantValue(pullRequestsHelper);
    container.bind(TagsHelper).toConstantValue(tagsHelper);
    container.bind(ApplyMilestoneOnPullRequestsLogic).toSelf().inSingletonScope();
    octokit = {
      rest: {
        issues: { createMilestone: vi.fn<() => unknown>(), updateMilestone: vi.fn<() => unknown>() },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    container.bind('string').toConstantValue('fooToken').whenNamed('GRAPHQL_READ_TOKEN');
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('no che milestone', async () => {
    expect.assertions(1);

    container.bind('number').toConstantValue(50).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(podmanDesktopVersionFetcher.getVersion).toHaveBeenCalledWith();
  });

  test('limit set to 0', async () => {
    expect.assertions(1);

    // Limit the number to zero
    container.bind('number').toConstantValue(0).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.17.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('main');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-theia');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(new Map());

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    // Check we never call setMilestone as we limit the number of milestones
    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledTimes(0);
  });

  test('merged into master', async () => {
    expect.assertions(3);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.17.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('main');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-theia');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(new Map());

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledWith(expect.anything(), expect.anything());

    // Get milestone
    const call = vi.mocked(issueMilestoneHelper.setMilestone).mock.calls[0];

    expect(call[0]).toBe('7.17.0');
    expect(call[1]).toBe(firstPullRequestInfo);
  });

  test('merged into master but no che milestone found', async () => {
    expect.assertions(1);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('a.b.c');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('main');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-theia');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(new Map());

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledTimes(0);
  });

  test('merged into master after tag (so milestone = tag + 1 minor)', async () => {
    expect.assertions(3);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.17.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('main');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-theia');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    const tagDefinitionsMap = new Map<string, TagDefinition[]>();
    const tagDefinitions: TagDefinition[] = [
      {
        committedDate: '2020-07-04',
        name: '7.17.0',
      },
    ];
    tagDefinitionsMap.set('eclipse/che-theia', tagDefinitions);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(tagDefinitionsMap);

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledWith(expect.anything(), expect.anything());

    // Get milestone
    const call = vi.mocked(issueMilestoneHelper.setMilestone).mock.calls[0];

    expect(call[0]).toBe('7.18');
    expect(call[1]).toBe(firstPullRequestInfo);
  });

  test('merged into master before tag (so milestone = tag )', async () => {
    expect.assertions(3);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.17.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo()
      .withMergingBranch('main')
      .withOwner('eclipse')
      .withRepo('che-theia')
      .withMergedAt('2020-06-04');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    const tagDefinitionsMap = new Map<string, TagDefinition[]>();
    const tagDefinitions: TagDefinition[] = [
      {
        committedDate: '2020-07-04',
        name: '7.17.0',
      },
    ];
    tagDefinitionsMap.set('eclipse/che-theia', tagDefinitions);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(tagDefinitionsMap);

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledWith(expect.anything(), expect.anything());

    // Get milestone
    const call = vi.mocked(issueMilestoneHelper.setMilestone).mock.calls[0];

    expect(call[0]).toBe('7.17');
    expect(call[1]).toBe(firstPullRequestInfo);
  });

  test('merged into master after tag (so milestone = tag + 1 minor) but different layout of tags', async () => {
    expect.assertions(3);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.17.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('main');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-operator');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    const tagDefinitionsMap = new Map<string, TagDefinition[]>();
    const tagDefinitions: TagDefinition[] = [
      {
        committedDate: '2020-07-04',
        name: 'v7.17.0',
      },
    ];
    tagDefinitionsMap.set('eclipse/che-operator', tagDefinitions);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(tagDefinitionsMap);

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledWith(expect.anything(), expect.anything());

    // Get milestone
    const call = vi.mocked(issueMilestoneHelper.setMilestone).mock.calls[0];

    expect(call[0]).toBe('7.18');
    expect(call[1]).toBe(firstPullRequestInfo);
  });

  test('merged into master before tag (so milestone = tag)', async () => {
    expect.assertions(3);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.17.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('main');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-operator');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    const tagDefinitionsMap = new Map<string, TagDefinition[]>();
    const tagDefinitions: TagDefinition[] = [
      {
        committedDate: '2020-09-04',
        name: '7.17.0',
      },
    ];
    tagDefinitionsMap.set('eclipse/che-theia', tagDefinitions);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(tagDefinitionsMap);

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledWith(expect.anything(), expect.anything());

    // Get milestone
    const call = vi.mocked(issueMilestoneHelper.setMilestone).mock.calls[0];

    expect(call[0]).toBe('7.17.0');
    expect(call[1]).toBe(firstPullRequestInfo);
  });

  test('merged into 7.16.x branch (so milestone = branch tag)', async () => {
    expect.assertions(3);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.18.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('7.16.x');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-theia');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    const tagDefinitionsMap = new Map<string, TagDefinition[]>();
    const tagDefinitions: TagDefinition[] = [
      {
        committedDate: '2020-07-04',
        name: '7.17.0',
      },
      {
        committedDate: '2020-07-04',
        name: '7.16.0',
      },
      {
        committedDate: '2020-07-04',
        name: '7.16.1',
      },
    ];
    tagDefinitionsMap.set('eclipse/che-theia', tagDefinitions);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(tagDefinitionsMap);

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledWith(expect.anything(), expect.anything());

    // Get milestone
    const call = vi.mocked(issueMilestoneHelper.setMilestone).mock.calls[0];

    expect(call[0]).toBe('7.16.0');
    expect(call[1]).toBe(firstPullRequestInfo);
  });

  test('merged into custom name branch (so no milestone set)', async () => {
    expect.assertions(1);

    // Limit the number to zero
    container.bind('number').toConstantValue(10).whenNamed('MAX_SET_MILESTONE_PER_RUN');

    vi.mocked(podmanDesktopVersionFetcher.getVersion).mockResolvedValue('7.18.0');

    const pullRequestInfos: PullRequestInfo[] = [];

    const firstPullRequestInfo = new PullRequestInfo();
    firstPullRequestInfo.withMergingBranch('foobar');
    firstPullRequestInfo.withOwner('eclipse');
    firstPullRequestInfo.withRepo('che-theia');

    pullRequestInfos.push(firstPullRequestInfo);
    vi.mocked(pullRequestsHelper.getRecentMerged).mockResolvedValue(pullRequestInfos);

    const tagDefinitionsMap = new Map<string, TagDefinition[]>();
    const tagDefinitions: TagDefinition[] = [
      {
        committedDate: '2020-07-04',
        name: '7.17.0',
      },
      {
        committedDate: '2020-07-04',
        name: '7.16.0',
      },
      {
        committedDate: '2020-07-04',
        name: '7.16.1',
      },
    ];
    tagDefinitionsMap.set('eclipse/che-theia', tagDefinitions);

    vi.mocked(tagsHelper.getLatestTags).mockResolvedValue(tagDefinitionsMap);

    const syncMilestoneLogic = container.get(ApplyMilestoneOnPullRequestsLogic);

    await syncMilestoneLogic.execute({} as unknown as EmitterWebhookEvent<'push'>);

    expect(issueMilestoneHelper.setMilestone).toHaveBeenCalledTimes(0);
  });
});
