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

export class StargazerInfo {
  private __starredAt: string;
  private __id: string;
  private __login: string;
  private __name: string;
  private __company: string;
  private __bio: string;
  private __email: string;
  private __websiteUrl: string;
  private __twitterUsername: string;
  private __url: string;
  private __avatarUrl: string;

  public withStarredAt(starredAt: string): StargazerInfo {
    this.__starredAt = starredAt;
    return this;
  }

  public withId(id: string): StargazerInfo {
    this.__id = id;
    return this;
  }

  public withLogin(login: string): StargazerInfo {
    this.__login = login;
    return this;
  }

  public withName(name: string): StargazerInfo {
    this.__name = name;
    return this;
  }

  public withCompany(company: string): StargazerInfo {
    this.__company = company;
    return this;
  }

  public withBio(bio: string): StargazerInfo {
    this.__bio = bio;
    return this;
  }

  public withEmail(email: string): StargazerInfo {
    this.__email = email;
    return this;
  }

  public withWebsiteUrl(websiteUrl: string): StargazerInfo {
    this.__websiteUrl = websiteUrl;
    return this;
  }

  public withTwitterUsername(twitterUsername: string): StargazerInfo {
    this.__twitterUsername = twitterUsername;
    return this;
  }

  public withUrl(url: string): StargazerInfo {
    this.__url = url;
    return this;
  }

  public withAvatarUrl(avatarUrl: string): StargazerInfo {
    this.__avatarUrl = avatarUrl;
    return this;
  }

  public get id(): string {
    return this.__id;
  }

  public get login(): string {
    return this.__login;
  }

  public get name(): string {
    return this.__name;
  }

  public get company(): string {
    return this.__company;
  }

  public get bio(): string {
    return this.__bio;
  }

  public get email(): string {
    return this.__email;
  }

  public get websiteUrl(): string {
    return this.__websiteUrl;
  }

  public get twitterUsername(): string {
    return this.__twitterUsername;
  }
  public get url(): string {
    return this.__url;
  }

  public get avatarUrl(): string {
    return this.__avatarUrl;
  }

  public get starredAt(): string {
    return this.__starredAt;
  }
}

@injectable()
export class StargazerInfoBuilder {
  build(): StargazerInfo {
    return new StargazerInfo();
  }
}
