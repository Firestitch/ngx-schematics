/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ts from 'typescript';
import { Change, InsertChange } from './change';
import { insertImport } from './route-utils';


/**
 * Find all nodes from the AST in the subtree of node of SyntaxKind kind.
 * @param node
 * @param kind
 * @param max The maximum number of items to return.
 * @return all nodes of kind, or [] if none is found
 */
export function findNodes(node: ts.Node, kind: ts.SyntaxKind, max = Infinity): ts.Node[] {
  if (!node || max == 0) {
    return [];
  }

  const arr: ts.Node[] = [];
  if (node.kind === kind) {
    arr.push(node);
    max--;
  }
  if (max > 0) {
    for (const child of node.getChildren()) {
      findNodes(child, kind, max).forEach(node => {
        if (max > 0) {
          arr.push(node);
        }
        max--;
      });

      if (max <= 0) {
        break;
      }
    }
  }

  return arr;
}


/**
 * Get all the nodes from a source.
 * @param sourceFile The source file object.
 * @returns {Observable<ts.Node>} An observable of all the nodes in the source.
 */
export function getSourceNodes(sourceFile: ts.SourceFile): ts.Node[] {
  const nodes: ts.Node[] = [sourceFile];
  const result: any = [];

  while (nodes.length > 0) {
    const node = nodes.shift();

    if (node) {
      result.push(node);
      if (node.getChildCount(sourceFile) >= 0) {
        nodes.unshift(...node.getChildren());
      }
    }
  }

  return result;
}

export function findNode(node: ts.Node, kind: ts.SyntaxKind, text: string): ts.Node | null {
  if (node.kind === kind && node.getText() === text) {
    // throw new Error(node.getText());
    return node;
  }

  let foundNode: ts.Node | null = null;
  ts.forEachChild(node, childNode => {
    foundNode = foundNode || findNode(childNode, kind, text);
  });

  return foundNode;
}


/**
 * Helper for sorting nodes.
 * @return function to sort nodes in increasing order of position in sourceFile
 */
function nodesByPosition(first: ts.Node, second: ts.Node): number {
  return first.getStart() - second.getStart();
}


/**
 * Insert `toInsert` after the last occurence of `ts.SyntaxKind[nodes[i].kind]`
 * or after the last of occurence of `syntaxKind` if the last occurence is a sub child
 * of ts.SyntaxKind[nodes[i].kind] and save the changes in file.
 *
 * @param nodes insert after the last occurence of nodes
 * @param toInsert string to insert
 * @param file file to insert changes into
 * @param fallbackPos position to insert if toInsert happens to be the first occurence
 * @param syntaxKind the ts.SyntaxKind of the subchildren to insert after
 * @return Change instance
 * @throw Error if toInsert is first occurence but fall back is not set
 */
export function insertAfterLastOccurrence(nodes: ts.Node[],
                                          toInsert: string,
                                          file: string,
                                          fallbackPos: number,
                                          syntaxKind?: ts.SyntaxKind): Change {
  let lastItem = nodes.sort(nodesByPosition).pop();
  if (!lastItem) {
    throw new Error();
  }
  if (syntaxKind) {
    lastItem = findNodes(lastItem, syntaxKind).sort(nodesByPosition).pop();
  }
  if (!lastItem && fallbackPos == undefined) {
    throw new Error(`tried to insert ${toInsert} as first occurence with no fallback position`);
  }
  const lastItemPosition: number = lastItem ? lastItem.getEnd() : fallbackPos;

  return new InsertChange(file, lastItemPosition, toInsert);
}


export function getContentOfKeyLiteral(_source: ts.SourceFile, node: ts.Node): string | null {
  if (node.kind == ts.SyntaxKind.Identifier) {
    return (node as ts.Identifier).text;
  } else if (node.kind == ts.SyntaxKind.StringLiteral) {
    return (node as ts.StringLiteral).text;
  } else {
    return null;
  }
}


