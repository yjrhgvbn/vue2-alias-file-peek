import * as vscode from "vscode";
import parseImports from "parse-imports";
import { loadConfig, createMatchPath } from "tsconfig-paths";
import { accessSync, constants } from "fs";

function checkFileExists(filePath: string) {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}
export interface IAliasConfigsItem {
  alias: string;
  target: string[];
}

export interface ILineInfo {
  type: string;
  path: string;
  originPath: string;
}

// const aliasConfigs: IAliasConfigsItem[] = [
//   {
//     alias: "@",
//     target: "src",
//   },
// ];

export default class VueJumper implements vscode.DefinitionProvider {
  aliasConfigs: IAliasConfigsItem[] = [];
  globalComponentsPrefixConfigs: string[] = [];
  constructor() {}

  async findImportFromPath(
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    const vueTemp = document.getText();
    // 获取script标签的内容
    const scriptContent = vueTemp.match(/<script>([\s\S]*)<\/script>/)?.[1];
    if (!scriptContent) {
      return;
    }
    const selection = document.getWordRangeAtPosition(position);
    const selectionWord = document.getText(selection);
    // 横杆转驼峰
    let world = selectionWord.replace(/-(\w)/g, function (all, letter) {
      return letter.toUpperCase();
    });
    // 第一字母大写
    world = world.slice(0, 1).toUpperCase() + world.slice(1);
    const imports = [...(await parseImports(scriptContent))];
    let targetImport = "";
    for (const item of imports) {
      const { importClause, moduleSpecifier } = item;
      // 有一个和当前名字相同的，就可以跳转
      const hasSameName =
        importClause?.default === world ||
        importClause?.named.some((i) => {
          return i.specifier === world || i.binding === world;
        });
      if (hasSameName) {
        if (moduleSpecifier.type === "package") {
          targetImport = moduleSpecifier.value || moduleSpecifier.code;
        }
      }
    }
    // TODO: 换个方式获取tsconfig.json，暂时没找到
    const tsconfig = await vscode.workspace
      .openTextDocument(
        vscode.workspace.workspaceFolders![0].uri.fsPath + "/tsconfig.json"
      )
      .then((document) => {
        return document.getText();
      });
    if (!targetImport || !tsconfig) {
      return;
    }
    // 读取tsconfig.json配置文件，获取别名配置
    const tsconfigJson = JSON.parse(tsconfig);
    const baseUrl = tsconfigJson?.compilerOptions?.baseUrl || "."; // Either absolute or relative path. If relative it's resolved to current working directory.
    const paths = tsconfigJson?.compilerOptions?.paths || {};
    const matchPath = createMatchPath(baseUrl, paths, undefined, false);
    let exitPath = "";
    matchPath(
      targetImport,
      undefined,
      (d) => {
        if (!d.endsWith(".vue")) {
          return false;
        }
        const isExit = checkFileExists(
          vscode.workspace.workspaceFolders![0].uri.fsPath + d
        );
        if (isExit) {
          exitPath = d;
        }
        return isExit;
      },
      [".vue"]
    );
    return exitPath;
  }

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    const selection = document.getWordRangeAtPosition(position);
    return this.findImportFromPath(document, position).then((res) => {
      let allPaths: vscode.Location[] = [];
      if (res) {
        allPaths.push(
          new vscode.Location(
            vscode.Uri.file(
              vscode.workspace.workspaceFolders![0].uri.fsPath + res
            ),
            new vscode.Position(0, 0)
          )
        );
      }
      return allPaths;
    });
  }
}
