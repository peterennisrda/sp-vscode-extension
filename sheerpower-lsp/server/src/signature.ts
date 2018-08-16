/* code for handling and tracking where routines are in a particular file */
'use strict';

import { TextDocument, 
    CompletionItem,
    CompletionItemKind,
    Hover,
    Definition,
	TextDocumentPositionParams, 
    Position,
    Range,
    InsertTextFormat,
    DocumentSymbolParams,
    SymbolInformation,
    SymbolKind,
    FileEvent,
    FileChangeType,
    WorkspaceSymbolParams} from 'vscode-languageserver';
import * as path from 'path';
import { connection, documents, getDocumentSettings, SheerpowerBasicSettings } from './server';
import * as utilities from './utilities';

// declaration of symbol, file and location...
export class symbolDeclaration {
    symbolName : string;
    sourceFilename : string;
    charOffset : number;
    parameters : Array<string>;
    returnParameters : Array<string>;
    private : boolean;
    commentDescription: string;

    constructor(){
        this.symbolName = "";
        this.sourceFilename = "";
        this.charOffset = -1;
        this.parameters = [];
        this.returnParameters = [];
        this.private = false;
        this.commentDescription = '';
    }

    formatDeclaration() : string {
        let text = "";
        if ( this.private ) {
            text = text + 'private ';
        }
        text = text + 'routine ' + this.symbolName;
        if ( this.parameters && this.parameters.length > 0 ) {
            text = text + ' with ' + this.parameters.join( ', ' );
        }
        if ( this.returnParameters && this.returnParameters.length > 0 ) {
            text = text + ', returning ' + this.returnParameters.join( ', ' );
        }

        return text;
    }

    formatDocumentation() : string {
        return this.commentDescription;
    }

    formatInsertText() : string {
        let text = "";
        text = text + this.symbolName;

        let insertOffset = 1;
        if ( this.parameters && this.parameters.length > 0 ) {
            text = text + ' with ';

            for( var index = 0; index < this.parameters.length; index ++ ){
                let sep = '';
                if ( index > 0 ) {
                    sep = ', ';
                }
                text = text + sep + this.parameters[index] + ' ${' + insertOffset.toString() + ':' + this.parameters[index] + '}';
                insertOffset ++;
            }
        }
        if ( this.returnParameters && this.returnParameters.length > 0 ) {
            text = text + ', returning ';

            for( var index = 0; index < this.returnParameters.length; index ++ ){
                let sep = '';
                if ( index > 0 ) {
                    sep = ', ';
                }
                text = text + sep + this.returnParameters[index] + ' ${' + insertOffset.toString() + ':' + this.returnParameters[index] + '}';
                insertOffset ++;
            }
        }

        return text;
    }
}

// compare two symbol nodes for sorting...
function compareSymbolDeclaration( a : symbolDeclaration, b : symbolDeclaration ) : number
{
    var aname = path.basename(a.symbolName).toLowerCase();
    var bname = path.basename(b.symbolName).toLowerCase();

    if (aname < bname)
    return -1;
    if (aname > bname)
    return 1;
    return 0;
}

// simple class for storing data about an include file...
export class includeDeclaration {
    // the file path as it appeared in the code
    sourceFilename : string;
    realSourceFilename : string;

    charOffset : number;

    // the fileUri of the actual file..
    fileUri : string;

    constructor() {
        this.sourceFilename = "";
        this.charOffset = -1;
        this.fileUri = "";
    }
}

// compare two include nodes for sorting...
function compareIncludeDeclarationByFilename( a : includeDeclaration, b : includeDeclaration ) : number
{
    var aname = path.basename(a.fileUri).toLowerCase();
    var bname = path.basename(b.fileUri).toLowerCase();

    if (aname < bname)
    return -1;
    if (aname > bname)
    return 1;
    return 0;
}

// class for handling all the symbol data we need to store
class symbolDataMap {
    // note that the map is based on lowercase filenames converter to uri's
    // a map of maps, the second layer maps contain 
    // the symbol names and their declaration data for faster lookup
    _rootedMap : Map<string,Map<string,symbolDeclaration>>;

    // a map of files and the includes they use.
    _includesMap : Map<string,Array<includeDeclaration>>;

    // a reverse map of who included what, if you have multiple spsrc open it will get messed.
    _reverseIncludesMap : Map<string, string>;

    constructor() {
        this._rootedMap = new Map<string,Map<string,symbolDeclaration>>();
        this._includesMap = new Map<string,Array<includeDeclaration>>();
        this._reverseIncludesMap = new Map<string, string>();
    }

    // clear the map
    resetMap() {
        this._rootedMap.clear();
        this._includesMap.clear();
    }

    isFilePresentInCache( filename : string ) {
        return this._includesMap.has( utilities.toLowerCaseUriString( filename));
    }

    isFileUriPresentInCache( fileUri : string ) {
        return this._includesMap.has( fileUri.toLowerCase() );
    }

