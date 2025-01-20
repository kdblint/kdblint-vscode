import {
  InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  createConnection,
} from "vscode-languageserver/node";

const connection = createConnection(ProposedFeatures.all);

connection.onInitialize(() => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
      },
    },
  };
  return result;
});

connection.onInitialized(() => {
  console.log("initialized");
});

connection.listen();
