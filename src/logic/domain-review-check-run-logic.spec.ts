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
import { FolderDomainsHelper } from '/@/helpers/folder-domains-helper';
import { PullRequestFilesHelper } from '/@/helpers/pull-request-files-helper';
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
    { domain: 'Multi/team-x', description: '', owners: ['Alice'] },
    { domain: 'Multi/team-y', description: '', owners: ['Charlie'] },
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

vi.mock(import('/@/data/folder-domains-data'), () => ({
  folderDomainsData: [],
}));

describe('domainReviewCheckRunLogic', () => {
  let container: Container;
  let logic: DomainReviewCheckRunLogic;
  let createOrUpdateCheckRunMock: ReturnType<typeof vi.fn>;
  let listReviewsMock: ReturnType<typeof vi.fn>;
  let listFilesMock: ReturnType<typeof vi.fn>;
  let getFileToDomainMapMock: ReturnType<typeof vi.fn>;
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
    listFilesMock = vi.fn<() => Promise<{ filename: string; status: string }[]>>().mockResolvedValue([]);
    getFileToDomainMapMock = vi.fn<() => Map<string, string[]>>().mockReturnValue(new Map());
    addLabelMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    removeLabelMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);

    container.bind(DomainsHelper).toSelf().inSingletonScope();
    container.bind(DomainReviewCheckRunLogic).toSelf().inSingletonScope();

    const checkRunHelper = { createOrUpdateCheckRun: createOrUpdateCheckRunMock } as unknown as CheckRunHelper;
    container.bind(CheckRunHelper).toConstantValue(checkRunHelper);

    const pullRequestsHelper = { listReviews: listReviewsMock } as unknown as PullRequestsHelper;
    container.bind(PullRequestsHelper).toConstantValue(pullRequestsHelper);

    const pullRequestFilesHelper = { listFiles: listFilesMock } as unknown as PullRequestFilesHelper;
    container.bind(PullRequestFilesHelper).toConstantValue(pullRequestFilesHelper);

    const folderDomainsHelper = { getFileToDomainMap: getFileToDomainMapMock } as unknown as FolderDomainsHelper;
    container.bind(FolderDomainsHelper).toConstantValue(folderDomainsHelper);

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
      undefined,
      [],
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
      undefined,
      [],
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
      undefined,
      [],
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
      undefined,
      [],
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
      undefined,
      [],
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
      undefined,
      [],
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
      undefined,
      [],
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
      undefined,
      [],
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

  test('requires explicit approval for dependency-update-minor domain', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      {
        domain: 'dependency-update-minor',
        description: 'Minor or patch dependency version bumps',
        owners: ['podman-desktop-bot'],
      },
    ]);

    // Should be pending since no one has approved
    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('dependency-update-minor'),
      undefined,
      [],
    );
  });

  test('dependency-update-minor merges owners with repo owners', async () => {
    expect.assertions(3);

    listReviewsMock.mockResolvedValue([]);

    // Repo owner/repo maps to repo-alpha domain with owners Alice(alice-gh), Bob(bob-gh)
    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'dependency-update-minor', description: '', owners: ['podman-desktop-bot'] },
    ]);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    // Should show both the domain owner and repo owners as pending reviewers
    expect(summary).toContain('podman-desktop-bot');
    expect(summary).toContain('alice-gh');
    expect(summary).toContain('bob-gh');
  });

  test('dependency-update-minor approved by repo owner satisfies review', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'APPROVED' }]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'dependency-update-minor', description: '', owners: ['podman-desktop-bot'] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
      undefined,
      [],
    );
  });

  test('dependency-update-minor approved by its own owner satisfies review', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'podman-desktop-bot', state: 'APPROVED' }]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [
      { domain: 'dependency-update-minor', description: '', owners: ['podman-desktop-bot'] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'sha1',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
      undefined,
      [],
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

  test('non-dependency empty-owner domains inherit reviewers from repository domain', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([]);

    await logic.updateCheckRun('owner', 'repo', 1, 'sha1', [{ domain: 'CustomDomain', description: '', owners: [] }]);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    // CustomDomain should inherit repo-alpha owners (alice-gh, bob-gh) and be pending
    expect(summary).toContain('CustomDomain');
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

  test('subgroup domain stays pending when only one subgroup is approved', async () => {
    expect.assertions(2);

    // Multi/team-x owners: alice-gh — approved
    // Multi/team-y owners: charlie-gh — not approved
    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'APPROVED' }]);

    await logic.updateCheckRun('test-org', 'test-repo', 1, 'sha1', [
      { domain: 'Multi/team-x', description: '', owners: ['Alice'] },
      { domain: 'Multi/team-y', description: '', owners: ['Charlie'] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'sha1',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('Pending'),
      undefined,
      [],
    );

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('@charlie-gh');
  });

  test('subgroup domain succeeds when all subgroups are approved', async () => {
    expect.assertions(1);

    // Both subgroups approved
    listReviewsMock.mockResolvedValue([
      { user: 'alice-gh', state: 'APPROVED' },
      { user: 'charlie-gh', state: 'APPROVED' },
    ]);

    await logic.updateCheckRun('test-org', 'test-repo', 1, 'sha1', [
      { domain: 'Multi/team-x', description: '', owners: ['Alice'] },
      { domain: 'Multi/team-y', description: '', owners: ['Charlie'] },
    ]);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'test-repo',
      'sha1',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
      undefined,
      [],
    );
  });

  test('subgroup domain uses parent domain name for labels', async () => {
    expect.assertions(2);

    listReviewsMock.mockResolvedValue([
      { user: 'alice-gh', state: 'APPROVED' },
      { user: 'charlie-gh', state: 'APPROVED' },
    ]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/multi/inreview' }],
    });

    await logic.execute(event);

    // Should swap label using parent domain name "multi"
    expect(removeLabelMock).toHaveBeenCalledWith('domain/multi/inreview', expect.objectContaining({ number: 42 }));
    expect(addLabelMock).toHaveBeenCalledWith(['domain/multi/reviewed'], expect.objectContaining({ number: 42 }));
  });

  test('markdown summary shows subgroup names', async () => {
    expect.assertions(3);

    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'APPROVED' }]);

    await logic.updateCheckRun('test-org', 'test-repo', 1, 'sha1', [
      { domain: 'Multi/team-x', description: '', owners: ['Alice'] },
      { domain: 'Multi/team-y', description: '', owners: ['Charlie'] },
    ]);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('Multi/team-x');
    expect(summary).toContain('Multi/team-y');
    expect(summary).toContain('@alice-gh');
  });

  test('progress header shows correct approved count', async () => {
    expect.assertions(2);

    // Beta approved, Gamma pending
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('1/2 approved');
    expect(summary).toContain('50%');
  });

  test('grouped sections show per-domain headers', async () => {
    expect.assertions(4);

    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('### :white_check_mark: Beta');
    expect(summary).toContain('### :hourglass: Gamma');
    expect(summary).toContain('(1/1 approved)');
    expect(summary).toContain('(0/1 approved)');
  });

  test('builds annotations from file-to-domain map', async () => {
    expect.assertions(3);

    getFileToDomainMapMock.mockReturnValue(
      new Map([
        ['src/api/index.ts', ['Beta']],
        ['src/ui/button.ts', ['Gamma']],
      ]),
    );
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    const annotations = createOrUpdateCheckRunMock.mock.calls[0][8] as {
      path: string;
      title: string;
      message: string;
    }[];

    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toStrictEqual(expect.objectContaining({ path: 'src/api/index.ts', title: 'Beta' }));
    expect(annotations[1]).toStrictEqual(expect.objectContaining({ path: 'src/ui/button.ts', title: 'Gamma' }));
  });

  test('annotations show pending for file mapped to unknown domain', async () => {
    expect.assertions(1);

    getFileToDomainMapMock.mockReturnValue(new Map([['src/unknown.ts', ['UnknownDomain']]]));
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    const annotations = createOrUpdateCheckRunMock.mock.calls[0][8] as {
      message: string;
    }[];

    expect(annotations[0].message).toContain('Pending');
  });

  test('builds detail text grouping files by domain', async () => {
    expect.assertions(5);

    getFileToDomainMapMock.mockReturnValue(
      new Map([
        ['src/api/index.ts', ['Beta']],
        ['src/ui/button.ts', ['Gamma']],
        ['README.md', []],
      ]),
    );
    listFilesMock.mockResolvedValue([
      { filename: 'src/api/index.ts', status: 'modified' },
      { filename: 'src/ui/button.ts', status: 'added' },
      { filename: 'README.md', status: 'modified' },
    ]);
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    const text = createOrUpdateCheckRunMock.mock.calls[0][7] as string;

    expect(text).toContain('## Files by Domain');
    expect(text).toContain('### Beta');
    expect(text).toContain('### Gamma');
    expect(text).toContain('`src/api/index.ts`');
    expect(text).toContain('### Unmatched');
  });

  test('fetches files via listFiles when files not provided in execute path', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    expect(listFilesMock).toHaveBeenCalledExactlyOnceWith('test-org', 'test-repo', 42);
  });

  test('summary includes matched-by files for domains resolved from folder mapping', async () => {
    expect.assertions(3);

    getFileToDomainMapMock.mockReturnValue(
      new Map([
        ['src/api/index.ts', ['Beta']],
        ['src/api/utils.ts', ['Beta']],
        ['src/ui/button.ts', ['Gamma']],
      ]),
    );
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }, { name: 'domain/gamma/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('Matched by:');
    expect(summary).toContain('`src/api/index.ts`');
    expect(summary).toContain('`src/ui/button.ts`');
  });

  test('summary truncates matched files to 5 and shows remaining count', async () => {
    expect.assertions(3);

    const fileMap = new Map<string, string[]>();
    for (let i = 0; i < 8; i++) {
      fileMap.set(`src/api/file${i}.ts`, ['Beta']);
    }
    getFileToDomainMapMock.mockReturnValue(fileMap);
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('Matched by:');
    expect(summary).toContain('+3 more');
    // Should not contain the 6th file
    expect(summary).not.toContain('`src/api/file5.ts`');
  });

  test('summary omits matched-by line when no folder mapping exists', async () => {
    expect.assertions(1);

    getFileToDomainMapMock.mockReturnValue(new Map());
    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/beta/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).not.toContain('Matched by:');
  });

  test('does not call listFiles when files are passed to updateCheckRun', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'charlie-gh', state: 'APPROVED' }]);

    await logic.updateCheckRun(
      'owner',
      'repo',
      1,
      'sha1',
      [{ domain: 'Beta', description: '', owners: ['Charlie'] }],
      undefined,
      [{ filename: 'src/foo.ts', status: 'modified' }],
    );

    expect(listFilesMock).not.toHaveBeenCalled();
  });
});
