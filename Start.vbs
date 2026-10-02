Option Explicit
Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
If Not fso.FileExists(root & "\dist\index.html") Then
  MsgBox "Run npm ci and npm run build in your IDE terminal first.", 48, "SH-E-Law-Check"
  WScript.Quit 1
End If
shell.Run "node.exe --env-file-if-exists=.env build/server/index.js", 0, False
WScript.Sleep 2000
shell.Run "http://127.0.0.1:4317/", 1, False
