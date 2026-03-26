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

import { describe, test, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Container } from 'inversify';
import { FolderDomainsHelper } from '/@/helpers/folder-domains-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';

vi.mock(import('/@/data/folder-domains-data'), () => ({
  folderDomainsData: [
    {
      repository: '*',
      mappings: [
        { pattern: 'eslint.config.mjs', domain: 'Epsilon' },
        { pattern: '**/tsconfig.json', domain: 'Epsilon' },
      ],
      globalMappings: [{ pattern: 'tests/**', domain: 'Zeta' }],
    },
    {
      repository: 'https://github.com/test-org/test-repo',
      mappings: [
        { pattern: 'src/api/**', domain: 'Alpha' },
        { pattern: 'src/ui/**', domain: 'Delta' },
        { pattern: 'src/plugin/container*', domain: 'Beta' },
        { pattern: 'src/lib/*', domain: 'Alpha' },
        { pattern: 'LICENSE', domain: 'Epsilon' },
        { pattern: 'docs/blog/**', domain: 'Gamma/docs' },
        { pattern: 'docs/**', domain: 'Gamma/engineering' },
      ],
      globalMappings: [
        { pattern: 'docs/blog/**', domain: 'Gamma/pm' },
        { pattern: '**/package.json', domain: 'Epsilon' },
        { pattern: 'src/ui/**', domain: 'Delta/team-a' },
        { pattern: 'src/api/**', domain: 'Alpha' },
      ],
      defaultDomain: 'Epsilon',
    },
    {
      repository: 'https://github.com/test-org/no-default-repo',
      mappings: [{ pattern: 'src/api/**', domain: 'Alpha' }],
    },
  ],
}));

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [
    { domain: 'Alpha', description: '', owners: ['Alice'] },
    { domain: 'Beta', description: '', owners: ['Bob'] },
    { domain: 'Delta/team-a', description: '', owners: ['Charlie'] },
    { domain: 'Delta/team-b', description: '', owners: ['Dave'] },
    { domain: 'Gamma/docs', description: '', owners: ['Eve'] },
    { domain: 'Gamma/pm', description: '', owners: ['Frank'] },
    { domain: 'Gamma/engineering', description: '', owners: ['Grace'] },
    { domain: 'Epsilon', description: '', owners: ['Heidi'] },
    { domain: 'Zeta', description: '', owners: ['Ivan'] },
  ],
}));

vi.mock(import('/@/data/users-data'), () => ({
  usersData: {
    Alice: 'alice-gh',
    Bob: 'bob-gh',
    Charlie: 'charlie-gh',
    Dave: 'dave-gh',
    Eve: 'eve-gh',
    Frank: 'frank-gh',
    Grace: 'grace-gh',
    Heidi: 'heidi-gh',
    Ivan: 'ivan-gh',
  },
}));

