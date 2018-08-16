/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	TextDocumentPositionParams,
	Hover,
	Definition,
	DocumentSymbolParams,
	SymbolInformation,
	WorkspaceSymbolParams,
	DidChangeWatchedFilesParams
} from 'vscode-languageserver';

import { signatureTextContentChanged,
	 signatureGetCodeCompletion,
	 signatureGetCodeCompletionResolve,
	signatureGetHover,
	signatureGetDocumentSymbols,
	signatureGetWorkspaceSymbols,
	signatureGetDefinition, 
	signatureFindFunctionAndLine,
	signatureFindLineInCurrentFunction,
	SymbolLocation,
	signatureGetSymbolsForFile,
	signatureGetIncludesForFile,
	IncludeFile,
	signatureWatchedFileChanged,
	signatureResetCache} from './signature';
import { toFilenameFromUri } from './utilities';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
export let connection = createConnection(ProposedFeatures.all);

connection.console.log('server started');

// Create a simple text document manager. The text document manager
// supports full document sync only
export let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	connection.console.log('server.onInitialize called');

	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability =
		capabilities.workspace && !!capabilities.workspace.configuration;
	hasWorkspaceFolderCapability =
		capabilities.workspace && !!capabilities.workspace.workspaceFolders;
	hasDiagnosticRelatedInformationCapability =
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation;

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true
			},
			hoverProvider: true,
			definitionProvider: true,
			documentSymbolProvider: true,
			workspaceSymbolProvider: true
		}
	};
});

connection.onInitialized(() => {
	connection.console.log('server.onInitialized called');

	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
export interface SheerpowerBasicSettings {
	maxNumberOfProblems: number;
	recursiveParseFiles : boolean;
	defaultIncludesExtensionsAsSpinc : boolean;
	skipFirstTwoLinesOfCommentBlock: boolean;
	maxCodeCompletionItems : number;
	recursiveSearchForRoutines : boolean;
	recursiveSearchForRoutinesByRootSpsrc: boolean;
	maxFileSizeToParse: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: SheerpowerBasicSettings = {
	maxNumberOfProblems: 100,
	recursiveParseFiles: true,
	defaultIncludesExtensionsAsSpinc: true,
	skipFirstTwoLinesOfCommentBlock: true,
	maxCodeCompletionItems: 50,
	recursiveSearchForRoutines: true,
	recursiveSearchForRoutinesByRootSpsrc: true,
	maxFileSizeToParse: 2000000
 };

let globalSettings: SheerpowerBasicSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<SheerpowerBasicSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	connection.console.log('server.onDidChangeConfiguration called');

	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <SheerpowerBasicSettings>(
			(change.settings.sheerpowerBasic || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

export function getDocumentSettings(resource: string): Thenable<SheerpowerBasicSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'sheerpowerBasic'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	connection.console.log('server.onDidClose called for ' + e.document.uri);
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	//validateTextDocument(change.document);
	// TODO: we should be able to choose when to do this parsing....
	// TODO: reparsing on each change in bad idea...
	triggerParser(change.document);
	//signatureTextContentChanged(change.document);
});

// the map is based on the document uri, so that when you switch documents,
// we will still go on and parse the one you edited after 3 seconds
let parserTriggers : Map<string, NodeJS.Timer> = new Map<string,NodeJS.Timer>();
function triggerParser( doc : TextDocument ) {
	let Handle = parserTriggers.get( doc.uri );
	if ( Handle ) {
		// already a timeout, clear it, and rebuild it.
		clearTimeout( Handle );
	}

	// new timeout, 3 seconds from now...
	Handle = setTimeout( function () {
		parserTriggeredCallback( doc );
	}, 3000);
	parserTriggers.set(doc.uri, Handle);
}

function parserTriggeredCallback( doc : TextDocument ) {
	let Handle = parserTriggers.get( doc.uri );
	if ( Handle ) {
		clearTimeout( Handle );
	}
	parserTriggers.set( doc.uri, null );

	signatureTextContentChanged(doc);
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	connection.console.log('server.validateTextDocument called');

	// In this simple example we get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	let text = textDocument.getText();
	let pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		let diagnosic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnosic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnosic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnosic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnosic);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles( async (_change : DidChangeWatchedFilesParams ) => {
	// for each file ...
	for ( var entry of _change.changes ) {
		let filename = toFilenameFromUri( entry.uri ).toLowerCase();

		// as we track all changes in the workspace folder, we filter it here for just sheerpower extensions.
		if ( !filename.endsWith( ".spsrc") && !filename.endsWith(".spinc")) {
			continue;
		}

		await signatureWatchedFileChanged( entry );
	}
	
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion( 
	( _textDocumentPosition: TextDocumentPositionParams): Thenable<CompletionItem[]> => {
		return signatureGetCodeCompletion( _textDocumentPosition );
	}
);

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		signatureGetCodeCompletionResolve( item );
		return item;
	}
);

connection.onHover(
	(_textDocumentPosition : TextDocumentPositionParams) : Thenable<Hover> => {
		return signatureGetHover( _textDocumentPosition );
	}
);

connection.onDefinition( 
	( _textDocumentPosition : TextDocumentPositionParams) : Thenable<Definition> => {
		return signatureGetDefinition( _textDocumentPosition );
	}
)

connection.onDocumentSymbol(
	( docSymbols : DocumentSymbolParams ) : Thenable<SymbolInformation[]> => {
		return signatureGetDocumentSymbols( docSymbols );
	}
)

connection.onWorkspaceSymbol(
	( wkspaceSymbols : WorkspaceSymbolParams ) : Thenable<SymbolInformation[]> => {
		return signatureGetWorkspaceSymbols( wkspaceSymbols );
	}
)

connection.onRequest( "sheerpowerBasicServer.FindFunctionAndLine", ( args: string [] ) : Thenable<SymbolLocation> => {
	connection.console.log("sheerpowerBasicServer.FindFunctionAndLine called");
	return signatureFindFunctionAndLine( args );
});

connection.onRequest( "sheerpowerBasicServer.FindLineInFunction", ( args: any [] ) : SymbolLocation => {
	connection.console.log("sheerpowerBasicServer.FindFunctionAndLine called");
	return signatureFindLineInCurrentFunction( args );
});

connection.onRequest( "sheerpowerBasicServer.GetSymbolsInFile", ( args: string [] ) : SymbolLocation [] => {
	connection.console.log("sheerpowerBasicServer.GetSymbolsInFile called");
	return signatureGetSymbolsForFile( args );
});

connection.onRequest( "sheerpowerBasicServer.GetIncludesInFile", ( args: string [] ) : IncludeFile [] => {
	connection.console.log("sheerpowerBasicServer.GetIncludesInFile called");
	return signatureGetIncludesForFile( args );
});

connection.onRequest( "sheerpowerBasicServer.ResetCache", () : Thenable<void> => {
	connection.console.log("sheerpowerBasicServer.ResetCache called");
	return signatureResetCache();
});

/*connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
}); */

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

// to call from server back to client https://stackoverflow.com/questions/51041337/vscode-language-client-extension-how-to-send-a-message-from-the-server-to-the
