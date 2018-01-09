const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const path = require('path');

module.exports.buildInitialize = buildInitialize;
module.exports.tasksInitialize = tasksInitialize;
module.exports.sheerpowerValidate = sheerpowerValidate;
module.exports.sheerpowerBuild = sheerpowerBuild;
module.exports.sheerpowerRun = sheerpowerRun;
module.exports.resetAll = resetAll;
module.exports.reformatBuildLog = reformatBuildLog;
module.exports.displayResultLog = displayResultLog;
module.exports.getTimestamp = getTimestamp;
module.exports.hasErrors = hasErrors;

var currentWarningList = null;
var currentErrorList = null;
var currentInfoList = null;

function buildInitialize(context) {
    console.log('sheerpower build extension is active');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disp_validate = vscode.commands.registerCommand('sheerpower.validateSheerpower', function () {
        resetAll();

        vscode.window.activeTextEditor.document.save()
            .then( () => {
                var tmpfile = sheerpowerValidate();
                displayResultLog( tmpfile, "VALIDATE" );
                var currentDate = new Date();
                lastOutputChannel.appendLine('VALIDATE completed at ' + currentDate.toString() + '\n');        
            });
    });
    context.subscriptions.push(disp_validate);

    let disp_build = vscode.commands.registerCommand('sheerpower.buildSheerpower', function () {
        resetAll();

        vscode.window.activeTextEditor.document.save()
        .then( () => {
            var tmpfile = sheerpowerBuild();
            displayResultLog( tmpfile, "BUILD" );
            var currentDate = new Date();
            lastOutputChannel.appendLine('BUILD completed at ' + currentDate.toString() + '\n');
        });
    });
    context.subscriptions.push(disp_build);

    let disp_run = vscode.commands.registerCommand('sheerpower.runSheerpower', function () {
        resetAll();

        vscode.window.activeTextEditor.document.save()
        .then( () => {
            var tmpfile = sheerpowerValidate();
            displayResultLog( tmpfile, "VALIDATE then RUN" );

            // only execute if there are no errors.
            if (! lastCommandErrors ) {
                sheerpowerRun();
            }
        });
    });
    context.subscriptions.push(disp_run);

    // now do the error and warning list
    currentWarningList = vscode.languages.createDiagnosticCollection('sheerpower-warning');
    context.subscriptions.push( currentWarningList );
    currentErrorList = vscode.languages.createDiagnosticCollection("sheerpower-error");
    context.subscriptions.push( currentErrorList );
}

function tasksInitialize( context ) {
    var taskProvider = vscode.workspace.registerTaskProvider('sheerpower', {
		provideTasks: () => {
            var buildTask = new vscode.Task( { name: "validate-sp" }, 
            vscode.TaskScope.Workspace,
            "Validate Sheerpower Code",
            new vscode.ShellExecution( "./spbuild.cmd /VALIDATE ${file}" ),
            "$sp-errors" );

            return [ buildTask ];
		},
		resolveTask(task){
			return undefined;
		}
    });
    
    context.subscriptions.push(taskProvider);
}

// run the sheerpower validate 
function sheerpowerValidate() {
    var fname = createBlankTmpFile();
    var currentFile = currentWindowFile();

    var cmd = "c:\\sheerpower\\sp4gl.exe";
    var args = [ 
        "/SPDEV",
        "/BUILD",
        "/VALIDATE",
        currentFile,
        fname
    ];

    cp.execFileSync( cmd, args, {} );

    return fname;
}

// run the sheerpower build command
function sheerpowerBuild() {
    var fname = createBlankTmpFile();
    var currentFile = currentWindowFile();

    var cmd = "c:\\sheerpower\\sp4gl.exe";
    var args = [ 
        "/SPDEV",
        "/BUILD",
        currentFile,
        fname
    ];

    cp.execFileSync( cmd, args, {} );

    return fname;
}

function sheerpowerRun() {
    vscode.window.showInputBox({prompt: 'Command line arguments ?'})
    .then(val => sheerpowerRunWithArgs(val));
}

