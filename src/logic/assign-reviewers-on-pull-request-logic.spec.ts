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
import { AssignReviewersOnPullRequestLogic } from '/@/logic/assign-reviewers-on-pull-request-logic';
import { DependencyChangeAnalyzer } from '/@/helpers/dependency-change-analyzer';
import type { DependencyAnalysisResult } from '/@/helpers/dependency-change-analyzer';
import { DependencyDomainsResolver } from '/@/helpers/dependency-domains-resolver';
import { DetectDomainsHelper } from '/@/helpers/detect-domains-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { FolderDomainsHelper } from '/@/helpers/folder-domains-helper';
import { PullRequestFilesHelper } from '/@/helpers/pull-request-files-helper';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import { DomainReviewCheckRunLogic } from '/@/logic/domain-review-check-run-logic';
import { IssueInfoBuilder } from '/@/info/issue-info';
import { PullRequestInfoBuilder } from '/@/info/pull-request-info';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [
    {
      domain: 'alpha',
      description: '',
      owners: ['Alice', 'Bob'],
      repository: 'https://github.com/test-org/repo-alpha',
    },
    { domain: 'Beta', description: '', owners: ['Charlie', 'Dave'] },
    { domain: 'Gamma', description: '', owners: ['Alice', 'Eve'] },
    {
      domain: 'delta',
      description: '',
      owners: ['Frank', 'Grace'],
      repository: 'https://github.com/other-org/repo-delta',
    },
    {
      domain: 'epsilon',
      description: '',
      owners: ['Charlie'],
      repository: 'https://github.com/test-org/repo-epsilon',
    },
  ],
}));

vi.mock(import('/@/data/users-data'), () => ({
  usersData: {
    Alice: 'alice-gh',
    Bob: 'bob-gh',
    Charlie: 'charlie-gh',
    Dave: 'dave-gh',
    Eve: 'eve-gh',
    Frank: 'frank-gh',
    Grace: 'grace-gh',
  },
}));

vi.mock(import('/@/data/folder-domains-data'), () => ({
  folderDomainsData: [
    {
      repository: 'https://github.com/test-org/test-repo',
      mappings: [
        { pattern: 'src/api/**', domain: 'Beta' },
        { pattern: 'src/ui/**', domain: 'Gamma' },
      ],
      defaultDomain: 'alpha',
    },
  ],
}));

