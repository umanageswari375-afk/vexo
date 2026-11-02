# Vexo — AI project builder & code editor

Describe what you want to build. Vexo's AI agent writes the files, runs the
project in a browser sandbox and reports errors back to the agent so it can fix
them.

This repository is the **project code editor** only: a landing page, Firebase
authentication, a project dashboard and a full workspace with a file explorer,
Monaco code editor, terminal, live preview and AI agent chat.

## Features

- **AI agent** — describe a project and the agent plans, writes and edits files.
- **Explorer + editor** — file tree, tabs and syntax highlighting via Monaco.
- **Terminal** — `ls`, `cd`, `cat`, `tree`, `node`, `npm run dev`, `vexo <prompt>`.
- **Live preview** — runs HTML/CSS/JS and React projects in an isolated iframe.
- **Auto-fix** — preview and terminal errors are sent to the agent automatically.
- **Import / export** — bring files in, download a ZIP, restore history snapshots.

## Project structure

```
src/
  components/ui/        shadcn/ui primitives
  components/vexo/      CodeEditor, FileTree, Logo, PreviewPanel, TerminalPanel
  lib/
    auth.tsx            Firebase auth context (useAuth, signOutUser)
    firebase.ts         lazy Firebase app / auth / firestore init
    firebase-config.functions.ts  server function that hands the public web config to the browser
    projects.ts         Firestore CRUD for projects and history
    shell.ts            in-browser terminal command implementation
    vexo-engine.ts      agent output parser, file ops, preview builder, templates
  routes/
    index.tsx           landing page
    auth.tsx            sign in / sign up
    projects.tsx        project dashboard
    p/$id.tsx           workspace (editor + terminal + preview + agent)
    api/agent.ts        streaming server endpoint that talks to the AI
```

## Environment

Copy `.env.example` to `.env` and fill in the values:

| Variable                          | Used by                                        | Notes                                                                          |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `GOOGLE_API_KEY`                  | `firebase-config.functions.ts`                 | Firebase **web** API key (public identifier). Required for auth and Firestore. |
| `GOOGLE_ANALYTICS_MEASUREMENT_ID` | `firebase-config.functions.ts`                 | Optional, enables Firebase Analytics.                                          |
| `GEMINI_API_KEY`                  | `api/agent.ts`                                 | Server-side Google AI Studio key for the AI agent. Get one at https://aistudio.google.com/apikey. |
| `GEMINI_MODEL`                    | `api/agent.ts`                                 | Gemini model (default: `gemini-3.6-flash`).                                    |
| `GEMINI_TPM`                      | `api/agent.ts`                                 | Token budget for Gemini requests (default: 50000).                             |
| `LOVABLE_API_KEY`                 | `api/agent.ts`                                 | Server-side key for the AI agent. **Never** expose this in the browser.        |
| `DEEPSEEK_API_KEY`                | `api/agent.ts`                                 | DeepSeek API key for the AI agent. Get your key at https://platform.deepseek.com/ |
| `DEEPSEEK_MODEL`                  | `api/agent.ts`                                 | DeepSeek model to use (default: deepseek-chat)                                  |
| `DEEPSEEK_TPM`                    | `api/agent.ts`                                 | Tokens-per-minute limit for DeepSeek (default: 50000)                          |

Firebase client identifiers (`authDomain`, `projectId`, `storageBucket`,
`messagingSenderId`, `appId`) live in `src/lib/firebase-config.functions.ts` and
are served to the browser at runtime by a server function. Only the API key is
kept in the environment.

The AI agent uses `GEMINI_API_KEY` as its primary provider, then checks
`WIREFLOW_API_KEY`, `DEEPSEEK_API_KEY` and `LOVABLE_API_KEY`. Set the Gemini key
in your deployment environment (for example, Render's Environment settings);
keep it server-side and do not use the Firebase `GOOGLE_API_KEY` for Gemini.
`ADMIN_EMAIL`, `ADMIN_PASSWORD` and `PORT` are used by runtime authentication.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
npm i
npm run dev
```

Then open the printed local URL.

Other scripts:

```sh
npm run build     # production build
npm run preview   # preview a production build
npm run lint      # eslint (includes prettier)
npm run format    # prettier --write
```

## Firebase

Authentication and Firestore are wired up through `src/lib/firebase.ts` and
`src/lib/projects.ts`. Data is stored per user at
`users/{uid}/projects/{projectId}` with snapshots in `.../history`.

To use it you must:

1. Set `GOOGLE_API_KEY` in `.env`.
2. In Firebase project `vexo-b17a3`, enable the sign-in providers you want
   (Email/Password, Google, GitHub) under Authentication → Sign-in method.
3. Create a Firestore database and publish rules that let each user read and
   write only their own `users/{uid}` documents.
4. Add the deployment domain under Authentication → Settings → Authorized
   domains.

## Deploy

The build output in `.output/` can be previewed with `npm run preview` or
deployed with `npx nitro deploy --prebuilt`.

---

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/583d2232-d285-4e1a-8435-acf45d4bb180).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.
