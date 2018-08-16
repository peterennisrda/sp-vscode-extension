/* code to provide the basic sheerpower build commands */
'use strict';

import * as path from 'path';
import { commands,
    window,
    ExtensionContext,
    languages,
    OutputChannel,
    DiagnosticCollection,
    DiagnosticSeverity,
    Uri,
    Range, 
    Diagnostic, 
    Position } from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import * as utilities from './utilities';

// global references to the diagnostics collections for errors and warnings
let currentWarningList : DiagnosticCollection = null;
let currentErrorList : DiagnosticCollection = null;

// simple interface for a callback
interface RunCallback {
    () : void;
}
// initialization routine for build commands
export function buildInitialize(context: ExtensionContext ) {
    console.log('sheerpower build extension is active');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disp_validate = commands.registerCommand('sheerpowerBasic.validateSheerpower', sheerpowerBasicValidateSheerpower);
    context.subscriptions.push(disp_validate);

    let disp_build = commands.registerCommand('sheerpowerBasic.buildSheerpower', sheerpowerBasicBuildSheerpower );
    context.subscriptions.push(disp_build);

    let disp_run = commands.registerCommand('sheerpowerBasic.runSheerpower', sheerpowerBasicRunSheerpower );
    context.subscriptions.push(disp_run);

    // now do the error and warning lists in the output window
    currentWarningList = languages.createDiagnosticCollection('sheerpowerBasic-warning');
    context.subscriptions.push( currentWarningList );
    currentErrorList = languages.createDiagnosticCollection("sheerpowerBasic-error");
    context.subscriptions.push( currentErrorList );
}

// the validate command we expose to the editor
async function sheerpowerBasicValidateSheerpower() {
    resetAll();

    if ( !window.activeTextEditor || !window.activeTextEditor.document )
    {
        return;
    }

    let filename = window.activeTextEditor.document.fileName;
    if ( path.extname( filename ).toLowerCase() != ".spsrc"){
        window.showErrorMessage("cannot validate " + filename + " it is not an spsrc");
        return;
    }

    // TODO: do we need to save all the editors ?
    await window.activeTextEditor.document.save();

    var tmpfile = sheerpowerValidate( filename );
    displayResultLog( tmpfile, "VALIDATE", false );
    var currentDate = new Date();
    lastOutputChannel.appendLine('VALIDATE completed at ' + currentDate.toString() + '\n');
}

// the build command we expose to the editor
async function sheerpowerBasicBuildSheerpower(){
    resetAll();

    if ( !window.activeTextEditor || !window.activeTextEditor.document )
    {
        return;
    }

    let filename = window.activeTextEditor.document.fileName;
    if ( path.extname( filename ).toLowerCase() != ".spsrc"){
        window.showErrorMessage("cannot build " + filename + " it is not an spsrc");
        return;
    }

    // TODO: do we need to save all the editors ?
    await window.activeTextEditor.document.save();

    var tmpfile = sheerpowerBuild( filename );
    displayResultLog( tmpfile, "BUILD", false );
    var currentDate = new Date();
    lastOutputChannel.appendLine('BUILD completed at ' + currentDate.toString() + '\n');
}

// the run command we expose to the editor
async function sheerpowerBasicRunSheerpower() {
    resetAll();

    if ( !window.activeTextEditor || !window.activeTextEditor.document ){
            return;
    }

    let filename = window.activeTextEditor.document.fileName;

    if ( path.extname( filename ).toLowerCase() != ".spsrc"){
            window.showErrorMessage("cannot execute " + filename + " it is not an spsrc");
            return;
    }

    // TODO: do we need to save all the editors ?
    await window.activeTextEditor.document.save();

    // we ask for the args here, because when we run the build it sometimes takes 
    // the focus off the window, and so our input box fails miserably.
    let args : string = await window.showInputBox({prompt: 'Command line arguments ?'});

    // hack for now as vs code keeps hiding our input box
    if ( typeof(args) == 'undefined' ) {
        args = "";
    }

    var tmpfile = sheerpowerValidate( filename );
    displayResultLog( tmpfile, "VALIDATE then RUN", true );

    // only execute if there are no errors.
    if (! lastCommandErrors ) {
        console.log("running command");
        await sheerpowerRunWithArgs ( filename, args, sheerpowerRunComplete );
    }
    else {
        console.log("failed build");
    }
}

