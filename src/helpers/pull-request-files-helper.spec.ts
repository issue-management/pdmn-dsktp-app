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
 ******************************************************************************/

import type { Mock } from 'vitest';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';

import { Container } from 'inversify';
import { PullRequestFilesHelper } from '/@/helpers/pull-request-files-helper';

describe(PullRequestFilesHelper, () => {
  let container: Container;
  let listFilesMock: Mock;

  beforeEach(() => {
    container = new Container();
    container.bind(PullRequestFilesHelper).toSelf().inSingletonScope();

    listFilesMock = vi.fn<() => Promise<unknown>>();
    const octokit = {
      rest: {
        pulls: {
          listFiles: listFilesMock,
        },
      },
    };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('WRITE_TOKEN');
  });

  describe('listFiles', () => {
    test('returns mapped file objects from octokit response', async () => {
      expect.assertions(1);

      listFilesMock.mockResolvedValueOnce({
        data: [
          { filename: 'package.json', status: 'modified' },
          { filename: 'pnpm-lock.yaml', status: 'modified' },
        ],
      });

      const helper = container.get(PullRequestFilesHelper);
      const result = await helper.listFiles('owner', 'repo', 1);

      expect(result).toStrictEqual([
        { filename: 'package.json', status: 'modified' },
        { filename: 'pnpm-lock.yaml', status: 'modified' },
      ]);
    });

    test('handles pagination across multiple pages', async () => {
      expect.assertions(2);

      // First page: 100 items (full page triggers next fetch)
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        filename: `file${i}.ts`,
        status: 'modified',
      }));
      listFilesMock.mockResolvedValueOnce({ data: page1 });

      // Second page: partial (ends pagination)
      listFilesMock.mockResolvedValueOnce({
        data: [{ filename: 'last-file.ts', status: 'added' }],
      });

      const helper = container.get(PullRequestFilesHelper);
      const result = await helper.listFiles('owner', 'repo', 1);

      expect(result).toHaveLength(101);
      expect(listFilesMock).toHaveBeenCalledTimes(2);
    });

    test('uses unknown status when file status is undefined', async () => {
      expect.assertions(1);

      listFilesMock.mockResolvedValueOnce({
        data: [{ filename: 'file.ts', status: undefined }],
      });

      const helper = container.get(PullRequestFilesHelper);
      const result = await helper.listFiles('owner', 'repo', 1);

      expect(result).toStrictEqual([{ filename: 'file.ts', status: 'unknown' }]);
    });
  });

  describe('isOnlyDependencyFiles', () => {
    test('returns true for package.json and pnpm-lock.yaml', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.isOnlyDependencyFiles([
        { filename: 'package.json', status: 'modified' },
        { filename: 'pnpm-lock.yaml', status: 'modified' },
      ]);

      expect(result).toBe(true);
    });

    test('returns true for nested package.json files', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.isOnlyDependencyFiles([
        { filename: 'packages/a/package.json', status: 'modified' },
        { filename: 'packages/b/package.json', status: 'modified' },
        { filename: 'pnpm-lock.yaml', status: 'modified' },
      ]);

      expect(result).toBe(true);
    });

    test('returns false when source files are included', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.isOnlyDependencyFiles([
        { filename: 'package.json', status: 'modified' },
        { filename: 'src/index.ts', status: 'modified' },
      ]);

      expect(result).toBe(false);
    });

    test('returns false for empty files array', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.isOnlyDependencyFiles([]);

      expect(result).toBe(false);
    });

    test('returns true for only package.json without lock file', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.isOnlyDependencyFiles([{ filename: 'package.json', status: 'modified' }]);

      expect(result).toBe(true);
    });
  });

  describe('getChangedPackageJsonPaths', () => {
    test('returns only package.json paths excluding pnpm-lock.yaml', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.getChangedPackageJsonPaths([
        { filename: 'package.json', status: 'modified' },
        { filename: 'pnpm-lock.yaml', status: 'modified' },
        { filename: 'packages/ui/package.json', status: 'modified' },
      ]);

      expect(result).toStrictEqual(['package.json', 'packages/ui/package.json']);
    });

    test('returns empty array when only pnpm-lock.yaml changed', () => {
      expect.assertions(1);

      const helper = container.get(PullRequestFilesHelper);
      const result = helper.getChangedPackageJsonPaths([{ filename: 'pnpm-lock.yaml', status: 'modified' }]);

      expect(result).toStrictEqual([]);
    });
  });
});
