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
import { DomainsHelper } from '/@/helpers/domains-helper';

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [
    {
      domain: 'alpha',
      description: '',
      owners: ['Alice', 'Bob'],
      repository: 'https://github.com/test-org/repo-alpha',
    },
    { domain: 'Beta', description: '', owners: ['Charlie', 'Dave'] },
    { domain: 'Gamma', description: '', owners: ['Alice', 'Eve'] },
  ],
}));

vi.mock(import('/@/data/users-data'), () => ({
  usersData: {
    Alice: 'alice-gh',
    Bob: 'bob-gh',
    Charlie: 'charlie-gh',
    Dave: 'dave-gh',
    Eve: 'eve-gh',
  },
}));

describe('check DomainsHelper', () => {
  let container: Container;
  let domainsHelper: DomainsHelper;

  beforeEach(() => {
    container = new Container();
    container.bind(DomainsHelper).toSelf().inSingletonScope();
    domainsHelper = container.get(DomainsHelper);
  });

  test('getDomainsByRepository matches repository URL', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByRepository('test-org', 'repo-alpha');

    expect(domains.length).toBeGreaterThanOrEqual(1);
    expect(domains[0].domain).toBe('alpha');
  });

  test('getDomainsByRepository returns empty for unknown repo', () => {
    expect.assertions(1);

    const domains = domainsHelper.getDomainsByRepository('unknown', 'repo');

    expect(domains).toHaveLength(0);
  });

  test('getDomainsByLabels matches domain/name/inreview labels', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByLabels(['domain/beta/inreview']);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Beta');
  });

  test('getDomainsByLabels matches domain/name/reviewed labels', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByLabels(['domain/gamma/reviewed']);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Gamma');
  });

  test('getDomainsByLabels matches area/name labels', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByLabels(['area/beta']);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Beta');
  });

  test('getDomainsByLabels deduplicates domains', () => {
    expect.assertions(1);

    const domains = domainsHelper.getDomainsByLabels(['domain/beta/inreview', 'area/beta']);

    expect(domains).toHaveLength(1);
  });

  test('getDomainsByLabels returns empty for unmatched labels', () => {
    expect.assertions(1);

    const domains = domainsHelper.getDomainsByLabels(['kind/bug', 'status/need-triage']);

    expect(domains).toHaveLength(0);
  });

  test('getDomainsByLabels handles multiple domains', () => {
    expect.assertions(3);

    const domains = domainsHelper.getDomainsByLabels(['domain/beta/inreview', 'domain/gamma/inreview']);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Beta');
    expect(domains.map(d => d.domain)).toContain('Gamma');
  });

  test('resolveGitHubUsernames maps first names to userids', () => {
    expect.assertions(1);

    const usernames = domainsHelper.resolveGitHubUsernames(['Alice', 'Charlie']);

    expect(usernames).toStrictEqual(['alice-gh', 'charlie-gh']);
  });

  test('resolveGitHubUsernames passes through unknown names as GitHub usernames', () => {
    expect.assertions(1);

    const usernames = domainsHelper.resolveGitHubUsernames(['Alice', 'some-bot']);

    expect(usernames).toStrictEqual(['alice-gh', 'some-bot']);
  });

  test('getReviewersForDomains returns unique reviewers', () => {
    expect.assertions(4);

    const domains = [
      { domain: 'Beta', description: '', owners: ['Charlie', 'Dave'] },
      { domain: 'kind', description: '', owners: ['Dave', 'Eve'] },
    ];
    const reviewers = domainsHelper.getReviewersForDomains(domains);

    expect(reviewers).toHaveLength(3);
    expect(reviewers).toContain('charlie-gh');
    expect(reviewers).toContain('dave-gh');
    expect(reviewers).toContain('eve-gh');
  });

  test('getDomainLabels returns inreview labels', () => {
    expect.assertions(1);

    const domains = [
      { domain: 'Beta', description: '', owners: ['Charlie', 'Dave'] },
      { domain: 'Gamma', description: '', owners: ['Alice', 'Eve'] },
    ];
    const labels = domainsHelper.getDomainLabels(domains);

    expect(labels).toStrictEqual(['domain/beta/inreview', 'domain/gamma/inreview']);
  });
});