    includesForFileUri( fileUri : string ) : Array<includeDeclaration> {
        return this._includesMap.get( fileUri.toLowerCase() );
    }

    symbolsForFileUri( fileUri : string ) : Map<string, symbolDeclaration> {
        return this._rootedMap.get( fileUri.toLowerCase());
    }

    // assuming we are a .spinc file, then search for the nearest spsrc that includes us,
    // that will become the root of the search tree
    findRootFileForInclude( fileUri : string ) : string {
        let curRootUri : string = fileUri;
        let prevRootUri : string = fileUri;

        // recursively walk up the map looking for who included whom...
        while ( (curRootUri = this._reverseIncludesMap.get( prevRootUri )) != null )
        {
            prevRootUri = curRootUri;
        }

        return prevRootUri;
    }

    notifyClientNewIncludes( fileUri : string ) {
        connection.sendNotification("custom/SheerpowerBasicUpdatedIncludes", [[fileUri]]);
    }

    notifyClientNewSymbols( fileUri : string ) {
        connection.sendNotification("custom/SheerpowerBasicUpdatedSymbols", [[fileUri]]);
    }

    compareIncludesForChange( a : includeDeclaration [], b : includeDeclaration [] ) : boolean {
        if ( !a ) {
            return true;
        }
        if ( a.length != b.length ) {
            return true;
        }

        // this assumes the lists are sorted...
        for ( var index = 0; index < a.length; index ++ ) {
            if ( a[index].fileUri.toLowerCase() != b[index].fileUri.toLowerCase()) {
                return true;
            }
        }

        return false;
    }

    compareSymbolsForChange( a : symbolDeclaration [], b : Map<string, symbolDeclaration> ) : boolean {
        if ( !a ) {
            return true;
        }

        if ( a.length != b.size ) {
            return true;
        }

        for ( var index = 0; index < a.length; index ++ ) {
            if ( !b.has( a[index].symbolName.toLowerCase() )) {
                return true;
            }
        }

        return false;
    }

    parseDocument( textDocument : TextDocument, settings : SheerpowerBasicSettings, forceit : boolean ) : void {
        let fileUri : string = textDocument.uri;

        let buffer : string = textDocument.getText();

        this.parseDocumentUri( fileUri, buffer, settings, forceit );
    }

    // process a managed document buffer, we assume its changed
    parseDocumentUri( docFileUri : string, textBuffer : string, settings : SheerpowerBasicSettings, forceit : boolean ) : void {
        let filesToScan : Array<string> = [ docFileUri ];
        let rootUri : string = docFileUri.toLowerCase();

        for ( var index = 0; index < filesToScan.length; index ++ ) {
            let lcFileUri : string = filesToScan[index].toLowerCase();

            let buffer : string = null;
            if ( index == 0 ) {
                buffer = textBuffer;
            }

            // go fetch
            if ( !buffer ) {
                // get the buffer data...
                buffer = utilities.loadBufferForUri( lcFileUri, rootUri, true, settings );
            }

            // if we cant find the file, no point going further...
            if ( !buffer ) {
                connection.console.log( "cant find file: " + lcFileUri );
                continue;
            }

            connection.console.log("processing: " + utilities.toFilenameFromUri( lcFileUri ));

            let includeFiles = parseFileForIncludes( buffer, rootUri, settings );

            if ( includeFiles ) {
                let notifyForIncludes : boolean = false;

                // if its the doc we were given originally, then check to see if anything changed...
                if ( index == 0 ) {
                    if (! this._includesMap.has( lcFileUri )) {
                        notifyForIncludes = true;
                    }
                    else {
                        // compare the two lists
                        notifyForIncludes = this.compareIncludesForChange( includeFiles, this._includesMap.get( lcFileUri ));
                    }

                    if ( notifyForIncludes ) {
                        this.notifyClientNewIncludes( lcFileUri );
                    }
                }

                this._includesMap.set( lcFileUri, includeFiles );

                // build a quick list of all includes to scan for symbols...
                if ( settings.recursiveParseFiles ) {
                    includeFiles.forEach( node => {
                        this._reverseIncludesMap.set( node.fileUri.toLowerCase(), lcFileUri );

                        if ( forceit || !this.isFileUriPresentInCache( node.fileUri.toLowerCase() )) {
                            // if its in the cache, and its contents have changed, then we
                            // should get a notification. TODO: do we need to store file time stamsp ?
                            filesToScan.push( node.fileUri );
                        }
                    });
                }
            }
            
            // now parse for symbols
            let FileMap : Map<string,symbolDeclaration> = new Map<string,symbolDeclaration>();
            let routineSymbols : Array<symbolDeclaration> = [];

            try
            {
                routineSymbols = parseFileforRoutines( lcFileUri, buffer, settings );
            }
            catch (err)
            {
                console.log( "error symbol processing: " + lcFileUri + " - " + err );
                continue;
            }
            
            let notifyForSymbols : boolean = false;

            // if its the doc we were given originally, then check to see if anything changed...
            if ( index == 0 ) {
                if (! this._rootedMap.has( lcFileUri )) {
                    notifyForSymbols = true;
                }
                else {
                    // compare the two lists
                    notifyForSymbols = this.compareSymbolsForChange( routineSymbols, this._rootedMap.get( lcFileUri ));
                }

                if ( notifyForSymbols ) {
                    this.notifyClientNewSymbols( lcFileUri );
                }
            }

            // the symbol map is always lowercase, as sheerpower routine names
            // are case insensitive
            routineSymbols.forEach( node => {
                FileMap.set( node.symbolName.toLowerCase(), node );
            });

            this._rootedMap.set( lcFileUri, FileMap );
        }
    }