function _angularImportsFromNode(node: ts.ImportDeclaration,
                                 _sourceFile: ts.SourceFile): {[name: string]: string} {
  const ms = node.moduleSpecifier;
  let modulePath: string;
  switch (ms.kind) {
    case ts.SyntaxKind.StringLiteral:
      modulePath = (ms as ts.StringLiteral).text;
      break;
    default:
      return {};
  }

  if (!modulePath.startsWith('@angular/')) {
    return {};
  }

  if (node.importClause) {
    if (node.importClause.name) {
      // This is of the form `import Name from 'path'`. Ignore.
      return {};
    } else if (node.importClause.namedBindings) {
      const nb = node.importClause.namedBindings;
      if (nb.kind == ts.SyntaxKind.NamespaceImport) {
        // This is of the form `import * as name from 'path'`. Return `name.`.
        return {
          [(nb as ts.NamespaceImport).name.text + '.']: modulePath,
        };
      } else {
        // This is of the form `import {a,b,c} from 'path'`
        const namedImports = nb as ts.NamedImports;

        return namedImports.elements
          .map((is: ts.ImportSpecifier) => is.propertyName ? is.propertyName.text : is.name.text)
          .reduce((acc: {[name: string]: string}, curr: string) => {
            acc[curr] = modulePath;

            return acc;
          }, {});
      }
    }

    return {};
  } else {
    // This is of the form `import 'path';`. Nothing to do.
    return {};
  }
}


export function getDecoratorMetadata(source: ts.SourceFile, identifier: string,
                                     module: string): ts.Node[] {
  const angularImports: {[name: string]: string}
    = findNodes(source, ts.SyntaxKind.ImportDeclaration)
    .map((node: ts.ImportDeclaration) => _angularImportsFromNode(node, source))
    .reduce((acc: {[name: string]: string}, current: {[name: string]: string}) => {
      for (const key of Object.keys(current)) {
        acc[key] = current[key];
      }

      return acc;
    }, {});

  return getSourceNodes(source)
    .filter(node => {
      return node.kind == ts.SyntaxKind.Decorator
        && (node as ts.Decorator).expression.kind == ts.SyntaxKind.CallExpression;
    })
    .map(node => (node as ts.Decorator).expression as ts.CallExpression)
    .filter(expr => {
      if (expr.expression.kind == ts.SyntaxKind.Identifier) {
        const id = expr.expression as ts.Identifier;

        return id.getFullText(source) == identifier
          && angularImports[id.getFullText(source)] === module;
      } else if (expr.expression.kind == ts.SyntaxKind.PropertyAccessExpression) {
        // This covers foo.NgModule when importing * as foo.
        const paExpr = expr.expression as ts.PropertyAccessExpression;
        // If the left expression is not an identifier, just give up at that point.
        if (paExpr.expression.kind !== ts.SyntaxKind.Identifier) {
          return false;
        }

        const id = paExpr.name.text;
        const moduleId = (paExpr.expression as ts.Identifier).getText(source);

        return id === identifier && (angularImports[moduleId + '.'] === module);
      }

      return false;
    })
    .filter(expr => expr.arguments[0]
      && expr.arguments[0].kind == ts.SyntaxKind.ObjectLiteralExpression)
    .map(expr => expr.arguments[0] as ts.ObjectLiteralExpression);
}

function findClassDeclarationParent(node: ts.Node): ts.ClassDeclaration|undefined {
  if (ts.isClassDeclaration(node)) {
    return node;
  }

  return node.parent && findClassDeclarationParent(node.parent);
}

/**
 * Given a source file with @NgModule class(es), find the name of the first @NgModule class.
 *
 * @param source source file containing one or more @NgModule
 * @returns the name of the first @NgModule, or `undefined` if none is found
 */
export function getFirstNgModuleName(source: ts.SourceFile): string|undefined {
  // First, find the @NgModule decorators.
  const ngModulesMetadata = getDecoratorMetadata(source, 'NgModule', '@angular/core');
  if (ngModulesMetadata.length === 0) {
    return undefined;
  }

  // Then walk parent pointers up the AST, looking for the ClassDeclaration parent of the NgModule
  // metadata.
  const moduleClass = findClassDeclarationParent(ngModulesMetadata[0]);
  if (!moduleClass || !moduleClass.name) {
    return undefined;
  }

  // Get the class name of the module ClassDeclaration.
  return moduleClass.name.text;
}

