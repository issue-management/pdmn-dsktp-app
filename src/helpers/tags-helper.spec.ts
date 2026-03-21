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
import * as path from 'node:path';

import { Container } from 'inversify';
import { TagsHelper } from './tags-helper';
import { graphql } from '@octokit/graphql';

vi.mock(import('@octokit/graphql'));

describe('test Helper TagsHelper', () => {
  let container: Container;
  let octokit: {
    rest: {
      issues: {
        createMilestone: Mock<() => unknown>;
        updateMilestone: Mock<() => unknown>;
      };
    };
  };

  beforeEach(async () => {
    container = new Container();
    container.bind(TagsHelper).toSelf().inSingletonScope();
    octokit = {
      rest: {
        issues: { createMilestone: vi.fn<() => unknown>(), updateMilestone: vi.fn<() => unknown>() },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    container.bind('string').toConstantValue('fooToken').whenNamed('GRAPHQL_READ_TOKEN');
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('search tags', async () => {
    expect.assertions(5);

    const tagsHelper = container.get(TagsHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'tags-helper.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherJson = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'tags-helper-next.json'),
      'utf8',
    );
    const anotherParsedJSON = JSON.parse(anotherJson);
    vi.mocked(graphql).mockResolvedValueOnce(anotherParsedJSON);
    const map = await tagsHelper.getLatestTags();

    // Should have 4 repositories with tags
    expect(map.size).toBe(4);

    const cheTags = map.get('eclipse/che');

    expect(cheTags).toBeDefined();
    expect(cheTags!).toHaveLength(5);
    expect(cheTags![0].name).toBe('7.17.0');
    expect(cheTags![0].committedDate).toBe('2020-08-05T13:39:46Z');
  });
});
