import {
  apply,
  branchAndMerge,
  chain,
  filter,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
  url,
  template,
  externalSchematic,
  DirEntry, noop
} from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';
import { WorkspaceSchema } from '@angular-devkit/core/src/workspace';
import { addServiceProviderToNgModule, updateIndexFile} from '../../utils/ng-module-utils';
import { ExpansionType } from '../../utils/models/expansion-type';

export function getWorkspacePath(host: Tree): string {
  const possibleFiles = [ '/angular.json', '/.angular.json' ];
  return possibleFiles.filter(path => host.exists(path))[0];
}

export function getWorkspace(host: Tree): WorkspaceSchema {
  const path = getWorkspacePath(host);
  const configBuffer = host.read(path);
  if (configBuffer === null) {
    throw new SchematicsException(`Could not find (${path})`);
  }
  const config = configBuffer.toString();

  return JSON.parse(config);
}

function filterTemplates(options: any): Rule {
  if (!options.menuService) {
    return filter(path => !path.match(/\.service\.ts$/) && !path.match(/\.bak$/));
  }

  return filter(path => !path.match(/\.bak$/));
}

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function create(options: any): Rule {

  return (tree: Tree, _context: SchematicContext) => {
    const subDir: DirEntry | null = tree.getDir(`${options.path}${options.subdirectory}`);
    const indexFileExists = tree.exists(`${subDir.path}/index.ts`);

    const workspace = getWorkspace(tree);
    if (!options.project) {
      options.project = Object.keys(workspace.projects)[0];
    }

    options.module = `${options.path}/${options.module}`;
    options.path = `${options.path}${options.subdirectory}`;

    const templateSource = apply(url('./files'), [
      filterTemplates(options),
      indexFileExists ? filter(path => path.indexOf('index.ts') === -1) : noop(),
      template({
        ...strings,
        ...options
      }),
      () => { console.debug('path', subDir.path )},
      move(subDir.path)
    ]);

    const rule = chain([
      branchAndMerge(chain([
        mergeWith(templateSource),
        addServiceProviderToNgModule(options),
        indexFileExists ? updateIndexFile(options, ExpansionType.Service) : noop(),
      ]))
    ]);

    return rule(tree, _context);
  };
}
