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
import type { EmitterWebhookEvent } from '@octokit/webhooks';

import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { RerequestChangesRequestedReviewersLogic } from '/@/logic/rerequest-changes-requested-reviewers-logic';

type Review = { user: string; state: string };

describe(RerequestChangesRequestedReviewersLogic, () => {
  let container: Container;
  let listReviewsMock: ReturnType<typeof vi.fn<(owner: string, repo: string, pullNumber: number) => Promise<Review[]>>>;
  let requestReviewersMock: ReturnType<
    typeof vi.fn<(owner: string, repo: string, pullNumber: number, reviewers: string[]) => Promise<void>>
  >;

  const event = {
    id: 'event-id',
    name: 'pull_request',
    payload: {
      action: 'synchronize',
      pull_request: { number: 42, user: { login: 'alice-gh' } },
      repository: { name: 'repo-alpha', owner: { login: 'test-org' } },
    },
  } as unknown as EmitterWebhookEvent<'pull_request.synchronize'>;

  beforeEach(() => {
    vi.resetAllMocks();

    listReviewsMock = vi.fn<(owner: string, repo: string, pullNumber: number) => Promise<Review[]>>();
    requestReviewersMock = vi
      .fn<(owner: string, repo: string, pullNumber: number, reviewers: string[]) => Promise<void>>()
      .mockResolvedValue(undefined);

    container = new Container();
    container.bind(RerequestChangesRequestedReviewersLogic).toSelf().inSingletonScope();
    container.bind(PullRequestsHelper).toConstantValue({
      listReviews: listReviewsMock,
      requestReviewers: requestReviewersMock,
    } as unknown as PullRequestsHelper);
  });

  test.each<{ name: string; reviews: Review[]; expected: string[] }>([
    {
      name: 'changes requested',
      reviews: [{ user: 'bob-gh', state: 'CHANGES_REQUESTED' }],
      expected: ['bob-gh'],
    },
    {
      name: 'changes requested followed by a comment',
      reviews: [
        { user: 'bob-gh', state: 'CHANGES_REQUESTED' },
        { user: 'bob-gh', state: 'COMMENTED' },
      ],
      expected: ['bob-gh'],
    },
    {
      name: 'mixed reviewers',
      reviews: [
        { user: 'bob-gh', state: 'CHANGES_REQUESTED' },
        { user: 'carol-gh', state: 'APPROVED' },
        { user: 'dave-gh', state: 'CHANGES_REQUESTED' },
      ],
      expected: ['bob-gh', 'dave-gh'],
    },
  ])('re-requests reviewers for $name', async ({ reviews, expected }) => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue(reviews);
    await container.get(RerequestChangesRequestedReviewersLogic).execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, expected);
  });

  test.each<{ name: string; reviews: Review[] }>([
    { name: 'approved', reviews: [{ user: 'bob-gh', state: 'APPROVED' }] },
    {
      name: 'changes requested then approved',
      reviews: [
        { user: 'bob-gh', state: 'CHANGES_REQUESTED' },
        { user: 'bob-gh', state: 'APPROVED' },
      ],
    },
    {
      name: 'changes requested then dismissed',
      reviews: [
        { user: 'bob-gh', state: 'CHANGES_REQUESTED' },
        { user: 'bob-gh', state: 'DISMISSED' },
      ],
    },
    { name: 'only commented', reviews: [{ user: 'bob-gh', state: 'COMMENTED' }] },
    { name: 'pr author', reviews: [{ user: 'alice-gh', state: 'CHANGES_REQUESTED' }] },
    { name: 'no reviews', reviews: [] },
  ])('does not request reviewers for $name', async ({ reviews }) => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue(reviews);
    await container.get(RerequestChangesRequestedReviewersLogic).execute(event);

    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('re-requests reviewers when pull request has no author', async () => {
    expect.assertions(1);

    const eventWithoutAuthor = {
      ...event,
      payload: { ...event.payload, pull_request: { number: 42 } },
    } as unknown as EmitterWebhookEvent<'pull_request.synchronize'>;
    listReviewsMock.mockResolvedValue([{ user: 'bob-gh', state: 'CHANGES_REQUESTED' }]);
    await container.get(RerequestChangesRequestedReviewersLogic).execute(eventWithoutAuthor);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, ['bob-gh']);
  });

  test('logs and does not throw when requesting reviewers fails', async () => {
    expect.assertions(1);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    listReviewsMock.mockResolvedValue([{ user: 'bob-gh', state: 'CHANGES_REQUESTED' }]);
    requestReviewersMock.mockRejectedValue(new Error('boom'));
    await container.get(RerequestChangesRequestedReviewersLogic).execute(event);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
