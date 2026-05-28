import type { GitRepository, ResolvedRef } from "./git.js";
import {
  type ComponentContract,
  type ComponentEntry,
  type FlatToken,
  DesignSystemRepository,
  flattenTokens
} from "./design-system.js";

export type DriftSeverity = "BREAKING" | "SOFT" | "CLEAN";

type DriftItem = {
  severity: DriftSeverity;
  kind: "component" | "token";
  target: string;
  message: string;
  fromSha: string;
  toSha: string;
};

export class DesignSystemTools {
  private readonly designSystem: DesignSystemRepository;

  constructor(private readonly git: GitRepository) {
    this.designSystem = new DesignSystemRepository(git);
  }

  async searchComponents(intent: string, ref?: string) {
    const resolvedRef = await this.git.resolveRef(ref);
    const components = await this.designSystem.listComponents(resolvedRef);
    const terms = tokenize(intent);

    const matches = components
      .map((component) => ({
        name: component.name,
        description: component.metadata.description,
        score: scoreComponent(component, terms),
        sourcePath: component.sourcePath,
        contractPath: component.contractPath,
        metadataPath: component.metadataPath,
        ref: stamp(resolvedRef)
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

    return {
      ref: stamp(resolvedRef),
      intent,
      matches
    };
  }

  async getComponent(name: string, ref?: string) {
    const resolvedRef = await this.git.resolveRef(ref);
    const component = await this.designSystem.getComponent(resolvedRef, name);
    const source = await this.designSystem.getSource(resolvedRef, component.sourcePath);

    return {
      ref: stamp(resolvedRef),
      name: component.name,
      sourcePath: component.sourcePath,
      source,
      propsContract: component.contract,
      metadata: component.metadata
    };
  }

  async getDesignTokens(ref?: string) {
    const resolvedRef = await this.git.resolveRef(ref);
    const tokens = await this.designSystem.getTokens(resolvedRef);

    return {
      ref: stamp(resolvedRef),
      tokens
    };
  }

  async getProvenanceTemplate(options: {
    designSystem?: string;
    ref?: string;
    notes?: string;
  } = {}) {
    const resolvedRef = await this.git.resolveRef(options.ref);
    const designSystem = options.designSystem || "stack-design-system";

    return {
      ref: stamp(resolvedRef),
      fileName: "design-system.provenance.json",
      provenance: {
        designSystem,
        builtAgainst: resolvedRef.sha,
        builtAgainstCommitDate: resolvedRef.commitDate,
        generatedAt: new Date().toISOString(),
        notes:
          options.notes ||
          `Built using ${designSystem} via design-system-mcp. Validate with validate_usage before shipping.`
      }
    };
  }

  async listChanges(sinceRef: string) {
    const from = await this.git.resolveRef(sinceRef);
    const to = await this.git.resolveRef("latest");
    const commits = (await this.git.logBetween(from, to)).map((line) => {
      const [sha, commitDate, ...subject] = line.split("\t");
      return {
        sha,
        commitDate,
        subject: subject.join("\t")
      };
    });
    const files = (await this.git.diffNameStatus(from, to)).map((line) => {
      const [status, path] = line.split("\t");
      return { status, path };
    });

    return {
      from: stamp(from),
      to: stamp(to),
      commits,
      files
    };
  }

  async validateUsage(code: string, builtAgainst: string) {
    const from = await this.git.resolveRef(builtAgainst);
    const to = await this.git.resolveRef("latest");
    const [fromComponents, toComponents, fromTokens, toTokens] = await Promise.all([
      this.designSystem.listComponents(from),
      this.designSystem.listComponents(to),
      this.designSystem.getTokens(from),
      this.designSystem.getTokens(to)
    ]);

    const touchedComponents = findTouchedComponents(code, [
      ...new Set([...fromComponents, ...toComponents].map((component) => component.name))
    ]);
    const touchedTokens = findTouchedTokens(code, [
      ...this.designSystem.flattenTokens(fromTokens),
      ...this.designSystem.flattenTokens(toTokens)
    ]);
    const items: DriftItem[] = [];

    for (const componentName of touchedComponents) {
      const before = fromComponents.find((component) => component.name === componentName);
      const after = toComponents.find((component) => component.name === componentName);

      if (!before || !after) {
        items.push({
          severity: "BREAKING",
          kind: "component",
          target: componentName,
          message: `${componentName} is ${before ? "missing from latest" : "newer than the build ref"}; verify the import and usage.`,
          fromSha: from.sha,
          toSha: to.sha
        });
        continue;
      }

      items.push(...diffComponentUsage(code, before.contract, after.contract, from, to));
    }

    items.push(...diffTouchedTokens(touchedTokens, fromTokens, toTokens, from, to));

    const highestSeverity = items.some((item) => item.severity === "BREAKING")
      ? "BREAKING"
      : items.some((item) => item.severity === "SOFT")
        ? "SOFT"
        : "CLEAN";

    return {
      builtAgainst: stamp(from),
      latest: stamp(to),
      touched: {
        components: [...touchedComponents].sort(),
        tokens: [...touchedTokens].sort()
      },
      status: highestSeverity,
      items:
        items.length > 0
          ? items
          : [
              {
                severity: "CLEAN",
                kind: "component",
                target: "usage",
                message: "No drift detected for the components or tokens touched by this code.",
                fromSha: from.sha,
                toSha: to.sha
              } satisfies DriftItem
            ]
    };
  }
}

export function stamp(ref: ResolvedRef) {
  return {
    requestedRef: ref.requestedRef,
    sha: ref.sha,
    commitDate: ref.commitDate
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);
}

function scoreComponent(component: ComponentEntry, terms: string[]): number {
  const searchable = [
    component.name,
    component.metadata.description,
    component.metadata.accessibility.join(" "),
    component.metadata.usage.do.join(" "),
    component.metadata.usage.dont.join(" "),
    component.metadata.designTokensUsed.join(" "),
    Object.keys(component.contract.props).join(" "),
    JSON.stringify(component.metadata.variants)
  ].join(" ").toLowerCase();

  const exactNameScore = terms.includes(component.name.toLowerCase()) ? 20 : 0;
  return (
    exactNameScore +
    terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0)
  );
}

function findTouchedComponents(code: string, componentNames: string[]): Set<string> {
  return new Set(
    componentNames.filter((name) => {
      const jsxPattern = new RegExp(`<${escapeRegex(name)}(?:\\s|>|/)`);
      const importPattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
      return jsxPattern.test(code) || importPattern.test(code);
    })
  );
}

function diffComponentUsage(
  code: string,
  before: ComponentContract,
  after: ComponentContract,
  from: ResolvedRef,
  to: ResolvedRef
): DriftItem[] {
  const items: DriftItem[] = [];
  const usageBlocks = findJsxUsageBlocks(code, after.componentName);
  const beforeProps = before.props;
  const afterProps = after.props;

  for (const propName of Object.keys(beforeProps)) {
    if (!(propName in afterProps) && usageBlocks.some((block) => hasProp(block, propName))) {
      items.push({
        severity: "BREAKING",
        kind: "component",
        target: `${after.componentName}.${propName}`,
        message: `${after.componentName} removed prop \`${propName}\` by ${to.sha}; your usage still passes it.`,
        fromSha: from.sha,
        toSha: to.sha
      });
    }
  }

  for (const [propName, prop] of Object.entries(afterProps)) {
    const oldProp = beforeProps[propName];
    if (prop.required && (!oldProp || !oldProp.required)) {
      const missingCount = usageBlocks.filter((block) => !hasProp(block, propName)).length;
      if (missingCount > 0) {
        items.push({
          severity: "BREAKING",
          kind: "component",
          target: `${after.componentName}.${propName}`,
          message: `${after.componentName} gained required prop \`${propName}\` in ${to.sha}; ${missingCount} usage${missingCount === 1 ? "" : "s"} omit it.`,
          fromSha: from.sha,
          toSha: to.sha
        });
      }
    }

    if (oldProp && oldProp.type !== prop.type && usageBlocks.some((block) => hasProp(block, propName))) {
      items.push({
        severity: "BREAKING",
        kind: "component",
        target: `${after.componentName}.${propName}`,
        message: `${after.componentName} changed \`${propName}\` from \`${oldProp.type}\` to \`${prop.type}\`; review passed values.`,
        fromSha: from.sha,
        toSha: to.sha
      });
    }
  }

  return items;
}

function findTouchedTokens(code: string, tokens: FlatToken[]): Set<string> {
  return new Set(
    tokens
      .map((token) => token.path)
      .filter((path) => code.includes(path) || code.includes(cssVarName(path)))
  );
}

function diffTouchedTokens(
  touchedTokens: Set<string>,
  beforeTokens: Record<string, unknown>,
  afterTokens: Record<string, unknown>,
  from: ResolvedRef,
  to: ResolvedRef
): DriftItem[] {
  const before = new Map(flattenTokens(beforeTokens).map((token) => [token.path, token]));
  const after = new Map(flattenTokens(afterTokens).map((token) => [token.path, token]));
  const items: DriftItem[] = [];

  for (const tokenPath of touchedTokens) {
    const oldToken = before.get(tokenPath);
    const newToken = after.get(tokenPath);

    if (oldToken && !newToken) {
      items.push({
        severity: "BREAKING",
        kind: "token",
        target: tokenPath,
        message: `Token \`${tokenPath}\` was removed by ${to.sha}; replace this token before regenerating.`,
        fromSha: from.sha,
        toSha: to.sha
      });
      continue;
    }

    if (oldToken && newToken && JSON.stringify(oldToken.value) !== JSON.stringify(newToken.value)) {
      items.push({
        severity: "SOFT",
        kind: "token",
        target: tokenPath,
        message: `Token \`${tokenPath}\` changed value from \`${String(oldToken.value)}\` to \`${String(newToken.value)}\`; visual review recommended.`,
        fromSha: from.sha,
        toSha: to.sha
      });
    }
  }

  return items;
}

function findJsxUsageBlocks(code: string, componentName: string): string[] {
  const pattern = new RegExp(`<${escapeRegex(componentName)}\\b([^>]*)>`, "g");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code))) {
    blocks.push(match[1] ?? "");
  }

  return blocks;
}

function hasProp(attributes: string, propName: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegex(propName)}(?:\\s|=|$)`).test(attributes);
}

function cssVarName(tokenPath: string): string {
  return `--ds-${tokenPath.replace(/\./g, "-")}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
