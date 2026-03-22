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
import { DomainReviewCheckRunLogic } from '/@/logic/domain-review-check-run-logic';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { CheckRunHelper } from '/@/helpers/check-run-helper';
import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [
    { domain: 'Beta', description: '', owners: ['Charlie', 'Dave'] },
    { domain: 'Gamma', description: '', owners: ['Alice', 'Eve'] },
    { domain: 'Zeta', description: '', owners: ['Charlie', 'Bob'] },
    { domain: 'Eta', description: '', owners: ['Charlie', 'Bob'] },
    { domain: 'repo-alpha', description: '', owners: ['Alice', 'Bob'], repository: 'https://github.com/owner/repo' },
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

describe('domainReviewCheckRunLogic', () => {
  let container: Container;
  let logic: DomainReviewCheckRunLogic;
  let createOrUpdateCheckRunMock: ReturnType<typeof vi.fn>;
  let listReviewsMock: ReturnType<typeof vi.fn>;
  let addLabelMock: ReturnType<typeof vi.fn>;
  let removeLabelMock: ReturnType<typeof vi.fn>;

  function makeReviewEvent(
    overrides: { owner?: string; repo?: string; prNumber?: number; headSha?: string; labels?: { name: string }[] } = {},
  ): EmitterWebhookEvent<'pull_request_review'> {
    return {
      id: 'test-id',
      name: 'pull_request_review',
      payload: {
        action: 'submitted',
        review: {
          id: 1,
          user: { login: 'reviewer' },
          state: 'approved',
        },
        pull_request: {
          number: overrides.prNumber ?? 42,
          head: { sha: overrides.headSha ?? 'abc123' },
          labels: overrides.labels ?? [],
        },
        repository: {
          name: overrides.repo ?? 'test-repo',
          owner: { login: overrides.owner ?? 'test-org' },
        },
        installation: { id: 1 },
      },
    } as unknown as EmitterWebhookEvent<'pull_request_review'>;
  }

  beforeEach(() => {
    container = new Container();

    createOrUpdateCheckRunMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    listReviewsMock = vi.fn<() => Promise<{ user: string; state: string }[]>>().mockResolvedValue([]);
    addLabelMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    removeLabelMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);

    container.bind(DomainsHelper).toSelf().inSingletonScope();
    container.bind(DomainReviewCheckRunLogic).toSelf().inSingletonScope();

    const checkRunHelper = { createOrUpdateCheckRun: createOrUpdateCheckRunMock } as unknown as CheckRunHelper;
    container.bind(CheckRunHelper).toConstantValue(checkRunHelper);

    const pullRequestsHelper = { listReviews: listReviewsMock } as unknown as PullRequestsHelper;
    container.bind(PullRequestsHelper).toConstantValue(pullRequestsHelper);

    const addLabelHelper = { addLabel: addLabelMock } as unknown as AddLabelHelper;
    container.bind(AddLabelHelper).toConstantValue(addLabelHelper);

    const removeLabelHelper = { removeLabel: removeLabelMock } as unknown as RemoveLabelHelper;
    container.bind(RemoveLabelHelper).toConstantValue(removeLabelHelper);

    logic = container.get(DomainReviewCheckRunLogic);
  });

  test('sets check to failure when no domain labels on PR', async () => {
    expect.assertions(1);

    const event = makeReviewEvent({ labels: [] });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'completed',
      'failure',
      'No domain labels found',
      expect.stringContaining('No domain labels found'),
    );
  });

  test('sets check to pending when domain exists but no approvals', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('Pending'),
    );
  });

  test('sets check to success when all domains have at least one owner approval', async () => {
    expect.assertions(1);

    // Beta domain owners: Charlie(charlie-gh), Dave(dave-gh)
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });

  test('stays pending when one domain is approved but another is not', async () => {
    expect.assertions(2);

    // Beta owners: charlie-gh, dave-gh
    // Gamma owners: alice-gh, eve-gh
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('Pending'),
    );

    // Summary should show Beta as approved and Gamma as pending
    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('Approved');
  });

  test('one reviewer covering multiple domains satisfies all', async () => {
    expect.assertions(1);

    // Zeta owners: Charlie(charlie-gh), Bob(bob-gh)
    // Eta owners: Charlie(charlie-gh), Bob(bob-gh)
    // Charlie-gh is in both domains
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/zeta/inreview' }, { name: 'domain/eta/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });

  test('uses latest review state per reviewer (last review wins)', async () => {
    expect.assertions(1);

    // Reviewer approved then requested changes — last state wins
    listReviewsMock.mockResolvedValue([
      { user: 'charlie-gh', state: 'APPROVED' },
      { user: 'charlie-gh', state: 'CHANGES_REQUESTED' },
    ]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    // Should be pending because latest review is CHANGES_REQUESTED
    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('Pending'),
    );
  });

  test('updateCheckRun can be called directly with domains', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'TestDomain', description: '', owners: ['Alice'] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('TestDomain'),
    );
  });

  test('updateCheckRun sets failure when empty domains array', async () => {
    expect.assertions(1);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', []);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'completed',
      'failure',
      'No domain labels found',
      expect.stringContaining('No domain labels found'),
    );
  });

  test('markdown summary shows approved and pending domains correctly', async () => {
    expect.assertions(4);

    // Beta owners: charlie-gh, dave-gh — charlie-gh approved
    // Gamma owners: alice-gh, eve-gh — nobody approved
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('## Domain Review Status');
    expect(summary).toContain('Beta');
    expect(summary).toContain('@charlie-gh');
    expect(summary).toContain('Awaiting: @alice-gh, @eve-gh');
  });

  test('handles PR with no labels property (undefined fallback)', async () => {
    expect.assertions(1);

    const event = makeReviewEvent({});
    // Remove labels to trigger ?? [] fallback
    delete (event.payload.pull_request as Record<string, unknown>).labels;

    await logic.execute(event);

    // No domains found → failure
    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'completed',
      'failure',
      'No domain labels found',
      expect.stringContaining('No domain labels found'),
    );
  });

  test('skips reviews with empty user string', async () => {
    expect.assertions(1);

    // Review with empty user should be ignored
    listReviewsMock.mockResolvedValue([
      { user: '', state: 'APPROVED' },
      { user: 'charlie-gh', state: 'APPROVED' },
    ]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });

  test('handles area/* labels in addition to domain/* labels', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'area/beta' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });

  test('swaps label from inreview to reviewed when domain owner approves', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledWith('domain/beta/inreview', expect.objectContaining({ number: 42 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/beta/reviewed'], expect.objectContaining({ number: 42 }));
  });

  test('swaps label from reviewed back to inreview when approval is rescinded', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([
      { user: 'charlie-gh', state: 'APPROVED' },
      { user: 'charlie-gh', state: 'CHANGES_REQUESTED' },
    ]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/reviewed' }],
    });

    await logic.execute(event);

    expect(removeLabelMock).toHaveBeenCalledWith('domain/beta/reviewed', expect.objectContaining({ number: 42 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/beta/inreview'], expect.objectContaining({ number: 42 }));
  });

  test('swaps labels independently for multiple domains', async () => {
    expect.assertions(4);

    // Beta: charlie-gh approved; Gamma: nobody approved
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    // Beta approved → swap to reviewed
    expect(removeLabelMock).toHaveBeenCalledWith('domain/beta/inreview', expect.objectContaining({ number: 42 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/beta/reviewed'], expect.objectContaining({ number: 42 }));

    // Gamma not approved → swap to inreview (already there, but logic still calls it)
    expect(removeLabelMock).toHaveBeenCalledWith('domain/gamma/reviewed', expect.objectContaining({ number: 42 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/gamma/inreview'], expect.objectContaining({ number: 42 }));
  });

  test('does not swap labels when updateCheckRun called without issueInfo', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'TestDomain', description: '', owners: ['Alice'] },
    ]);

    expect(addLabelMock).not.toHaveBeenCalled();
    expect(removeLabelMock).not.toHaveBeenCalled();
  });

  test('passes check run when only domain is dependency-update-minor', async () => {
    expect.assertions(1);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'dependency-update-minor', description: 'Minor or patch dependency version bumps', owners: [] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'completed',
      'success',
      'Minor/patch dependency updates only',
      expect.stringContaining('minor/patch'),
    );
  });

  test('does not auto-pass when dependency-update-minor appears alongside other domains', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'dependency-update-minor', description: '', owners: [] },
      { domain: 'Foundations', description: '', owners: ['Alice'] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('dependency-update-minor'),
    );
  });

  test('empty-owner domains inherit reviewers from repository domain', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'dependency-update-major', description: '', owners: [] },
      { domain: 'Foundations', description: '', owners: ['Alice'] },
    ]);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    // Dependency-update-major should inherit repo-alpha owners (alice-gh, bob-gh) and be pending
    expect(summary).toContain('dependency-update-major');
    expect(summary).toContain('Pending');
  });

  test('empty-owner domains show inherited-review when no repository domain exists', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([]);

    // Use a repo that has no domain entry
    await logic.updateCheckRun('unknown-org', 'unknown-repo', 1, 'sha1', [
      { domain: 'dependency-update-major', description: '', owners: [] },
    ]);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('dependency-update-major');
    expect(summary).toContain('Inherited review');
  });
});
