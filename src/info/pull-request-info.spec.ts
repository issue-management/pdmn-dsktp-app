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

import { beforeEach, describe, expect, test, vi, expectTypeOf } from 'vitest';
import { Container } from 'inversify';
import { IssueInfoBuilder } from '/@/info/issue-info';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestInfoBuilder } from '/@/info/pull-request-info';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';

describe('test PullRequestInfo', () => {
  let container: Container;

  let pullRequestInfoLinkedIssuesExtractor: PullRequestInfoLinkedIssuesExtractor;
  let issuesHelper: IssuesHelper;

  beforeEach(() => {
    container = new Container();
    pullRequestInfoLinkedIssuesExtractor = {
      extract: vi.fn<() => string[]>(),
    } as unknown as PullRequestInfoLinkedIssuesExtractor;
    container.bind(PullRequestInfoLinkedIssuesExtractor).toConstantValue(pullRequestInfoLinkedIssuesExtractor);

    issuesHelper = {
      getIssue: vi.fn<() => Promise<unknown>>(),
    } as unknown as IssuesHelper;
    container.bind(IssuesHelper).toConstantValue(issuesHelper);

    container.bind(PullRequestInfoBuilder).toSelf().inSingletonScope();
  });

  test('info', async () => {
    expect.assertions(3);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    expect(pullRequestInfoBuilder).toBeDefined();

    const mergingBranch = 'my-custom-branch';
    const mergedState = true;

    const pullRequestInfo = pullRequestInfoBuilder
      .build()
      .withMergingBranch(mergingBranch)
      .withMergedState(mergedState);

    expect(pullRequestInfo.mergingBranch).toBe(mergingBranch);
    expect(pullRequestInfo.merged).toBe(mergedState);
  });

  test('resolve info - before resolution', async () => {
    expect.assertions(2);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    expect(pullRequestInfoBuilder).toBeDefined();

    const mergingBranch = 'my-custom-branch';
    const mergedState = true;

    const issueInfo = new IssueInfoBuilder().build().withOwner('owner').withRepo('repo').withNumber(1234);

    const linkedIssue = 'https://api.github.com/repos/test/test/issues/123';
    vi.mocked(pullRequestInfoLinkedIssuesExtractor.extract).mockReturnValue([linkedIssue]);
    vi.mocked(issuesHelper.getIssue).mockResolvedValue(issueInfo);

    const pullRequestInfo = pullRequestInfoBuilder
      .build()
      .withMergingBranch(mergingBranch)
      .withMergedState(mergedState);

    // Before, no linked issues
    expect(pullRequestInfo.linkedIssues).toStrictEqual([]);
  });

  test('resolve info - after resolution', async () => {
    expect.assertions(4);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    const mergingBranch = 'my-custom-branch';
    const mergedState = true;

    const issueInfo = new IssueInfoBuilder().build().withOwner('owner').withRepo('repo').withNumber(1234);

    const linkedIssue = 'https://api.github.com/repos/test/test/issues/123';
    vi.mocked(pullRequestInfoLinkedIssuesExtractor.extract).mockReturnValue([linkedIssue]);
    vi.mocked(issuesHelper.getIssue).mockResolvedValue(issueInfo);

    const pullRequestInfo = pullRequestInfoBuilder
      .build()
      .withMergingBranch(mergingBranch)
      .withMergedState(mergedState);

    await pullRequestInfoBuilder.resolve(pullRequestInfo);

    // After resolve, linked issue
    expect(pullRequestInfoLinkedIssuesExtractor.extract).toHaveBeenCalledWith(expect.anything());
    expect(issuesHelper.getIssue).toHaveBeenCalledWith(expect.anything());
    expect(pullRequestInfo.linkedIssues).toHaveLength(1);
    expect(pullRequestInfo.linkedIssues).toStrictEqual([issueInfo]);
  });

  test('all PR-specific getters and setters - merge and status properties', () => {
    expect.assertions(5);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    const pr = pullRequestInfoBuilder
      .build()
      .withMergingBranch('main')
      .withMergedState(true)
      .withMergedAt('2024-01-01T00:00:00Z')
      .withTitle('test PR')
      .withStatusState('SUCCESS')
      .withReviewState('APPROVED')
      .withAutoMergeEnabled(true)
      .withAge('2 days')
      .withLastCommitDate('2024-01-01T00:00:00Z')
      .withLinkedIssues([]);

    expect(pr.mergingBranch).toBe('main');
    expect(pr.merged).toBe(true);
    expect(pr.mergedAt).toBe('2024-01-01T00:00:00Z');
    expect(pr.title).toBe('test PR');
    expect(pr.statusState).toBe('SUCCESS');
  });

  test('all PR-specific getters and setters - review and timing properties', () => {
    expect.assertions(5);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    const pr = pullRequestInfoBuilder
      .build()
      .withMergingBranch('main')
      .withMergedState(true)
      .withMergedAt('2024-01-01T00:00:00Z')
      .withTitle('test PR')
      .withStatusState('SUCCESS')
      .withReviewState('APPROVED')
      .withAutoMergeEnabled(true)
      .withAge('2 days')
      .withLastCommitDate('2024-01-01T00:00:00Z')
      .withLinkedIssues([]);

    expect(pr.reviewState).toBe('APPROVED');
    expect(pr.autoMergeEnabled).toBe(true);
    expect(pr.age).toBe('2 days');
    expect(pr.lastCommitDate).toBe('2024-01-01T00:00:00Z');
    expect(pr.linkedIssues).toStrictEqual([]);
  });

  test('computeAge returns human-readable duration', () => {
    expect.assertions(2);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    const pr = pullRequestInfoBuilder
      .build()
      .withLastCommitDate(new Date(Date.now() - 3600000).toISOString())
      .computeAge();

    expect(pr.age).toBeDefined();

    expectTypeOf(pr.age).toBeString();

    expect(pr.age.length).toBeGreaterThan(0);
  });

  test('resolve info with no getIssue - before resolution', async () => {
    expect.assertions(2);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    expect(pullRequestInfoBuilder).toBeDefined();

    const mergingBranch = 'my-custom-branch';
    const mergedState = true;

    const linkedIssue = 'https://api.github.com/repos/test/test/issues/123';
    vi.mocked(pullRequestInfoLinkedIssuesExtractor.extract).mockReturnValue([linkedIssue]);
    vi.mocked(issuesHelper.getIssue).mockResolvedValue(undefined);

    const pullRequestInfo = pullRequestInfoBuilder
      .build()
      .withMergingBranch(mergingBranch)
      .withMergedState(mergedState);

    // Before, no linked issues
    expect(pullRequestInfo.linkedIssues).toStrictEqual([]);
  });

  test('resolve info with no getIssue - after resolution', async () => {
    expect.assertions(4);

    const pullRequestInfoBuilder = container.get(PullRequestInfoBuilder);

    const mergingBranch = 'my-custom-branch';
    const mergedState = true;

    const linkedIssue = 'https://api.github.com/repos/test/test/issues/123';
    vi.mocked(pullRequestInfoLinkedIssuesExtractor.extract).mockReturnValue([linkedIssue]);
    vi.mocked(issuesHelper.getIssue).mockResolvedValue(undefined);

    const pullRequestInfo = pullRequestInfoBuilder
      .build()
      .withMergingBranch(mergingBranch)
      .withMergedState(mergedState);

    await pullRequestInfoBuilder.resolve(pullRequestInfo);

    // After resolve, linked issue
    expect(pullRequestInfoLinkedIssuesExtractor.extract).toHaveBeenCalledWith(expect.anything());
    expect(issuesHelper.getIssue).toHaveBeenCalledWith(expect.anything());
    expect(pullRequestInfo.linkedIssues).toHaveLength(0);
    expect(pullRequestInfo.linkedIssues).toStrictEqual([]);
  });
});
