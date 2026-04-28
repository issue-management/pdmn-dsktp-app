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

import { injectable } from 'inversify';

import type { DomainEntry } from '/@/data/domain-entry-schema';
import type { DependencyAnalysisResult } from '/@/helpers/dependency-change-analyzer';
import { extraDomainsData } from '/@/data/extra-domains-data';

export interface DependencyResolveResult {
  domains: DomainEntry[];
}

@injectable()
export class DependencyDomainsResolver {
  private extraDomains: DomainEntry[] = extraDomainsData;

  public resolve(result: DependencyAnalysisResult, prAuthor: string): DependencyResolveResult {
    const domainNames: string[] = [];

    if (result.hasMinorOrPatch && prAuthor === 'dependabot[bot]') {
      domainNames.push('dependency-update-minor');
    }

    if (result.hasMajor) {
      domainNames.push('dependency-update-major');
    }

    if (result.hasNew) {
      domainNames.push('dependency-new');
    }

    if (result.hasRemoved) {
      domainNames.push('dependency-remove');
    }

    const domains = domainNames
      .map(name => this.extraDomains.find(d => d.domain.toLowerCase() === name.toLowerCase()))
      .filter((entry): entry is DomainEntry => entry !== undefined);

    return { domains };
  }
}
