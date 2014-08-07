﻿// ==UserScript==
// @name        Quake Live Layout Resizer
// @version     0.8
// @author      PredatH0r
// @description	
// @include     http://*.quakelive.com/*
// @exclude     http://*.quakelive.com/forum*
// @unwrap
// ==/UserScript==

/*

This script finds the optimal layout for the QL chat popup, based on the current window size.

When the window is less then 1310 pixels wide, the chat will overlap the content area, 
but leaves some space on the top (configurable by web_chatOverlapIndent, default 150)
so you can access the navigation menus and "Customize" in the server browser.

If the window is wider, the chat will be shown full-height outside the content area.

Version 0.8
- restored most of the original functions that got lost due to cross-domain CSS loading

Version 0.7
- hotfix to prevent endless-loop when loading QL

Version 0.6
- updated extraQL script url to sourceforge

Version 0.5
- fixed z-index to work with standard content, chat window, drop-down menus and dialog boxes

Version 0.4
- switched back to horizontal "Chat" bar, always located on the bottom edge
- introduced cvar web_chatOverlapIndent to customize how much space should be left on
  top, when the chat is overlapping the main content area
- adjusts z-index of chat and navigation menu to prevent undesired overlapping


CVARS:
  - web_chatOverlapIndent: number of pixels to skip from top-edge that won't be overlapped
    by an expanded chat window

*/

