// v8 stage 4: MSIX start-menu entry. Starts the local server on 127.0.0.1 without a console window,
// opens the default browser, and stays in the notification area until the user quits.
//  - One instance per Windows user: a second start opens the running app instead of a second server.
//  - Port 4317 if free, otherwise any free port; the chosen port is written to launch.json in the data folder.
//  - The server and everything it starts are in a job object, so they stop when the launcher stops.
//  - H1: every start makes a new random launch token. The server gets it in SHE_LAUNCH_TOKEN (never on a command line)
//    and gives a session only to a request carrying it; the browser gets it in the URL fragment (/beta/#launch=...),
//    which is never sent in a request. A second start reads it from launch.json in the per-user LocalState folder.
// Compiled with the in-box .NET Framework C# compiler (C# 5); see scripts/build-msix-v8.mjs.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Launcher
{
    const string Title = "한국 환경안전보건관리자 법률조회 프로그램";
    const int PreferredPort = 4317;
    static Process server;
    static IntPtr job = IntPtr.Zero;
    static NotifyIcon tray;
    static string dataDir;
    static int port;
    static string launchToken;
    static volatile bool quitting;
    static volatile bool started;

    [STAThread]
    static int Main()
    {
        dataDir = DataDir();
        Directory.CreateDirectory(dataDir);
        bool first;
        using (var mutex = new Mutex(true, "Local\\SHE-Law-Beta-" + Hash(dataDir), out first))
        {
            if (!first) return OpenRunning() ? 0 : 1;
            try { return Run(); }
            finally { TryDelete(LaunchFile()); }
        }
    }

    static int Run()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string app = Path.Combine(root, "app");
        port = FreePort();
        launchToken = NewToken();
        var psi = new ProcessStartInfo(Path.Combine(app, "node", "node.exe"), "server\\index.js");
        psi.WorkingDirectory = app;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        psi.EnvironmentVariables.Remove("NODE_OPTIONS");
        psi.EnvironmentVariables.Remove("NODE_PATH");
        psi.EnvironmentVariables["SHE_DATA_DIR"] = dataDir;
        psi.EnvironmentVariables["SHE_INSTALLED"] = "1";
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["NODE_ENV"] = "production";
        psi.EnvironmentVariables["SHE_LAUNCH_TOKEN"] = launchToken;

        var ready = new ManualResetEvent(false);
        server = new Process();
        server.StartInfo = psi;
        server.EnableRaisingEvents = true;
        server.OutputDataReceived += (s, e) => { if (e.Data != null && e.Data.StartsWith("SH·E ready")) ready.Set(); };
        server.ErrorDataReceived += (s, e) => { };
        server.Start();
        job = KillOnCloseJob();
        if (job != IntPtr.Zero) AssignProcessToJobObject(job, server.Handle);
        server.BeginOutputReadLine();
        server.BeginErrorReadLine();

        var ui = new Control();
        IntPtr handle = ui.Handle; // message-loop target for callbacks raised on pool threads
        tray = new NotifyIcon();
        tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        tray.Text = "SH·E 법령조회 — 시작 중";
        var menu = new ContextMenuStrip();
        var open = menu.Items.Add("화면 열기", null, (s, e) => OpenBrowser(port, launchToken));
        open.Enabled = false;
        menu.Items.Add("종료", null, (s, e) => Quit());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (s, e) => { if (started) OpenBrowser(port, launchToken); };
        tray.Visible = true;
        // The first start imports the bundled public law data, which can take a few minutes.
        tray.ShowBalloonTip(10000, Title, "시작하는 중입니다. 처음 실행할 때는 법령 초기 자료를 준비하느라 몇 분 걸릴 수 있습니다.", ToolTipIcon.Info);
        // The app's own "종료" (POST /api/shutdown) or a crash ends the server; the launcher follows.
        server.Exited += (s, e) => { quitting = true; ui.BeginInvoke((MethodInvoker)(() => Application.Exit())); };
        ThreadPool.QueueUserWorkItem(_ =>
        {
            bool ok = ready.WaitOne(TimeSpan.FromMinutes(15));
            ui.BeginInvoke((MethodInvoker)(() =>
            {
                if (quitting) return;
                if (!ok || server.HasExited)
                {
                    quitting = true;
                    StopServer();
                    MessageBox.Show("프로그램을 시작하지 못했습니다. PC를 다시 시작한 뒤 다시 실행하세요.", Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Application.Exit();
                    return;
                }
                started = true;
                WriteLaunchFile("{\"port\":" + port + ",\"pid\":" + server.Id + ",\"token\":\"" + launchToken + "\"}");
                open.Enabled = true;
                tray.Text = "SH·E 법령조회 — 실행 중";
                OpenBrowser(port, launchToken);
            }));
        });
        Microsoft.Win32.SystemEvents.SessionEnding += (s, e) => StopServer();
        if (!server.HasExited) Application.Run();
        tray.Visible = false;
        tray.Dispose();
        StopServer();
        return started ? 0 : 1;
    }

    // Asks the server to stop the same way the app's quit button does; it refuses while a job is running.
    static void Quit()
    {
        if (quitting) return;
        if (!started) { quitting = true; StopServer(); Application.Exit(); return; }
        string refusal = RequestShutdown();
        if (refusal != null)
        {
            tray.ShowBalloonTip(5000, Title, refusal, ToolTipIcon.Warning);
            return;
        }
        quitting = true;
        if (!server.WaitForExit(10000)) StopServer();
        Application.Exit();
    }

    static string RequestShutdown()
    {
        try
        {
            var cookies = new CookieContainer();
            string boot = Http("GET", "/api/bootstrap", cookies, null);
            Match m = Regex.Match(boot, "\"csrf\":\"([^\"]+)\"");
            if (!m.Success) return null;
            Http("POST", "/api/shutdown", cookies, m.Groups[1].Value);
            return null;
        }
        catch (WebException e)
        {
            var r = e.Response as HttpWebResponse;
            if (r == null) return null; // server already gone
            using (var reader = new StreamReader(r.GetResponseStream(), Encoding.UTF8))
            {
                Match m = Regex.Match(reader.ReadToEnd(), "\"error\":\"([^\"]+)\"");
                return m.Success ? Regex.Unescape(m.Groups[1].Value) : "종료하지 못했습니다. 잠시 뒤 다시 시도하세요.";
            }
        }
    }

    static string Http(string method, string path, CookieContainer cookies, string csrf)
    {
        var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + path);
        req.Method = method;
        req.CookieContainer = cookies;
        req.Proxy = null;
        req.Timeout = 5000;
        if (csrf == null) req.Headers["x-she-launch"] = launchToken;
        if (csrf != null)
        {
            req.Headers["x-csrf-token"] = csrf;
            req.ContentType = "application/json";
            byte[] body = Encoding.UTF8.GetBytes("{}");
            req.ContentLength = body.Length;
            using (var s = req.GetRequestStream()) s.Write(body, 0, body.Length);
        }
        using (var res = (HttpWebResponse)req.GetResponse())
        using (var reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
            return reader.ReadToEnd();
    }

    static void StopServer()
    {
        try { if (server != null && !server.HasExited) server.Kill(); } catch { }
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
    }

    // Second start: open the running app. The first instance may still be starting, so wait for its port.
    static bool OpenRunning()
    {
        for (int i = 0; i < 240; i++)
        {
            try
            {
                string launch = File.ReadAllText(LaunchFile());
                Match m = Regex.Match(launch, "\"port\":(\\d+)");
                Match t = Regex.Match(launch, "\"token\":\"([A-Za-z0-9_-]+)\"");
                if (m.Success && t.Success)
                {
                    int p = int.Parse(m.Groups[1].Value);
                    using (var c = new TcpClient()) c.Connect(IPAddress.Loopback, p);
                    OpenBrowser(p, t.Groups[1].Value);
                    return true;
                }
            }
            catch { }
            Thread.Sleep(500);
        }
        MessageBox.Show("이미 실행 중인 프로그램에 연결하지 못했습니다. 잠시 뒤 다시 실행하세요.", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    // The token goes in the fragment: the browser keeps it out of the request line, and the beta screen removes it from
    // the address as soon as the page loads.
    static void OpenBrowser(int p, string token)
    {
        try { Process.Start(new ProcessStartInfo("http://127.0.0.1:" + p + "/beta/#launch=" + token) { UseShellExecute = true }); } catch { }
    }

    // 32 random bytes, base64url without padding (43 characters).
    static string NewToken()
    {
        var bytes = new byte[32];
        using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    static int FreePort()
    {
        foreach (int candidate in new[] { PreferredPort, 0 })
        {
            try
            {
                var l = new TcpListener(IPAddress.Loopback, candidate);
                l.Start();
                int chosen = ((IPEndPoint)l.LocalEndpoint).Port;
                l.Stop();
                return chosen;
            }
            catch (SocketException) { }
        }
        throw new InvalidOperationException("no free port");
    }

    // MSIX per-user app data: %LOCALAPPDATA%\Packages\<family name>\LocalState (removed with the app).
    static string DataDir()
    {
        uint len = 0;
        if (GetCurrentPackageFamilyName(ref len, null) == 122 /* ERROR_INSUFFICIENT_BUFFER */)
        {
            var name = new StringBuilder((int)len);
            if (GetCurrentPackageFamilyName(ref len, name) == 0)
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Packages", name.ToString(), "LocalState");
        }
        string overrideDir = Environment.GetEnvironmentVariable("SHE_DATA_DIR");
        if (!string.IsNullOrEmpty(overrideDir)) return overrideDir;
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SHE-Law-Beta-Unpackaged");
    }

    static string LaunchFile() { return Path.Combine(dataDir, "launch.json"); }

    // launch.json holds the launch token. LocalState is inside this Windows user's profile, which other standard users
    // cannot read; the file also gets its own protected access list (this user and SYSTEM only), so extra entries a
    // tool may have added to the profile folder do not reach it.
    static void WriteLaunchFile(string json)
    {
        string path = LaunchFile();
        TryDelete(path);
        var security = new FileSecurity();
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, AccessControlType.Allow));
        byte[] bytes = new UTF8Encoding(false).GetBytes(json);
        using (var f = new FileStream(path, FileMode.Create, FileSystemRights.Write, FileShare.Read, 4096, FileOptions.None, security))
            f.Write(bytes, 0, bytes.Length);
    }
    static void TryDelete(string p) { try { File.Delete(p); } catch { } }
    static string Hash(string s)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(s.ToLowerInvariant()))).Replace("-", "").Substring(0, 16);
    }

    static IntPtr KillOnCloseJob()
    {
        IntPtr h = CreateJobObject(IntPtr.Zero, null);
        if (h == IntPtr.Zero) return h;
        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr ptr = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(info, ptr, false);
            if (!SetInformationJobObject(h, 9 /* JobObjectExtendedLimitInformation */, ptr, (uint)size)) { CloseHandle(h); return IntPtr.Zero; }
        }
        finally { Marshal.FreeHGlobal(ptr); }
        return h;
    }

    sealed class ProcessWaitHandle : WaitHandle
    {
        public ProcessWaitHandle(Process p) { SafeWaitHandle = new Microsoft.Win32.SafeHandles.SafeWaitHandle(p.Handle, false); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS
    {
        public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;
        public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetCurrentPackageFamilyName(ref uint length, StringBuilder name);
}
