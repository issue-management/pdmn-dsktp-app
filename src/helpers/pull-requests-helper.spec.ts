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

import type { Mock } from 'vitest';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import 'reflect-metadata';

import * as fs from 'node:fs/promises';
import moment from 'moment';
import * as path from 'node:path';

import { Container } from 'inversify';
import { IssueInfoBuilder } from '/@/info/issue-info';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestInfoBuilder } from '/@/info/pull-request-info';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { graphql } from '@octokit/graphql';

vi.mock(import('@octokit/graphql'));

describe('test Helper PullRequestHelper', () => {
  let container: Container;
  let octokit: {
    issues: { createMilestone: Mock<() => unknown>; updateMilestone: Mock<() => unknown> };
    rest?: Record<string, unknown>;
  };

  beforeEach(async () => {
    container = new Container();
    container.bind(IssuesHelper).toSelf().inSingletonScope();
    container.bind(PullRequestsHelper).toSelf().inSingletonScope();
    container.bind(IssueInfoBuilder).toSelf().inSingletonScope();
    container.bind(PullRequestInfoBuilder).toSelf().inSingletonScope();
    container.bind(PullRequestInfoLinkedIssuesExtractor).toSelf().inSingletonScope();
    octokit = {
      issues: { createMilestone: vi.fn<() => unknown>(), updateMilestone: vi.fn<() => unknown>() },
    };

    container.bind('Octokit').toConstantValue(octokit);
    container.bind('string').toConstantValue('fooToken').whenNamed('GRAPHQL_READ_TOKEN');
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('listReviews returns simplified review data', async () => {
    expect.assertions(1);

    const listReviewsMock = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      data: [
        { user: { login: 'user1' }, state: 'APPROVED' },
        { user: { login: 'user2' }, state: 'CHANGES_REQUESTED' },
        { user: undefined, state: 'COMMENTED' },
      ],
    });
    octokit.rest = { pulls: { listReviews: listReviewsMock } };
    const pullRequestsHelper = container.get(PullRequestsHelper);

    const result = await pullRequestsHelper.listReviews('myOwner', 'myRepo', 42);

    expect(result).toStrictEqual([
      { user: 'user1', state: 'APPROVED' },
      { user: 'user2', state: 'CHANGES_REQUESTED' },
      { user: '', state: 'COMMENTED' },
    ]);
  });

  test('requestReviewers with empty array returns early without API call', async () => {
    expect.assertions(1);

    const requestReviewersMock = vi.fn<() => void>();
    octokit.rest = { pulls: { requestReviewers: requestReviewersMock } };
    const pullRequestsHelper = container.get(PullRequestsHelper);

    await pullRequestsHelper.requestReviewers('owner', 'repo', 1, []);

    expect(requestReviewersMock).not.toHaveBeenCalled();
  });

  test('requestReviewers with non-empty array calls octokit', async () => {
    expect.assertions(1);

    const requestReviewersMock = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});
    octokit.rest = { pulls: { requestReviewers: requestReviewersMock } };
    const pullRequestsHelper = container.get(PullRequestsHelper);

    await pullRequestsHelper.requestReviewers('myOwner', 'myRepo', 99, ['user1', 'user2']);

    expect(requestReviewersMock).toHaveBeenCalledExactlyOnceWith({
      owner: 'myOwner',
      repo: 'myRepo',
      pull_number: 99,
      reviewers: ['user1', 'user2'],
    });
  });

  test('search tags - returns correct count', async () => {
    expect.assertions(1);

    const pullRequestsHelper = container.get(PullRequestsHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'pulls-request-helper.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherJson = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'pulls-request-helper-next.json'),
      'utf8',
    );
    const anotherParsedJSON = JSON.parse(anotherJson);
    vi.mocked(graphql).mockResolvedValueOnce(anotherParsedJSON);
    const pullRequestInfos = await pullRequestsHelper.getRecentMerged(moment.duration(1, 'days'));

    // Should have 4 pull requests
    expect(pullRequestInfos).toHaveLength(20);
  });

  test('search tags - first pull request has correct properties', async () => {
    expect.assertions(5);

    const pullRequestsHelper = container.get(PullRequestsHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'pulls-request-helper.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherJson = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'pulls-request-helper-next.json'),
      'utf8',
    );
    const anotherParsedJSON = JSON.parse(anotherJson);
    vi.mocked(graphql).mockResolvedValueOnce(anotherParsedJSON);
    const pullRequestInfos = await pullRequestsHelper.getRecentMerged(moment.duration(1, 'days'));

    expect(pullRequestInfos[0].repo).toBe('che-docs');
    expect(pullRequestInfos[0].owner).toBe('eclipse');
    expect(pullRequestInfos[0].mergedAt).toBe('2020-08-06T12:52:47Z');
    expect(pullRequestInfos[0].htmlLink).toBe('https://github.com/eclipse/che-docs/pull/1450');
    expect(pullRequestInfos[0].mergingBranch).toBe('master');
  });
});
