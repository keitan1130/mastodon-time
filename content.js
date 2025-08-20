// Content Script for Mastodon Timeline Viewer

let mastodonViewerInjected = false;

// 現在のページからインスタンスURLを取得する関数
function getCurrentInstanceUrl() {
  // content scriptは現在のページのドメインを直接取得できる
  return `${window.location.protocol}//${window.location.host}`;
}

function injectMastodonViewer() {
  if (mastodonViewerInjected) return;

  // Mastodonページかどうかをチェック
  const isMastodonPage = document.querySelector('.column-header__title') ||
                        document.querySelector('[data-testid="column-header"]') ||
                        document.querySelector('.compose-form') ||
                        document.querySelector('.status__content');

  if (!isMastodonPage) {
    // Mastodonページではない場合は何もしない
    return;
  }

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
        <input type="text" id="mastodonUsernameField" placeholder="@keitan または @keitan@mastodon.social">
      </div>

      <div id="mastodonTimeInput" class="mastodon-input-group" style="display: none;">
        <label for="mastodonTimeField">開始時刻:</label>
        <input type="text" id="mastodonTimeField" placeholder="YYYY-M-D HH:MM:SS">
      </div>

      <div id="mastodonTimeRangeSelector" class="mastodon-input-group">
        <label for="mastodonTimeRange">時間:</label>
        <input type="text" id="mastodonTimeRange" placeholder="HH:MM:SS" style="width: 120px;">
        <span>（開始時刻に追加）</span>
      </div>

      <div id="mastodonGeneratedTimeDisplay" class="mastodon-input-group">
        <label for="mastodonGeneratedTime">終了時刻:</label>
        <input type="text" id="mastodonGeneratedTime" placeholder="YYYY-M-D HH:MM:SS" style="width: 100%;">
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
      updateGeneratedTimeRange();
    }
  });

  usernameField.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-username', this.value);
  });

  timeField.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-userTime', this.value);
    updateGeneratedTimeRange();
  });

  timeRange.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-timeRangeInput', this.value);
    updateGeneratedTimeRange();
  });

  // 終了時刻（生成された範囲）フィールドの変更で時間範囲を逆算
  document.getElementById('mastodonGeneratedTime').addEventListener('input', function() {
    updateTimeRangeFromEndTime();
  });

  // 検索ボタン
  document.getElementById('mastodonFetchPost').addEventListener('click', handleSearch);

  updateInputUI();
}

function updateGeneratedTimeRange() {
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  const generatedField = document.getElementById('mastodonGeneratedTime');

  if (type === 'user') {
    const dateTimeInput = document.getElementById('mastodonTimeField').value.trim();
    const timeRangeInput = document.getElementById('mastodonTimeRange').value.trim();

    if (dateTimeInput && timeRangeInput) {
      try {
        const startTime = parseDateTime(dateTimeInput);
        const endTime = parseAndAddTime(startTime, timeRangeInput);
        generatedField.value = formatDateTime(endTime);
      } catch (e) {
        generatedField.value = 'エラー: 時間形式を確認してください';
      }
    }
  } else if (type === 'time') {
    const dateTimeInput = document.getElementById('mastodonPostIdOrTime').value.trim();
    const timeRangeInput = document.getElementById('mastodonTimeRange').value.trim();

    if (dateTimeInput && timeRangeInput) {
      try {
        const startTime = parseDateTime(dateTimeInput);
        const endTime = parseAndAddTime(startTime, timeRangeInput);
        generatedField.value = formatDateTime(endTime);
      } catch (e) {
        generatedField.value = 'エラー: 時間形式を確認してください';
      }
    }
  }
}

function parseDateTime(input) {
  const timeMatch = input.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
  if (!timeMatch) throw new Error('Invalid datetime format');

  const datePart = timeMatch[1];
  let Y, Mo, D;

  if (datePart.includes('-')) {
    [Y, Mo, D] = datePart.split('-').map(Number);
  } else {
    [Y, Mo, D] = datePart.split('/').map(Number);
  }

  const hh = timeMatch[2] ? Number(timeMatch[2]) : 0;
  const mm = timeMatch[3] ? Number(timeMatch[3]) : 0;
  const ss = timeMatch[4] ? Number(timeMatch[4]) : 0;

  return new Date(Y, Mo-1, D, hh, mm, ss, 0);
}

