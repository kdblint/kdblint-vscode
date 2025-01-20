import camelCase from "camelcase";
import * as fs from "fs";
import * as path from "path";
import { ExtensionContext, commands, window, workspace } from "vscode";

import {
  CancellationToken,
  ConfigurationParams,
  LSPAny,
  LanguageClient,
  LanguageClientOptions,
  RequestHandler,
  ResponseError,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient;

const debug = process.env.VSCODE_DEBUG_MODE !== undefined;

const platform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : process.platform === "linux"
        ? "linux"
        : undefined;

const arch =
  process.arch === "x64"
    ? "x86_64"
    : process.arch === "arm64"
      ? "aarch64"
      : undefined;

export async function activate(context: ExtensionContext) {
  if (!platform) {
    await window.showErrorMessage(
      `Unsupported operating system platform: ${process.platform}.`,
    );
    return;
  }

  if (!arch) {
    await window.showErrorMessage(
      `Unsupported CPU architecture: ${process.arch}.`,
    );
    return;
  }

  const serverCommand = context.asAbsolutePath(getBin("kdblint"));
  const serverOptions: ServerOptions = {
    run: { command: serverCommand, args: ["lsp"] },
    debug: { command: serverCommand, args: ["lsp"] },
  };

  const outputChannel = window.createOutputChannel("kdblint Language Server");

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "k" },
      { scheme: "file", language: "q" },
    ],
    outputChannel,
    middleware: {
      workspace: {
        configuration: configurationMiddleware,
      },
    },
  };

  client = new LanguageClient(
    "kdblint",
    "kdblint Language Server",
    serverOptions,
    clientOptions,
  );

  if (debug) {
    const debugBin = context.asAbsolutePath(getBin("kdblint.Debug"));
    if (fs.existsSync(debugBin)) {
      fs.renameSync(debugBin, serverCommand);
    }
    const interval = setInterval(() => {
      if (fs.existsSync(debugBin)) {
        clearInterval(interval);
        void commands.executeCommand("workbench.action.reloadWindow");
      }
    }, 100);
  }

  await client.start();
}

export async function deactivate() {
  if (!client) {
    return undefined;
  }

  await client.stop();
}

function getBin(bin: string): string {
  return path.join(
    "node_modules",
    "@kdblint",
    "kdblint",
    "dist",
    platform!,
    arch!,
    bin + (platform === "windows" ? ".exe" : ""),
  );
}

async function configurationMiddleware(
  params: ConfigurationParams,
  token: CancellationToken,
  next: RequestHandler<ConfigurationParams, LSPAny[], void>,
): Promise<LSPAny[] | ResponseError> {
  const optionIndices: Record<string, number | undefined> = {};

  params.items.forEach((param, index) => {
    if (param.section) {
      param.section = `kdblint.${camelCase(param.section.slice("kdblint.".length))}`;
      optionIndices[param.section] = index;
    }
  });

  const result = await next(params, token);
  if (result instanceof ResponseError) {
    return result;
  }

  const configuration = workspace.getConfiguration("kdblint");

  for (const name in optionIndices) {
    const index = optionIndices[name]!;
    const section = name.slice("kdblint.".length);
    const configValue = configuration.get(section);
    if (typeof configValue === "string" && configValue) {
      result[index] = configValue;
    }
  }

  return result as unknown[];
}
