// Matrix Games native launcher. Independent implementation; no Content Manager dependency.
// Protocol references: gro-ove/actools AcTools/Processes/Game.Properties.cs (REMOTE)
// and AcManager.Tools/Starters/NaiveStarter.cs (installed game process).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

public sealed class BoundedWebClient : WebClient {
    protected override WebRequest GetWebRequest(Uri address) {
        var request=base.GetWebRequest(address);request.Timeout=15000;
        var http=request as HttpWebRequest;if(http!=null){http.ReadWriteTimeout=15000;http.AllowAutoRedirect=false;http.UserAgent="MatrixGamesLauncher/2.0";}return request;
    }
}

public class MatrixGamesLauncher : Form {
    readonly TextBox root = new TextBox { Width=480 };
    readonly TextBox name = new TextBox { Width=260, Text="Driver" };
    readonly TextBox session = new TextBox { Width=480 };
    readonly Label status = new Label { AutoSize=false, Width=570, Height=150 };
    readonly Button launch = new Button { Text="Check content and join", Width=210, Height=36 };
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=131072 };
    static string Token(string value) { if(!Regex.IsMatch(value??"", "^[A-Za-z0-9_-]{1,80}$"))throw new Exception("Invalid content identifier"); return value; }
    static int Port(object value) { int p=Convert.ToInt32(value); if(p<1||p>65535)throw new Exception("Invalid port");return p; }
    public static string JoinCode(string value) {
        var match=Regex.Match(value??"",@"\Amatrixgames://join/?\?authorization=([A-Za-z0-9_-]{43})\z",RegexOptions.IgnoreCase);
        if(!match.Success)throw new Exception("Invalid Matrix Games join link. Return to the website and click Join again.");
        return match.Groups[1].Value;
    }
    static Dictionary<string,object> ReadSession(string file) {
        if(new FileInfo(file).Length>4096)throw new Exception("Session file is too large");
        var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));
        if(Convert.ToInt32(d["schema"])!=2||!Regex.IsMatch(Convert.ToString(d["authorization"]),"^[A-Za-z0-9_-]{43}$")||Convert.ToDouble(d["expiresAt"])<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())throw new Exception("Join authorization expired. Return to the website and click Join again.");
        return d;
    }
    static void ValidateServer(Dictionary<string,object> d) {
        string room=Convert.ToString(d["room"]),track=Convert.ToString(d["track"]),host=Convert.ToString(d["host"]);
        if(Convert.ToInt32(d["schema"])!=2||!(room=="nohesi-110"&&track=="nohesi_110"||room=="nohesi-415"&&track=="nohesi_415")||Convert.ToString(d["model"])!="06_ygt_53_nissan_350z")throw new Exception("Unsupported server content");
        if(host.Length<1||host.Length>253||!host.Split('.').All(part=>Regex.IsMatch(part,"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")))throw new Exception("Invalid server host");
        Port(d["httpPort"]);Port(d["gamePort"]);
        if(Convert.ToDouble(d["expiresAt"])<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()||!Regex.IsMatch(Convert.ToString(d["password"]),"^mg1\\.[A-Za-z0-9_-]{1,180}\\.[A-Za-z0-9_-]{43}$"))throw new Exception("Join authorization expired. Click Join again on the website.");
    }
    public static string ProtocolCommand(string executable) {
        if(!Path.IsPathRooted(executable)||executable.Contains("\"")||executable.Any(char.IsControl))throw new Exception("Invalid launcher installation path");
        return "\""+executable+"\" \"%1\"";
    }
    static string InstallBrowserJoins() {
        string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MatrixGames","Launcher");
        string target=Path.Combine(folder,"MatrixGamesLauncher.exe"),current=Application.ExecutablePath,command=ProtocolCommand(target);
        using(var existing=Registry.CurrentUser.OpenSubKey(@"Software\Classes\matrixgames\shell\open\command")){
            if(existing!=null&&Convert.ToString(existing.GetValue(""))!=command)throw new Exception("The matrixgames link type is registered to another application. Its registration has been left unchanged.");
        }
        Directory.CreateDirectory(folder);
        if(!string.Equals(current,target,StringComparison.OrdinalIgnoreCase))File.Copy(current,target,true);
        using(var key=Registry.CurrentUser.CreateSubKey(@"Software\Classes\matrixgames")){
            key.SetValue("","URL:Matrix Games Join");key.SetValue("URL Protocol","");
            using(var icon=key.CreateSubKey("DefaultIcon"))icon.SetValue("","\""+target+"\",0");
            using(var open=key.CreateSubKey(@"shell\open\command"))open.SetValue("",command);
        }
        return target;
    }
    static string[] ValidateContent(string directory,Dictionary<string,object> d) {
        var missing=new List<string>();
        foreach(var relative in new[]{"acs.exe","dwrite.dll",Path.Combine("content","tracks",Token((string)d["track"])),Path.Combine("content","cars",Token((string)d["model"])),Path.Combine("content","cars","nohesi_traffic_toyota_prius")})
            if(!File.Exists(Path.Combine(directory,relative))&&!Directory.Exists(Path.Combine(directory,relative)))missing.Add(relative);
        return missing.ToArray();
    }
    static string InstallGuess() {
        string steam=Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam","SteamPath", ""));
        var candidates=new List<string>();if(steam.Length>0)candidates.Add(Path.Combine(steam,"steamapps","common","assettocorsa"));
        string libraries=Path.Combine(steam,"steamapps","libraryfolders.vdf");
        if(File.Exists(libraries))foreach(Match m in Regex.Matches(File.ReadAllText(libraries),"\"path\"\\s*\"([^\"]+)\""))candidates.Add(Path.Combine(m.Groups[1].Value.Replace("\\\\","\\"),"steamapps","common","assettocorsa"));
        return candidates.FirstOrDefault(p=>File.Exists(Path.Combine(p,"acs.exe")))??"";
    }
    static string SteamId() {
        object account=Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam\ActiveProcess","ActiveUser",0);
        uint id=unchecked((uint)Convert.ToInt32(account));if(id==0||!Process.GetProcessesByName("steam").Any())throw new Exception("Open Steam and sign in to the account that owns Assetto Corsa.");
        return (76561197960265728UL+id).ToString();
    }
    public static string RaceConfig(Dictionary<string,object> d,string driver,string guid,string skin) {
        if(driver.Length<1||driver.Length>32||driver.Any(char.IsControl)||driver.Contains("=")||driver.Contains("["))throw new Exception("Use a driver name of 1–32 plain characters");
        Token(skin);Token((string)d["track"]);Token((string)d["model"]);
        if(!Regex.IsMatch(guid,"^[0-9]{17}$"))throw new Exception("A valid Steam account is required");
        return "[HEADER]\r\nVERSION=2\r\n[RACE]\r\nTRACK="+d["track"]+"\r\nCONFIG_TRACK=\r\nMODEL="+d["model"]+"\r\nMODEL_CONFIG=\r\nCARS=1\r\nAI_LEVEL=98\r\nFIXED_SETUP=0\r\nPENALTIES=0\r\n[REMOTE]\r\nACTIVE=1\r\nSERVER_IP="+d["host"]+"\r\nSERVER_PORT="+Port(d["gamePort"])+"\r\nSERVER_HTTP_PORT="+Port(d["httpPort"])+"\r\nREQUESTED_CAR="+d["model"]+"\r\nNAME="+driver+"\r\nGUID="+guid+"\r\nTEAM=\r\nPASSWORD=\r\n[CAR_0]\r\nMODEL=-\r\nSKIN="+skin+"\r\nDRIVER_NAME="+driver+"\r\nNATIONALITY=USA\r\n[SESSION_0]\r\nNAME=Practice\r\nTYPE=1\r\nDURATION_MINUTES=0\r\nSPAWN_SET=PIT\r\n[REPLAY]\r\nACTIVE=0\r\n[GHOST_CAR]\r\nRECORDING=0\r\nPLAYING=0\r\n[WEATHER]\r\nNAME=3_clear\r\n[TEMPERATURE]\r\nAMBIENT=26\r\nROAD=32\r\n[LIGHTING]\r\nSUN_ANGLE=6\r\nTIME_MULT=1\r\n[ASSISTS]\r\nAUTO_CLUTCH=0\r\nAUTO_BLIP=1\r\nAUTO_SHIFTER=0\r\nIDEAL_LINE=0\r\nSTABILITY_CONTROL=0\r\nABS=1\r\nTRACTION_CONTROL=1\r\n";
    }
    public MatrixGamesLauncher(string input) {
        Text="Matrix Games - Assetto Corsa";Width=640;Height=540;StartPosition=FormStartPosition.CenterScreen;
        var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,Padding=new Padding(22),WrapContents=false};Controls.Add(panel);
        panel.Controls.Add(new Label{Text="Join from your browser. No session files needed.",AutoSize=true});
        var install=new Button{Text="Enable browser joins",Width=210,Height=36,Visible=string.IsNullOrEmpty(input)};
        install.Click+=(s,e)=>{try{InstallBrowserJoins();status.Text="Browser joins enabled. Return to matrixgames.app/driving and click Join with Assetto Corsa. You can close this setup window.";}catch(Exception error){status.Text=error.Message;}};panel.Controls.Add(install);
        panel.Controls.Add(new Label{Text="Assetto Corsa folder",AutoSize=true});root.Text=Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\MatrixGames\Launcher","GameDirectory",InstallGuess()));panel.Controls.Add(root);
        var browse=new Button{Text="Choose game folder",Width=180};browse.Click+=(s,e)=>{using(var dialog=new FolderBrowserDialog())if(dialog.ShowDialog()==DialogResult.OK)root.Text=dialog.SelectedPath;};panel.Controls.Add(browse);
        session.Text=input??"";
        var open=new Button{Text="Open an older session file",Width=210};open.Click+=(s,e)=>{using(var dialog=new OpenFileDialog{Filter="Matrix Games session|*.mgjoin.json"})if(dialog.ShowDialog()==DialogResult.OK){session.Text=dialog.FileName;status.Text="Session selected. Click Check content and join.";}};panel.Controls.Add(open);
        panel.Controls.Add(new Label{Text="Driver name",AutoSize=true});name.Text=Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\MatrixGames\Launcher","DriverName","Driver"));panel.Controls.Add(name);panel.Controls.Add(launch);panel.Controls.Add(status);
        status.Text="First time: enable browser joins, then return to the website. Steam must be signed in and the matching track, 350Z, traffic Prius and CSP installed. Your race settings are restored after play.";
        launch.Click+=async(s,e)=>{launch.Enabled=false;try{await Join();}catch(Exception error){status.Text=error.Message;}finally{launch.Enabled=true;}};
        if(!string.IsNullOrEmpty(input)&&input.StartsWith("matrixgames:",StringComparison.OrdinalIgnoreCase)){
            JoinCode(input);
            Shown+=(s,e)=>launch.PerformClick();
        }
    }
    async Task Join() {
        using(var mutex=new Mutex(false,@"Local\MatrixGames.AssettoLaunch")){
            bool held=false;try{try{held=mutex.WaitOne(0);}catch(AbandonedMutexException){held=true;}
                if(!held)throw new Exception("A Matrix Games launch is already running. Close the other launcher before joining again.");
                await JoinCore();
            }finally{if(held)mutex.ReleaseMutex();}
        }
    }
    async Task JoinCore() {
        if(string.IsNullOrWhiteSpace(session.Text))throw new Exception("Return to matrixgames.app/driving and click Join with Assetto Corsa.");
        string driver=name.Text.Trim();if(driver.Length<1||driver.Length>32||driver.Any(char.IsControl)||driver.Contains("=")||driver.Contains("["))throw new Exception("Use a driver name of 1-32 plain characters");
        string authorization=session.Text.StartsWith("matrixgames:",StringComparison.OrdinalIgnoreCase)?JoinCode(session.Text):Convert.ToString(ReadSession(session.Text)["authorization"]);
        string directory=Path.GetFullPath(root.Text);
        if(!File.Exists(Path.Combine(directory,"acs.exe")))throw new Exception("Choose your installed Assetto Corsa folder first.");
        if(Process.GetProcessesByName("acs").Any()||Process.GetProcessesByName("acs_x86").Any())throw new Exception("Exit the current Assetto Corsa session before joining.");
        string guid=SteamId();status.Text="Authorizing your join...";
        Dictionary<string,object> d;
        using(var web=new BoundedWebClient()){
            web.Headers[HttpRequestHeader.ContentType]="application/json";
            try{
                var reply=await web.UploadStringTaskAsync(new Uri("https://api.matrixgames.app/v1/driving/native-redeem"),Json.Serialize(new{authorization=authorization,steamId=guid}));
                d=Json.Deserialize<Dictionary<string,object>>(reply);
            }catch(WebException){throw new Exception("Join authorization expired or could not be verified. Return to the website and click Join again.");}
        }
        ValidateServer(d);
        var missing=ValidateContent(directory,d);if(missing.Length>0)throw new Exception("Install required content, then click Join again on the website:\n"+string.Join("\n",missing));
        using(var preferences=Registry.CurrentUser.CreateSubKey(@"Software\MatrixGames\Launcher")){preferences.SetValue("GameDirectory",directory);preferences.SetValue("DriverName",name.Text.Trim());}
        status.Text="Checking the native server...";
        string info,features;
        using(var web=new BoundedWebClient()){
            string origin="http://"+d["host"]+":"+Port(d["httpPort"]);
            info=await web.DownloadStringTaskAsync(new Uri(origin+"/INFO"));
            string extended=await web.DownloadStringTaskAsync(new Uri(origin+"/JSON%7C0"));
            var details=Json.Deserialize<Dictionary<string,object>>(extended);object raw;
            var names=details.TryGetValue("Features",out raw)?((System.Collections.IEnumerable)raw).Cast<object>().Select(Convert.ToString).ToArray():new string[0];
            if(names.Length>64||names.Any(n=>!Regex.IsMatch(n,"^[A-Z0-9_]{1,64}$")))throw new Exception("Invalid server feature list");
            features=string.Join(",",names);
        }
        if(info.Length>131072)throw new Exception("Invalid server response");var server=Json.Deserialize<Dictionary<string,object>>(info);
        object track;if(!server.TryGetValue("track",out track))throw new Exception("Server did not advertise a track");
        string advertised=Convert.ToString(track);var csp=Regex.Match(advertised,@"^csp/[0-9]+/\.\./([A-Za-z0-9_-]+)$");if(csp.Success)advertised=csp.Groups[1].Value;
        if(!string.Equals(advertised,(string)d["track"],StringComparison.OrdinalIgnoreCase))throw new Exception("Server track changed. Return to the website and click Join again.");
        string skin=Directory.GetDirectories(Path.Combine(directory,"content","cars",(string)d["model"],"skins")).Select(Path.GetFileName).OrderBy(n=>n).FirstOrDefault();if(skin==null)throw new Exception("The car has no installed skins");
        string config=RaceConfig(d,name.Text.Trim(),guid,skin).Replace("PASSWORD=\r\n","PASSWORD="+d["password"]+"\r\n").Replace("[HEADER]\r\n","[HEADER]\r\n__CM_FEATURE_SET=2\r\n").Replace("[REMOTE]\r\n","[REMOTE]\r\n__CM_EXTENDED=1\r\n__FEATURES="+features+"\r\n"),cfg=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"Assetto Corsa","cfg"),path=Path.Combine(cfg,"race.ini");Directory.CreateDirectory(cfg);
        string backup=path+".matrixgames-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fffffff")+".bak";bool existed=File.Exists(path);if(existed)File.Copy(path,backup,false);
        File.WriteAllText(path,config,new UTF8Encoding(false));
        try {
            var start=new ProcessStartInfo{FileName=Path.Combine(directory,"acs.exe"),WorkingDirectory=directory,UseShellExecute=false};start.EnvironmentVariables["SteamAppId"]="244210";start.EnvironmentVariables["SteamGameId"]="244210";
            using(var process=Process.Start(start)){status.Text="Assetto Corsa is running. Steam and the server verify your account.";await Task.Run(()=>process.WaitForExit());}
        } finally {
            if(File.Exists(path)&&File.ReadAllText(path)==config){if(existed)File.Copy(backup,path,true);else File.Delete(path);}
        }
        status.Text="Session ended. Previous race settings restored when unchanged. Backup retained.";
    }
    [STAThread] public static int Main(string[] args) {
        try{
            if(args.Length==3&&args[0]=="--check"){
                var d=ReadSession(args[2]);var missing=ValidateContent(args[1],d);
                Console.WriteLine(Json.Serialize(new{valid=missing.Length==0,missing=missing,contentManagerRequired=false}));return missing.Length==0?0:2;
            }
            if(args.Length==1&&args[0]=="--self-test"){
                var d=new Dictionary<string,object>{{"track","nohesi_110"},{"model","06_ygt_53_nissan_350z"},{"host","example.com"},{"gamePort",9600},{"httpPort",8081}};
                var text=RaceConfig(d,"Driver","76561198000000000","default");if(!text.Contains("ACTIVE=1")||!text.Contains("SERVER_PORT=9600"))throw new Exception("Launch config failed");
                bool rejected=false;try{RaceConfig(d,"bad\n[REMOTE]","76561198000000000","default");}catch{rejected=true;}if(!rejected)throw new Exception("INI injection accepted");var code=new string('a',43);if(JoinCode("matrixgames://join?authorization="+code)!=code)throw new Exception("Protocol parse failed");
                foreach(var bad in new[]{"https://join?authorization="+code,"matrixgames://join?authorization="+code+"&host=evil","matrixgames://join?authorization="+code+"%22","matrixgames://join?authorization=short","matrixgames://evil?authorization="+code,"matrixgames://join?authorization="+code+"\n"}){
                    rejected=false;try{JoinCode(bad);}catch{rejected=true;}if(!rejected)throw new Exception("Unsafe protocol argument accepted");
                }
                if(ProtocolCommand(@"C:\Users\Test User\Launcher.exe")!="\"C:\\Users\\Test User\\Launcher.exe\" \"%1\"")throw new Exception("Protocol command quoting failed");
                Console.WriteLine("Launcher self-tests passed");return 0;
            }
            if(args.Length==1&&args[0]=="--install-browser-joins"){Console.WriteLine("Browser joins enabled: "+InstallBrowserJoins());return 0;}
            if(args.Length>1)throw new Exception("Expected a single Matrix Games join link.");
            Application.EnableVisualStyles();Application.Run(new MatrixGamesLauncher(args.Length>0?args[0]:null));return 0;
        }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
}
