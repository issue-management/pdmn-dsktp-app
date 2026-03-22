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

import { inject, injectable, named } from 'inversify';
import * as semver from 'semver';

import type { Octokit } from '@octokit/rest';

export type DependencyChangeType = 'minor' | 'major' | 'new' | 'removed';

export interface DependencyChange {
  packageName: string;
  changeType: DependencyChangeType;
  from?: string;
  to?: string;
  section: 'dependencies' | 'devDependencies';
}

export interface DependencyAnalysisResult {
  isDependencyOnlyPR: boolean;
  changes: DependencyChange[];
  hasMinorOrPatch: boolean;
  hasMajor: boolean;
  hasNew: boolean;
  hasRemoved: boolean;
}

type DependencySection = 'dependencies' | 'devDependencies';

const DEPENDENCY_SECTIONS: DependencySection[] = ['dependencies', 'devDependencies'];

interface PackageJsonCompareResult {
  isDependencyOnly: boolean;
  changes: DependencyChange[];
}

@injectable()
export class DependencyChangeAnalyzer {
  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokit: Octokit;

  public async analyze(
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string,
    packageJsonPaths: string[],
  ): Promise<DependencyAnalysisResult> {
    const allChanges: DependencyChange[] = [];
    let isDependencyOnlyPR = true;

    for (const pkgPath of packageJsonPaths) {
      const basePkg = await this.fetchPackageJson(owner, repo, baseSha, pkgPath);
      const headPkg = await this.fetchPackageJson(owner, repo, headSha, pkgPath);

      const result = this.comparePackageJsons(basePkg, headPkg);
      if (!result.isDependencyOnly) {
        isDependencyOnlyPR = false;
      }
      allChanges.push(...result.changes);
    }

    return {
      isDependencyOnlyPR,
      changes: allChanges,
      hasMinorOrPatch: allChanges.some(c => c.changeType === 'minor'),
      hasMajor: allChanges.some(c => c.changeType === 'major'),
      hasNew: allChanges.some(c => c.changeType === 'new'),
      hasRemoved: allChanges.some(c => c.changeType === 'removed'),
    };
  }

  public async fetchPackageJson(
    owner: string,
    repo: string,
    ref: string,
    path: string,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const data = response.data;
      if ('content' in data && typeof data.content === 'string') {
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        return JSON.parse(decoded) as Record<string, unknown>;
      }
      return undefined;
    } catch {
      // File does not exist at this ref (404)
      return undefined;
    }
  }

  public comparePackageJsons(
    basePkg: Record<string, unknown> | undefined,
    headPkg: Record<string, unknown> | undefined,
  ): PackageJsonCompareResult {
    const changes: DependencyChange[] = [];

    // If both are undefined, no changes
    if (!basePkg && !headPkg) {
      return { isDependencyOnly: true, changes };
    }

    const baseObj = basePkg ?? {};
    const headObj = headPkg ?? {};

    // Check if non-dependency fields changed
    const allKeys = new Set([...Object.keys(baseObj), ...Object.keys(headObj)]);
    let isDependencyOnly = true;

    for (const key of allKeys) {
      if (DEPENDENCY_SECTIONS.includes(key as DependencySection)) {
        continue;
      }
      if (JSON.stringify(baseObj[key]) !== JSON.stringify(headObj[key])) {
        isDependencyOnly = false;
        break;
      }
    }

    // Compare dependency sections
    for (const section of DEPENDENCY_SECTIONS) {
      const baseDeps = (baseObj[section] ?? {}) as Record<string, string>;
      const headDeps = (headObj[section] ?? {}) as Record<string, string>;
      changes.push(...this.compareDependencySection(baseDeps, headDeps, section));
    }

    return { isDependencyOnly, changes };
  }

  private compareDependencySection(
    baseDeps: Record<string, string>,
    headDeps: Record<string, string>,
    section: DependencySection,
  ): DependencyChange[] {
    const changes: DependencyChange[] = [];
    const allPackages = new Set([...Object.keys(baseDeps), ...Object.keys(headDeps)]);

    for (const pkg of allPackages) {
      const baseVersion = baseDeps[pkg];
      const headVersion = headDeps[pkg];

      if (baseVersion === headVersion) {
        continue;
      }

      if (!baseVersion) {
        changes.push({ packageName: pkg, changeType: 'new', to: headVersion, section });
      } else if (!headVersion) {
        changes.push({ packageName: pkg, changeType: 'removed', from: baseVersion, section });
      } else {
        const changeType = this.classifyVersionChange(baseVersion, headVersion);
        changes.push({ packageName: pkg, changeType, from: baseVersion, to: headVersion, section });
      }
    }

    return changes;
  }

  public classifyVersionChange(from: string, to: string): 'minor' | 'major' {
    const fromCoerced = semver.coerce(from);
    const toCoerced = semver.coerce(to);

    if (!fromCoerced || !toCoerced) {
      // Non-semver: treat conservatively as major
      return 'major';
    }

    const diff = semver.diff(fromCoerced, toCoerced);
    if (diff === 'major' || diff === 'premajor') {
      return 'major';
    }
    return 'minor';
  }
}