describe(FolderDomainsHelper, () => {
  let container: Container;
  let folderDomainsHelper: FolderDomainsHelper;

  beforeEach(() => {
    container = new Container();
    container.bind(DomainsHelper).toSelf().inSingletonScope();
    container.bind(FolderDomainsHelper).toSelf().inSingletonScope();
    folderDomainsHelper = container.get(FolderDomainsHelper);
  });

  test('wildcard entry applies to unknown repository', () => {
    expect.assertions(2);

    // Eslint.config.mjs matches wildcard primary mapping → Epsilon
    const domains = folderDomainsHelper.getDomainsByFiles('unknown-org', 'unknown-repo', [
      { filename: 'eslint.config.mjs', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Epsilon');
  });

  test('matches files using ** glob pattern', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Alpha');
  });

  test('matches files using * glob pattern', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/plugin/container-registry.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Beta');
  });

  test('returns all subgroups when domain name matches parent', () => {
    expect.assertions(3);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/ui/button.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
    expect(domains.map(d => d.domain)).toContain('Delta/team-b');
  });

  test('first-match-wins for primary mappings with specific pattern before broad', () => {
    expect.assertions(3);

    // Docs/blog/post.md matches docs/blog/** → Gamma/docs (primary, first match wins)
    // Also matches docs/blog/** → Gamma/pm (global, additive)
    // Does NOT match docs/** → Gamma/engineering (primary, already matched)
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'docs/blog/post.md', status: 'added' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Gamma/docs');
    expect(domains.map(d => d.domain)).toContain('Gamma/pm');
  });

  test('broad primary pattern matches when specific pattern does not', () => {
    expect.assertions(2);

    // Docs/guide/intro.md does not match docs/blog/**, falls through to docs/** → Gamma/engineering
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'docs/guide/intro.md', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains.map(d => d.domain)).toContain('Gamma/engineering');
  });

  test('global mappings are additive with primary matches', () => {
    expect.assertions(3);

    // Tests/package.json: primary matches nothing specific... wait, there's no tests/** in mock data
    // Let's use src/api/package.json: primary matches src/api/** → Alpha, global matches **/package.json → Epsilon
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/api/package.json', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Alpha');
    expect(domains.map(d => d.domain)).toContain('Epsilon');
  });

  test('global mappings apply even when file falls to default domain', () => {
    expect.assertions(2);

    // Root package.json: no primary match, global matches **/package.json → Epsilon
    // Default does not apply because the file has a global match
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'package.json', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Epsilon');
  });

  test('falls back to default domain for unmatched files', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Epsilon');
  });

  test('combines matched and default domains for mixed files', () => {
    expect.assertions(3);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Alpha');
    expect(domains.map(d => d.domain)).toContain('Epsilon');
  });

  test('deduplicates domain entries across files', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
      { filename: 'src/api/utils.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Alpha');
  });

  test('does not add default domain when all files match', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
      { filename: 'src/api/utils.ts', status: 'added' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Alpha');
  });

  test('returns empty for empty file list', () => {
    expect.assertions(1);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', []);

    expect(domains).toHaveLength(0);
  });

  test('matches files using /* glob pattern', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/lib/utils.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Alpha');
  });

  test('matches files using exact pattern', () => {
    expect.assertions(2);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'LICENSE', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Epsilon');
  });

  test('deduplicates when same parent domain matched by multiple files', () => {
    expect.assertions(3);

    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/ui/button.ts', status: 'modified' },
      { filename: 'src/ui/input.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
    expect(domains.map(d => d.domain)).toContain('Delta/team-b');
  });

  test('getFileToDomainMap returns domain names per file', () => {
    expect.assertions(3);

    const map = folderDomainsHelper.getFileToDomainMap('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
      { filename: 'src/ui/button.ts', status: 'added' },
    ]);

    expect(map.size).toBe(2);
    expect(map.get('src/api/index.ts')).toStrictEqual(['Alpha']);
    expect(map.get('src/ui/button.ts')).toStrictEqual(['Delta', 'Delta/team-a']);
  });

  test('getFileToDomainMap returns primary and global domains for a file', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileToDomainMap('test-org', 'test-repo', [
      { filename: 'src/api/package.json', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/package.json')).toStrictEqual(['Alpha', 'Epsilon']);
  });

  test('getFileToDomainMap falls back to default domain for unmatched files', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileToDomainMap('test-org', 'test-repo', [
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('README.md')).toStrictEqual(['Epsilon']);
  });

  test('getFileToDomainMap returns empty array for unmatched files with no default domain', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileToDomainMap('test-org', 'no-default-repo', [
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('README.md')).toStrictEqual([]);
  });

  test('getFileToDomainMap applies wildcard for unknown repository', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileToDomainMap('unknown-org', 'unknown-repo', [
      { filename: 'eslint.config.mjs', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('eslint.config.mjs')).toStrictEqual(['Epsilon']);
  });

  test('deduplicates across byName and byParent resolution', () => {
    expect.assertions(3);

    // Src/api/bar.ts matches Alpha (primary), src/ui/foo.ts matches Delta (parent → team-a, team-b)
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/ui/foo.ts', status: 'modified' },
      { filename: 'src/api/bar.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(3);
    expect(domains.map(d => d.domain)).toContain('Alpha');
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
  });

  test('global **/pattern matches files at any depth', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileToDomainMap('test-org', 'test-repo', [
      { filename: 'deeply/nested/path/package.json', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    // No primary match → default Epsilon, global **/package.json → Epsilon (deduped)
    expect(map.get('deeply/nested/path/package.json')).toStrictEqual(['Epsilon']);
  });

  test('deduplicates resolved domain entries when parent and subgroup names overlap', () => {
    expect.assertions(3);

    // Src/ui/button.ts:
    // Primary → "Delta" (byParent resolves to Delta/team-a + Delta/team-b)
    // Global → "Delta/team-a" (byName resolves to Delta/team-a — already seen, dedup branch hit)
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/ui/button.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
    expect(domains.map(d => d.domain)).toContain('Delta/team-b');
  });

  test('global mappings do not prevent default domain for unmatched primary', () => {
    expect.assertions(3);

    // Docs/blog/post.md: primary → Gamma/docs, global → Gamma/pm
    // Unknown/file.ts: no primary match → default Epsilon
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'docs/blog/post.md', status: 'modified' },
      { filename: 'unknown/file.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(3);
    expect(domains.map(d => d.domain)).toContain('Gamma/docs');
    expect(domains.map(d => d.domain)).toContain('Gamma/pm');
  });

  test('getFileMatchDetails returns primary match with pattern', () => {
    expect.assertions(3);

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/index.ts')).toHaveLength(1);
    expect(map.get('src/api/index.ts')).toStrictEqual([
      { domain: 'Alpha', pattern: 'src/api/**', matchType: 'primary' },
    ]);
  });

  test('getFileMatchDetails does not add default when file has global match only', () => {
    expect.assertions(2);

    // Package.json at root: no primary match, but global **/package.json → Epsilon
    // Default should NOT apply because global matched
    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'package.json', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('package.json')).toStrictEqual([
      { domain: 'Epsilon', pattern: '**/package.json', matchType: 'global' },
    ]);
  });

  test('getFileMatchDetails returns default match for unmatched files', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('README.md')).toStrictEqual([{ domain: 'Epsilon', pattern: '*', matchType: 'default' }]);
  });

  test('getFileMatchDetails returns global match with pattern', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'src/api/package.json', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/package.json')).toStrictEqual([
      { domain: 'Alpha', pattern: 'src/api/**', matchType: 'primary' },
      { domain: 'Epsilon', pattern: '**/package.json', matchType: 'global' },
    ]);
  });

  test('getFileMatchDetails returns combined primary and global matches', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'docs/blog/post.md', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('docs/blog/post.md')).toStrictEqual([
      { domain: 'Gamma/docs', pattern: 'docs/blog/**', matchType: 'primary' },
      { domain: 'Gamma/pm', pattern: 'docs/blog/**', matchType: 'global' },
    ]);
  });

  test('getFileMatchDetails applies wildcard for unknown repository', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('unknown-org', 'unknown-repo', [
      { filename: 'eslint.config.mjs', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('eslint.config.mjs')).toStrictEqual([
      { domain: 'Epsilon', pattern: 'eslint.config.mjs', matchType: 'primary' },
    ]);
  });

  test('getFileMatchDetails returns empty details for unmatched files without default', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'no-default-repo', [
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('README.md')).toStrictEqual([]);
  });

  test('wildcard global mappings are merged with repo-specific entry', () => {
    expect.assertions(2);

    // Tests/e2e/test.spec.ts: no primary match, but wildcard global tests/** → Zeta
    // Default does not apply because the file has a global match
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'tests/e2e/test.spec.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Zeta');
  });

  test('wildcard primary mappings are appended after repo-specific mappings', () => {
    expect.assertions(2);

    // File eslint.config.mjs is not in test-repo mappings,
    // But the wildcard adds it. Since repo mappings come first, wildcard mappings act as fallback.
    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'eslint.config.mjs', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('eslint.config.mjs')).toStrictEqual([
      { domain: 'Epsilon', pattern: 'eslint.config.mjs', matchType: 'primary' },
    ]);
  });

  test('wildcard global mapping applies to unknown repo as global match type', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('unknown-org', 'unknown-repo', [
      { filename: 'tests/unit/foo.spec.ts', status: 'added' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('tests/unit/foo.spec.ts')).toStrictEqual([
      { domain: 'Zeta', pattern: 'tests/**', matchType: 'global' },
    ]);
  });

  test('wildcard tsconfig pattern matches nested paths', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('unknown-org', 'unknown-repo', [
      { filename: 'packages/renderer/tsconfig.json', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('packages/renderer/tsconfig.json')).toStrictEqual([
      { domain: 'Epsilon', pattern: '**/tsconfig.json', matchType: 'primary' },
    ]);
  });

  test('wildcard default domain is used when repo entry has no default', () => {
    expect.assertions(1);

    // No-default-repo has no defaultDomain, wildcard also has none → no default
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'no-default-repo', [
      { filename: 'README.md', status: 'modified' },
    ]);

    expect(domains).toHaveLength(0);
  });

  test('deduplicates when global mapping returns same domain as primary', () => {
    expect.assertions(2);

    // Src/api/index.ts: primary → Alpha, global → Alpha (duplicate, should be skipped)
    const map = folderDomainsHelper.getFileToDomainMap('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/index.ts')).toStrictEqual(['Alpha']);
  });

  test('getFileMatchDetails deduplicates when global returns same domain as primary', () => {
    expect.assertions(2);

    // Src/api/index.ts: primary → Alpha (src/api/**), global → Alpha (src/api/**) — deduped
    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/index.ts')).toStrictEqual([
      { domain: 'Alpha', pattern: 'src/api/**', matchType: 'primary' },
    ]);
  });

  test('wildcard global mapping merges with repo entry that has no globalMappings', () => {
    expect.assertions(2);

    // No-default-repo has no globalMappings, but wildcard contributes tests/** → Zeta
    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'no-default-repo', [
      { filename: 'tests/e2e/test.spec.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('tests/e2e/test.spec.ts')).toStrictEqual([
      { domain: 'Zeta', pattern: 'tests/**', matchType: 'global' },
    ]);
  });

  test('repo-specific primary takes precedence over wildcard primary for same file', () => {
    expect.assertions(2);

    // Src/api/index.ts matches repo-specific src/api/** → Alpha first, wildcard patterns do not match
    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'test-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/index.ts')).toStrictEqual([
      { domain: 'Alpha', pattern: 'src/api/**', matchType: 'primary' },
    ]);
  });
});

