import * as vscode from "vscode";

import { buildProject } from "../core/build";
import { createVsCodeFileSystem } from "../vscode/fsAdapter";
import {
  getIgnoreGlobs,
  getSetting,
  logInfo,
  requireCurrentProject,
  resolveOutputLocation,
  type CommandServices,
} from "./common";

export function registerBuildCommand(
  services: CommandServices,
): vscode.Disposable {
  return vscode.commands.registerCommand("pzModCreator.build", async () => {
    const project = await requireCurrentProject();
    const { outputRoot } = resolveOutputLocation(
      project.rootPath,
      project.projectConfig.projectName,
    );
    const fileSystem = createVsCodeFileSystem();

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Building Project Zomboid mod project",
      },
      async () =>
        await buildProject(fileSystem, project.rootPath, {
          outputRoot,
          ignoreGlobs: getIgnoreGlobs(),
          cleanBeforeBuild: getSetting<boolean>("cleanBeforeBuild", false),
          logger: (message) => logInfo(services.output, message),
        }),
    );

    const summary = `Build copied ${result.copiedFiles} files to ${result.outputRoot} (${result.skippedFiles} ignored).`;
    logInfo(services.output, summary);
    vscode.window.showInformationMessage(summary);
  });
}
