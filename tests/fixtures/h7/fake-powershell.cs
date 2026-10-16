// H7 test stand-in (tests/v8-env-allowlist.test.ts). Harmless: it only creates the file FAKE-POWERSHELL-RAN next to
// itself and exits. The test compiles it into a temporary folder as powershell.exe and checks that the app never runs it.
using System;
using System.IO;

static class FakePowerShell
{
    static int Main()
    {
        File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "FAKE-POWERSHELL-RAN"), "ran");
        return 0;
    }
}
