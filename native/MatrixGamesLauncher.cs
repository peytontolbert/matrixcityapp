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
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

public sealed class BoundedWebClient : WebClient {
    protected override WebRequest GetWebRequest(Uri address) {
        var request=base.GetWebRequest(address);request.Timeout=15000;
        var http=request as HttpWebRequest;if(http!=null){http.ReadWriteTimeout=15000;http.AllowAutoRedirect=false;}return request;
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
    static Dictionary<string,object> ReadSession(string file) {
        if(new FileInfo(file).Length>4096)throw new Exception("Session file is too large");
        var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));
        if(Convert.ToInt32(d["schema"])!=2)throw new Exception("Sign in to Matrix Games and download a fresh authorized session file.");
        if(!Regex.IsMatch(Convert.ToString(d["authorization"]),"^[A-Za-z0-9_-]{43}$")||Convert.ToDouble(d["expiresAt"])<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())throw new Exception("Session authorization expired. Download a fresh session file while signed in.");
        string host=Convert.ToString(d["host"]);
        if(host.Length>253||!host.Split('.').All(s=>Regex.IsMatch(s,"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")))throw new Exception("Invalid server host");
        Port(d["httpPort"]);Port(d["gamePort"]);Token(Convert.ToString(d["track"]));Token(Convert.ToString(d["model"]));
        return d;
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
    public MatrixGamesLauncher(string file) {
        Text="Matrix Games · Native Assetto Corsa";Width=640;Height=520;StartPosition=FormStartPosition.CenterScreen;
        var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,Padding=new Padding(22),WrapContents=false};Controls.Add(panel);
        panel.Controls.Add(new Label{Text="Your installed game. Our shared roads.",AutoSize=true});
        panel.Controls.Add(new Label{Text="Assetto Corsa folder",AutoSize=true});root.Text=InstallGuess();panel.Controls.Add(root);
        var browse=new Button{Text="Choose game folder",Width=180};browse.Click+=(s,e)=>{using(var dialog=new FolderBrowserDialog())if(dialog.ShowDialog()==DialogResult.OK)root.Text=dialog.SelectedPath;};panel.Controls.Add(browse);
        panel.Controls.Add(new Label{Text="Session downloaded from Matrix Games",AutoSize=true});session.Text=file??"";panel.Controls.Add(session);
        var open=new Button{Text="Open session file",Width=180};open.Click+=(s,e)=>{using(var dialog=new OpenFileDialog{Filter="Matrix Games session|*.mgjoin.json"})if(dialog.ShowDialog()==DialogResult.OK)session.Text=dialog.FileName;};panel.Controls.Add(open);
        panel.Controls.Add(new Label{Text="Driver name",AutoSize=true});panel.Controls.Add(name);panel.Controls.Add(launch);panel.Controls.Add(status);
        status.Text="Steam must be signed in. The matching track, 350Z, traffic Prius and CSP must already be installed. Your race settings are backed up and restored after play.";
        launch.Click+=async(s,e)=>{launch.Enabled=false;try{await Join();}catch(Exception error){status.Text=error.Message;}finally{launch.Enabled=true;}};
    }
    async Task Join() {
        var d=ReadSession(session.Text);string directory=Path.GetFullPath(root.Text);
        var missing=ValidateContent(directory,d);if(missing.Length>0)throw new Exception("Install required content first:\n"+string.Join("\n",missing));
        if(Process.GetProcessesByName("acs").Any()||Process.GetProcessesByName("acs_x86").Any())throw new Exception("Exit the current Assetto Corsa session before joining.");
        string guid=SteamId();status.Text="Checking the native server…";
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
        if(!string.Equals(advertised,(string)d["track"],StringComparison.OrdinalIgnoreCase))throw new Exception("Server track changed. Download a new session file.");
        // Fixed account API: a downloaded file can never redirect this capability.
        using(var web=new BoundedWebClient()){
            web.Headers[HttpRequestHeader.ContentType]="application/json";
            var reply=await web.UploadStringTaskAsync(new Uri("https://api.matrixgames.app/v1/driving/native-redeem"),Json.Serialize(new{authorization=d["authorization"],steamId=guid}));
            var grant=Json.Deserialize<Dictionary<string,object>>(reply);string password=Convert.ToString(grant["password"]);
            if(!Regex.IsMatch(password,"^mg1\\.[A-Za-z0-9_-]{1,180}\\.[A-Za-z0-9_-]{43}$"))throw new Exception("Invalid native authorization response");d["password"]=password;
        }
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
                bool rejected=false;try{RaceConfig(d,"bad\n[REMOTE]","76561198000000000","default");}catch{rejected=true;}if(!rejected)throw new Exception("INI injection accepted");Console.WriteLine("Launcher self-tests passed");return 0;
            }
            Application.EnableVisualStyles();Application.Run(new MatrixGamesLauncher(args.Length>0?args[0]:null));return 0;
        }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
}
