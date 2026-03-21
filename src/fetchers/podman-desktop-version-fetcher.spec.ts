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

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PodmanDesktopVersionFetcher } from '/@/fetchers/podman-desktop-version-fetcher';

describe('podmanDesktopVersionFetcher', () => {
  let fetcher: PodmanDesktopVersionFetcher;

  beforeEach(() => {
    vi.resetAllMocks();
    fetcher = new PodmanDesktopVersionFetcher();
  });

  test('should fetch version from package.json URL', async () => {
    expect.assertions(2);

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ version: '1.15.0' }),
    } as Response);

    const version = await fetcher.getVersion();

    expect(version).toBe('1.15.0');
    expect(global.fetch).toHaveBeenCalledExactlyOnceWith(PodmanDesktopVersionFetcher.PODMAN_PACKAGE_JSON);
  });

  test('should cache version on subsequent calls', async () => {
    expect.assertions(3);

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ version: '1.15.0' }),
    } as Response);

    const version1 = await fetcher.getVersion();
    const version2 = await fetcher.getVersion();

    expect(version1).toBe('1.15.0');
    expect(version2).toBe('1.15.0');
    expect(global.fetch).toHaveBeenCalledExactlyOnceWith(PodmanDesktopVersionFetcher.PODMAN_PACKAGE_JSON);
  });

  test('should return undefined when version is missing from response', async () => {
    expect.assertions(1);

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({}),
    } as Response);

    const version = await fetcher.getVersion();

    expect(version).toBeUndefined();
  });
});
