const vscode = require('vscode');
const path = require('path');

module.exports.includesInitialize = includesInitialize;

var includesTreeDataProvider = null;

// functions for the includes used in spsrc...
function includesInitialize(context){
    console.log('sheerpower includes view extension is active');
    includesTreeDataProvider = new includesTreeData();

    vscode.window.registerTreeDataProvider('includes', includesTreeDataProvider);

    vscode.commands.registerCommand('includes.addEntry', node => {
        vscode.window.showInformationMessage('Successfully called add entry');
    });
	vscode.commands.registerCommand('includes.deleteEntry', node => {
        vscode.window.showInformationMessage('Successfully called delete entry');
    });
    vscode.commands.registerCommand('includes.refresh', node => {
        console.log("includes.refresh");
        includesTreeDataProvider.refresh();
    });
    vscode.commands.registerCommand('includes.openFile', (args) => {
        var fileUri = vscode.Uri.file(args);
        vscode.window.showTextDocument( fileUri );
    });

}

// regex for finding include tags
var includesPattern = /\B\%include\s+(['"].*['"])\B/ig;

class includesTreeData {
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
        console.log("getchidlren: " + element );
        
        if ( element ) {
            return Promise.resolve( [] );
        }
        else{
            return Promise.resolve( this.getDependenciesForFiles());
        }
	}

    getDependenciesForFiles() {
        if ( !vscode.window.activeTextEditor || 
            !vscode.window.activeTextEditor.document ||
            vscode.window.activeTextEditor.document.languageId != 'sheerpower-basic') {
            return [];
        }
        
        var files = this.searchFileForIncludes();

        console.log('includes: ' + files.length );
        
        var results = [];
        for ( var index = 0; index < files.length; index ++) {
            var node = new Dependency( files[index], vscode.TreeItemCollapsibleState.None );
            results.push( node );
        }
        return results;
    }

    searchFileForIncludes() {
        var editor = vscode.window.activeTextEditor;
        var doc = editor.document;
        var textBuffer = doc.getText();

        includesPattern.lastIndex = 0;
        var results = null;

        var files = [];

        do
        {
            results = includesPattern.exec(textBuffer);
            if ( results && results.length > 1 ) {
                var filename = unquote(results[1]);

                // now resolve the sheeerpower path characters...
                filename = SubstSheerpowerPathMarker(filename);

                // add to list..
                files.push( filename.toLowerCase() );
            }
        }
        while ( results );

        // now populate the tree with data...
        files.sort(compareIncludes);
        return files;
    }
}

function compareIncludes(a,b) {
    var aname = path.basename(a);
    var bname = path.basename(b);

    if (aname < bname)
      return -1;
    if (aname > bname)
      return 1;
    return 0;
  }

class Dependency extends vscode.TreeItem {
	constructor( label, collapsibleState ) {
		super(label, collapsibleState);

        this.label = path.basename(label);

        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'include_light.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'include_dark.svg')
        };

        this.contextValue = 'include';

        this.filePath = label;

        this.command = {
            command: "includes.openFile",
            title: "Open file",
            arguments: [ label ]
        };
    }
}


// substitute the @ sign for the base folder of the spsrc...
function SubstSheerpowerPathMarker( filename ) {
    if ( filename[0] != '@' ) {
        return filename;
    }

    var rootFolder = path.dirname( vscode.window.activeTextEditor.document.fileName );
    var newPath = path.join( rootFolder, filename.substring( 1, filename.length ) );
    return newPath;
}

// remove quite symbols from start and end of string.
function unquote( text ) {
    if ( text.length == 0 ) {
        return text;
    }

    var start = 0;
    var end = text.length;

    if ( text[0] == '"' || text[0] == "'") {
        start ++;
    }

    if ( end > start && text[end-1] == '"' || text[end-1] == "'") {
        end --;
    }

    return text.substring( start, end);
}

