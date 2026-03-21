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

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { beforeEach, describe, expect, test } from 'vitest';
import { Container } from 'inversify';
import type { PullRequestInfo } from '/@/info/pull-request-info';
import { PullRequestInfoLinkedIssuesExtractor } from './pull-request-info-linked-issues-extractor';

describe('test PullRequestInfoLinkedIssuesExtractor', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(PullRequestInfoLinkedIssuesExtractor).toSelf().inSingletonScope();
  });

  test('extract with several links in full format (http://github.....)', async () => {
    expect.assertions(2);

    const pullRequestInfoLinkedIssuesExtractor = container.get(PullRequestInfoLinkedIssuesExtractor);

    expect(pullRequestInfoLinkedIssuesExtractor).toBeDefined();

    const txt: string = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'pull-request-info', 'multiple-links.md'),
      'utf8',
    );

    const pullRequestInfo = { body: txt } as unknown as PullRequestInfo;
    const issues = pullRequestInfoLinkedIssuesExtractor.extract(pullRequestInfo);

    expect(issues).toStrictEqual([
      'https://api.github.com/repos/eclipse/che/issues/16045',
      'https://api.github.com/repos/eclipse/che/issues/16046',
    ]);
  });

  test('extract with several links in short format #5', async () => {
    expect.assertions(2);

    const pullRequestInfoLinkedIssuesExtractor = container.get(PullRequestInfoLinkedIssuesExtractor);

    expect(pullRequestInfoLinkedIssuesExtractor).toBeDefined();

    const txt: string = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'pull-request-info', 'multiple-links-short-format.md'),
      'utf8',
    );

    const pullRequestInfo = { body: txt, owner: 'eclipse', repo: 'che' } as unknown as PullRequestInfo;
    const issues = pullRequestInfoLinkedIssuesExtractor.extract(pullRequestInfo);

    expect(issues).toStrictEqual([
      'https://api.github.com/repos/eclipse/che/issues/15',
      'https://api.github.com/repos/eclipse/che/issues/16',
    ]);
  });

  test('empty text', async () => {
    expect.assertions(2);

    const pullRequestInfoLinkedIssuesExtractor = container.get(PullRequestInfoLinkedIssuesExtractor);

    expect(pullRequestInfoLinkedIssuesExtractor).toBeDefined();

    const pullRequestInfo = { body: 'dummy content' } as unknown as PullRequestInfo;
    const issues = pullRequestInfoLinkedIssuesExtractor.extract(pullRequestInfo);

    expect(issues).toStrictEqual([]);
  });
});
