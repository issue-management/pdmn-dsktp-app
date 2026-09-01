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
import { Container } from 'inversify';
import { ReviewedCommandOnIssueCommentLogic } from '/@/logic/reviewed-command-on-issue-comment-logic';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [
    { domain: 'Alpha', description: '', owners: ['Alice', 'Bob'] },
    { domain: 'Beta', description: '', owners: ['Charlie'] },
    { domain: 'Gamma/sub1', description: '', owners: ['Alice'] },
    { domain: 'Gamma/sub2', description: '', owners: ['Dave'] },
    { domain: 'UI parts', description: '', owners: ['Eve'] },
  ],
}));

vi.mock(import('/@/data/users-data'), () => ({
  usersData: {
    Alice: 'alice-gh',
    Bob: 'bob-gh',
    Charlie: 'charlie-gh',
    Dave: 'dave-gh',
    Eve: 'eve-gh',
  },
}));

vi.mock(import('/@/data/extra-domains-data'), () => ({
  extraDomainsData: [{ domain: 'dep-update-minor', description: '', owners: ['bot-user'] }],
}));

describe(ReviewedCommandOnIssueCommentLogic, () => {
  let container: Container;
  let logic: ReviewedCommandOnIssueCommentLogic;
  let addLabelMock: ReturnType<typeof vi.fn>;
  let removeLabelMock: ReturnType<typeof vi.fn>;

  function makeCommentEvent(
    overrides: {
      commentBody?: string;
      commenterLogin?: string;
      labels?: { name: string }[];
      owner?: string;
      repo?: string;
      issueNumber?: number;
    } = {},
  ): EmitterWebhookEvent<'issue_comment.created'> {
    return {
      id: 'test-id',
      name: 'issue_comment',
      payload: {
        action: 'created',
        comment: {
          body: overrides.commentBody ?? '/reviewed',
          user: {
            login: overrides.commenterLogin ?? 'alice-gh',
          },
        },
        issue: {
          number: overrides.issueNumber ?? 10,
          labels: overrides.labels ?? [{ name: 'domain/alpha/inreview' }],
        },
        repository: {
          name: overrides.repo ?? 'test-repo',
          owner: { login: overrides.owner ?? 'test-org' },
        },
        installation: { id: 1 },
      },
    } as unknown as EmitterWebhookEvent<'issue_comment.created'>;
  }

  beforeEach(() => {
    container = new Container();

    addLabelMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    removeLabelMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    container.bind(AddLabelHelper).toConstantValue({ addLabel: addLabelMock } as unknown as AddLabelHelper);
    container.bind(RemoveLabelHelper).toConstantValue({ removeLabel: removeLabelMock } as unknown as RemoveLabelHelper);
    container.bind(DomainsHelper).to(DomainsHelper).inSingletonScope();
    container.bind(ReviewedCommandOnIssueCommentLogic).to(ReviewedCommandOnIssueCommentLogic).inSingletonScope();

    logic = container.get(ReviewedCommandOnIssueCommentLogic);
  });

  test('skips when comment does not start with /reviewed', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({ commentBody: 'looks good to me' });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });

  test('skips when issue has no inreview domain labels', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({ labels: [{ name: 'kind/bug' }] });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });

  test('skips when issue has no labels', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({ labels: [] });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });

  test('skips when commenter does not own any domains', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({ commenterLogin: 'random-user' });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });

  test('swaps inreview to reviewed for a domain the commenter owns', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('swaps all owned domain labels when no argument given', async () => {
    expect.assertions(4);

    const event = makeCommentEvent({
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }, { name: 'domain/gamma/inreview' }, { name: 'domain/beta/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledWith('domain/alpha/inreview', expect.objectContaining({ number: 10 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/alpha/reviewed'], expect.objectContaining({ number: 10 }));
    expect(removeLabelMock).toHaveBeenCalledWith('domain/gamma/inreview', expect.objectContaining({ number: 10 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/gamma/reviewed'], expect.objectContaining({ number: 10 }));
  });

  test('does not swap domain labels the commenter does not own', async () => {
    expect.assertions(3);

    const event = makeCommentEvent({
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }, { name: 'domain/beta/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
    expect(removeLabelMock).not.toHaveBeenCalledWith('domain/beta/inreview', expect.anything());
  });

  test('swaps only the targeted domain when argument given', async () => {
    expect.assertions(3);

    const event = makeCommentEvent({
      commentBody: '/reviewed alpha',
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }, { name: 'domain/gamma/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
    expect(removeLabelMock).not.toHaveBeenCalledWith('domain/gamma/inreview', expect.anything());
  });

  test('handles domain argument with domain/ prefix', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commentBody: '/reviewed domain/alpha/inreview',
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('handles domain argument with /reviewed suffix', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commentBody: '/reviewed alpha/reviewed',
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('handles case-insensitive domain argument', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commentBody: '/reviewed Alpha',
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('handles domain argument with spaces normalized to hyphens', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commentBody: '/reviewed UI parts',
      commenterLogin: 'eve-gh',
      labels: [{ name: 'domain/ui-parts/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/ui-parts/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/ui-parts/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('subgroup owner can mark parent domain as reviewed', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commenterLogin: 'dave-gh',
      labels: [{ name: 'domain/gamma/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/gamma/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/gamma/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('skips already reviewed domain labels', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/reviewed' }],
    });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });

  test('only processes first line of multiline comment', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commentBody: '/reviewed\nsome additional context here',
      commenterLogin: 'alice-gh',
      labels: [{ name: 'domain/alpha/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('handles extra-domain owners using direct github username', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commenterLogin: 'bot-user',
      labels: [{ name: 'domain/dep-update-minor/inreview' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/dep-update-minor/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/dep-update-minor/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('ignores non-domain labels alongside domain labels', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commenterLogin: 'alice-gh',
      labels: [{ name: 'kind/bug' }, { name: 'domain/alpha/inreview' }, { name: 'priority/high' }],
    });
    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/alpha/inreview',
      expect.objectContaining({ number: 10 }),
    );
    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/alpha/reviewed'],
      expect.objectContaining({ number: 10 }),
    );
  });

  test('skips when targeted domain does not match any inreview label', async () => {
    expect.assertions(2);

    const event = makeCommentEvent({
      commentBody: '/reviewed beta',
      commenterLogin: 'charlie-gh',
      labels: [{ name: 'domain/alpha/inreview' }],
    });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });
});
