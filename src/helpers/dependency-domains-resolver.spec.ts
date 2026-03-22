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
import { DependencyDomainsResolver } from '/@/helpers/dependency-domains-resolver';
import type { DependencyAnalysisResult } from '/@/helpers/dependency-change-analyzer';

vi.mock(import('/@/data/domains-data'), () => ({
  domainsData: [{ domain: 'Foundations', description: '', owners: ['Alice', 'Bob'] }],
}));

vi.mock(import('/@/data/extra-domains-data'), () => ({
  extraDomainsData: [
    {
      domain: 'dependency-update-minor',
      description: 'Minor or patch dependency version bumps',
      owners: ['podman-desktop-bot'],
    },
    { domain: 'dependency-update-major', description: 'Major dependency version bumps', owners: [] },
    { domain: 'dependency-new', description: 'New dependencies added', owners: [] },
    { domain: 'dependency-remove', description: 'Dependencies removed', owners: [] },
  ],
}));

function makeResult(overrides: Partial<DependencyAnalysisResult> = {}): DependencyAnalysisResult {
  return {
    isDependencyOnlyPR: true,
    changes: [],
    hasMinorOrPatch: false,
    hasMajor: false,
    hasNew: false,
    hasRemoved: false,
    ...overrides,
  };
}

describe(DependencyDomainsResolver, () => {
  let resolver: DependencyDomainsResolver;

  beforeEach(() => {
    const container = new Container();
    container.bind(DependencyDomainsResolver).toSelf().inSingletonScope();
    resolver = container.get(DependencyDomainsResolver);
  });

  test('returns domain for minor/patch changes', () => {
    expect.assertions(2);

    const result = resolver.resolve(makeResult({ hasMinorOrPatch: true }));

    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].domain).toBe('dependency-update-minor');
  });

  test('returns domain for major changes', () => {
    expect.assertions(2);

    const result = resolver.resolve(makeResult({ hasMajor: true }));

    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].domain).toBe('dependency-update-major');
  });

  test('returns domains including foundations for new dependencies', () => {
    expect.assertions(2);

    const result = resolver.resolve(makeResult({ hasNew: true }));

    const domainNames = result.domains.map(d => d.domain);

    expect(domainNames).toContain('dependency-new');
    expect(domainNames).toContain('Foundations');
  });

  test('returns domains including foundations for removed dependencies', () => {
    expect.assertions(2);

    const result = resolver.resolve(makeResult({ hasRemoved: true }));

    const domainNames = result.domains.map(d => d.domain);

    expect(domainNames).toContain('dependency-remove');
    expect(domainNames).toContain('Foundations');
  });

  test('returns multiple domains when PR has mixed change types', () => {
    expect.assertions(4);

    const result = resolver.resolve(
      makeResult({
        hasMinorOrPatch: true,
        hasMajor: true,
        hasNew: true,
      }),
    );

    const domainNames = result.domains.map(d => d.domain);

    expect(domainNames).toContain('dependency-update-minor');
    expect(domainNames).toContain('dependency-update-major');
    expect(domainNames).toContain('dependency-new');
    expect(domainNames).toContain('Foundations');
  });

  test('returns empty domains when no change flags are set', () => {
    expect.assertions(1);

    const result = resolver.resolve(makeResult());

    expect(result.domains).toHaveLength(0);
  });

  test('deduplicates Foundations domain when both new and removed deps exist', () => {
    expect.assertions(1);

    const result = resolver.resolve(makeResult({ hasNew: true, hasRemoved: true }));

    const foundationsCount = result.domains.filter(d => d.domain === 'Foundations').length;

    expect(foundationsCount).toBe(1);
  });

  test('dependency-update-minor domain has podman-desktop-bot as owner', () => {
    expect.assertions(1);

    const result = resolver.resolve(makeResult({ hasMinorOrPatch: true }));

    expect(result.domains[0].owners).toStrictEqual(['podman-desktop-bot']);
  });

  test('dependency-update-major domain has empty owners', () => {
    expect.assertions(1);

    const result = resolver.resolve(makeResult({ hasMajor: true }));

    expect(result.domains[0].owners).toStrictEqual([]);
  });
});
