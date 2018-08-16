# Sheerpower Scripting Language Extension (LSP Version)

Language Extension for the Sheerpower Language (Touch Technologies Inc.)
Written by cdturner, with the cooperation of E-closing.com

## Functionality

This provides basic language parsing for sheerpower script. Lists of include files
and list of routines with parameters.

Basic extraction of routine header comments for documentation/hover over help.

Jump to symbol, code complete function declaration.
Basic header snippets and routine snippets for sheerpower scripts.

## Instructions

Parsing is based on the nearest spsrc source code file. It will parse individual spinc files,
but will not be able to search for symbols between then without the spsrc. The root source file
that contains all the include references must be open so it can be parsed and all the references
include file also parsed.  This provides for extensive symbol search across all source files of
a project.

Background reparsing of the current file occurs 3 seconds after you stop typing. This is
to reduce the overhead of the editor, if it is constantly reparsing as you type it causes issues.

## Include files

Searching for include files can include the use of the sheerpower special '@'. This is always
taken to be the folder of the root spsrc file. This is how sheerpower resolves it.

Searching will not handle non-standard logicals. As Javascript has no simple way of resolving this.

On windows all source filenames are case insensitive, and so they are treated that way by the
language parser.

## Debug

on your editor if you open the output window and use the drop down, then you should be able
to see the cosole messages from the language server. This tells you when it ignores, or
can't find a file ... etc.

## Commands/Keys

these are very similar keys to visual studio in C# mode, so they should be familiar.

### Build Sheerpower Source

Compile the sheerpower source code (must be on a spsrc file), report errors, generate a sprun file.

Keys: F6
command name: sheerpowerBasic.buildSheerpower

### Validate Sheerpower Source

Compile the sheerpower source code (must be on a spsrc file), report errors, but dont generate a sprun file.

Keys: Shift + F6
command name: sheerpowerBasic.validateSheerpower

### Run Sheerpower Source

Compile the sheerpower source (must be on a spsrc file), report errors. If error free, execute the
source in sp4gl.exe in breakable mode.

If any command parameters are required, they are asked for before the source is run.

Key: Ctrl + F5
command name: sheerpowerBasic.runSheerpower

### Jump To Routine and Line Offset

Sheerpower often refers to locations by function name.\<line offset from function start\>

E.g.
path_combine.10

this command will ask for the routine name, or the routine name.line offset, and navigate the editor to it.

Key: Ctrl + K followed by F
command name: sheerpowerBasic.FindFunctionLine

### jump To Line Offset within Current Function

Jump to a line offset from the start of the current function

Key: Ctrl + K followed by L
command name: sheerpowerBasic.FindLineInFunction

## Optional Language Extension Control Parameters

The language server exposes many properties that can be used to control how the server responds.

sheerpowerBasic.maxCodeCompletionItems : number [default:50]
Controls the maximum number of code completion items to return.

sheerpowerBasic.recursiveSearchForRoutinesByRootSpsrc : boolean [default:true]
When searching for hover or code completion routines, search all related include files starting from the root spsrc that included us.

sheerpowerBasic.recursiveSearchForRoutines : boolean [default: true]
When searching for hover or code completion routines, search all related include files.

sheerpowerBasic.recursiveParseFiles : boolean [default: true]
When parsing a file, recursively parse any included files also.

sheerpowerBasic.defaultIncludesExtensionsAsSpinc : boolean [default: true]
when handling included files, if there is no file extension use the default .spinc.

sheerpowerBasic.skipFirstTwoLinesOfCommentBlock : boolean [default: true]
When extracting the comment block for routine documentation skip the first two lines.

sheerpowerBasic.maxFileSizeToParse : number [default:2000000]
files that are over a certain size will be ignored when parsing for symbols..

many of the above settings affect the performance of the language server. The recursive settings
will have a noticible speedup if you turn them off.

## Releases

1.0.7 fixed the build and run command because of the loss of window focus.
1.0.4 fixed the build and run command...
1.0.3 made the includes and routines good citizens, conditional on focus being in a sheerpower code window.
1.0.2 fixed the refresh icons in the includes and routines side panels.
1.0.1 initial release after the conversion to language server protocol.

## Currently Missing

Debugger

## TODO

add a command to clear the parse history and restart. This is incase it gets a bet screwy.