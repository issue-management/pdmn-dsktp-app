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

import { MergedPrCounterHelper } from '/@/helpers/merged-pr-counter-helper';

vi.mock(import('@octokit/graphql'));

const { graphql: mockGraphql } = await import('@octokit/graphql');

describe(MergedPrCounterHelper, () => {
  let container: Container;

  beforeEach(() => {
    vi.resetAllMocks();

    container = new Container();
    container.bind(MergedPrCounterHelper).toSelf().inSingletonScope();
    container.bind('string').toConstantValue('token test-graphql-token').whenNamed('GRAPHQL_READ_TOKEN');
  });

  test('returns the issue count from graphql search', async () => {
    expect.assertions(1);

    vi.mocked(mockGraphql).mockResolvedValue({ search: { issueCount: 10 } });

    const helper = container.get(MergedPrCounterHelper);
    const count = await helper.countMergedPrsByAuthor('contributor-user', 'test-org', 'repo-alpha');

    expect(count).toBe(10);
  });

  test('constructs query with repo filter', async () => {
    expect.assertions(1);

    vi.mocked(mockGraphql).mockResolvedValue({ search: { issueCount: 1 } });

    const helper = container.get(MergedPrCounterHelper);
    await helper.countMergedPrsByAuthor('contributor-user', 'test-org', 'repo-alpha');

    expect(vi.mocked(mockGraphql)).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({
        queryString: 'is:pr is:merged author:contributor-user repo:test-org/repo-alpha',
      }),
    );
  });

  test('passes authorization header to graphql', async () => {
    expect.assertions(1);

    vi.mocked(mockGraphql).mockResolvedValue({ search: { issueCount: 0 } });

    const helper = container.get(MergedPrCounterHelper);
    await helper.countMergedPrsByAuthor('contributor-user', 'test-org', 'repo-alpha');

    expect(vi.mocked(mockGraphql)).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({
        headers: { authorization: 'token test-graphql-token' },
      }),
    );
  });
});
