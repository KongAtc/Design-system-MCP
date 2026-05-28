import type { GitRepository, ResolvedRef } from "./git.js";

export type ComponentMetadata = {
  name: string;
  description: string;
  variants: Array<Record<string, unknown>>;
  designTokensUsed: string[];
  accessibility: string[];
  usage: {
    do: string[];
    dont: string[];
  };
  examples: Array<{
    title: string;
    code: string;
  }>;
};

export type ComponentContract = {
  componentName: string;
  source: string;
  props: Record<
    string,
    {
      name: string;
      type: string;
      required: boolean;
      description: string;
      defaultValue: string | null;
    }
  >;
};

export type ComponentEntry = {
  name: string;
  metadataPath: string;
  contractPath: string;
  sourcePath: string;
  metadata: ComponentMetadata;
  contract: ComponentContract;
};

export type FlatToken = {
  path: string;
  type: string | null;
  value: unknown;
  description?: string;
};

export class DesignSystemRepository {
  constructor(private readonly git: GitRepository) {}

  async listComponents(ref: ResolvedRef): Promise<ComponentEntry[]> {
    const files = await this.git.listFiles(ref);
    const metadataPaths = files.filter((file) => file.endsWith(".metadata.json"));

    return Promise.all(metadataPaths.map((metadataPath) => this.readComponentEntry(ref, metadataPath)));
  }

  async getComponent(ref: ResolvedRef, name: string): Promise<ComponentEntry> {
    const components = await this.listComponents(ref);
    const component = components.find(
      (entry) => entry.name.toLowerCase() === name.toLowerCase()
    );

    if (!component) {
      throw new Error(`Component "${name}" was not found at ${ref.sha}.`);
    }

    return component;
  }

  async getTokens(ref: ResolvedRef): Promise<Record<string, unknown>> {
    return this.readJson<Record<string, unknown>>(ref, "tokens.json");
  }

  async getSource(ref: ResolvedRef, path: string): Promise<string> {
    return this.git.readFile(ref, path);
  }

  async readJson<T>(ref: ResolvedRef, path: string): Promise<T> {
    return JSON.parse(await this.git.readFile(ref, path)) as T;
  }

  flattenTokens(tokens: Record<string, unknown>): FlatToken[] {
    return flattenTokens(tokens);
  }

  private async readComponentEntry(ref: ResolvedRef, metadataPath: string): Promise<ComponentEntry> {
    const metadata = await this.readJson<ComponentMetadata>(ref, metadataPath);
    const directory = metadataPath.slice(0, metadataPath.lastIndexOf("/"));
    const contractPath = `${directory}/${metadata.name}.contract.json`;
    const sourcePath = `${directory}/${metadata.name}.tsx`;
    const contract = await this.readJson<ComponentContract>(ref, contractPath);

    return {
      name: metadata.name,
      metadataPath,
      contractPath,
      sourcePath,
      metadata,
      contract
    };
  }
}

export function flattenTokens(tokens: Record<string, unknown>): FlatToken[] {
  const flattened: FlatToken[] = [];

  function visit(value: unknown, path: string[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }

    const record = value as Record<string, unknown>;
    if ("value" in record) {
      flattened.push({
        path: path.join("."),
        type: typeof record.type === "string" ? record.type : null,
        value: record.value,
        description: typeof record.description === "string" ? record.description : undefined
      });
      return;
    }

    for (const [key, child] of Object.entries(record)) {
      if (key !== "$schema") {
        visit(child, [...path, key]);
      }
    }
  }

  visit(tokens, []);
  return flattened;
}
