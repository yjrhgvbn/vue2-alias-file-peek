import * as vscode from "vscode";
import VueJumper from "./vueJumper";

const languageConfiguration: vscode.LanguageConfiguration = {
  wordPattern: /(\w+((-\w+)+)?)/,
};
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(["vue"], new VueJumper())
  );
  context.subscriptions.push(
    vscode.languages.setLanguageConfiguration("vue", languageConfiguration)
  );
}

export function deactivate() {}
