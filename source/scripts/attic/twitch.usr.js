﻿// ==UserScript==
// @name        Quake Live Twich.tv Streams and VODs
// @version     1.8
// @author      PredatH0r
// @description	Shows a list of twitch.tv QL live streams and videos
// @unwrap
// ==/UserScript==

/*

Version 1.8
- added "Reflex" to game list for live streams
- added "Xonotic" to game list for live streams
- added "Warsow" to game list for live streams

Version 1.7
- added "Quake III Arena" to game list for live streams

Version 1.6
- fixed archive and VODs not showing videos for certain channels

Version 1.5
- added workaround to make external URLs work in Steam build

Version 1.4
- fixed stuck at "loading..." on live streams
- fixed accumulating auto-update timers for live streams

Version 1.3
- ensuring consistent order of tabs in the chat bar

Version 1.2
- updated extraQL script url to sourceforge

Version 1.1
- show videos grouped by channel

Version 1.0
- first public release

*/

(function () {
  // external variables
  var quakelive = window.quakelive;
  var extraQL = window.extraQL;

  // config
  var games = ["Quake Live", "Quake III Arena", "Quake II", "Quake", "Reflex", "Xonotic", "Warsow" ];
  var videoChannels = ["quakecon", "faceittv", "zlive", "leveluptv", "tastyspleentv" ];
  var groupVideosByChannel = true;

  // constants
  var URL_STREAMS = "https://api.twitch.tv/kraken/streams?limit=50&game={0}";
  var URL_VIDEOS = "https://api.twitch.tv/kraken/channels/{0}/videos?limit=50&broadcasts={1}";
  var UPDATE_INTERVAL = 60000;
  var FLAT_VIDEO_LIST = "All Channels";

  var VIEW_STREAMS = "streams";
  var VIEW_CASTS = "casts";
  var VIEW_VIDEOS = "videos";
  var currentView = VIEW_STREAMS;

  function init() {
    // delay init so that twitch, twitter, ESR and IRC scripts add items to chat menu bar in a defined order
    if (extraQL.hookVersion) // introduced at the same time as the addTabPage() "priority" param
      delayedInit();
    else
      setTimeout(delayedInit, 0);
  }

  function delayedInit() {
    onContentLoaded();
    quakelive.AddHook("OnContentLoaded", onContentLoaded);
    quakelive.AddHook("OnGameModeEnded", updateStreams);
    // the resizeLayout script's event handler will resize the <div> for us
    if (typeof (window.onresize) == "function")
      window.onresize();
  }

  function onContentLoaded() {
    if ($("#twitch").length)
      return;

    var fixedElementsHeight = 277;

    extraQL.addStyle(
      "#twitch { width: 300px; color: black; background-color: white; display: none; }",
      "#twitchHeader { border-bottom: 1px solid #e8e8e8; padding: 9px 9px 8px 9px; }",
      "#twitchHeader .headerText { font-size: 14px; line-height: 18px; font-weight: bold; }",
      "#twitchHeader a { color: black; font-size: 14px; }",
      "#twitchHeader a.active { color: #A0220B; }",
      "#twitchDetails { padding: 6px 6px; border-bottom: 1px solid #e8e8e8; }",
      "#twitchStatus { height: 45px; overflow: hidden; margin-top: 3px; }",
      "#twitchContent { height: " + (550 - fixedElementsHeight) + "px; overflow: auto; }",
      "#twitchContent p { font-weight: bold; font-size: 12pt; background-color: #444; color: white; padding: 2px 6px; margin-top: 3px; overflow: hidden; }",
      "#twitchContent div { padding: 3px 6px; max-height: 14px; overflow: hidden; }",
      "#twitchContent .active { background-color: #ccc; }",
      "#twitchContent a { color: black; text-decoration: none; }",
      "#twitchContent a:hover { text-decoration: underline; }",
      "#twitchContent h1 { color: white; background-color: #444; text-align: center; }"
      );

    var content =
      "<div id='twitch' class='chatBox tabPage'><div>" +
      "  <div id='twitchHeader'><span class='headerText'>Twitch.tv " +
      "<a href='javascript:void(0)' id='twitchShowStreams' class='active'>live streams</a> | " +
      "<a href='javascript:void(0)' id='twitchShowCasts'>archive</a> | " +
      "<a href='javascript:void(0)' id='twitchShowVideos'>vods</a>" +
      "</span></div>" +
      "  <div id='twitchDetails'><img src='' width='288' height='180'><div id='twitchStatus'></div></div>" +
      "  <div id='twitchContent' data-fill='" + fixedElementsHeight + "'></div>" +
      "</div></div>";
    extraQL.addTabPage("twitch", "Twitch", content, undefined, 100);

    $("#twitchShowStreams").click(function () {
      currentView = VIEW_STREAMS;
      $("#twitchHeader a").removeClass("active");
      $(this).addClass("active");
      updateStreams();
    });

    $("#twitchShowCasts").click(function () {
      currentView = VIEW_CASTS;
      $("#twitchHeader a").removeClass("active");
      $(this).addClass("active");
      updateVideos(true);
    });

    $("#twitchShowVideos").click(function() {
      currentView = VIEW_VIDEOS;
      $("#twitchHeader a").removeClass("active");
      $(this).addClass("active");
      updateVideos(false);
    });

    updateStreams();
  }

  /*********************************************************************/
  // streams
  /*********************************************************************/

  var GAME_THREADS = 4;
  var gameIndex;
  var gameStreams;
  var streamCount;
  var refreshTimeoutHandle;

  function updateStreams() {
    if (quakelive.IsGameRunning())
      return;

    if (refreshTimeoutHandle)
      window.clearTimeout(refreshTimeoutHandle);
    gameIndex = 0;
    gameStreams = {};
    streamCount = 0;
    if (currentView == VIEW_STREAMS)
      showLoadingScreen();
    for (var i=0; i<GAME_THREADS; i++)
      loadStreamsForNextGame();
  }

  function loadStreamsForNextGame() {
    ++gameIndex;
    if (gameIndex == games.length + GAME_THREADS) {
      // last thread completed
      displayStreams();
      return;
    }
    if (gameIndex > games.length) return;

    var game = games[gameIndex - 1];
    requestStreamsForGame(game, 1);
  }

  function requestStreamsForGame(game, attempt) {
    if (attempt >= 3) {
      failedStreamsForGame(game);
      return;
    }

    $.ajax({
      url: extraQL.format(URL_STREAMS, encodeURIComponent(game)),
      dataType: "jsonp",
      jsonp: "callback",
      success: function (data) {
        if (data && data.streams) {
          parseStreamsForGame(data);
          loadStreamsForNextGame();
        } else {
          requestStreamsForGame(game, ++attempt);
        }
      },
      error: function() { failedStreamsForGame(game); }
    });
  }

  function failedStreamsForGame(game) {
    extraQL.echo("^1[twitch]^7 failed to retrieve streams for " + game);
    loadStreamsForNextGame();
  }

  function parseStreamsForGame(data) {
    $.each(data.streams, function(i, stream) {
      if (!gameStreams[stream.game])
        gameStreams[stream.game] = [];
      gameStreams[stream.game].push(stream);
    });
    streamCount += data.streams.length;
  }

  function displayStreams() {
    try {
      // update tab caption
      if (streamCount == 0)
        $("#tab_twitch").html("Twitch");
      else
        $("#tab_twitch").html("Twitch (" + streamCount + ")");

      if (currentView != VIEW_STREAMS)
        return;

      var $streams = $("#twitchContent");
      $streams.empty();

      // iterate streams in defined order
      $.each(games, function (i, game) {
        var streams = gameStreams[game];
        if (!streams || streams.length == 0) return;
        $streams.append("<p>" + game + "</p>");

        // update stream list
        $.each(streams, function(j, item) {
          $streams.append("<div" +
            " data-preview='" + item.preview.medium + "'" +
            " data-status=\"" + extraQL.escapeHtml(item.channel.status) + "\"" +
            ">" +
            "<a href='javascript:quakelive.OpenURL(\"" + item.channel.url + "\")' target='_blank'>" +
            extraQL.escapeHtml(item.channel.display_name) + " (" + item.viewers + ")</a></div>");
        });
      });

      $("#twitchContent div").hover(showStreamDetails);
      showDetailsForFirstEntry();

      refreshTimeoutHandle = window.setTimeout(updateStreams, UPDATE_INTERVAL);
    } catch (e) {
      extraQL.log(e);
    }
  }

  function showLoadingScreen() {
    var $streams = $("#twitchContent");
    $("#twitchDetails>img").attr("src", "");
    $streams.empty().append("<div>Loading...</div>");
  }

  function showDetailsForFirstEntry() {
    var divs = $("#twitchContent>div");
    if (divs.length == 0) {
      $("#twitchDetails img").attr("src", extraQL.BASE_URL+"images/offline.jpg");
      $("#twitchStatus").text("Offline");
      $("#twitchContent").html("<div>No streams/videos found.</div>");
    } else {
      showStreamDetails.apply(divs[0]);
      $(divs[0]).addClass("active");
    }
  }

  function showStreamDetails() {
    var $this = $(this);
    $("#twitchDetails img").attr("src", $this.data("preview"));
    $("#twitchStatus").html($this.data("status"));
    $("#twitchContent div").removeClass("active");
    $this.addClass("active");
  }

  /*********************************************************************/
  // videos
  /*********************************************************************/

  var VIDEO_THREADS = 3;
  var videoChannelIndex;
  var videos;
  var loadCasts;
  var latestVideoByChannel;

  function updateVideos(casts) {
    videoChannelIndex = 0;
    videos = {};
    latestVideoByChannel = {};
    loadCasts = casts;
    showLoadingScreen();
    for (var threads = 0; threads < VIDEO_THREADS; threads++)
      loadVideosForNextChannel();
  }

  function loadVideosForNextChannel() {
    ++videoChannelIndex;
    if (videoChannelIndex == videoChannels.length + VIDEO_THREADS) {
      // last thread is done
      sortAndDisplayVideos();
      return;
    }
    if (videoChannelIndex > videoChannels.length) {
      // some thread is done
      return;
    }

    var channel = videoChannels[videoChannelIndex - 1];
    //extraQL.log("Loading videos for channel ^3" + channel + "^7");
    $.ajax({
        url: extraQL.format(URL_VIDEOS, channel, loadCasts),
        dataType: "jsonp",
        jsonp: "callback",
        success: function(data) { parseVideosFromChannel(channel, data); },
        error: function () { extraQL.log("^1Failed^7 to load twitch video list for channel " + channel); },
        complete: loadVideosForNextChannel
      });
  }

  function parseVideosFromChannel(channel, data) {
    var groupName = groupVideosByChannel ? channel : FLAT_VIDEO_LIST;
    $.each(data.videos, function (i, video) {
      if (video.game && games.indexOf(video.game) < 0) return; // ignore videos of unsubscribed games
      if (loadCasts && videoChannels.indexOf(video.channel.name) < 0) return;  // ignore recorded casts from non-featured channels
      if (!videos[groupName])
        videos[groupName] = Array();
      videos[groupName].push(video);
      if (!latestVideoByChannel[channel])
        latestVideoByChannel[channel] = video.recorded_at;
    });
  }

  function sortAndDisplayVideos() {
    try {
      var $streams = $("#twitchContent");
      $streams.empty();

      // get groups in order of their latest video
      var groups = groupVideosByChannel ? videoChannels.slice() : [ FLAT_VIDEO_LIST ];
      groups.sort(function (a, b) { return -(latestVideoByChannel[a] < latestVideoByChannel[b] ? -1 : latestVideoByChannel[a] > latestVideoByChannel[b] ? +1 : 0); });

      $.each(groups, function (groupIndex, groupName) {
        $streams.append("<h1>" + groupName + "</h1>");

        var videosInGroup = videos[groupName];
        if (!videosInGroup || videosInGroup.length == 0) {
          $streams.append("<div>No videos found</div>");
          return;
        }

        videosInGroup.sort(function (a, b) { return -(a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? +1 : 0); });

        // update video list
        $.each(videosInGroup, function(i, item) {
          if (i > 100) return;
          var date = new Date(item.recorded_at);
          var vidDate = (1900 + date.getYear()) + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + ("0" + date.getDate()).slice(-2);
          var hours = item.length / 3600;
          hours = hours < 1 ? "" : Math.floor(hours) + "h";
          var vidLength = " " + hours + ("0" + Math.round(item.length / 60 % 60)).slice(-2) + "m" + " - ";
          var channel = item.channel ? (item.channel.display_name ? item.channel.display_name : item.channel.name) : "";
          //var descr = item.description && item.description != item.title ? extraQL.escapeHtml(item.description) + "&lt;br&gt;" : "";
          $streams.append("<div" +
            " data-preview='" + item.preview + "'" +
            " data-status=\"[" + vidDate + "] " + vidLength + " &lt;b&gt;" + extraQL.escapeHtml(channel) + "&lt;/b&gt;&lt;br&gt;" + extraQL.escapeHtml(item.title) + "\"" +
            ">" +
            "<a href='javascript:quakelive.OpenURL(\"" + item.url + "\")' target='_blank'>" + extraQL.escapeHtml(item.title) + "</a></div>");
        });
      });
      $("#twitchContent div").hover(showStreamDetails);

      showDetailsForFirstEntry();
    } catch (e) {
      extraQL.log(e);
    }
  }


  init();
})();