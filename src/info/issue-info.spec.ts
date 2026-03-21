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

import { beforeEach, describe, expect, test } from 'vitest';
import { Container } from 'inversify';
import { IssueInfoBuilder } from './issue-info';

describe('test IssueInfo', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(IssueInfoBuilder).toSelf().inSingletonScope();
  });

  test('info', async () => {
    expect.assertions(4);

    const issueInfoBuilder = container.get(IssueInfoBuilder);

    expect(issueInfoBuilder).toBeDefined();

    const htmlLink = 'https://foo';

    const issueInfo = issueInfoBuilder.build().withHtmlLink(htmlLink).withLabels(['foobar']);

    expect(issueInfo.htmlLink).toBe(htmlLink);
    expect(issueInfo.hasLabel('foobar')).toBe(true);
    expect(issueInfo.hasLabel('baz')).toBe(false);
  });

  test('all getters - basic properties', () => {
    expect.assertions(5);

    const issueInfoBuilder = container.get(IssueInfoBuilder);
    const projectItems = [{ name: 'Backlog', projectId: 'proj-1', projectNumber: '4' }];

    const issueInfo = issueInfoBuilder
      .build()
      .withId('issue-id-1')
      .withBody('test body')
      .withProjectItems(projectItems)
      .withCreatedAt('2024-01-01T00:00:00Z')
      .withAuthor('testuser')
      .withHtmlLink('https://github.com/test/test/issues/1')
      .withRepo('test-repo')
      .withOwner('test-owner')
      .withNumber(42)
      .withLabels(['bug', 'enhancement']);

    expect(issueInfo.id).toBe('issue-id-1');
    expect(issueInfo.body).toBe('test body');
    expect(issueInfo.projectItems).toStrictEqual(projectItems);
    expect(issueInfo.createdAt).toBe('2024-01-01T00:00:00Z');
    expect(issueInfo.author).toBe('testuser');
  });

  test('all getters - repository and issue metadata', () => {
    expect.assertions(5);

    const issueInfoBuilder = container.get(IssueInfoBuilder);
    const projectItems = [{ name: 'Backlog', projectId: 'proj-1', projectNumber: '4' }];

    const issueInfo = issueInfoBuilder
      .build()
      .withId('issue-id-1')
      .withBody('test body')
      .withProjectItems(projectItems)
      .withCreatedAt('2024-01-01T00:00:00Z')
      .withAuthor('testuser')
      .withHtmlLink('https://github.com/test/test/issues/1')
      .withRepo('test-repo')
      .withOwner('test-owner')
      .withNumber(42)
      .withLabels(['bug', 'enhancement']);

    expect(issueInfo.htmlLink).toBe('https://github.com/test/test/issues/1');
    expect(issueInfo.repo).toBe('test-repo');
    expect(issueInfo.owner).toBe('test-owner');
    expect(issueInfo.number).toBe(42);
    expect(issueInfo.labels).toStrictEqual(['bug', 'enhancement']);
  });
});
