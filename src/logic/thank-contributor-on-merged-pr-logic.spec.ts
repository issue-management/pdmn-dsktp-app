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

import { CommentHelper } from '/@/helpers/comment-helper';
import { MaintainerHelper } from '/@/helpers/maintainer-helper';
import { MergedPrCounterHelper } from '/@/helpers/merged-pr-counter-helper';
import { MilestoneBadgeHelper } from '/@/helpers/milestone-badge-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import { ThankContributorOnMergedPrLogic } from '/@/logic/thank-contributor-on-merged-pr-logic';

describe(ThankContributorOnMergedPrLogic, () => {
  let container: Container;
  let createCommentMock: ReturnType<
    typeof vi.fn<(owner: string, repo: string, issueNumber: number, body: string) => Promise<void>>
  >;
  let isMaintainerOrOrgMemberMock: ReturnType<typeof vi.fn<(username: string, org: string) => Promise<boolean>>>;
  let countMergedPrsByAuthorMock: ReturnType<
    typeof vi.fn<(author: string, owner: string, repo: string) => Promise<number>>
  >;
  let getRandomBadgeUrlMock: ReturnType<typeof vi.fn<(milestone: number) => Promise<string | undefined>>>;
  let isKnownRepositoryMock: ReturnType<typeof vi.fn<(owner: string, repo: string) => boolean>>;

  function createEvent(
    overrides: {
      merged?: boolean;
      owner?: string;
      repo?: string;
      author?: string;
      userType?: string;
      prNumber?: number;
    } = {},
  ): EmitterWebhookEvent<'pull_request.closed'> {
    return {
      id: 'event-id',
      name: 'pull_request',
      payload: {
        action: 'closed',
        pull_request: {
          number: overrides.prNumber ?? 42,
          merged: overrides.merged ?? true,
          user: {
            login: overrides.author ?? 'contributor-user',
            type: overrides.userType ?? 'User',
          },
        },
        repository: {
          name: overrides.repo ?? 'repo-alpha',
          owner: { login: overrides.owner ?? 'test-org' },
        },
      },
    } as unknown as EmitterWebhookEvent<'pull_request.closed'>;
  }

  beforeEach(() => {
    vi.resetAllMocks();

    createCommentMock = vi
      .fn<(owner: string, repo: string, issueNumber: number, body: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    isMaintainerOrOrgMemberMock = vi.fn<(username: string, org: string) => Promise<boolean>>().mockResolvedValue(false);
    countMergedPrsByAuthorMock = vi
      .fn<(author: string, owner: string, repo: string) => Promise<number>>()
      .mockResolvedValue(1);
    getRandomBadgeUrlMock = vi
      .fn<(milestone: number) => Promise<string | undefined>>()
      .mockResolvedValue('https://example.com/badge.png');
    isKnownRepositoryMock = vi.fn<(owner: string, repo: string) => boolean>().mockReturnValue(true);

    container = new Container();
    container.bind(ThankContributorOnMergedPrLogic).toSelf().inSingletonScope();
    container.bind(CommentHelper).toConstantValue({ createComment: createCommentMock } as unknown as CommentHelper);
    container
      .bind(MaintainerHelper)
      .toConstantValue({ isMaintainerOrOrgMember: isMaintainerOrOrgMemberMock } as unknown as MaintainerHelper);
    container
      .bind(MergedPrCounterHelper)
      .toConstantValue({ countMergedPrsByAuthor: countMergedPrsByAuthorMock } as unknown as MergedPrCounterHelper);
    container
      .bind(MilestoneBadgeHelper)
      .toConstantValue({ getRandomBadgeUrl: getRandomBadgeUrlMock } as unknown as MilestoneBadgeHelper);
    container
      .bind(RepositoriesHelper)
      .toConstantValue({ isKnownRepository: isKnownRepositoryMock } as unknown as RepositoriesHelper);
  });

  test('skips when pr is closed but not merged', async () => {
    expect.assertions(1);

    const event = createEvent({ merged: false });
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(createCommentMock).not.toHaveBeenCalled();
  });

  test('skips when repository is not watched', async () => {
    expect.assertions(1);

    isKnownRepositoryMock.mockReturnValue(false);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(createCommentMock).not.toHaveBeenCalled();
  });

  test('skips when author is a bot', async () => {
    expect.assertions(1);

    const event = createEvent({ userType: 'Bot' });
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(createCommentMock).not.toHaveBeenCalled();
  });

  test('skips when author is a maintainer', async () => {
    expect.assertions(1);

    isMaintainerOrOrgMemberMock.mockResolvedValue(true);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(createCommentMock).not.toHaveBeenCalled();
  });

  test('skips when merged pr count is not a milestone', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(5);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(createCommentMock).not.toHaveBeenCalled();
  });

  test('posts comment for first contribution', async () => {
    expect.assertions(2);

    countMergedPrsByAuthorMock.mockResolvedValue(1);
    const event = createEvent({ author: 'new-contributor', prNumber: 99 });
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(createCommentMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 99, expect.any(String));

    const body = createCommentMock.mock.calls[0][3];

    expect(body).toContain('@new-contributor');
  });

  test('uses first contribution template for count 1', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(1);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    const body = createCommentMock.mock.calls[0][3];

    expect(body).toContain('First Contribution');
  });

  test('uses milestone 10 template with impact message', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(10);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    const body = createCommentMock.mock.calls[0][3];

    expect(body).toContain('10 merged PRs');
  });

  test('uses milestone 25 template with momentum message', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(25);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    const body = createCommentMock.mock.calls[0][3];

    expect(body).toContain('25 merged PRs');
  });

  test('uses milestone 50 template with fire message', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(50);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    const body = createCommentMock.mock.calls[0][3];

    expect(body).toContain('50 merged PRs');
  });

  test('includes badge url from milestone badge helper in comment', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(10);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    const body = createCommentMock.mock.calls[0][3];

    expect(body).toContain('https://example.com/badge.png');
  });

  test('uses empty string when badge url is undefined', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(10);
    getRandomBadgeUrlMock.mockResolvedValue(undefined);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    const body = createCommentMock.mock.calls[0][3];

    expect(body).not.toContain('undefined');
  });

  test('calls getRandomBadgeUrl with the milestone count', async () => {
    expect.assertions(1);

    countMergedPrsByAuthorMock.mockResolvedValue(25);
    const event = createEvent();
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(getRandomBadgeUrlMock).toHaveBeenCalledExactlyOnceWith(25);
  });

  test('checks maintainer status with correct org', async () => {
    expect.assertions(1);

    const event = createEvent({ owner: 'my-org', author: 'some-user' });
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(isMaintainerOrOrgMemberMock).toHaveBeenCalledExactlyOnceWith('some-user', 'my-org');
  });

  test('counts merged prs for the correct author', async () => {
    expect.assertions(1);

    const event = createEvent({ author: 'some-contributor' });
    const logic = container.get(ThankContributorOnMergedPrLogic);
    await logic.execute(event);

    expect(countMergedPrsByAuthorMock).toHaveBeenCalledExactlyOnceWith('some-contributor', 'test-org', 'repo-alpha');
  });
});
