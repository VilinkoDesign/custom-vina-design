@echo off
setlocal
cd /d "%~dp0.."
if not defined VINA_NATIVE_ROOT exit /b 2
if not exist .native-build mkdir .native-build
call "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b %errorlevel%
cl /nologo /std:c++20 /EHsc /utf-8 /W4 /I"%VINA_NATIVE_ROOT%" tests\fixtures\personalization-native.cpp /Fo.native-build\personalization-native.obj /Fe.native-build\personalization-native.exe
exit /b %errorlevel%