function parseAndAddTime(startDate, timeInput) {
  // 10 → 10:00:00, 10:30 → 10:30:00, 10:30:20 → 10:30:20 の形式を解析
  let hh = 0, mm = 0, ss = 0;

  if (timeInput.includes(':')) {
    const parts = timeInput.split(':');
    hh = Number(parts[0]) || 0;
    mm = Number(parts[1]) || 0;
    ss = Number(parts[2]) || 0;
  } else {
    // 数字のみの場合は時間として扱う
    hh = Number(timeInput) || 0;
  }

  const endDate = new Date(startDate.getTime());
  endDate.setHours(startDate.getHours() + hh);
  endDate.setMinutes(startDate.getMinutes() + mm);
  endDate.setSeconds(startDate.getSeconds() + ss);

  return endDate;
}

function formatDateTime(date) {
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const H = String(date.getHours()).padStart(2, '0');
  const Min = String(date.getMinutes()).padStart(2, '0');
  const S = String(date.getSeconds()).padStart(2, '0');

  return `${Y}-${M}-${D} ${H}:${Min}:${S}`;
}

function updateTimeRangeFromEndTime() {
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  const generatedField = document.getElementById('mastodonGeneratedTime');
  const timeRangeField = document.getElementById('mastodonTimeRange');

  if (!generatedField.value.trim()) return;

  try {
    const endTime = parseDateTime(generatedField.value.trim());
    let startTime;

    if (type === 'user') {
      const dateTimeInput = document.getElementById('mastodonTimeField').value.trim();
      if (dateTimeInput) {
        startTime = parseDateTime(dateTimeInput);
      }
    } else if (type === 'time') {
      const dateTimeInput = document.getElementById('mastodonPostIdOrTime').value.trim();
      if (dateTimeInput) {
        startTime = parseDateTime(dateTimeInput);
      }
    }

    if (startTime && endTime > startTime) {
      // 時間差を計算
      const diffMs = endTime.getTime() - startTime.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      // HH:MM:SS 形式で設定
      const timeRangeStr = `${diffHours}:${String(diffMinutes).padStart(2, '0')}:${String(diffSeconds).padStart(2, '0')}`;
      timeRangeField.value = timeRangeStr;
      localStorage.setItem('mastodon-content-timeRangeInput', timeRangeStr);
    }
  } catch (e) {
    // エラーの場合は何もしない
    console.warn('時間範囲の逆算でエラー:', e);
  }
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
  const generatedTimeDisplay = document.getElementById('mastodonGeneratedTimeDisplay');

  // すべて非表示にする
  mainInput.style.display = 'none';
  userInput.style.display = 'none';
  timeInput.style.display = 'none';
  generatedTimeDisplay.style.display = 'none';

  if (type === 'id') {
    mainInput.style.display = 'block';
    mainInputField.value = localStorage.getItem('mastodon-content-postId') || '114914719105992385';
    mainInputField.placeholder = '投稿ID';
    timeRangeSelector.style.display = 'none';
    generatedTimeDisplay.style.display = 'none';
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
    generatedTimeDisplay.style.display = 'block';

    // 保存されたtimeRange値を復元
    const savedTimeRangeInput = localStorage.getItem('mastodon-content-timeRangeInput');
    if (savedTimeRangeInput) {
      timeRangeSelect.value = savedTimeRangeInput;
    } else {
      timeRangeSelect.value = '1:00:00'; // デフォルト値
    }

    updateGeneratedTimeRange();
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
    mainInputField.placeholder = 'YYYY/M/D H:MM:SS';
    timeRangeSelector.style.display = 'block';
    generatedTimeDisplay.style.display = 'block';

    // 保存されたtimeRange値を復元
    const savedTimeRangeInput = localStorage.getItem('mastodon-content-timeRangeInput');
    if (savedTimeRangeInput) {
      timeRangeSelect.value = savedTimeRangeInput;
    } else {
      timeRangeSelect.value = '1:00:00'; // デフォルト値
    }

    updateGeneratedTimeRange();
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

      // @ を除去
      const cleanUsername = username.replace(/^@/, '');

      // リモートアカウント形式かローカル形式かを判定
      if (cleanUsername.includes('@')) {
        // @user@instance.com 形式の場合
        const parts = cleanUsername.split('@');
        if (parts.length !== 2) {
          throw new Error('リモートアカウントは @user@instance.com の形式で入力してください');
        }

        const usernameOnly = parts[0];
        const instanceDomain = parts[1];

        // ユーザー名部分のみを検証
        if (!/^[\w\-\.]+$/.test(usernameOnly)) {
          throw new Error('ユーザー名は英数字、ハイフン、ドットのみ使用可能です');
        }

        // インスタンスドメインの基本的な検証
        if (!/^[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}$/.test(instanceDomain)) {
          throw new Error('インスタンスドメインが正しくありません');
        }
      } else {
        // ローカルアカウント形式の場合
        if (!/^[\w\-\.]+$/.test(cleanUsername)) {
          throw new Error('ユーザー名は英数字、ハイフン、ドットのみ使用可能です');
        }
      }

      let timeFilter = null;
      if (timeInput) {
        // 様々な形式をサポート: YYYY-MM-DD, YYYY-MM-DD HH, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS
        // YYYY/MM/DD, YYYY/MM/DD HH, YYYY/MM/DD HH:MM, YYYY/MM/DD HH:MM:SS
        // 1桁の月日にも対応: YYYY/M/D H:MM:SS
        const timeMatch = timeInput.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
        if (!timeMatch) throw new Error('時間は YYYY-MM-DD, YYYY-MM-DD HH:MM:SS または YYYY/M/D H:MM:SS の形式で入力してください');

        const datePart = timeMatch[1];
        let Y, Mo, D;

        if (datePart.includes('-')) {
          [Y, Mo, D] = datePart.split('-').map(Number);
        } else {
          [Y, Mo, D] = datePart.split('/').map(Number);
        }

        // 時分秒の処理（未指定の場合は0）
        const hh = timeMatch[2] ? Number(timeMatch[2]) : 0;
        const mm = timeMatch[3] ? Number(timeMatch[3]) : 0;
        const ss = timeMatch[4] ? Number(timeMatch[4]) : 0;
        const timeRangeSelect = document.getElementById('mastodonTimeRange');
        const timeRangeInput = timeRangeSelect ? timeRangeSelect.value.trim() : '1:00:00';

        const startJst = new Date(Y, Mo-1, D, hh, mm, ss, 0);
        const endJst = parseAndAddTime(startJst, timeRangeInput);
        timeFilter = { start: startJst, end: endJst };
      }

      const posts = await fetchUserPosts(cleanUsername, timeFilter);
      displayPosts(posts);
    } else {
      const raw = document.getElementById('mastodonPostIdOrTime').value.trim();
      if (!raw) throw new Error('時間を入力してください');

      // 様々な形式をサポート: YYYY-MM-DD, YYYY-MM-DD HH, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS
      // YYYY/MM/DD, YYYY/MM/DD HH, YYYY/MM/DD HH:MM, YYYY/MM/DD HH:MM:SS
      // 1桁の月日にも対応: YYYY/M/D H:MM:SS
      const timeMatch = raw.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
      if (!timeMatch) throw new Error('日時形式は YYYY-MM-DD, YYYY-MM-DD HH:MM:SS または YYYY/M/D H:MM:SS です');

      const datePart = timeMatch[1];
      let Y, Mo, D;

      if (datePart.includes('-')) {
        [Y, Mo, D] = datePart.split('-').map(Number);
      } else {
        [Y, Mo, D] = datePart.split('/').map(Number);
      }

      // 時分秒の処理（未指定の場合は0）
      const hh = timeMatch[2] ? Number(timeMatch[2]) : 0;
      const mm = timeMatch[3] ? Number(timeMatch[3]) : 0;
      const ss = timeMatch[4] ? Number(timeMatch[4]) : 0;
      const timeRangeSelect = document.getElementById('mastodonTimeRange');
      const timeRangeInput = timeRangeSelect ? timeRangeSelect.value.trim() : '1:00:00';

      const startJst = new Date(Y, Mo-1, D, hh, mm, ss, 0);
      const endJst = parseAndAddTime(startJst, timeRangeInput);

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
  const instanceUrl = getCurrentInstanceUrl();
  const res = await fetch(`${instanceUrl}/api/v1/statuses/${id}`);
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
  const instanceUrl = getCurrentInstanceUrl();

  while (requestCount < maxRequests) {
    const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
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

  // ユーザー名の解析: user@instance.com か user かを判定
  let targetInstanceUrl;
  let cleanUsername;

  if (username.includes('@')) {
    // user@instance.com 形式の場合
    const parts = username.split('@');
    cleanUsername = parts[0]; // ユーザー名部分
    const instanceDomain = parts[1]; // インスタンスドメイン部分
    targetInstanceUrl = `https://${instanceDomain}`;
  } else {
    // user 形式の場合は現在のインスタンスを使用
    targetInstanceUrl = getCurrentInstanceUrl();
    cleanUsername = username;
  }

  const lookupUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/lookup`);
  lookupUrl.searchParams.set('acct', cleanUsername);

  const accountRes = await fetch(lookupUrl, {
    headers: {
      "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
      "X-Csrf-Token": stored["x_csrf_token"],
      "Authorization": stored["authorization"]
    },
    credentials: "include"
  }).catch(async () => {
    // CORS エラーの場合は認証なしで試行
    if (username.includes('@')) {
      return await fetch(lookupUrl);
    }
    throw new Error('認証エラー');
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
    const statusesUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
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
    }).catch(async () => {
      // CORS エラーの場合は認証なしで試行
      if (username.includes('@')) {
        return await fetch(statusesUrl);
      }
      throw new Error('認証エラー');
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

// ブーストされた投稿の適切な情報を取得するヘルパー関数
function getPostDisplayInfo(post) {
  const isBoost = post.reblog != null;

  if (isBoost) {
    const originalPost = post.reblog;
    const boosterUser = post.account.display_name || post.account.username;
    const boosterUsername = `@${post.account.username}`;

    // URLから /activity を削除
    let fixedUrl = post.url;
    if (fixedUrl && fixedUrl.endsWith('/activity')) {
      fixedUrl = fixedUrl.slice(0, -9); // '/activity' を削除
    }

    return {
      isBoost: true,
      boosterUser,
      boosterUsername,
      boostTime: post.created_at,
      originalPost,
      displayUrl: fixedUrl,
      displayContent: stripHtmlTags(originalPost.content, true) || 'テキストなし',
      displayUser: originalPost.account.display_name || originalPost.account.username,
      displayUsername: `@${originalPost.account.username}`,
      displayTime: originalPost.created_at,
      mediaAttachments: originalPost.media_attachments,
      card: originalPost.card
    };
  } else {
    return {
      isBoost: false,
      displayUrl: post.url,
      displayContent: stripHtmlTags(post.content, true) || 'テキストなし',
      displayUser: post.account.display_name || post.account.username,
      displayUsername: `@${post.account.username}`,
      displayTime: post.created_at,
      mediaAttachments: post.media_attachments,
      card: post.card
    };
  }
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
    const postInfo = getPostDisplayInfo(post);

    let displayText = '';
    let timeDisplay = '';

    if (postInfo.isBoost) {
      const boostTimeStr = new Date(postInfo.boostTime).toLocaleString('ja-JP');
      const originalTimeStr = new Date(postInfo.displayTime).toLocaleString('ja-JP');

      displayText = escapeHtml(postInfo.displayContent);
      timeDisplay = `ブースト: <span class="username">${escapeHtml(postInfo.boosterUser)}</span> ${boostTimeStr}\n元投稿: <span class="username">${escapeHtml(postInfo.displayUser)}</span> ${originalTimeStr}`;
    } else {
      displayText = escapeHtml(postInfo.displayContent);
      timeDisplay = new Date(postInfo.displayTime).toLocaleString('ja-JP');
    }

    // メディア添付の情報
    let mediaInfo = '';
    if (postInfo.mediaAttachments && postInfo.mediaAttachments.length > 0) {
      const mediaTypes = postInfo.mediaAttachments.map(m => m.type).join(', ');
      mediaInfo = `<div class="mastodon-post-media">📎 添付: ${mediaTypes} (${postInfo.mediaAttachments.length}件)</div>`;
    }

    return `<div class="mastodon-post-item" data-url="${postInfo.displayUrl}" data-post-data='${JSON.stringify(post).replace(/'/g, "&apos;")}'>
      <div class="mastodon-post-header">
        <div class="mastodon-post-user-info">
          ${postInfo.isBoost ? '' : `<strong>${escapeHtml(postInfo.displayUser)}</strong>`}
          <span class="mastodon-post-time-inline" style="white-space: pre-line;">${timeDisplay}</span>
        </div>
      </div>
      <div class="mastodon-post-content" style="white-space: pre-wrap;">${displayText}</div>
      ${mediaInfo}
    </div>`;
  }).join('');

  document.querySelectorAll('.mastodon-post-item').forEach(el => {
    el.addEventListener('click', () => window.open(el.dataset.url, '_blank'));

    // ホバープレビュー機能を追加
    let hoverTimeout;
    let isHoveringTooltip = false;

    el.addEventListener('mouseenter', (e) => {
      hoverTimeout = setTimeout(() => {
        showPostPreview(e.target, JSON.parse(e.target.dataset.postData));
      }, 500); // 500ms後にプレビュー表示
    });

    el.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
      // ツールチップにホバーしていない場合のみ非表示
      setTimeout(() => {
        if (!isHoveringTooltip) {
          hidePostPreview();
        }
      }, 100);
    });

    // ツールチップのホバー状態を管理
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('#mastodon-post-tooltip')) {
        isHoveringTooltip = true;
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('#mastodon-post-tooltip') && !e.relatedTarget?.closest('#mastodon-post-tooltip')) {
        isHoveringTooltip = false;
        setTimeout(() => {
          if (!isHoveringTooltip) {
            hidePostPreview();
          }
        }, 100);
      }
    });
  });
}

function showError(msg) {
  document.getElementById('mastodonResult').innerHTML = `<div class="mastodon-error">${escapeHtml(msg)}</div>`;
}

function stripHtmlTags(html, doRet = true) {
  let text = html;

  if (doRet) {
    text = text.replace(/<\/p><p>/g, '\n\n');
    text = text.replace(/<br\s*\/?>/g, '\n');
  } else {
    text = text.replace(/<\/p><p>/g, ' ');
    text = text.replace(/<br\s*\/?>/g, ' ');
  }

  // HTMLタグを除去
  const d = document.createElement('div');
  d.innerHTML = text;
  text = d.textContent || d.innerText || '';

  // HTMLエンティティをデコード
  text = text.replace(/&apos;/g, '\'');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');

  // 前後の空白・改行を除去
  text = text.trim();

  return text;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showPostPreview(element, post) {
  // 既存のツールチップを削除
  hidePostPreview();

  // デバッグ: cardの情報をコンソールに出力
  console.log('Post card info:', post.card);

  const tooltip = document.createElement('div');
  tooltip.id = 'mastodon-post-tooltip';
  tooltip.className = 'mastodon-post-tooltip';

  const postInfo = getPostDisplayInfo(post);

  let displayContent = '';
  let timeDisplay = '';
  let userInfo = '';

  if (postInfo.isBoost) {
    const boostTimeStr = new Date(postInfo.boostTime).toLocaleString('ja-JP');
    const originalTimeStr = new Date(postInfo.displayTime).toLocaleString('ja-JP');

    displayContent = postInfo.displayContent;
    timeDisplay = `ブースト: ${boostTimeStr}<br>元投稿: ${originalTimeStr} | ID: ${post.id}`;
    userInfo = `ブースト: <span class="mastodon-tooltip-clickable-user" style="cursor: pointer; text-decoration: underline; transition: color 0.2s ease;" data-profile-url="${post.account.url}">${escapeHtml(postInfo.boosterUser)}</span> <span style="cursor: default;">${escapeHtml(postInfo.boosterUsername)}</span><br>元投稿: <span class="mastodon-tooltip-clickable-user" style="cursor: pointer; text-decoration: underline; transition: color 0.2s ease;" data-profile-url="${postInfo.originalPost.account.url}">${escapeHtml(postInfo.displayUser)}</span> <span style="cursor: default;">${escapeHtml(postInfo.displayUsername)}</span>`;
  } else {
    displayContent = postInfo.displayContent;
    timeDisplay = `${new Date(postInfo.displayTime).toLocaleString('ja-JP')} | ID: ${post.id}`;
    userInfo = `<span class="mastodon-tooltip-clickable-user" style="cursor: pointer; text-decoration: underline; transition: color 0.2s ease;" data-profile-url="${post.account.url}">${escapeHtml(postInfo.displayUser)}</span> <span style="cursor: default;">${escapeHtml(postInfo.displayUsername)}</span>`;
  }

  const followers = postInfo.isBoost ? postInfo.originalPost.account.followers_count : post.account.followers_count;
  const following = postInfo.isBoost ? postInfo.originalPost.account.following_count : post.account.following_count;
  const statusesCount = postInfo.isBoost ? postInfo.originalPost.account.statuses_count : post.account.statuses_count;
  const reblogs = postInfo.isBoost ? postInfo.originalPost.reblogs_count : post.reblogs_count;
  const favourites = postInfo.isBoost ? postInfo.originalPost.favourites_count : post.favourites_count;
  const replies = postInfo.isBoost ? postInfo.originalPost.replies_count : post.replies_count;
  const avatar = postInfo.isBoost ? postInfo.originalPost.account.avatar : post.account.avatar;
  const profileUrl = postInfo.isBoost ? postInfo.originalPost.account.url : post.account.url;

  // メディア添付の情報とプレビュー
  let mediaInfo = '';
  if (postInfo.mediaAttachments && postInfo.mediaAttachments.length > 0) {
    const mediaTypes = postInfo.mediaAttachments.map(m => m.type).join(', ');
    mediaInfo = `<div class="mastodon-tooltip-media">📎 添付: ${mediaTypes} (${postInfo.mediaAttachments.length}件)</div>`;

    // メディアプレビューを生成
    const mediaPreview = postInfo.mediaAttachments.slice(0, 3).map(media => {
      if (media.type === 'image') {
        return `<img src="${media.preview_url || media.url}" alt="画像" class="mastodon-tooltip-image" loading="lazy">`;
      } else if (media.type === 'video' || media.type === 'gifv') {
        return `<video src="${media.url}" class="mastodon-tooltip-video" controls muted preload="metadata" poster="${media.preview_url}">
                  <p>動画を再生できません</p>
                </video>`;
      } else if (media.type === 'audio') {
        return `<audio src="${media.url}" class="mastodon-tooltip-audio" controls preload="metadata">
                  <p>音声を再生できません</p>
                </audio>`;
      }
      return '';
    }).filter(Boolean).join('');

    if (mediaPreview) {
      mediaInfo += `<div class="mastodon-tooltip-media-preview">${mediaPreview}</div>`;
    }

    if (postInfo.mediaAttachments.length > 3) {
      mediaInfo += `<div class="mastodon-tooltip-media-more">他 ${postInfo.mediaAttachments.length - 3} 件</div>`;
    }
  }

  // URLプレビューの情報
  let urlPreview = '';
  if (postInfo.card && postInfo.card.url && !postInfo.mediaAttachments?.length) {
    const card = postInfo.card;

    // URLの安全な処理
    let domain = '';
    try {
      domain = new URL(card.url).hostname;
    } catch (e) {
      domain = card.provider_name || 'リンク先';
    }

    urlPreview = `
      <div class="mastodon-tooltip-url-preview" data-url="${card.url}" style="cursor: pointer;">
        <div class="mastodon-tooltip-url-title">🔗 リンクプレビュー</div>
        <div class="mastodon-tooltip-url-card">
          ${card.image ? `<img src="${encodeURI(card.image)}" alt="プレビュー画像" class="mastodon-tooltip-url-image" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="mastodon-tooltip-url-content">
            <div class="mastodon-tooltip-url-card-title">${escapeHtml(card.title || 'タイトルなし')}</div>
            ${card.description ? `<div class="mastodon-tooltip-url-description">${escapeHtml(card.description.substring(0, 120))}${card.description.length > 120 ? '...' : ''}</div>` : ''}
            <div class="mastodon-tooltip-url-domain">${escapeHtml(domain)}</div>
          </div>
        </div>
      </div>
    `;
  } else if (postInfo.card && postInfo.card.url) {
    // メディアがあってもURLカードがある場合は簡易表示
    urlPreview = `
      <div class="mastodon-tooltip-url-simple" data-url="${postInfo.card.url}" style="cursor: pointer;">
        <div class="mastodon-tooltip-url-title">🔗 ${escapeHtml(postInfo.card.title || 'リンク')}</div>
        <div class="mastodon-tooltip-url-link-only">${escapeHtml(postInfo.card.url.length > 60 ? postInfo.card.url.substring(0, 57) + '...' : postInfo.card.url)}</div>
      </div>
    `;
  }

  // 投稿の詳細情報
  let visibility = '';
  const visibilityValue = postInfo.isBoost ? postInfo.originalPost.visibility : post.visibility;
  switch(visibilityValue) {
    case 'public': visibility = '🌐 公開'; break;
    case 'unlisted': visibility = '🔓 未収載'; break;
    case 'private': visibility = '🔒 フォロワー限定'; break;
    case 'direct': visibility = '✉️ ダイレクト'; break;
    default: visibility = visibilityValue;
  }

  tooltip.innerHTML = `
    <div class="mastodon-tooltip-header">
      <div class="mastodon-tooltip-user-info">
        <img src="${avatar}" alt="アバター" class="mastodon-tooltip-avatar" loading="lazy">
        <div class="mastodon-tooltip-user-text">
          <div class="mastodon-tooltip-user">
            <div class="mastodon-tooltip-user-names">${userInfo}</div>
          </div>
          <div class="mastodon-tooltip-time">${timeDisplay}</div>
        </div>
      </div>
    </div>
    <div class="mastodon-tooltip-content" style="white-space: pre-wrap;">${escapeHtml(displayContent)}</div>
    ${mediaInfo}
    ${urlPreview}
    <div class="mastodon-tooltip-interactions">
      <span class="mastodon-tooltip-visibility">${visibility}</span>
      <span class="mastodon-tooltip-post-count">投稿数: ${statusesCount}</span>
      <button class="mastodon-tooltip-go-post" style="cursor: pointer; background: none; border: none; color: #fff; font-size: 13px; text-decoration: underline; padding: 0; margin-left: 5px; transition: color 0.2s ease;" data-post-url="${postInfo.displayUrl}">移動</button>
      <span class="mastodon-tooltip-counts">
        💬 ${replies} | 🔄 ${reblogs} | ⭐ ${favourites}
      </span>
    </div>
  `;

  // ツールチップのスタイルを設定
  const hasMedia = post.media_attachments && post.media_attachments.length > 0;
  const hasUrlPreview = post.card && post.card.url && !post.media_attachments?.length;
  const maxWidth = (hasMedia || hasUrlPreview) ? '500px' : '400px';

  tooltip.style.cssText = `
    position: fixed;
    background: #282c37;
    color: #fff;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: ${maxWidth};
    font-size: 13px;
    line-height: 1.4;
    border: 1px solid #393f4f;
    pointer-events: auto;
    cursor: default;
  `;

  document.body.appendChild(tooltip);

  // ツールチップ自体にマウスイベントを追加
  tooltip.addEventListener('mouseenter', () => {
    // ツールチップにマウスが入った場合、非表示をキャンセル
  });

  tooltip.addEventListener('mouseleave', () => {
    // ツールチップからマウスが離れた場合、少し遅延して非表示
    setTimeout(() => {
      hidePostPreview();
    }, 100);
  });

  // リンクプレビューのクリックイベントを追加
  const urlPreviewElement = tooltip.querySelector('.mastodon-tooltip-url-preview');
  if (urlPreviewElement) {
    urlPreviewElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = urlPreviewElement.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank');
      }
    });
  }

  const urlSimpleElement = tooltip.querySelector('.mastodon-tooltip-url-simple');
  if (urlSimpleElement) {
    urlSimpleElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = urlSimpleElement.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank');
      }
    });
  }

  // 個別のクリック可能なユーザー名のイベントを追加
  const clickableUsers = tooltip.querySelectorAll('.mastodon-tooltip-clickable-user');
  clickableUsers.forEach(userElement => {
    userElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileUrl = userElement.getAttribute('data-profile-url');
      if (profileUrl) {
        window.open(profileUrl, '_blank');
      }
    });

    // ホバーエフェクトを追加
    userElement.addEventListener('mouseenter', () => {
      userElement.style.color = '#6364ff';
    });

    userElement.addEventListener('mouseleave', () => {
      userElement.style.color = '#fff';
    });
  });

  // 投稿移動ボタンのクリックイベントを追加
  const goPostButton = tooltip.querySelector('.mastodon-tooltip-go-post');
  if (goPostButton) {
    goPostButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const postUrl = goPostButton.getAttribute('data-post-url');
      if (postUrl) {
        window.open(postUrl, '_blank');
      }
    });

    // ホバーエフェクトを追加
    goPostButton.addEventListener('mouseenter', () => {
      goPostButton.style.color = '#6364ff';
    });

    goPostButton.addEventListener('mouseleave', () => {
      goPostButton.style.color = '#fff';
    });
  }

  // ツールチップの位置を調整
  const rect = element.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  let left = rect.left + rect.width + 10;
  let top = rect.top;

  // 画面の右端を超える場合は、まず画面内に収まるように右端に合わせる
  if (left + tooltipRect.width > window.innerWidth - 10) {
    left = window.innerWidth - tooltipRect.width - 10;

    // それでも要素と重なる場合のみ左側に表示
    if (left < rect.right) {
      left = rect.left - tooltipRect.width - 10;

      // 左端を超える場合は右側優先で表示（右側にはみ出すことを許可）
      if (left < 10) {
        left = rect.left + rect.width + 10; // 右側に戻す
      } else {
        // 左側表示時の下端調整
        if (top + tooltipRect.height > window.innerHeight - 10) {
          // ホバーしている要素の上に配置を試行
          top = rect.top - tooltipRect.height - 10;

          // 上に表示しても画面上端を超える場合は、ホバー要素の中央に合わせて画面内に収める
          if (top < 10) {
            // ホバーしている要素の中央を基準に調整
            const elementCenter = rect.top + rect.height / 2;
            const tooltipHalfHeight = tooltipRect.height / 2;

            // 要素の中央にツールチップの中央を合わせる
            top = elementCenter - tooltipHalfHeight;

            // 画面の境界内に収める
            top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));
          }
        }
      }
    }
  }

  // 右側表示時の画面の下端を超える場合の調整
  if (left >= rect.left + rect.width && top + tooltipRect.height > window.innerHeight - 10) {
    // ホバーしている要素の上に配置を試行
    top = rect.top - tooltipRect.height - 10;

    // 上に表示しても画面上端を超える場合は、ホバー要素の中央に合わせて画面内に収める
    if (top < 10) {
      // ホバーしている要素の中央を基準に調整
      const elementCenter = rect.top + rect.height / 2;
      const tooltipHalfHeight = tooltipRect.height / 2;

      // 要素の中央にツールチップの中央を合わせる
      top = elementCenter - tooltipHalfHeight;

      // 画面の境界内に収める
      top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));
    }
  }

  // 最終的な境界チェック
  left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
  top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hidePostPreview() {
  const tooltip = document.getElementById('mastodon-post-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
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
