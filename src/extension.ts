// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


interface methodData {
	text: string,
	position: vscode.Position
}

let methodSet: { [key: string]: methodData } = {};
let throttleIds: any = {};

const scan = async (document: vscode.TextDocument) => {
	methodSet = {};

	// 进行setMethod设置的方法名 和 对应函数的签名provider的帮顶
	const docSymbols = await vscode.commands.executeCommand(
		'vscode.executeDocumentSymbolProvider',
		vscode.window.activeTextEditor?.document.uri
	);

	const a = await vscode.commands.executeCommand(
		'vscode.executeWorkspaceSymbolProvider',
		'func2'
	);


	const arr = (docSymbols as any).filter((symbol: vscode.SymbolInformation) => symbol.kind === vscode.SymbolKind.Function);

	for (const symbol of arr) {
		if (symbol.name.includes('setMethod(')) {
			const match = symbol.name.match(/setMethod\('(\w+)'/);
			const methodName = match[1];

			const hoverData = await vscode.commands.executeCommand(
				'vscode.executeHoverProvider',
				vscode.window.activeTextEditor?.document.uri,
				symbol.location.range.start,
			);
			if ((hoverData as any).length > 0) {
				const hoverText = (hoverData as any)[0].contents[0].value;
				const arr = hoverText.split('\n');
				const text = arr[2].split('(local function)')[1];

				methodSet[methodName] = {
					text,
					position: symbol.location.range.start
				};
			}
		}
	}
};

const refreshAllVisibleEditors = () => {
	vscode.window.visibleTextEditors
		.map((p) => p.document)
		.filter((p) => p !== null)
		.forEach((doc) => throttleScan(doc));
};


let throttleScan = (document: vscode.TextDocument, timeout: number = 300) => {
	if (document && document.uri) {
		const lookupKey = document.uri.toString();
		if (throttleIds[lookupKey]) {
			clearTimeout(throttleIds[lookupKey]);
		};
		throttleIds[lookupKey] = setTimeout(async () => {
			await scan(document);
			delete throttleIds[lookupKey];
		}, timeout);
	}
};

export function activate(context: vscode.ExtensionContext) {


	const completion = function (document: vscode.TextDocument, position: vscode.Position) {
		const linePrefix = document.lineAt(position).text.slice(0, position.character);

		if (!linePrefix.endsWith('getMethod(')) {
			return undefined;
		}

		const completionItems = [];

		const names = Object.keys(methodSet);
		for (const name of names) {
			const completionItem = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
			completionItem.insertText = new vscode.SnippetString(`\'${name}\'`);
			completionItems.push(completionItem);
		}

		return completionItems;
	};

	const signature = function (document: vscode.TextDocument, position: vscode.Position) {
		const linePrefix = document.lineAt(position).text.slice(0, position.character);

		const match = linePrefix.match(/getMethod\('(\w+)'\)\(/);

		if (match) {
			const methodName = match[1];

			const { text } = methodSet[methodName];
			const signature = new vscode.SignatureInformation(
				text,
				new vscode.MarkdownString('正在测试正在测试正在测试')
			);
			signature.label = text;
			signature.activeParameter = 0;
			signature.parameters = [
				new vscode.ParameterInformation('param1', 'The first parameter'),
				new vscode.ParameterInformation('param2', 'The second parameter'),
			];

			const signatureHelp = new vscode.SignatureHelp();
			signatureHelp.signatures = [signature];

			return signatureHelp;
		} else {
			return undefined;
		}
	};

	// demo: https://github.com/microsoft/vscode-extension-samples/blob/main/completions-sample/src/extension.ts
	const getMethodProviderJS = vscode.languages.registerCompletionItemProvider(
		'javascript',
		{
			provideCompletionItems: completion
		},
		'(' // triggered whenever a '(' is being typed
	);
	const getMethodProviderTS = vscode.languages.registerCompletionItemProvider(
		'typescript',
		{
			provideCompletionItems: completion
		},
		'(' // triggered whenever a '(' is being typed
	);

	const useMethodProviderJS = vscode.languages.registerSignatureHelpProvider(
		'javascript',
		{
			provideSignatureHelp: signature
		},
		'(' // triggered whenever a '(' is being typed
	);
	const useMethodProviderTS = vscode.languages.registerSignatureHelpProvider(
		'typescript',
		{
			provideSignatureHelp: signature
		},
		'(' // triggered whenever a '(' is being typed
	);

	const goToDefinition = vscode.languages.registerDefinitionProvider(
		'javascript',
		{
			provideDefinition: async (document, position, token) => {
				const { text } = document.lineAt(position);
				const match = text.match(/getMethod\('(\w+)'/);
				if (match) {
					const methodData = methodSet[match[1]];
					if (methodData) {
						return new vscode.Location(
							document.uri,
							methodData.position
						);
					}
				}
				return undefined;
			}
		}
	);



	context.subscriptions.push(getMethodProviderJS, getMethodProviderTS, useMethodProviderJS, useMethodProviderTS, goToDefinition);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(async (e) => {
			if (e) {
				throttleScan(e.document);
			}
		}),
	);
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((e) => {
			if (e) {
				throttleScan(e.document);
			}
		}),
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			refreshAllVisibleEditors();
		}),
	);
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
			if (event && event.textEditor && event.textEditor.document) {
				const document = event.textEditor.document;
				throttleScan(document, 50);
			}
		}),
	);
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((e) => {
			if (e) {
				throttleScan(e);
			}
		}),
	);

}

// This method is called when your extension is deactivated
export function deactivate() { }

