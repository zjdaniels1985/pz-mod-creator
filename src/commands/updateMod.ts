import * as vscode from "vscode";

import { writeProjectConfig, type ModDefinition } from "../core/project";
import { writeModInfo } from "../core/scaffold";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  getTemplateRoot,
  logInfo,
  pickMod,
  requireCurrentProject,
  type CommandServices,
} from "./common";

export function registerUpdateModCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.updateMod",
    async (selected?: string | ModDefinition) => {
      const project = await requireCurrentProject();
      const mod = await pickMod(project.projectConfig, selected);
      if (!mod) {
        vscode.window.showInformationMessage("No mod selected.");
        return;
      }

      const name = await vscode.window.showInputBox({
        title: "Update Mod",
        prompt: "Name",
        value: mod.name,
      });
      if (!name) {
        return;
      }

      const description =
        (await vscode.window.showInputBox({
          title: "Update Mod",
          prompt: "Description",
          value: mod.description,
        })) ?? mod.description;
      const author =
        (await vscode.window.showInputBox({
          title: "Update Mod",
          prompt: "Author",
          value: mod.author,
        })) ?? mod.author;
      const version =
        (await vscode.window.showInputBox({
          title: "Update Mod",
          prompt: "Version",
          value: mod.version,
        })) ?? mod.version;
      const requiresInput =
        (await vscode.window.showInputBox({
          title: "Update Mod",
          prompt: "Required mods (comma separated)",
          value: mod.requires.join(","),
        })) ?? mod.requires.join(",");

      const updatedMod: ModDefinition = {
        ...mod,
        name,
        description,
        author,
        version,
        requires: requiresInput
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };

      const modIndex = project.projectConfig.mods.findIndex(
        (entry) => entry.id === mod.id,
      );
      project.projectConfig.mods[modIndex] = updatedMod;

      const fileSystem = createVsCodeFileSystem();
      await writeModInfo(
        fileSystem,
        getTemplateRoot(services.context),
        project.rootPath,
        project.projectConfig.buildTarget,
        updatedMod,
      );
      await writeProjectConfig(
        fileSystem,
        project.rootPath,
        project.projectConfig,
      );

      services.treeProvider.refresh();
      logInfo(services.output, `Updated mod ${updatedMod.id}`);
      vscode.window.showInformationMessage(`Updated mod ${updatedMod.name}.`);
    },
  );
}