export function addSymbolToNgModuleMetadata(
  source: ts.SourceFile,
  ngModulePath: string,
  metadataField: string,
  symbolName: string,
  importPath: string | null = null,
): Change[] {
  const nodes = getDecoratorMetadata(source, 'NgModule', '@angular/core');
  let node: any = nodes[0];  // tslint:disable-line:no-any
  // Find the decorator declaration.
  if (!node) {
    return [];
  }

  // Get all the children property assignment of object literals.
  const matchingProperties: ts.ObjectLiteralElement[] =
    (node as ts.ObjectLiteralExpression).properties
      .filter(prop => prop.kind == ts.SyntaxKind.PropertyAssignment)
      // Filter out every fields that's not "metadataField". Also handles string literals
      // (but not expressions).
      .filter((prop: ts.PropertyAssignment) => {
        const name = prop.name;
        switch (name.kind) {
          case ts.SyntaxKind.Identifier:
            return (name as ts.Identifier).getText(source) == metadataField;
          case ts.SyntaxKind.StringLiteral:
            return (name as ts.StringLiteral).text == metadataField;
        }

        return false;
      });

  // Get the last node of the array literal.
  if (!matchingProperties) {
    return [];
  }
  if (matchingProperties.length == 0) {
    // We haven't found the field in the metadata declaration. Insert a new field.
    const expr = node as ts.ObjectLiteralExpression;
    let position: number;
    let toInsert: string;
    if (expr.properties.length == 0) {
      position = expr.getEnd() - 1;
      toInsert = `  ${metadataField}: [${symbolName}]\n`;
    } else {
      node = expr.properties[expr.properties.length - 1];
      position = node.getEnd();
      // Get the indentation of the last element, if any.
      const text = node.getFullText(source);
      const matches = text.match(/^\r?\n\s*/);
      if (matches.length > 0) {
        toInsert = `,${matches[0]}${metadataField}: [${symbolName}]`;
      } else {
        toInsert = `, ${metadataField}: [${symbolName}]`;
      }
    }
    if (importPath !== null) {
      return [
        new InsertChange(ngModulePath, position, toInsert),
        insertImport(source, ngModulePath, symbolName.replace(/\..*$/, ''), importPath),
      ];
    } else {
      return [new InsertChange(ngModulePath, position, toInsert)];
    }
  }
  const assignment = matchingProperties[0] as ts.PropertyAssignment;

  // If it's not an array, nothing we can do really.
  if (assignment.initializer.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
    return [];
  }

  const arrLiteral = assignment.initializer as ts.ArrayLiteralExpression;
  if (arrLiteral.elements.length == 0) {
    // Forward the property.
    node = arrLiteral;
  } else {
    node = arrLiteral.elements;
  }

  if (!node) {
    console.log('No app module found. Please add your new class to your component.');

    return [];
  }

  if (Array.isArray(node)) {
    const nodeArray = node as {} as Array<ts.Node>;
    const symbolsArray = nodeArray.map(node => node.getText());
    if (symbolsArray.includes(symbolName)) {
      return [];
    }

    node = node[node.length - 1];
  }

  let toInsert: string;
  let position = node.getEnd();
  if (node.kind == ts.SyntaxKind.ObjectLiteralExpression) {
    // We haven't found the field in the metadata declaration. Insert a new
    // field.
    const expr = node as ts.ObjectLiteralExpression;
    if (expr.properties.length == 0) {
      position = expr.getEnd() - 1;
      toInsert = `  ${metadataField}: [${symbolName}]\n`;
    } else {
      node = expr.properties[expr.properties.length - 1];
      position = node.getEnd();
      // Get the indentation of the last element, if any.
      const text = node.getFullText(source);
      if (text.match('^\r?\r?\n')) {
        toInsert = `,${text.match(/^\r?\n\s+/)[0]}${metadataField}: [${symbolName}]`;
      } else {
        toInsert = `, ${metadataField}: [${symbolName}]`;
      }
    }
  } else if (node.kind == ts.SyntaxKind.ArrayLiteralExpression) {
    // We found the field but it's empty. Insert it just before the `]`.
    position--;
    toInsert = `${symbolName}`;
  } else {
    // Get the indentation of the last element, if any.
    const text = node.getFullText(source);
    if (text.match(/^\r?\n/)) {
      toInsert = `,${text.match(/^\r?\n(\r?)\s+/)[0]}${symbolName}`;
    } else {
      toInsert = `, ${symbolName}`;
    }
  }
  if (importPath !== null) {
    return [
      new InsertChange(ngModulePath, position, toInsert),
      insertImport(source, ngModulePath, symbolName.replace(/\..*$/, ''), importPath),
    ];
  }

  return [new InsertChange(ngModulePath, position, toInsert)];
}

