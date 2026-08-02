import * as vscode from "vscode";

import { exists } from "../core/fs";
import { buildModRenamePlan } from "../core/scaffold";
import {
  resolveModRoot,
  writeProjectConfig,
  type ModDefinition,
} from "../core/project";
import { writeModInfo } from "../core/scaffold";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  confirmDestructive,
  getTemplateRoot,
  logInfo,
  pickMod,
  promptForModId,
  requireCurrentProject,
  type CommandServices,
} from "./common";

export function registerRenameModCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.renameMod",
    async (selected?: string | ModDefinition) => {
      const project = await requireCurrentProject();
      const mod = await pickMod(project.projectConfig, selected);
      if (!mod) {
        vscode.window.showInformationMessage("No mod selected.");
        return;
      }

      const newModId = await promptForModId(mod.id);
      if (!newModId || newModId === mod.id) {
        return;
      }

      if (project.projectConfig.mods.some((entry) => entry.id === newModId)) {
        throw new Error(`A mod with ID ${newModId} already exists.`);
      }

      const confirmed = await confirmDestructive(
        `Rename mod ID from ${mod.id} to ${newModId}?`,
        "Renaming a mod ID can break existing saves that reference the original ID.",
      );
      if (!confirmed) {
        return;
      }

      const fileSystem = createVsCodeFileSystem();
      const plan = buildModRenamePlan(
        project.rootPath,
        project.projectConfig.buildTarget,
        mod.id,
        newModId,
      );
      if (
        await exists(
          fileSystem,
          resolveModRoot(
            project.rootPath,
            project.projectConfig.buildTarget,
            newModId,
          ),
        )
      ) {
        throw new Error(
          `The destination mod folder already exists for ${newModId}.`,
        );
      }

      await fileSystem.rename(plan[0].from, plan[0].to);
      for (const step of plan.slice(1)) {
        if (await exists(fileSystem, step.from)) {
          await fileSystem.rename(step.from, step.to);
        }
      }

      const updatedMod: ModDefinition = { ...mod, id: newModId };
      const modIndex = project.projectConfig.mods.findIndex(
        (entry) => entry.id === mod.id,
      );
      project.projectConfig.mods[modIndex] = updatedMod;

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
      logInfo(services.output, `Renamed mod ${mod.id} to ${newModId}`);
      vscode.window.showInformationMessage(`Renamed mod to ${newModId}.`);
    },
  );
}
