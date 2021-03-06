/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import { TspClient } from './tsp-client';
import { ConsoleLogger } from './logger';
import { filePath, readContents } from './test-utils';
import { CommandTypes } from './tsp-command-types';

const assert = chai.assert;
const expect = chai.expect;

const server = new TspClient({
  logger: new ConsoleLogger(),
  tsserverPath: 'tsserver'
});

server.start();

describe('ts server client', () => {
  it('completion', () => {
    const f = filePath('module2.ts')
    server.notify(CommandTypes.Open, {
      file: f,
      fileContent: readContents(f)
    });
    return server.request(CommandTypes.Completions, {
      file: f,
      line: 1,
      offset: 0,
      prefix: 'im'
    }).then(completions => {
      assert.equal(completions.body![1].name, "ImageData");
    });
  });

  it('references', () => {
    const f = filePath('module2.ts')
    server.notify(CommandTypes.Open, {
      file: f,
      fileContent: readContents(f)
    });
    return server.request(CommandTypes.References, {
      file: f,
      line: 8,
      offset: 16
    }).then(references => {
      assert.equal(references.body!.symbolName, "doStuff");
    });
  });
});