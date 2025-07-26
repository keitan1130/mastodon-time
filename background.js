console.log("background.js is running...");

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    let session_id = "";
    let mastodon_session = "";
    let x_csrf_token = "";
    let authorization = "";

    for (const header of details.requestHeaders) {
      const name = header.name.toLowerCase();
      if (name === "x-csrf-token") x_csrf_token = header.value;
      if (name === "authorization") authorization = header.value;
    }

    chrome.cookies.getAll({ url: details.url }, function (cookies) {
      for (const cookie of cookies) {
        if (cookie.name === "_session_id") session_id = cookie.value;
        if (cookie.name === "_mastodon_session") mastodon_session = cookie.value;
      }
      chrome.storage.local.set({
        session_id,
        mastodon_session,
        x_csrf_token,
        authorization,
      });
    });
  },
  {
    urls: ["https://mastodon.compositecomputer.club/api/v1/timelines/home"]
  },
  ["requestHeaders"]
);
