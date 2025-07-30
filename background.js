console.log("background.js is running...");

// インスタンスベースURLを取得する関数
async function getCurrentInstanceUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['instanceUrl'], (result) => {
      resolve(result.instanceUrl || 'https://mastodon.compositecomputer.club');
    });
  });
}

// 動的にリスナーを設定する関数
async function setupWebRequestListener() {
  const instanceUrl = await getCurrentInstanceUrl();
  const homeTimelineUrl = `${instanceUrl}/api/v1/timelines/home`;

  // 既存のリスナーを削除
  if (chrome.webRequest.onBeforeSendHeaders.hasListener(webRequestHandler)) {
    chrome.webRequest.onBeforeSendHeaders.removeListener(webRequestHandler);
  }

  // 新しいリスナーを追加
  chrome.webRequest.onBeforeSendHeaders.addListener(
    webRequestHandler,
    { urls: [homeTimelineUrl] },
    ["requestHeaders"]
  );
}

// WebRequestハンドラー関数
function webRequestHandler(details) {
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
}

// インスタンスURL変更を監視
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.instanceUrl) {
    console.log('Instance URL changed to:', changes.instanceUrl.newValue);
    setupWebRequestListener();
  }
});

// 初期化
setupWebRequestListener();
