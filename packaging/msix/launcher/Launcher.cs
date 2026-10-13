// v8 stage 4: MSIX start-menu entry. Starts the local server on 127.0.0.1 without a console window,
// opens the default browser, and stays in the notification area until the user quits.
//  - One instance per Windows user: a second start opens the running app instead of a second server.
//  - Port 4317 if free, otherwise any free port; the chosen port is written to launch.json in the data folder.
//  - The server and everything it starts are in a job object, so they stop when the launcher stops.
// Compiled with the in-box .NET Framework C# compiler (C# 5); see scripts/build-msix-v8.mjs.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Launcher
{
    const string Title = "한국 환경안전보건관리자 법령조회 프로그램";
    const int PreferredPort = 4317;
    static Process server;
    static IntPtr job = IntPtr.Zero;
    static NotifyIcon tray;
    static string dataDir;
    static int port;
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
        var open = menu.Items.Add("화면 열기", null, (s, e) => OpenBrowser(port));
        open.Enabled = false;
        menu.Items.Add("종료", null, (s, e) => Quit());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (s, e) => { if (started) OpenBrowser(port); };
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
                File.WriteAllText(LaunchFile(), "{\"port\":" + port + ",\"pid\":" + server.Id + "}", new UTF8Encoding(false));
                open.Enabled = true;
                tray.Text = "SH·E 법령조회 — 실행 중";
                OpenBrowser(port);
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
                Match m = Regex.Match(File.ReadAllText(LaunchFile()), "\"port\":(\\d+)");
                if (m.Success)
                {
                    int p = int.Parse(m.Groups[1].Value);
                    using (var c = new TcpClient()) c.Connect(IPAddress.Loopback, p);
                    OpenBrowser(p);
                    return true;
                }
            }
            catch { }
            Thread.Sleep(500);
        }
        MessageBox.Show("이미 실행 중인 프로그램에 연결하지 못했습니다. 잠시 뒤 다시 실행하세요.", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    static void OpenBrowser(int p)
    {
        try { Process.Start(new ProcessStartInfo("http://127.0.0.1:" + p + "/beta/") { UseShellExecute = true }); } catch { }
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