export function addSymbolToNgModuleRoutingMetadata(
  source: ts.SourceFile,
  ngModulePath: string,
  componentName: string,
  importPath: string | null = null,
  url: string,
): any {

  const changes: any = [];

  changes.push(
    insertImport(source, ngModulePath || '', 'RouterModule', '@angular/router', false, changes)
  );

  const routesArrayNodes = findNodes(source, ts.SyntaxKind.ArrayLiteralExpression);

  if (!routesArrayNodes) {
    return [];
  }

  const routesArrayNode = routesArrayNodes
    .find((node: ts.ArrayLiteralExpression) => {
      const nodeParent = <any>node.parent;

      return nodeParent.getChildren().find((node) => {
        return node.kind === ts.SyntaxKind.TypeReference && node.typeName.text === 'Routes'
      });
    });

  if (routesArrayNode) {
    const matchingProperties =
      (routesArrayNode as ts.ArrayLiteralExpression).getChildren()
        .filter(prop => prop.kind == ts.SyntaxKind.SyntaxList);

    let duplicated = false;
    if (matchingProperties) {
      matchingProperties[0].getChildren()
        .filter(prop => prop.kind == ts.SyntaxKind.ObjectLiteralExpression)
        .forEach((prop: any) => {
          if (!duplicated) {
            duplicated = checkIfRouteExists(prop, url, componentName);
          }
        });
    }

    if (duplicated) {
      return changes
    }

    changes.push(...addRouteModuleToModuleImports(source, ngModulePath));

    const endOfRoutesArray = routesArrayNode.getChildren().find((childNode) => {
      return childNode.kind === ts.SyntaxKind.CloseBracketToken;
    });

    if (!endOfRoutesArray) { return changes}

    const position = endOfRoutesArray.getEnd() - 1;
    const toInsert = `  { path: '${url}', component: ${componentName} },\n`;

    changes.push(
      new InsertChange(ngModulePath || '', position, toInsert),
      insertImport(source, ngModulePath || '', componentName, importPath || '')
    );

    return changes;
  } else {
    const allImports = findNodes(source, ts.SyntaxKind.ImportDeclaration);
    const lastImport = allImports.pop();

    if (lastImport) {
      const position = lastImport.getEnd();
      const toInsert = `\n\nexport const routes: Routes = [\n  { path: '${url}', component: ${componentName} },\n];`;

      changes.push(
        new InsertChange(ngModulePath || '', position, toInsert),
        insertImport(source, ngModulePath || '', componentName, importPath || '')
      );

      changes.push(...addRouteModuleToModuleImports(source, ngModulePath));
      changes.push(
        insertImport(source, ngModulePath || '', 'Routes', '@angular/router', false, changes)
      );

      return changes;
    } else {
      return changes;
    }
  }
}

export function addRouteModuleToModuleImports(source, ngModulePath) {
  debugger;
  const nodes = getDecoratorMetadata(source, 'NgModule', '@angular/core');
  const node = nodes[0];  // tslint:disable-line:no-any
  // Find the decorator declaration.
  if (!node) {
    return [];
  }

  const changes: any = [];

  const matchingProperties: ts.ObjectLiteralElement[] =
    (node as ts.ObjectLiteralExpression).properties
      .filter(prop => prop.kind == ts.SyntaxKind.PropertyAssignment)
      .filter((prop: any) => prop.name && prop.name.text === 'imports');

  if (matchingProperties[0]) {
    const importsArrayLiteral = matchingProperties[0].getChildren()
      .find(child => child.kind === ts.SyntaxKind.ArrayLiteralExpression);

    if (importsArrayLiteral) {
      const importsArrayNode = importsArrayLiteral.getChildren()
        .find(child => child.kind === ts.SyntaxKind.SyntaxList);

      if (importsArrayNode) {
        const importsArrayElements = importsArrayNode.getChildren();

        importsArrayElements.forEach((child: any) => {
          if (child.kind === ts.SyntaxKind.CallExpression) {
            debugger;
            if (child.expression
              && (child.expression.name.text === 'forRoot' || child.expression.name.text === 'forChild')
              && child.expression.expression && child.expression.expression.text === 'RouterModule') {

              const hasAddedRoutes = child.arguments.find(arg => arg.text === 'routes');

              if (!hasAddedRoutes && child.arguments.length === 0) {
                const forChildren = child.getChildren();
                if (forChildren) {
                  const paren = forChildren.find(forChild => forChild.kind === ts.SyntaxKind.OpenParenToken)
                  if (paren) {
                    const position = paren.getEnd();
                    const toInsert = `routes`;
                    const change = new InsertChange(ngModulePath || '', position, toInsert);
                    changes.push(change);
                  }
                }
              }
            } else {
              const lastImportedElem = importsArrayElements[importsArrayElements.length - 1];

              const position = lastImportedElem.getEnd();
              const toInsert = `\nRouterModule.forChild(routes),\n`;
              const change = new InsertChange(ngModulePath || '', position, toInsert);
              changes.push(change);
            }
          }
        });

        if (importsArrayElements.length === 0) {
          const openBracketNode = importsArrayLiteral.getChildren()
            .find(literalChild => literalChild.kind === ts.SyntaxKind.OpenBracketToken);

          if (openBracketNode) {
            const position = openBracketNode.getEnd();
            const toInsert = `RouterModule.forChild(routes),`;
            const change = new InsertChange(ngModulePath || '', position, toInsert);
            changes.push(change);
          }
        }
      }
    }
  } else {
    const props = (node as any).properties;
    let position;
    let coma = '';

    if (props.length > 0) {
      const lastProp = props[props.length - 1];
      const lastChild = lastProp.getChildren().pop();

      if (lastChild.kind !== ts.SyntaxKind.CommaToken) {
        coma = ','
      }

      position = lastChild.getEnd();
    } else {
      const sl = node.getChildren()
        .find(child => child.kind === ts.SyntaxKind.SyntaxList);

      if (sl) {
        position = sl.getEnd();
      }
    }

    if (position) {
      const toInsert = `${coma}\n  imports: [ RouterModule.forChild(routes), ],\n`;
      const change = new InsertChange(ngModulePath || '', position, toInsert);
      changes.push(change);
    }
  }

  return changes;
}

