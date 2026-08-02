import * as vscode from "vscode";

import { cleanProjectOutput } from "../core/build";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  confirmDestructive,
  logInfo,
  requireCurrentProject,
  resolveOutputLocation,
  type CommandServices,
} from "./common";

export function registerCleanCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand("pzModCreator.clean", async () => {
    const project = await requireCurrentProject();
    const { outputDirectory, outputRoot } = resolveOutputLocation(
      project.rootPath,
      project.projectConfig.projectName,
    );

    const confirmed = await confirmDestructive(
      `Delete generated output for ${project.projectConfig.projectName}?`,
      `Only ${outputRoot} will be removed.`,
    );
    if (!confirmed) {
      return;
    }

    const fileSystem = createVsCodeFileSystem();
    const deleted = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Cleaning Project Zomboid build output",
      },
      async () =>
        await cleanProjectOutput(fileSystem, outputDirectory, outputRoot),
    );

    logInfo(
      services.output,
      deleted ? `Deleted ${outputRoot}` : `Nothing to delete at ${outputRoot}`,
    );
    vscode.window.showInformationMessage(
      deleted
        ? "Clean completed."
        : "No generated output folder was found to clean.",
    );
  });
}
