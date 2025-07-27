// Content Script for Mastodon Timeline Viewer

let mastodonViewerInjected = false;

function injectMastodonViewer() {
  if (mastodonViewerInjected) return;

  // ホームの列ヘッダーを探す
  const homeHeader = document.querySelector('.column-header__title');
  if (!homeHeader) {
    // ページがまだ読み込まれていない場合は少し待ってから再試行
    setTimeout(injectMastodonViewer, 1000);
    return;
  }

  // 既存の検索UIがあるかチェック
  if (document.getElementById('mastodon-timeline-viewer')) {
    return;
  }

  // 検索UIを作成
  const viewerContainer = document.createElement('div');
  viewerContainer.id = 'mastodon-timeline-viewer';
  viewerContainer.className = 'mastodon-viewer-container';

  viewerContainer.innerHTML = `
    <div class="mastodon-viewer-header">
      <h3>投稿検索</h3>
      <button id="mastodon-viewer-toggle" class="mastodon-toggle-btn">▶</button>
    </div>
    <div id="mastodon-viewer-content" class="mastodon-viewer-content" style="display: none;">
      <div class="mastodon-input-type-selector">
        <label>入力方式:</label>
        <div class="mastodon-radio-group">
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="time" checked>
            <span>時間範囲</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="id">
            <span>投稿ID</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="user">
            <span>ユーザー名</span>
          </label>
        </div>
      </div>

      <div id="mastodon-main-input" class="mastodon-input-group">
        <input type="text" id="mastodonPostIdOrTime" placeholder="入力してください">
      </div>

      <div id="mastodonUserInput" class="mastodon-input-group" style="display: none;">
        <label for="mastodonUsernameField">ユーザー名:</label>
        <input type="text" id="mastodonUsernameField" placeholder="@username">
      </div>

      <div id="mastodonTimeInput" class="mastodon-input-group" style="display: none;">
        <label for="mastodonTimeField">時間:</label>
        <input type="text" id="mastodonTimeField" placeholder="YYYY-MM-DD HH">
      </div>

      <div id="mastodonTimeRangeSelector" class="mastodon-input-group">
        <label for="mastodonTimeRange">検索範囲:</label>
        <input type="number" id="mastodonTimeRange" value="1" min="1" max="24" style="width: 80px;">
        <span>時間</span>
      </div>

      <button id="mastodonFetchPost" class="mastodon-fetch-btn">取得</button>

      <div id="mastodonResult" class="mastodon-result"></div>
    </div>
  `;

  // ホームタイムラインの上部に挿入
  const timelineContainer = document.querySelector('.column');
  if (timelineContainer) {
    timelineContainer.insertBefore(viewerContainer, timelineContainer.firstChild);
  }

  // イベントリスナーを設定
  setupEventListeners();
  mastodonViewerInjected = true;
}

