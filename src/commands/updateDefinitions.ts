import * as vscode from "vscode";

import {
  configureLuaIntellisense,
  updateLuaDefinitions,
} from "../core/intellisense";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  getSetting,
  logInfo,
  tryLoadProject,
  type CommandServices,
} from "./common";

export async function maybeAutoUpdateDefinitions(
  services: CommandServices,
): Promise<void> {
  if (
    !getSetting<boolean>("intellisense.enabled", true) ||
    !getSetting<boolean>("intellisense.autoUpdate", true)
  ) {
    return;
  }

  try {
    const project = await tryLoadProject();
    if (!project) {
      return;
    }

    const fileSystem = createVsCodeFileSystem();
    await configureLuaIntellisense(
      fileSystem,
      project.rootPath,
      project.projectConfig.buildTarget,
    );
    await updateLuaDefinitions(fileSystem, project.rootPath, (message) =>
      logInfo(services.output, message),
    );
  } catch (error) {
    logInfo(
      services.output,
      `Automatic definition update skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function registerUpdateDefinitionsCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "pzModCreator.updateDefinitions",
    async () => {
      const project = await tryLoadProject();
      if (!project) {
        throw new Error(
          "Open a Project Zomboid mod project before updating definitions.",
        );
      }

      const fileSystem = createVsCodeFileSystem();
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Updating Project Zomboid Lua definitions",
        },
        async () => {
          await configureLuaIntellisense(
            fileSystem,
            project.rootPath,
            project.projectConfig.buildTarget,
          );
          return await updateLuaDefinitions(
            fileSystem,
            project.rootPath,
            (message) => logInfo(services.output, message),
          );
        },
      );

      if (result.failures.length) {
        vscode.window.showWarningMessage(
          `Definitions update completed with warnings: ${result.failures.join(" | ")}`,
        );
        return;
      }

      vscode.window.showInformationMessage("Definitions updated successfully.");
    },
  );
}
