/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as tsp from 'typescript/lib/protocol';
import * as lsp from 'vscode-languageserver';
import { LspServer } from './lsp-server';
import { uri } from './test-utils';
import { LspClient } from './lsp-client';
import { ConsoleLogger } from './logger';
import { Deferred } from './utils';

export function position(document: lsp.TextDocumentItem, match: string): lsp.Position {
  const doc = lsp.TextDocument.create(document.uri, document.languageId, document.version, document.text);
  const idx = doc.getText().indexOf(match)
  const pos = doc.positionAt(idx);
  return {
    line: pos.line,
    character: pos.character
  };
}

const assert = chai.assert;
const expect = chai.expect;

let diagnostics: lsp.PublishDiagnosticsParams | undefined;

let server: LspServer;

before(async () => {
  server = new LspServer({
    logger: new ConsoleLogger(),
    tsserverPath: 'tsserver',
    lspClient: {
      publishDiagnostics(args: lsp.PublishDiagnosticsParams): void {
        diagnostics = args;
      },
      showMessage(args: lsp.ShowMessageParams): void {
        throw args // should not be called.
      },
      async applyWorkspaceEdit(args: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResponse> {
        throw new Error('unsupported')
      }
    },
  });

  await server.initialize({
    rootPath: undefined,
    rootUri: '',
    processId: 42,
    capabilities: {}
  });
});

describe('completion', () => {
  it('simple test', async () => {
    const doc = {
      uri: uri('bar.ts'),
      languageId: 'typescript',
      version: 1,
      text: `
        export function foo(): void {
          console.log('test')
        }
      `
    }
    server.didOpenTextDocument({
      textDocument: doc
    })
    const pos = position(doc, 'console');
    const proposals = await server.completion({
      textDocument: doc,
      position: pos
    });
    assert.isTrue(proposals.items.length > 800);
    const item = proposals.items[0];
    const resolvedItem = await server.completionResolve(item)
    assert.isTrue(resolvedItem.documentation !== undefined);
  });
});

describe('diagnostics', () => {
  it('simple test', async () => {
    const doc = {
      uri: uri('bar.ts'),
      languageId: 'typescript',
      version: 1,
      text: `
        export function foo(): void {
          unknown('test')
        }
      `
    }
    server.didOpenTextDocument({
      textDocument: doc
    })
    await server.requestDiagnostics()
    await server.requestDiagnostics()
    const diags = diagnostics!.diagnostics;
    assert.equal(1, diags.length);
    assert.equal("Cannot find name 'unknown'.", diags[0].message);
  });
});


describe('symbol', () => {
  it('simple test', async () => {
    const doc = {
      uri: uri('bar.ts'),
      languageId: 'typescript',
      version: 1,
      text: `
        export class Foo {
          protected foo: string;
          public myFunction(arg: string) {
          }
        }
      `
    }
    server.didOpenTextDocument({
      textDocument: doc
    })
    const symbols = await server.documentSymbol({
      textDocument: doc,
      position: lsp.Position.create(1, 1)
    })
    assert.equal(4, symbols.length);
    assert.equal('"bar"', symbols[0].name)
    assert.equal('Foo', symbols[1].name)
    assert.equal('foo', symbols[2].name)
    assert.equal('myFunction', symbols[3].name)
  });
});

describe('editing', () => {
  it('open and change', async () => {
    const doc = {
      uri: uri('bar.ts'),
      languageId: 'typescript',
      version: 1,
      text: `
        export function foo(): void {
        }
      `
    }
    server.didOpenTextDocument({
      textDocument: doc
    })
    server.didChangeTextDocument({
      textDocument: doc,
      contentChanges: [
        {
          text: `
          export function foo(): void {
            unknown('test');
          }
          `
        }
      ]
    })
    await server.requestDiagnostics()
    await server.requestDiagnostics()
    const diags = diagnostics!.diagnostics;
    assert.equal(1, diags.length);
    assert.equal("Cannot find name 'unknown'.", diags[0].message);
  });
});

function applyEdits(before: string, edits: lsp.TextEdit[]): string {
  const sorted = edits.sort((a, b) => {
    if (a.range.start.line === b.range.start.line) {
      return a.range.start.character - b.range.start.character
    }
    return a.range.start.line - b.range.start.line
  })
  const doc = lsp.TextDocument.create('', '', 0, before)
  let currentDoc = '';
  let offset = 0;
  for (const edit of sorted) {
    const startOffset = doc.offsetAt(edit.range.start)
    currentDoc += before.substr(offset, startOffset - offset) + edit.newText;
    offset = doc.offsetAt(edit.range.end)
  }
  return currentDoc + before.substr(offset);
}

describe('formatting', () => {
  it('full document formatting', async () => {
    const doc = {
      uri: uri('bar.ts'),
      languageId: 'typescript',
      version: 1,
      text: 'export  function foo (     )   :  void   {   }'
    }
    server.didOpenTextDocument({
      textDocument: doc
    })
    const edits = await server.documentFormatting({
      textDocument: doc,
      options: {
        tabSize: 4,
        insertSpaces: true
      }
    })
    const result = applyEdits(doc.text, edits);
    assert.equal('export function foo(): void { }', result)
  });
});


describe('signatureHelp', () => {
  it('simple test', async () => {
    const doc = {
      uri: uri('bar.ts'),
      languageId: 'typescript',
      version: 1,
      text: `
        export function foo(bar: string, baz?:boolean): void {}
        foo(param1, param2)
      `
    }
    server.didOpenTextDocument({
      textDocument: doc
    })
    let result = await server.signatureHelp({
      textDocument: doc,
      position: position(doc, 'param1')
    })

    assert.equal('bar: string', result.signatures[result.activeSignature!].parameters![result.activeParameter!].label)

    result = await server.signatureHelp({
      textDocument: doc,
      position: position(doc, 'param2')
    })

    assert.equal('baz?: boolean', result.signatures[result.activeSignature!].parameters![result.activeParameter!].label)
  });
});