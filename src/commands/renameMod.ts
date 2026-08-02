import * as path from "node:path";

import * as vscode from "vscode";

import { exists } from "../core/fs";
import {
  modIdExists,
  resolveModMediaRoot,
  resolveModRoot,
  writeProjectConfig,
  type ModDefinition,
} from "../core/project";
import {
  buildModRenamePlan,
  executeModRenamePlan,
  isCaseOnlyRename,
  renameModScopedFiles,
  rewriteModIdReferences,
  writeModInfo,
} from "../core/scaffold";
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

/**
 * The mod.info `name=` field is the in-game display name and is independent of
 * the `id=` field. It is only renamed automatically when it still matches the
 * old ID (i.e. it was never customized); otherwise the user is asked.
 *
 * Returns the name to write, or undefined if the user dismissed the prompt.
 */
async function resolveUpdatedModName(
  mod: ModDefinition,
  newModId: string,
): Promise<string | undefined> {
  if (mod.name === mod.id) {
    return newModId;
  }

  const choice = await vscode.window.showQuickPick(
    [
      {
        label: `Keep display name "${mod.name}"`,
        description: "Only the mod ID changes.",
        rename: false,
      },
      {
        label: `Change display name to "${newModId}"`,
        description: "Updates name= in mod.info.",
        rename: true,
      },
    ],
    {
      title: "Update the mod's display name?",
      placeHolder: `mod.info "name=" is currently "${mod.name}"`,
    },
  );

  if (!choice) {
    return undefined;
  }

  return choice.rename ? newModId : mod.name;
}

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

      // Ignore this mod's own ID so a case-only rename is not treated as a
      // collision with itself.
      if (modIdExists(project.projectConfig, newModId, mod.id)) {
        throw new Error(`A mod with ID ${newModId} already exists.`);
      }

      const updatedName = await resolveUpdatedModName(mod, newModId);
      if (updatedName === undefined) {
        return;
      }

      const confirmed = await confirmDestructive(
        `Rename mod ID from ${mod.id} to ${newModId}?`,
        "Renaming a mod ID can break existing saves that reference the original ID. " +
          "Files and known code references will be updated, but check any custom " +
          "strings containing the old ID.",
      );
      if (!confirmed) {
        return;
      }

      const fileSystem = createVsCodeFileSystem();
      const buildTarget = project.projectConfig.buildTarget;

      const destination = resolveModRoot(
        project.rootPath,
        buildTarget,
        newModId,
      );

      // A case-only rename resolves to the same folder on win32/macOS, so the
      // existence check must not treat that as a pre-existing destination.
      if (
        !isCaseOnlyRename(mod.id, newModId) &&
        (await exists(fileSystem, destination))
      ) {
        throw new Error(
          `The destination mod folder already exists for ${newModId}.`,
        );
      }

      const plan = buildModRenamePlan(
        project.rootPath,
        buildTarget,
        mod.id,
        newModId,
      );

      await executeModRenamePlan(fileSystem, plan);

      const mediaRoot = resolveModMediaRoot(
        project.rootPath,
        buildTarget,
        newModId,
      );

      const renamedFiles = await renameModScopedFiles(
        fileSystem,
        mediaRoot,
        mod.id,
        newModId,
      );
      for (const renamedFile of renamedFiles) {
        logInfo(
          services.output,
          `Renamed file to ${path.relative(project.rootPath, renamedFile)}`,
        );
      }

      // Runs after the file renames so paths logged here are the final ones.
      const rewrittenFiles = await rewriteModIdReferences(
        fileSystem,
        mediaRoot,
        mod.id,
        newModId,
      );
      const rewrittenReferenceCount = rewrittenFiles.reduce(
        (sum, file) => sum + file.replacements,
        0,
      );
      for (const rewritten of rewrittenFiles) {
        logInfo(
          services.output,
          `Updated ${rewritten.replacements} reference(s) in ` +
            path.relative(project.rootPath, rewritten.filePath),
        );
      }

      const updatedMod: ModDefinition = {
        ...mod,
        id: newModId,
        name: updatedName,
      };
      const modIndex = project.projectConfig.mods.findIndex(
        (entry) => entry.id === mod.id,
      );
      project.projectConfig.mods[modIndex] = updatedMod;

      // Rewrites mod.info at the new mod root with both id= and name= applied.
      await writeModInfo(
        fileSystem,
        getTemplateRoot(services.context),
        project.rootPath,
        buildTarget,
        updatedMod,
      );
      await writeProjectConfig(
        fileSystem,
        project.rootPath,
        project.projectConfig,
      );

      services.treeProvider.refresh();

      const nameChanged = updatedName !== mod.name;
      logInfo(
        services.output,
        `Renamed mod ${mod.id} to ${newModId}` +
          (nameChanged ? ` and display name to "${updatedName}"` : "") +
          ` (${renamedFiles.length} file(s) renamed, ` +
          `${rewrittenReferenceCount} reference(s) updated in ` +
          `${rewrittenFiles.length} file(s)).`,
      );
      vscode.window.showInformationMessage(
        `Renamed mod to ${newModId}.` +
          (renamedFiles.length
            ? ` Updated ${renamedFiles.length} file name(s).`
            : "") +
          (rewrittenReferenceCount
            ? ` Rewrote ${rewrittenReferenceCount} reference(s) in ${rewrittenFiles.length} file(s).`
            : ""),
      );
    },
  );
}
