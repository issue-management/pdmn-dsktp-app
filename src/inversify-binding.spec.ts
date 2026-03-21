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

import { describe, test, expect } from 'vitest';
import 'reflect-metadata';

import { AddLabelHelper } from './helpers/add-label-helper';
import type { Container } from 'inversify';
import { InversifyBinding } from './inversify-binding';
import { IssueInfoBuilder } from './info/issue-info';
import { IssuesHelper } from './helpers/issue-helper';
import { MilestoneHelper } from './helpers/milestone-helper';
import { OctokitBuilder } from './github/octokit-builder';
import { PodmanDesktopVersionFetcher } from './fetchers/podman-desktop-version-fetcher';
import { PullRequestInfoBuilder } from './info/pull-request-info';

describe('test InversifyBinding', () => {
  test('bindings - listeners and fetchers', async () => {
    expect.assertions(2);

    const inversifyBinding = new InversifyBinding('foo', 'bar');
    const container: Container = await inversifyBinding.initBindings();

    expect(inversifyBinding).toBeDefined();

    // Fetcher
    expect(container.get(PodmanDesktopVersionFetcher)).toBeDefined();
  });

  test('bindings - helpers', async () => {
    expect.assertions(3);

    const inversifyBinding = new InversifyBinding('foo', 'bar');
    const container: Container = await inversifyBinding.initBindings();

    // Helpers
    expect(container.get(AddLabelHelper)).toBeDefined();
    expect(container.get(MilestoneHelper)).toBeDefined();
    expect(container.get(IssuesHelper)).toBeDefined();
  });

  test('bindings - info builders and octokit', async () => {
    expect.assertions(3);

    const inversifyBinding = new InversifyBinding('foo', 'bar');
    const container: Container = await inversifyBinding.initBindings();

    // Check all info
    expect(container.get(IssueInfoBuilder)).toBeDefined();
    expect(container.get(PullRequestInfoBuilder)).toBeDefined();

    const octokitBuilder = container.get(OctokitBuilder);

    expect(octokitBuilder).toBeDefined();
  });
});
