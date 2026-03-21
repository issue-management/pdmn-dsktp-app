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
import { DomainsHelper } from '/@/helpers/domains-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { CheckRunHelper } from '/@/helpers/check-run-helper';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

describe('domainReviewCheckRunLogic', () => {
  let container: Container;
  let logic: DomainReviewCheckRunLogic;
  let createOrUpdateCheckRunMock: ReturnType<typeof vi.fn>;
  let listReviewsMock: ReturnType<typeof vi.fn>;

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
          name: overrides.repo ?? 'podman-desktop',
          owner: { login: overrides.owner ?? 'podman-desktop' },
        },
        installation: { id: 1 },
      },
    } as unknown as EmitterWebhookEvent<'pull_request_review'>;
  }

  beforeEach(() => {
    container = new Container();

    createOrUpdateCheckRunMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    listReviewsMock = vi.fn<() => Promise<{ user: string; state: string }[]>>().mockResolvedValue([]);

    container.bind(DomainsHelper).toSelf().inSingletonScope();
    container.bind(DomainReviewCheckRunLogic).toSelf().inSingletonScope();

    const checkRunHelper = { createOrUpdateCheckRun: createOrUpdateCheckRunMock } as unknown as CheckRunHelper;
    container.bind(CheckRunHelper).toConstantValue(checkRunHelper);

    const pullRequestsHelper = { listReviews: listReviewsMock } as unknown as PullRequestsHelper;
    container.bind(PullRequestsHelper).toConstantValue(pullRequestsHelper);

    logic = container.get(DomainReviewCheckRunLogic);
  });

  test('sets check to failure when no domain labels on PR', async () => {
    expect.assertions(1);

    const event = makeReviewEvent({ labels: [] });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
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
      labels: [{ name: 'domain/containers/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
      'abc123',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('Pending'),
    );
  });

  test('sets check to success when all domains have at least one owner approval', async () => {
    expect.assertions(1);

    // Containers domain owners: Axel(axel7083), Florent(benoitf)
    listReviewsMock.mockResolvedValue([{ user: 'axel7083', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/containers/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });

  test('stays pending when one domain is approved but another is not', async () => {
    expect.assertions(2);

    // Containers owners: axel7083, benoitf
    // Kubernetes owners: cdrage, feloy
    listReviewsMock.mockResolvedValue([{ user: 'axel7083', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/containers/inreview' }, { name: 'domain/kubernetes/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
      'abc123',
      'in_progress',
      undefined,
      'Awaiting domain approvals',
      expect.stringContaining('Pending'),
    );

    // Summary should show Containers as approved and Kubernetes as pending
    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('Approved');
  });

  test('one reviewer covering multiple domains satisfies all', async () => {
    expect.assertions(1);

    // Extensibility owners: Florent(benoitf), Tim(deboer-tim)
    // Foundations owners: Florent(benoitf), Tim(deboer-tim)
    // Benoitf is in both domains
    listReviewsMock.mockResolvedValue([{ user: 'benoitf', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/extensibility/inreview' }, { name: 'domain/foundations/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
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
      { user: 'axel7083', state: 'APPROVED' },
      { user: 'axel7083', state: 'CHANGES_REQUESTED' },
    ]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/containers/inreview' }],
    });

    await logic.execute(event);

    // Should be pending because latest review is CHANGES_REQUESTED
    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
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
      { domain: 'TestDomain', description: '', owners: ['Florent'] },
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

    // Containers owners: axel7083, benoitf — axel7083 approved
    // Kubernetes owners: cdrage, feloy — nobody approved
    listReviewsMock.mockResolvedValue([{ user: 'axel7083', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/containers/inreview' }, { name: 'domain/kubernetes/inreview' }],
    });

    await logic.execute(event);

    const summary = createOrUpdateCheckRunMock.mock.calls[0][6] as string;

    expect(summary).toContain('## Domain Review Status');
    expect(summary).toContain('Containers');
    expect(summary).toContain('@axel7083');
    expect(summary).toContain('Awaiting: @cdrage, @feloy');
  });

  test('handles PR with no labels property (undefined fallback)', async () => {
    expect.assertions(1);

    const event = makeReviewEvent({});
    // Remove labels to trigger ?? [] fallback
    delete (event.payload.pull_request as Record<string, unknown>).labels;

    await logic.execute(event);

    // No domains found → failure
    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
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
      { user: 'axel7083', state: 'APPROVED' },
    ]);

    const event = makeReviewEvent({
      labels: [{ name: 'domain/containers/inreview' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });

  test('handles area/* labels in addition to domain/* labels', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'axel7083', state: 'APPROVED' }]);

    const event = makeReviewEvent({
      labels: [{ name: 'area/containers' }],
    });

    await logic.execute(event);

    expect(createOrUpdateCheckRunMock).toHaveBeenCalledExactlyOnceWith(
      'podman-desktop',
      'podman-desktop',
      'abc123',
      'completed',
      'success',
      'All domains approved',
      expect.stringContaining('Approved'),
    );
  });
});