// run the current source file
function sheerpowerRunWithArgs( cmdargs ) {
    var fname = createBlankTmpFile();
    var currentFile = currentWindowFile();

    // spdev runs expect a log file...
    var cmd = "c:\\sheerpower\\sp4gl.exe";
    var args = [ 
        "/SPDEV",
        "/RUN",
        currentFile,
        fname,
        cmdargs
    ];

    cp.execFile( cmd, args, {}, sheerpowerRunComplete );

    return fname;
}

// last output channel we used, so it can be added to
var lastOutputChannel = null;
// did the last command cause an error
var lastCommandErrors = false;

// reset everything
function resetAll() {
    lastOutputChannel = null;
    lastCommandErrors = false;

    currentErrorList.clear();
    currentWarningList.clear();
}

// display the result from the build operation
function displayResultLog( filename, command ){
    var contents = fs.readFileSync( filename, "utf8" );

    var currentDate = new Date();

    var buildOutputChannel = vscode.window.createOutputChannel('Sheerpower');
    buildOutputChannel.show();
    buildOutputChannel.appendLine('results from sheerpower ' + command + ' at ' + currentDate.toString() + ':\n');
    buildOutputChannel.appendLine(reformatBuildLog( contents ));

    lastOutputChannel = buildOutputChannel;
    lastCommandErrors = hasErrors( contents );

    if ( lastCommandErrors ){
        // now process the list for errors and add them to the diagnostic lists...
        processBuildResultsForDiagnostics( contents );
        // now switch to the problem window...
        vscode.commands.executeCommand("workbench.action.problems.focus");
    }

    fs.unlink(filename);
}

// look for error lines in the source code
var errorPattern = /\$error\s*\|([^\|]*)\s+\|(\d*)\s*\|(\d*)\s*\|(.*)/g;
var warningPattern = /\$warning\s*\|([^\|]*)\s+\|(\d*)\s*\|(\d*)\s*\|(.*)/g;

function processBuildResultsForDiagnostics( contents ) {
    processBuildResults( contents,
         errorPattern,
         vscode.DiagnosticSeverity.Error,
         currentErrorList );
    processBuildResults( contents,
        warningPattern,
        vscode.DiagnosticSeverity.Warning,
        currentWarningList );
}

function processBuildResults( contents, pattern, severity, list ) {
    var results = null;

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
            var fileUri = vscode.Uri.file(file);
            var line = parseInt( results[2]);
            var char = parseInt( results[3]);
            var msg = results[4];

            // editor line and char are zero based internally
            var range = new vscode.Range( line -1, char - 1, line -1, 500);
            var Diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);

            var thisFile = ErrorsMap.get( fileUri );
            if ( !thisFile ) {
                thisFile = [];
                ErrorsMap.set( fileUri, thisFile );
            }
            thisFile.push( Diag );
        }
    }
    while (results);

    // transfer the errors to the diagnostics...
    ErrorsMap.forEach( function ( value, key ) {
        list.set( key, value );
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
    var result = years + pad( padstring, months, true ) + pad( padstring, days,true ) + "_" +
        pad( padstring, hours, true ) + pad ( padstring, minutes, true ) + pad( padstring, seconds, true );

    return result;
}

// padd a string
function pad(pad, str, padLeft) {
    if (typeof str === 'undefined') 
      return pad;
    if (padLeft) {
      return (pad + str).slice(-pad.length);
    } else {
      return (str + pad).substring(0, pad.length);
    }
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
    var editor = vscode.window.activeTextEditor;
    var doc = editor.document;

    // TODO: this is async, how do we make it synchronous ?
    doc.save();
    return doc.fileName;
}

function hasErrors( buildlog ) {
    errorPattern.lastIndex = 0;

    return buildlog.match(errorPattern);
}

// replace the error lines with linkable tags. 
// TODO: not working right now
function reformatBuildLog( contents ) {
    errorPattern.lastIndex = 0;

    // return contents.replace( errorPattern, "ERROR: $1#$2.$3" );
    return contents;
}

// once the command completes, this lets us tag the output...
function sheerpowerRunComplete() {
    var currentDate = new Date();

    var buildOutputChannel = lastOutputChannel;
    if ( !buildOutputChannel) {
        buildOutputChannel = vscode.window.createOutputChannel('Sheerpower');
        buildOutputChannel.show();
    }else{
        buildOutputChannel.append('\n');
    }

    buildOutputChannel.appendLine('run completed at ' + currentDate.toString() + '\n');
}