(function () {
  // external variables
  var quakelive = window.quakelive;
  var document = window.document;
  var extraQL = window.extraQL;

  // constants
  var RIGHT_MARGIN = 0;
  var CVAR_chatOverlapIndent = "web_chatOverlapIndent";

  // variables
  var oldOnResize;
  var oldOnCvarChanged;
  var styleQlvContainer;
  var styleTwocolLeft;
  var styleFullHeight;
  var styleImChat;
  var styleImChatBody;
  var styleImChatInput;
  var styleImChatSend;
  var styleBrowserDetailsPlayers;
  var compiledCss;


  function init() {
    extraQL.addStyle(".chatBox { " +
      "border-left: 3px solid #444; " +
      "border-top: 3px solid #444; " +
      "border-right: 3px solid #444; " +
      "position: fixed; " +
      "bottom: 27px; " +
      "right: 0px; " +
      "}");
    extraQL.addStyle(
      "#chatContainer.expanded #collapsableChat { background-color: rgb(114,24,8); }",
      "#chatContainer .fullHeight { height: 550px; }",
      "#browser_details ul.players.miniscroll { max-height: auto }"
    );
    
    findCssRules();

    $("#chatContainer").width(3 + 300 + 3).css("right", RIGHT_MARGIN + "px");
    $("#collapsableChat").addClass("bottomDockBar");
    $("#qlv_chatControl").addClass("chatBox");
    $("#im-overlay-body").css("background-color", "white");
    modifyChatStyles();

    if (quakelive.cvars.Get(CVAR_chatOverlapIndent).value == "")
      quakelive.cvars.Set(CVAR_chatOverlapIndent, 140);

    oldOnResize = window.onresize;
    window.onresize = onResize;
    oldOnCvarChanged = window.OnCvarChanged;
    window.OnCvarChanged = onCvarChanged;
    quakelive.mod_friends.FitToParent = updateChatAndContentLayout;
    updateChatAndContentLayout();
  }

  function findCssRules() {
    var i, j;
    for (i = 0; i < document.styleSheets.length; i++) {
      var sheet = document.styleSheets[i];
      if (sheet.href && sheet.href.indexOf("/compiled_v") > 0)
        compiledCss = sheet;
      if (!sheet.cssRules) continue;
      for (j = 0; j < sheet.cssRules.length; j++) {
        try {
          var rule = sheet.rules[j];
          if (rule.cssText.indexOf("div#qlv_container") == 0)
            styleQlvContainer = rule.style;
          else if (rule.cssText.indexOf("#qlv_chatControl") == 0)
            rule.style.removeProperty("height");
          else if (rule.cssText.indexOf("#im-overlay-body") == 0)
            rule.style.setProperty("background-color", "#fff");
          else if (rule.cssText.indexOf(".twocol_left") == 0)
            styleTwocolLeft = rule.style;
          else if (rule.cssText.indexOf("div#qlv_content") == 0)
            rule.style.removeProperty("z-index"); // will be set/unset to bring the chat in front/behind the drop down menus
          else if (rule.cssText.indexOf("#newnav_top") == 0)
            rule.style.setProperty("z-index", 2103);
          else if (rule.cssText.indexOf("ul.sf-menu *") == 0)
            rule.style.setProperty("z-index", 2102);
          else if (rule.cssText.indexOf("#lgi_cli ") == 0)
            rule.style.setProperty("z-index", 10003); // has 1003 and would be overlapped by menu bar items in #newnav_top
          else if (rule.cssText.indexOf("#chatContainer .fullHeight") == 0)
            styleFullHeight = rule.style;
          else if (rule.cssText.indexOf("#im {") == 0)
            rule.style.removeProperty("height");
          else if (rule.cssText.indexOf("#im-chat {") == 0)
            styleImChat = rule.style;
          else if (rule.cssText.indexOf("#im-chat-body {") == 0)
            styleImChatBody = rule.style;
          else if (rule.cssText.indexOf("#im-chat input {") == 0)
            styleImChatInput = rule.style;
          else if (rule.cssText.indexOf("#im-chat-send {") == 0)
            styleImChatSend = rule.style;
          else if (rule.cssText.indexOf("#browser_details ul.players.miniscroll {") == 0)
            styleBrowserDetailsPlayers = rule.style;
        }
        catch (e) { }
      }
    }

    if (!styleQlvContainer) {
      $("#qlv_chatControl").css("height", "auto");
      $("#im-overlay-body").css("background-color", "#fff");
      $("#im").css("height", "auto");
      $("div#qlv_content").css("z-index", "auto");
      $("#newnav_top").css("z-index", "2103");
      $("ul.sf-menu *").css("z-index", "2102");
      $("#lgi_cli").css("z-index", "10003");
    }
  }

  function modifyChatStyles() {
    if (styleImChat) {
      styleImChat.setProperty("background-clip", "content-box");
    } else {
      $("#im-chat").css("background-clip", "content-box");
    }

    if (styleImChatBody) {
      styleImChatBody.setProperty("left", "0px");
      styleImChatBody.setProperty("top", "13px");
      styleImChatBody.setProperty("width", "284px");
      styleImChatBody.setProperty("background-color", "white");
    } else {
      $("#im-chat-body").css({ left: 0, top: "13px", width: "284px", "background-color": "white" });
    }

    if (styleImChatInput) {
      styleImChatInput.setProperty("width", "282px");
      styleImChatInput.setProperty("left", "0px");
      styleImChatInput.setProperty("top", "auto");
      styleImChatInput.setProperty("bottom", "7px");
    } else {
      $("#im-chat-input").css({ width: "282px", left: 0, top: "auto", bottom: "7px" });
    }

    if (styleImChatSend)
      styleImChatSend.setProperty("display", "none");
    else
      $("#im-chat-send").css("display", "none");
  }

  function onResize(event) {
    if (oldOnResize)
      oldOnResize(event);

    try { updateChatAndContentLayout(); }
    catch (ex) { }
  }

  function onCvarChanged(name, val, replicate) {
    oldOnCvarChanged(name, val, replicate);
    try {
      if (name == CVAR_chatOverlapIndent)
        updateChatAndContentLayout();
    }
    catch (e) { }
  }

  function updateChatAndContentLayout() {
    try {
      var $window = $(window);
      var width = $window.width();

      // reposition background image and content area
      var margin;
      var minExpandedWidth = 3 + 1000 + 7 + 3 + 300 + 3 + RIGHT_MARGIN;
      if (width <= minExpandedWidth) {
        $("body").css("background-position", "-518px 0");
        margin = "0 3px 0 3px";
      } else if (width <= minExpandedWidth + 7 + 3 + 300 + 3) {
        $("body").css("background-position", (-518 + width - minExpandedWidth).toString() + "px 0");
        margin = "0 3px 0 " + (width - 1313).toString() + "px";
      } else {
        $("body").css("background-position", "center top");
        margin = "0 auto";
      }
      if (styleQlvContainer)
        styleQlvContainer.setProperty("margin", margin); // directly modify CSS to avoid "jumps" when page reloads
      else
        $("div#qlv_container").css("margin", margin);

      // modify height of elements that support it
      var height = $window.height();
      $("div:data(fill-height)").each(function() {
        var $this = $(this);
        $this.height(height - parseInt($this.data("fill-height")));
      });

      // modify height of chat
      if (quakelive.IsGameRunning()) {
        $("#collapsableChat").css("display", "none");
        height = Math.floor(height) * 0.9 - 35; // 10% clock, 35px buttons
      } else
        $("#collapsableChat").css("display", ""); // hide in-game chat bar

      height -= 3 + 27 + 14; // height of top border + title bar + bottom bar

      var topOffset = 140; // leave header and menu visible when chat is overlapping the content area
      if (width < minExpandedWidth - 7) {
        try {
          topOffset = parseInt(quakelive.cvars.Get(CVAR_chatOverlapIndent).value);
        } catch (e) {
        }
        height -= topOffset;
        if (styleTwocolLeft)
          styleTwocolLeft.setProperty("left", "15px");
      } else {
        if (styleTwocolLeft)
          styleTwocolLeft.setProperty("left", "155px");
        height -= 7; // leave some gap from top edge
      }

      // create more space for "Active Chat"
      var footerHeight = 400; // 210 by default
      if (height - footerHeight < 300)
        footerHeight = height - 300;
      $("#im-overlay-body").height(height - 87);
      $("#im-body").height(height - footerHeight);
      $("#im-footer").height(footerHeight).css({ "background": "#222", "padding": "0 5px" });
      if (styleImChat)
        styleImChat.setProperty("height", (footerHeight - 8) + "px");
      else
        $("#im-chat").css("height", (footerHeight - 8) + "px");

      if (styleImChatBody)
        styleImChatBody.setProperty("height", (footerHeight - 8 - 13 - 6 - 33 - 6) + "px");
      else
        $("#im-chat-body").css("height", (footerHeight - 8 - 13 - 6 - 33 - 6) + "px");
      $("#im-chat-send").css("display", "none");

      // resize elements which support a dynamic height
      if (styleFullHeight)
        styleFullHeight.setProperty("height", height + "px");
      $("#chatContainer [data-fill]").each(function() {
        var $this = $(this);
        $this.height(height - parseInt($this.data("fill")));
      });

      // resize server browser details
      if (styleBrowserDetailsPlayers)
        styleBrowserDetailsPlayers.setProperty("max-height", ($window.height() - 372) + "px");
    

      // modify z-index to deal with drop-down-menus
      $("#qlv_content").css("z-index", topOffset >= 110 ? "" : "1"); // #chatContainer has z-index 999
      $("div#qlv_content").css("z-index", "auto");
      $("#newnav_top").css("z-index", "2103");
      $("ul.sf-menu *").css("z-index", "2102");
      $("#lgi_cli").css("z-index", "10003");

    } catch (ex) {
      extraQL.log(ex);
    }
  }

  if (extraQL)
    init();
  else
    $.getScript("http://sourceforge.net/p/extraql/source/ci/master/tree/scripts/extraQL.js?format=raw", init);
})();