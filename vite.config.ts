import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isGitHubPagesBuild = process.env["GITHUB_PAGES"] === "true";
const isSupabaseStaticBuild = process.env["GITHUB_STATIC_SITE"] === "true";
const githubPagesBase = "/obsidian-dnd-master./";
const supabaseStaticBase = "/functions/v1/obsidian-app/";
const isStaticBuild = isGitHubPagesBuild || isSupabaseStaticBuild;
const appBase = isSupabaseStaticBuild ? supabaseStaticBase : githubPagesBase;

export default defineConfig({
  base: isStaticBuild ? appBase : "/",
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      ...(isStaticBuild
        ? { spa: { enabled: true }, router: { basepath: appBase.slice(0, -1) } }
        : {}),
    }),
    react(),
    nitro(),
  ],
});
