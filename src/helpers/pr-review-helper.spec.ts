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

import { PullRequestReviewsHelper } from '/@/helpers/pr-review-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import { PullRequestInfo, PullRequestInfoBuilder } from '/@/info/pull-request-info';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { IssueInfoBuilder } from '/@/info/issue-info';

vi.mock(import('@octokit/graphql'));

const { graphql } = await import('@octokit/graphql');

function makePrEdge(
  overrides: Partial<{
    id: string;
    url: string;
    title: string;
    number: number;
    body: string;
    repoName: string;
    repoOwner: string;
    statusState: string;
    reviewDecision: string;
    autoMergeRequest: { enabledAt: string } | undefined;
    authorLogin: string;
    baseRefName: string;
    committedDate: string;
  }> = {},
): unknown {
  return {
    node: {
      id: overrides.id ?? 'pr-id-1',
      url: overrides.url ?? 'https://github.com/podman-desktop/podman-desktop/pull/1',
      mergedAt: '',
      title: overrides.title ?? 'Test PR',
      number: overrides.number ?? 1,
      body: overrides.body ?? '',
      repository: {
        name: overrides.repoName ?? 'podman-desktop',
        owner: { login: overrides.repoOwner ?? 'podman-desktop' },
      },
      baseRepository: {
        url: 'https://github.com/podman-desktop/podman-desktop',
        nameWithOwner: `${overrides.repoOwner ?? 'podman-desktop'}/${overrides.repoName ?? 'podman-desktop'}`,
      },
      statusCheckRollup: overrides.statusState !== undefined ? { state: overrides.statusState } : { state: 'SUCCESS' },
      commits: {
        nodes: [{ commit: { committedDate: overrides.committedDate ?? '2024-01-01T00:00:00Z' } }],
      },
      author: { login: overrides.authorLogin ?? 'dependabot[bot]' },
      reviewDecision: overrides.reviewDecision ?? 'REVIEW_REQUIRED',
      autoMergeRequest: overrides.autoMergeRequest,
      baseRefName: overrides.baseRefName ?? 'main',
    },
  };
}

describe('pullRequestReviewsHelper', () => {
  let container: Container;

  beforeEach(() => {
    vi.resetAllMocks();

    container = new Container();

    container.bind(RepositoriesHelper).toSelf().inSingletonScope();
    container.bind(PullRequestInfoLinkedIssuesExtractor).toSelf().inSingletonScope();
    container.bind(IssueInfoBuilder).toSelf().inSingletonScope();
    container.bind(PullRequestInfoBuilder).toSelf().inSingletonScope();
    container.bind(PullRequestReviewsHelper).toSelf().inSingletonScope();

    // Mock IssuesHelper
    const issuesHelper = { getIssue: vi.fn<() => Promise<unknown>>() } as unknown as IssuesHelper;
    container.bind(IssuesHelper).toConstantValue(issuesHelper);

    container.bind('string').toConstantValue('read-token').whenNamed('GRAPHQL_READ_TOKEN');
    container.bind('string').toConstantValue('write-token').whenNamed('GRAPHQL_WRITE_TOKEN');
    container.bind('Octokit').toConstantValue({}).whenNamed('READ_TOKEN');
  });

  test('getDependabotPullRequestsRequiringReviewAndPassingAllChecks returns only SUCCESS PRs', async () => {
    expect.assertions(4);

    const helper = container.get(PullRequestReviewsHelper);

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor1', hasNextPage: false },
        edges: [
          makePrEdge({ id: 'pr-1', statusState: 'SUCCESS' }),
          makePrEdge({ id: 'pr-2', statusState: 'FAILURE' }),
          makePrEdge({ id: 'pr-3', statusState: 'SUCCESS' }),
        ],
      },
    });

    const result = await helper.getDependabotPullRequestsRequiringReviewAndPassingAllChecks();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pr-1');
    expect(result[1].id).toBe('pr-3');
    expect(result.every(pr => pr.statusState === 'SUCCESS')).toBe(true);
  });

  test('getPullRequestsToReview returns PRs', async () => {
    expect.assertions(3);

    const helper = container.get(PullRequestReviewsHelper);

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor1', hasNextPage: false },
        edges: [makePrEdge({ id: 'pr-review-1', title: 'PR for review' })],
      },
    });

    const result = await helper.getPullRequestsToReview('testuser');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr-review-1');
    expect(result[0].title).toBe('PR for review');
  });

  test('handles PR with undefined statusCheckRollup', async () => {
    expect.assertions(1);

    const helper = container.get(PullRequestReviewsHelper);

    const edge = makePrEdge({ id: 'pr-no-status' }) as { node: Record<string, unknown> };
    edge.node.statusCheckRollup = undefined;

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor1', hasNextPage: false },
        edges: [edge],
      },
    });

    const result = await helper.getDependabotPullRequestsRequiringReviewAndPassingAllChecks();

    // StatusState defaults to 'UNKNOWN' which is not 'SUCCESS', so filtered out
    expect(result).toHaveLength(0);
  });

  test('approvePullRequest calls graphql mutation', async () => {
    expect.assertions(1);

    const helper = container.get(PullRequestReviewsHelper);

    vi.mocked(graphql).mockResolvedValueOnce({});

    const pr = new PullRequestInfo();
    pr.withId('pr-id-approve');

    await helper.approvePullRequest(pr);

    expect(graphql).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('approvePullRequest'),
      expect.objectContaining({
        pullRequestId: 'pr-id-approve',
        headers: { authorization: 'write-token' },
      }),
    );
  });

  test('setAutoMerge calls graphql mutation with correct mergeMethod', async () => {
    expect.assertions(1);

    const helper = container.get(PullRequestReviewsHelper);

    vi.mocked(graphql).mockResolvedValueOnce({});

    const pr = new PullRequestInfo();
    pr.withId('pr-id-merge');

    await helper.setAutoMerge(pr, 'REBASE');

    expect(graphql).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('enableAutoMerge'),
      expect.objectContaining({
        pullRequestId: 'pr-id-merge',
        mergeMethod: 'REBASE',
        headers: { authorization: 'write-token' },
      }),
    );
  });

  test('handles PR with missing commits nodes', async () => {
    expect.assertions(1);

    const helper = container.get(PullRequestReviewsHelper);

    const edge = makePrEdge({ id: 'pr-no-commits', statusState: 'SUCCESS' }) as {
      node: Record<string, unknown>;
    };
    edge.node.commits = { nodes: [] };

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor1', hasNextPage: false },
        edges: [edge],
      },
    });

    const result = await helper.getDependabotPullRequestsRequiringReviewAndPassingAllChecks();

    expect(result[0].lastCommitDate).toBe('');
  });

  test('pagination works with hasNextPage true then false', async () => {
    expect.assertions(4);

    const helper = container.get(PullRequestReviewsHelper);

    // First page
    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor-page1', hasNextPage: true },
        edges: [makePrEdge({ id: 'pr-page1', statusState: 'SUCCESS' })],
      },
    });

    // Second page
    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor-page2', hasNextPage: false },
        edges: [makePrEdge({ id: 'pr-page2', statusState: 'SUCCESS' })],
      },
    });

    const result = await helper.getDependabotPullRequestsRequiringReviewAndPassingAllChecks();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pr-page1');
    expect(result[1].id).toBe('pr-page2');
    expect(graphql).toHaveBeenCalledTimes(2);
  });
});
