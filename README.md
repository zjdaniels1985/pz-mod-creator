# Project Zomboid Mod Creator

Project Zomboid Mod Creator is a VS Code extension for scaffolding, maintaining, and building Project Zomboid workshop projects for Build 41 and Build 42 layouts.

## Features

- Create new Project Zomboid workshop projects with the correct folder structure.
- Manage multiple mods in one project from the **PZ Mods** explorer tree.
- Update mod metadata, rename mod IDs, or delete mods with confirmation prompts.
- Add or copy official translation language files.
- Build projects into your local Workshop output directory and keep them synced with **Build and Watch**.
- Configure Lua IntelliSense and download Candle and PZEventDoc definitions.

## Commands

| Command                                     | Description                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PZ Mod Creator: New Project`               | Create a new workshop project, scaffold the first mod, and configure IntelliSense. |
| `PZ Mod Creator: Create Mod`                | Add a new mod to the current project.                                              |
| `PZ Mod Creator: Update Mod`                | Edit mod metadata and rewrite `mod.info`.                                          |
| `PZ Mod Creator: Delete Mod`                | Remove a mod directory and its project entry after confirmation.                   |
| `PZ Mod Creator: Rename Mod`                | Rename a mod ID, its folder, and nested Lua folders.                               |
| `PZ Mod Creator: Add Translation Language`  | Create the five standard translation files for an official language.               |
| `PZ Mod Creator: Copy Translation Language` | Copy one language to another and rewrite the table headers.                        |
| `PZ Mod Creator: Clean Output`              | Delete this extension's generated output folder for the current project.           |
| `PZ Mod Creator: Build`                     | Copy the project into the configured output directory.                             |
| `PZ Mod Creator: Build and Watch`           | Toggle continuous file sync into the output folder.                                |
| `PZ Mod Creator: Update Definitions`        | Refresh Candle and PZEventDoc Lua definition stubs.                                |

## Settings

| Setting                                | Default                                            | Description                                                           |
| -------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `pzModCreator.outputDirectory`         | `""`                                               | Output path for builds. Empty resolves to `<home>/Zomboid/Workshop/`. |
| `pzModCreator.buildTarget`             | `b42`                                              | Default project build target for new projects.                        |
| `pzModCreator.watchDebounce`           | `300`                                              | Debounce delay for Build and Watch.                                   |
| `pzModCreator.cleanBeforeBuild`        | `false`                                            | Delete the generated output folder before each build.                 |
| `pzModCreator.ignoreGlobs`             | `[                                                 |
| "**/.git/**",                          |
| "**/node_modules/**",                  |
| "**/.pzmodcreator.json",               |
| "**/.vscode/**",                       |
| ".types/**"                            |
| ]`                                     | Glob patterns skipped during build and watch sync. |
| `pzModCreator.defaultAuthor`           | `""`                                               | Suggested author name for new projects and mods.                      |
| `pzModCreator.intellisense.enabled`    | `true`                                             | Enable generated Lua workspace settings and recommendations.          |
| `pzModCreator.intellisense.autoUpdate` | `true`                                             | Refresh definition stubs automatically when a project is opened.      |

## Generated project structure

```text
<project-root>/
  workshop.txt
  preview.png
  .pzmodcreator.json
  Contents/
    mods/
      <ModID>/
        mod.info
        poster.png
        media/
          lua/
            client/<ModID>/
            server/<ModID>/
            shared/<ModID>/
            shared/Translate/EN/
          textures/
          scripts/
```

Build 41 projects use `mods/<ModID>/` at the project root instead of `Contents/mods/<ModID>/`.

## Steam Workshop publishing

1. Build the project into your configured Workshop output directory.
2. Open the Project Zomboid Workshop uploader and select the generated project folder.
3. Review `workshop.txt`, poster art, preview image, and translations before publishing.
4. If you changed a mod ID, warn players because existing saves can break.

## Development

```bash
npm install
npm run compile
npm test
```
