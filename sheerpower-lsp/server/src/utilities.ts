/* simple utilities */
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as URI from 'vscode-uri';

import {
    TextDocument,
    Position,
} from 'vscode-languageserver';

import { documents, connection, SheerpowerBasicSettings } from './server';

export function resolveSheerpowerFilePath( filename : string, rootFile : string ) : string {
    let rootFolder : string = path.dirname( rootFile );

    return substSheerpowerPathMarker( filename, rootFolder );
}

// substitute the @ sign for the base folder of the spsrc...
export function substSheerpowerPathMarker( filename : string, rootFolder : string ) {
    if ( filename[0] != '@' ) {
        return filename;
    }

    var newPath = path.join( rootFolder, filename.substring( 1, filename.length ) );
    return newPath;
}

// simple function to convert windows filenames to a lowercase uri 
// we can then use as a key in the map. Windows filenames are always
// case insensitive.
export function toLowerCaseUriString( filename : string ) : string {
    return URI.default.file( filename.toLowerCase()).toString()
}

// convert a fileuriname back to a windows file path
export function toFilenameFromUri( fileUri : string ) : string {
    let theUri = URI.default.parse( fileUri);

    if ( theUri.scheme != "file" ) {
        // TODO: error
    }

    return theUri.fsPath;
}

// resolve the sheerpower filename special characters and load the file
export function loadBufferForUri( fileUri : string,
    rootFileUri : string,
    checkDocuments : boolean,
    settings: SheerpowerBasicSettings ) : string {
    // first, resolve the sheerpower filename if it has special characters...
    let filename = toFilenameFromUri( fileUri );
    let rootFile = toFilenameFromUri( rootFileUri );

    filename = resolveSheerpowerFilePath( filename, rootFile );

    let fixedFileUri = toLowerCaseUriString( filename );

    if ( checkDocuments ){
        var doc = isDocumentOpen( fixedFileUri);
        if ( doc ) {
            return doc.getText();
        }
    }

    if ( !fs.existsSync( filename )) {
        connection.console.log("cant find file: " + filename);
        return null;
    }

    if ( settings && settings.maxFileSizeToParse > 0 && fs.statSync( filename ).size > settings.maxFileSizeToParse ) {
        connection.console.log("ignoring file too big (>" + settings.maxFileSizeToParse.toString() + "): " + filename );
        return null;
    }    

    var textBuffer = fs.readFileSync( filename );
    if ( !textBuffer ) {
        connection.console.log("cant load file: " + filename );
        return null;
    }    

    return textBuffer.toString();
}


// remove quite symbols from start and end of string.
export function unquote( text : string ) : string {
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

// pad a string
export function pad(pad : string, str : string, padLeft : boolean) : string {
    if (typeof str === 'undefined') 
      return pad;
    if (padLeft) {
      return (pad + str).slice(-pad.length);
    } else {
      return (str + pad).substring(0, pad.length);
    }
}

export function isFileUriARootSourceFile( fileUri : string ) : boolean {
    let filename : string = toFilenameFromUri( fileUri );
    return ( path.extname( filename ) == '.spsrc' );
}

export function isDocumentOpen( fileUri : string ) : TextDocument {
    let lcFileUri = fileUri.toLowerCase();
    
    let fileKeys : Array<string> = documents.keys();
    for ( let index = 0; index < fileKeys.length; index ++ ) {
        if ( fileKeys[index].toLowerCase() == lcFileUri ) {
            // document exists in the document buffer, means its open, return its contents
            return documents.get( fileKeys[index]);
        }
    }

    return null;
}

export function positionNumberInBuffer( textBuffer : Buffer, charOffset : number ) : Position {
    var length = textBuffer.length;

    var LineNumber = 0;
    var curPos = 0;
    var nextPos = 0;

    // assume that we can use line feeds at least as a EOL marker
    var EOLString = String.fromCharCode(10);

    while ( curPos < length ) {
        nextPos = textBuffer.indexOf( EOLString, curPos );
        if ( nextPos > charOffset || nextPos < 0 ){
            break;
        }

        LineNumber ++;
        curPos = nextPos + 1;
    }

    return { line: LineNumber, character: Math.max( charOffset - curPos, 0 )};
}

// slow way, by getting the buffer
export function positionNumberInFile( filename : string, charOffset : number ) : Position {
    if ( !fs.existsSync( filename )) {
        return null;
    }

    var textBuffer = fs.readFileSync( filename );
    if ( !textBuffer) {
        return null;
    }

    return positionNumberInBuffer( textBuffer, charOffset );
}

export function LoadTextBuffer( filename : string ) : Buffer {
    if ( !fs.existsSync( filename )) {
        return null;
    }

    var textBuffer = fs.readFileSync( filename );
    return textBuffer;
}
