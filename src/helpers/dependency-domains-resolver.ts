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

@injectable()
export class DependencyDomainsResolver {
  private domains: DomainEntry[] = domainsData as DomainEntry[];

  public resolve(result: DependencyAnalysisResult): DomainEntry[] {
    const domainNames: string[] = [];

    if (result.hasMinorOrPatch) {
      domainNames.push('dependency-update-minor');
    }

    if (result.hasMajor) {
      domainNames.push('dependency-update-major');
    }

    if (result.hasNew || result.hasRemoved) {
      domainNames.push('Foundations');
    }

    return domainNames
      .map(name => this.domains.find(d => d.domain.toLowerCase() === name.toLowerCase()))
      .filter((entry): entry is DomainEntry => entry !== undefined);
  }
}
