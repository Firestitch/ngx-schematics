import {
  apply,
  branchAndMerge,
  chain,
  filter,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  Tree,
  url,
  template,
  noop,
} from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';

import {
  addDeclarationToNgModule,
  addDeclarationToRoutingModule,
  updateIndexFile,
} from '../../utils/ng-module-utils';

import { Config } from './config';
import { getComponentPath } from '../../utils/build-correct-path';
import { ExpansionType } from '../../utils/models/expansion-type';
import { getWorkspace } from '../../utils/get-workspace';


function filterTemplates(options: any): Rule {
  if (!options.create) {
    return filter(path => !path.match(/\.bak$/) && !path.match(/create\/.+\.(ts|html)$/));
  }

  if (!options.edit) {
    return filter(path => !path.match(/\.bak$/) && !path.match(/edit\/.+\.(ts|html)$/));
  }

  return filter(path => !path.match(/\.bak$/));
}

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function base(options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const workspace = getWorkspace(tree);
    const config: Config = { ...options };

    if (!config.project) {
      config.project = Object.keys(workspace.projects)[0];
    }

    if (config.dialog === void 0) {
      config.dialog = false;
    }

    config.routingModule = config.module.replace('.module.ts', '-routing.module.ts');
    config.module = `${config.path}/${config.module}`;
    config.routingModule = `${config.path}/${config.routingModule}`;

    const indexFileExists = tree.exists(`${config.path}/index.ts`);

    config.componentPath = getComponentPath(tree, config).path;

    const templateSource = apply(url('./files'), [
      filterTemplates(config),
      template({
        ...strings,
        ...config
      }),
      () => { console.debug('path', config.componentPath )},
      move(config.componentPath)
    ]);


    const isRoutingExists = tree.exists(config.routingModule);
    const rule = chain([
      branchAndMerge(chain([
        mergeWith(templateSource),
        addDeclarationToNgModule(config, false),
        isRoutingExists ? addDeclarationToRoutingModule(config) : noop(),
        indexFileExists ? updateIndexFile(config, ExpansionType.Component) : noop(),
      ]))
    ]);

    return rule(tree, _context);
  };
}
