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

export const domainEntrySchema = z.object({
  domain: z.string(),
  description: z.string(),
  owners: z.array(z.string()),
  repository: z.optional(z.string()),
});

export type DomainEntry = z.infer<typeof domainEntrySchema>;

export const domainsArraySchema = z.array(domainEntrySchema);

export const usersSchema = z.record(z.string(), z.string());

export type UsersMap = z.infer<typeof usersSchema>;
