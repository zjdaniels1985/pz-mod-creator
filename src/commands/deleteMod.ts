import * as vscode from "vscode";

import {
  resolveModRoot,
  writeProjectConfig,
  type ModDefinition,
} from "../core/project";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  confirmDestructive,
  logInfo,
  pickMod,
  requireCurrentProject,
  type CommandServices,
} from "./common";

export function registerDeleteModCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.deleteMod",
    async (selected?: string | ModDefinition) => {
      const project = await requireCurrentProject();
      const mod = await pickMod(project.projectConfig, selected);
      if (!mod) {
        vscode.window.showInformationMessage("No mod selected.");
        return;
      }

      const confirmed = await confirmDestructive(
        `Delete mod ${mod.name}?`,
        "This permanently removes the mod folder from your workspace.",
      );
      if (!confirmed) {
        return;
      }

      const fileSystem = createVsCodeFileSystem();
      await fileSystem.delete(
        resolveModRoot(
          project.rootPath,
          project.projectConfig.buildTarget,
          mod.id,
        ),
        {
          recursive: true,
        },
      );
      project.projectConfig.mods = project.projectConfig.mods.filter(
        (entry) => entry.id !== mod.id,
      );
      await writeProjectConfig(
        fileSystem,
        project.rootPath,
        project.projectConfig,
      );

      services.treeProvider.refresh();
      logInfo(services.output, `Deleted mod ${mod.id}`);
      vscode.window.showInformationMessage(`Deleted mod ${mod.name}.`);
    },
  );
}
