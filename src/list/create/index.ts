import {
  apply,
  branchAndMerge,
  chain,
  filter,
  mergeWith,
  move,
  url,
  template,
  Rule,
  SchematicContext,
  SchematicsException,
  externalSchematic,
  Tree, noop,
} from '@angular-devkit/schematics';
import { strings} from '@angular-devkit/core';
import { WorkspaceSchema } from '@angular-devkit/core/src/workspace';
import { parseName } from '../../utils/parse-name';
import { addDeclarationToNgModule, addDeclarationToRoutingModule } from '../../utils/ng-module-utils';
import { buildRelativePath, findModuleFromOptions } from '../../schematics-angular-utils/find-module';
import { dasherize } from '@angular-devkit/core/src/utils/strings';
import { isAbsolute } from 'path';


export function getWorkspacePath(host: Tree): string {
  const possibleFiles = [ '/angular.json', '/.angular.json' ];
  const path = possibleFiles.filter(path => host.exists(path))[0];

  return path;
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
  /*if (!options.menuService) {
    return filter(path => !path.match(/\.service\.ts$/) && !path.match(/-item\.ts$/) && !path.match(/\.bak$/));
  }*/
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
export function createOrEdit(options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const workspace = getWorkspace(tree);
    if (!options.project) {
      options.project = Object.keys(workspace.projects)[0];
    }

    const project = workspace.projects[options.project];

    if (options.path === undefined) {
      const projectDirName = project.projectType === 'application' ? 'app' : 'lib';
      options.path = `/${project.root}/src/${projectDirName}`;
    }

    options.module = findModuleFromOptions(tree, options, true);
    options.routingModule = options.module.replace('.module.ts', '-routing.module.ts');
    options.isRouting = tree.exists(options.routingModule);
    // options.routingModule = `${options.path}/${options.routingModule}`;
    // options.module = `${options.path}/${options.module}`;


    const parsedPath = parseName(options.path, options.name);
    options.name = parsedPath.name;
    options.path = parsedPath.path;

    if (!options.relativeServicePath) {
      options.relativeServicePath = buildRelativePathForService(options);
      options.service = options.service.replace('.service.ts', '');
    }

    const templateSource = apply(url('./files'), [
      filterTemplates(options),
      template({
        ...strings,
        ...options
      }),
      () => { console.debug('path', parsedPath.path )},
      move(parsedPath.path)
    ]);

    const externalSchematics: any = [];

    const childSchematicOptions = {
      project: options.project,
      path: options.path,
      module: options.module,
      name: options.name,
      service: options.service,
      servicePath: options.servicePath,
    };


    if (options.isRouting) {
      externalSchematics.push(
        externalSchematic(
          '@firestitch/schematics',
          'resolver',
          childSchematicOptions
        )
      );
    }

    const rule = chain([
      branchAndMerge(chain([
        mergeWith(templateSource),
        addDeclarationToNgModule(options, false),
        options.isRouting ? addDeclarationToRoutingModule(options) : noop(),
        ...externalSchematics,
      ]))
    ]);


    return rule(tree, _context);
  };
}

function buildRelativePathForService(options) {
  return buildRelativePath(
    `${options.path}/${dasherize(options.name)}/${dasherize(options.name)}.component.ts`,
    `${options.servicePath}/${options.service}`
  ).replace('.ts', '');
}