// run the sheerpower validate/compile command
function sheerpowerValidate( filename? : string ) {
    let fname : string = createBlankTmpFile();
    let currentFile = filename;
    if ( !currentFile ) {
        currentFile = currentWindowFile();
    }

    // kind of bad, but its always installed there. In fact I dont 
    // think sheerpower runs properly anywhere else.
    let cmd : string = "c:\\sheerpower\\sp4gl.exe";
    let args = [ 
        "/SPDEV",
        "/BUILD",
        "/VALIDATE",
        currentFile,
        fname
    ];

    // TODO: can these be converted to async ?
    cp.execFileSync( cmd, args, {} );

    // return the build file it generates
    return fname;
}

// run the sheerpower build to sprun command
function sheerpowerBuild( filename? : string ) {
    let fname : string = createBlankTmpFile();
    let currentFile = filename;
    if ( !currentFile ) {
        currentFile = currentWindowFile();
    }

    let cmd = "c:\\sheerpower\\sp4gl.exe";
    let args = [ 
        "/SPDEV",
        "/BUILD",
        currentFile,
        fname
    ];

    // TODO: can this be converted to async ?
    cp.execFileSync( cmd, args, {} );

    // return the filename of the build results
    return fname;
}

// execute the current script with sp4gl in breakable mode and pass the 
// arguments provided.
function sheerpowerRunWithArgs( filename : string, cmdargs : string, callback? : RunCallback ) {
    let fname : string = createBlankTmpFile();

    // spdev runs expect a log file...
    let cmd = "c:\\sheerpower\\sp4gl.exe";
    let args = [ 
        "/SPDEV",
        "/RUN",
        filename,
        fname,
        cmdargs
    ];

    cp.execFile( cmd, args, {}, function () {
        sheerpowerRunComplete();
        if ( callback ){
            callback();
        }
    } );

    // return the results log file ename (should be empty)
    return fname;
}

// last output channel we used, so it can be added to easily
var lastOutputChannel : OutputChannel = null;

// did the last command cause an error
var lastCommandErrors : boolean = false;

// reset everything
function resetAll() {
    lastOutputChannel = null;
    lastCommandErrors = false;

    currentErrorList.clear();
    currentWarningList.clear();
}

// display the result from a build operation
// can turn debug errors in the build log into warnings if we are running
function displayResultLog( filename : string,
    command : string,
    debugAsWarning : boolean ) : void {
    var contents = fs.readFileSync( filename, "utf8" );

    var currentDate = new Date();

    var buildOutputChannel = window.createOutputChannel('Sheerpower');
    buildOutputChannel.clear();
    buildOutputChannel.show();
    buildOutputChannel.appendLine('results from sheerpower ' + command + ' at ' + currentDate.toString() + ':\n');
    buildOutputChannel.appendLine(reformatBuildLog( contents ));

    lastOutputChannel = buildOutputChannel;
    var realErrors = hasErrors( contents );

    if ( debugAsWarning ){
        lastCommandErrors = hasErrorsIgnoreDebug( contents );
    } else {
        lastCommandErrors = realErrors;
    }

    // if we found there are errors, then process the list into 
    // vscode style diagnostics, and switch to the problems window
    if ( lastCommandErrors || realErrors ){
        // now process the list for errors and add them to the diagnostic lists...
        processBuildResultsForDiagnostics( contents, debugAsWarning );
        // now switch to the problem window...
        commands.executeCommand("workbench.action.problems.focus");
    }

    fs.unlink(filename, function () {} );
}

