// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const build = require('./build');
const includes = require('./includes');
const routines = require('./routines.js');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('sheerpower test extension is active');

    // build functions
    build.buildInitialize(context);
    build.tasksInitialize(context);

    // includes view
    includes.includesInitialize(context);   
    // routines view
    routines.routinesInitialize(context); 

    let disp_findline = vscode.commands.registerCommand('sheerpower.sheerpowerFindFunctionLine', function () {
        sheerpowerFindFunctionLine();
    });
    context.subscriptions.push(disp_findline);

    let disp_findlineinroutine = vscode.commands.registerCommand('sheerpower.sheerpowerFindLineInFunction', function () {
        sheerpowerFindLineInFunction();
    });
    context.subscriptions.push(disp_findlineinroutine);
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}

exports.deactivate = deactivate;

// find a routine and line number common in error report files
function sheerpowerFindFunctionLine() {
    vscode.window.showInputBox({prompt: 'Locate Function:line number ?'})
    .then(val => MoveCursorToFunctionLine(val));
}

// pattern for finding where routines are in the source file. not perfect but will do
var functionPattern = /\s*(routine)(?=\s+)(.*)/gi;

// once we have the function we are told, then find it
function MoveCursorToFunctionLine( value ) {
    var editor = vscode.window.activeTextEditor;
    var doc = editor.document;
    var textBuffer = doc.getText();

    var routine = value.split(':');

    var results = null;

    functionPattern.lastIndex = 0;

    // use the regex to find routine tags..
    do
    {
        // keep searching because of the go flag
        results = functionPattern.exec( textBuffer );
        if ( results && results.length > 0 ) {
            var bits = results[2].trim().split(' ');

            // does it match the identifier we were passed ?
            if ( bits[0] === routine[0] ) {
                var location = results.index;
                location = textBuffer.indexOf( bits[0], location );

                // then move the cursor to results.index and count lines...
                var newStartPosition = doc.positionAt( location );

               //  console.log( "routine start at line: " + newStartPosition.line );
                var newEndPosition = newStartPosition.translate( 0, bits[0].length );

                var newSelection = new vscode.Selection(newStartPosition, newEndPosition);

                if ( routine.length > 1 ) {
                    // now count down the number of lines...
                    var lineOffset = parseInt(routine[1]);
                    if ( lineOffset ) {
                        var newCursorPosition = new vscode.Position( newStartPosition.line + lineOffset, 0);
                        newSelection = new vscode.Selection(newCursorPosition, newCursorPosition);
                        editor.selection = newSelection;

                        editor.revealRange( new vscode.Range(
                            Math.max(newSelection.active.line - 10, 0),
                            newSelection.active.character,
                            newSelection.active.line + 10,
                            newSelection.active.character),
                            vscode.TextEditorRevealType.InCenterIfOutsideViewport
                        );

                        console.log( "new position set to line: " + newCursorPosition.line );
                    }
                }
                else {
                    // if no line number, then do the routine
                    editor.selection = newSelection;
                    editor.revealRange( new vscode.Range(
                        Math.max(newSelection.active.line - 10, 0),
                        newSelection.active.character,
                        newSelection.active.line + 10,
                        newSelection.active.character),
                        vscode.TextEditorRevealType.InCenterIfOutsideViewport
                    );    
                }

                return;
            }
        }
    }
    while ( results );

    vscode.window.showErrorMessage("unable to find: " + value );
}

// find a line number within the current function
function sheerpowerFindLineInFunction() {
    var routineName = getRoutineName();

    if ( !routineName ) {
        vscode.showErrorMessage("you are not on the start of a routine or in a routine");
        return;
    }

    // use the routine above to do the work...
    vscode.window.showInputBox({prompt: 'Routine: ' + routineName + ' Locate line number ?'})
    .then(val => MoveCursorToFunctionLine(routineName + ':' + val));
}


function getRoutineName( ) {
    // if we are on a line that has routine in it, use it
    // otherwise, go backwards till we find one
    var editor = vscode.window.activeTextEditor;
    var doc = editor.document;

    // current active pos in the editor...
    var currentPosition = editor.selection.active;

    // go backwards to find a match
    var lineNumber = currentPosition.line;
    while( lineNumber >= 0 )
    {
        var currentLineRange = new vscode.Range( currentPosition.line, 0, currentPosition.line, 500 );
        var lineText = doc.getText( currentLineRange );
    
        var results = functionPattern.exec( lineText );
        if ( results && results.length > 0 ) {
            var bits = results[2].trim().split(' ');
            if ( bits[0].trim() ) {    
                // first part of split.
                return bits[0].trim();
            }
        }
        
        // go back a line.
        lineNumber --;
    }

    // cant find a start of routine tag...
    return null;
}
