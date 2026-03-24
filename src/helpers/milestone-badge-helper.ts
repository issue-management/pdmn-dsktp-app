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

import { inject, injectable, named } from 'inversify';

import type { Octokit } from '@octokit/rest';

const MEDIA_OWNER = 'containers';
const MEDIA_REPO = 'podman-desktop-media';
const MEDIA_BRANCH = 'thanks-workflow';
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

interface ContentEntry {
  type: string;
  name: string;
}

@injectable()
export class MilestoneBadgeHelper {
  @inject('Octokit')
  @named('READ_TOKEN')
  private octokit: Octokit;

  public async getRandomBadgeUrl(milestone: number): Promise<string | undefined> {
    const folder = `milestone_${milestone}`;

    let entries: ContentEntry[];
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: MEDIA_OWNER,
        repo: MEDIA_REPO,
        path: folder,
        ref: MEDIA_BRANCH,
      });
      entries = Array.isArray(data) ? data : [data];
    } catch {
      return undefined;
    }

    const imageFiles = entries.filter(
      entry => entry.type === 'file' && IMAGE_EXTENSIONS.some(ext => entry.name.toLowerCase().endsWith(ext)),
    );

    if (imageFiles.length === 0) {
      return undefined;
    }

    // eslint-disable-next-line sonarjs/pseudo-random
    const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
    return `https://raw.githubusercontent.com/${MEDIA_OWNER}/${MEDIA_REPO}/${MEDIA_BRANCH}/${folder}/${randomFile.name}`;
  }
}
