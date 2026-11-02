// v8 stage 4: MSIX start-menu entry. Starts the local server on 127.0.0.1 without a console window,
// opens the default browser, and stays in the notification area until the user quits.
//  - One instance per Windows user: a second start opens the running app instead of a second server.
//  - Port 4317 if free, otherwise any free port; the chosen port is written to launch.json in the data folder.
//  - The server and everything it starts are in a job object, so they stop when the launcher stops.
//  - H7: the server's environment is an allow-list (SetServerEnvironment); the user's variables are not passed on.
//  - H1/F-09: every start makes a new random launch key. The server gets it in SHE_LAUNCH_TOKEN (never on a command
//    line); it is kept in memory only. Every time the launcher opens the browser it makes a new one-time value from
//    the key (NewLaunchValue: works once, for 5 minutes) and puts it in the URL fragment (/beta/#launch=...), which is
//    never sent in a request line. The key never leaves the launcher and the server.
//  - A second start does not read any value: it sends "open" on the local signal pipe (SignalPipe), and the running
//    launcher opens the browser itself with a new value. launch.json holds only the port, the server pid and the pipe
//    name. Only the test package (build-msix-v8.mjs --test-identity) also answers the install test's mint request.
// Compiled with the in-box .NET Framework C# compiler (C# 5); see scripts/build-msix-v8.mjs.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
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
    static string launchKey;
    static string pipeName;
    // A second start sends "open" up to this many times, about 0.5 s apart (about 2 minutes: the first start may still
    // be preparing the law data, and its pipe opens only once the server is ready).
    const int OpenAttempts = 240;
    const int OpenRetryMs = 500;
    const int OpenConnectMs = 100;
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
        launchKey = NewLaunchKey();
        var psi = new ProcessStartInfo(Path.Combine(app, "node", "node.exe"), "server\\index.js");
        psi.WorkingDirectory = app;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        // H7: an environment built from an allow-list, not the user's (see SetServerEnvironment). The launch key is added
        // here only, for node; the browser start below gets nothing from this list.
        SetServerEnvironment(psi, Environment.SystemDirectory, dataDir, port);
        psi.EnvironmentVariables["SHE_LAUNCH_TOKEN"] = launchKey;

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
        var open = menu.Items.Add("화면 열기", null, (s, e) => OpenScreen());
        open.Enabled = false;
        menu.Items.Add("종료", null, (s, e) => Quit());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (s, e) => { if (started) OpenScreen(); };
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
                // The signal pipe opens once the server is ready, and before launch.json, which names it. If the name
                // cannot be taken, the launcher runs on without it (the tray still opens the screen).
                pipeName = PipeName(dataDir);
                new SignalPipe(pipeName, launchKey, port, NowMs, url => ui.BeginInvoke((MethodInvoker)(() => { if (!quitting) OpenBrowser(url); }))).Start();
                WriteLaunchFile("{\"port\":" + port + ",\"pid\":" + server.Id + ",\"pipe\":\"" + pipeName + "\"}");
                open.Enabled = true;
                tray.Text = "SH·E 법령조회 — 실행 중";
                OpenScreen();
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
        // A new one-time value of the launcher's own, so quitting works even after the browser used its value.
        if (csrf == null) req.Headers["x-she-launch"] = NewLaunchValue(launchKey, NowMs());
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

    // Second start: ask the running launcher to open the screen. It reads and receives no value; the running launcher
    // makes one and opens the browser itself. The first instance may still be starting, so it keeps asking a while.
    static bool OpenRunning()
    {
        if (SignalOpen(PipeName(dataDir), OpenAttempts)) return true;
        MessageBox.Show("이미 실행 중인 프로그램에 연결하지 못했습니다. 잠시 뒤 다시 실행하세요.", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    // Sends "open" until the launcher on that pipe answers "ok" (missing or busy pipe: tried again about 0.5 s later).
    internal static bool SignalOpen(string name, int attempts)
    {
        for (int i = 0; i < attempts; i++)
        {
            if (SendRequest(name, "open", OpenConnectMs, SignalPipe.RequestTimeoutMs) == "ok") return true;
            Thread.Sleep(OpenRetryMs);
        }
        return false;
    }

    // One request line to the pipe, one answer line back; null when there is no answer in time.
    internal static string SendRequest(string name, string request, int connectMs, int answerMs)
    {
        try
        {
            using (var c = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification))
            {
                c.Connect(connectMs);
                return WriteLine(c, request, answerMs) ? ReadLine(c, answerMs) : null;
            }
        }
        catch (Exception) { return null; }
    }

    // F-09: every browser start gets a new one-time value, never the launch key.
    static void OpenScreen() { OpenBrowser(ScreenUrl(port, NewLaunchValue(launchKey, NowMs()))); }

    // The value goes in the fragment: the browser keeps it out of the request line, and the beta screen removes it from
    // the address as soon as the page loads.
    internal static string ScreenUrl(int port, string value) { return "http://127.0.0.1:" + port + "/beta/#launch=" + value; }

    static void OpenBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }

    // One-time value (the server checks the same thing, server/launch-token-v8.ts): 56 bytes as unpadded base64url,
    // 75 characters, the standard encoding (the 2 unused bits of the last character are 0).
    //   0..7   issued time, Unix milliseconds, unsigned 64-bit big-endian
    //   8..23  16 random bytes (the server remembers them once the value is used)
    //   24..55 HMAC-SHA256 over bytes 0..23, keyed with the launch key string's UTF-8 bytes (not base64url-decoded)
    // The server accepts it once, from 1 minute before to 5 minutes after the issued time.
    internal static string NewLaunchValue(string key, long issuedMs)
    {
        var nonce = new byte[16];
        using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(nonce);
        return LaunchValue(key, issuedMs, nonce);
    }
    internal static string LaunchValue(string key, long issuedMs, byte[] nonce)
    {
        if (string.IsNullOrEmpty(key)) throw new ArgumentException("no launch key");
        if (issuedMs < 0) throw new ArgumentOutOfRangeException("issuedMs");
        if (nonce == null || nonce.Length != 16) throw new ArgumentException("nonce must be 16 bytes");
        var bytes = new byte[56];
        for (int i = 0; i < 8; i++) bytes[i] = (byte)(issuedMs >> (56 - 8 * i));
        Buffer.BlockCopy(nonce, 0, bytes, 8, 16);
        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key)))
            Buffer.BlockCopy(hmac.ComputeHash(bytes, 0, 24), 0, bytes, 24, 32);
        return Base64Url(bytes);
    }
    static string Base64Url(byte[] bytes) { return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }

    // Unix milliseconds of the system clock.
    internal static long NowMs() { return (DateTime.UtcNow.Ticks - UnixEpochTicks) / TimeSpan.TicksPerMillisecond; }
    const long UnixEpochTicks = 621355968000000000L; // 1970-01-01T00:00:00Z

    // Pipe names are machine-wide; the Windows session number keeps this one to the session, like the Local\ mutex, so
    // the same account signed in twice (remote desktop, fast user switching) has one pipe per session.
    internal static string PipeName(string dataDir) { return "SHE-Law-Beta-" + Process.GetCurrentProcess().SessionId + "-" + Hash(dataDir); }

    // .NET Framework has no "current user only" pipe option, so the access list is built here: this Windows user may
    // read and write, network logons are denied, nothing else is listed and nothing is inherited.
    internal static PipeSecurity PipeAccess()
    {
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.ReadWrite, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
        return security;
    }

    // Longest request or answer line (a one-time value is 75 characters).
    const int MaxLine = 128;

    // One ASCII line without its "\r\n" within timeoutMs. null on time-out or a closed connection; "" for a line longer
    // than MaxLine. The caller then closes the stream, which also cancels a read still waiting.
    static string ReadLine(PipeStream s, int timeoutMs)
    {
        var buf = new byte[MaxLine + 1];
        int len = 0;
        var watch = Stopwatch.StartNew();
        while (len < buf.Length)
        {
            int left = timeoutMs - (int)watch.ElapsedMilliseconds;
            if (left <= 0) return null;
            IAsyncResult r = s.BeginRead(buf, len, buf.Length - len, null, null);
            if (!r.AsyncWaitHandle.WaitOne(left)) return null;
            int n = s.EndRead(r);
            if (n == 0) return null;
            for (int i = len; i < len + n; i++)
                if (buf[i] == (byte)'\n') return Encoding.ASCII.GetString(buf, 0, i).TrimEnd('\r');
            len += n;
        }
        return "";
    }

    static bool WriteLine(PipeStream s, string line, int timeoutMs)
    {
        byte[] bytes = Encoding.ASCII.GetBytes(line + "\n");
        IAsyncResult r = s.BeginWrite(bytes, 0, bytes.Length, null, null);
        if (!r.AsyncWaitHandle.WaitOne(timeoutMs)) return false;
        s.EndWrite(r);
        return true;
    }

    // F-09: the local pipe a second start (and the install test) talks to. One connection at a time; one ASCII request
    // line in, one answer line out, then the connection closes.
    //   open  -> ok, and the browser opens with a new one-time value; at most once per OpenIntervalMs, later signals in
    //            that interval are answered ok and open nothing (a burst of signals cannot flood the screen with windows)
    //   mint  -> a new one-time value, in the test package only (compiled with the test-package symbol below). The Store
    //            package has no such code and answers no.
    //   other -> no
    // A connection that sends no line within RequestTimeoutMs is dropped, so a silent one cannot hold the pipe. Broken or
    // odd connections are ignored and never stop the launcher. If the pipe cannot be made (the name is taken), it is tried
    // again later; the launcher runs on without it meanwhile.
    internal sealed class SignalPipe
    {
        internal const int RequestTimeoutMs = 2000;
        internal const int OpenIntervalMs = 2000;
        const int RetryCreateMs = 1000;
        const int BufferBytes = 4096;
        readonly string name, key;
        readonly int port;
        readonly Func<long> nowMs;
        readonly Action<string> open;
        readonly Stopwatch clock = Stopwatch.StartNew();
        long lastOpen = -1;

        // nowMs: the clock written into values (Launcher.NowMs). open: opens the browser at that URL.
        internal SignalPipe(string name, string key, int port, Func<long> nowMs, Action<string> open)
        {
            this.name = name; this.key = key; this.port = port; this.nowMs = nowMs; this.open = open;
        }

        // Makes the first pipe instance now, so launch.json written next can name it, and serves on a background
        // thread. False when the name could not be taken (the thread keeps trying).
        internal bool Start()
        {
            NamedPipeServerStream first = TryCreate();
            var thread = new Thread(() => Serve(first)); // the thread owns the instance from here on
            thread.IsBackground = true;
            thread.Start();
            return first != null; // a local: the thread may already have taken (and closed) the instance
        }

        NamedPipeServerStream TryCreate()
        {
            try { return new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, BufferBytes, BufferBytes, PipeAccess()); }
            catch (Exception) { return null; }
        }

        // The instance is reused: after each connection the server disconnects the client (Disconnect), which frees the
        // instance even when the client never closes its handle. Closing the instance instead would leave it alive for as
        // long as such a client holds it, and no new instance could be made (one instance at a time).
        void Serve(NamedPipeServerStream first)
        {
            NamedPipeServerStream pipe = first;
            while (true)
            {
                if (pipe == null) pipe = TryCreate();
                if (pipe == null) { Thread.Sleep(RetryCreateMs); continue; }
                try
                {
                    pipe.WaitForConnection();
                    string request = ReadLine(pipe, RequestTimeoutMs);
                    // Wait (briefly) for the client to read the answer and hang up before it is disconnected.
                    if (request != null && WriteLine(pipe, Answer(request), RequestTimeoutMs)) ReadLine(pipe, RequestTimeoutMs);
                }
                catch (Exception) { Thread.Sleep(50); }
                finally
                {
                    try { pipe.Disconnect(); }
                    catch (Exception) { try { pipe.Dispose(); } catch (Exception) { } pipe = null; }
                }
            }
        }

        internal string Answer(string request)
        {
            if (request == "open")
            {
                long now = clock.ElapsedMilliseconds;
                if (lastOpen < 0 || now - lastOpen >= OpenIntervalMs)
                {
                    lastOpen = now;
                    try { open(ScreenUrl(port, NewLaunchValue(key, nowMs()))); } catch (Exception) { }
                }
                return "ok";
            }
#if SHE_TEST_PIPE
            // Install test only (build-msix-v8.mjs --test-identity): a value for a bootstrap without a browser. The Store
            // build is compiled without this symbol, so it has no way to hand a value out.
            if (request == "mint") return NewLaunchValue(key, nowMs());
#endif
            return "no";
        }
    }

    // H7: the server's whole environment. Nothing is copied from the user's environment, so NODE_OPTIONS, NODE_PATH,
    // NODE_TLS_REJECT_UNAUTHORIZED, NODE_EXTRA_CA_CERTS, NODE_USE_ENV_PROXY, HTTP(S)_PROXY, OPENSSL_CONF, SSL_CERT_FILE and
    // the rest never reach node, in any letter case. systemDir comes from Windows (Environment.SystemDirectory calls
    // GetSystemDirectory), not from SystemRoot/windir; PATH holds only the system folders. Per-user folders come from the
    // shell's known-folder API. Values are never printed.
    internal static void SetServerEnvironment(ProcessStartInfo psi, string systemDir, string dataDir, int port)
    {
        if (string.IsNullOrEmpty(systemDir) || !Regex.IsMatch(systemDir, @"^[A-Za-z]:\\[^;]+$") || !Directory.Exists(systemDir))
            throw new InvalidOperationException("Windows system folder not found");
        string root = Path.GetDirectoryName(systemDir);
        psi.EnvironmentVariables.Clear();
        psi.EnvironmentVariables["SystemRoot"] = root;
        psi.EnvironmentVariables["windir"] = root;
        psi.EnvironmentVariables["PATH"] = systemDir + ";" + root;
        string temp = Path.GetTempPath().TrimEnd('\\');
        psi.EnvironmentVariables["TEMP"] = temp;
        psi.EnvironmentVariables["TMP"] = temp;
        // USERPROFILE is needed by PowerShell (DPAPI helper started by the server); the app-data paths are passed on to it.
        SetFolder(psi, "USERPROFILE", Environment.SpecialFolder.UserProfile);
        SetFolder(psi, "APPDATA", Environment.SpecialFolder.ApplicationData);
        SetFolder(psi, "LOCALAPPDATA", Environment.SpecialFolder.LocalApplicationData);
        psi.EnvironmentVariables["SHE_DATA_DIR"] = dataDir;
        psi.EnvironmentVariables["SHE_INSTALLED"] = "1";
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["NODE_ENV"] = "production";
    }
    static void SetFolder(ProcessStartInfo psi, string name, Environment.SpecialFolder folder)
    {
        string path = Environment.GetFolderPath(folder);
        if (!string.IsNullOrEmpty(path)) psi.EnvironmentVariables[name] = path;
    }

    // The launch key: 32 random bytes, base64url without padding (43 characters). New on every start; memory only.
    static string NewLaunchKey()
    {
        var bytes = new byte[32];
        using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(bytes);
        return Base64Url(bytes);
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

    // launch.json holds only the port, the server pid and the signal pipe's name: no launch key and no one-time value
    // (the pipe name is not a secret; the install test reads it). LocalState is inside this Windows user's profile, which
    // other standard users cannot read; the file also gets its own protected access list (this user and SYSTEM only), so
    // extra entries a tool may have added to the profile folder do not reach it.
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
