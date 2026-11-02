// F-09 test harness (tests/v8-launch-pipe.test.ts), compiled together with packaging/msix/launcher/Launcher.cs by the
// same in-box csc the package build uses: once with -define:SHE_TEST_PIPE (test package) and once without (Store package).
// The synthetic launch key comes on standard input, never on the command line. One-time values and URLs go only to
// standard output, which the test reads and does not print. No string literal here spells the test-only pipe request,
// so the test can look for it in the compiled file.
// Usage: harness.exe <mode>    modes: value | serve | signal | name | acl
using System;
using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;

static class LauncherPipeHarness
{
    static int Main(string[] args)
    {
        string mode = args.Length == 1 ? args[0] : "";
        if (mode == "value") return Value();
        if (mode == "serve") return Serve();
        if (mode == "signal") return Signal();
        if (mode == "name") return Name();
        if (mode == "acl") return Acl();
        Console.Error.WriteLine("unknown mode");
        return 2;
    }

    static string Line()
    {
        string s = Console.In.ReadLine();
        if (s == null) throw new InvalidOperationException("standard input closed");
        return s.Trim();
    }

    // stdin: key, issued Unix ms, nonce (32 hex characters). The value for that nonce, then two with fresh random nonces.
    static int Value()
    {
        string key = Line();
        long issued = long.Parse(Line());
        string hex = Line();
        var nonce = new byte[hex.Length / 2];
        for (int i = 0; i < nonce.Length; i++) nonce[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
        Console.WriteLine("FIXED " + Launcher.LaunchValue(key, issued, nonce));
        Console.WriteLine("FRESH " + Launcher.NewLaunchValue(key, issued));
        Console.WriteLine("FRESH " + Launcher.NewLaunchValue(key, issued));
        return 0;
    }

    // stdin: key, pipe name, port, the test's clock (Unix ms; date-matrix runs move it). Serves the launcher's signal pipe
    // until standard input closes. "open" prints the URL the launcher would give the browser instead of starting one.
    static int Serve()
    {
        string key = Line(), name = Line();
        int port = int.Parse(Line());
        long offset = long.Parse(Line()) - Launcher.NowMs();
        var pipe = new Launcher.SignalPipe(name, key, port, () => Launcher.NowMs() + offset, url => Console.WriteLine("OPEN " + url));
        Console.WriteLine("READY " + pipe.Start());
        while (Console.In.ReadLine() != null) { }
        return 0;
    }

    // stdin: pipe name. What a second launcher does (Launcher.OpenRunning without the message box).
    static int Signal()
    {
        string name = Line();
        Console.WriteLine("SIGNAL " + Launcher.SignalOpen(name, 20));
        return 0;
    }

    // stdin: data folder. The pipe name the launcher uses for it, and this process's Windows session.
    static int Name()
    {
        string dir = Line();
        Console.WriteLine("NAME " + Launcher.PipeName(dir));
        Console.WriteLine("SESSION " + Process.GetCurrentProcess().SessionId);
        return 0;
    }

    // The pipe's access list as SDDL, and the current user's SID to compare with.
    static int Acl()
    {
        Console.WriteLine("USER " + WindowsIdentity.GetCurrent().User.Value);
        Console.WriteLine("SDDL " + Launcher.PipeAccess().GetSecurityDescriptorSddlForm(AccessControlSections.Access));
        return 0;
    }
}
