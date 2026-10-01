import { createServerFn } from "@tanstack/react-start";
import { getAuthInstance } from "../lib/firebase";

export const terminal = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("Invalid request");
    const d = data as Record<string, unknown>;
    if (!d.command || typeof d.command !== "string") throw new Error("Command required");
    if (!d.projectId || typeof d.projectId !== "string") throw new Error("Project ID required");
    return { command: d.command, projectId: d.projectId };
  })
  .handler(async ({ data }) => {
    const auth = getAuthInstance();
    const user = auth.currentUser;
    if (!user) throw new Error("Unauthorized");

    const { command, projectId } = data;

    if (command === "help") {
      return {
        output: `Available commands:
  help          - Show this help
  ls [path]     - List files
  cd <path>     - Change directory
  cat <file>    - Show file contents
  tree          - Show directory tree
  npm <args>    - Run npm command
  node <file>   - Run Node.js file
  vexo <prompt> - Ask the AI agent`,
      };
    }

    if (command === "ls") {
      return { output: "File listing not implemented in server function" };
    }

    return { output: `Command not recognized: ${command}. Type 'help' for available commands.` };
  });