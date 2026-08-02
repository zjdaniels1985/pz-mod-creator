import * as vscode from "vscode";

import { scaffoldMod } from "../core/scaffold";
import {
  resolveModRoot,
  sanitizeModIdCandidate,
  writeProjectConfig,
  type ModDefinition,
} from "../core/project";
import { exists } from "../core/fs";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  getTemplateRoot,
  logInfo,
  promptForModId,
  requireCurrentProject,
  type CommandServices,
} from "./common";

export function registerCreateModCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand("pzModCreator.createMod", async () => {
    const project = await requireCurrentProject();
    const modName = await vscode.window.showInputBox({
      title: "Create Mod",
      prompt: "Mod name",
      validateInput(value) {
        return value.trim() ? undefined : "Mod name is required.";
      },
    });
    if (!modName) {
      return;
    }

    const modId = await promptForModId(sanitizeModIdCandidate(modName));
    if (!modId) {
      return;
    }

    if (project.projectConfig.mods.some((mod) => mod.id === modId)) {
      throw new Error(`A mod with ID ${modId} already exists.`);
    }

    const description =
      (await vscode.window.showInputBox({
        title: "Create Mod",
        prompt: "Description",
        value: "",
      })) ?? "";

    const author =
      (await vscode.window.showInputBox({
        title: "Create Mod",
        prompt: "Author",
        value: project.projectConfig.author,
      })) ?? project.projectConfig.author;

    const mod: ModDefinition = {
      id: modId,
      name: modName,
      description,
      author,
      version: "1.0.0",
      requires: [],
    };

    const fileSystem = createVsCodeFileSystem();
    if (
      await exists(
        fileSystem,
        resolveModRoot(
          project.rootPath,
          project.projectConfig.buildTarget,
          mod.id,
        ),
      )
    ) {
      throw new Error(`The mod folder already exists for ${mod.id}.`);
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Creating mod ${mod.name}`,
      },
      async () => {
        await scaffoldMod(fileSystem, {
          projectRoot: project.rootPath,
          templateRoot: getTemplateRoot(services.context),
          buildTarget: project.projectConfig.buildTarget,
          mod,
        });

        project.projectConfig.mods.push(mod);
        await writeProjectConfig(
          fileSystem,
          project.rootPath,
          project.projectConfig,
        );
      },
    );

    services.treeProvider.refresh();
    logInfo(services.output, `Created mod ${mod.id}`);
    vscode.window.showInformationMessage(`Created mod ${mod.name}.`);
  });
}
