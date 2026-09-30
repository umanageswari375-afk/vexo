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
| `GOOGLE_API_KEY`                  | `firebase-config.functions.ts`, `api/agent.ts` | Firebase **web** API key (public identifier). Required for auth and Firestore. |
| `GOOGLE_ANALYTICS_MEASUREMENT_ID` | `firebase-config.functions.ts`                 | Optional, enables Firebase Analytics.                                          |
| `LOVABLE_API_KEY`                 | `api/agent.ts`                                 | Server-side key for the AI agent. **Never** expose this in the browser.        |

Firebase client identifiers (`authDomain`, `projectId`, `storageBucket`,
`messagingSenderId`, `appId`) live in `src/lib/firebase-config.functions.ts` and
are served to the browser at runtime by a server function. Only the API key is
kept in the environment.

`GROQ_API_KEY`, `GROQ_MODEL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `PORT` are not
read by any code in this project.

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
2. Enable the sign-in providers you want (Email/Password, Google) in the
   Firebase console under Authentication → Sign-in method.
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