    remove( fileUri : string ) : void {
        let lcFileUri = fileUri.toLowerCase();

        // remove all traces of a file from the cache
        if ( this._includesMap.has( lcFileUri )) {
            this._includesMap.delete( lcFileUri );

            // now cleanup the reverse map...
            var keys = this._reverseIncludesMap.keys();
            for( var key in keys ){
                if ( this._reverseIncludesMap.get( key ) == lcFileUri ) {
                    this._reverseIncludesMap.delete( key );
                }
            }
        }
        // remove any symbols.
        if ( this._rootedMap.has( lcFileUri )) {
            this._rootedMap.delete( lcFileUri );
        }
    }

    async update( fileUri : string ) : Promise<void> {
        let doc = utilities.isDocumentOpen( fileUri );

        let settings : SheerpowerBasicSettings = null;
        if ( doc ) {
            settings = await getDocumentSettings(doc.uri);
        } 
        else {
            settings = await getDocumentSettings( fileUri );
        }

        // update a document (reparse)
        this.parseDocumentUri( fileUri, null, settings, true );
    }
}

// TODO: currently this is one map, it should probably be per workspace...
var symbolMap = new symbolDataMap();

// regex for finding include tags
let includesPattern : RegExp = /\B\%include\s+(['"].*['"])\B/ig;

// parse a file looking for includes. returns array of IncludeDeclaration
function parseFileForIncludes( textBuffer : string,
    rootFileUri : string,
    settings : SheerpowerBasicSettings ) : Array<includeDeclaration> {

    includesPattern.lastIndex = 0;
    var results = null;

    var files = [];

    var rootFile = utilities.toFilenameFromUri( rootFileUri );
    do
    {
        results = includesPattern.exec(textBuffer);
        if ( results && results.length > 1 ) {
            let includeFilename = utilities.unquote(results[1].trim());

            // now resolve the sheeerpower path characters...
            let realIncludeFilename = utilities.resolveSheerpowerFilePath( includeFilename, rootFile );

            // if there is no extension and we are allowed a default
            if( settings.defaultIncludesExtensionsAsSpinc && path.extname( realIncludeFilename ) == "" ){
                realIncludeFilename = realIncludeFilename + '.spinc';
            }

            // add to list..
            var IncludeNode = new includeDeclaration();

            IncludeNode.sourceFilename = includeFilename;
            IncludeNode.realSourceFilename = realIncludeFilename;
            IncludeNode.charOffset = results.index;
            IncludeNode.fileUri = utilities.toLowerCaseUriString( realIncludeFilename );

            files.push( IncludeNode );
        }
    }
    while ( results );

    files.sort( compareIncludeDeclarationByFilename );
    return files;
}

var routinesPattern = /s*(routine)(?=\s+)([^!\n]*)/ig;

// parse a file for routine tags
function parseFileforRoutines( fileUri : string,
    textBuffer : string,
    settings : SheerpowerBasicSettings ) : Array<symbolDeclaration> {

    routinesPattern.lastIndex = 0;
    var results = null;

    var symbols = [];
    var EOLString = String.fromCharCode(10);

    do
    {
        results = routinesPattern.exec(textBuffer);
        if ( results && results.length > 1 ) {
            var bits = results[2].trim().split(' ');
            if ( bits && bits.length > 0 && bits[0].length > 0 ) {
                var routineName = bits[0];
        
                var routineNameStartPos = textBuffer.indexOf( routineName, results.index );

                var EOLPos = textBuffer.lastIndexOf( EOLString, results.index );
                if ( EOLPos < 0 ) {
                    EOLPos = 0;
                }
                var lineText = textBuffer.substring( EOLPos + 1, results.index );
        
                // make sure there is no comment marker to the left of us...
                var comment = lineText.indexOf( '!' );
                if ( comment >= 0 ) {
                    continue;
                }
        
                comment = lineText.indexOf( '\\\\' );
                if ( comment >= 0 ) {
                    continue;
                }

                // ignore "exit routine .."
                comment = lineText.indexOf( 'exit' );
                if ( comment >= 0 ) {
                    continue;
                }

                // add to list..
                let symbolNode : symbolDeclaration = null;
                try
                {
                    symbolNode = parseTextBufferForRoutineDeclaration( textBuffer, results.index, routineName, EOLString );
                }
                catch(err)
                {
                    connection.console.log("failed parsing buffer for routine declaration: " + err);
                    continue;
                }

                symbolNode.sourceFilename = fileUri;
                symbolNode.charOffset = routineNameStartPos;
                
                try
                {
                    symbolNode.commentDescription = parseBufferForRoutineCommentBlock( textBuffer, EOLPos, EOLString, settings);
                }
                catch( err )
                {
                    connection.console.log("error: parsing for comment block: " + err);
                }
                symbols.push( symbolNode );
            }
        }
    }
    while ( results );

    symbols.sort( compareSymbolDeclaration );
    return symbols;
}

/* comment blocks look like:
!%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
! c h e c k _ f o r _ d u p l i c a t e _ f i l e 
!%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
!
! Brief description:
!    check to see if this uploaded/downloaded file is a duplicate
!    if it is, deal with the original
!
! Expected on entry:
!    
!
! Locals used:
!    
!
! Results on exit:
!    
!
!%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */
function parseBufferForRoutineCommentBlock( textBuffer : string,
    offset : number,
    EOLMarker : string,
    settings : SheerpowerBasicSettings ) : string {
    let comments : Array<string> = [];
    let curOffset : number = offset - 1;

    while ( curOffset > 0 ) {
        var EOLPos = textBuffer.lastIndexOf( EOLMarker, curOffset );
        if ( EOLPos < 0 ) {
            break;
        }

        var lineText = textBuffer.substring( EOLPos + 1, curOffset );
        if ( !lineText || lineText[0] != '!') {
            break;
        }

        comments.push( lineText );

        curOffset = EOLPos - 1;
    }

    if ( settings.skipFirstTwoLinesOfCommentBlock && comments.length > 2 ){
        // remove the two lines that are usually 
        // !%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        // ! c h e c k _ f o r _ d u p l i c a t e _ f i l e 
        let text = comments.pop();
        if ( text.substring(0, 10) == "!%%%%%%%%%")
        {
            comments.pop();
        }
        else {
            comments.push( text );
        }
    }

    // reverse the comments, as we were walking backwards.
    comments = comments.reverse();
    return comments.join( EOLMarker );
}

let lastCommaToken : RegExp = /.*\,\s*$/g;
let withArgsListToken : RegExp = /\s(with)\s+/i;
let returningArgsListToken : RegExp = /\s(returning)\s+/i;

function parseArgsList( lineText : string, charOffset : number, exitToken : string )
{
    var results = [];

    var lastToken = "";
    var lastPos = charOffset;

    do
    {
        var commaIndex = lineText.indexOf( ",", lastPos);
        if ( commaIndex >= 0 ) {
            lastToken = lineText.substr( lastPos, commaIndex - lastPos ).trim();
        }
        else {
            lastToken = lineText.substr( lastPos, lineText.length ).trim();
        }

        if ( exitToken && lastToken.substr( 0, exitToken.length).toLowerCase() == exitToken){
            break;
        }

        results.push( lastToken );
        lastPos = commaIndex + 1;
    }
    while( lastPos < lineText.length, commaIndex >= 0 );

    return results;
}

function parseTextBufferForRoutineDeclaration( textBuffer : string, charOffset : number, routineName : string, EOL : string ) {
    var symbolNode = new symbolDeclaration();

    symbolNode.symbolName = routineName;

    var previousLF = textBuffer.lastIndexOf( EOL, charOffset );
    previousLF ++;

    var nextLF = textBuffer.indexOf( EOL, charOffset );
    if ( nextLF < 0 ) {
        nextLF = textBuffer.length;
    }

    // [private] routine <name> [with <argname>[,<argname[, returning <argname>[,<argname.]]]]
    // can be split over lines, only if , is the alst token on line...
    var lineText = textBuffer.substring( previousLF, nextLF );
    var lastPos = charOffset - nextLF;

    var comma = null;
    var lineSeg = lineText;

    // TODO: add handling for comment characters...
    do
    {
        lastCommaToken.lastIndex = 0;
        let comma = lastCommaToken.exec( lineSeg );
        if ( comma ) {
            // get the next line..
            previousLF = nextLF + 1;
            nextLF = textBuffer.indexOf( EOL, previousLF );
            if ( nextLF < 0 ) {
                nextLF = textBuffer.length;

                // no lines left, make sure we exit.
                comma = null;
            }
            lineSeg = textBuffer.substring( previousLF, nextLF );
            lineText = lineText + ' ' + lineSeg;
        }
    }
    while( comma );

    // at this point we should have is the line text over multiple lines that contains the declaration
    withArgsListToken.lastIndex = lastPos;

    let withArgs : Array<string> = [];

    var withToken = withArgsListToken.exec( lineText );
    if ( withToken ) {
        withArgs = parseArgsList( lineText, withToken.index + withToken[0].length, "returning" );
    }

    let returningArgs : Array<string> = [];
    var returningToken = returningArgsListToken.exec( lineText );
    if ( returningToken ) {
        returningArgs = parseArgsList( lineText, returningToken.index + returningToken[0].length, null );        
    }

    symbolNode.parameters = withArgs;
    symbolNode.returnParameters = returningArgs;

    return symbolNode;
}

// EXPORT: reparse the doc looking for includes and declarations
export async function signatureTextContentChanged(textDocument: TextDocument ): Promise<void> {
    connection.console.log('server.signatureTextContentChanged called');
    
    let settings = await getDocumentSettings(textDocument.uri);

    // use the glabal map, parse the current document, only chase the includes if they've not been 
    // parsed before.
    symbolMap.parseDocument( textDocument, settings, false );
}

let EndOfLineCR : string = String.fromCharCode(13);
let EndOfLineLF : string = String.fromCharCode(10);

class SignatureHelper {
    // given a document and position, find what the text is they just typed..
    static getTokenToLeft ( textDocumentPosition: TextDocumentPositionParams ) : string{
        var fileUri = textDocumentPosition.textDocument.uri;
        var theDoc = documents.get( fileUri );

        let token : string = '';

        // get the current line
        var textRange : Range = {
            start: { line: textDocumentPosition.position.line, character: 0 },
            end: { line: textDocumentPosition.position.line, character: textDocumentPosition.position.character }
        };

        var lineText = theDoc.getText( textRange );

        var spacePos = lineText.lastIndexOf( ' ' );
        if ( spacePos < 0 ) {
            token = lineText;
        } else {
            token = lineText.substring( spacePos + 1 );
        }

        return token;
    }

    static getTokenBeneath ( textDocumentPosition: TextDocumentPositionParams ) : string {
        var fileUri = textDocumentPosition.textDocument.uri;
        var theDoc = documents.get( fileUri );

        let token : string = '';

        // get the entire current line
        var textRange : Range = {
            start: { line: textDocumentPosition.position.line, character: 0 },
            end: { line: textDocumentPosition.position.line, character: textDocumentPosition.position.character + 200 }
        };

        var lineText = theDoc.getText( textRange );

        var prevSpacePos = lineText.lastIndexOf( ' ', textDocumentPosition.position.character );
        if ( prevSpacePos < 0 ) {
            prevSpacePos = 0;
        } else {
            prevSpacePos ++;
        }

        var nextSpacePos = lineText.indexOf( ' ', textDocumentPosition.position.character );
        if ( nextSpacePos < 0 ) {
            nextSpacePos = lineText.length;
        } 
        var nextCRPos = lineText.indexOf( EndOfLineCR, textDocumentPosition.position.character );
        if ( nextCRPos < 0 ) {
            nextCRPos = lineText.length;
        }
        var nextLFPos = lineText.indexOf( EndOfLineLF, textDocumentPosition.position.character );
        if ( nextLFPos < 0 ) {
            nextLFPos = lineText.length;
        }

        token = lineText.substring( prevSpacePos, Math.min( nextSpacePos, nextCRPos, nextLFPos ));

        return token;
    }
}

export async function signatureGetCodeCompletion( textDocumentPosition: TextDocumentPositionParams ) : Promise<Array<CompletionItem>> {

    let settings = await getDocumentSettings(textDocumentPosition.textDocument.uri);

    // find the token just to the left of us.
    let token : string = SignatureHelper.getTokenToLeft( textDocumentPosition );
    if ( !token || token.length == 0) {
        return [];
    }

    let rootFileUri : string = textDocumentPosition.textDocument.uri.toLowerCase();

    token = token.toLowerCase();
    let tokenLen = token.length;

    let results : Array<CompletionItem> = [];

    // if we are in a spinc and told to use the root spsrc, then find it, and use it
    if ( settings.recursiveSearchForRoutinesByRootSpsrc && !utilities.isFileUriARootSourceFile( rootFileUri )) {
        rootFileUri = symbolMap.findRootFileForInclude( rootFileUri );
    }

    let urisToSearch : Array<string> = [ rootFileUri ];

    // if we are asked to search recursively, then build a list of files whose symbols we care about
    if ( settings.recursiveSearchForRoutines )
    {
        for ( var index = 0; index < urisToSearch.length; index ++) {
            var includes = symbolMap.includesForFileUri( urisToSearch[index] );
            if ( !includes) {
                continue;
            }

            for( var subindex = 0; subindex < includes.length; subindex ++ )
            {
                let node = includes[subindex];
                
                if ( urisToSearch.indexOf( node.fileUri ) < 0 ){
                    urisToSearch.push( node.fileUri );
                }
            }
        }
    }

    while ( urisToSearch.length > 0 ) {
        let fileUri : string  = urisToSearch.pop();

        // for now use the current file
        var symbols = symbolMap.symbolsForFileUri( fileUri );
        if ( !symbols ) {
            continue;
        }

        var mapKeys = symbols.keys();
        for ( let node of mapKeys ) {
            if ( node.substring( 0, tokenLen) == token ) {
                var realNode = symbols.get( node );

                let resultNode : CompletionItem = {
                    label: realNode.symbolName,
                    kind: CompletionItemKind.Function,
                    detail: realNode.formatDeclaration(),
                    insertText: realNode.formatInsertText(),
                    insertTextFormat: InsertTextFormat.Snippet,
                    data: { 
                        symbol: node,
                        uri: fileUri
                    }
                }

                results.push( resultNode );
            } else {
                // they should be in sorted order, so if they dont start with our token
                // give up.
                if ( node > token ) {
                   break;
                }
            }
        }

        //if ( results.length > settings.maxCodeCompletionItems ) {
            // passed the max, return what we have until they type more...
        //    break;
        //}
    }

    results.sort( compareCompletionItem );
    return results;
}

function compareCompletionItem( a : CompletionItem, b: CompletionItem ) {
    var aname = path.basename(a.label).toLowerCase();
    var bname = path.basename(b.label).toLowerCase();

    if (aname < bname)
    return -1;
    if (aname > bname)
    return 1;
    return 0;
}

export function signatureGetCodeCompletionResolve( item : CompletionItem ) {
    if ( !item || !item.data ){
        return;
    }

    let fileUri = item.data.uri;
    let symbol = item.data.symbol;

    var symbols = symbolMap.symbolsForFileUri( fileUri );
    if ( !symbols ) {
        return;
    }

    var realNode = symbols.get( symbol );
    if ( !realNode ) {
        return;
    }

    item.documentation = realNode.formatDocumentation();
}

// hover over a routine name and we'll pull up what we have...
export async function signatureGetHover( textDocumentPosition: TextDocumentPositionParams ) : Promise<Hover> {

    let symbol = await signatureGetSymbol( textDocumentPosition );

    if ( !symbol ) {
        return null;
    }

    // TODO: should we use markup text, should we include the comment ?
    let result : Hover = {
        contents: { language: 'sheerpower-basic', value: symbol.symbol.formatDeclaration() + '\n\n' +symbol.symbol.commentDescription }
    };

    return result;
}

export async function signatureGetDefinition( textDocumentPosition: TextDocumentPositionParams ) : Promise<Definition> {

    let symbol = await signatureGetSymbol( textDocumentPosition );

    if ( !symbol ) {
        return null;
    }

    let pos : Position = null;
    let doc = utilities.isDocumentOpen( symbol.fileUri );
    if ( doc ) {
        pos = doc.positionAt( symbol.symbol.charOffset );
    } 
    else {
        // slow way of finding line count, we have to load the file and count...
        // TODO: is there another way ?
        pos = utilities.positionNumberInFile( utilities.toFilenameFromUri(symbol.symbol.sourceFilename), symbol.symbol.charOffset );
    }

    // dont bother if we cant find the file
    if ( !pos ) {
        connection.console.log( "error: cant find the position for " +
            symbol.symbol.charOffset.toString() + " in " + symbol.fileUri );
        return null;
    }

    let result : Definition = {
        uri: symbol.fileUri,
        range : {
            start: { line: pos.line, character: pos.character},
            end: {line: pos.line, character: pos.character + symbol.symbol.symbolName.length }
        }
    };

    return result;
}

class SymbolResult {
    fileUri : string;
    symbol : symbolDeclaration;
}

export async function signatureGetDocumentSymbols( docSymbols : DocumentSymbolParams ) : Promise<SymbolInformation[]> {

    // let settings = await getDocumentSettings(docSymbols.textDocument.uri);

    let rootFileUri : string = docSymbols.textDocument.uri.toLowerCase();
    let doc = documents.get( docSymbols.textDocument.uri);
    if ( !doc ) {
        return [];
    }

    var symbols = symbolMap.symbolsForFileUri( rootFileUri );
    if ( !symbols ) {
        return [];
    }

    let results : Array<SymbolInformation> = [];
    var mapKeys = symbols.keys();
    for ( let node of mapKeys ) {
        let symbol = symbols.get(node);

        let pos = doc.positionAt( symbol.charOffset );

        let info : SymbolInformation = {
            name: symbol.symbolName,
            kind: SymbolKind.Function,
            location: { 
                uri : docSymbols.textDocument.uri,
                range: {
                    start: { line: pos.line, character: pos.character},
                    end: {line: pos.line, character: pos.character + symbol.symbolName.length}
                }
            }
        };

        results.push( info );
    }

    return results;
}

export async function signatureGetWorkspaceSymbols( wkspaceSymbols : WorkspaceSymbolParams ) : Promise<SymbolInformation[]> {

    let results : Array<SymbolInformation> = [];

    // use the query passed to find matching symbols...
    var keys = symbolMap._rootedMap.keys();
    for( var node of keys ) {
        let symbols = symbolMap._rootedMap.get( node );
        if ( ! symbols ) {
            continue;
        }

        let textBuffer : Buffer = null;
        let doc : TextDocument = null;
        let fetched : boolean = false;

        // now walk the keys
        var symbolKeys = symbols.keys();
        for ( var key of symbolKeys ) {
            if ( key.substring(0, wkspaceSymbols.query.length ) != wkspaceSymbols.query ) {
                continue;
            }

            // try to fetch this stuff once per document, not for each symbol.
            if ( ! fetched ) {
                doc = utilities.isDocumentOpen( node );
                if ( !doc ) {
                    textBuffer = utilities.LoadTextBuffer( utilities.toFilenameFromUri( node ));
                }

                fetched = true;
            }

            if ( !doc && !textBuffer ) {
                // we have nothing to get the position for the current document
                break;
            }

            let symbol = symbols.get(key);
            if ( !symbol ) {
                continue;
            }

            let pos = null;
            if ( doc ) {
                pos = doc.positionAt( symbol.charOffset );
            }
            else {
                pos = utilities.positionNumberInBuffer( textBuffer, symbol.charOffset );
            }
    
            let info : SymbolInformation = {
                name: symbol.symbolName,
                kind: SymbolKind.Function,
                location: { 
                    uri : node,
                    range: {
                        start: { line: pos.line, character: pos.character},
                        end: {line: pos.line, character: pos.character + symbol.symbolName.length}
                    }
                }
            };
    
            results.push( info );    
        }
    }

    return results;
}


async function signatureGetSymbol( textDocumentPosition: TextDocumentPositionParams ) : Promise<SymbolResult> {

    let settings = await getDocumentSettings(textDocumentPosition.textDocument.uri);

    // find the token just to the left of us.
    let token : string = SignatureHelper.getTokenBeneath( textDocumentPosition );
    if ( !token || token.length == 0) {
        return null;
    }
    
    let result = signatureFindSymbolInMap( token, textDocumentPosition.textDocument.uri, settings );
    if ( !result ) {
        return null;
    }

    // dont active hover if we are over the declaration...
    var theDoc = documents.get( textDocumentPosition.textDocument.uri );
    if ( theDoc.positionAt( result.symbol.charOffset ).line == textDocumentPosition.position.line ){
        return null;
    }
    
    return result;
}

function signatureFindSymbolInMap( token : string, rootFileUri : string, settings : SheerpowerBasicSettings ) : SymbolResult {
    
    token = token.toLowerCase();

    // if we are in a spinc and told to use the root spsrc, then find it, and use it
    if ( settings.recursiveSearchForRoutinesByRootSpsrc && !utilities.isFileUriARootSourceFile( rootFileUri.toLowerCase() )) {
        rootFileUri = symbolMap.findRootFileForInclude( rootFileUri.toLowerCase() );
    }
        
    let urisToSearch : Array<string> = [ rootFileUri ];

    // if we are asked to search recursively, then build a list of files whose symbols we care about
    if ( settings.recursiveSearchForRoutines )
    {
        for ( var index = 0; index < urisToSearch.length; index ++) {
            var includes = symbolMap.includesForFileUri( urisToSearch[index] );
            if ( !includes) {
                continue;
            }

            for( var subindex = 0; subindex < includes.length; subindex ++ )
            {
                let node = includes[subindex];

                if ( urisToSearch.indexOf( node.fileUri ) < 0 ){
                    urisToSearch.push( node.fileUri );
                }
            }
        }
    }

    while ( urisToSearch.length > 0 ) {
        let fileUri : string  = urisToSearch.pop();

        // for now use the current file
        var symbols = symbolMap.symbolsForFileUri( fileUri );
        if ( !symbols ) {
            continue;
        }

        var realNode = symbols.get( token );
        if ( ! realNode) {
            continue;
        }

        return { fileUri : fileUri, symbol : realNode };
    }

    return null;
}

export declare class SymbolLocation {
    fileUri : string;
    position : Position;
    symbol : string;
}

// expects two arguments, the document uri, the <function name>.<line offset>
export async function signatureFindFunctionAndLine( args : any [] ) : Promise<SymbolLocation> {
    if ( !args || args.length < 2 ) {
        return null;
    }

    let fileUri : string = args[0]

    let functionName = '';
    let functionOffset : number = 0;

    let FnAndLine : string = args[1];
    let dot : number = FnAndLine.indexOf( '.' );
    if ( dot < 0 )  {
        functionName = FnAndLine;
    }
    else {
        let splits = FnAndLine.split('.');
        functionName = splits[0];
        try
        {
            functionOffset = parseInt( splits[1] );
        }
        catch( err )
        {
            connection.console.error("Error: cant parse the line offset portion of " + FnAndLine );
            return null;
        }
    }
    
    // this will be the global settings for the workspace...
    let settings = await getDocumentSettings(fileUri);

    // now look up the symbol in the map
    let symbol = signatureFindSymbolInMap( functionName, fileUri, settings );
    if ( !symbol ) {
        return null;
    }

    let pos : Position = null;
    let doc = utilities.isDocumentOpen( symbol.fileUri );
    if ( doc ) {
        pos = doc.positionAt( symbol.symbol.charOffset );
    }
    else {
        pos = utilities.positionNumberInFile( utilities.toFilenameFromUri( symbol.fileUri ), symbol.symbol.charOffset );
    }

    // return the details so it can be handled...
    return { 
        fileUri: symbol.fileUri,
        symbol: symbol.symbol.symbolName,
        position: { line: pos.line + functionOffset, character: 0}
    };
}

// expects two arguments. first one is the current document uri, second is current position, 
// and the third is the line offset
export function signatureFindLineInCurrentFunction( args : any [] ) : SymbolLocation {
    if ( !args || args.length < 3 ) {
        return null;
    }

    let functionOffset : number = 0;

    let fileUri : string = args[0];
    let pos : Position = args[1];
    if (!pos) {
        return null;
    }

    try
    {
        functionOffset = parseInt( args[2] );
    }
    catch( err )
    {
        connection.console.error("Error: cant parse the line offset portion of " + args[1] );
        return null;
    }

    let doc = utilities.isDocumentOpen( fileUri );
    if( !doc ){
        return null;
    }

    let symbols = symbolMap.symbolsForFileUri( fileUri.toLowerCase());
    if ( !symbols) {
        return null;
    }

    let currentOffset = doc.offsetAt( pos );
    let nearestSymbol : symbolDeclaration = null;

    var keys = symbols.keys();
    for( var key of keys ) {
        let symbol = symbols.get( key );

        if ( symbol.charOffset <= currentOffset ) {
            if ( !nearestSymbol || nearestSymbol.charOffset < symbol.charOffset ) {
                nearestSymbol = symbol;
            }
        }
    }

    if ( !nearestSymbol) {
        return null;
    }

    // find the pos for the start of the routine
    let newPos = doc.positionAt( nearestSymbol.charOffset );
      
    // return the details so it can be handled...
    return { 
        fileUri: fileUri,
        symbol: nearestSymbol.symbolName,
        position: { line: newPos.line + functionOffset, character: 0}
    };
}

export declare class IncludeFile {
    fileUri: string;
    filename: string;
}

// expects one argument, the uri of the current open document
export function signatureGetIncludesForFile( args : string [] ) : IncludeFile [] {
    if ( !args || args.length == 0 ) {
        return null;
    }

    let fileUri : string = args[0];
    let includes = symbolMap.includesForFileUri( fileUri.toLowerCase() );
    if ( ! includes) {
        return [];
    }

    let results : Array<IncludeFile> = [];
    for ( var index = 0; index < includes.length; index ++ ) {
        let include = includes[index];

        results.push( {
            fileUri: include.fileUri,
            filename: include.realSourceFilename
        });
    }

    return results;
}

// one argument: the uri of the current focussed document
export function signatureGetSymbolsForFile( args : string [] ) : SymbolLocation [] {
    if ( !args || args.length == 0 ) {
        return null;
    }

    let fileUri : string = args[0];
    let symbols = symbolMap.symbolsForFileUri( fileUri.toLowerCase() );
    if ( ! symbols) {
        return [];
    }

    let doc = utilities.isDocumentOpen( fileUri );
    if ( !doc ) {
        return [];
    }

    let results : SymbolLocation [] = [];

    let keys = symbols.keys();
    for ( var node of keys ) {
        let symbol = symbols.get( node );
        if ( !symbol){
            continue;
        }

        // figure out the offset in the document
        // TODO: is this really slow ?
        let pos = doc.positionAt( symbol.charOffset );

        results.push( {
            symbol: symbol.symbolName,
            fileUri: symbol.sourceFilename,
            position: pos
        });
    }

    return results;
}

// disk notification that a file changed...
export async function signatureWatchedFileChanged( fileevent : FileEvent ) {

    connection.console.log( "file notification for: " + fileevent.uri + ' of type: ' + fileevent.type.toString() );

    let isPresent : boolean = symbolMap.isFileUriPresentInCache( fileevent.uri );

    switch( fileevent.type ) {
        case FileChangeType.Created:
            // ignore for now until someone refers to it.
        break;
        case FileChangeType.Changed:
            if ( isPresent ) {
                // force a reparse.
                await symbolMap.update( fileevent.uri );
            }
        break;
        case FileChangeType.Deleted:
            if ( isPresent ) {
                // remove from the cache. no longer exists.
                symbolMap.remove( fileevent.uri );
            }
            break;
    }
}

// we are asked to reset the entire cache...
export async function signatureResetCache() {
    symbolMap.resetMap();

    // now parse all open sheerpower docs..
    for ( var key of documents.keys() ) {
        symbolMap.update( documents.get(key).uri);
    }
}