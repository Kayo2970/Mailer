' Mailer Silent Launcher - Starts Mailer in the background without any terminal or command prompt
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir

' Test if port 3040 is already answering
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
isRunning = False

On Error Resume Next
http.setTimeouts 1000, 1000, 1000, 1000
http.Open "GET", "http://127.0.0.1:3040/", False
http.Send
If Err.Number = 0 Then
  isRunning = True
End If
Err.Clear
On Error GoTo 0

If Not isRunning Then
  ' Start Next.js dev server with window style 0 (vbHide) - NO terminal window
  WshShell.Run "cmd /c npm run dev", 0, False

  ' Wait up to 15 seconds for server to respond
  For i = 1 To 30
    WScript.Sleep 500
    On Error Resume Next
    http.Open "GET", "http://127.0.0.1:3040/", False
    http.Send
    If Err.Number = 0 Then
      isRunning = True
      Err.Clear
      Exit For
    End If
    Err.Clear
    On Error GoTo 0
  Next
End If

' Open Mailer in the user's default browser
WshShell.Run "http://127.0.0.1:3040"

