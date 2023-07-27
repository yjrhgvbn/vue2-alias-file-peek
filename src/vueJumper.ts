import * as vscode from "vscode";
import parseImports, { ModuleSpecifierType } from "parse-imports";
import { createMatchPath } from "tsconfig-paths";
import { accessSync, constants } from "fs";
import { resolve, relative } from "path";

function checkFileExists(filePath: string) {
  try {
    accessSync(
      vscode.workspace.workspaceFolders![0].uri.fsPath + filePath,
      constants.F_OK
    );
    return true;
  } catch (err) {
    return false;
  }
}
export interface IAliasConfigsItem {
  alias: string;
  target: string[];
}

export default class VueJumper implements vscode.DefinitionProvider {
  aliasConfigs: IAliasConfigsItem[] = [];
  constructor() {}

  getSelectionWord(document: vscode.TextDocument, position: vscode.Position) {
    const selection = document.getWordRangeAtPosition(position);
    if (!selection) {
      return null;
    }
    const selectionWord = document.getText(selection);
    // 判断是不是template内
    let templateStartLine = 0;
    let templateEndLine = 0;
    const documentTextLines = document.getText().split("\n");
    for (let i = 0; i < documentTextLines.length; i++) {
      if (documentTextLines[i].trim().startsWith("<template>")) {
        templateStartLine = i;
      }
    }
    for (let i = documentTextLines.length - 1; i >= 0; i--) {
      if (documentTextLines[i].includes("</template>")) {
        templateEndLine = i;
      }
    }
    const isInTemplate =
      position.line > templateStartLine && position.line < templateEndLine;
    if (isInTemplate) {
      // 检查选中左边的是不是<
      const leftChar = document.getText(
        new vscode.Range(
          new vscode.Position(
            selection.start.line,
            selection.start.character - 1
          ),
          selection.start
        )
      );
      if (leftChar !== "<") {
        return null;
      }
    }

    // 横杆转驼峰
    let word = selectionWord.replace(/-(\w)/g, function (all, letter) {
      return letter.toUpperCase();
    });
    // 第一字母大写
    word = word.slice(0, 1).toUpperCase() + word.slice(1);
    return word;
  }

  async getImportModule(document: vscode.TextDocument, word: string) {
    // 获取script标签的内容
    const scriptContent = document
      .getText()
      .match(/<script>([\s\S]*)<\/script>/)?.[1];
    if (!scriptContent) {
      return;
    }
    const imports = [...(await parseImports(scriptContent))];
    for (const item of imports) {
      const { importClause, moduleSpecifier } = item;
      // 有一个和当前名字相同的，就可以跳转
      const hasSameName =
        importClause?.default === word ||
        importClause?.named.some((i) => {
          return i.specifier === word || i.binding === word;
        });
      if (hasSameName) {
        return {
          type: moduleSpecifier.type,
          value: moduleSpecifier.value || moduleSpecifier.code,
        };
      }
    }
  }

  async getAliasConfig(name: string) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.path;
    if (!workspacePath) {
      return null;
    }
    const configPath = workspacePath + name;

    const config = await vscode.workspace
      .openTextDocument(configPath)
      .then((document) => JSON.parse(document.getText()));
    const baseUrl = config?.compilerOptions?.baseUrl;
    const paths = config?.compilerOptions?.paths;
    return { baseUrl, paths };
  }

  async getMatchPath(
    document: vscode.TextDocument,
    importModule: {
      type: ModuleSpecifierType;
      value: string;
    }
  ) {
    if (importModule.type === "package") {
      const importFilePath = importModule.value;
      const tsconfig = await this.getAliasConfig("/tsconfig.json");
      const jsconfig = await this.getAliasConfig("/jsconfig.json");
      const baseUrl = tsconfig?.baseUrl || jsconfig?.baseUrl || ".";
      const paths = tsconfig?.paths || jsconfig?.paths || {};
      let matchPath = "";
      const getMatchPath = createMatchPath(baseUrl, paths, undefined, false);
      getMatchPath(
        importFilePath,
        undefined,
        (importPath) => {
          if (!importPath?.endsWith(".vue") || !checkFileExists(importPath)) {
            return false;
          }
          matchPath = importPath;
          return true;
        },
        [".vue"]
      );
      return matchPath;
    } else if (
      importModule.type === "relative" ||
      importModule.type === "absolute"
    ) {
      let importFilePath = importModule.value;
      if (importModule.type === "relative") {
        const currentFilePath = document.uri.path;
        importFilePath =
          "/" +
          relative(
            vscode.workspace.workspaceFolders![0].uri.fsPath,
            resolve(currentFilePath, "../", importModule.value)
          );
      }
      if (checkFileExists(importFilePath + ".vue")) {
        return importFilePath + ".vue";
      }
      if (checkFileExists(importFilePath + "/index.vue")) {
        return importFilePath + "/index.vue";
      }
      return null;
    } else {
      return null;
    }
  }

  async findImportFromPath(
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    document.uri;
    const word = this.getSelectionWord(document, position);
    if (!word) {
      return "";
    }
    const importModule = await this.getImportModule(document, word);
    // 有.vue后缀的，vscode可以自动跳转
    if (!importModule || importModule.value.endsWith(".vue")) {
      return null;
    }
    const res = await this.getMatchPath(document, importModule);
    return res || "";
  }

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    return this.findImportFromPath(document, position).then((res) => {
      console.log(
        "🚀 ~ file: vueJumper.ts:188 ~ VueJumper ~ returnthis.findImportFromPath ~ res:",
        res
      );
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
