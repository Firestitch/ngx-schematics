import assert from 'assert';
import * as path from 'path';
import { describe, before } from 'mocha';
import {
  SchematicTestRunner,
  UnitTestTree
} from '@angular-devkit/schematics/testing';
import {
  Schema as ApplicationOptions,
  Style
} from '@schematics/angular/application/schema';
import { Schema as WorkspaceOptions } from '@schematics/angular/workspace/schema';


const workspaceOptions: WorkspaceOptions = {
  name: 'workspace',
  newProjectRoot: 'projects',
  version: '7.0.0'
};

const appOptions: ApplicationOptions = {
  name: 'application',
  inlineStyle: false,
  inlineTemplate: false,
  routing: false,
  style: Style.Css,
  skipTests: true,
  skipPackageJson: false
};

const defaultOptions = {
  skipInstall: false
};

const BASE_PATH = '/projects/application';

const optionsForComponent = {
  ...defaultOptions,
  path: BASE_PATH + '/src/app',
  module: 'app.module.ts',
  type: 'component',
  name: 'list',
  service: 'account-data.service.ts',
  servicePath: BASE_PATH + '/src/app/core/data',
  singleModel: 'model',
  pluralModel: 'models'
};

const optionsForView = {
  ...defaultOptions,
  path: BASE_PATH + '/src/app',
  module: 'app.module.ts',
  type: 'view',
  name: 'list',
  service: 'account-data.service.ts',
  servicePath: BASE_PATH + '/src/app/core/data',
  singleModel: 'model',
  pluralModel: 'models'
};

const collectionPath = path.join(__dirname, '../../collection.json');
const runner = new SchematicTestRunner('schematics', collectionPath);
// const version = packageJson.version;

let appTree: UnitTestTree;

describe('Schematic: Standalone', () => {
  beforeEach(async () => {
    appTree = await runner
      .runExternalSchematicAsync(
        '@schematics/angular',
        'workspace',
        workspaceOptions
      )
      .toPromise();
    appTree = await runner
      .runExternalSchematicAsync(
        '@schematics/angular',
        'application',
        appOptions,
        appTree
      )
      .toPromise();
  });

  it('should create base list component', async () => {
    const tree = await runner
      .runSchematicAsync('list', optionsForComponent, appTree)
      .toPromise();

    assert(tree.files.includes(BASE_PATH + '/src/app/components/list/list.component.ts'));
  });

  it('list field should exist in component ', async () => {
    const tree = await runner
      .runSchematicAsync('list', optionsForComponent, appTree)
      .toPromise();

    const content = tree.readContent(BASE_PATH + '/src/app/components/list/list.component.ts');
    console.log('content', content);
    assert(content.indexOf('public list: FsListComponent;') > -1);
  });
});

describe('Schematic: List with Create dialog from standalone', () => {
  before(async () => {
    appTree = await runner
      .runExternalSchematicAsync(
        '@schematics/angular',
        'workspace',
        workspaceOptions
      )
      .toPromise();
    appTree = await runner
      .runExternalSchematicAsync(
        '@schematics/angular',
        'application',
        appOptions,
        appTree
      )
      .toPromise();
  });

  it('should create list dialog', async () => {
    const options = {
      ...optionsForComponent,
      mode: 'dialog',
      singleName: 'create-list'
    };
    const tree = await runner
      .runSchematicAsync('list', options, appTree)
      .toPromise();

    assert(tree.files.includes(BASE_PATH + '/src/app/components/list/create-list/create-list.component.ts'));
  });
});


describe('Schematic: List with Create page from standalone', () => {
  before(async () => {
    appTree = await runner
      .runExternalSchematicAsync(
        '@schematics/angular',
        'workspace',
        workspaceOptions
      )
      .toPromise();
    appTree = await runner
      .runExternalSchematicAsync(
        '@schematics/angular',
        'application',
        appOptions,
        appTree
      )
      .toPromise();
  });

  it('should create full create/edit list interface', async () => {
    const options = {
      ...optionsForComponent,
      mode: 'full',
      singleName: 'create-list'
    };
    const tree = await runner
      .runSchematicAsync('list', options, appTree)
      .toPromise();

    assert(tree.files.includes(BASE_PATH + '/src/app/components/list/create-list/create-list.component.ts'));
  });

  it('should export create/edit list component', async () => {
    const content = appTree.readContent(BASE_PATH + '/src/app/components/list/create-list/index.ts');
    assert(content.indexOf("export * from './create-list.component';") > -1);
  });

  it('should be imported into module', async () => {
    const content = appTree.readContent(BASE_PATH + '/src/app/app.module.ts');

    assert(content.indexOf("import { CreateListComponent } from './components/list/create-list'") > -1);
  });
});
