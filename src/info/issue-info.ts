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

import { injectable } from 'inversify';

export class IssueInfo {
  private __repository: string;
  private __id: string;
  private __owner: string;
  private __number: number;
  private __labels: string[];
  private __htmlLink: string;
  private __author: string;
  private __body: string;
  private __createdAt: string;
  private __projectItems: { name: string; projectId: string; projectNumber: string }[];

  public withId(id: string): this {
    this.__id = id;
    return this;
  }

  public withBody(body: string): this {
    this.__body = body;
    return this;
  }

  public withProjectItems(projectItems: { name: string; projectId: string; projectNumber: string }[]): this {
    this.__projectItems = projectItems;
    return this;
  }

  public withCreatedAt(createdAt: string): this {
    this.__createdAt = createdAt;
    return this;
  }

  public withAuthor(author: string): this {
    this.__author = author;
    return this;
  }

  public withHtmlLink(htmlLink: string): this {
    this.__htmlLink = htmlLink;
    return this;
  }

  public withRepo(repository: string): this {
    this.__repository = repository;
    return this;
  }

  public withLabels(labels: string[]): this {
    this.__labels = labels;
    return this;
  }

  public withOwner(owner: string): this {
    this.__owner = owner;
    return this;
  }

  public withNumber(number: number): this {
    this.__number = number;
    return this;
  }

  public get body(): string {
    return this.__body;
  }

  public get projectItems(): { name: string; projectId: string; projectNumber: string }[] {
    return this.__projectItems;
  }

  public get author(): string {
    return this.__author;
  }

  public get createdAt(): string {
    return this.__createdAt;
  }

  public get repo(): string {
    return this.__repository;
  }

  public get owner(): string {
    return this.__owner;
  }

  public get number(): number {
    return this.__number;
  }

  public get id(): string {
    return this.__id;
  }

  public get labels(): string[] {
    return this.__labels;
  }

  public get htmlLink(): string {
    return this.__htmlLink;
  }

  public hasLabel(labelName: string): boolean {
    return this.__labels.includes(labelName);
  }
}

@injectable()
export class IssueInfoBuilder {
  build(): IssueInfo {
    return new IssueInfo();
  }
}
