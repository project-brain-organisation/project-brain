/**
 * WorkspaceModule scaffold test — structural verification
 *
 * EXEMPT FROM PBT PARADIGM: structural scaffolding with no domain logic.
 * Verifies:
 *   1. WorkspaceModule is a valid NestJS module class (importable, decorated)
 *   2. Six sub-folder placeholders exist under workspace/
 */

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceModule } from '../../src/workspace/workspace.module';

describe('WorkspaceModule scaffold', () => {
  describe('WorkspaceModule registers and six sub-folders exist', () => {
    it('WorkspaceModule is importable as a NestJS module class', () => {
      expect(WorkspaceModule).toBeDefined();
      // A NestJS module decorated class will have metadata attached by the decorator
      const metadata = Reflect.getMetadata('imports', WorkspaceModule);
      expect(Array.isArray(metadata)).toBe(true);
    });

    const workspaceRoot = path.resolve(
      __dirname,
      '../../src/workspace',
    );

    const expectedSubFolders = [
      'thoughts',
      'labels',
      'relationships',
      'pipeline',
      'gateway',
      'validation',
    ];

    it.each(expectedSubFolders)(
      'sub-folder "%s" exists under workspace/',
      (folder) => {
        const folderPath = path.join(workspaceRoot, folder);
        expect(fs.existsSync(folderPath)).toBe(true);
      },
    );
  });
});
