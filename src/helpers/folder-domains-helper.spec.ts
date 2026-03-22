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

import { describe, test, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Container } from 'inversify';
import { FolderDomainsHelper } from '/@/helpers/folder-domains-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';

vi.mock(import('/@/data/folder-domains-data'), () => ({
  folderDomainsData: [
    {
      repository: 'https://github.com/test-org/test-repo',
      mappings: [
        { pattern: 'src/api/**', domain: 'Alpha' },
        { pattern: 'src/ui/**', domain: 'Delta' },
        { pattern: 'src/plugin/container*', domain: 'Beta' },
        { pattern: 'src/lib/*', domain: 'Alpha' },
        { pattern: 'src/shared/**', domain: 'Alpha' },
        { pattern: 'src/shared/**', domain: 'Delta' },
        { pattern: 'LICENSE', domain: 'Epsilon' },
        { pattern: 'docs/blog/**', domain: 'Gamma/docs' },
        { pattern: 'docs/blog/**', domain: 'Gamma/pm' },
        { pattern: 'docs/blog/**', domain: 'Gamma' },
        { pattern: 'docs/**', domain: 'Gamma/engineering' },
      ],
      defaultDomain: 'Epsilon',
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

  test('returns empty for unknown repository', () => {
    expect.assertions(1);

    const domains = folderDomainsHelper.getDomainsByFiles('unknown-org', 'unknown-repo', [
      { filename: 'src/api/index.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(0);
  });

  test('matches files using /** glob pattern', () => {
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

    // "Delta" in folder-domains maps to "Delta" parent, which should resolve to both subgroups
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/ui/button.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
    expect(domains.map(d => d.domain)).toContain('Delta/team-b');
  });

  test('matches multiple domains from a single file', () => {
    expect.assertions(4);

    // Docs/blog/post.md matches both Gamma/docs and Gamma/pm, plus docs/** matches Gamma/engineering
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'docs/blog/post.md', status: 'added' },
    ]);

    expect(domains).toHaveLength(3);
    expect(domains.map(d => d.domain)).toContain('Gamma/docs');
    expect(domains.map(d => d.domain)).toContain('Gamma/pm');
    expect(domains.map(d => d.domain)).toContain('Gamma/engineering');
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

    // Both files match "Delta" parent which resolves to team-a and team-b
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/ui/button.ts', status: 'modified' },
      { filename: 'src/ui/input.ts', status: 'modified' },
    ]);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
    expect(domains.map(d => d.domain)).toContain('Delta/team-b');
  });

  test('deduplicates across byName and byParent resolution', () => {
    expect.assertions(4);

    // Src/shared/foo.ts matches both "Alpha" (byName) and "Delta" (byParent → team-a, team-b)
    // Alpha resolves via byName, Delta resolves via byParent
    const domains = folderDomainsHelper.getDomainsByFiles('test-org', 'test-repo', [
      { filename: 'src/shared/foo.ts', status: 'modified' },
      { filename: 'src/api/bar.ts', status: 'modified' },
    ]);

    // Alpha from both src/shared and src/api (deduped), plus Delta/team-a and Delta/team-b
    expect(domains).toHaveLength(3);
    expect(domains.map(d => d.domain)).toContain('Alpha');
    expect(domains.map(d => d.domain)).toContain('Delta/team-a');
    expect(domains.map(d => d.domain)).toContain('Delta/team-b');
  });
});
