import * as vscode from "vscode";

import { registerAddTranslationCommand } from "./commands/addTranslation";
import { registerBuildCommand } from "./commands/build";
import {
  BuildWatchController,
  registerBuildAndWatchCommand,
} from "./commands/buildAndWatch";
import { registerCleanCommand } from "./commands/clean";
import { registerCopyTranslationCommand } from "./commands/copyTranslation";
import { registerCreateModCommand } from "./commands/createMod";
import { registerDeleteModCommand } from "./commands/deleteMod";
import { registerNewProjectCommand } from "./commands/newProject";
import { registerRenameModCommand } from "./commands/renameMod";
import {
  registerUpdateDefinitionsCommand,
  maybeAutoUpdateDefinitions,
} from "./commands/updateDefinitions";
import { registerUpdateModCommand } from "./commands/updateMod";
import type { CommandServices } from "./commands/common";
import { ModTreeProvider } from "./providers/modTreeProvider";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const output = vscode.window.createOutputChannel("PZ Mod Creator");
  const treeProvider = new ModTreeProvider();
  const watchController = new BuildWatchController(output);
  const services: CommandServices = {
    context,
    output,
    treeProvider,
    watchController,
  };

  context.subscriptions.push(
    output,
    watchController,
    vscode.window.createTreeView("pzModCreator.mods", {
      treeDataProvider: treeProvider,
    }),
    registerNewProjectCommand(services),
    registerCreateModCommand(services),
    registerUpdateModCommand(services),
    registerDeleteModCommand(services),
    registerRenameModCommand(services),
    registerAddTranslationCommand(services),
    registerCopyTranslationCommand(services),
    registerCleanCommand(services),
    registerBuildCommand(services),
    registerBuildAndWatchCommand(services),
    registerUpdateDefinitionsCommand(services),
  );

  setTimeout(() => {
    void maybeAutoUpdateDefinitions(services);
  }, 500);
}

export function deactivate(): void {
  // Handled by disposables.
}
