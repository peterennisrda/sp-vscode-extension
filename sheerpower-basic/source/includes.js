const vscode = require('vscode');
const path = require('path');
const utilities = require('./utilities');
const signature = require('./signature');

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
        this.nextFetchIsARefresh = false;

        // change of editor means refresh...
        vscode.window.onDidChangeActiveTextEditor(editor => {
            this._onDidChangeTreeData.fire();
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
        console.log("getchildren: " + element );
        
        if ( element ) {
            return Promise.resolve( [] );
        }
        else{
            var flag = this.nextFetchIsARefresh;
            this.nextFetchIsARefresh = false;

            return Promise.resolve( this.getDependenciesForFiles( flag ));
        }
	}

    getDependenciesForFiles( forceIt ) {
        if ( !vscode.window.activeTextEditor || 
            !vscode.window.activeTextEditor.document ||
            vscode.window.activeTextEditor.document.languageId != 'sheerpower-basic') {
            return [];
        }
        
        // scan if the file not in the cache...
        signature.scanSourceFile( vscode.window.activeTextEditor.document.fileName, forceIt );
        var includes = signature.getSourceFileIncludes(vscode.window.activeTextEditor.document.fileName );
        
        console.log('includes: ' + includes.length );
        
        var results = [];
        for ( var index = 0; index < includes.length; index ++) {
            var node = new Dependency( includes[index], vscode.TreeItemCollapsibleState.None );
            results.push( node );
        }
        return results;
    }
}

class Dependency extends vscode.TreeItem {
	constructor( include, collapsibleState ) {
		super(include.filename, collapsibleState);

        this.dataNode = include;

        this.label = path.basename(include.filename);

        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'include_light.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'include_dark.svg')
        };

        this.contextValue = 'include';

        this.command = {
            command: "includes.openFile",
            title: "Open file",
            arguments: [ include.filename ]
        };
    }
}

