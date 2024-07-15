// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


interface methodData {
	text: string,
	name: string,
	position: vscode.Position,
	variablePosition: vscode.Position
}

let methodSet: Set<methodData> = new Set();
let throttleIds: any = {};

const checkIsSetMethod = async function (symbol: any) {

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



			const variableName = symbol.name.split('.')[0];
			const variablePosition: Array<any> = await vscode.commands.executeCommand(
				'vscode.executeWorkspaceSymbolProvider',
				variableName
			);

			if (variablePosition.length > 0) {
				methodSet.add({
					text,
					position: symbol.location.range.start,
					name: methodName,
					variablePosition: variablePosition[0].location.range.start
				});
			}
		}
	}

	for (const child of (symbol.children as any)) {
		await checkIsSetMethod(child);
	}
};

const scan = async (document: vscode.TextDocument) => {
	methodSet.clear();

	// 进行setMethod设置的方法名 和 对应函数的签名provider的绑定
	const docSymbols = await vscode.commands.executeCommand(
		'vscode.executeDocumentSymbolProvider',
		vscode.window.activeTextEditor?.document.uri
	);

	const arr = (docSymbols as any).filter((symbol: vscode.SymbolInformation) => symbol.kind === vscode.SymbolKind.Function);

	for (const symbol of arr) {
		await checkIsSetMethod(symbol);
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


	const completion = async function (document: vscode.TextDocument, position: vscode.Position) {

		const linePrefix = document.lineAt(position).text.slice(0, position.character);

		if (!linePrefix.endsWith('getMethod(')) {
			return undefined;
		}

		const variablePosition: Array<any> = await vscode.commands.executeCommand(
			'vscode.executeDefinitionProvider',
			document.uri,
			{ line: position.line, character: linePrefix.indexOf('.') }
		);

		const completionItems = [];

		for (const data of methodSet) {
			const { line, character } = data.variablePosition;
			if (line === variablePosition[0].targetSelectionRange.start.line && character === variablePosition[0].targetSelectionRange.start.character) {
				const completionItem = new vscode.CompletionItem(data.name, vscode.CompletionItemKind.Function);
				completionItem.insertText = new vscode.SnippetString(`\'${data.name}\'`);
				completionItems.push(completionItem);
			}
		}

		return completionItems;
	};

	const signature = async function (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.SignatureHelpContext) {
		const linePrefix = document.lineAt(position).text.slice(0, position.character);

		const match = linePrefix.match(/getMethod\('(\w+)'\)\(/);

		if (match) {
			const methodName = match[1];


			const variablePosition: Array<any> = await vscode.commands.executeCommand(
				'vscode.executeDefinitionProvider',
				document.uri,
				{ line: position.line, character: linePrefix.indexOf('.') }
			);

			for (const data of methodSet) {
				const { line, character } = data.variablePosition;
				if (
					data.name === methodName &&
					line === variablePosition[0].targetSelectionRange.start.line &&
					character === variablePosition[0].targetSelectionRange.start.character
				) {
					const { text } = data;
					const signature = new vscode.SignatureInformation(
						text,
						new vscode.MarkdownString('正在测试正在测试正在测试')
					);
					signature.label = text;

					const splitText = (text.split(')')[0]).split(',');

					const parameterInformationLis = [];
					let index = 1;
					for (const str of splitText) {
						parameterInformationLis.push(new vscode.ParameterInformation([index, index + str.length + (str[0] === '(' ? -1 : 0)]));
						index += str.length;
					}

					signature.parameters = parameterInformationLis;

					const parts = linePrefix.split(',');
					signature.activeParameter = parts.length - 1;


					const signatureHelp = new vscode.SignatureHelp();
					signatureHelp.signatures = [signature];

					return signatureHelp;
				}
			}


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
		'(',  // triggered whenever a '(' is being typed
	);
	const useMethodProviderTS = vscode.languages.registerSignatureHelpProvider(
		'typescript',
		{
			provideSignatureHelp: signature
		},
		'(', // triggered whenever a '(' is being typed
	);

	const goToDefinition = vscode.languages.registerDefinitionProvider(
		'javascript',
		{
			provideDefinition: async (document, position, token) => {
				const { text } = document.lineAt(position);
				const match = text.match(/getMethod\('(\w+)'/);

				if (match) {
					const name = match[1];
					const characterIndex = text.indexOf(name);

					if (position.character >= characterIndex && position.character <= characterIndex + name.length) {
						for (const data of methodSet) {
							if (data.name === name) {
								return new vscode.Location(
									document.uri,
									data.position
								);
							}
						}

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

