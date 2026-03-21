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

import { ApproveAndMergeDependabotPRLogic } from '/@/logic/approve-and-merge-dependabot-pr';
import { PullRequestReviewsHelper } from '/@/helpers/pr-review-helper';
import { PullRequestInfo } from '/@/info/pull-request-info';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

describe('approveAndMergeDependabotPRLogic', () => {
  let container: Container;
  let logic: ApproveAndMergeDependabotPRLogic;
  let getDependabotPRsMock: ReturnType<typeof vi.fn>;
  let approvePullRequestMock: ReturnType<typeof vi.fn>;
  let setAutoMergeMock: ReturnType<typeof vi.fn>;

  function makePushEvent(): EmitterWebhookEvent<'push'> {
    return {
      id: 'test-id',
      name: 'push',
      payload: {
        ref: 'refs/heads/main',
        repository: {
          name: 'podman-desktop',
          owner: { login: 'podman-desktop' },
        },
      },
    } as unknown as EmitterWebhookEvent<'push'>;
  }

  function makePR(
    overrides: {
      title?: string;
      body?: string;
      htmlLink?: string;
      repo?: string;
      owner?: string;
      autoMergeEnabled?: boolean;
      reviewState?: string;
      id?: string;
    } = {},
  ): PullRequestInfo {
    const pr = new PullRequestInfo();
    pr.withTitle(overrides.title ?? 'chore(deps): bump electron from 40.4.1 to 40.8.0')
      .withBody(overrides.body ?? '')
      .withHtmlLink(overrides.htmlLink ?? 'https://github.com/test/test/pull/1')
      .withRepo(overrides.repo ?? 'test-repo')
      .withOwner(overrides.owner ?? 'test-owner')
      .withAutoMergeEnabled(overrides.autoMergeEnabled ?? false)
      .withReviewState((overrides.reviewState ?? 'REVIEW_REQUIRED') as 'REVIEW_REQUIRED')
      .withId(overrides.id ?? 'pr-id-1');
    return pr;
  }

  beforeEach(() => {
    vi.resetAllMocks();

    container = new Container();

    getDependabotPRsMock = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
    approvePullRequestMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    setAutoMergeMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);

    const reviewsHelper = {
      getDependabotPullRequestsRequiringReviewAndPassingAllChecks: getDependabotPRsMock,
      approvePullRequest: approvePullRequestMock,
      setAutoMerge: setAutoMergeMock,
    } as unknown as PullRequestReviewsHelper;

    container.bind(PullRequestReviewsHelper).toConstantValue(reviewsHelper);
    container.bind(ApproveAndMergeDependabotPRLogic).toSelf().inSingletonScope();

    logic = container.get(ApproveAndMergeDependabotPRLogic);
  });

  test('parseDependabotUpdates with single bump title', () => {
    expect.assertions(2);

    const pr = makePR({ title: 'chore(deps): bump electron from 40.4.1 to 40.8.0' });

    const updates = logic.parseDependabotUpdates(pr);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toStrictEqual({
      component: 'electron',
      from: '40.4.1',
      to: '40.8.0',
    });
  });

  test('parseDependabotUpdates with group title containing " group with " and body', () => {
    expect.assertions(3);

    const pr = makePR({
      title: 'chore(deps): bump the dev-deps group with 2 updates',
      body: 'Updates `pkg-a` from 1.0.0 to 1.1.0\nUpdates `pkg-b` from 2.0.0 to 2.0.1',
    });

    const updates = logic.parseDependabotUpdates(pr);

    expect(updates).toHaveLength(2);
    expect(updates[0]).toStrictEqual({ component: 'pkg-a', from: '1.0.0', to: '1.1.0' });
    expect(updates[1]).toStrictEqual({ component: 'pkg-b', from: '2.0.0', to: '2.0.1' });
  });

  test('parseDependabotUpdates with unrecognized title returns empty array', () => {
    expect.assertions(1);

    const pr = makePR({ title: 'some random PR title' });

    const updates = logic.parseDependabotUpdates(pr);

    expect(updates).toStrictEqual([]);
  });

  test('execute with patch update PR approves and sets auto-merge', async () => {
    expect.assertions(2);

    const pr = makePR({
      title: 'chore(deps): bump electron from 40.4.1 to 40.4.2',
      autoMergeEnabled: false,
      reviewState: 'REVIEW_REQUIRED',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr]);

    await logic.execute(makePushEvent());

    expect(setAutoMergeMock).toHaveBeenCalledExactlyOnceWith(pr, 'REBASE');
    expect(approvePullRequestMock).toHaveBeenCalledExactlyOnceWith(pr);
  });

  test('execute with major update PR does not approve', async () => {
    expect.assertions(2);

    const pr = makePR({
      title: 'chore(deps): bump electron from 40.4.1 to 41.0.0',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr]);

    await logic.execute(makePushEvent());

    expect(approvePullRequestMock).not.toHaveBeenCalled();
    expect(setAutoMergeMock).not.toHaveBeenCalled();
  });

  test('execute with PR already approved skips approval', async () => {
    expect.assertions(2);

    const pr = makePR({
      title: 'chore(deps): bump electron from 40.4.1 to 40.4.2',
      autoMergeEnabled: false,
      reviewState: 'APPROVED',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr]);

    await logic.execute(makePushEvent());

    expect(setAutoMergeMock).toHaveBeenCalledExactlyOnceWith(pr, 'REBASE');
    expect(approvePullRequestMock).not.toHaveBeenCalled();
  });

  test('execute with PR already in auto-merge mode skips setAutoMerge', async () => {
    expect.assertions(2);

    const pr = makePR({
      title: 'chore(deps): bump electron from 40.4.1 to 40.4.2',
      autoMergeEnabled: true,
      reviewState: 'REVIEW_REQUIRED',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr]);

    await logic.execute(makePushEvent());

    expect(setAutoMergeMock).not.toHaveBeenCalled();
    expect(approvePullRequestMock).toHaveBeenCalledExactlyOnceWith(pr);
  });

  test('wait method resolves after timeout', async () => {
    expect.assertions(1);

    vi.useFakeTimers();
    const promise = logic.wait(500);
    vi.advanceTimersByTime(500);
    await promise;
    vi.useRealTimers();

    expect(true).toBe(true);
  });

  test('execute with non-semver version does not approve', async () => {
    expect.assertions(2);

    const pr = makePR({
      title: 'chore(deps): bump electron from not-semver to also-not-semver',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr]);

    await logic.execute(makePushEvent());

    expect(approvePullRequestMock).not.toHaveBeenCalled();
    expect(setAutoMergeMock).not.toHaveBeenCalled();
  });

  test('execute deduplicates by repo', async () => {
    expect.assertions(2);

    const pr1 = makePR({
      title: 'chore(deps): bump pkgA from 1.0.0 to 1.0.1',
      repo: 'same-repo',
      id: 'pr-1',
    });
    const pr2 = makePR({
      title: 'chore(deps): bump pkgB from 2.0.0 to 2.0.1',
      repo: 'same-repo',
      id: 'pr-2',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr1, pr2]);

    await logic.execute(makePushEvent());

    // Only 1 should be approved per repo
    expect(setAutoMergeMock).toHaveBeenCalledTimes(1);
    expect(approvePullRequestMock).toHaveBeenCalledTimes(1);
  });

  test('execute handles error in approveAndMergePullRequest', async () => {
    expect.assertions(1);

    const pr = makePR({
      title: 'chore(deps): bump electron from 40.4.1 to 40.4.2',
      autoMergeEnabled: false,
      reviewState: 'REVIEW_REQUIRED',
    });

    getDependabotPRsMock.mockResolvedValueOnce([pr]);
    setAutoMergeMock.mockRejectedValueOnce(new Error('GraphQL error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await logic.execute(makePushEvent());

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error while setting auto-merge'),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});