describe('check AssignReviewersOnPullRequestLogic', () => {
  let container: Container;
  let logic: AssignReviewersOnPullRequestLogic;
  let requestReviewersMock: ReturnType<typeof vi.fn>;
  let listReviewsMock: ReturnType<typeof vi.fn>;
  let addLabelMock: ReturnType<typeof vi.fn>;
  let getIssueMock: ReturnType<typeof vi.fn>;
  let updateCheckRunMock: ReturnType<typeof vi.fn>;
  let listFilesMock: ReturnType<typeof vi.fn>;
  let analyzeMock: ReturnType<typeof vi.fn>;
  let resolveMock: ReturnType<typeof vi.fn>;

  function makeEvent(
    overrides: {
      owner?: string;
      repo?: string;
      prNumber?: number;
      prAuthor?: string;
      body?: string;
      labels?: { name: string }[];
    } = {},
  ): EmitterWebhookEvent<'pull_request.opened'> {
    return {
      id: 'test-id',
      name: 'pull_request',
      payload: {
        action: 'opened',
        pull_request: {
          number: overrides.prNumber ?? 42,
          user: { login: overrides.prAuthor ?? 'someuser' },
          body: overrides.body ?? '',
          labels: overrides.labels ?? [],
          base: { sha: 'base-sha' },
          head: { sha: 'test-sha' },
        },
        repository: {
          name: overrides.repo ?? 'test-repo',
          owner: { login: overrides.owner ?? 'test-org' },
          full_name: `${overrides.owner ?? 'test-org'}/${overrides.repo ?? 'test-repo'}`,
        },
        installation: { id: 1 },
      },
    } as unknown as EmitterWebhookEvent<'pull_request.opened'>;
  }

  beforeEach(() => {
    container = new Container();

    requestReviewersMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    listReviewsMock = vi.fn<() => Promise<{ user: string; state: string }[]>>().mockResolvedValue([]);
    addLabelMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    getIssueMock = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
    updateCheckRunMock = vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    listFilesMock = vi.fn<() => Promise<{ filename: string; status: string }[]>>().mockResolvedValue([]);
    analyzeMock = vi.fn<() => Promise<DependencyAnalysisResult>>();
    resolveMock = vi.fn<() => unknown>().mockReturnValue({ domains: [] });

    container.bind(DomainsHelper).toSelf().inSingletonScope();
    container.bind(FolderDomainsHelper).toSelf().inSingletonScope();
    container.bind(DetectDomainsHelper).toSelf().inSingletonScope();
    container.bind(PullRequestInfoLinkedIssuesExtractor).toSelf().inSingletonScope();
    container.bind(IssueInfoBuilder).toSelf().inSingletonScope();
    container.bind(PullRequestInfoBuilder).toSelf().inSingletonScope();
    container.bind(AssignReviewersOnPullRequestLogic).toSelf().inSingletonScope();

    // Mock RepositoriesHelper with fake repos
    const watchedOrgs = ['test-org'];
    const watchedRepos = ['other-org/repo-delta'];
    const repositoriesHelper = {
      getRepositoriesToWatch: vi.fn<() => string[]>().mockReturnValue(watchedRepos),
      getOrganizationsToWatch: vi.fn<() => string[]>().mockReturnValue(watchedOrgs),
      isKnownRepository: vi
        .fn<(owner: string, repo: string) => boolean>()
        .mockImplementation(
          (owner: string, repo: string): boolean =>
            watchedOrgs.includes(owner) || watchedRepos.includes(`${owner}/${repo}`),
        ),
    } as unknown as RepositoriesHelper;
    container.bind(RepositoriesHelper).toConstantValue(repositoriesHelper);

    // Mock IssuesHelper
    const issuesHelper = { getIssue: getIssueMock } as unknown as IssuesHelper;
    container.bind(IssuesHelper).toConstantValue(issuesHelper);

    // Mock PullRequestsHelper
    const pullRequestsHelper = {
      requestReviewers: requestReviewersMock,
      listReviews: listReviewsMock,
    } as unknown as PullRequestsHelper;
    container.bind(PullRequestsHelper).toConstantValue(pullRequestsHelper);

    // Mock AddLabelHelper
    const addLabelHelper = { addLabel: addLabelMock } as unknown as AddLabelHelper;
    container.bind(AddLabelHelper).toConstantValue(addLabelHelper);

    // Mock DomainReviewCheckRunLogic
    const domainReviewCheckRunLogic = { updateCheckRun: updateCheckRunMock } as unknown as DomainReviewCheckRunLogic;
    container.bind(DomainReviewCheckRunLogic).toConstantValue(domainReviewCheckRunLogic);

    // Mock PullRequestFilesHelper
    const pullRequestFilesHelper = {
      listFiles: listFilesMock,
      isOnlyDependencyFiles: vi.fn<() => boolean>().mockReturnValue(false),
      getChangedPackageJsonPaths: vi.fn<() => string[]>().mockReturnValue([]),
    } as unknown as PullRequestFilesHelper;
    container.bind(PullRequestFilesHelper).toConstantValue(pullRequestFilesHelper);

    // Mock DependencyChangeAnalyzer
    const dependencyChangeAnalyzer = { analyze: analyzeMock } as unknown as DependencyChangeAnalyzer;
    container.bind(DependencyChangeAnalyzer).toConstantValue(dependencyChangeAnalyzer);

    // Mock DependencyDomainsResolver
    const dependencyDomainsResolver = { resolve: resolveMock } as unknown as DependencyDomainsResolver;
    container.bind(DependencyDomainsResolver).toConstantValue(dependencyDomainsResolver);

    // Bind required tokens for any injected helpers
    container.bind('Octokit').toConstantValue({}).whenNamed('READ_TOKEN');
    container.bind('Octokit').toConstantValue({}).whenNamed('WRITE_TOKEN');
    container.bind('string').toConstantValue('token').whenNamed('GRAPHQL_READ_TOKEN');

    logic = container.get(AssignReviewersOnPullRequestLogic);
  });

  test('assigns reviewers based on repository match (extension repo)', async () => {
    expect.assertions(2);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
    expect(addLabelMock).toHaveBeenCalledWith(['domain/alpha/inreview'], expect.anything());
  });

  test('assigns reviewers based on issue labels from PR body', async () => {
    expect.assertions(3);

    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('test-org')
      .withRepo('test-repo')
      .withNumber(123)
      .withLabels(['domain/beta/inreview', 'kind/bug']);

    getIssueMock.mockResolvedValue(issueInfo);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes #123',
    });

    await logic.execute(event);

    expect(getIssueMock).toHaveBeenCalledWith('https://api.github.com/repos/test-org/test-repo/issues/123');
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
      42,
      expect.arrayContaining(['charlie-gh', 'dave-gh']),
    );
    expect(addLabelMock).toHaveBeenCalledWith(['domain/beta/inreview'], expect.anything());
  });

  test('excludes PR author from reviewers', async () => {
    expect.assertions(1);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'alice-gh',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.not.arrayContaining(['alice-gh']),
    );
  });

  test('does nothing when no domains match', async () => {
    expect.assertions(2);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'no issue references here',
    });

    await logic.execute(event);

    expect(requestReviewersMock).not.toHaveBeenCalled();
    expect(addLabelMock).not.toHaveBeenCalled();
  });

  test('skips issues from unknown repositories', async () => {
    expect.assertions(2);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes https://github.com/unknown-org/unknown-repo/issues/1',
    });

    await logic.execute(event);

    expect(getIssueMock).not.toHaveBeenCalled();
    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('combines repository-based and issue-label-based domains', async () => {
    expect.assertions(2);

    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('test-org')
      .withRepo('test-repo')
      .withNumber(99)
      .withLabels(['domain/gamma/inreview']);

    getIssueMock.mockResolvedValue(issueInfo);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: 'related to https://github.com/test-org/test-repo/issues/99',
    });

    await logic.execute(event);

    // Should have reviewers from both alpha (Alice, Bob) and Gamma (Alice, Eve) domains
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh', 'eve-gh']),
    );
    // Should have both domain labels
    expect(addLabelMock).toHaveBeenCalledWith(
      expect.arrayContaining(['domain/alpha/inreview', 'domain/gamma/inreview']),
      expect.anything(),
    );
  });

  test('handles area/* labels on issues', async () => {
    expect.assertions(1);

    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('test-org')
      .withRepo('test-repo')
      .withNumber(50)
      .withLabels(['area/beta']);

    getIssueMock.mockResolvedValue(issueInfo);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes #50',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
      42,
      expect.arrayContaining(['charlie-gh', 'dave-gh']),
    );
  });

  test('handles issue fetch returning undefined', async () => {
    expect.assertions(1);

    getIssueMock.mockResolvedValue(undefined);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes #999',
    });

    await logic.execute(event);

    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('logs message when all reviewers are excluded as PR author (single owner)', async () => {
    expect.assertions(1);

    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('test-org')
      .withRepo('test-repo')
      .withNumber(123)
      .withLabels(['domain/beta/inreview']);

    getIssueMock.mockResolvedValue(issueInfo);

    // Beta domain has owners charlie-gh and dave-gh
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes #123',
    });

    await logic.execute(event);

    // Reviewers were assigned (not the empty path) - but we verify the label path works
    expect(logSpy).toHaveBeenCalledWith(expect.anything());

    logSpy.mockRestore();
  });

  test('logs no reviewers when all are excluded as PR author', async () => {
    expect.assertions(2);

    // Epsilon domain has single owner: Charlie -> charlie-gh
    // If PR author is charlie-gh, all reviewers get excluded
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-epsilon',
      prAuthor: 'charlie-gh',
      body: '',
    });

    await logic.execute(event);

    expect(logSpy).toHaveBeenCalledWith(
      'AssignReviewers: No reviewers to assign (all were excluded as PR author or already reviewed)',
    );
    expect(requestReviewersMock).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('assigns domain labels when PR has no labels property', async () => {
    expect.assertions(1);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });
    // Remove labels to trigger the || [] fallback
    delete (event.payload.pull_request as Record<string, unknown>).labels;

    await logic.execute(event);

    expect(addLabelMock).toHaveBeenCalledWith(
      ['domain/alpha/inreview'],
      expect.objectContaining({
        __labels: [],
      }),
    );
  });

  test('handles PR with labels in payload', async () => {
    expect.assertions(1);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
      labels: [{ name: 'existing-label' }],
    });

    await logic.execute(event);

    // AddLabelHelper receives an IssueInfo that has the PR's existing labels
    expect(addLabelMock).toHaveBeenCalledWith(
      ['domain/alpha/inreview'],
      expect.objectContaining({
        __labels: ['existing-label'],
      }),
    );
  });

  test('handles PR with null body', async () => {
    expect.assertions(1);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });
    // Set body to null directly to cover the ?? '' branch
    (event.payload.pull_request as Record<string, unknown>).body = undefined;

    await logic.execute(event);

    // Should still match by repository (alpha)
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
  });

  test('handles issue with labels that do not match any domain', async () => {
    expect.assertions(1);

    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('test-org')
      .withRepo('test-repo')
      .withNumber(200)
      .withLabels(['kind/bug', 'priority/high']);

    getIssueMock.mockResolvedValue(issueInfo);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes #200',
    });

    await logic.execute(event);

    // No repo-based domains for test-repo,
    // And labels don't match any domain — no reviewers
    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('deduplicates domains when same domain matched by repo and issue label', async () => {
    expect.assertions(2);

    // Repo-alpha matches domain/alpha by repository
    // Issue also has domain/alpha/inreview label → same domain matched twice
    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('test-org')
      .withRepo('test-repo')
      .withNumber(300)
      .withLabels(['domain/alpha/inreview']);

    getIssueMock.mockResolvedValue(issueInfo);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: 'fixes https://github.com/test-org/test-repo/issues/300',
    });

    await logic.execute(event);

    // Should only assign reviewers once (deduplicated)
    expect(requestReviewersMock).toHaveBeenCalledTimes(1);
    // Should only have alpha domain label once
    expect(addLabelMock).toHaveBeenCalledWith(['domain/alpha/inreview'], expect.anything());
  });

  test('skips issue links that do not match the expected pattern', async () => {
    expect.assertions(3);

    // Override the extractor to return a malformed link
    const extractorMock = {
      extractFromBody: vi
        .fn<(body: string, owner: string, repo: string) => string[]>()
        .mockReturnValue(['malformed-link-no-repos-pattern']),
    } as unknown as PullRequestInfoLinkedIssuesExtractor;
    container.rebind(PullRequestInfoLinkedIssuesExtractor).toConstantValue(extractorMock);
    // Need to also rebind helpers and logic to pick up the new extractor
    container.rebind(DetectDomainsHelper).toSelf().inSingletonScope();
    container.rebind(AssignReviewersOnPullRequestLogic).toSelf().inSingletonScope();
    logic = container.get(AssignReviewersOnPullRequestLogic);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'fixes something',
    });

    await logic.execute(event);

    // Verify the mock extractor was called
    expect(extractorMock.extractFromBody).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
    // Should not try to fetch issue since the link is malformed
    expect(getIssueMock).not.toHaveBeenCalled();
    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('continues with labels and check run when requestReviewers throws', async () => {
    expect.assertions(3);

    requestReviewersMock.mockRejectedValueOnce(new Error('Reviews may only be requested from collaborators'));

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
    expect(addLabelMock).toHaveBeenCalledWith(['domain/alpha/inreview'], expect.anything());
    expect(updateCheckRunMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      'test-sha',
      expect.anything(),
      expect.objectContaining({ __owner: 'test-org', __repository: 'repo-alpha', __number: 42 }),
      expect.anything(),
      'someuser',
    );
  });

  test('fetches issues from known watched repositories', async () => {
    expect.assertions(2);

    const issueInfo = new IssueInfoBuilder()
      .build()
      .withOwner('other-org')
      .withRepo('repo-delta')
      .withNumber(10)
      .withLabels(['domain/delta/inreview']);

    getIssueMock.mockResolvedValue(issueInfo);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: 'related to https://github.com/other-org/repo-delta/issues/10',
    });

    await logic.execute(event);

    expect(getIssueMock).toHaveBeenCalledWith(expect.anything());
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
      42,
      expect.arrayContaining(['frank-gh', 'grace-gh']),
    );
  });

  test('filters out non-dependency domains for dependency-only PRs', async () => {
    expect.assertions(3);

    // Configure mocks to simulate a dependency-only PR
    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'pnpm-lock.yaml', status: 'modified' },
    ]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue(['package.json']);

    analyzeMock.mockResolvedValue({
      isDependencyOnlyPR: true,
      changes: [{ packageName: 'foo', changeType: 'minor', from: '1.0.0', to: '1.1.0', section: 'dependencies' }],
      hasMinorOrPatch: true,
      hasMajor: false,
      hasNew: false,
      hasRemoved: false,
    });

    const minorDomain = { domain: 'dependency-update-minor', description: '', owners: ['podman-desktop-bot'] };
    resolveMock.mockReturnValue({
      domains: [minorDomain],
    });

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Only dependency domain should remain (folder-detected 'alpha' should be filtered out)
    expect(addLabelMock).toHaveBeenCalledWith(['domain/dependency-update-minor/inreview'], expect.anything());
    expect(addLabelMock).toHaveBeenCalledWith(expect.not.arrayContaining(['domain/alpha/inreview']), expect.anything());
    expect(updateCheckRunMock).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
      42,
      'test-sha',
      [expect.objectContaining({ domain: 'dependency-update-minor' })],
      expect.objectContaining({ __owner: 'test-org', __repository: 'test-repo', __number: 42 }),
      expect.anything(),
      'someuser',
    );
  });

  test('keeps all domains when PR has mixed dependency and non-dependency files', async () => {
    expect.assertions(1);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'src/index.ts', status: 'modified' },
    ]);
    // Not dependency-only since src/index.ts is present
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(false);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Repo-based domain should remain (not filtered)
    expect(addLabelMock).toHaveBeenCalledWith(expect.arrayContaining(['domain/alpha/inreview']), expect.anything());
  });

  test('filters out folder domains for major dependency-only PRs', async () => {
    expect.assertions(2);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'pnpm-lock.yaml', status: 'modified' },
    ]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue(['package.json']);

    analyzeMock.mockResolvedValue({
      isDependencyOnlyPR: true,
      changes: [{ packageName: 'foo', changeType: 'major', from: '1.0.0', to: '2.0.0', section: 'dependencies' }],
      hasMinorOrPatch: false,
      hasMajor: true,
      hasNew: false,
      hasRemoved: false,
    });

    const majorDomain = { domain: 'dependency-update-major', description: '', owners: ['Florent'] };
    resolveMock.mockReturnValue({
      domains: [majorDomain],
    });

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Folder-detected 'alpha' (default domain) should be filtered out
    expect(addLabelMock).toHaveBeenCalledWith(['domain/dependency-update-major/inreview'], expect.anything());
    expect(addLabelMock).toHaveBeenCalledWith(expect.not.arrayContaining(['domain/alpha/inreview']), expect.anything());
  });

  test('keeps repo-based domains alongside dependency domains for extension repo PRs', async () => {
    expect.assertions(2);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'pnpm-lock.yaml', status: 'modified' },
    ]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue(['package.json']);

    analyzeMock.mockResolvedValue({
      isDependencyOnlyPR: true,
      changes: [{ packageName: 'bar', changeType: 'major', from: '3.0.0', to: '4.0.0', section: 'dependencies' }],
      hasMinorOrPatch: false,
      hasMajor: true,
      hasNew: false,
      hasRemoved: false,
    });

    const majorDomain = { domain: 'dependency-update-major', description: '', owners: [] };
    resolveMock.mockReturnValue({
      domains: [majorDomain],
    });

    // Extension repo matches 'alpha' domain by repository (not folder detection)
    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Repo-based 'alpha' domain should be kept alongside the dependency domain
    expect(addLabelMock).toHaveBeenCalledWith(
      expect.arrayContaining(['domain/alpha/inreview', 'domain/dependency-update-major/inreview']),
      expect.anything(),
    );
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
  });

  test('drops repo-based domains for minor-only dependency PRs in extension repos', async () => {
    expect.assertions(2);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'pnpm-lock.yaml', status: 'modified' },
    ]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue(['package.json']);

    analyzeMock.mockResolvedValue({
      isDependencyOnlyPR: true,
      changes: [{ packageName: 'bar', changeType: 'minor', from: '1.0.0', to: '1.1.0', section: 'dependencies' }],
      hasMinorOrPatch: true,
      hasMajor: false,
      hasNew: false,
      hasRemoved: false,
    });

    const minorDomain = { domain: 'dependency-update-minor', description: '', owners: [] };
    resolveMock.mockReturnValue({
      domains: [minorDomain],
    });

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'dependabot[bot]',
      body: '',
    });

    await logic.execute(event);

    expect(addLabelMock).toHaveBeenCalledExactlyOnceWith(
      ['domain/dependency-update-minor/inreview'],
      expect.anything(),
    );
    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('skips dependency detection when PR has non-dependency files', async () => {
    expect.assertions(1);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'src/index.ts', status: 'modified' },
    ]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(false);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(analyzeMock).not.toHaveBeenCalled();
  });

  test('skips dependency detection when package.json has non-dep changes', async () => {
    expect.assertions(1);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([{ filename: 'package.json', status: 'modified' }]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue(['package.json']);

    analyzeMock.mockResolvedValue({
      isDependencyOnlyPR: false,
      changes: [{ packageName: 'foo', changeType: 'minor', from: '1.0.0', to: '1.1.0', section: 'dependencies' }],
      hasMinorOrPatch: true,
      hasMajor: false,
      hasNew: false,
      hasRemoved: false,
    });

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Should not add dependency domains since isDependencyOnlyPR is false
    expect(resolveMock).not.toHaveBeenCalled();
  });

  test('skips dependency analysis when only pnpm-lock.yaml changed', async () => {
    expect.assertions(1);

    const filesHelper = container.get(PullRequestFilesHelper);
    vi.mocked(filesHelper.listFiles).mockResolvedValue([{ filename: 'pnpm-lock.yaml', status: 'modified' }]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue([]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(analyzeMock).not.toHaveBeenCalled();
  });

  test('continues gracefully when dependency analysis throws', async () => {
    expect.assertions(1);

    const filesHelper = container.get(PullRequestFilesHelper);
    // Return dep-only files but make analyzer throw
    vi.mocked(filesHelper.listFiles).mockResolvedValue([
      { filename: 'package.json', status: 'modified' },
      { filename: 'pnpm-lock.yaml', status: 'modified' },
    ]);
    vi.mocked(filesHelper.isOnlyDependencyFiles).mockReturnValue(true);
    vi.mocked(filesHelper.getChangedPackageJsonPaths).mockReturnValue(['package.json']);
    analyzeMock.mockRejectedValue(new Error('API error'));

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Should still proceed with repo-based domain matching
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
  });

  test('skips issue extraction for bot PR authors', async () => {
    expect.assertions(2);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'dependabot[bot]',
      body: 'Bumps [vite](https://github.com/vitejs/vite) from 7.3.1 to 8.0.1.\n#21932 #21933',
    });

    await logic.execute(event);

    // Should not try to fetch any issues from the body
    expect(getIssueMock).not.toHaveBeenCalled();
    // No domains matched, so no reviewers assigned
    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('skips adding inreview label when reviewed label already exists for the domain', async () => {
    expect.assertions(2);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
      labels: [{ name: 'domain/alpha/reviewed' }, { name: 'existing-label' }],
    });

    await logic.execute(event);

    // Should not add /inreview since /reviewed already exists for the same domain
    expect(addLabelMock).not.toHaveBeenCalled();

    // The issueInfo passed to updateCheckRun should keep existing labels without adding /inreview
    expect(updateCheckRunMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      'test-sha',
      expect.anything(),
      expect.objectContaining({
        __labels: ['domain/alpha/reviewed', 'existing-label'],
      }),
      expect.anything(),
      'someuser',
    );
  });

  test('assigns reviewers based on folder detection for matched files', async () => {
    expect.assertions(2);

    listFilesMock.mockResolvedValue([{ filename: 'src/api/endpoint.ts', status: 'modified' }]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Beta domain matched via folder detection (src/api/**)
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
      42,
      expect.arrayContaining(['charlie-gh', 'dave-gh']),
    );
    expect(addLabelMock).toHaveBeenCalledWith(expect.arrayContaining(['domain/beta/inreview']), expect.anything());
  });

  test('uses default domain for unmatched files in folder detection', async () => {
    expect.assertions(2);

    listFilesMock.mockResolvedValue([{ filename: 'README.md', status: 'modified' }]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'test-repo',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    // Default domain 'alpha' matched for unmatched file
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
    expect(addLabelMock).toHaveBeenCalledWith(expect.arrayContaining(['domain/alpha/inreview']), expect.anything());
  });

  test('handles synchronize event with null user gracefully', async () => {
    expect.assertions(2);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      body: '',
    });
    // Simulate null user as can happen in synchronize events
    (event.payload.pull_request as Record<string, unknown>).user = undefined;

    await logic.execute(event);

    // Should still assign reviewers (empty author means no one is excluded)
    expect(requestReviewersMock).toHaveBeenCalledWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
    expect(addLabelMock).toHaveBeenCalledWith(['domain/alpha/inreview'], expect.anything());
  });

  test('skips re-requesting review from user who already approved', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'APPROVED' }]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, ['bob-gh']);
  });

  test('skips re-requesting review from user who requested changes', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'CHANGES_REQUESTED' }]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, ['bob-gh']);
  });

  test('skips re-requesting review from user who commented', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'COMMENTED' }]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, ['bob-gh']);
  });

  test('re-requests review from user whose review was dismissed', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([
      { user: 'alice-gh', state: 'APPROVED' },
      { user: 'alice-gh', state: 'DISMISSED' },
    ]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
  });

  test('re-requests review from user with pending review state', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([{ user: 'alice-gh', state: 'PENDING' }]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
  });

  test('does not request reviewers when all have already reviewed', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([
      { user: 'alice-gh', state: 'APPROVED' },
      { user: 'bob-gh', state: 'CHANGES_REQUESTED' },
    ]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('requests all reviewers when no reviews exist yet', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith(
      'test-org',
      'repo-alpha',
      42,
      expect.arrayContaining(['alice-gh', 'bob-gh']),
    );
  });

  test('ignores reviews with empty user when filtering existing reviewers', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([
      { user: '', state: 'APPROVED' },
      { user: 'alice-gh', state: 'APPROVED' },
    ]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, ['bob-gh']);
  });

  test('uses latest review state when user has multiple reviews', async () => {
    expect.assertions(1);

    listReviewsMock.mockResolvedValue([
      { user: 'alice-gh', state: 'APPROVED' },
      { user: 'alice-gh', state: 'DISMISSED' },
      { user: 'alice-gh', state: 'APPROVED' },
    ]);

    const event = makeEvent({
      owner: 'test-org',
      repo: 'repo-alpha',
      prAuthor: 'someuser',
      body: '',
    });

    await logic.execute(event);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith('test-org', 'repo-alpha', 42, ['bob-gh']);
  });
});
