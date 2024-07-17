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

const checkIsSetMethod = async function (symbol: any, parentScopeStartPosition: vscode.Position | undefined) {

	if (symbol.name.includes('setMethod(')) {
		const match = symbol.name.match(/setMethod\('(\w+)'/);
		const methodName = match[1];

		let hoverData = await vscode.commands.executeCommand(
			'vscode.executeHoverProvider',
			vscode.window.activeTextEditor?.document.uri,
			symbol.location.range.start,
		);

		if ((hoverData as any).length === 0) {
			hoverData = await vscode.commands.executeCommand(
				'vscode.executeHoverProvider',
				vscode.window.activeTextEditor?.document.uri,
				{ line: symbol.location.range.start.line, character: symbol.location.range.start.character + 8 }
			);
		}

		if ((hoverData as any).length > 0) {
			const hoverText = (hoverData as any)[0].contents[0].value;
			const arr = hoverText.split('\n');
			const text = arr[2].split('(local function)')[1];
			const splitRes = symbol.name.split('.');

			if (splitRes.length === 1) {
				if (parentScopeStartPosition) {
					methodSet.add({
						text,
						position: symbol.location.range.start,
						name: methodName,
						variablePosition: parentScopeStartPosition
					});
				}

			} else {
				const variableName = splitRes[0];
				const variablePosition: Array<any> = await vscode.commands.executeCommand(
					'vscode.executeWorkspaceSymbolProvider',
					variableName
				);

				if (variablePosition.length > 0) {
					let targetVariableposition;
					for (const child of variablePosition) {
						if (child.name === variableName && child.kind === 12) {
							if (targetVariableposition) {
								if (Math.abs(child.location.range.start.line - symbol.location.range.start.line) < Math.abs(targetVariableposition.line - symbol.location.range.start.line)) {
									targetVariableposition = child.location.range.start;
								}
							} else {
								targetVariableposition = child.location.range.start;
							}
						}
					}

					methodSet.add({
						text,
						position: symbol.location.range.start,
						name: methodName,
						variablePosition: targetVariableposition
					});
				}
			}
		}

	}

	for (const child of (symbol.children as any)) {
		await checkIsSetMethod(child, symbol.range.start);
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
		await checkIsSetMethod(symbol, undefined);
	}

};

const refreshAllVisibleEditors = () => {
	vscode.window.visibleTextEditors
		.map((p) => p.document)
		.filter((p) => p !== null)
		.forEach((doc) => throttleScan(doc));
};

const generateCompletionItems = (position: vscode.Position, linePrefix: string) => {
	const completionItems = [];
	for (const data of methodSet) {
		const { line, character } = data.variablePosition;
		// console.log(line, position.line);

		if (line === position.line && character === position.character) {

			const completionItem = new vscode.CompletionItem(data.name, vscode.CompletionItemKind.Function);
			if (linePrefix[linePrefix.length - 1] === '(') {
				completionItem.insertText = new vscode.SnippetString(`\'${data.name}\'`);
			} else {
				completionItem.insertText = new vscode.SnippetString(data.name);
			}
			completionItems.push(completionItem);
		}
	}

	return completionItems;
};

const generatreSignature = (position: vscode.Position, methodName: string, linePrefix: string) => {
	for (const data of methodSet) {
		const { line, character } = data.variablePosition;
		if (
			data.name === methodName &&
			line === position.line &&
			character === position.character
		) {
			const { text } = data;
			const signature = new vscode.SignatureInformation(
				text,
				new vscode.MarkdownString('正在测试正在测试正在测试')
			);
			signature.label = text;

			const splitText = (text.split('):')[0]).split(',');
			splitText[0] = splitText[0].slice(1);

			const parameterInformationLis = [];
			let index = 1;
			for (const str of splitText) {
				parameterInformationLis.push(new vscode.ParameterInformation([index, index + str.length]));
				index += str.length + 1;
			}

			signature.parameters = parameterInformationLis;

			const parts = linePrefix.split(',');
			signature.activeParameter = parts.length - 1;


			const signatureHelp = new vscode.SignatureHelp();
			signatureHelp.signatures = [signature];

			return signatureHelp;
		}
	}
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

		if (!(linePrefix.endsWith('getMethod(') || linePrefix.endsWith("getMethod('"))) {
			return undefined;
		}

		const variablePosition: Array<any> = await vscode.commands.executeCommand(
			'vscode.executeDefinitionProvider',
			document.uri,
			{ line: position.line, character: linePrefix.indexOf('.') }
		);


		if (variablePosition.length === 0) {

			const variableName = linePrefix.split('.')[0];
			if (variableName.includes('this')) {
				let scopeLis: Array<any> = await vscode.commands.executeCommand(
					'vscode.executeDocumentSymbolProvider',
					vscode.window.activeTextEditor?.document.uri
				);


				let scope;

				while (scopeLis.length > 0) {
					let temp;
					for (const child of scopeLis) {
						if (child.range.start.line <= position.line && child.range.end.line >= position.line) {
							temp = child;
							break;
						}
					}
					if (temp) {
						scopeLis = temp.children;
						scope = temp;
					} else {
						break;
					}
				}

				if (scope) {
					if (scope.name.includes('.')) {
						const name = scope.name.split('.')[0]
						const variablePositionLis: Array<any> = await vscode.commands.executeCommand(
							'vscode.executeWorkspaceSymbolProvider',
							name
						);

						let variablePosition;
						for (const child of variablePositionLis) {

							if (child.name === name && child.kind === 12) {
								if (variablePosition) {
									if (Math.abs(child.location.range.start.line - position.line) < Math.abs(variablePosition.line - position.line)) {
										variablePosition = child.location.range.start;
									}
								} else {
									variablePosition = child.location.range.start;
								}
							}
						}

						if (variablePosition) {
							return generateCompletionItems(variablePosition, linePrefix);
						}
					} else {
						return generateCompletionItems(scope.range.start, linePrefix);
					}
				}
			}
		} else {
			return generateCompletionItems(variablePosition[0].targetSelectionRange.start, linePrefix);
		}
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

			if (variablePosition.length === 0) {

				const variableName = linePrefix.split('.')[0];
				if (variableName.includes('this')) {
					let scopeLis: Array<any> = await vscode.commands.executeCommand(
						'vscode.executeDocumentSymbolProvider',
						vscode.window.activeTextEditor?.document.uri
					);


					let scope;

					while (scopeLis.length > 0) {
						let temp;
						for (const child of scopeLis) {
							if (child.range.start.line <= position.line && child.range.end.line >= position.line) {
								temp = child;
								break;
							}
						}
						if (temp) {
							scopeLis = temp.children;
							scope = temp;
						} else {
							break;
						}
					}

					if (scope) {
						if (scope.name.includes('.')) {
							const name = scope.name.split('.')[0]
							const variablePositionLis: Array<any> = await vscode.commands.executeCommand(
								'vscode.executeWorkspaceSymbolProvider',
								name
							);

							let variablePosition;
							for (const child of variablePositionLis) {

								if (child.name === name && child.kind === 12) {
									if (variablePosition) {
										if (Math.abs(child.location.range.start.line - position.line) < Math.abs(variablePosition.line - position.line)) {
											variablePosition = child.location.range.start;
										}
									} else {
										variablePosition = child.location.range.start;
									}
								}
							}

							if (variablePosition) {
								return generatreSignature(variablePosition, methodName, linePrefix);
							}
						} else {
							return generatreSignature(scope.range.start, methodName, linePrefix);
						}
					}
				}
			} else {
				return generatreSignature(variablePosition[0].targetSelectionRange.start, methodName, linePrefix);
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
		"'",
		'('
	);
	const getMethodProviderTS = vscode.languages.registerCompletionItemProvider(
		'typescript',
		{
			provideCompletionItems: completion
		},
		"'",
		'('
	);

	const useMethodProviderJS = vscode.languages.registerSignatureHelpProvider(
		'javascript',
		{
			provideSignatureHelp: signature
		},
		',',
		'(',
	);
	const useMethodProviderTS = vscode.languages.registerSignatureHelpProvider(
		'typescript',
		{
			provideSignatureHelp: signature
		},
		',',
		'(',
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

						const variablePosition: Array<any> = await vscode.commands.executeCommand(
							'vscode.executeDefinitionProvider',
							document.uri,
							{ line: position.line, character: text.indexOf('.') }
						);

						if (variablePosition.length === 0) {
							return;
						}

						for (const data of methodSet) {
							const { line, character } = data.variablePosition;
							if (
								data.name === name &&
								line === variablePosition[0].targetSelectionRange.start.line &&
								character === variablePosition[0].targetSelectionRange.start.character
							) {
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