export function checkIfRouteExists(obj: any, url, componentName, check = false) {

  check = obj.properties
    && obj.properties[0]
    && obj.properties[0].initializer.text === url
    && obj.properties[1]
    && obj.properties[1].initializer.text === componentName;

  if (check) {
    return check;
  }

  const children = obj.properties.find(prop => prop.name.text === 'children');
  if (children) {
    const childrenArrNode = children
      .getChildren()
      .find(node => node.kind === ts.SyntaxKind.ArrayLiteralExpression);

    if (childrenArrNode) {
      const childrenArr = childrenArrNode.getChildren().find(node => node.kind === ts.SyntaxKind.SyntaxList);
      if (childrenArr) {
        childrenArr.getChildren()
          .filter(prop => prop.kind == ts.SyntaxKind.ObjectLiteralExpression)
          .forEach(objectNode => {
            checkIfRouteExists(objectNode, url, componentName, check);
        });
      }
    }
  }

  return check;

}

/**
 * Custom function to insert a declaration (component, pipe, directive)
 * into NgModule declarations. It also imports the component.
 */
export function addDeclarationToModule(source: ts.SourceFile,
                                       modulePath: string, classifiedName: string,
                                       importPath: string): Change[] {
  return addSymbolToNgModuleMetadata(
    source, modulePath, 'declarations', classifiedName, importPath);
}

/**
 * Custom function to insert an NgModule into NgModule imports. It also imports the module.
 */
export function addImportToModule(source: ts.SourceFile,
                                  modulePath: string, classifiedName: string,
                                  importPath: string): Change[] {

  return addSymbolToNgModuleMetadata(source, modulePath, 'imports', classifiedName, importPath);
}

/**
 * Custom function to insert a provider into NgModule. It also imports it.
 */
export function addProviderToModule(source: ts.SourceFile,
                                    modulePath: string, classifiedName: string,
                                    importPath: string): Change[] {
  return addSymbolToNgModuleMetadata(source, modulePath, 'providers', classifiedName, importPath);
}

/**
 * Custom function to insert an export into NgModule. It also imports it.
 */
export function addExportToModule(source: ts.SourceFile,
                                  modulePath: string, classifiedName: string,
                                  importPath: string): Change[] {
  return addSymbolToNgModuleMetadata(source, modulePath, 'exports', classifiedName, importPath);
}

/**
 * Custom function to insert an export into NgModule. It also imports it.
 */
export function addBootstrapToModule(source: ts.SourceFile,
                                     modulePath: string, classifiedName: string,
                                     importPath: string): Change[] {
  return addSymbolToNgModuleMetadata(source, modulePath, 'bootstrap', classifiedName, importPath);
}

/**
 * Determine if an import already exists.
 */
export function isImported(source: ts.SourceFile,
                           classifiedName: string,
                           importPath: string): boolean {
  const allNodes = getSourceNodes(source);
  const matchingNodes = allNodes
    .filter(node => node.kind === ts.SyntaxKind.ImportDeclaration)
    .filter((imp: ts.ImportDeclaration) => imp.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral)
    .filter((imp: ts.ImportDeclaration) => {
      return (<ts.StringLiteral> imp.moduleSpecifier).text === importPath;
    })
    .filter((imp: ts.ImportDeclaration) => {
      if (!imp.importClause) {
        return false;
      }
      const nodes = findNodes(imp.importClause, ts.SyntaxKind.ImportSpecifier)
        .filter(n => n.getText() === classifiedName);

      return nodes.length > 0;
    });

  return matchingNodes.length > 0;
}