// look for error lines in the source code
var errorPattern = /\$error\s*\|([^\|]*)\s+\|(\d*)\s*\|(\d*)\s*\|(.*)/g;
var projectErrorPattern = /\$project_error\s*\|([^\|]*)\s+\at\s+(.*)/g;
var warningPattern = /\$warning\s*\|([^\|]*)\s+\|(\d*)\s*\|(\d*)\s*\|(.*)/g;

function processBuildResultsForDiagnostics( contents : string, debugAsWarning : boolean ) {
    var debugSeverity = DiagnosticSeverity.Error;

    if ( debugAsWarning ) {
        debugSeverity = DiagnosticSeverity.Warning;
    }

    // process for standard error descriptions
    processBuildResults( contents,
         errorPattern,
         DiagnosticSeverity.Error,
         debugSeverity,
         currentErrorList );
    // process for standard warnings
    processBuildResults( contents,
        warningPattern,
        DiagnosticSeverity.Warning,
        null,
        currentWarningList );
    // process for the "project_errors" at the end of the build log
    processPEBuildResults( contents,
        projectErrorPattern,
        DiagnosticSeverity.Error,
        null,
        currentErrorList );
}

// process the build output log for specific error/warning patterns
// these consist of file, line and char offset data.
function processBuildResults( contents : string,
    pattern : RegExp,
    severity : DiagnosticSeverity,
    debugSeverity : DiagnosticSeverity, 
    list : DiagnosticCollection ) {

    let results = null;

    // reset the pattern
    pattern.lastIndex = 0;
    var ErrorsMap = new Map();

    do
    {
        results = pattern.exec( contents );
        if ( results && results.length > 4 ) {
            // index 1 = filename
            // index 2 = line number
            // lindex 3 = char number
            var file = results[1];
            var line = parseInt( results[2]);
            var char = parseInt( results[3]);
            var msg = results[4];

            var thisSeverity = severity;
            if ( debugSeverity ) {
                // check to see if the message has debug
                if ( msg.indexOf( "Debug code not allowed") >= 0 ) {
                    thisSeverity = debugSeverity;
                }
            }

            // editor line and char are zero based internally
            var range = new Range( line -1, char - 1, line -1, 500);
            var Diag = new Diagnostic(range, msg, thisSeverity);

            var thisFile = ErrorsMap.get( file );
            if ( !thisFile ) {
                thisFile = [];
                ErrorsMap.set( file, thisFile );
            }
            thisFile.push( Diag );
        }
    }
    while (results);

    // transfer the errors to the diagnostics...
    ErrorsMap.forEach( function ( value, key ) {
        list.set( Uri.file(key), value );
    });
}

// process the sheerpower build logs
// these tend to be of a different format.
// they tend to be function_name and line offset.
function processPEBuildResults( contents : string,
    pattern : RegExp,
    severity : DiagnosticSeverity,
    debugSeverity : DiagnosticSeverity,
    list :DiagnosticCollection ) {
    var results = null;

    // reset the pattern
    pattern.lastIndex = 0;
    var ErrorsMap = new Map();

    do
    {
        results = pattern.exec( contents );
        if ( results && results.length > 4 ) {
            // index 1 = message
            // index 2 = routinename.line offset
            // lindex 3 = char number
            var msg = results[1];
            var routine = results[2];
            var bits = routine.split( '.' );

            // let functionName : string = bits[0];
            let functionOffset : number = 0;
            if ( bits.length > 1 ) {
                functionOffset = parseInt(bits[1]);
            }

            // lookup the routine to find the file and location stuff
//          var routineData = signature.findRoutine( filename, bits[0] );
            // TODO: disabled until we get symbol lookup running...
            let routineData = null;
            if ( routineData = null ) {
                // TODO: fake it up for now until we get symbol lookup
                routineData = { sourceFilename: "unknown file. Not implemented.", charOffset : 0 };
            }

            // find the starting position of the routine
            let pos = utilities.positionNumberInFile( routineData.sourceFilename, routineData.charOffset );

            if ( !pos ) {
                pos = new Position(0,0);
            }

            var thisSeverity = severity;
            if ( debugSeverity ) {
                // check to see if the message has debug
                if ( msg.indexOf( "Debug code not allowed") >= 0 ) {
                    thisSeverity = debugSeverity;
                }
            }

            // editor line and char are zero based internally
            // use the start of the routine and offset by lines...
            var range = new Range( pos.line + functionOffset, 0, pos.line + functionOffset, 500);
            var Diag = new Diagnostic(range, msg, thisSeverity);

            var thisFile = ErrorsMap.get( routineData.sourceFilename );
            if ( !thisFile ) {
                thisFile = [];
                ErrorsMap.set( routineData.sourceFilename, thisFile );
            }
            thisFile.push( Diag );
        }
    }
    while (results);

    // transfer the errors to the diagnostics...
    ErrorsMap.forEach( function ( value, key ) {
        list.set( Uri.file(key), value );
    });
}

