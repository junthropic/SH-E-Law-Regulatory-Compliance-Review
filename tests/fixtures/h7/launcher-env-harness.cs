// H7 test harness (tests/v8-env-allowlist.test.ts), compiled together with packaging/msix/launcher/Launcher.cs by the
// same in-box csc the package build uses. It builds the server's start info exactly as Launcher.Run does
// (Launcher.SetServerEnvironment, then the launch token), starts node.exe on a probe script, and prints variable NAMES
// and yes/no checks only, never values.
// Usage: harness.exe <node.exe> <work folder holding server\index.js> <data folder>
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

static class LauncherEnvHarness
{
    static int Main(string[] args)
    {
        var psi = new ProcessStartInfo(args[0], "server\\index.js");
        psi.WorkingDirectory = args[1];
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        Launcher.SetServerEnvironment(psi, Environment.SystemDirectory, args[2], 4317);
        psi.EnvironmentVariables["SHE_LAUNCH_TOKEN"] = "synthetic-harness-token";

        var names = new List<string>();
        foreach (DictionaryEntry e in psi.EnvironmentVariables) names.Add(((string)e.Key).ToUpperInvariant());
        names.Sort(StringComparer.Ordinal);
        Console.WriteLine("NAMES " + string.Join(",", names.ToArray()));
        string root = Path.GetDirectoryName(Environment.SystemDirectory);
        Console.WriteLine("ROOT " + (psi.EnvironmentVariables["SystemRoot"] == root && psi.EnvironmentVariables["windir"] == root));
        Console.WriteLine("PATH " + (psi.EnvironmentVariables["PATH"] == Environment.SystemDirectory + ";" + root));
        foreach (string bad in new[] { "", "relative\\System32", "\\\\server\\share\\System32", Environment.SystemDirectory + ";C:\\elsewhere", Path.Combine(args[1], "missing") })
        {
            try { Launcher.SetServerEnvironment(new ProcessStartInfo("unused"), bad, args[2], 1); Console.WriteLine("BAD accepted"); }
            catch (InvalidOperationException) { Console.WriteLine("BAD refused"); }
        }
        using (var p = Process.Start(psi))
        {
            Console.WriteLine("CHILD " + p.StandardOutput.ReadToEnd().Trim());
            p.WaitForExit();
            Console.WriteLine("EXIT " + p.ExitCode);
        }
        return 0;
    }
}
