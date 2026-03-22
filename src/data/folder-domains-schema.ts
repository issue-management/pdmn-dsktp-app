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

import { z } from 'zod/v4';

export const folderMappingSchema = z.object({
  pattern: z.string(),
  domain: z.string(),
});

export type FolderMapping = z.infer<typeof folderMappingSchema>;

export const folderDomainsEntrySchema = z.object({
  repository: z.string(),
  mappings: z.array(folderMappingSchema),
  defaultDomain: z.optional(z.string()),
});

export type FolderDomainsEntry = z.infer<typeof folderDomainsEntrySchema>;

export const folderDomainsArraySchema = z.array(folderDomainsEntrySchema);