function setupEventListeners() {
  const toggleBtn = document.getElementById('mastodon-viewer-toggle');
  const content = document.getElementById('mastodon-viewer-content');

  // 折りたたみ機能
  toggleBtn.addEventListener('click', function() {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    this.textContent = isHidden ? '▼' : '▶';
  });

  // ラジオボタンの変更イベント
  const radioButtons = document.querySelectorAll('input[name="mastodonInputType"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateInputUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-content-inputType', this.value);
    });
  });

  // 前回の選択状態を復元
  const savedInputType = localStorage.getItem('mastodon-content-inputType');
  if (savedInputType) {
    const targetRadio = document.querySelector(`input[name="mastodonInputType"][value="${savedInputType}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
    }
  }

  // 入力値の自動保存
  const mainInput = document.getElementById('mastodonPostIdOrTime');
  const usernameField = document.getElementById('mastodonUsernameField');
  const timeField = document.getElementById('mastodonTimeField');
  const timeRange = document.getElementById('mastodonTimeRange');

  mainInput.addEventListener('input', function() {
    const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
    if (type === 'id') {
      localStorage.setItem('mastodon-content-postId', this.value);
    } else if (type === 'time') {
      localStorage.setItem('mastodon-content-timeRange', this.value);
    }
  });

  usernameField.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-username', this.value);
  });

  timeField.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-userTime', this.value);
  });

  timeRange.addEventListener('change', function() {
    localStorage.setItem('mastodon-content-hourRange', this.value);
  });

  // 検索ボタン
  document.getElementById('mastodonFetchPost').addEventListener('click', handleSearch);

  updateInputUI();
}

function updateInputUI() {
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  const mainInput = document.getElementById('mastodon-main-input');
  const userInput = document.getElementById('mastodonUserInput');
  const timeInput = document.getElementById('mastodonTimeInput');
  const timeRangeSelector = document.getElementById('mastodonTimeRangeSelector');
  const mainInputField = document.getElementById('mastodonPostIdOrTime');
  const usernameField = document.getElementById('mastodonUsernameField');
  const timeField = document.getElementById('mastodonTimeField');
  const timeRangeSelect = document.getElementById('mastodonTimeRange');

  // すべて非表示にする
  mainInput.style.display = 'none';
  userInput.style.display = 'none';
  timeInput.style.display = 'none';

  if (type === 'id') {
    mainInput.style.display = 'block';
    mainInputField.value = localStorage.getItem('mastodon-content-postId') || '114914719105992385';
    mainInputField.placeholder = '投稿ID';
    timeRangeSelector.style.display = 'none';
  } else if (type === 'user') {
    userInput.style.display = 'block';
    timeInput.style.display = 'block';

    usernameField.value = localStorage.getItem('mastodon-content-username') || '@keitan';

    const savedTime = localStorage.getItem('mastodon-content-userTime');
    if (savedTime) {
      timeField.value = savedTime;
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      timeField.value = `${year}-${month}-${day} ${hour}`;
    }

    timeRangeSelector.style.display = 'block';
  } else {
    mainInput.style.display = 'block';
    const savedTimeRange = localStorage.getItem('mastodon-content-timeRange');
    if (savedTimeRange) {
      mainInputField.value = savedTimeRange;
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      mainInputField.value = `${year}-${month}-${day} ${hour}`;
    }
    mainInputField.placeholder = 'YYYY-MM-DD HH';
    timeRangeSelector.style.display = 'block';
  }

  // 時間範囲セレクタの値を復元
  const savedRange = localStorage.getItem('mastodon-content-hourRange');
  if (savedRange) {
    timeRangeSelect.value = savedRange;
  }

  document.getElementById('mastodonResult').innerHTML = '';
}

async function handleSearch() {
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  const resultDiv = document.getElementById('mastodonResult');
  resultDiv.innerHTML = '<div class="mastodon-loading">取得中...</div>';

  try {
    if (type === 'id') {
      const raw = document.getElementById('mastodonPostIdOrTime').value.trim();
      if (!raw) throw new Error('投稿IDを入力してください');
      if (!/^\d+$/.test(raw)) throw new Error('投稿IDは数字のみです');

      const post = await fetchMastodonPost(raw);
      displayPosts([post]);
    } else if (type === 'user') {
      const username = document.getElementById('mastodonUsernameField').value.trim();
      const timeInput = document.getElementById('mastodonTimeField').value.trim();

      if (!username) throw new Error('ユーザー名を入力してください');

      const cleanUsername = username.replace(/^@/, '');
      if (!/^[\w\-\.]+$/.test(cleanUsername)) {
        throw new Error('ユーザー名は英数字、ハイフン、ドットのみ使用可能です');
      }

      let timeFilter = null;
      if (timeInput) {
        const timeMatch = timeInput.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})$/);
        if (!timeMatch) throw new Error('時間は YYYY-MM-DD HH の形式で入力してください');

        const [Y, Mo, D] = timeMatch[1].split('-').map(Number);
        const hh = Number(timeMatch[2]);
        const timeRangeSelect = document.getElementById('mastodonTimeRange');
        const rangeHours = timeRangeSelect ? Number(timeRangeSelect.value) : 1;

        const startJst = new Date(Y, Mo-1, D, hh, 0, 0, 0);
        const endJst = new Date(Y, Mo-1, D, hh + rangeHours, 0, 0, 0);
        timeFilter = { start: startJst, end: endJst };
      }

      const posts = await fetchUserPosts(cleanUsername, timeFilter);
      displayPosts(posts);
    } else {
      const raw = document.getElementById('mastodonPostIdOrTime').value.trim();
      if (!raw) throw new Error('時間を入力してください');

      const timeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})$/);
      if (!timeMatch) throw new Error('日時形式は YYYY-MM-DD HH です');

      const [Y, Mo, D] = timeMatch[1].split('-').map(Number);
      const hh = Number(timeMatch[2]);
      const timeRangeSelect = document.getElementById('mastodonTimeRange');
      const rangeHours = timeRangeSelect ? Number(timeRangeSelect.value) : 1;

      const startJst = new Date(Y, Mo-1, D, hh, 0, 0, 0);
      const endJst = new Date(Y, Mo-1, D, hh + rangeHours, 0, 0, 0);

      const startId = generateSnowflakeIdFromJst(startJst);
      const endId = generateSnowflakeIdFromJst(endJst);
      const posts = await fetchPublicTimelineInRange(startId, endId);
      displayPosts(posts);
    }
  } catch (err) {
    showError(err.message);
  }
}

// popup.jsから必要な関数をコピー
async function fetchMastodonPost(id) {
  const res = await fetch(`https://mastodon.compositecomputer.club/api/v1/statuses/${id}`);
  if (!res.ok) throw new Error(`投稿取得エラー: ${res.status}`);
  return res.json();
}

function getStorageAsync(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

async function fetchPublicTimelineInRange(sinceId, maxId) {
  let all = [];
  let max = maxId;
  let requestCount = 0;
  const maxRequests = 275;

  const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
  const stored = await getStorageAsync(keys);

  while (requestCount < maxRequests) {
    const url = new URL('https://mastodon.compositecomputer.club/api/v1/timelines/public');
    url.searchParams.set('limit', '40');
    url.searchParams.set('max_id', max);
    url.searchParams.set('since_id', sinceId);
    url.searchParams.set('local', 'true');

    const res = await fetch(url, {
      headers: {
        "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
        "X-Csrf-Token": stored["x_csrf_token"],
        "Authorization": stored["authorization"]
      },
      credentials: "include"
    });

    if (!res.ok) throw new Error('タイムライン取得エラー');

    const batch = await res.json();
    if (!batch.length) break;

    all = all.concat(batch);
    requestCount++;

    if (all.length > 10) {
      document.getElementById('mastodonResult').innerHTML =
        `<div class="mastodon-loading">取得中... ${all.length}件取得済み</div>`;
    }

    max = (BigInt(batch[batch.length-1].id) - 1n).toString();
    if (batch.length < 40) break;
  }

  return all;
}

async function fetchUserPosts(username, timeFilter = null) {
  // fetchUserPosts関数の実装（popup.jsと同様）
  const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
  const stored = await getStorageAsync(keys);

  const lookupUrl = new URL('https://mastodon.compositecomputer.club/api/v1/accounts/lookup');
  lookupUrl.searchParams.set('acct', username);

  const accountRes = await fetch(lookupUrl, {
    headers: {
      "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
      "X-Csrf-Token": stored["x_csrf_token"],
      "Authorization": stored["authorization"]
    },
    credentials: "include"
  });

  if (!accountRes.ok) {
    throw new Error(`ユーザー @${username} が見つかりません`);
  }

  const account = await accountRes.json();

  let all = [];
  let maxId = null;
  let requestCount = 0;
  const maxRequests = 275;

  while (requestCount < maxRequests) {
    const statusesUrl = new URL(`https://mastodon.compositecomputer.club/api/v1/accounts/${account.id}/statuses`);
    statusesUrl.searchParams.set('limit', '40');

    if (maxId) {
      statusesUrl.searchParams.set('max_id', maxId);
    }

    if (timeFilter) {
      const sinceId = generateSnowflakeIdFromJst(timeFilter.start);
      const maxIdFromTime = generateSnowflakeIdFromJst(timeFilter.end);
      statusesUrl.searchParams.set('since_id', sinceId);
      if (!maxId) {
        statusesUrl.searchParams.set('max_id', maxIdFromTime);
      }
    }

    const statusesRes = await fetch(statusesUrl, {
      headers: {
        "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
        "X-Csrf-Token": stored["x_csrf_token"],
        "Authorization": stored["authorization"]
      },
      credentials: "include"
    });

    if (!statusesRes.ok) {
      throw new Error(`ユーザー @${username} の投稿取得に失敗しました`);
    }

    const batch = await statusesRes.json();
    if (!batch.length) break;

    let filteredBatch = batch;
    if (timeFilter) {
      filteredBatch = batch.filter(post => {
        const postTime = new Date(post.created_at);
        return postTime >= timeFilter.start && postTime <= timeFilter.end;
      });

      if (filteredBatch.length < batch.length) {
        all = all.concat(filteredBatch);
        break;
      }
    }

    all = all.concat(filteredBatch);
    requestCount++;

    if (all.length > 10) {
      document.getElementById('mastodonResult').innerHTML =
        `<div class="mastodon-loading">取得中... ${all.length}件取得済み</div>`;
    }

    maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
    if (batch.length < 40) break;
    if (!timeFilter && all.length >= 200) break; // content scriptでポップアップ版と同じ制限
  }

  return all;
}

function generateSnowflakeIdFromJst(dtJst) {
  const utcMs = dtJst.getTime();
  return (BigInt(utcMs) << 16n).toString();
}

function displayPosts(posts) {
  const resultDiv = document.getElementById('mastodonResult');

  if (!posts.length) {
    resultDiv.innerHTML = '<div class="mastodon-no-results">該当する投稿がありません</div>';
    return;
  }

  // 常に取得件数を表示
  const countText = `<div class="mastodon-count">取得件数: ${posts.length}件</div>`;

  resultDiv.innerHTML = countText + posts.map(post => {
    const t = new Date(post.created_at).toLocaleString('ja-JP');
    const user = post.account.display_name || post.account.username;
    const h = `@${post.account.username}`;
    const txt = stripHtmlTags(post.content) || '<em>テキストなし</em>';

    return `<div class="mastodon-post-item" data-url="${post.url}">
      <div class="mastodon-post-header"><strong>${escapeHtml(user)}</strong> ${escapeHtml(h)}</div>
      <div class="mastodon-post-meta">${t} ID:${post.id}</div>
      <div class="mastodon-post-content">${escapeHtml(txt)}</div>
    </div>`;
  }).join('');

  document.querySelectorAll('.mastodon-post-item').forEach(el => {
    el.addEventListener('click', () => window.open(el.dataset.url, '_blank'));
  });
}

function showError(msg) {
  document.getElementById('mastodonResult').innerHTML = `<div class="mastodon-error">${escapeHtml(msg)}</div>`;
}

function stripHtmlTags(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ページ読み込み完了後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectMastodonViewer);
} else {
  injectMastodonViewer();
}

// 動的なページ変更にも対応
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // 少し遅延を入れてUIを挿入
      setTimeout(injectMastodonViewer, 500);
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
