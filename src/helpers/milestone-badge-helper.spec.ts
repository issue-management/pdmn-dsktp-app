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
import { Container } from 'inversify';

import { MilestoneBadgeHelper } from '/@/helpers/milestone-badge-helper';

describe(MilestoneBadgeHelper, () => {
  let container: Container;
  let mockGetContent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockGetContent = vi.fn<() => Promise<unknown>>();

    container = new Container();
    container.bind(MilestoneBadgeHelper).toSelf().inSingletonScope();
    container
      .bind('Octokit')
      .toConstantValue({
        rest: {
          repos: {
            getContent: mockGetContent,
          },
        },
      })
      .whenNamed('READ_TOKEN');
  });

  test('returns a url from image files in the milestone folder', async () => {
    expect.assertions(1);

    mockGetContent.mockResolvedValue({
      data: [
        { type: 'file', name: 'badge-a.png' },
        { type: 'file', name: 'badge-b.jpg' },
      ],
    });

    const helper = container.get(MilestoneBadgeHelper);
    const url = await helper.getRandomBadgeUrl(1);

    expect(url).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/containers\/podman-desktop-media\/thanks-workflow\/milestone_1\/badge-[ab]\.(png|jpg)$/,
    );
  });

  test('fetches content from correct repo, path, and branch', async () => {
    expect.assertions(1);

    mockGetContent.mockResolvedValue({
      data: [{ type: 'file', name: 'image.png' }],
    });

    const helper = container.get(MilestoneBadgeHelper);
    await helper.getRandomBadgeUrl(10);

    expect(mockGetContent).toHaveBeenCalledExactlyOnceWith({
      owner: 'containers',
      repo: 'podman-desktop-media',
      path: 'milestone_10',
      ref: 'thanks-workflow',
    });
  });

  test('returns undefined when folder does not exist', async () => {
    expect.assertions(1);

    mockGetContent.mockRejectedValue(new Error('Not Found'));

    const helper = container.get(MilestoneBadgeHelper);
    const url = await helper.getRandomBadgeUrl(25);

    expect(url).toBeUndefined();
  });

  test('returns undefined when folder has no image files', async () => {
    expect.assertions(1);

    mockGetContent.mockResolvedValue({
      data: [
        { type: 'file', name: 'readme.md' },
        { type: 'dir', name: 'subdir' },
      ],
    });

    const helper = container.get(MilestoneBadgeHelper);
    const url = await helper.getRandomBadgeUrl(50);

    expect(url).toBeUndefined();
  });

  test('filters non-image files and directories', async () => {
    expect.assertions(1);

    mockGetContent.mockResolvedValue({
      data: [
        { type: 'dir', name: 'subdir' },
        { type: 'file', name: 'notes.txt' },
        { type: 'file', name: 'badge.webp' },
      ],
    });

    const helper = container.get(MilestoneBadgeHelper);
    const url = await helper.getRandomBadgeUrl(1);

    expect(url).toBe(
      'https://raw.githubusercontent.com/containers/podman-desktop-media/thanks-workflow/milestone_1/badge.webp',
    );
  });

  test('handles single file response (non-array)', async () => {
    expect.assertions(1);

    mockGetContent.mockResolvedValue({
      data: { type: 'file', name: 'single.gif' },
    });

    const helper = container.get(MilestoneBadgeHelper);
    const url = await helper.getRandomBadgeUrl(1);

    expect(url).toBe(
      'https://raw.githubusercontent.com/containers/podman-desktop-media/thanks-workflow/milestone_1/single.gif',
    );
  });
});
