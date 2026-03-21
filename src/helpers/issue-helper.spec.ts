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

import type { IssueInfo } from '/@/info/issue-info';
import { IssueInfoBuilder } from '/@/info/issue-info';
import { IssuesHelper } from '/@/helpers/issue-helper';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

vi.mock(import('@octokit/graphql'));

const { graphql } = await import('@octokit/graphql');

describe('issuesHelper', () => {
  let container: Container;
  let issueInfoBuilder: IssueInfoBuilder;

  beforeEach(() => {
    vi.resetAllMocks();

    container = new Container();
    issueInfoBuilder = new IssueInfoBuilder();
    container.bind(IssueInfoBuilder).toConstantValue(issueInfoBuilder);
    container.bind(IssuesHelper).toSelf().inSingletonScope();
    container.bind('string').toConstantValue('fooToken').whenNamed('GRAPHQL_READ_TOKEN');
  });

  test('isFirstTime returns true when listForRepo returns empty array', async () => {
    expect.assertions(2);

    const octokit = { rest: { issues: { listForRepo: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    const issueInfo: IssueInfo = new IssueInfoBuilder()
      .build()
      .withNumber(1234)
      .withAuthor('author')
      .withOwner('my-owner')
      .withRepo('repository');

    vi.mocked(octokit.rest.issues.listForRepo).mockResolvedValueOnce({ data: [] } as unknown as never);

    const isFirstTime = await issueHelper.isFirstTime(issueInfo);

    expect(octokit.rest.issues.listForRepo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        creator: 'author',
        state: 'all',
        owner: 'my-owner',
        repo: 'repository',
      }),
    );
    expect(isFirstTime).toBe(true);
  });

  test('isFirstTime returns false when listForRepo returns non-empty array', async () => {
    expect.assertions(2);

    const octokit = { rest: { issues: { listForRepo: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    const issueInfo: IssueInfo = new IssueInfoBuilder()
      .build()
      .withNumber(1234)
      .withAuthor('author')
      .withOwner('my-owner')
      .withRepo('repository');

    vi.mocked(octokit.rest.issues.listForRepo).mockResolvedValueOnce({
      data: ['something', 'another-thing'],
    } as unknown as never);

    const isFirstTime = await issueHelper.isFirstTime(issueInfo);

    expect(octokit.rest.issues.listForRepo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        creator: 'author',
        state: 'all',
        owner: 'my-owner',
        repo: 'repository',
      }),
    );
    expect(isFirstTime).toBe(false);
  });

  test('getRecentIssues maps GraphQL response correctly - basic properties', async () => {
    expect.assertions(5);

    const octokit = { rest: { issues: { listForRepo: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor1', hasNextPage: false },
        edges: [
          {
            node: {
              createdAt: '2024-01-01T00:00:00Z',
              url: 'https://github.com/podman-desktop/podman-desktop/issues/1',
              id: 'issue-id-1',
              number: 1,
              labels: { nodes: [{ name: 'bug' }] },
              repository: { name: 'podman-desktop', owner: { login: 'podman-desktop' } },
              projectItems: {
                nodes: [
                  {
                    project: { id: 'proj-1', title: 'Planning' },
                    fieldValueByName: {
                      name: 'Backlog',
                      field: { project: { id: 'proj-1', number: 4 } },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    const moment = await import('moment');
    const duration = moment.duration(1, 'day');
    const issues = await issueHelper.getRecentIssues(duration);

    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(1);
    expect(issues[0].htmlLink).toBe('https://github.com/podman-desktop/podman-desktop/issues/1');
    expect(issues[0].id).toBe('issue-id-1');
    expect(issues[0].createdAt).toBe('2024-01-01T00:00:00Z');
  });

  test('getRecentIssues maps GraphQL response correctly - labels and project items', async () => {
    expect.assertions(4);

    const octokit = { rest: { issues: { listForRepo: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor1', hasNextPage: false },
        edges: [
          {
            node: {
              createdAt: '2024-01-01T00:00:00Z',
              url: 'https://github.com/podman-desktop/podman-desktop/issues/1',
              id: 'issue-id-1',
              number: 1,
              labels: { nodes: [{ name: 'bug' }] },
              repository: { name: 'podman-desktop', owner: { login: 'podman-desktop' } },
              projectItems: {
                nodes: [
                  {
                    project: { id: 'proj-1', title: 'Planning' },
                    fieldValueByName: {
                      name: 'Backlog',
                      field: { project: { id: 'proj-1', number: 4 } },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    const moment = await import('moment');
    const duration = moment.duration(1, 'day');
    const issues = await issueHelper.getRecentIssues(duration);

    expect(issues[0].labels).toStrictEqual(['bug']);
    expect(issues[0].repo).toBe('podman-desktop');
    expect(issues[0].owner).toBe('podman-desktop');
    expect(issues[0].projectItems).toStrictEqual([{ name: 'Backlog', projectId: 'proj-1', projectNumber: '4' }]);
  });

  test('getRecentIssues handles missing optional fields', async () => {
    expect.assertions(4);

    const octokit = { rest: { issues: { listForRepo: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'cursor2', hasNextPage: false },
        edges: [
          {
            node: {
              createdAt: '2024-02-01T00:00:00Z',
              url: 'https://github.com/podman-desktop/podman-desktop/issues/2',
              id: 'issue-id-2',
              number: 2,
              repository: { name: 'podman-desktop', owner: { login: 'podman-desktop' } },
            },
          },
        ],
      },
    });

    const moment = await import('moment');
    const duration = moment.duration(1, 'day');
    const issues = await issueHelper.getRecentIssues(duration);

    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(2);
    expect(issues[0].labels).toStrictEqual([]);
    expect(issues[0].projectItems).toStrictEqual([]);
  });

  test('getRecentIssues handles pagination', async () => {
    expect.assertions(2);

    const octokit = { rest: { issues: { listForRepo: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    // First page has hasNextPage: true
    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'page1-cursor', hasNextPage: true },
        edges: [
          {
            node: {
              createdAt: '2024-01-01T00:00:00Z',
              url: 'https://github.com/podman-desktop/podman-desktop/issues/1',
              id: 'issue-1',
              number: 1,
              repository: { name: 'podman-desktop', owner: { login: 'podman-desktop' } },
            },
          },
        ],
      },
    });

    // Second page has hasNextPage: false
    vi.mocked(graphql).mockResolvedValueOnce({
      search: {
        pageInfo: { endCursor: 'page2-cursor', hasNextPage: false },
        edges: [
          {
            node: {
              createdAt: '2024-01-02T00:00:00Z',
              url: 'https://github.com/podman-desktop/podman-desktop/issues/2',
              id: 'issue-2',
              number: 2,
              repository: { name: 'podman-desktop', owner: { login: 'podman-desktop' } },
            },
          },
        ],
      },
    });

    const moment = await import('moment');
    const duration = moment.duration(1, 'day');
    const issues = await issueHelper.getRecentIssues(duration);

    expect(issues).toHaveLength(2);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  test('getIssue with valid link returns IssueInfo', async () => {
    expect.assertions(5);

    const octokit = { rest: { issues: { get: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(octokit.rest.issues.get).mockResolvedValueOnce({
      data: {
        body: 'Issue body text',
        user: { login: 'testuser' },
        html_url: 'https://github.com/owner/repo/issues/42',
        number: 42,
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
      },
    } as unknown as never);

    const result = await issueHelper.getIssue('/repos/owner/repo/issues/42');

    expect(result).toBeDefined();
    expect(result?.body).toBe('Issue body text');
    expect(result?.author).toBe('testuser');
    expect(result?.htmlLink).toBe('https://github.com/owner/repo/issues/42');
    expect(result?.number).toBe(42);
  });

  test('getIssue with valid link returns correct owner, repo, and labels', async () => {
    expect.assertions(3);

    const octokit = { rest: { issues: { get: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(octokit.rest.issues.get).mockResolvedValueOnce({
      data: {
        body: 'Issue body text',
        user: { login: 'testuser' },
        html_url: 'https://github.com/owner/repo/issues/42',
        number: 42,
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
      },
    } as unknown as never);

    const result = await issueHelper.getIssue('/repos/owner/repo/issues/42');

    expect(result?.owner).toBe('owner');
    expect(result?.repo).toBe('repo');
    expect(result?.labels).toStrictEqual(['bug', 'enhancement']);
  });

  test('getIssue calls octokit with correct parameters', async () => {
    expect.assertions(3);

    const octokit = { rest: { issues: { get: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(octokit.rest.issues.get).mockResolvedValueOnce({
      data: {
        body: 'Issue body text',
        user: { login: 'testuser' },
        html_url: 'https://github.com/owner/repo/issues/42',
        number: 42,
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
      },
    } as unknown as never);

    await issueHelper.getIssue('/repos/owner/repo/issues/42');

    const params = (
      octokit.rest.issues.get.mock.calls[0] as unknown[]
    )[0] as RestEndpointMethodTypes['issues']['get']['parameters'];

    expect(params.owner).toBe('owner');
    expect(params.repo).toBe('repo');
    expect(params.issue_number).toBe(42);
  });

  test('getIssue with invalid link returns undefined', async () => {
    expect.assertions(2);

    const octokit = { rest: { issues: { get: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    const result = await issueHelper.getIssue('invalid-link');

    expect(result).toBeUndefined();
    expect(octokit.rest.issues.get).not.toHaveBeenCalled();
  });

  test('getIssue handles null body and missing user', async () => {
    expect.assertions(3);

    const octokit = { rest: { issues: { get: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(octokit.rest.issues.get).mockResolvedValueOnce({
      data: {
        body: undefined,
        user: undefined,
        html_url: 'https://github.com/owner/repo/issues/5',
        number: 5,
        labels: [],
      },
    } as unknown as never);

    const result = await issueHelper.getIssue('/repos/owner/repo/issues/5');

    expect(result).toBeDefined();
    expect(result?.body).toBe('');
    expect(result?.author).toBe('');
  });

  test('getIssue handles labels that are strings and objects', async () => {
    expect.assertions(2);

    const octokit = { rest: { issues: { get: vi.fn<() => Promise<unknown>>() } } };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('READ_TOKEN');
    const issueHelper = container.get(IssuesHelper);

    vi.mocked(octokit.rest.issues.get).mockResolvedValueOnce({
      data: {
        body: 'Body',
        user: { login: 'user1' },
        html_url: 'https://github.com/owner/repo/issues/10',
        number: 10,
        labels: ['string-label', { name: 'object-label' }, { name: undefined }],
      },
    } as unknown as never);

    const result = await issueHelper.getIssue('/repos/owner/repo/issues/10');

    expect(result).toBeDefined();
    expect(result?.labels).toStrictEqual(['string-label', 'object-label', '']);
  });
});