describe('without wildcard entry', () => {
  let container: Container;
  let folderDomainsHelper: FolderDomainsHelper;

  beforeEach(() => {
    container = new Container();
    container.bind(DomainsHelper).toSelf().inSingletonScope();
    container.bind(FolderDomainsHelper).toSelf().inSingletonScope();
    folderDomainsHelper = container.get(FolderDomainsHelper);

    // Override the private folderDomains field to remove wildcard entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (folderDomainsHelper as any).folderDomains = [
      {
        repository: 'https://github.com/test-org/no-global-repo',
        mappings: [{ pattern: 'src/api/**', domain: 'Alpha' }],
      },
    ];
  });

  test('returns empty for unknown repository without wildcard', () => {
    expect.assertions(1);

    const domains = folderDomainsHelper.getDomainsByFiles('unknown-org', 'unknown-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(0);
  });

  test('getFileToDomainMap returns empty map for unknown repository without wildcard', () => {
    expect.assertions(1);

    const map = folderDomainsHelper.getFileToDomainMap('unknown-org', 'unknown-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(0);
  });

  test('getFileMatchDetails returns empty map for unknown repository without wildcard', () => {
    expect.assertions(1);

    const map = folderDomainsHelper.getFileMatchDetails('unknown-org', 'unknown-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(0);
  });

  test('repo entry without globalMappings returns empty global matches', () => {
    expect.assertions(2);

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'no-global-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/index.ts')).toStrictEqual([
      { domain: 'Alpha', pattern: 'src/api/**', matchType: 'primary' },
    ]);
  });

  test('merge with wildcard that has no globalMappings', () => {
    expect.assertions(2);

    // Override folderDomains with a wildcard that has no globalMappings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (folderDomainsHelper as any).folderDomains = [
      {
        repository: '*',
        mappings: [{ pattern: 'eslint.config.mjs', domain: 'Epsilon' }],
      },
      {
        repository: 'https://github.com/test-org/no-global-repo',
        mappings: [{ pattern: 'src/api/**', domain: 'Alpha' }],
      },
    ];

    const map = folderDomainsHelper.getFileMatchDetails('test-org', 'no-global-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('src/api/index.ts')).toStrictEqual([
      { domain: 'Alpha', pattern: 'src/api/**', matchType: 'primary' },
    ]);
  });
});
