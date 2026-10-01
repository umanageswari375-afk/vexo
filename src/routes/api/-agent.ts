import { createServerFn } from "@tanstack/react-start";
import { getAuthInstance } from "../lib/firebase";

export const agent = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("Invalid request");
    const d = data as Record<string, unknown>;
    if (!d.prompt || typeof d.prompt !== "string") throw new Error("Prompt required");
    if (!d.files || typeof d.files !== "object") throw new Error("Files required");
    if (!d.projectId || typeof d.projectId !== "string") throw new Error("Project ID required");
    return {
      prompt: d.prompt,
      files: d.files as Record<string, string>,
      projectId: d.projectId,
    };
  })
  .handler(async ({ data }) => {
    const auth = getAuthInstance();
    const user = auth.currentUser;
    if (!user) throw new Error("Unauthorized");

    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error("DEEPSEEK_API_KEY not configured");
    }

    const systemPrompt = `You are Vexo, an AI coding agent that helps users build web projects.
You have access to the current project files and can create, update, or delete files.

Current project files:
${Object.entries(data.files)
  .map(([path, content]) => `\`\`\`${path}\n${content}\n\`\`\``)
  .join("\n\n")}

When making changes, use these tags:
- <vexo-file path="path/to/file">content</vexo-file> - Create new file
- <vexo-update path="path/to/file">content</vexo-update> - Update existing file
- <vexo-delete path="path/to/file"></vexo-delete> - Delete file
- <vexo-command>command</vexo-command> - Run terminal command
- <vexo-done>message</vexo-done> - Signal completion with a summary message

Only output the tags. Do not include explanations outside the tags.`;

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.prompt },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${error}`);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  });