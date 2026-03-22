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

import type { DomainEntry } from '/@/helpers/domains-helper';
import type { DependencyAnalysisResult } from '/@/helpers/dependency-change-analyzer';

import domainsData from '/@domains.json' with { type: 'json' };
import extraDomainsData from '/@extra-domains.json' with { type: 'json' };

export interface DependencyResolveResult {
  domains: DomainEntry[];
  labels: string[];
}

@injectable()
export class DependencyDomainsResolver {
  private domains: DomainEntry[] = domainsData as DomainEntry[];
  private extraDomains: DomainEntry[] = extraDomainsData as DomainEntry[];

  public resolve(result: DependencyAnalysisResult): DependencyResolveResult {
    const labels: string[] = [];
    const domainNames: string[] = [];

    if (result.hasMinorOrPatch) {
      labels.push('domain/dependency/minor-update');
      domainNames.push('dependency-update-minor');
    }

    if (result.hasMajor) {
      labels.push('domain/dependency/major-update');
      domainNames.push('dependency-update-major');
    }

    if (result.hasNew) {
      labels.push('domain/dependency/new');
      domainNames.push('dependency-new');
      domainNames.push('Foundations');
    }

    if (result.hasRemoved) {
      labels.push('domain/dependency/remove');
      domainNames.push('dependency-remove');
      domainNames.push('Foundations');
    }

    // Deduplicate domain names (Foundations may appear twice)
    const uniqueDomainNames = [...new Set(domainNames)];

    const domains = uniqueDomainNames
      .map(name => {
        // Look up in extra-domains first, then fall back to domains.json
        const extra = this.extraDomains.find(d => d.domain.toLowerCase() === name.toLowerCase());
        if (extra) {
          return extra;
        }
        return this.domains.find(d => d.domain.toLowerCase() === name.toLowerCase());
      })
      .filter((entry): entry is DomainEntry => entry !== undefined);

    return { domains, labels };
  }
}
