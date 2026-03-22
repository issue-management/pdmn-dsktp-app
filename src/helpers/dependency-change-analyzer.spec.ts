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
import { DependencyChangeAnalyzer } from '/@/helpers/dependency-change-analyzer';

function encodePackageJson(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

describe(DependencyChangeAnalyzer, () => {
  let container: Container;
  let getContentMock: Mock;

  beforeEach(() => {
    container = new Container();
    container.bind(DependencyChangeAnalyzer).toSelf().inSingletonScope();

    getContentMock = vi.fn<() => Promise<unknown>>();
    const octokit = {
      rest: {
        repos: {
          getContent: getContentMock,
        },
      },
    };
    container.bind('Octokit').toConstantValue(octokit).whenNamed('WRITE_TOKEN');
  });

  describe('fetchPackageJson', () => {
    test('returns parsed JSON from base64 content', async () => {
      expect.assertions(1);

      const pkg = { name: 'test', dependencies: { foo: '1.0.0' } };
      getContentMock.mockResolvedValueOnce({
        data: { content: encodePackageJson(pkg) },
      });

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.fetchPackageJson('owner', 'repo', 'abc123', 'package.json');

      expect(result).toStrictEqual(pkg);
    });

    test('returns undefined on 404', async () => {
      expect.assertions(1);

      getContentMock.mockRejectedValueOnce(new Error('Not Found'));

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.fetchPackageJson('owner', 'repo', 'abc123', 'package.json');

      expect(result).toBeUndefined();
    });

    test('returns undefined when response has no content field', async () => {
      expect.assertions(1);

      getContentMock.mockResolvedValueOnce({ data: {} });

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.fetchPackageJson('owner', 'repo', 'abc123', 'package.json');

      expect(result).toBeUndefined();
    });
  });

  describe('comparePackageJsons', () => {
    test('detects minor version bump', () => {
      expect.assertions(3);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { name: 'test', dependencies: { foo: '^1.0.0' } },
        { name: 'test', dependencies: { foo: '^1.1.0' } },
      );

      expect(result.isDependencyOnly).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toStrictEqual({
        packageName: 'foo',
        changeType: 'minor',
        from: '^1.0.0',
        to: '^1.1.0',
        section: 'dependencies',
      });
    });

    test('detects patch version bump', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { dependencies: { foo: '1.0.0' } },
        { dependencies: { foo: '1.0.1' } },
      );

      expect(result.changes[0].changeType).toBe('minor');
    });

    test('detects major version bump', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { dependencies: { foo: '1.0.0' } },
        { dependencies: { foo: '2.0.0' } },
      );

      expect(result.changes[0].changeType).toBe('major');
    });

    test('detects new dependency', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons({ dependencies: {} }, { dependencies: { foo: '1.0.0' } });

      expect(result.changes[0]).toStrictEqual({
        packageName: 'foo',
        changeType: 'new',
        to: '1.0.0',
        section: 'dependencies',
      });
    });

    test('detects removed dependency', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons({ dependencies: { foo: '1.0.0' } }, { dependencies: {} });

      expect(result.changes[0]).toStrictEqual({
        packageName: 'foo',
        changeType: 'removed',
        from: '1.0.0',
        section: 'dependencies',
      });
    });

    test('ignores reordered keys with no actual changes', () => {
      expect.assertions(2);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { name: 'test', dependencies: { a: '1.0.0', b: '2.0.0' } },
        { name: 'test', dependencies: { b: '2.0.0', a: '1.0.0' } },
      );

      expect(result.isDependencyOnly).toBe(true);
      expect(result.changes).toHaveLength(0);
    });

    test('sets isDependencyOnly to false when scripts differ', () => {
      expect.assertions(2);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { name: 'test', scripts: { build: 'tsc' }, dependencies: { foo: '1.0.0' } },
        { name: 'test', scripts: { build: 'vite build' }, dependencies: { foo: '1.1.0' } },
      );

      expect(result.isDependencyOnly).toBe(false);
      expect(result.changes).toHaveLength(1);
    });

    test('handles both dependencies and devDependencies', () => {
      expect.assertions(5);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { dependencies: { foo: '1.0.0' }, devDependencies: { bar: '2.0.0' } },
        { dependencies: { foo: '1.1.0' }, devDependencies: { bar: '3.0.0' } },
      );

      expect(result.changes).toHaveLength(2);
      expect(result.changes[0].section).toBe('dependencies');
      expect(result.changes[0].changeType).toBe('minor');
      expect(result.changes[1].section).toBe('devDependencies');
      expect(result.changes[1].changeType).toBe('major');
    });

    test('returns no changes when both are undefined', () => {
      expect.assertions(2);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(undefined, undefined);

      expect(result.isDependencyOnly).toBe(true);
      expect(result.changes).toHaveLength(0);
    });

    test('treats all deps as new when base is undefined', () => {
      expect.assertions(2);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(undefined, {
        dependencies: { foo: '1.0.0' },
      });

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].changeType).toBe('new');
    });

    test('treats all deps as removed when head is undefined', () => {
      expect.assertions(2);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons({ dependencies: { foo: '1.0.0' } }, undefined);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].changeType).toBe('removed');
    });

    test('sets isDependencyOnly to false when name field differs', () => {
      expect.assertions(2);

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = analyzer.comparePackageJsons(
        { name: 'old-name', dependencies: { foo: '1.0.0' } },
        { name: 'new-name', dependencies: { foo: '1.0.0' } },
      );

      expect(result.isDependencyOnly).toBe(false);
      expect(result.changes).toHaveLength(0);
    });
  });

  describe('classifyVersionChange', () => {
    test('returns minor for patch bumps', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);

      expect(analyzer.classifyVersionChange('1.0.0', '1.0.1')).toBe('minor');
    });

    test('returns minor for minor bumps', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);

      expect(analyzer.classifyVersionChange('1.0.0', '1.1.0')).toBe('minor');
    });

    test('returns major for major bumps', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);

      expect(analyzer.classifyVersionChange('1.0.0', '2.0.0')).toBe('major');
    });

    test('returns major for non-semver versions', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);

      expect(analyzer.classifyVersionChange('workspace:*', 'workspace:^')).toBe('major');
    });

    test('handles range prefixes via semver.coerce', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);

      expect(analyzer.classifyVersionChange('^1.2.3', '^1.3.0')).toBe('minor');
    });

    test('handles tilde range prefixes', () => {
      expect.assertions(1);

      const analyzer = container.get(DependencyChangeAnalyzer);

      expect(analyzer.classifyVersionChange('~1.2.3', '~2.0.0')).toBe('major');
    });
  });

  describe('analyze', () => {
    test('aggregates changes across multiple package.json files', async () => {
      expect.assertions(4);

      const basePkg1 = { dependencies: { foo: '1.0.0' } };
      const headPkg1 = { dependencies: { foo: '1.1.0' } };
      const basePkg2 = { devDependencies: { bar: '1.0.0' } };
      const headPkg2 = { devDependencies: { bar: '2.0.0' } };

      getContentMock
        .mockResolvedValueOnce({ data: { content: encodePackageJson(basePkg1) } })
        .mockResolvedValueOnce({ data: { content: encodePackageJson(headPkg1) } })
        .mockResolvedValueOnce({ data: { content: encodePackageJson(basePkg2) } })
        .mockResolvedValueOnce({ data: { content: encodePackageJson(headPkg2) } });

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.analyze('owner', 'repo', 'base', 'head', [
        'package.json',
        'packages/a/package.json',
      ]);

      expect(result.isDependencyOnlyPR).toBe(true);
      expect(result.changes).toHaveLength(2);
      expect(result.hasMinorOrPatch).toBe(true);
      expect(result.hasMajor).toBe(true);
    });

    test('handles added package.json where base does not exist', async () => {
      expect.assertions(2);

      getContentMock.mockRejectedValueOnce(new Error('Not Found')).mockResolvedValueOnce({
        data: { content: encodePackageJson({ dependencies: { foo: '1.0.0' } }) },
      });

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.analyze('owner', 'repo', 'base', 'head', ['package.json']);

      expect(result.hasNew).toBe(true);
      expect(result.changes[0].changeType).toBe('new');
    });

    test('handles removed package.json where head does not exist', async () => {
      expect.assertions(2);

      getContentMock
        .mockResolvedValueOnce({
          data: { content: encodePackageJson({ dependencies: { foo: '1.0.0' } }) },
        })
        .mockRejectedValueOnce(new Error('Not Found'));

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.analyze('owner', 'repo', 'base', 'head', ['package.json']);

      expect(result.hasRemoved).toBe(true);
      expect(result.changes[0].changeType).toBe('removed');
    });

    test('sets isDependencyOnlyPR to false when non-dep fields change', async () => {
      expect.assertions(1);

      const basePkg = { name: 'test', scripts: { build: 'tsc' }, dependencies: { foo: '1.0.0' } };
      const headPkg = { name: 'test', scripts: { build: 'vite' }, dependencies: { foo: '1.1.0' } };

      getContentMock
        .mockResolvedValueOnce({ data: { content: encodePackageJson(basePkg) } })
        .mockResolvedValueOnce({ data: { content: encodePackageJson(headPkg) } });

      const analyzer = container.get(DependencyChangeAnalyzer);
      const result = await analyzer.analyze('owner', 'repo', 'base', 'head', ['package.json']);

      expect(result.isDependencyOnlyPR).toBe(false);
    });
  });
});