// turn the date and time into a generic timestamp for filenames
function getTimestamp() {
    var currentDate = new Date();

    var years = currentDate.getFullYear().toString();
    var months = currentDate.getMonth().toString();
    var days = currentDate.getDay().toString();

    var hours = currentDate.getHours().toString();
    var minutes = currentDate.getMinutes().toString();
    var seconds = currentDate.getSeconds().toString();

    var padstring = "00";
    var result = years + utilities.pad( padstring, months, true ) + utilities.pad( padstring, days,true ) + "_" +
        utilities.pad( padstring, hours, true ) + utilities.pad ( padstring, minutes, true ) + utilities.pad( padstring, seconds, true );

    return result;
}

// create a blank temp file, sheerpower wont run the build or validate without one
function createBlankTmpFile() {
    var tmpDir = os.tmpdir();

    var fname = path.join( tmpDir, "sheerpower_build_log_" + getTimestamp() + ".log");
    fs.writeFileSync( fname, "" );

    return fname;
}

// get the current window and save the file...
function currentWindowFile() {
    var editor = window.activeTextEditor;
    var doc = editor.document;

    return doc.fileName;
}

// scan the output from a build operation to see if it has errors
function hasErrors( buildlog : string ) : boolean {
    errorPattern.lastIndex = 0;

    let Results = buildlog.match(errorPattern);
    return ( Results != null && Results.length > 0);
}

// scan the output from a build operation to see if it has
// errors, but ignore them if they are only the "there are debug statements"
function hasErrorsIgnoreDebug( buildlog : string ) {
    // reset the pattern
    errorPattern.lastIndex = 0;
    var errorCount = 0;
    var results = null;

    do
    {
        results = errorPattern.exec( buildlog );
        if ( results && results.length > 4 ) {
            var msg = results[4];

            // check to see if the message has debug tag in it
            if ( msg.indexOf( "Debug code not allowed") >= 0 ) {
                continue;
            }

            errorCount ++;
        }
    } while( results );

    return (errorCount > 0 );
}

// replace the error lines with linkable tags. 
// TODO: not working right now
function reformatBuildLog( contents : string ) {
    errorPattern.lastIndex = 0;

    // return contents.replace( errorPattern, "ERROR: $1#$2.$3" );
    return contents;
}

// once the command completes, this callback lets us tag the output...
function sheerpowerRunComplete() {
    var currentDate = new Date();

    var buildOutputChannel = lastOutputChannel;
    if ( !buildOutputChannel) {
        buildOutputChannel = window.createOutputChannel('Sheerpower');
        buildOutputChannel.show();
    }else{
        buildOutputChannel.append('\n');
    }

    buildOutputChannel.appendLine('run completed at ' + currentDate.toString() + '\n');
}

