const vscode = require('vscode');
const path = require('path');
const signature = require('./signature');

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
        this.nextFetchIsARefresh = false;

        // change of editor means re parse...
        vscode.window.onDidChangeActiveTextEditor(editor => {
			this.refresh();
		});
    }
    
    refresh( ) {
        this.nextFetchIsARefresh = true;
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
            var flag = this.nextFetchIsARefresh;
            this.nextFetchIsARefresh = false;

            return Promise.resolve( this.getDependenciesForRoutines( flag ));
        }
	}

    getDependenciesForRoutines( forceIt ) {
        if ( !vscode.window.activeTextEditor || 
            !vscode.window.activeTextEditor.document ||
            vscode.window.activeTextEditor.document.languageId != 'sheerpower-basic') {
            return [];
        }

        // scan if the file not in the cache...
        signature.scanSourceFile( vscode.window.activeTextEditor.document.fileName, forceIt );
        var routines = signature.getSourceFileRoutines(vscode.window.activeTextEditor.document.fileName );

        console.log( "routines: " + routines.size );

        var results = [];
        var doc = vscode.window.activeTextEditor.document;

        routines.forEach( value => {
            var pos = doc.positionAt( value.charOffset );

            var node = new Routine( value,
                pos.line, 
                pos.character,
                value.symbolName.length,
                vscode.TreeItemCollapsibleState.None, "" );
            results.push( node );
        });

        return results;
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
	constructor( routine, line, start, length, collapsibleState, command ) {
		super(routine.symbolName, collapsibleState);

        this.label = routine.symbolName;
        this.routine = routine;

        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'include_light.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'include_dark.svg')
        };

        this.contextValue = 'routine';

        this.command = {
            command: "routines.goto",
            title: "",
            arguments: [ this.label, line, start, length ]
        };
    }
}


