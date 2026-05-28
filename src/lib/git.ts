import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ResolvedRef = {
  requestedRef: string;
  sha: string;
  commitDate: string;
};

export type GitRepositoryOptions = {
  latestRef?: string;
  fetchOnLatest?: boolean;
};

export class GitRepository {
  constructor(
    private readonly cwd: string,
    private readonly options: GitRepositoryOptions = {}
  ) {}

  async resolveRef(ref?: string): Promise<ResolvedRef> {
    const requestedRef = ref?.trim() || "latest";
    if (requestedRef === "latest" && this.options.fetchOnLatest) {
      await this.fetch();
    }

    const gitRef = requestedRef === "latest" ? (this.options.latestRef ?? "HEAD") : requestedRef;
    const sha = await this.git(["rev-parse", `${gitRef}^{commit}`]);
    const commitDate = await this.git(["show", "-s", "--format=%cI", sha]);

    return {
      requestedRef,
      sha,
      commitDate
    };
  }

  async readFile(ref: ResolvedRef, path: string): Promise<string> {
    return this.git(["show", `${ref.sha}:${path}`], false);
  }

  async listFiles(ref: ResolvedRef): Promise<string[]> {
    const output = await this.git(["ls-tree", "-r", "--name-only", ref.sha]);
    return output.split("\n").filter(Boolean);
  }

  async diffNameStatus(from: ResolvedRef, to: ResolvedRef): Promise<string[]> {
    const output = await this.git(["diff", "--name-status", `${from.sha}..${to.sha}`]);
    return output.split("\n").filter(Boolean);
  }

  async logBetween(from: ResolvedRef, to: ResolvedRef): Promise<string[]> {
    const output = await this.git([
      "log",
      "--date=iso-strict",
      "--format=%H%x09%cI%x09%s",
      `${from.sha}..${to.sha}`
    ]);

    return output.split("\n").filter(Boolean);
  }

  async fetch(): Promise<void> {
    await this.git(["fetch", "--prune", "origin"]);
  }

  private async git(args: string[], trim = true): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.cwd,
        maxBuffer: 10 * 1024 * 1024
      });

      return trim ? stdout.trim() : stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Git command failed: git ${args.join(" ")}\n${message}`);
    }
  }
}
