import * as path from "node:path";

import Mocha from "mocha";
import { glob } from "glob";

async function main(): Promise<void> {
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
  });

  const testFiles = await glob("**/*.test.js", {
    cwd: __dirname,
    absolute: true,
  });

  for (const testFile of testFiles) {
    mocha.addFile(path.resolve(testFile));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
        return;
      }
      resolve();
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
