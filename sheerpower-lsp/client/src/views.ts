/* extension views for sheerpower-basic */
'use strict';

import { window,
    workspace,
    commands,
    EventEmitter,
    Event,
    Position,
    Uri,
    TreeDataProvider,
    TreeItem, 
    TreeItemCollapsibleState } from 'vscode';
import * as path from 'path';
import { MoveCursorToSymbolLine, SymbolLocation } from './commands';
import { client } from './extension';

export function viewsInitialize() {
    console.log('sheerpower routines view extension is active');

    window.registerTreeDataProvider('sheerpowerBasic.routines', routinesTreeDataProvider);
    
    commands.registerCommand('sheerpowerBasic.routines.refresh', () => {
        console.log("sheerpowerBasic.routines.refresh");
        routinesTreeDataProvider.refresh();
    });
    commands.registerCommand('sheerpowerBasic.routines.goto', (fileUri, name, line, start, length) => {
        console.log("sheerpowerBasic.routines.goto: " + name );
        MoveCursorToSymbolLine( fileUri, new Position( line, start), length );
    });

    window.registerTreeDataProvider('sheerpowerBasic.includes', includesTreeDataProvider);

    commands.registerCommand('sheerpowerBasic.includes.refresh', () => {
        console.log("sheerpowerBasic.includes.refresh");
        includesTreeDataProvider.refresh();
    });
    commands.registerCommand('sheerpowerBasic.includes.openFile', (args) => {
        var fileUri = Uri.parse(args);

        // override with the case'd version of the uri, so we dont open a new doc...
        var doc = isDocumentOpen( args );
        if ( doc ) {
            fileUri = doc.uri;
        }

        // check to see if open
        window.showTextDocument( fileUri );
    });

    client.onNotification("custom/SheerpowerBasicUpdatedIncludes", (fileUri: string) => {
        console.log("new includes found for : " + fileUri);
        includesTreeDataProvider.refresh();
    });

    client.onNotification("custom/SheerpowerBasicUpdatedSymbols", (fileUri: string) => {
        console.log("new routines found for : " + fileUri);
        routinesTreeDataProvider.refresh();
    });
}

//////////////////////////////////////////Routines View////////////////////////////////////////
// the classes for handling the routines list on the left.
// the node that gets added to the tree view
class RoutineDeclaration extends TreeItem {
    routine : string;
    label : string;

    constructor( fileUri : string,
        routineName : string, 
        line : number,
        start : number,
        length : number,
        collapsibleState : TreeItemCollapsibleState ) {
		super(routineName, collapsibleState);

        this.label = routineName;
        this.routine = routineName;

        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'include_light.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'include_dark.svg')
        };

        this.contextValue = 'routine';

        this.command = {
            command: "sheerpowerBasic.routines.goto",
            title: "",
            arguments: [ fileUri, this.label, line, start, length ]
        };
    }
}

class routinesTreeData implements TreeDataProvider<RoutineDeclaration> {
    _onDidChangeTreeData : EventEmitter<RoutineDeclaration>;
    onDidChangeTreeData : Event<RoutineDeclaration>;

    constructor() {
        this._onDidChangeTreeData = new EventEmitter<RoutineDeclaration>();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        // change of editor means re parse...
        window.onDidChangeActiveTextEditor( () => {
			this.refresh();
		});
    }
    
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element : RoutineDeclaration ) : TreeItem {
		return element;
    }
    
    getChildren(element : RoutineDeclaration ) : Promise<RoutineDeclaration []>{
        if ( element ) {
            // no children
            return Promise.resolve( [] );
        }
        else{
            return this.getDependenciesForRoutines();
        }
	}

    async getDependenciesForRoutines() : Promise<RoutineDeclaration []> {
        if ( !window.activeTextEditor || 
            !window.activeTextEditor.document ||
            window.activeTextEditor.document.languageId != 'sheerpower-basic') {
            return [];
        }

        // call the server to get data...
        var routines = await client.sendRequest( "sheerpowerBasicServer.GetSymbolsInFile",
            [[ window.activeTextEditor.document.uri.toString()]]) as SymbolLocation [];

        console.log( "routines: " + routines.length );

        var results : RoutineDeclaration [] = [];

        routines.forEach( value => {
            var node = new RoutineDeclaration( value.fileUri,
                value.symbol,
                value.position.line, 
                value.position.character,
                value.symbol.length,
                TreeItemCollapsibleState.None );
            results.push( node );
        });

        return results;
    }
}

let routinesTreeDataProvider : routinesTreeData = new routinesTreeData();

/////////////////////Includes View//////////////////////////////////////////////////
export declare class IncludeFile {
    fileUri: string;
    filename: string;
}

// this handles the view and population
class includesTreeData implements TreeDataProvider<IncludeDependency> {
    _onDidChangeTreeData : EventEmitter<IncludeDependency>;
    onDidChangeTreeData : Event<IncludeDependency>;

    constructor() {
        this._onDidChangeTreeData = new EventEmitter<IncludeDependency>();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        // change of editor means refresh...
        window.onDidChangeActiveTextEditor(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    refresh( ) {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element : IncludeDependency ) : TreeItem {
        return element;
    }

    getChildren(element : IncludeDependency ) : Promise<IncludeDependency []> {
        console.log("getchildren: " + element );
        
        if ( element ) {
            return Promise.resolve( [] );
        }
        else{
            return Promise.resolve( this.getDependenciesForFiles( ));
        }
    }

    async getDependenciesForFiles( ) : Promise<IncludeDependency[]> {
        if ( !window.activeTextEditor || 
            !window.activeTextEditor.document ||
            window.activeTextEditor.document.languageId != 'sheerpower-basic') {
            return [];
        }
        
        // scan if the file not in the cache...
        var includes = await client.sendRequest( "sheerpowerBasicServer.GetIncludesInFile",
            [[ window.activeTextEditor.document.uri.toString()]]) as IncludeFile [];
    
        console.log('includes: ' + includes.length );
        
        var results : IncludeDependency [] = [];
        for ( var index = 0; index < includes.length; index ++) {
            var node = new IncludeDependency( includes[index], TreeItemCollapsibleState.None );
            results.push( node );
        }

        return results;
    }
}

// the nodes in the tree view.
class IncludeDependency extends TreeItem {   
    constructor( include : IncludeFile, collapsibleState : TreeItemCollapsibleState ) {
        super(include.filename, collapsibleState);

        this.label = path.basename(include.filename);

        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'include_light.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'include_dark.svg')
        };

        this.contextValue = 'include';

        this.command = {
            command: "sheerpowerBasic.includes.openFile",
            title: "Open file",
            arguments: [ include.fileUri ]
        };
    }
}

let includesTreeDataProvider : includesTreeData = new includesTreeData();

function isDocumentOpen( fileUri : string ) {
    let lcFileUri : string = fileUri.toLowerCase();

    for ( var doc of workspace.textDocuments ) {
        if ( doc.uri.toString().toLowerCase() == lcFileUri ) {
            return doc;
        }
    }

    return null;
}