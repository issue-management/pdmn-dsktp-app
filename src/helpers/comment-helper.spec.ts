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

import { CommentHelper } from '/@/helpers/comment-helper';

describe(CommentHelper, () => {
  let container: Container;
  let mockCreateComment: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCreateComment = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});

    container = new Container();
    container.bind(CommentHelper).toSelf().inSingletonScope();
    container
      .bind('Octokit')
      .toConstantValue({
        rest: {
          issues: {
            createComment: mockCreateComment,
          },
        },
      })
      .whenNamed('WRITE_TOKEN');
  });

  test('calls createComment with correct parameters', async () => {
    expect.assertions(1);

    const helper = container.get(CommentHelper);
    await helper.createComment('test-org', 'repo-alpha', 42, 'Thank you!');

    expect(mockCreateComment).toHaveBeenCalledExactlyOnceWith({
      owner: 'test-org',
      repo: 'repo-alpha',
      issue_number: 42,
      body: 'Thank you!',
    });
  });
});
