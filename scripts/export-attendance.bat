@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================================
REM  Interactive attendance exporter (Windows, no Node required).
REM
REM  Prompts for a year and month, then runs export-attendance.ps1 (ACE OLEDB)
REM  to write an attendance.json (IDENTICAL shape to export-attendance.mjs) to
REM  the Desktop, named by the chosen year (All) or year-month. Import it from
REM  the attendance tab with the «بروز رسانی سوابق» button.
REM ============================================================================

set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%export-attendance.ps1"

echo(
echo  ==== Attendance export (Saman Poolak) ====
echo(

REM ---- Prompt: year -----------------------------------------------------------
set "YEAR="
set /p "YEAR=Which year (Jalali, e.g. 1405): "
echo %YEAR%| findstr /r "^[0-9][0-9][0-9][0-9]$" >nul
if errorlevel 1 (
  echo  ! Invalid year. Enter 4 digits, e.g. 1405.
  goto :end
)

REM ---- Prompt: month(s) -------------------------------------------------------
echo(
echo  Which month(s)?
echo    1^) All
echo    2^) A specific month
set "MCHOICE="
set /p "MCHOICE=Choose 1 or 2: "

set "MONTH=0"
if "%MCHOICE%"=="2" (
  set /p "MONTH=Month number (1-12): "
  echo !MONTH!| findstr /r "^[0-9][0-9]*$" >nul
  if errorlevel 1 ( echo  ! Invalid month. & goto :end )
  if !MONTH! LSS 1 ( echo  ! Month out of range. & goto :end )
  if !MONTH! GTR 12 ( echo  ! Month out of range. & goto :end )
)

REM ---- Build output filename: YEAR.json or YEAR-MM.json ----------------------
set "OUTNAME=%YEAR%"
if not "%MONTH%"=="0" (
  set "MM=0!MONTH!"
  set "MM=!MM:~-2!"
  set "OUTNAME=%YEAR%-!MM!"
)
set "OUTPATH=%USERPROFILE%\Desktop\%OUTNAME%.json"

echo(
echo  Year: %YEAR%   Month: %MONTH% (0 = all)
echo  Output: %OUTPATH%
echo(

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Year "%YEAR%" -Month %MONTH% -OutPath "%OUTPATH%"
if errorlevel 1 (
  echo(
  echo  ! Export failed. Check the DB path/password and that the ACE OLEDB driver is installed.
  goto :end
)

echo(
echo  Done. File written to:
echo    %OUTPATH%
echo  Import it from the attendance tab («بروز رسانی سوابق»).

:end
echo(
pause
endlocal
