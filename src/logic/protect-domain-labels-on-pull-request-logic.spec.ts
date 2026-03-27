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
import { ProtectDomainLabelsOnPullRequestLogic } from '/@/logic/protect-domain-labels-on-pull-request-logic';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { DetectDomainsHelper } from '/@/helpers/detect-domains-helper';
import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { DomainReviewCheckRunLogic } from '/@/logic/domain-review-check-run-logic';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [
    { domain: 'Alpha', description: '', owners: ['Alice', 'Bob'], repository: 'https://github.com/test-org/test-repo' },
    { domain: 'Beta', description: '', owners: ['Charlie'] },
  ],
}));

vi.mock(import('/@/data/users-data'), () => ({
  usersData: {
    Alice: 'alice-gh',
    Bob: 'bob-gh',
    Charlie: 'charlie-gh',
  },
}));

vi.mock(import('/@/data/extra-domains-data'), () => ({
  extraDomainsData: [],
}));

vi.mock(import('/@/data/folder-domains-data'), () => ({
  folderDomainsData: [],
}));

describe(ProtectDomainLabelsOnPullRequestLogic, () => {
  let container: Container;
  let logic: ProtectDomainLabelsOnPullRequestLogic;
  let addLabelMock: ReturnType<typeof vi.fn>;
  let removeLabelMock: ReturnType<typeof vi.fn>;
  let detectDomainsMock: ReturnType<typeof vi.fn>;
  let updateCheckRunMock: ReturnType<typeof vi.fn>;

  function makeLabelEvent(
    overrides: {
      action?: 'labeled' | 'unlabeled';
      labelName?: string;
      senderType?: string;
      senderLogin?: string;
      labels?: { name: string }[];
      owner?: string;
      repo?: string;
      prNumber?: number;
      headSha?: string;
      baseSha?: string;
      prAuthor?: string;
      body?: string;
    } = {},
  ): EmitterWebhookEvent<'pull_request.labeled'> | EmitterWebhookEvent<'pull_request.unlabeled'> {
    return {
      id: 'test-id',
      name: 'pull_request',
      payload: {
        action: overrides.action ?? 'labeled',
        label: {
          name: overrides.labelName ?? 'domain/alpha/inreview',
        },
        sender: {
          type: overrides.senderType ?? 'User',
          login: overrides.senderLogin ?? 'some-user',
        },
        pull_request: {
          number: overrides.prNumber ?? 42,
          head: { sha: overrides.headSha ?? 'abc123' },
          base: { sha: overrides.baseSha ?? 'base123' },
          user: { login: overrides.prAuthor ?? 'pr-author' },
          body: overrides.body ?? '',
          labels: overrides.labels ?? [{ name: 'domain/alpha/inreview' }],
        },
        repository: {
          name: overrides.repo ?? 'test-repo',
          owner: { login: overrides.owner ?? 'test-org' },
        },
        installation: { id: 1 },
      },
    } as unknown as EmitterWebhookEvent<'pull_request.labeled'> | EmitterWebhookEvent<'pull_request.unlabeled'>;
  }

  beforeEach(() => {
    container = new Container();

    addLabelMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    removeLabelMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    detectDomainsMock = vi.fn<() => Promise<{ domains: { domain: string }[]; files: unknown[] }>>().mockResolvedValue({
      domains: [{ domain: 'Alpha' }],
      files: [],
    });
    updateCheckRunMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    container.bind(AddLabelHelper).toConstantValue({ addLabel: addLabelMock } as unknown as AddLabelHelper);
    container.bind(RemoveLabelHelper).toConstantValue({ removeLabel: removeLabelMock } as unknown as RemoveLabelHelper);
    container.bind(DomainsHelper).to(DomainsHelper).inSingletonScope();
    container
      .bind(DetectDomainsHelper)
      .toConstantValue({ detectDomains: detectDomainsMock } as unknown as DetectDomainsHelper);
    container
      .bind(DomainReviewCheckRunLogic)
      .toConstantValue({ updateCheckRun: updateCheckRunMock } as unknown as DomainReviewCheckRunLogic);
    container.bind(ProtectDomainLabelsOnPullRequestLogic).to(ProtectDomainLabelsOnPullRequestLogic).inSingletonScope();

    logic = container.get(ProtectDomainLabelsOnPullRequestLogic);
  });

  test('skips when sender is a bot', async () => {
    expect.assertions(2);

    const event = makeLabelEvent({ senderType: 'Bot', senderLogin: 'my-app[bot]' });
    await logic.execute(event);

    expect(detectDomainsMock).not.toHaveBeenCalled();
    expect(updateCheckRunMock).not.toHaveBeenCalled();
  });

  test('skips when label is not a domain label', async () => {
    expect.assertions(2);

    const event = makeLabelEvent({ labelName: 'kind/bug' });
    await logic.execute(event);

    expect(detectDomainsMock).not.toHaveBeenCalled();
    expect(updateCheckRunMock).not.toHaveBeenCalled();
  });

  test('skips when label is a partial domain label without status', async () => {
    expect.assertions(2);

    const event = makeLabelEvent({ labelName: 'domain/alpha' });
    await logic.execute(event);

    expect(detectDomainsMock).not.toHaveBeenCalled();
    expect(updateCheckRunMock).not.toHaveBeenCalled();
  });

  test('delegates missing label addition to updateCheckRun when domain is valid', async () => {
    expect.assertions(3);

    detectDomainsMock.mockResolvedValue({
      domains: [{ domain: 'Alpha' }],
      files: [],
    });

    // Alpha label was removed; current labels show it absent
    const event = makeLabelEvent({
      action: 'unlabeled',
      labelName: 'domain/alpha/inreview',
      labels: [],
    });
    await logic.execute(event);

    // Should NOT directly add labels — updateDomainLabels handles it with correct reviewed/inreview
    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();

    // CorrectedIssueInfo should have no domain labels so updateDomainLabels adds the right one
    expect(updateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      42,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ number: 42, labels: [] }),
      expect.any(Array),
    );
  });

  test('does not re-add removed label when domain is not valid for this PR', async () => {
    expect.assertions(3);

    // File detection says only Beta is valid, not Alpha
    detectDomainsMock.mockResolvedValue({
      domains: [{ domain: 'Beta' }],
      files: [],
    });

    const event = makeLabelEvent({
      action: 'unlabeled',
      labelName: 'domain/alpha/inreview',
      labels: [{ name: 'domain/beta/inreview' }],
    });
    await logic.execute(event);

    // Should NOT re-add alpha since it's not a valid domain
    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();

    expect(updateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      42,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ number: 42 }),
      expect.any(Array),
    );
  });

  test('removes bogus manually added domain label and updates check run', async () => {
    expect.assertions(3);

    // File detection says only Alpha is valid
    detectDomainsMock.mockResolvedValue({
      domains: [{ domain: 'Alpha' }],
      files: [],
    });

    // Someone manually added domain/beta/reviewed but Beta is not valid for this PR
    const event = makeLabelEvent({
      action: 'labeled',
      labelName: 'domain/beta/reviewed',
      labels: [{ name: 'domain/alpha/inreview' }, { name: 'domain/beta/reviewed' }],
    });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();

    // Should remove the bogus beta label
    expect(removeLabelMock).toHaveBeenCalledExactlyOnceWith(
      'domain/beta/reviewed',
      expect.objectContaining({ number: 42 }),
    );

    expect(updateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      42,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ number: 42 }),
      expect.any(Array),
    );
  });

  test('preserves reviewed label in correctedIssueInfo when manually swapping inreview to reviewed', async () => {
    expect.assertions(3);

    detectDomainsMock.mockResolvedValue({
      domains: [{ domain: 'Alpha' }],
      files: [],
    });

    // Someone manually changed domain/alpha/inreview to domain/alpha/reviewed
    const event = makeLabelEvent({
      action: 'labeled',
      labelName: 'domain/alpha/reviewed',
      labels: [{ name: 'domain/alpha/reviewed' }],
    });
    await logic.execute(event);

    // No labels to add or remove (alpha is valid, it's present)
    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();

    // CorrectedIssueInfo should preserve the /reviewed suffix, not replace with /inreview
    expect(updateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      42,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ number: 42, labels: ['domain/alpha/reviewed'] }),
      expect.any(Array),
    );
  });

  test('preserves reviewed label for approved domain when another domain label is removed', async () => {
    expect.assertions(3);

    detectDomainsMock.mockResolvedValue({
      domains: [{ domain: 'Alpha' }, { domain: 'Beta' }],
      files: [],
    });

    // Alpha is approved (/reviewed), human removes Beta's /inreview label; kind/bug is a non-domain label
    const event = makeLabelEvent({
      action: 'unlabeled',
      labelName: 'domain/beta/inreview',
      labels: [{ name: 'kind/bug' }, { name: 'domain/alpha/reviewed' }],
    });
    await logic.execute(event);

    // Should not directly add labels — updateDomainLabels handles missing beta
    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();

    // CorrectedIssueInfo should preserve alpha/reviewed, keep non-domain labels, and omit beta
    expect(updateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      42,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ number: 42, labels: ['kind/bug', 'domain/alpha/reviewed'] }),
      expect.any(Array),
    );
  });

  test('skips when detectDomains returns no domains', async () => {
    expect.assertions(3);

    detectDomainsMock.mockResolvedValue({ domains: [], files: [] });

    const event = makeLabelEvent({
      action: 'labeled',
      labelName: 'domain/alpha/inreview',
    });
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
    expect(updateCheckRunMock).not.toHaveBeenCalled();
  });

  test('passes correct parameters to detectDomains', async () => {
    expect.assertions(1);

    const event = makeLabelEvent({
      owner: 'my-org',
      repo: 'my-repo',
      prNumber: 99,
      prAuthor: 'dev-user',
      body: 'Fixes #123',
      baseSha: 'base-sha',
      headSha: 'head-sha',
    });
    await logic.execute(event);

    expect(detectDomainsMock).toHaveBeenCalledExactlyOnceWith(
      'my-org',
      'my-repo',
      99,
      'dev-user',
      'Fixes #123',
      'base-sha',
      'head-sha',
    );
  });

  test('handles missing user and body on pull request', async () => {
    expect.assertions(1);

    const event = makeLabelEvent({
      action: 'labeled',
      labelName: 'domain/alpha/inreview',
    });
    (event.payload.pull_request as Record<string, unknown>).user = undefined;
    (event.payload.pull_request as Record<string, unknown>).body = undefined;
    await logic.execute(event);

    // Should pass empty string for prAuthor and body
    expect(detectDomainsMock).toHaveBeenCalledExactlyOnceWith('test-org', 'test-repo', 42, '', '', 'base123', 'abc123');
  });

  test('handles missing labels array on pull request', async () => {
    expect.assertions(3);

    const event = makeLabelEvent({
      action: 'labeled',
      labelName: 'domain/alpha/inreview',
    });
    // Remove the labels array to test the fallback
    (event.payload.pull_request as Record<string, unknown>).labels = undefined;
    await logic.execute(event);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();

    expect(updateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      42,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ number: 42, labels: [] }),
      expect.any(Array),
    );
  });
});
