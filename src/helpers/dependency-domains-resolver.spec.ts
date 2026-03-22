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

import { describe, test, expect, beforeEach } from 'vitest';
import 'reflect-metadata';

import { Container } from 'inversify';
import { DependencyDomainsResolver } from '/@/helpers/dependency-domains-resolver';
import type { DependencyAnalysisResult } from '/@/helpers/dependency-change-analyzer';

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

  test('returns dependency-update-minor domain for minor/patch changes only', () => {
    const result = resolver.resolve(makeResult({ hasMinorOrPatch: true }));

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('dependency-update-minor');
  });

  test('returns dependency-update-major domain for major changes', () => {
    const result = resolver.resolve(makeResult({ hasMajor: true }));

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('dependency-update-major');
  });

  test('returns Foundations domain for new dependencies', () => {
    const result = resolver.resolve(makeResult({ hasNew: true }));

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('Foundations');
  });

  test('returns Foundations domain for removed dependencies', () => {
    const result = resolver.resolve(makeResult({ hasRemoved: true }));

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('Foundations');
  });

  test('returns multiple domains when PR has mixed change types', () => {
    const result = resolver.resolve(
      makeResult({
        hasMinorOrPatch: true,
        hasMajor: true,
        hasNew: true,
      }),
    );

    expect(result).toHaveLength(3);

    const domainNames = result.map(d => d.domain);

    expect(domainNames).toContain('dependency-update-minor');
    expect(domainNames).toContain('dependency-update-major');
    expect(domainNames).toContain('Foundations');
  });

  test('returns empty array when no change flags are set', () => {
    const result = resolver.resolve(makeResult());

    expect(result).toHaveLength(0);
  });

  test('deduplicates Foundations domain when both new and removed deps exist', () => {
    const result = resolver.resolve(makeResult({ hasNew: true, hasRemoved: true }));

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('Foundations');
  });

  test('dependency-update-minor domain has empty owners', () => {
    const result = resolver.resolve(makeResult({ hasMinorOrPatch: true }));

    expect(result[0].owners).toStrictEqual([]);
  });

  test('dependency-update-major domain has owners', () => {
    const result = resolver.resolve(makeResult({ hasMajor: true }));

    expect(result[0].owners.length).toBeGreaterThan(0);
  });
});
