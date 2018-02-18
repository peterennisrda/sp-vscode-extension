# Sheerpower Readme

An extension to add support for sheerpower basic (from Touch Technologies) to the vscode editor.

## Features

Supports
Build
Validate
Run

find Function
find Line in Function

Routines explorer view
Included files explorer view

Build list of routines from all related source files. Will provide hover support when typeing argument lists of functions.
Allows you to jump to declaration of routines.

## Requirements

Requires Current build of vscode. Sheerpower Basic version 10.26 onwards.

## Extension Settings

there are currently no configurable settings.

## Known Issues

The view extensions dont always appear, try opening a file from the adhoc view.

## Release Notes

none;

### 0.0.2

Initial release.

### 0.0.6

Release with recursive routine search, hover definitions and some bugs fixed.
routines wont be searched in files larger than 1MB due to a vscode problem.

## 0.0.11

Release with fixes for routines in unsaved files, routine names are considered case-insensitive.
Key maps are restricted to sheerpower files.
Changed the file type of .form and forminc files to be html for now.

## 0.0.12

Release with fixes for finding routines that are in an include off the main spsrc file,
not the current file. We take the name of the current file and look for a spsrc that includes this file,
and use that as the key to locate the routine. If you have more than one spsrc open, it will use the 
first one that includes the current file. This is similar to spdev.

### For more information

Contact chris.turner@e-closing.com

**Enjoy!**