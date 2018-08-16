/* generic commands for sheerpower files */
'use strict';

import { commands,
    ExtensionContext,
    TextEditorRevealType,
    Range,
    Position,
    Selection,
    window, 
    Uri} from 'vscode';

import { client } from './extension';

export function commandsInitialize(context: ExtensionContext ) {
    console.log('sheerpower commands extension is active');

    let disp_fnline = commands.registerCommand('sheerpowerBasic.FindFunctionLine', async function () {
        await sheerpowerBasicFindFunctionLine();
    });
    context.subscriptions.push(disp_fnline);

    let disp_lninfn = commands.registerCommand('sheerpowerBasic.FindLineInFunction', async function () {
        await sheerpowerBasicFindLineInFunction();
    });
    context.subscriptions.push(disp_lninfn);

    let disp_reset = commands.registerCommand('sheerpowerBasic.resetCache', async function () {
        await sheerpowerResetCache();
    });
    context.subscriptions.push(disp_reset);

}

export declare class SymbolLocation {
    fileUri : string;
    position : Position;
    symbol : string;
}

// find function and line e.g. foobar_next.45
async function sheerpowerBasicFindFunctionLine() {
    if ( window.activeTextEditor == null || window.activeTextEditor.document.languageId != 'sheerpower-basic') {
        return;
    }

    let fileUri = window.activeTextEditor.document.uri.toString();

    window.showInputBox({prompt: 'Locate <function>.<line> number ?'})
        .then( async (val : string ) => {
            if ( val ) {
                let FnAndLine = val;

                var results = await client.sendRequest( "sheerpowerBasicServer.FindFunctionAndLine", [[fileUri, FnAndLine]] )  as SymbolLocation;
                if ( !results ){
                    window.showErrorMessage("Unable to locate: " + FnAndLine);
                    return;
                }

                // start of line, no select
                MoveCursorToSymbolLine( results.fileUri,
                    new Position( results.position.line, 0 ), 
                    0 );
            }
        });
}

// find a line offset in the current function
async function sheerpowerBasicFindLineInFunction() {
    if ( window.activeTextEditor == null || window.activeTextEditor.document.languageId != 'sheerpower-basic') {
        return;
    }

    let fileUri = window.activeTextEditor.document.uri.toString();
    let currentPos = window.activeTextEditor.selection.start;

    window.showInputBox({prompt: 'Goto <Line Offset> in Current Function ?'})
        .then( async (val : string ) => {
            if ( val ) {
                let LineOffset = val;

                var results = await client.sendRequest( "sheerpowerBasicServer.FindLineInFunction",
                    [[fileUri, currentPos, LineOffset]] ) as SymbolLocation;
                if ( !results ){
                    window.showErrorMessage("Unable to locate current function");
                    return;
                }
            
                // start of line, no select
                MoveCursorToSymbolLine( results.fileUri,
                    new Position( results.position.line, 0 ), 
                    0 );
            }
        });
}

export function MoveCursorToSymbolLine( fileUri : string, pos : Position, length: number ) : void {
    var options = { preserveFocus: false, preview: true };

    window.showTextDocument( Uri.parse( fileUri ), options )
    .then( editor => {
        var startPos : Position = pos;
        var endPos : Position = startPos.translate( 0, length );

        var newSelection = new Selection(startPos, endPos);
        editor.selection = newSelection;

        editor.revealRange( new Range(
            Math.max(newSelection.active.line - 10, 0),
            newSelection.active.character,
            newSelection.active.line + 10,
            newSelection.active.character),
            TextEditorRevealType.InCenterIfOutsideViewport
        );
    });
}

async function sheerpowerResetCache() {
    // call the server...
    await client.sendRequest( "sheerpowerBasicServer.resetCache", [[]] );
}