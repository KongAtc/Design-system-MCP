import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitRepositoryOptions } from "./git.js";

const execFileAsync = promisify(execFile);
const DEFAULT_DESIGN_SYSTEM_REPO_URL = "https://github.com/KongAtc/Design-Template.git";

export type DesignSystemRepositorySource = {
  repoPath: string;
  gitOptions: GitRepositoryOptions;
  description: string;
};

export async function resolveDesignSystemRepositorySource(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): Promise<DesignSystemRepositorySource> {
  if (env.DESIGN_SYSTEM_REPO) {
    return {
      repoPath: resolve(env.DESIGN_SYSTEM_REPO),
      gitOptions: {
        latestRef: env.DESIGN_SYSTEM_REPO_REF || "HEAD",
        fetchOnLatest: false
      },
      description: "local DESIGN_SYSTEM_REPO"
    };
  }

  const repoUrl = env.DESIGN_SYSTEM_REPO_URL || DEFAULT_DESIGN_SYSTEM_REPO_URL;
  const branchOrRef = env.DESIGN_SYSTEM_REPO_REF || "origin/HEAD";
  const repoPath = resolveCachePath(repoUrl, env.DESIGN_SYSTEM_REPO_CACHE);
  await ensureCachedRepository(repoUrl, repoPath);

  return {
    repoPath,
    gitOptions: {
      latestRef: normalizeRemoteLatestRef(branchOrRef),
      fetchOnLatest: true
    },
    description: env.DESIGN_SYSTEM_REPO_URL
      ? `cached DESIGN_SYSTEM_REPO_URL at ${repoPath}`
      : `cached default template repo at ${repoPath}`
  };
}

function resolveCachePath(repoUrl: string, configuredCache?: string): string {
  if (configuredCache) {
    return resolve(expandHome(configuredCache));
  }

  const repoName = sanitizeRepoName(repoUrl);
  const hash = createHash("sha1").update(repoUrl).digest("hex").slice(0, 10);
  return resolve(homedir(), ".cache", "design-system-mcp", `${repoName}-${hash}`);
}

async function ensureCachedRepository(repoUrl: string, repoPath: string): Promise<void> {
  if (existsSync(repoPath)) {
    if (!statSync(repoPath).isDirectory() || !existsSync(resolve(repoPath, ".git"))) {
      throw new Error(`DESIGN_SYSTEM_REPO_CACHE exists but is not a Git repository: ${repoPath}`);
    }
    return;
  }

  mkdirSync(dirname(repoPath), { recursive: true });
  await execGit(["clone", repoUrl, repoPath], process.cwd());
}

async function execGit(args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync("git", args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Git command failed: git ${args.join(" ")}\n${message}`);
  }
}

function normalizeRemoteLatestRef(ref: string): string {
  if (ref === "HEAD") {
    return "origin/HEAD";
  }

  if (ref.startsWith("origin/") || ref.startsWith("refs/") || /^[a-f0-9]{7,40}$/i.test(ref)) {
    return ref;
  }

  return `origin/${ref}`;
}

function sanitizeRepoName(repoUrl: string): string {
  const withoutQuery = repoUrl.split("?")[0] ?? repoUrl;
  const rawName = basename(withoutQuery).replace(/\.git$/, "") || "design-template";
  return rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }

  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }

  return path;
}
