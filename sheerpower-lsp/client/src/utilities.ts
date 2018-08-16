/* generic utility routines */
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {window, Position} from 'vscode';

// compare function for sorting filenames by just the last bit...
export function sortCompareFilenames(a : string, b : string) : number {
    var aname = path.basename(a);
    var bname = path.basename(b);

    if (aname < bname)
      return -1;
    if (aname > bname)
      return 1;
    return 0;
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

// substitute the @ sign for the base folder of the spsrc...
export function substSheerpowerPathMarker( filename : string, rootFolder : string ) {
    if ( filename[0] != '@' ) {
        return filename;
    }

    if ( ! rootFolder ) {
        rootFolder = path.dirname( window.activeTextEditor.document.fileName );
    }
    var newPath = path.join( rootFolder, filename.substring( 1, filename.length ) );
    return newPath;
}

/* convert an character offset in the file, into a line and char position value */
export function positionNumberInFile( filename : string, charOffset : number ) : Position {
    if ( !fs.existsSync( filename )) {
        return null;
    }

    var textBuffer = fs.readFileSync( filename );
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

    return new Position( LineNumber, Math.max( charOffset - curPos, 0 ));
}
