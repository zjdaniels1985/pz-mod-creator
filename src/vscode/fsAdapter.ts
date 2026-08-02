import * as vscode from "vscode";

import type { FileSystemAdapter } from "../core/fs";

export function createVsCodeFileSystem(): FileSystemAdapter {
  return {
    async readFile(filePath) {
      return await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    },
    async writeFile(filePath, content) {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);
    },
    async createDirectory(directoryPath) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(directoryPath));
    },
    async readDirectory(directoryPath) {
      const entries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.file(directoryPath),
      );
      return entries.map(([name, kind]) => ({
        name,
        kind: kind & vscode.FileType.Directory ? "directory" : "file",
      }));
    },
    async delete(targetPath, options) {
      await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), {
        recursive: options?.recursive ?? false,
        useTrash: options?.useTrash ?? false,
      });
    },
    async rename(oldPath, newPath) {
      await vscode.workspace.fs.rename(
        vscode.Uri.file(oldPath),
        vscode.Uri.file(newPath),
        {
          overwrite: false,
        },
      );
    },
    async stat(targetPath) {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
      return {
        type: stat.type & vscode.FileType.Directory ? "directory" : "file",
      };
    },
  };
}
