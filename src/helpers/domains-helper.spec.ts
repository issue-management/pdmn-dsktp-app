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

import { describe, test, expect, beforeEach } from 'vitest';
import 'reflect-metadata';

import { Container } from 'inversify';
import { DomainsHelper } from '/@/helpers/domains-helper';

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

    const domains = domainsHelper.getDomainsByRepository('podman-desktop', 'extension-bootc');

    expect(domains.length).toBeGreaterThanOrEqual(1);
    expect(domains[0].domain).toBe('bootc');
  });

  test('getDomainsByRepository returns empty for unknown repo', () => {
    expect.assertions(1);

    const domains = domainsHelper.getDomainsByRepository('unknown', 'repo');

    expect(domains).toHaveLength(0);
  });

  test('getDomainsByLabels matches domain/name/inreview labels', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByLabels(['domain/containers/inreview']);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Containers');
  });

  test('getDomainsByLabels matches domain/name/reviewed labels', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByLabels(['domain/kubernetes/reviewed']);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Kubernetes');
  });

  test('getDomainsByLabels matches area/name labels', () => {
    expect.assertions(2);

    const domains = domainsHelper.getDomainsByLabels(['area/containers']);

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('Containers');
  });

  test('getDomainsByLabels deduplicates domains', () => {
    expect.assertions(1);

    const domains = domainsHelper.getDomainsByLabels(['domain/containers/inreview', 'area/containers']);

    expect(domains).toHaveLength(1);
  });

  test('getDomainsByLabels returns empty for unmatched labels', () => {
    expect.assertions(1);

    const domains = domainsHelper.getDomainsByLabels(['kind/bug', 'status/need-triage']);

    expect(domains).toHaveLength(0);
  });

  test('getDomainsByLabels handles multiple domains', () => {
    expect.assertions(3);

    const domains = domainsHelper.getDomainsByLabels(['domain/containers/inreview', 'domain/kubernetes/inreview']);

    expect(domains).toHaveLength(2);
    expect(domains.map(d => d.domain)).toContain('Containers');
    expect(domains.map(d => d.domain)).toContain('Kubernetes');
  });

  test('resolveGitHubUsernames maps first names to userids', () => {
    expect.assertions(1);

    const usernames = domainsHelper.resolveGitHubUsernames(['Axel', 'Florent']);

    expect(usernames).toStrictEqual(['axel7083', 'benoitf']);
  });

  test('resolveGitHubUsernames skips unknown names', () => {
    expect.assertions(1);

    const usernames = domainsHelper.resolveGitHubUsernames(['Axel', 'Unknown']);

    expect(usernames).toStrictEqual(['axel7083']);
  });

  test('getReviewersForDomains returns unique reviewers', () => {
    expect.assertions(4);

    const domains = [
      { domain: 'Containers', description: '', owners: ['Axel', 'Florent'] },
      { domain: 'kind', description: '', owners: ['Florent', 'Sonia'] },
    ];
    const reviewers = domainsHelper.getReviewersForDomains(domains);

    expect(reviewers).toHaveLength(3);
    expect(reviewers).toContain('axel7083');
    expect(reviewers).toContain('benoitf');
    expect(reviewers).toContain('SoniaSandler');
  });

  test('getDomainLabels returns inreview labels', () => {
    expect.assertions(1);

    const domains = [
      { domain: 'Containers', description: '', owners: ['Axel', 'Florent'] },
      { domain: 'Kubernetes', description: '', owners: ['Charlie', 'Philippe'] },
    ];
    const labels = domainsHelper.getDomainLabels(domains);

    expect(labels).toStrictEqual(['domain/containers/inreview', 'domain/kubernetes/inreview']);
  });
});
