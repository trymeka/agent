import { execSync } from "node:child_process";
import type { PlopTypes } from "@turbo/gen";

interface PackageJson {
  name: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("package", {
    description: "Generate a new package for the Acme Monorepo",
    prompts: [
      {
        type: "input",
        name: "name",
        message:
          "What is the name of the package? (You can skip the `@trymeka/` prefix)",
        validate: (input: string) => {
          if (!input) {
            return "package name is required";
          }
          return true;
        },
      },
      {
        type: "list",
        name: "type",
        message: "What type of package should be created?",
        choices: ["public", "private"],
      },
    ],
    actions: [
      (answers) => {
        if ("name" in answers && typeof answers.name === "string") {
          if (answers.name.startsWith("@trymeka/")) {
            answers.name = answers.name.replace("@trymeka/", "");
          }
        }
        return "Config sanitized";
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/package.json",
        skip: (answer: object) => {
          if ("type" in answer && answer.type === "private") {
            return "Skipping public package.json for private package";
          }
          return;
        },
        templateFile: "templates/public-package.json.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/tsup.config.ts",
        skip: (answer: object) => {
          if ("type" in answer && answer.type === "private") {
            return "Skipping tsup.config.ts for private package";
          }
          return;
        },
        templateFile: "templates/tsup.config.ts.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/package.json",
        skip: (answer: object) => {
          if ("type" in answer && answer.type === "public") {
            return "Skipping private package.json for public package";
          }
          return;
        },
        templateFile: "templates/private-package.json.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/tsconfig.json",
        templateFile: "templates/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/src/index.ts",
        template: "export const name = '{{ name }}';",
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/package.json",
        async transform(content) {
          const grabPackageVersion = async (packageName: string) => {
            const version = await fetch(
              `https://registry.npmjs.org/-/package/${packageName}/dist-tags`,
            )
              .then(async (res) => {
                if (!res.ok) {
                  // For workspace packages, the fetch call will fail, so we return the workspace version
                  return { latest: "workspace:*" };
                }
                const result = await res.json();
                return result;
              })
              .then((json) => {
                return (json as { latest: string }).latest;
              });
            return version;
          };

          // Automatically update the package.json with the latest version of the dependencies
          const pkg = JSON.parse(content) as PackageJson;
          if (pkg.devDependencies) {
            for (const devDep of Object.keys(pkg.devDependencies)) {
              const version = await grabPackageVersion(devDep);
              if (version.startsWith("workspace:")) {
                pkg.devDependencies[devDep] = version;
              } else {
                pkg.devDependencies[devDep] = `^${version}`;
              }
            }
          }
          if (pkg.dependencies) {
            for (const dep of Object.keys(pkg.dependencies)) {
              const version = await grabPackageVersion(dep);
              if (version.startsWith("workspace:")) {
                pkg.dependencies[dep] = version;
              } else {
                pkg.dependencies[dep] = `^${version}`;
              }
            }
          }

          return JSON.stringify(pkg, null, 2);
        },
      },
      (answers) => {
        // Install deps and format everything
        if ("name" in answers && typeof answers.name === "string") {
          execSync("pnpm i", { stdio: "inherit" });
          execSync("pnpm run format", { stdio: "inherit" });
          execSync("pnpm run lint", { stdio: "inherit" });
          return "Package scaffolded";
        }
        return "Package not scaffolded";
      },
    ],
  });
}
