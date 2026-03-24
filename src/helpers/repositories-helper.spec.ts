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

import 'reflect-metadata';

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';

describe('repositoriesHelper', () => {
  let helper: RepositoriesHelper;

  beforeEach(() => {
    helper = new RepositoriesHelper();
  });

  test('isKnownRepository returns true for a watched organization', () => {
    expect.assertions(1);

    vi.spyOn(helper, 'getOrganizationsToWatch').mockReturnValue(['test-org']);
    vi.spyOn(helper, 'getRepositoriesToWatch').mockReturnValue([]);

    expect(helper.isKnownRepository('test-org', 'any-repo')).toBe(true);
  });

  test('isKnownRepository returns true for a watched repository', () => {
    expect.assertions(1);

    vi.spyOn(helper, 'getOrganizationsToWatch').mockReturnValue([]);
    vi.spyOn(helper, 'getRepositoriesToWatch').mockReturnValue(['other-owner/watched-repo']);

    expect(helper.isKnownRepository('other-owner', 'watched-repo')).toBe(true);
  });

  test('isKnownRepository returns false for an unknown owner and repo', () => {
    expect.assertions(1);

    vi.spyOn(helper, 'getOrganizationsToWatch').mockReturnValue(['test-org']);
    vi.spyOn(helper, 'getRepositoriesToWatch').mockReturnValue(['other-owner/watched-repo']);

    expect(helper.isKnownRepository('unknown-owner', 'unknown-repo')).toBe(false);
  });
});
