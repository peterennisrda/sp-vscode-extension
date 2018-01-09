const vscode = require('vscode');
const path = require('path');

module.exports.routinesInitialize = routinesInitialize;

var routinesTreeDataProvider = null;

// functions for the includes used in spsrc...
function routinesInitialize(context){
    console.log('sheerpower routines view extension is active');
    routinesTreeDataProvider = new routinesTreeData();

    vscode.window.registerTreeDataProvider('routines', routinesTreeDataProvider);

    vscode.commands.registerCommand('routines.addEntry', node => {
        vscode.window.showInformationMessage('Successfully called add entry');
    });
	vscode.commands.registerCommand('routines.deleteEntry', node => {
        vscode.window.showInformationMessage('Successfully called delete entry');
    });
    vscode.commands.registerCommand('routines.refresh', node => {
        console.log("routines.refresh");
        routinesTreeDataProvider.refresh();
    });
    vscode.commands.registerCommand('routines.goto', (name, line, start, length) => {
        highlightRoutine(name, line, start, length );
    });
}

function highlightRoutine( name, line, start, length ) {
    var editor = vscode.window.activeTextEditor;

    var newStartPosition = new vscode.Position( line, start );
    var newEndPosition = newStartPosition.translate( 0, length );
    var newSelection = new vscode.Selection(newStartPosition, newEndPosition);
    editor.selection = newSelection;

    editor.revealRange( new vscode.Range(
        Math.max(newSelection.active.line - 10, 0),
        newSelection.active.character,
        newSelection.active.line + 10,
        newSelection.active.character),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

// regex for finding include tags
// TODO: exlcude lines with preceeding comments...
var routinesPattern = /s*(routine)(?=\s+)([^!\n]*)/gi;

class routinesTreeData {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        // change of editor means re parse...
        vscode.window.onDidChangeActiveTextEditor(editor => {
			this.refresh();
		});
    }
    
    refresh( ) {
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element) {
		return element;
    }
    
    getChildren(element) {
        if ( element ) {
            return Promise.resolve( [] );
        }
        else{
            return Promise.resolve( this.getDependenciesForRoutines());
        }
	}

    getDependenciesForRoutines() {
        if ( !vscode.window.activeTextEditor || 
            !vscode.window.activeTextEditor.document ||
            vscode.window.activeTextEditor.document.languageId != 'sheerpower-basic') {
            return [];
        }

        var routines = this.searchFileForRoutines();

        var results = [];
        for ( var index = 0; index < routines.length; index ++) {
            var node = new Routine( routines[index].routine,
                routines[index].line, 
                routines[index].start,
                routines[index].length,
                vscode.TreeItemCollapsibleState.None, "" );
            results.push( node );
        }
        return results;
    }

    searchFileForRoutines() {
        var editor = vscode.window.activeTextEditor;
        var doc = editor.document;
        var textBuffer = doc.getText();

        routinesPattern.lastIndex = 0;
        var results = null;

        var routines = [];

        do
        {
            results = routinesPattern.exec(textBuffer);
            if ( results && results.length > 1 && results[1] ) {
                var bits = results[2].trim().split(' ');
                if ( bits && bits.length > 0 && bits[0].length > 0 ) {
                    var routinename = bits[0];

                    var location = results.index;
                    location = textBuffer.indexOf( bits[0], location );
    
                    // then move the cursor to results.index and count lines...
                    var newStartPosition = doc.positionAt( location );

                    var lineText = doc.lineAt( newStartPosition.line );

                    // make sure there is no comment marker to the left of us...
                    var comment = lineText.text.indexOf( '!' );
                    if ( comment >= 0 && comment < results.index ) {
                        continue;
                    }

                    comment = lineText.text.indexOf( '\\\\' );
                    if ( comment >= 0 && comment < results.index ) {
                        continue;
                    }

                    var newEndPosition = newStartPosition.translate( 0, bits[0].length );
    
                    // add to list..
                    routines.push( { 
                        routine: routinename, 
                        line: newStartPosition.line,
                        start: newStartPosition.character,
                        length: newEndPosition.character - newStartPosition.character 
                    });
                }
            }
        }
        while ( results );

        // now populate the tree with data...
        routines.sort(compareRoutines);
        return routines;
    }
}

function compareRoutines(a,b) {
    if (a.routine < b.routine)
      return -1;
    if (a.routine > b.routine)
      return 1;
    return 0;
  }
  
class Routine extends vscode.TreeItem {
	constructor( label, line, start, length, collapsibleState, command ) {
		super(label, collapsibleState);

        this.label = label;

        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'include_light.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'include_dark.svg')
        };

        this.contextValue = 'routine';

        this.command = {
            command: "routines.goto",
            title: "",
            arguments: [ label, line, start, length ]
        };
    }
}


