import {
  createStdioOptions,
  createUriConverters,
  startServer,
} from "@vscode/wasm-wasi-lsp";
import { ProcessOptions, Wasm } from "@vscode/wasm-wasi/v1";
import * as fs from "fs";
import * as path from "path";
import { ExtensionContext, Uri, commands, window, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node";

let client: LanguageClient;

const debug = process.env.VSCODE_DEBUG_MODE !== undefined;
const [os, arch] = getArch();
const useWasm = os === "wasi" && arch === "wasm32";

type OS = "linux" | "macos" | "windows" | "wasi";
type Arch = "x86_64" | "aarch64" | "wasm32";

function getArch(): [OS, Arch] {
  if (process.platform === "linux") {
    if (process.arch === "x64") return ["linux", "x86_64"];
  } else if (process.platform === "darwin") {
    if (process.arch === "arm64") return ["macos", "aarch64"];
  } else if (process.platform === "win32") {
    if (process.arch === "x64") return ["windows", "x86_64"];
  }
  return ["wasi", "wasm32"];
}

export async function activate(context: ExtensionContext) {
  const serverCommand = context.asAbsolutePath(getBin("kdblint"));

  const outputChannel = window.createOutputChannel("kdblint Language Server");
  const wasm = await Wasm.load();
  const serverOptions = !useWasm
    ? { command: serverCommand, args: ["lsp"] }
    : async () => {
        const options: ProcessOptions = {
          stdio: createStdioOptions(),
          mountPoints: [{ kind: "workspaceFolder" }],
          args: ["lsp"],
        };
        const bytes = await workspace.fs.readFile(Uri.parse(serverCommand));
        const module = await WebAssembly.compile(
          bytes as Uint8Array<ArrayBuffer>,
        );
        const process = await wasm.createProcess(
          "kdblint",
          module,
          { initial: 160, maximum: 160, shared: true },
          options,
        );

        const decoder = new TextDecoder("utf-8");
        process.stderr!.onData((data) => {
          outputChannel.append(decoder.decode(data));
        });

        return startServer(process);
      };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "k" },
      { scheme: "file", language: "q" },
    ],
    outputChannel,
    uriConverters: useWasm ? createUriConverters() : undefined,
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
  await client.dispose();
}

function getBin(bin: string): string {
  return path.join(
    "node_modules",
    "@kdblint",
    "kdblint",
    "zig-out",
    os,
    arch,
    bin + (useWasm ? ".wasm" : os === "windows" ? ".exe" : ""),
  );
}
