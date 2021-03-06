// ==UserScript==
// @name           Whois: Adds a /whois command to show alias nicknames stored on qlstats.net
// @version        1.4
// @author         PredatH0r
// @description    Use "/whois nickname -or- client-id (from /players)"
// @enabled        1
// ==/UserScript==

/*

Verson 1.4
- able to parse broken \players output where player name is printed on next line

Version 1.3
- added flag to indicate players deactivated on qlstats.net (cheaters and other special people)

Version 1.2
- switched back to /configstrings as long as /players is bugged and returns duplicate steam ids (when speccing or when on the same team)

Version 1.1
- using /players instead of /configstrings to get list of players

Version 1.0
- first release

*/

(function () {
  // external global variables
  var qz_instance = window.qz_instance;
  var console = window.console;

  // constants
  var CVAR_whois = "whois";
  var HelpText = "a user script command. Use ^3" + CVAR_whois +" help^7 to get some help.";

  // state variables
  var pendingAjaxRequest = null;
  var playerCache = { timestamp: 0, players: {} }
  var PREFS = { method: "echo" }
  PREFS.set = function (setting, value) { PREFS[setting] = value; }
  var playerInfoProvider = { condumpMarker: "", qlCommand: "", extraQlServlet: "", dataHandler: function() {} }

  function init() {
    // create cvar
    qz_instance.SetCvar(CVAR_whois, HelpText);

    var postal = window.req("postal");
    var channel = postal.channel();
    channel.subscribe("cvar." + CVAR_whois, onCommand);
    channel.subscribe("cvar.ui_mainmenu", function () { playerCache.timestamp = 0; }); // happens on connect and map change

    // "/players" would be better, but is currently bugged and shows duplicate steam-ids, so we have to stick with "/configstrings" for now
    //playerInfoProvider = { condumpMarker: "]\\configstrings", qlCommand: "configstrings", extraQlServlet: "serverinfo", dataHandler: onExtraQLServerInfo };
    playerInfoProvider = { condumpMarker: "]\\players", qlCommand: "players", extraQlServlet: "condump", dataHandler: onExtraQLCondump };

    echo("^2whois.js installed");
  }


  function log(msg) {
    console.log(msg);
  }

  function echo(msg) {
    msg = msg.replace(/\"/g, "'").replace(/[\r\n]+/g, " ");
    qz_instance.SendGameCommand("echo \"" + msg + "\"");
  }

  function onCommand(data) {
    var val = data.value;
    if (val == HelpText)
      return;
    qz_instance.SetCvar(CVAR_whois, HelpText);

    if (val == "help")
      showHelp();
    else if (val == "update") {
      playerCache.timestamp = 0;
      showAliases("*");
    }
    else
      showAliases(val);
  }

 
  function showHelp() {
    echo("Usage:");
    echo("^5/" + CVAR_whois + "^7 ^3*^7 (to get all players' aliases)");
    echo("^5/" + CVAR_whois + "^7 <^3part-of-nickname^7>");
    echo("^5/" + CVAR_whois + "^7 <^3player-id^7> (use /players to list player-ids)");
    echo("^5/" + CVAR_whois + "^3 update^7: force update of cached /player information");
  }


  function showAliases(arg) {
    if (pendingAjaxRequest) {
      echo("Please wait for the current request to complete...");
      return;
    }
    requestPlayerInformation(arg, showInformation);

    function showInformation(aliases) {
      var method = PREFS.method;
      var lines = [];
      for (var steamid in pendingAjaxRequest) {
        if (!pendingAjaxRequest.hasOwnProperty(steamid)) continue;
        var req = pendingAjaxRequest[steamid];
        var player = aliases[steamid];

        var regex = /\^./g;
        var nicks = [ req.name ];
        if (player) {
          for (var strippedNick in player) {
            if (!player.hasOwnProperty(strippedNick)) continue;
            var alias = player[strippedNick];

            if (alias.nick.replace(regex, "") == req.name)
              nicks[0] = alias.nick; // current in-game nick (with maybe different colors)
            else
              nicks.push(alias.nick); // additional nick
          }
        }

        var flag = aliases.deactivated && aliases.deactivated.indexOf(steamid) >= 0 ? "^1\u203c^7" : " ";
        if (method == "echo" || nicks.length > 1)
          lines.push(("0" + req.clientid).substr(-2) + " " + flag + " " + nicks.join("^3 aka ^7"));
      }

      if (lines.length == 0)
        lines.push("No aliases known for " + arg);

      var totalDelay = 0;
      var msgDelay = method == "say" || method == "say_team" ? 1000 : method == "print" ? 100 : 0;
      lines.forEach(function (line) {
        setTimeout(function () { qz_instance.SendGameCommand(method + "\"^3whois: ^7" + line + "\"") }, totalDelay);
        totalDelay += msgDelay;
      });
    }
  }


  function requestPlayerInformation(arg, callback) {
    if (Date.now() - playerCache.timestamp < 60000) {
      requestAliasInformation(arg, playerCache.players, callback);
      return;
    }

    qz_instance.SendGameCommand("echo " + playerInfoProvider.condumpMarker); // text marker required by extraQL servlet
    qz_instance.SendGameCommand(playerInfoProvider.qlCommand);
    setTimeout(function() {
      qz_instance.SendGameCommand("condump extraql_condump.txt");
      setTimeout(function() {
        var xhttp = new XMLHttpRequest();
        xhttp.timeout = 1000;
        xhttp.onload = function() { playerInfoProvider.dataHandler(arg, xhttp, callback); }
        xhttp.onerror = function() {
          echo("^3extraQL.exe not running:^7");
          pendingAjaxRequest = null;
        }
        xhttp.open("GET", "http://localhost:27963/" + playerInfoProvider.extraQlServlet, true);
        xhttp.send();
      }, 100);
    }, 1000);
  }

  function onExtraQLServerInfo(arg, xhttp, callback) {
    if (xhttp.status != 200) {
      pendingAjaxRequest = null;
      return;
    }

    var json = null;
    try {
      json = JSON.parse(xhttp.responseText);
    } catch (err) {
    }
    if (!json || !json.players) {
      pendingAjaxRequest = null;
      return;
    }

    var players = [];
    pendingAjaxRequest = {};
    for (var i = 0; i < json.players.length; i++) {
      var obj = json.players[i];
      players.push({ "steamid": obj.st, "name": obj.n, "clientid": obj.clientid });
    }
    playerCache.players = players;
    playerCache.timestamp = Date.now();
    requestAliasInformation(arg, players, callback);
  }

  function onExtraQLCondump(arg, xhttp, callback) {
    if (xhttp.status != 200) {
      pendingAjaxRequest = null;
      return;
    }

    var players = getPlayersFromCondump(xhttp.responseText);
    if (!players || players.length == 0) {
      pendingAjaxRequest = null;
      return;
    }

    playerCache.players = players;
    playerCache.timestamp = Date.now();
    requestAliasInformation(arg, players, callback);


    function getPlayersFromCondump(condump) {
      var idx = condump.lastIndexOf(playerInfoProvider.condumpMarker);
      if (idx < 0) {
        return null;
      }
      var players = [];
      var lines = condump.substring(idx).split('\n');
      var getNameFromNextLine = false;
      lines.forEach(function(line) {
        if (getNameFromNextLine) {
          getNameFromNextLine = false;
          players[players.length - 1].name = line;
          return;
        }
        var match = /^(?:\[\d+:\d\d\.\d+\] )?([ \d]\d) (\d+)(?: (.) (.+))?$/.exec(line);
        if (match) {
          players.push({ clientid: parseInt(match[1].trim()), opflag: match[3], name: match[4], steamid: match[2] });
          if (!match[4])
            getNameFromNextLine = true;
        }
      });
      return players;
    }
  }

  function requestAliasInformation(arg, players, callback) {
    var steamIds = [];
    pendingAjaxRequest = {};
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (arg == "*" || player.name.indexOf(arg) >= 0 || player.clientid.toString() == arg) {
        steamIds.push(player.steamid);
        pendingAjaxRequest[player.steamid] = player;
      }
    }

    if (steamIds.length == 0) {
      pendingAjaxRequest = null;
      return;
    }
    var url = "http://qlstats.net/aliases/" + steamIds.join("+") + ".json";
    var xhttp = new XMLHttpRequest();
    xhttp.timeout = 5000;
    xhttp.onload = function () { onQlstatsAliases(xhttp, callback); }
    xhttp.onerror = function () { echo("^1elo.js:^7 could not get data from qlstats.net"); }
    xhttp.open("GET", url, true);
    xhttp.send();


    function onQlstatsAliases(xhttp, callback) {
      if (xhttp.status == 200)
        callback(JSON.parse(xhttp.responseText));
      pendingAjaxRequest = null;
    }
  }



  // there is a race condition between QL's bundle.js and the userscripts.
  // if window.req was published by bundle.js, we're good to go.
  // otherwise add a callback to main_hook_v2, which will be called by bundle.js later
  try {
    if (window.req)
      init();
    else {
      var oldHook = window.main_hook_v2;
      window.main_hook_v2 = function() {
        if (typeof oldHook == "function")
          oldHook();
        init();
      }
    }
  } catch (err) {
    console.log(err);
  }
})();

