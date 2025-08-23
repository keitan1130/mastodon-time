// Content Script for Mastodon Timeline Viewer

let mastodonViewerInjected = false;

// 現在のページからインスタンスURLを取得する関数
function getCurrentInstanceUrl() {
  // content scriptは現在のページのドメインを直接取得できる
  return `${window.location.protocol}//${window.location.host}`;
}

// 表示されているインスタンス情報を取得する関数（復元された情報を優先）
function getActiveInstanceUrl() {
  const instanceNameSpan = document.getElementById('instanceName');
  const resetButton = document.getElementById('instanceResetBtn');

  // リセットボタンがある場合は復元されたインスタンス情報を使用
  if (resetButton && instanceNameSpan && instanceNameSpan.title) {
    const urlMatch = instanceNameSpan.title.match(/URL: (https?:\/\/[^\s]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
  }

  // リセットボタンがない場合は現在のページのドメインを使用
  return getCurrentInstanceUrl();
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
      <div style="display: flex; align-items: center; gap: 10px;">
        <h3>投稿検索</h3>
        <span id="instanceName" class="mastodon-instance-name">読み込み中...</span>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <button id="mastodon-history-btn" class="mastodon-history-btn">履歴</button>
        <button id="mastodon-viewer-toggle" class="mastodon-toggle-btn">▶</button>
      </div>
    </div>
    <div id="mastodon-viewer-content" class="mastodon-viewer-content" style="display: none;">
      <div class="mastodon-input-type-selector">
        <label>入力方式:</label>
        <div class="mastodon-radio-group">
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="time" checked>
            <span>パブリック</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="user">
            <span>ユーザー名</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="id">
            <span>投稿ID</span>
          </label>
        </div>
      </div>

      <div id="mastodon-main-input" class="mastodon-input-group">
        <label for="mastodonPostIdOrTime">開始時刻:</label>
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

      <div id="mastodonSearchModeSelector" class="mastodon-input-group" style="display: none;">
        <label>検索方式:</label>
        <div class="mastodon-radio-group">
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonSearchMode" value="timeRange" checked>
            <span>時間範囲</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonSearchMode" value="postCount">
            <span>投稿件数</span>
          </label>
        </div>
      </div>

      <div id="mastodonTimeRangeSelector" class="mastodon-input-group">
        <label for="mastodonTimeRange">時間:</label>
        <input type="text" id="mastodonTimeRange" placeholder="HH:MM:SS" style="width: 120px;">
        <span>（開始時刻に追加）</span>
      </div>

      <div id="mastodonPostCountSelector" class="mastodon-input-group" style="display: none;">
        <label for="mastodonPostCount">取得件数:</label>
        <input type="number" id="mastodonPostCount" placeholder="200" min="-10000" max="10000" value="200" style="width: 80px;">
        <span>件（+未来,-過去,最大10000件）</span>
        <div id="mastodonSearchTimeSelector" style="display: none; margin-top: 8px;">
          <label for="mastodonSearchTime">検索時間:</label>
          <input type="text" id="mastodonSearchTime" placeholder="24:00:00" value="24:00:00" style="width: 80px;">
          <span>（HH:MM:SS形式、since_idとmax_idの間隔）</span>
        </div>
      </div>

      <div id="mastodonGeneratedTimeDisplay" class="mastodon-input-group">
        <label for="mastodonGeneratedTime">終了時刻:</label>
        <input type="text" id="mastodonGeneratedTime" placeholder="YYYY-M-D HH:MM:SS" style="width: 100%;">
      </div>

      <button id="mastodonFetchPost" class="mastodon-fetch-btn">取得</button>

      <div id="mastodonResult" class="mastodon-result"></div>
    </div>

    <!-- 履歴モーダル -->
    <div id="mastodon-history-modal" class="mastodon-history-modal" style="display: none;">
      <div class="mastodon-history-modal-content">
        <div class="mastodon-history-modal-header">
          <h3>検索履歴</h3>
          <button id="mastodon-history-close" class="mastodon-history-close">&times;</button>
        </div>
        <div class="mastodon-history-modal-body">
          <div id="mastodon-history-list" class="mastodon-history-list">
            履歴がありません
          </div>
          <div class="mastodon-history-modal-footer">
            <button id="mastodon-history-clear" class="mastodon-history-clear-btn">履歴をクリア</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ホームタイムラインの上部に挿入
  const timelineContainer = document.querySelector('.column');
  if (timelineContainer) {
    timelineContainer.insertBefore(viewerContainer, timelineContainer.firstChild);
  }

  // イベントリスナーを設定
  setupEventListeners();

  // インスタンス名を表示
  updateInstanceNameDisplay();

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

  // 検索方式の切り替えイベント
  const searchModeButtons = document.querySelectorAll('input[name="mastodonSearchMode"]');
  searchModeButtons.forEach(radio => {
    radio.addEventListener('change', updateSearchModeUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-content-searchMode', this.value);
    });
  });

  // 前回の検索方式を復元
  const savedSearchMode = localStorage.getItem('mastodon-content-searchMode');
  if (savedSearchMode) {
    const targetSearchMode = document.querySelector(`input[name="mastodonSearchMode"][value="${savedSearchMode}"]`);
    if (targetSearchMode) {
      targetSearchMode.checked = true;
    }
  }

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

  // 投稿件数フィールドの自動保存と検索時間フィールドの表示制御
  const postCountField = document.getElementById('mastodonPostCount');
  postCountField.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-postCount', this.value);
    updateSearchTimeVisibility();
  });

  // 検索時間フィールドの自動保存
  const searchTimeField = document.getElementById('mastodonSearchTime');
  searchTimeField.addEventListener('input', function() {
    localStorage.setItem('mastodon-content-searchTime', this.value);
  });

  // 前回の検索時間を復元
  const savedSearchTime = localStorage.getItem('mastodon-content-searchTime');
  if (savedSearchTime) {
    searchTimeField.value = savedSearchTime;
  }

  // 前回の投稿件数を復元
  const savedPostCount = localStorage.getItem('mastodon-content-postCount');
  if (savedPostCount) {
    postCountField.value = savedPostCount;
  }

  // 終了時刻（生成された範囲）フィールドの変更で時間範囲を逆算
  document.getElementById('mastodonGeneratedTime').addEventListener('input', function() {
    updateTimeRangeFromEndTime();
  });

  // 検索ボタン
  document.getElementById('mastodonFetchPost').addEventListener('click', handleSearch);

  // 履歴ボタン
  document.getElementById('mastodon-history-btn').addEventListener('click', toggleHistoryView);

  // 履歴モーダルの閉じるボタン
  document.getElementById('mastodon-history-close').addEventListener('click', hideHistory);

  // 履歴クリアボタン
  document.getElementById('mastodon-history-clear').addEventListener('click', clearHistory);

  // モーダルの背景クリックで閉じる
  document.getElementById('mastodon-history-modal').addEventListener('click', (e) => {
    if (e.target.id === 'mastodon-history-modal') {
      hideHistory();
    }
  });

  updateInputUI();
  // updateHistoryButton(); // 履歴数は履歴表示時に動的に更新されるため不要
}

function updateSearchModeUI() {
  const searchMode = document.querySelector('input[name="mastodonSearchMode"]:checked').value;
  const timeRangeSelector = document.getElementById('mastodonTimeRangeSelector');
  const postCountSelector = document.getElementById('mastodonPostCountSelector');
  const generatedTimeDisplay = document.getElementById('mastodonGeneratedTimeDisplay');

  if (searchMode === 'timeRange') {
    timeRangeSelector.style.display = 'block';
    postCountSelector.style.display = 'none';
    generatedTimeDisplay.style.display = 'block';
    updateGeneratedTimeRange();
  } else {
    timeRangeSelector.style.display = 'none';
    postCountSelector.style.display = 'block';
    generatedTimeDisplay.style.display = 'none';
    updateSearchTimeVisibility();
  }
}

function updateSearchTimeVisibility() {
  const postCountField = document.getElementById('mastodonPostCount');
  const searchTimeSelector = document.getElementById('mastodonSearchTimeSelector');

  if (postCountField && searchTimeSelector) {
    const postCount = parseInt(postCountField.value) || 0;
    // 正の値（未来方向）の場合のみ検索時間フィールドを表示
    if (postCount > 0) {
      searchTimeSelector.style.display = 'block';
    } else {
      searchTimeSelector.style.display = 'none';
    }
  }
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
  // 混在区切り文字にも対応した正規表現
  const timeMatch = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
  if (!timeMatch) throw new Error('Invalid datetime format');

  const Y = Number(timeMatch[1]);
  const Mo = Number(timeMatch[2]);
  const D = Number(timeMatch[3]);
  const hh = timeMatch[4] ? Number(timeMatch[4]) : 0;
  const mm = timeMatch[5] ? Number(timeMatch[5]) : 0;
  const ss = timeMatch[6] ? Number(timeMatch[6]) : 0;

  return new Date(Y, Mo-1, D, hh, mm, ss, 0);
}

function parseAndAddTime(startDate, timeInput) {
  // 10 → 10:00:00, 10:30 → 10:30:00, 10:30:20 → 10:30:20 の形式を解析
  // マイナス値もサポート: -1:30:00 → -1時間30分
  let hh = 0, mm = 0, ss = 0;

  if (timeInput.includes(':')) {
    const parts = timeInput.split(':');
    hh = Number(parts[0]) || 0;
    mm = Number(parts[1]) || 0;
    ss = Number(parts[2]) || 0;
  } else {
    // 数字のみの場合は時間として扱う（マイナス値も対応）
    hh = Number(timeInput) || 0;
  }

  const endDate = new Date(startDate.getTime());
  endDate.setHours(startDate.getHours() + hh);
  endDate.setMinutes(startDate.getMinutes() + mm);
  endDate.setSeconds(startDate.getSeconds() + ss);

  return endDate;
}

// 検索時間（HH:MM:SS）をミリ秒に変換するヘルパー関数
function parseSearchTimeToMs(timeInput) {
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

  return (hh * 3600 + mm * 60 + ss) * 1000;
}

// 開始時刻と終了時刻を自動調整する関数
function adjustTimeRange(startTime, endTime, startField, endField, storageKey) {
  if (endTime <= startTime) {
    // 終了時刻が開始時刻以前の場合、入れ替える
    const temp = startTime;
    const adjustedStartTime = endTime;
    const adjustedEndTime = temp;

    // UIを更新
    startField.value = formatDateTime(adjustedStartTime);
    endField.value = formatDateTime(adjustedEndTime);

    // localStorage更新
    if (storageKey) {
      localStorage.setItem(storageKey, formatDateTime(adjustedStartTime));
    }

    // 時間範囲フィールドも更新
    const timeRangeField = document.getElementById('mastodonTimeRange');
    if (timeRangeField) {
      const diffMs = adjustedEndTime.getTime() - adjustedStartTime.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      const timeRangeStr = `${diffHours}:${String(diffMinutes).padStart(2, '0')}:${String(diffSeconds).padStart(2, '0')}`;
      timeRangeField.value = timeRangeStr;
      localStorage.setItem('mastodon-content-timeRangeInput', timeRangeStr);
    }

    return { start: adjustedStartTime, end: adjustedEndTime };
  }

  return { start: startTime, end: endTime };
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

  if (!generatedField.value.trim()) {
    // 終了時刻が空の場合は時間範囲もクリア
    timeRangeField.value = '';
    localStorage.removeItem('mastodon-content-timeRangeInput');
    return;
  }

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

    if (!startTime) {
      // 開始時刻が設定されていない場合 - 何もしない
      return;
    }

    // 時間差を計算（マイナス値も許可）
    const diffMs = endTime.getTime() - startTime.getTime();
    const absDiffMs = Math.abs(diffMs);
    const sign = diffMs < 0 ? '-' : '';

    const diffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSeconds = Math.floor((absDiffMs % (1000 * 60)) / 1000);

    // 24時間を超える場合も許可、マイナス値も表示
    // HH:MM:SS 形式で設定
    const timeRangeStr = `${sign}${diffHours}:${String(diffMinutes).padStart(2, '0')}:${String(diffSeconds).padStart(2, '0')}`;
    timeRangeField.value = timeRangeStr;
    localStorage.setItem('mastodon-content-timeRangeInput', timeRangeStr);
  } catch (e) {
    // 日時形式エラーの場合 - 何もしない
    console.warn('時間範囲の逆算でエラー:', e);
  }
}

function updateInputUI() {
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  const mainInput = document.getElementById('mastodon-main-input');
  const userInput = document.getElementById('mastodonUserInput');
  const timeInput = document.getElementById('mastodonTimeInput');
  const timeRangeSelector = document.getElementById('mastodonTimeRangeSelector');
  const postCountSelector = document.getElementById('mastodonPostCountSelector');
  const searchModeSelector = document.getElementById('mastodonSearchModeSelector');
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
  searchModeSelector.style.display = 'none';
  timeRangeSelector.style.display = 'none';
  postCountSelector.style.display = 'none';

  if (type === 'id') {
    mainInput.style.display = 'block';
    mainInputField.value = localStorage.getItem('mastodon-content-postId') || '114914719105992385';
    mainInputField.placeholder = '投稿ID';

    // ラベルを変更
    const mainInputLabel = document.querySelector('label[for="mastodonPostIdOrTime"]');
    if (mainInputLabel) {
      mainInputLabel.textContent = '投稿ID:';
    }
  } else if (type === 'user') {
    userInput.style.display = 'block';
    timeInput.style.display = 'block';
    searchModeSelector.style.display = 'block';

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

    // 保存されたtimeRange値を復元
    const savedTimeRangeInput = localStorage.getItem('mastodon-content-timeRangeInput');
    if (savedTimeRangeInput) {
      timeRangeSelect.value = savedTimeRangeInput;
    } else {
      timeRangeSelect.value = '1:00:00'; // デフォルト値
    }

    updateSearchModeUI();
    updateGeneratedTimeRange();
  } else {
    // パブリック（time）モード
    mainInput.style.display = 'block';
    searchModeSelector.style.display = 'block';

    // ラベルを変更
    const mainInputLabel = document.querySelector('label[for="mastodonPostIdOrTime"]');
    if (mainInputLabel) {
      mainInputLabel.textContent = '開始時刻:';
    }

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

    // 保存されたtimeRange値を復元
    const savedTimeRangeInput = localStorage.getItem('mastodon-content-timeRangeInput');
    if (savedTimeRangeInput) {
      timeRangeSelect.value = savedTimeRangeInput;
    } else {
      timeRangeSelect.value = '1:00:00'; // デフォルト値
    }

    updateSearchModeUI();
    updateGeneratedTimeRange();
  }

  // 検索時間の表示制御を更新
  updateSearchTimeVisibility();

  document.getElementById('mastodonResult').innerHTML = '';
}

async function handleSearch() {
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  const resultDiv = document.getElementById('mastodonResult');

  // 使用するインスタンスを取得して表示
  const activeInstanceUrl = getActiveInstanceUrl();
  const instanceNameSpan = document.getElementById('instanceName');
  const instanceName = instanceNameSpan ? instanceNameSpan.textContent : new URL(activeInstanceUrl).hostname;

  resultDiv.innerHTML = `<div class="mastodon-loading">取得中... (${instanceName})</div>`;

  try {
    if (type === 'id') {
      const raw = document.getElementById('mastodonPostIdOrTime').value.trim();
      if (!raw) throw new Error('投稿IDを入力してください');
      if (!/^\d+$/.test(raw)) throw new Error('投稿IDは数字のみです');

      const post = await fetchMastodonPost(raw);
      displayPosts([post]);

      // 検索成功時に履歴を保存
      await saveSearchHistory('id', { postId: raw }, [post]);
    } else if (type === 'user') {
      const username = document.getElementById('mastodonUsernameField').value.trim();
      const timeInput = document.getElementById('mastodonTimeField').value.trim();
      const searchMode = document.querySelector('input[name="mastodonSearchMode"]:checked').value;

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

      let fetchOptions = { searchMode };

      if (searchMode === 'postCount') {
        // 投稿件数指定モード
        const postCountInput = parseInt(document.getElementById('mastodonPostCount').value) || 200;
        if (Math.abs(postCountInput) < 1 || Math.abs(postCountInput) > 10000) {
          throw new Error('投稿件数は-10000から10000の範囲で入力してください（0以外）');
        }

        fetchOptions.postCount = postCountInput; // 正負の値をそのまま渡す

        if (timeInput) {
          const startTime = parseDateTime(timeInput);
          fetchOptions.startTime = startTime;
        }
      } else {
        // 時間範囲指定モード - 従来の処理
        if (!timeInput) {
          throw new Error('時間範囲モードでは開始時刻の入力が必要です');
        }

        // 様々な形式をサポート: YYYY-MM-DD, YYYY-MM-DD HH, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS
        // YYYY/MM/DD, YYYY/MM/DD HH, YYYY/MM/DD HH:MM, YYYY/MM/DD HH:MM:SS
        // 1桁の月日にも対応: YYYY/M/D H:MM:SS
        const timeMatch = timeInput.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
        if (!timeMatch) throw new Error('時間は YYYY-MM-DD, YYYY-MM-DD HH:MM:SS または YYYY/M/D H:MM:SS の形式で入力してください');

        const Y = Number(timeMatch[1]);
        const Mo = Number(timeMatch[2]);
        const D = Number(timeMatch[3]);
        const hh = timeMatch[4] ? Number(timeMatch[4]) : 0;
        const mm = timeMatch[5] ? Number(timeMatch[5]) : 0;
        const ss = timeMatch[6] ? Number(timeMatch[6]) : 0;

        const timeRangeSelect = document.getElementById('mastodonTimeRange');
        const timeRangeInput = timeRangeSelect ? timeRangeSelect.value.trim() : '1:00:00';

        const startJst = new Date(Y, Mo-1, D, hh, mm, ss, 0);

        // 終了時刻フィールドから終了時刻を取得して検証・入れ替え
        const generatedField = document.getElementById('mastodonGeneratedTime');
        const startField = document.getElementById('mastodonTimeField');
        let endJst;

        if (generatedField && generatedField.value.trim()) {
          try {
            const userEndTime = parseDateTime(generatedField.value.trim());
            const adjustedTimes = adjustTimeRange(startJst, userEndTime, startField, generatedField, 'mastodon-content-userTime');
            fetchOptions.timeFilter = { start: adjustedTimes.start, end: adjustedTimes.end };
          } catch (e) {
            // パース失敗時はtimeRangeInputを使用
            endJst = parseAndAddTime(startJst, timeRangeInput);
            fetchOptions.timeFilter = { start: startJst, end: endJst };
          }
        } else {
          endJst = parseAndAddTime(startJst, timeRangeInput);
          // マイナス値の場合の処理
          if (endJst <= startJst) {
            const adjustedTimes = adjustTimeRange(startJst, endJst, startField, generatedField, 'mastodon-content-userTime');
            fetchOptions.timeFilter = { start: adjustedTimes.start, end: adjustedTimes.end };
          } else {
            fetchOptions.timeFilter = { start: startJst, end: endJst };
          }
        }
      }

      const posts = await fetchUserPosts(cleanUsername, fetchOptions);
      displayPosts(posts);

      // 検索対象のインスタンス情報を取得
      let targetInstanceInfo = null;
      if (cleanUsername.includes('@')) {
        // リモートユーザーの場合
        const parts = cleanUsername.split('@');
        const instanceDomain = parts[1];
        const targetInstanceUrl = `https://${instanceDomain}`;

        try {
          // 検索対象インスタンスの情報を取得
          const apiUrl = `${targetInstanceUrl}/api/v1/instance`;
          const response = await fetch(apiUrl);

          if (response.ok) {
            const instanceData = await response.json();
            targetInstanceInfo = {
              url: targetInstanceUrl,
              name: instanceData.title || instanceData.short_description || instanceDomain
            };
          } else {
            // APIが利用できない場合はドメイン名を使用
            targetInstanceInfo = {
              url: targetInstanceUrl,
              name: instanceDomain
            };
          }
        } catch (error) {
          // エラーの場合はドメイン名を使用
          targetInstanceInfo = {
            url: targetInstanceUrl,
            name: instanceDomain
          };
        }
      }

      // 検索成功時に履歴を保存
      // 時刻を正規化（YYYY-MM-DD HH:MM:SS形式）
      let normalizedTimeInput = null;
      if (timeInput) {
        const timeMatch = timeInput.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
        if (timeMatch) {
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

          // 正規化された時刻文字列を作成
          normalizedTimeInput = `${Y}-${String(Mo).padStart(2, '0')}-${String(D).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }
      }

      await saveSearchHistory('user', {
        username: cleanUsername,
        timeInput: normalizedTimeInput,
        searchMode,
        postCount: searchMode === 'postCount' ? parseInt(document.getElementById('mastodonPostCount').value) || 200 : null,
        timeRange: searchMode === 'timeRange' ? document.getElementById('mastodonTimeRange').value.trim() : null,
        searchTime: searchMode === 'postCount' ? document.getElementById('mastodonSearchTime').value.trim() : null
      }, posts, targetInstanceInfo);
    } else if (type === 'time') {
      // パブリック（時間）モード
      const raw = document.getElementById('mastodonPostIdOrTime').value.trim();
      const searchMode = document.querySelector('input[name="mastodonSearchMode"]:checked').value;

      if (searchMode === 'postCount') {
        // 投稿件数指定モード
        const postCountInput = parseInt(document.getElementById('mastodonPostCount').value) || 200;
        if (Math.abs(postCountInput) < 1 || Math.abs(postCountInput) > 10000) {
          throw new Error('投稿件数は-10000から10000の範囲で入力してください（0以外）');
        }

        let startTime = null;
        if (raw) {
          const timeMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
          if (timeMatch) {
            const Y = Number(timeMatch[1]);
            const Mo = Number(timeMatch[2]);
            const D = Number(timeMatch[3]);
            const hh = timeMatch[4] ? Number(timeMatch[4]) : 0;
            const mm = timeMatch[5] ? Number(timeMatch[5]) : 0;
            const ss = timeMatch[6] ? Number(timeMatch[6]) : 0;
            startTime = new Date(Y, Mo-1, D, hh, mm, ss, 0);
          }
        }

        // 投稿件数による公開タイムライン検索
        const posts = await fetchPublicTimelineByCount(postCountInput, startTime);
        displayPosts(posts);

        // 時刻を正規化（YYYY-MM-DD HH:MM:SS形式）
        let normalizedTimeInput = null;
        if (raw) {
          const timeMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
          if (timeMatch) {
            const Y = Number(timeMatch[1]);
            const Mo = Number(timeMatch[2]);
            const D = Number(timeMatch[3]);
            const hh = timeMatch[4] ? Number(timeMatch[4]) : 0;
            const mm = timeMatch[5] ? Number(timeMatch[5]) : 0;
            const ss = timeMatch[6] ? Number(timeMatch[6]) : 0;

            // 正規化された時刻文字列を作成
            normalizedTimeInput = `${Y}-${String(Mo).padStart(2, '0')}-${String(D).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
          }
        }

        // 検索成功時に履歴を保存
        await saveSearchHistory('time', {
          timeInput: normalizedTimeInput,
          searchMode: 'postCount',
          postCount: postCountInput,
          searchTime: document.getElementById('mastodonSearchTime').value.trim()
        }, posts);
      } else {
        // 時間範囲指定モード（従来の処理）
        if (!raw) throw new Error('時間を入力してください');

        // 様々な形式をサポート: YYYY-MM-DD, YYYY-MM-DD HH, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS
        // YYYY/MM/DD, YYYY/MM/DD HH, YYYY/MM/DD HH:MM, YYYY/MM/DD HH:MM:SS
        // 1桁の月日にも対応: YYYY/M/D H:MM:SS
        const timeMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
        if (!timeMatch) throw new Error('日時形式は YYYY-MM-DD, YYYY-MM-DD HH:MM:SS または YYYY/M/D H:MM:SS です');

        const Y = Number(timeMatch[1]);
        const Mo = Number(timeMatch[2]);
        const D = Number(timeMatch[3]);
        const hh = timeMatch[4] ? Number(timeMatch[4]) : 0;
        const mm = timeMatch[5] ? Number(timeMatch[5]) : 0;
        const ss = timeMatch[6] ? Number(timeMatch[6]) : 0;

        const timeRangeSelect = document.getElementById('mastodonTimeRange');
        const timeRangeInput = timeRangeSelect ? timeRangeSelect.value.trim() : '1:00:00';

        const startJst = new Date(Y, Mo-1, D, hh, mm, ss, 0);

        // 終了時刻フィールドから終了時刻を取得して検証・入れ替え
        const generatedField = document.getElementById('mastodonGeneratedTime');
        let endJst;
        let finalStartTime = startJst;
        let finalEndTime;

        if (generatedField && generatedField.value.trim()) {
          try {
            const userEndTime = parseDateTime(generatedField.value.trim());
            const adjustedTimes = adjustTimeRange(startJst, userEndTime,
              document.getElementById('mastodonPostIdOrTime'), generatedField, 'mastodon-content-timeRange');
            finalStartTime = adjustedTimes.start;
            finalEndTime = adjustedTimes.end;
          } catch (e) {
            // パース失敗時はtimeRangeInputを使用
            finalEndTime = parseAndAddTime(startJst, timeRangeInput);
          }
        } else {
          finalEndTime = parseAndAddTime(startJst, timeRangeInput);
          // マイナス値の場合の処理
          if (finalEndTime <= startJst) {
            const adjustedTimes = adjustTimeRange(startJst, finalEndTime,
              document.getElementById('mastodonPostIdOrTime'), generatedField, 'mastodon-content-timeRange');
            finalStartTime = adjustedTimes.start;
            finalEndTime = adjustedTimes.end;
            // 生成された範囲フィールドも更新
            if (generatedField) {
              generatedField.value = formatDateTime(finalEndTime);
            }
          }
        }

        const startId = generateSnowflakeIdFromJst(finalStartTime);
        const endId = generateSnowflakeIdFromJst(finalEndTime);
        const posts = await fetchPublicTimelineInRange(startId, endId);
        displayPosts(posts);

        // 時刻を正規化（YYYY-MM-DD HH:MM:SS形式）
        const normalizedTimeInput = `${Y}-${String(Mo).padStart(2, '0')}-${String(D).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

        // 検索成功時に履歴を保存
        await saveSearchHistory('time', {
          timeInput: normalizedTimeInput,
          searchMode: 'timeRange',
          timeRange: timeRangeInput,
          startTime: finalStartTime,
          endTime: finalEndTime
        }, posts);
      }
    }
  } catch (err) {
    showError(err.message);
  }
}

// popup.jsから必要な関数をコピー
async function fetchMastodonPost(id) {
  const instanceUrl = getActiveInstanceUrl();
  const res = await fetch(`${instanceUrl}/api/v1/statuses/${id}`);
  if (!res.ok) throw new Error(`投稿取得エラー: ${res.status}`);
  return res.json();
}

function getStorageAsync(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

// 大容量データ保存のための分割ストレージ機能
async function saveLargeData(key, data) {
  const jsonData = JSON.stringify(data);
  const dataSize = new Blob([jsonData]).size;

  console.log(`Saving data: ${key}, Size: ${(dataSize / 1024 / 1024).toFixed(2)}MB`);

  // 5MB以下なら通常保存
  if (dataSize < 5 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: data }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // 大容量の場合は分割保存
  const chunkSize = 3 * 1024 * 1024; // 3MB per chunk
  const chunks = [];

  for (let i = 0; i < jsonData.length; i += chunkSize) {
    chunks.push(jsonData.slice(i, i + chunkSize));
  }

  const metadata = {
    isChunked: true,
    totalChunks: chunks.length,
    originalSize: dataSize,
    timestamp: Date.now()
  };

  try {
    // メタデータを保存
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [`${key}_meta`]: metadata }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    // チャンクを順次保存
    for (let i = 0; i < chunks.length; i++) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [`${key}_chunk_${i}`]: chunks[i] }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }

    console.log(`Successfully saved ${chunks.length} chunks for ${key}`);
  } catch (error) {
    console.error('Failed to save large data:', error);
    throw error;
  }
}

// 大容量データ読み込み機能
async function loadLargeData(key) {
  try {
    // まず通常データを試す
    const normalData = await new Promise((resolve) => {
      chrome.storage.local.get([key], resolve);
    });

    if (normalData[key] !== undefined) {
      return normalData[key];
    }

    // メタデータを確認
    const metaData = await new Promise((resolve) => {
      chrome.storage.local.get([`${key}_meta`], resolve);
    });

    const metadata = metaData[`${key}_meta`];
    if (!metadata || !metadata.isChunked) {
      return null;
    }

    console.log(`Loading chunked data: ${key}, ${metadata.totalChunks} chunks`);

    // チャンクを読み込み
    const chunkKeys = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      chunkKeys.push(`${key}_chunk_${i}`);
    }

    const chunksData = await new Promise((resolve) => {
      chrome.storage.local.get(chunkKeys, resolve);
    });

    // チャンクを結合
    let reconstructedData = '';
    for (let i = 0; i < metadata.totalChunks; i++) {
      const chunkKey = `${key}_chunk_${i}`;
      if (chunksData[chunkKey] === undefined) {
        throw new Error(`Missing chunk: ${chunkKey}`);
      }
      reconstructedData += chunksData[chunkKey];
    }

    console.log(`Successfully loaded chunked data: ${key}`);
    return JSON.parse(reconstructedData);

  } catch (error) {
    console.error('Failed to load large data:', error);
    return null;
  }
}

// 大容量データ削除機能
async function removeLargeData(key) {
  try {
    // メタデータを確認
    const metaData = await new Promise((resolve) => {
      chrome.storage.local.get([`${key}_meta`], resolve);
    });

    const metadata = metaData[`${key}_meta`];

    if (metadata && metadata.isChunked) {
      // チャンクを削除
      const keysToRemove = [`${key}_meta`];
      for (let i = 0; i < metadata.totalChunks; i++) {
        keysToRemove.push(`${key}_chunk_${i}`);
      }

      await new Promise((resolve, reject) => {
        chrome.storage.local.remove(keysToRemove, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      console.log(`Removed chunked data: ${key}`);
    } else {
      // 通常データを削除
      await new Promise((resolve, reject) => {
        chrome.storage.local.remove([key], () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }
  } catch (error) {
    console.error('Failed to remove large data:', error);
    throw error;
  }
}

async function fetchPublicTimelineInRange(sinceId, maxId) {
  let all = [];
  let max = maxId;
  let requestCount = 0;
  const maxRequests = 275; // 元の制限に戻す

  const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
  const stored = await getStorageAsync(keys);
  const instanceUrl = getActiveInstanceUrl();
  const isCurrentInstance = instanceUrl === window.location.origin;

  // メモリ使用量監視
  let memoryCheckInterval = 0;

  while (requestCount < maxRequests) {
    const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
    url.searchParams.set('limit', '40');
    url.searchParams.set('max_id', max);
    url.searchParams.set('since_id', sinceId);
    url.searchParams.set('local', 'true');

    // 定期的にメモリ使用量をチェック
    if (memoryCheckInterval++ % 50 === 0 && window.performance && window.performance.memory) {
      const memoryInfo = window.performance.memory;
      const usedMB = memoryInfo.usedJSHeapSize / 1024 / 1024;
      console.log(`メモリ使用量: ${usedMB.toFixed(2)}MB, 取得済み投稿: ${all.length}件`);

      // メモリ使用量が300MBを超えた場合は警告
      if (usedMB > 300) {
        console.warn('メモリ使用量が多くなっています。処理を続行しますが、ブラウザが重くなる可能性があります。');
      }
    }

    let res;
    try {
      // 現在のインスタンスの場合は認証付きリクエスト
      if (isCurrentInstance) {
        res = await fetch(url, {
          headers: {
            "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
            "X-Csrf-Token": stored["x_csrf_token"],
            "Authorization": stored["authorization"]
          },
          credentials: "include"
        });
      } else {
        // 他のインスタンスの場合は認証なしリクエスト
        res = await fetch(url, {
          credentials: "omit"
        });
      }
    } catch (error) {
      // CORS エラーなどで認証付きリクエストが失敗した場合、認証なしで再試行
      console.log('認証付きリクエスト失敗、認証なしで再試行:', error.message);
      res = await fetch(url, {
        credentials: "omit"
      });
    }

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

async function fetchPublicTimelineByCount(postCount, startTime = null) {
  let all = [];
  let maxId = null;
  let requestCount = 0;
  const maxRequests = 275;

  const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
  const stored = await getStorageAsync(keys);
  const instanceUrl = getActiveInstanceUrl();
  const isCurrentInstance = instanceUrl === window.location.origin;

  // 共通のfetch関数
  async function fetchWithAuth(url) {
    let res;
    try {
      // 現在のインスタンスの場合は認証付きリクエスト
      if (isCurrentInstance) {
        res = await fetch(url, {
          headers: {
            "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
            "X-Csrf-Token": stored["x_csrf_token"],
            "Authorization": stored["authorization"]
          },
          credentials: "include"
        });
      } else {
        // 他のインスタンスの場合は認証なしリクエスト
        res = await fetch(url, {
          credentials: "omit"
        });
      }
    } catch (error) {
      // CORS エラーなどで認証付きリクエストが失敗した場合、認証なしで再試行
      console.log('認証付きリクエスト失敗、認証なしで再試行:', error.message);
      res = await fetch(url, {
        credentials: "omit"
      });
    }
    return res;
  }

  // 開始時刻が指定されている場合の特別処理
  if (startTime) {
    const targetSnowflakeId = generateSnowflakeIdFromJst(startTime);

    if (postCount < 0) {
      // マイナス値指定：過去方向のみの取得
      const actualPostCount = Math.abs(postCount);
      let pastPosts = [];

      // 過去方向検索：max_idのみを使用して過去に向かって取得
      // 指定時刻から開始
      let maxId = targetSnowflakeId;
      let pastRequestCount = 0;

      while (pastRequestCount < maxRequests && pastPosts.length < actualPostCount * 2) {
        const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
        url.searchParams.set('limit', '40');
        url.searchParams.set('max_id', maxId);
        url.searchParams.set('local', 'true');

        const res = await fetchWithAuth(url);

        if (!res.ok) break;

        const batch = await res.json();
        if (!batch.length) break;

        // 指定時刻以前の投稿のみを追加
        const validPosts = batch.filter(post => new Date(post.created_at) <= startTime);
        pastPosts = pastPosts.concat(validPosts);

        // max_idを更新
        maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
        pastRequestCount++;

        if (pastPosts.length > 10) {
          document.getElementById('mastodonResult').innerHTML =
            `<div class="mastodon-loading">取得中... ${pastPosts.length}件取得済み</div>`;
        }

        // 必要な件数が取得できたらループを終了
        if (pastPosts.length >= actualPostCount) break;
        if (batch.length < 40) break;
      }

      all = pastPosts.slice(0, actualPostCount);
      return all;
    } else {
      // 正の値指定：未来方向の取得（改良版 - min_id + 動的検索時間方式）
      let futurePosts = [];
      let requestCount = 0;

      // ユーザー指定の検索時間を取得（デフォルト24時間）
      const searchTimeField = document.getElementById('mastodonSearchTime');
      const searchTimeStr = searchTimeField ? searchTimeField.value : '24:00:00';
      const searchTimeMs = parseSearchTimeToMs(searchTimeStr);

      // 1. まず min_id で最小のIDを取得して開始点を決定
      let currentSinceId = null;

      // min_idで最初の投稿を1つ取得
      const minIdUrl = new URL(`${instanceUrl}/api/v1/timelines/public`);
      minIdUrl.searchParams.set('limit', '1');
      minIdUrl.searchParams.set('min_id', generateSnowflakeIdFromJst(startTime));
      minIdUrl.searchParams.set('local', 'true');

      const minIdRes = await fetchWithAuth(minIdUrl);

      if (minIdRes.ok) {
        const minIdBatch = await minIdRes.json();
        if (minIdBatch.length > 0) {
          // 取得した最初の投稿のIDを since_id として使用
          currentSinceId = (BigInt(minIdBatch[0].id) - 1n).toString();
        }
      }

      // since_idが取得できなかった場合は、入力時間の1秒前を使用
      if (!currentSinceId) {
        const oneSecondBefore = new Date(startTime.getTime() - 1000);
        currentSinceId = generateSnowflakeIdFromJst(oneSecondBefore);
      }

      while (requestCount < maxRequests && futurePosts.length < postCount) {
        // ユーザー指定の検索時間後をmax_idとして設定
        const nextPeriod = new Date(startTime.getTime() + requestCount * searchTimeMs + searchTimeMs);
        const currentMaxId = generateSnowflakeIdFromJst(nextPeriod);

        // ユーザー指定の検索時間分のデータを取得
        let batchPosts = [];
        let maxId = currentMaxId;
        let batchRequestCount = 0;

        while (batchRequestCount < 50) { // 1つの時間範囲内での最大リクエスト数
          const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
          url.searchParams.set('limit', '40');
          url.searchParams.set('since_id', currentSinceId);
          url.searchParams.set('max_id', maxId);
          url.searchParams.set('local', 'true');

          const res = await fetchWithAuth(url);

          if (!res.ok) break;

          const batch = await res.json();
          if (!batch.length) break;

          batchPosts = batchPosts.concat(batch);
          maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
          batchRequestCount++;

          if (batch.length < 40) break;
        }

        // 指定時刻以降の投稿のみを抽出
        const validPosts = batchPosts.filter(post => new Date(post.created_at) >= startTime);

        // 時系列順（古いものから新しいものへ）にソート
        validPosts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        futurePosts = futurePosts.concat(validPosts);
        requestCount++;

        if (futurePosts.length > 10) {
          document.getElementById('mastodonResult').innerHTML =
            `<div class="mastodon-loading">取得中... ${futurePosts.length}件取得済み (${Math.round(requestCount * searchTimeMs / 3600000)}時間分検索済み)</div>`;
        }

        // 指定件数に達した場合は終了
        if (futurePosts.length >= postCount) break;

        // 投稿が全く見つからない場合、min_idで次の投稿を探す
        if (validPosts.length === 0) {
          // 現在の時間範囲の開始時刻からmin_idで次の投稿を探索
          const currentPeriodStart = new Date(startTime.getTime() + requestCount * searchTimeMs);

          // 現在時刻+24時間を超える場合は検索を終了
          const currentTime = new Date();
          const maxSearchTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // 現在時刻+24時間
          if (currentPeriodStart > maxSearchTime) {
            break;
          }

          const nextMinIdUrl = new URL(`${instanceUrl}/api/v1/timelines/public`);
          nextMinIdUrl.searchParams.set('limit', '1');
          nextMinIdUrl.searchParams.set('min_id', generateSnowflakeIdFromJst(currentPeriodStart));
          nextMinIdUrl.searchParams.set('local', 'true');

          const nextMinIdRes = await fetchWithAuth(nextMinIdUrl);

          if (nextMinIdRes.ok) {
            const nextMinIdBatch = await nextMinIdRes.json();
            if (nextMinIdBatch.length > 0) {
              // 見つかった投稿の時刻をチェック
              const foundPostTime = new Date(nextMinIdBatch[0].created_at);

              // 見つかった投稿が現在時刻+24時間を超える場合は検索を終了
              if (foundPostTime > maxSearchTime) {
                break;
              }

              // 見つかった投稿のIDを since_id として使用
              currentSinceId = (BigInt(nextMinIdBatch[0].id) - 1n).toString();

              // startTimeも更新して、見つかった投稿の時刻に合わせる
              startTime = foundPostTime;

              continue; // 新しいsince_idで再度検索
            }
          }

          // min_idでも見つからない場合は終了
          break;
        }

        // 次の範囲のsince_idを現在のmax_idに設定
        currentSinceId = currentMaxId;
      }

      // 指定時間に近い順（古い順）で指定件数だけ取得
      const result = futurePosts.slice(0, postCount);

      // 最終的に新しいものから古いものの順で表示用にソート
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return result;
    }
  }

  // 従来の処理（投稿件数モードで時刻指定なし）
  const actualPostCount = Math.abs(postCount);

  while (requestCount < maxRequests && all.length < actualPostCount) {
    const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
    url.searchParams.set('limit', '40');
    url.searchParams.set('local', 'true');

    if (maxId) {
      url.searchParams.set('max_id', maxId);
    }

    const res = await fetchWithAuth(url);

    if (!res.ok) throw new Error('タイムライン取得エラー');

    const batch = await res.json();
    if (!batch.length) break;

    all = all.concat(batch);
    requestCount++;

    if (all.length > 10) {
      document.getElementById('mastodonResult').innerHTML =
        `<div class="mastodon-loading">取得中... ${all.length}件取得済み</div>`;
    }

    maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
    if (batch.length < 40) break;
  }

  // 指定件数にトリム
  all = all.slice(0, actualPostCount);
  return all;
}

async function fetchUserPosts(username, options = {}) {
  // fetchUserPosts関数の実装（popup.jsと同様）
  const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
  const stored = await getStorageAsync(keys);

  // オプションのデフォルト値
  const { searchMode = 'timeRange', timeFilter = null, postCount = 200, startTime: initialStartTime = null } = options;
  let startTime = initialStartTime; // startTimeを可変にする

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
    // user 形式の場合は現在アクティブなインスタンスを使用
    targetInstanceUrl = getActiveInstanceUrl();
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
  }).catch(async (error) => {
    console.log('認証付きリクエスト失敗:', error);
    // CORS エラーまたは認証エラーの場合は認証なしで試行
    try {
      return await fetch(lookupUrl);
    } catch (fallbackError) {
      console.log('認証なしリクエストも失敗:', fallbackError);
      throw new Error(`ユーザー検索に失敗しました: ${fallbackError.message}`);
    }
  });

  if (!accountRes.ok) {
    throw new Error(`ユーザー @${username} が見つかりません`);
  }

  const account = await accountRes.json();

  let all = [];
  let maxId = null;
  let minId = null;
  let requestCount = 0;
  const maxRequests = 275;

  // 投稿件数モードで開始時刻が指定されている場合の特別処理
  if (searchMode === 'postCount' && startTime) {
    const targetSnowflakeId = generateSnowflakeIdFromJst(startTime);

    if (postCount < 0) {
      // マイナス値指定：過去方向のみの取得
      const actualPostCount = Math.abs(postCount);
      let pastPosts = [];

      // 過去方向検索：max_idのみを使用して過去に向かって取得
      // 指定時刻から開始
      let maxId = targetSnowflakeId;
      let pastRequestCount = 0;

      while (pastRequestCount < maxRequests && pastPosts.length < actualPostCount * 2) {
        const statusesUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
        statusesUrl.searchParams.set('limit', '40');
        statusesUrl.searchParams.set('max_id', maxId);

        const statusesRes = await fetch(statusesUrl, {
          headers: {
            "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
            "X-Csrf-Token": stored["x_csrf_token"],
            "Authorization": stored["authorization"]
          },
          credentials: "include"
        }).catch(async (error) => {
          console.log('認証付き投稿取得失敗:', error);
          // CORS エラーまたは認証エラーの場合は認証なしで試行
          try {
            return await fetch(statusesUrl);
          } catch (fallbackError) {
            console.log('認証なし投稿取得も失敗:', fallbackError);
            throw new Error(`投稿取得に失敗しました: ${fallbackError.message}`);
          }
        });

        if (!statusesRes.ok) break;

        const batch = await statusesRes.json();
        if (!batch.length) break;

        // 指定時刻以前の投稿のみを追加
        const validPosts = batch.filter(post => new Date(post.created_at) <= startTime);
        pastPosts = pastPosts.concat(validPosts);
        console.log(`過去方向バッチ${pastRequestCount}: ${batch.length}個取得, 有効${validPosts.length}個, 累計${pastPosts.length}個`);

        // max_idを更新（時間検索と同じ手法）
        maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
        pastRequestCount++;        if (pastPosts.length > 10) {
          document.getElementById('mastodonResult').innerHTML =
            `<div class="mastodon-loading">取得中... ${pastPosts.length}件取得済み</div>`;
        }

        // 必要な件数が取得できたらループを終了
        if (pastPosts.length >= actualPostCount) break;
        if (batch.length < 40) break;
      }

      all = pastPosts.slice(0, actualPostCount);
      return all;
    } else {
      // 正の値指定：未来方向の取得（改良版 - min_id + 動的検索時間方式）
      let futurePosts = [];
      let requestCount = 0;

      // ユーザー指定の検索時間を取得（デフォルト24時間）
      const searchTimeField = document.getElementById('mastodonSearchTime');
      const searchTimeStr = searchTimeField ? searchTimeField.value : '24:00:00';
      const searchTimeMs = parseSearchTimeToMs(searchTimeStr);

      // 1. まず min_id で最小のIDを取得して開始点を決定
      let currentSinceId = null;

      // min_idで最初の投稿を1つ取得
      const minIdUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
      minIdUrl.searchParams.set('limit', '1');
      minIdUrl.searchParams.set('min_id', generateSnowflakeIdFromJst(startTime));

      const minIdRes = await fetch(minIdUrl, {
        headers: {
          "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
          "X-Csrf-Token": stored["x_csrf_token"],
          "Authorization": stored["authorization"]
        },
        credentials: "include"
      }).catch(async (error) => {
        console.log('認証付きmin_id検索失敗:', error);
        // CORS エラーまたは認証エラーの場合は認証なしで試行
        try {
          return await fetch(minIdUrl);
        } catch (fallbackError) {
          console.log('認証なしmin_id検索も失敗:', fallbackError);
          throw new Error(`未来方向検索に失敗しました: ${fallbackError.message}`);
        }
      });

      if (minIdRes.ok) {
        const minIdBatch = await minIdRes.json();
        if (minIdBatch.length > 0) {
          // 取得した最初の投稿のIDを since_id として使用
          currentSinceId = (BigInt(minIdBatch[0].id) - 1n).toString();
        }
      }

      // since_idが取得できなかった場合は、入力時間の1秒前を使用
      if (!currentSinceId) {
        const oneSecondBefore = new Date(startTime.getTime() - 1000);
        currentSinceId = generateSnowflakeIdFromJst(oneSecondBefore);
      }

      while (requestCount < maxRequests && futurePosts.length < postCount) {
        // ユーザー指定の検索時間後をmax_idとして設定
        const nextPeriod = new Date(startTime.getTime() + requestCount * searchTimeMs + searchTimeMs);
        const currentMaxId = generateSnowflakeIdFromJst(nextPeriod);

        // ユーザー指定の検索時間分のデータを取得
        let batchPosts = [];
        let currentBatchMaxId = currentMaxId;
        let batchRequestCount = 0;

        while (batchRequestCount < 50) { // 1つの検索時間範囲内での最大リクエスト数
          const statusesUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
          statusesUrl.searchParams.set('limit', '40');
          statusesUrl.searchParams.set('since_id', currentSinceId);
          statusesUrl.searchParams.set('max_id', currentBatchMaxId);

          const statusesRes = await fetch(statusesUrl, {
            headers: {
              "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
              "X-Csrf-Token": stored["x_csrf_token"],
              "Authorization": stored["authorization"]
            },
            credentials: "include"
          }).catch(async (error) => {
            console.log('認証付き未来方向取得失敗:', error);
            // CORS エラーまたは認証エラーの場合は認証なしで試行
            try {
              return await fetch(statusesUrl);
            } catch (fallbackError) {
              console.log('認証なし未来方向取得も失敗:', fallbackError);
              throw new Error(`未来方向投稿取得に失敗しました: ${fallbackError.message}`);
            }
          });

          if (!statusesRes.ok) break;

          const batch = await statusesRes.json();
          if (!batch.length) break;

          batchPosts = batchPosts.concat(batch);
          currentBatchMaxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
          batchRequestCount++;

          if (batch.length < 40) break;
        }

        // 指定時刻以降の投稿のみを抽出
        const validPosts = batchPosts.filter(post => new Date(post.created_at) >= startTime);

        // 時系列順（古いものから新しいものへ）にソート
        validPosts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        futurePosts = futurePosts.concat(validPosts);
        requestCount++;

        if (futurePosts.length > 10) {
          document.getElementById('mastodonResult').innerHTML =
            `<div class="mastodon-loading">取得中... ${futurePosts.length}件取得済み (${Math.round(requestCount * searchTimeMs / 3600000)}時間分検索済み)</div>`;
        }

        // 指定件数に達した場合は終了
        if (futurePosts.length >= postCount) break;

        // 投稿が全く見つからない場合、min_idで次の投稿を探す
        if (validPosts.length === 0) {
          // 現在の時間範囲の開始時刻からmin_idで次の投稿を探索
          const currentPeriodStart = new Date(startTime.getTime() + requestCount * searchTimeMs);

          // 現在時刻+24時間を超える場合は検索を終了
          const currentTime = new Date();
          const maxSearchTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // 現在時刻+24時間
          if (currentPeriodStart > maxSearchTime) {
            break;
          }

          const nextMinIdUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
          nextMinIdUrl.searchParams.set('limit', '1');
          nextMinIdUrl.searchParams.set('min_id', generateSnowflakeIdFromJst(currentPeriodStart));

          const nextMinIdRes = await fetch(nextMinIdUrl, {
            headers: {
              "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
              "X-Csrf-Token": stored["x_csrf_token"],
              "Authorization": stored["authorization"]
            },
            credentials: "include"
          }).catch(async (error) => {
            console.log('認証付き次期間検索失敗:', error);
            // CORS エラーまたは認証エラーの場合は認証なしで試行
            try {
              return await fetch(nextMinIdUrl);
            } catch (fallbackError) {
              console.log('認証なし次期間検索も失敗:', fallbackError);
              throw new Error(`次期間検索に失敗しました: ${fallbackError.message}`);
            }
          });

          if (nextMinIdRes.ok) {
            const nextMinIdBatch = await nextMinIdRes.json();
            if (nextMinIdBatch.length > 0) {
              // 見つかった投稿の時刻をチェック
              const foundPostTime = new Date(nextMinIdBatch[0].created_at);

              // 見つかった投稿が現在時刻+24時間を超える場合は検索を終了
              if (foundPostTime > maxSearchTime) {
                break;
              }

              // 見つかった投稿のIDを since_id として使用
              currentSinceId = (BigInt(nextMinIdBatch[0].id) - 1n).toString();

              // startTimeも更新して、見つかった投稿の時刻に合わせる
              startTime = foundPostTime;

              continue; // 新しいsince_idで再度検索
            }
          }

          // min_idでも見つからない場合は終了
          break;
        }

        // 次の範囲のsince_idを現在のmax_idに設定
        currentSinceId = currentMaxId;
      }      // 指定時間に近い順（古い順）で指定件数だけ取得
      const result = futurePosts.slice(0, postCount);

      // 最終的に新しいものから古いものの順で表示用にソート
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return result;
    }
  }

  // 従来の処理（時間範囲モードや投稿件数モードで時刻指定なし）
  all = [];
  maxId = null;
  requestCount = 0;

  while (requestCount < maxRequests) {
    const statusesUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
    statusesUrl.searchParams.set('limit', '40');

    if (maxId) {
      statusesUrl.searchParams.set('max_id', maxId);
    }

    // 検索モードによる処理分岐
    if (searchMode === 'timeRange' && timeFilter) {
      const sinceId = generateSnowflakeIdFromJst(timeFilter.start);
      const maxIdFromTime = generateSnowflakeIdFromJst(timeFilter.end);
      statusesUrl.searchParams.set('since_id', sinceId);
      if (!maxId) {
        statusesUrl.searchParams.set('max_id', maxIdFromTime);
      }
    }
    // 投稿件数モードでは since_id は使わず、max_id だけを使って指定時刻から過去に向かって取得

    const statusesRes = await fetch(statusesUrl, {
      headers: {
        "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
        "X-Csrf-Token": stored["x_csrf_token"],
        "Authorization": stored["authorization"]
      },
      credentials: "include"
    }).catch(async (error) => {
      console.log('認証付き通常取得失敗:', error);
      // CORS エラーまたは認証エラーの場合は認証なしで試行
      try {
        return await fetch(statusesUrl);
      } catch (fallbackError) {
        console.log('認証なし通常取得も失敗:', fallbackError);
        throw new Error(`通常投稿取得に失敗しました: ${fallbackError.message}`);
      }
    });

    if (!statusesRes.ok) {
      throw new Error(`ユーザー @${username} の投稿取得に失敗しました`);
    }

    const batch = await statusesRes.json();
    if (!batch.length) break;

    let filteredBatch = batch;

    // 検索モードによるフィルタリング
    if (searchMode === 'timeRange' && timeFilter) {
      filteredBatch = batch.filter(post => {
        const postTime = new Date(post.created_at);
        return postTime >= timeFilter.start && postTime <= timeFilter.end;
      });

      if (filteredBatch.length < batch.length) {
        all = all.concat(filteredBatch);
        break;
      }
    } else if (searchMode === 'postCount') {
      // 投稿件数指定の場合はフィルタリングしない
      filteredBatch = batch;
    }

    all = all.concat(filteredBatch);
    requestCount++;

    if (all.length > 10) {
      document.getElementById('mastodonResult').innerHTML =
        `<div class="mastodon-loading">取得中... ${all.length}件取得済み</div>`;
    }

    // 投稿件数指定の場合は指定件数に達したら終了
    if (searchMode === 'postCount' && all.length >= Math.abs(postCount)) {
      all = all.slice(0, Math.abs(postCount)); // 指定件数にトリム
      break;
    }

    maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
    if (batch.length < 40) break;

    // 時間範囲モードで時間指定がない場合のみ200件制限
    if (searchMode === 'timeRange' && !timeFilter && all.length >= 200) break;
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

  // 常に取得件数を表示（txtダウンロードリンク付き）
  const countText = `<div class="mastodon-count">取得件数: ${posts.length}件 <a href="#" id="mastodonTxtDownloadLink" style="margin-left: 10px; color: #6364ff; text-decoration: underline; font-size: 13px;">txtダウンロード</a></div>`;

  resultDiv.innerHTML = countText + posts.map((post, index) => {
    const postInfo = getPostDisplayInfo(post);
    const postNumber = index + 1; // 1から始まる連番

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
          ${postInfo.isBoost ?
            `<strong>${postNumber}.</strong>` :
            `<strong>${postNumber}. ${escapeHtml(postInfo.displayUser)}</strong>`
          }
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

  // txtダウンロードリンクのクリックイベントを追加
  const txtDownloadLink = document.getElementById('mastodonTxtDownloadLink');
  if (txtDownloadLink) {
    txtDownloadLink.addEventListener('click', (e) => {
      e.preventDefault();
      downloadPostsAsTxt(posts);
    });
  }
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

// 統一されたテキストコンテンツ生成関数
function generateTxtContent(posts, searchInfo = {}) {
  if (!posts || posts.length === 0) {
    return '';
  }

  const now = new Date();
  const generatedTime = now.toLocaleString('ja-JP');
  const environment = 'Content Script';

  // 検索条件の詳細情報を構築
  let searchDetails = '';
  if (searchInfo.type) {
    let searchType = '';
    let searchTarget = '';
    let searchMethod = '';
    let timeInfo = '';
    let instanceInfo = '';

    switch(searchInfo.type) {
      case 'id':
        searchType = '投稿ID検索';
        searchTarget = `投稿ID: ${searchInfo.inputs?.postId || 'N/A'}`;
        break;
      case 'user':
        searchType = 'ユーザー検索';
        const username = searchInfo.inputs?.username || 'N/A';
        searchTarget = `ユーザー: ${username}`;

        // クロスインスタンス検索の場合は詳細情報を追加
        if (username.includes('@')) {
          const parts = username.split('@');
          const userPart = parts[0];
          const instancePart = parts[1];
          searchTarget += `\n対象インスタンス: ${instancePart}`;
        }

        if (searchInfo.inputs?.searchMode === 'postCount') {
          searchMethod = '投稿件数指定';
          if (searchInfo.inputs?.timeInput) {
            timeInfo = `開始時刻: ${searchInfo.inputs.timeInput}\n入力件数: ${searchInfo.inputs.postCount || 0}件`;
          }
        } else if (searchInfo.inputs?.searchMode === 'timeRange') {
          searchMethod = '時間範囲指定';
          if (searchInfo.inputs?.timeInput) {
            timeInfo = `開始時刻: ${searchInfo.inputs.timeInput}`;
            if (searchInfo.inputs?.timeRange) {
              try {
                const startTime = parseDateTime(searchInfo.inputs.timeInput);
                const endTime = parseAndAddTime(startTime, searchInfo.inputs.timeRange);
                timeInfo += `\n終了時刻: ${formatDateTime(endTime)}`;
              } catch (e) {
                timeInfo += `\n終了時刻: 計算エラー`;
              }
            }
          }
        }
        break;
      case 'time':
        searchType = 'パブリック検索';
        if (searchInfo.inputs?.searchMode === 'postCount') {
          searchMethod = '投稿件数指定';
          searchTarget = `開始時刻: ${searchInfo.inputs?.timeInput || '現在時刻'}`;
          timeInfo = `入力件数: ${searchInfo.inputs?.postCount || 0}件`;
          if (searchInfo.inputs?.searchTime) {
            timeInfo += `\n検索時間: ${searchInfo.inputs.searchTime}`;
          }
        } else {
          searchMethod = '時間範囲指定';
          searchTarget = `開始時刻: ${searchInfo.inputs?.timeInput || '現在時刻'}`;
          if (searchInfo.inputs?.timeInput && searchInfo.inputs?.timeRange) {
            try {
              const startTime = parseDateTime(searchInfo.inputs.timeInput);
              const endTime = parseAndAddTime(startTime, searchInfo.inputs.timeRange);
              timeInfo = `終了時刻: ${formatDateTime(endTime)}`;
            } catch (e) {
              timeInfo = `終了時刻: 計算エラー`;
            }
          }
        }
        break;
    }

    if (searchInfo.instance) {
      instanceInfo = `${searchInfo.instance.name} (${searchInfo.instance.url})`;
    }

    searchDetails = `【検索条件】
検索種別: ${searchType}
${instanceInfo ? `インスタンス: ${instanceInfo}\n` : ''}検索対象: ${searchTarget}
${searchMethod ? `検索方式: ${searchMethod}\n` : ''}${timeInfo ? `${timeInfo}\n` : ''}結果件数: ${posts.length}件`;
  }

  // テキストコンテンツの構築
  let txtContent = `========================================
Mastodon投稿検索結果
生成日時: ${generatedTime}
検索環境: ${environment}
========================================

${searchDetails ? searchDetails + '\n\n' : ''}【投稿データ】
`;

  posts.forEach((post, index) => {
    const postInfo = getPostDisplayInfo(post);
    const postNumber = index + 1; // 1から始まる連番

    txtContent += `${postNumber}. 投稿ID: ${post.id}
投稿者: ${postInfo.displayUser} (${postInfo.displayUsername})
投稿日時: ${new Date(postInfo.displayTime).toLocaleString('ja-JP')}
`;

    if (postInfo.isBoost) {
      txtContent += `ブースト者: ${postInfo.boosterUser} (${postInfo.boosterUsername})
ブースト日時: ${new Date(postInfo.boostTime).toLocaleString('ja-JP')}
`;
    }

    txtContent += `内容:
${postInfo.displayContent}

`;

    // 統計情報
    const reblogs = postInfo.isBoost ? postInfo.originalPost.reblogs_count : post.reblogs_count;
    const favourites = postInfo.isBoost ? postInfo.originalPost.favourites_count : post.favourites_count;
    const replies = postInfo.isBoost ? postInfo.originalPost.replies_count : post.replies_count;

    txtContent += `リブログ: ${reblogs}, お気に入り: ${favourites}, 返信: ${replies}
`;

    // メディア添付情報
    if (postInfo.mediaAttachments && postInfo.mediaAttachments.length > 0) {
      txtContent += `添付メディア: ${postInfo.mediaAttachments.length}件
`;
      postInfo.mediaAttachments.forEach((media, mediaIndex) => {
        txtContent += `  ${mediaIndex + 1}. ${media.type}: ${media.url}
`;
      });
    }

    // URLカード情報
    if (postInfo.card && postInfo.card.url) {
      txtContent += `リンクカード: ${postInfo.card.title || 'タイトルなし'}
リンクURL: ${postInfo.card.url}
`;
      if (postInfo.card.description) {
        txtContent += `説明: ${postInfo.card.description}
`;
      }
    }

    txtContent += `========================================
`;
  });

  return txtContent;
}

// テキストファイルとして投稿データをダウンロードする関数
// テキストファイルとして投稿データをダウンロードする関数
function downloadPostsAsTxt(posts) {
  if (!posts || posts.length === 0) {
    return;
  }

  // 現在の検索情報を取得してファイル名を生成
  const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
  let typeLabel = '';
  let searchIdentifier = '';

  switch(type) {
    case 'id':
      typeLabel = 'id';
      const postId = document.getElementById('mastodonPostIdOrTime').value.trim();
      searchIdentifier = postId || 'unknown';
      break;
    case 'user':
      typeLabel = 'user';
      const username = document.getElementById('mastodonUsernameField').value.trim();
      // @を除去してクリーンなユーザー名にする
      searchIdentifier = username.replace(/^@/, '').replace(/@.*$/, '') || 'unknown';
      break;
    case 'time':
      typeLabel = 'public';
      searchIdentifier = 'timeline';
      break;
  }

  // 検索情報を構築
  const searchInfo = {
    type: type,
    inputs: {},
    instance: null // 現在のインスタンス情報は後で取得
  };

  // 入力情報を収集
  switch(type) {
    case 'id':
      searchInfo.inputs.postId = document.getElementById('mastodonPostIdOrTime').value.trim();
      break;
    case 'user':
      searchInfo.inputs.username = document.getElementById('mastodonUsernameField').value.trim();
      searchInfo.inputs.timeInput = document.getElementById('mastodonTimeField').value.trim();
      const userSearchMode = document.querySelector('input[name="mastodonSearchMode"]:checked').value;
      searchInfo.inputs.searchMode = userSearchMode;
      if (userSearchMode === 'postCount') {
        searchInfo.inputs.postCount = parseInt(document.getElementById('mastodonPostCount').value) || 200;
        searchInfo.inputs.searchTime = document.getElementById('mastodonSearchTime').value.trim();
      } else {
        searchInfo.inputs.timeRange = document.getElementById('mastodonTimeRange').value.trim();
      }
      break;
    case 'time':
      searchInfo.inputs.timeInput = document.getElementById('mastodonPostIdOrTime').value.trim();
      const timeSearchMode = document.querySelector('input[name="mastodonSearchMode"]:checked').value;
      searchInfo.inputs.searchMode = timeSearchMode;
      if (timeSearchMode === 'postCount') {
        searchInfo.inputs.postCount = parseInt(document.getElementById('mastodonPostCount').value) || 200;
        searchInfo.inputs.searchTime = document.getElementById('mastodonSearchTime').value.trim();
      } else {
        searchInfo.inputs.timeRange = document.getElementById('mastodonTimeRange').value.trim();
      }
      break;
  }

  // インスタンス情報を追加
  const instanceNameSpan = document.getElementById('instanceName');
  if (instanceNameSpan) {
    // content scriptでは現在のページのURLから取得
    const currentInstanceUrl = getCurrentInstanceUrl();
    searchInfo.instance = {
      name: instanceNameSpan.textContent,
      url: currentInstanceUrl
    };
  } else {
    // フォールバックとして現在のページのインスタンス情報を使用
    const currentInstanceUrl = getCurrentInstanceUrl();
    const hostname = new URL(currentInstanceUrl).hostname;
    searchInfo.instance = {
      name: hostname,
      url: currentInstanceUrl
    };
  }

  const txtContent = generateTxtContent(posts, searchInfo);

  // ファイル名を生成（統一形式）
  const now = new Date();
  const timestamp = now.getFullYear() +
                   String(now.getMonth() + 1).padStart(2, '0') +
                   String(now.getDate()).padStart(2, '0') + '_' +
                   String(now.getHours()).padStart(2, '0') +
                   String(now.getMinutes()).padStart(2, '0') +
                   String(now.getSeconds()).padStart(2, '0');
  const filename = `mastodon_${typeLabel}_${searchIdentifier}_${timestamp}.txt`;

  // ダウンロードを実行
  const blob = new Blob([txtContent], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  // クリーンアップ
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // ユーザーに成功メッセージを表示
  const resultDiv = document.getElementById('mastodonResult');
  const countDiv = resultDiv.querySelector('.mastodon-count');
  if (countDiv) {
    const originalCountHTML = countDiv.innerHTML;
    countDiv.innerHTML = originalCountHTML + ' <span style="color: #4caf50;">ダウンロード完了!</span>';

    // 3秒後に元に戻す
    setTimeout(() => {
      countDiv.innerHTML = originalCountHTML;
    }, 3000);
  }
}

// 履歴管理機能
// updateHistoryButton関数は不要（履歴タイトルに直接表示するため）
async function saveSearchHistory(type, inputs, posts, targetInstanceInfo = null) {
  // 空の検索結果や無効なデータは履歴に保存しない
  if (!posts || posts.length === 0) {
    console.log('履歴保存をスキップ: 空の検索結果');
    return;
  }

  // inputsが空またはundefinedの場合も保存しない
  if (!inputs || Object.keys(inputs).length === 0) {
    console.log('履歴保存をスキップ: 無効な入力データ');
    return;
  }

  let history = await getSearchHistory();

  // historyが配列でない場合は空配列で初期化
  if (!Array.isArray(history)) {
    history = [];
  }

  // インスタンス情報を取得（targetInstanceInfoが優先、次に現在のページ情報）
  let instanceInfo = targetInstanceInfo;
  if (!instanceInfo) {
    try {
      instanceInfo = await getCurrentPageInstanceInfo();
    } catch (error) {
      console.log('インスタンス情報取得失敗:', error);
      instanceInfo = {
        url: window.location.origin,
        name: window.location.hostname
      };
    }
  }

  const historyItem = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type,
    inputs,
    resultCount: posts.length,
    posts: posts, // 全件保存に変更
    instance: instanceInfo // インスタンス情報を追加
  };

  // 新しいアイテムを先頭に追加
  history.unshift(historyItem);

  // 10個を超えた場合は古いものを削除
  if (history.length > 10) {
    history.splice(10);
  }

  // 大容量対応でローカルストレージに保存
  try {
    await saveLargeData('mastodon-content-search-history', history);
    console.log(`履歴保存完了: ${posts.length}件の投稿データを含む`);
  } catch (error) {
    console.error('履歴保存に失敗:', error);
    // フォールバック: 投稿データなしで保存を試行
    const lightHistoryItem = {
      ...historyItem,
      posts: [] // 投稿データを除外
    };
    const lightHistory = [...history];
    lightHistory[0] = lightHistoryItem; // 最初のアイテムを軽量版に置換

    try {
      localStorage.setItem('mastodon-content-search-history', JSON.stringify(lightHistory));
      console.log('軽量版履歴として保存完了');
    } catch (fallbackError) {
      console.error('軽量版履歴保存も失敗:', fallbackError);
    }
  }

  // 履歴ボタンを更新 - 履歴表示時に自動更新されるため不要
}async function getSearchHistory() {
  try {
    // 大容量対応での読み込みを試行
    const history = await loadLargeData('mastodon-content-search-history');
    if (history !== null) {
      return history;
    }

    // フォールバック: 従来のlocalStorageから読み込み
    const fallbackHistory = localStorage.getItem('mastodon-content-search-history');
    return fallbackHistory ? JSON.parse(fallbackHistory) : [];
  } catch (e) {
    console.error('履歴の読み込みに失敗:', e);
    return [];
  }
}

async function showHistory() {
  const modal = document.getElementById('mastodon-history-modal');
  const historyList = document.getElementById('mastodon-history-list');

  const history = await getSearchHistory();

  if (history.length === 0) {
    historyList.innerHTML = '<div class="mastodon-no-history">履歴がありません</div>';
  } else {
    historyList.innerHTML = history.map(item => {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString('ja-JP');

      let typeLabel = '';
      let inputSummary = '';
      let timeDetails = '';

      switch(item.type) {
        case 'id':
          typeLabel = '投稿ID';
          inputSummary = `ID: ${item.inputs.postId}`;
          break;
        case 'user':
          typeLabel = 'ユーザー';
          inputSummary = `${item.inputs.username}`;

          // 開始時刻を表示
          if (item.inputs.timeInput) {
            timeDetails = `開始時刻: ${item.inputs.timeInput}`;

            // 終了時刻を計算して表示
            if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
              try {
                const startTime = parseDateTime(item.inputs.timeInput);
                const endTime = parseAndAddTime(startTime, item.inputs.timeRange);
                timeDetails += `\n終了時刻: ${formatDateTime(endTime)}`;
              } catch (e) {
                timeDetails += `\n終了時刻: 計算エラー`;
              }
            }
          }

          if (item.inputs.searchMode === 'postCount') {
            inputSummary += ` [件数: ${item.inputs.postCount}件]`;
            if (item.inputs.searchTime) {
              inputSummary += ` (検索時間: ${item.inputs.searchTime})`;
            }
          } else if (item.inputs.timeRange) {
            inputSummary += ` [範囲: ${item.inputs.timeRange}]`;
          }
          break;
        case 'time':
          typeLabel = 'パブリック';
          const startTimeValue = item.inputs.timeInput || '現在時刻';
          inputSummary = startTimeValue;

          // 開始時刻を表示
          if (item.inputs.timeInput) {
            timeDetails = `開始時刻: ${item.inputs.timeInput}`;

            // 終了時刻を計算して表示
            if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
              try {
                const startTime = parseDateTime(item.inputs.timeInput);
                const endTime = parseAndAddTime(startTime, item.inputs.timeRange);
                timeDetails += `\n終了時刻: ${formatDateTime(endTime)}`;
              } catch (e) {
                timeDetails += `\n終了時刻: 計算エラー`;
              }
            }
          }

          if (item.inputs.searchMode === 'postCount') {
            inputSummary += ` [件数: ${item.inputs.postCount}件]`;
            if (item.inputs.searchTime) {
              inputSummary += ` (検索時間: ${item.inputs.searchTime})`;
            }
          } else if (item.inputs.timeRange) {
            inputSummary += ` [範囲: ${item.inputs.timeRange}]`;
          }
          break;
        case 'instance':
          typeLabel = 'インスタンス';
          inputSummary = `${item.inputs.instanceName} (${item.inputs.instanceUrl})`;
          break;
      }

      // インスタンス情報を追加
      let instanceInfo = '';
      if (item.instance) {
        instanceInfo = `<div class="mastodon-history-instance">インスタンス: ${item.instance.name}</div>`;
      }

      return `
        <div class="mastodon-history-item" data-history-id="${item.id}">
          <div class="mastodon-history-item-header">
            <span class="mastodon-history-type">[${typeLabel}]</span>
            <span class="mastodon-history-time">${timeStr}</span>
          </div>
          <div class="mastodon-history-summary">${escapeHtml(inputSummary)}</div>
          ${timeDetails ? `<div class="mastodon-history-time-details" style="white-space: pre-line; font-size: 12px; color: #888; margin: 4px 0;">${escapeHtml(timeDetails)}</div>` : ''}
          <div class="mastodon-history-result">結果: ${item.resultCount}件</div>
          ${instanceInfo}
          <div class="mastodon-history-actions">
            <button class="mastodon-history-restore-btn" data-history-id="${item.id}">復元</button>
            <button class="mastodon-history-view-btn" data-history-id="${item.id}">表示</button>
            <button class="mastodon-history-save-btn" data-history-id="${item.id}">保存(.txt)</button>
            <button class="mastodon-history-delete-btn" data-history-id="${item.id}">削除</button>
          </div>
        </div>
      `;
    }).join('');

    // 履歴アイテムのイベントリスナーを設定
    setupHistoryItemListeners();
  }

  modal.style.display = 'flex';
}

function hideHistory() {
  const modal = document.getElementById('mastodon-history-modal');
  modal.style.display = 'none';
}

async function clearHistory() {
  if (confirm('すべての履歴を削除しますか？')) {
    await removeLargeData('mastodon-content-search-history');
    await showHistory(); // 履歴表示を更新（数も自動更新される）
  }
}

function setupHistoryItemListeners() {
  // 復元ボタン
  document.querySelectorAll('.mastodon-history-restore-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await restoreSearchFromHistory(historyId);
    });
  });

  // 表示ボタン
  document.querySelectorAll('.mastodon-history-view-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await viewHistoryResults(historyId);
    });
  });

  // 保存(.txt)ボタン
  document.querySelectorAll('.mastodon-history-save-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await saveHistoryAsTxt(historyId);
    });
  });

  // 削除ボタン
  document.querySelectorAll('.mastodon-history-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await deleteHistoryItem(historyId);
    });
  });
}

async function restoreSearchFromHistory(historyId) {
  const history = await getSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item) return;

  // 入力タイプを設定
  const typeRadio = document.querySelector(`input[name="mastodonInputType"][value="${item.type}"]`);
  if (typeRadio) {
    typeRadio.checked = true;
  }

  // 各入力フィールドを復元
  switch(item.type) {
    case 'id':
      document.getElementById('mastodonPostIdOrTime').value = item.inputs.postId;
      break;

    case 'user':
      document.getElementById('mastodonUsernameField').value = item.inputs.username;
      if (item.inputs.timeInput) {
        document.getElementById('mastodonTimeField').value = item.inputs.timeInput;
      }

      // 検索モードを復元
      if (item.inputs.searchMode) {
        const modeRadio = document.querySelector(`input[name="mastodonSearchMode"][value="${item.inputs.searchMode}"]`);
        if (modeRadio) {
          modeRadio.checked = true;
        }

        if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
          document.getElementById('mastodonPostCount').value = item.inputs.postCount;
        } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
          document.getElementById('mastodonTimeRange').value = item.inputs.timeRange;
        }
      }
      break;

    case 'time':
      document.getElementById('mastodonPostIdOrTime').value = item.inputs.timeInput || '';

      // 検索モードを復元
      if (item.inputs.searchMode) {
        const modeRadio = document.querySelector(`input[name="mastodonSearchMode"][value="${item.inputs.searchMode}"]`);
        if (modeRadio) {
          modeRadio.checked = true;
        }

        if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
          document.getElementById('mastodonPostCount').value = item.inputs.postCount;
        } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
          document.getElementById('mastodonTimeRange').value = item.inputs.timeRange;
        }
      }
      break;
  }

  // インスタンス情報を復元（履歴にインスタンス情報が保存されている場合）
  if (item.instance && item.instance.url) {
    const instanceNameSpan = document.getElementById('instanceName');

    if (instanceNameSpan) {
      // 現在の情報を保存（戻る用）
      const currentInstanceName = instanceNameSpan.textContent;
      const currentInstanceTitle = instanceNameSpan.title;

      // インスタンス名表示を復元した内容で更新
      instanceNameSpan.textContent = item.instance.name;
      instanceNameSpan.title = `URL: ${item.instance.url}`;

      // 戻るボタンを追加
      const resetButton = document.createElement('button');
      resetButton.id = 'instanceResetBtn';
      resetButton.textContent = 'リセット';
      resetButton.className = 'mastodon-instance-reset-btn';
      resetButton.style.cssText = `
        margin-left: 8px;
        padding: 2px 6px;
        font-size: 10px;
        background: #6364ff;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      `;

      resetButton.addEventListener('click', () => {
        // 現在のページ情報に戻す
        updateInstanceNameDisplay();
        // ボタンを削除
        resetButton.remove();
      });

      // 既存のボタンがあれば削除
      const existingButton = document.getElementById('instanceResetBtn');
      if (existingButton) {
        existingButton.remove();
      }

      // ボタンをインスタンス名の後に挿入
      instanceNameSpan.parentNode.insertBefore(resetButton, instanceNameSpan.nextSibling);
    }
  }

  // UIを更新
  updateInputUI();
  updateSearchModeUI();

  // 履歴モーダルを閉じる
  hideHistory();

  // 検索フォームを展開
  const content = document.getElementById('mastodon-viewer-content');
  const toggleBtn = document.getElementById('mastodon-viewer-toggle');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggleBtn.textContent = '▼';
  }
}

async function viewHistoryResults(historyId) {
  const history = await getSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item || !item.posts) return;

  // 結果を表示
  displayPosts(item.posts);

  // 履歴モーダルを閉じる
  hideHistory();

  // 検索結果を展開
  const content = document.getElementById('mastodon-viewer-content');
  const toggleBtn = document.getElementById('mastodon-viewer-toggle');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggleBtn.textContent = '▼';
  }
}

async function deleteHistoryItem(historyId) {
  if (confirm('この履歴を削除しますか？')) {
    let history = await getSearchHistory();
    history = history.filter(h => h.id !== historyId);
    // 大容量データに対応した保存方式を使用
    await saveLargeData('mastodon-content-search-history', history, true);
    await showHistory(); // 履歴表示を更新（数も自動更新される）
  }
}

async function saveHistoryAsTxt(historyId) {
  const history = await getSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item || !item.posts) {
    alert('保存する履歴データが見つかりません');
    return;
  }

  // 検索情報を構築
  const searchInfo = {
    type: item.type,
    inputs: item.inputs,
    instance: item.instance
  };

  const txtContent = generateTxtContent(item.posts, searchInfo);

  // ファイル名を生成（統一形式）
  const now = new Date(); // 現在時刻を使用
  const timestamp = now.getFullYear() +
                   String(now.getMonth() + 1).padStart(2, '0') +
                   String(now.getDate()).padStart(2, '0') + '_' +
                   String(now.getHours()).padStart(2, '0') +
                   String(now.getMinutes()).padStart(2, '0') +
                   String(now.getSeconds()).padStart(2, '0');

  let typeLabel = '';
  let searchIdentifier = '';

  switch(item.type) {
    case 'id':
      typeLabel = 'id';
      searchIdentifier = item.inputs.postId || 'unknown';
      break;
    case 'user':
      typeLabel = 'user';
      const username = item.inputs.username || 'unknown';
      // @を除去してクリーンなユーザー名にする
      searchIdentifier = username.replace(/^@/, '').replace(/@.*$/, '');
      break;
    case 'time':
      typeLabel = 'public';
      searchIdentifier = 'timeline';
      break;
  }

  const filename = `mastodon_${typeLabel}_${searchIdentifier}_${timestamp}.txt`;

  // ダウンロード実行
  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // ダウンロード完了メッセージを表示
  const tempMessage = document.createElement('div');
  tempMessage.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 10px 15px; border-radius: 5px; z-index: 10000; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
  tempMessage.textContent = 'ダウンロード完了!';
  document.body.appendChild(tempMessage);

  // 3秒後に削除
  setTimeout(() => {
    if (document.body.contains(tempMessage)) {
      document.body.removeChild(tempMessage);
    }
  }, 3000);
}

// 履歴表示と検索フォーム表示を切り替える関数
async function toggleHistoryView() {
  const historyBtn = document.getElementById('mastodon-history-btn');
  const viewerContent = document.getElementById('mastodon-viewer-content');
  const isShowingHistory = historyBtn.textContent === '戻る';

  if (isShowingHistory) {
    // 履歴表示中 → 検索フォームに戻る
    showSearchForm();
    historyBtn.textContent = '履歴';
  } else {
    // 検索フォーム表示中 → 履歴表示
    await showHistoryInline();
    historyBtn.textContent = '戻る';
  }

  // コンテンツエリアを展開
  viewerContent.style.display = 'block';
  const toggleBtn = document.getElementById('mastodon-viewer-toggle');
  toggleBtn.textContent = '▼';
}

// インライン履歴表示関数
async function showHistoryInline() {
  const viewerContent = document.getElementById('mastodon-viewer-content');
  const history = await getSearchHistory();

  let historyHtml = '';

  if (history.length === 0) {
    historyHtml = '<div class="mastodon-no-history">履歴がありません</div>';
  } else {
    historyHtml = `<div class="mastodon-history-inline-title">検索履歴 <span class="mastodon-history-count">(${history.length}/10)</span></div>`;
    historyHtml += history.map(item => {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString('ja-JP');

      let typeLabel = '';
      let detailInfo = '';

      switch(item.type) {
        case 'id':
          typeLabel = '投稿ID';
          detailInfo = `投稿ID: ${item.inputs.postId}`;
          break;
        case 'user':
          typeLabel = 'ユーザー';
          detailInfo = `ユーザー: ${item.inputs.username}`;
          if (item.inputs.timeInput) {
            detailInfo += `\n開始時刻: ${item.inputs.timeInput}`;
          }
          if (item.inputs.searchMode === 'postCount') {
            detailInfo += `\n入力件数: ${item.inputs.postCount}件`;
            if (item.inputs.searchTime) {
              detailInfo += `\n検索時間: ${item.inputs.searchTime}`;
            }
          } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
            detailInfo += `\n時間範囲: ${item.inputs.timeRange}`;
            // 終了時刻を計算して表示
            if (item.inputs.timeInput && item.inputs.timeRange) {
              try {
                const startTime = parseDateTime(item.inputs.timeInput);
                const endTime = parseAndAddTime(startTime, item.inputs.timeRange);
                detailInfo += `\n終了時刻: ${formatDateTime(endTime)}`;
              } catch (e) {
                detailInfo += `\n終了時刻: 計算エラー (${e.message})`;
              }
            }
          }
          break;
        case 'time':
          typeLabel = 'パブリック';
          if (item.inputs.timeInput) {
            detailInfo = `開始時刻: ${item.inputs.timeInput}`;
          } else {
            detailInfo = '開始時刻: 現在時刻';
          }

          if (item.inputs.searchMode === 'postCount') {
            detailInfo += `\n入力件数: ${item.inputs.postCount}件`;
            if (item.inputs.searchTime) {
              detailInfo += `\n検索時間: ${item.inputs.searchTime}`;
            }
          } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
            detailInfo += `\n時間範囲: ${item.inputs.timeRange}`;
            // 終了時刻を計算して表示
            if (item.inputs.timeInput && item.inputs.timeRange) {
              try {
                const startTime = parseDateTime(item.inputs.timeInput);
                const endTime = parseAndAddTime(startTime, item.inputs.timeRange);
                detailInfo += `\n終了時刻: ${formatDateTime(endTime)}`;
              } catch (e) {
                detailInfo += `\n終了時刻: 計算エラー (${e.message})`;
              }
            }
          }
          break;
        case 'instance':
          typeLabel = 'インスタンス';
          detailInfo = `インスタンス名: ${item.inputs.instanceName}\nURL: ${item.inputs.instanceUrl}\n設定日時: ${new Date(item.timestamp).toLocaleString('ja-JP')}`;
          break;
      }

      detailInfo += `\n実際件数: ${item.resultCount}件`;

      // インスタンス情報が存在する場合は追加表示
      if (item.instance) {
        detailInfo += `\nインスタンス: ${item.instance.name}`;
      }

      return `
        <div class="mastodon-history-inline-item" data-history-id="${item.id}">
          <div class="mastodon-history-inline-header">
            <span class="mastodon-history-inline-type">${typeLabel}</span>
            <span class="mastodon-history-inline-time">${timeStr}</span>
          </div>
          <div class="mastodon-history-inline-details" style="white-space: pre-line; font-size: 13px; color: #9baec8; margin: 8px 0; background: rgba(57, 63, 79, 0.3); padding: 8px; border-radius: 4px; border-left: 3px solid #6364ff;">${escapeHtml(detailInfo)}</div>
          <div class="mastodon-history-inline-actions">
            <button class="mastodon-history-inline-restore-btn" data-history-id="${item.id}">復元</button>
            <button class="mastodon-history-inline-view-btn" data-history-id="${item.id}">表示</button>
            <button class="mastodon-history-inline-save-btn" data-history-id="${item.id}">保存(.txt)</button>
            <button class="mastodon-history-inline-delete-btn" data-history-id="${item.id}">削除</button>
          </div>
        </div>
      `;
    }).join('');

    historyHtml += `
      <div class="mastodon-history-inline-footer">
        <button id="mastodon-history-inline-clear" class="mastodon-history-inline-clear-btn">すべての履歴をクリア</button>
      </div>
    `;
  }

  viewerContent.innerHTML = historyHtml;

  // インライン履歴のイベントリスナーを設定
  setupInlineHistoryListeners();
}

// 検索フォームを表示する関数
function showSearchForm() {
  const viewerContent = document.getElementById('mastodon-viewer-content');

  // 元の検索フォームを再構築
  viewerContent.innerHTML = `
      <div class="mastodon-input-type-selector">
        <label>入力方式:</label>
        <div class="mastodon-radio-group">
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="time" checked>
            <span>パブリック</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="user">
            <span>ユーザー名</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonInputType" value="id">
            <span>投稿ID</span>
          </label>
        </div>
      </div>

      <div id="mastodon-main-input" class="mastodon-input-group">
        <label for="mastodonPostIdOrTime">開始時刻:</label>
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

      <div id="mastodonSearchModeSelector" class="mastodon-input-group" style="display: none;">
        <label>検索方式:</label>
        <div class="mastodon-radio-group">
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonSearchMode" value="timeRange" checked>
            <span>時間範囲</span>
          </label>
          <label class="mastodon-radio-label">
            <input type="radio" name="mastodonSearchMode" value="postCount">
            <span>投稿件数</span>
          </label>
        </div>
      </div>

      <div id="mastodonTimeRangeSelector" class="mastodon-input-group">
        <label for="mastodonTimeRange">時間:</label>
        <input type="text" id="mastodonTimeRange" placeholder="HH:MM:SS" style="width: 120px;">
        <span>（開始時刻に追加）</span>
      </div>

      <div id="mastodonPostCountSelector" class="mastodon-input-group" style="display: none;">
        <label for="mastodonPostCount">取得件数:</label>
        <input type="number" id="mastodonPostCount" placeholder="200" min="-10000" max="10000" value="200" style="width: 80px;">
        <span>件（+未来,-過去,最大10000件）</span>
        <div id="mastodonSearchTimeSelector" style="display: none; margin-top: 8px;">
          <label for="mastodonSearchTime">検索時間:</label>
          <input type="text" id="mastodonSearchTime" placeholder="24:00:00" value="24:00:00" style="width: 80px;">
          <span>（HH:MM:SS形式、since_idとmax_idの間隔）</span>
        </div>
      </div>

      <div id="mastodonGeneratedTimeDisplay" class="mastodon-input-group">
        <label for="mastodonGeneratedTime">終了時刻:</label>
        <input type="text" id="mastodonGeneratedTime" placeholder="YYYY-M-D HH:MM:SS" style="width: 100%;">
      </div>

      <button id="mastodonFetchPost" class="mastodon-fetch-btn">取得</button>

      <div id="mastodonResult" class="mastodon-result"></div>
  `;

  // 検索フォームのイベントリスナーを再設定
  setupSearchFormListeners();
}

// インライン履歴のイベントリスナー設定
function setupInlineHistoryListeners() {
  // 復元ボタン
  document.querySelectorAll('.mastodon-history-inline-restore-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await restoreSearchFromInlineHistory(historyId);
    });
  });

  // 表示ボタン
  document.querySelectorAll('.mastodon-history-inline-view-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await viewHistoryResultsInline(historyId);
    });
  });

  // 保存(.txt)ボタン
  document.querySelectorAll('.mastodon-history-inline-save-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await saveHistoryAsTxt(historyId);
    });
  });

  // 削除ボタン
  document.querySelectorAll('.mastodon-history-inline-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      await deleteInlineHistoryItem(historyId);
    });
  });

  // すべてクリアボタン
  const clearBtn = document.getElementById('mastodon-history-inline-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await clearInlineHistory();
    });
  }
}

// 検索フォームのイベントリスナー再設定
function setupSearchFormListeners() {
  // ラジオボタンの変更イベント
  const radioButtons = document.querySelectorAll('input[name="mastodonInputType"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateInputUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-content-inputType', this.value);
    });
  });

  // 検索方式の切り替えイベント
  const searchModeButtons = document.querySelectorAll('input[name="mastodonSearchMode"]');
  searchModeButtons.forEach(radio => {
    radio.addEventListener('change', updateSearchModeUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-content-searchMode', this.value);
    });
  });

  // 入力値の自動保存
  const mainInput = document.getElementById('mastodonPostIdOrTime');
  const usernameField = document.getElementById('mastodonUsernameField');
  const timeField = document.getElementById('mastodonTimeField');
  const timeRange = document.getElementById('mastodonTimeRange');

  if (mainInput) {
    mainInput.addEventListener('input', function() {
      const type = document.querySelector('input[name="mastodonInputType"]:checked').value;
      if (type === 'id') {
        localStorage.setItem('mastodon-content-postId', this.value);
      } else if (type === 'time') {
        localStorage.setItem('mastodon-content-timeRange', this.value);
        updateGeneratedTimeRange();
      }
    });
  }

  if (usernameField) {
    usernameField.addEventListener('input', function() {
      localStorage.setItem('mastodon-content-username', this.value);
    });
  }

  if (timeField) {
    timeField.addEventListener('input', function() {
      localStorage.setItem('mastodon-content-userTime', this.value);
      updateGeneratedTimeRange();
    });
  }

  if (timeRange) {
    timeRange.addEventListener('input', function() {
      localStorage.setItem('mastodon-content-timeRangeInput', this.value);
      updateGeneratedTimeRange();
    });
  }

  // 投稿件数フィールド
  const postCountField = document.getElementById('mastodonPostCount');
  if (postCountField) {
    postCountField.addEventListener('input', function() {
      localStorage.setItem('mastodon-content-postCount', this.value);
      updateSearchTimeVisibility();
    });
  }

  // 検索時間フィールド
  const searchTimeField = document.getElementById('mastodonSearchTime');
  if (searchTimeField) {
    searchTimeField.addEventListener('input', function() {
      localStorage.setItem('mastodon-content-searchTime', this.value);
    });
  }

  // 終了時刻フィールド
  const generatedTimeField = document.getElementById('mastodonGeneratedTime');
  if (generatedTimeField) {
    generatedTimeField.addEventListener('input', function() {
      updateTimeRangeFromEndTime();
    });
  }

  // 検索ボタン
  const fetchBtn = document.getElementById('mastodonFetchPost');
  if (fetchBtn) {
    fetchBtn.addEventListener('click', handleSearch);
  }

  // 設定を復元してUIを更新
  restoreFormSettings();
  updateInputUI();
  updateSearchModeUI();
}

// フォーム設定復元
function restoreFormSettings() {
  // 前回の検索方式を復元
  const savedSearchMode = localStorage.getItem('mastodon-content-searchMode');
  if (savedSearchMode) {
    const targetSearchMode = document.querySelector(`input[name="mastodonSearchMode"][value="${savedSearchMode}"]`);
    if (targetSearchMode) {
      targetSearchMode.checked = true;
    }
  }

  // 前回の選択状態を復元
  const savedInputType = localStorage.getItem('mastodon-content-inputType');
  if (savedInputType) {
    const targetRadio = document.querySelector(`input[name="mastodonInputType"][value="${savedInputType}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
    }
  }

  // 保存された値を復元
  const savedSearchTime = localStorage.getItem('mastodon-content-searchTime');
  if (savedSearchTime) {
    const searchTimeField = document.getElementById('mastodonSearchTime');
    if (searchTimeField) searchTimeField.value = savedSearchTime;
  }

  const savedPostCount = localStorage.getItem('mastodon-content-postCount');
  if (savedPostCount) {
    const postCountField = document.getElementById('mastodonPostCount');
    if (postCountField) postCountField.value = savedPostCount;
  }
}

// インライン履歴から復元
async function restoreSearchFromInlineHistory(historyId) {
  const history = await getSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item) return;

  // 検索フォームに戻る
  showSearchForm();
  const historyBtn = document.getElementById('mastodon-history-btn');
  historyBtn.textContent = '履歴';

  // 復元処理を少し遅らせて、フォームが構築されてから実行
  setTimeout(() => {
    // 入力タイプを設定
    const typeRadio = document.querySelector(`input[name="mastodonInputType"][value="${item.type}"]`);
    if (typeRadio) {
      typeRadio.checked = true;
    }

    // 各入力フィールドを復元
    switch(item.type) {
      case 'id':
        const postIdField = document.getElementById('mastodonPostIdOrTime');
        if (postIdField) {
          postIdField.value = item.inputs.postId;
          localStorage.setItem('mastodon-content-postId', item.inputs.postId);
        }
        break;

      case 'user':
        const usernameField = document.getElementById('mastodonUsernameField');
        const timeField = document.getElementById('mastodonTimeField');
        if (usernameField) {
          usernameField.value = item.inputs.username;
          localStorage.setItem('mastodon-content-username', item.inputs.username);
        }
        if (item.inputs.timeInput && timeField) {
          timeField.value = item.inputs.timeInput;
          localStorage.setItem('mastodon-content-userTime', item.inputs.timeInput);
        }

        // 検索モードを復元
        if (item.inputs.searchMode) {
          const modeRadio = document.querySelector(`input[name="mastodonSearchMode"][value="${item.inputs.searchMode}"]`);
          if (modeRadio) {
            modeRadio.checked = true;
            localStorage.setItem('mastodon-content-searchMode', item.inputs.searchMode);
          }

          if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
            const postCountField = document.getElementById('mastodonPostCount');
            if (postCountField) {
              postCountField.value = item.inputs.postCount;
              localStorage.setItem('mastodon-content-postCount', item.inputs.postCount);
            }
            if (item.inputs.searchTime) {
              const searchTimeField = document.getElementById('mastodonSearchTime');
              if (searchTimeField) {
                searchTimeField.value = item.inputs.searchTime;
                localStorage.setItem('mastodon-content-searchTime', item.inputs.searchTime);
              }
            }
          } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
            const timeRangeSelect = document.getElementById('mastodonTimeRange');
            if (timeRangeSelect) {
              timeRangeSelect.value = item.inputs.timeRange;
              localStorage.setItem('mastodon-content-timeRangeInput', item.inputs.timeRange);
            }
          }
        }
        break;

      case 'time':
        const timeInputField = document.getElementById('mastodonPostIdOrTime');
        if (timeInputField) {
          timeInputField.value = item.inputs.timeInput || '';
          localStorage.setItem('mastodon-content-timeRange', item.inputs.timeInput || '');
        }

        // 検索モードを復元
        if (item.inputs.searchMode) {
          const modeRadio = document.querySelector(`input[name="mastodonSearchMode"][value="${item.inputs.searchMode}"]`);
          if (modeRadio) {
            modeRadio.checked = true;
            localStorage.setItem('mastodon-content-searchMode', item.inputs.searchMode);
          }

          if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
            const postCountField = document.getElementById('mastodonPostCount');
            if (postCountField) {
              postCountField.value = item.inputs.postCount;
              localStorage.setItem('mastodon-content-postCount', item.inputs.postCount);
            }
            if (item.inputs.searchTime) {
              const searchTimeField = document.getElementById('mastodonSearchTime');
              if (searchTimeField) {
                searchTimeField.value = item.inputs.searchTime;
                localStorage.setItem('mastodon-content-searchTime', item.inputs.searchTime);
              }
            }
          } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
            const timeRangeSelect = document.getElementById('mastodonTimeRange');
            if (timeRangeSelect) {
              timeRangeSelect.value = item.inputs.timeRange;
              localStorage.setItem('mastodon-content-timeRangeInput', item.inputs.timeRange);
            }
          }
        }
        break;
      case 'instance':
        // インスタンス設定は復元できないが、メッセージを表示
        alert(`インスタンス設定: ${item.inputs.instanceName} (${item.inputs.instanceUrl})\nこの設定は復元できませんが、設定履歴として保存されています。`);
        break;
    }

    // インスタンス情報を復元（履歴にインスタンス情報が保存されている場合）
    if (item.instance && item.instance.url) {
      const instanceNameSpan = document.getElementById('instanceName');

      if (instanceNameSpan) {
        // 現在の情報を保存（戻る用）
        const currentInstanceName = instanceNameSpan.textContent;
        const currentInstanceTitle = instanceNameSpan.title;

        // インスタンス名表示を復元した内容で更新
        instanceNameSpan.textContent = item.instance.name;
        instanceNameSpan.title = `URL: ${item.instance.url}`;

        // 戻るボタンを追加
        const resetButton = document.createElement('button');
        resetButton.id = 'instanceResetBtn';
        resetButton.textContent = 'リセット';
        resetButton.className = 'mastodon-instance-reset-btn';
        resetButton.style.cssText = `
          margin-left: 8px;
          padding: 2px 6px;
          font-size: 10px;
          background: #6364ff;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        `;

        resetButton.addEventListener('click', () => {
          // 現在のページ情報に戻す
          updateInstanceNameDisplay();
          // ボタンを削除
          resetButton.remove();
        });

        // 既存のボタンがあれば削除
        const existingButton = document.getElementById('instanceResetBtn');
        if (existingButton) {
          existingButton.remove();
        }

        // ボタンをインスタンス名の後に挿入
        instanceNameSpan.parentNode.insertBefore(resetButton, instanceNameSpan.nextSibling);
      }
    }

    // UIを更新
    updateInputUI();
    updateSearchModeUI();
    updateGeneratedTimeRange();
  }, 100);
}

// インライン履歴結果表示
async function viewHistoryResultsInline(historyId) {
  const history = await getSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item || !item.posts) return;

  // 検索フォームに戻る
  showSearchForm();
  const historyBtn = document.getElementById('mastodon-history-btn');
  historyBtn.textContent = '履歴';

  // 少し遅らせて結果を表示
  setTimeout(() => {
    displayPosts(item.posts);
  }, 100);
}

// インライン履歴削除
async function deleteInlineHistoryItem(historyId) {
  if (confirm('この履歴を削除しますか？')) {
    let history = await getSearchHistory();
    history = history.filter(h => h.id !== historyId);
    // 大容量データに対応した保存方式を使用
    await saveLargeData('mastodon-content-search-history', history, true);
    await showHistoryInline(); // 履歴表示を更新
  }
}

// インライン履歴すべてクリア
async function clearInlineHistory() {
  if (confirm('すべての履歴を削除しますか？')) {
    await removeLargeData('mastodon-content-search-history');
    await showHistoryInline(); // 履歴表示を更新
  }
}

// 現在のページからMastodonインスタンス情報を取得
async function getCurrentPageInstanceInfo() {
  try {
    // 現在のページのURLからベースURLを取得
    const currentUrl = window.location.origin;

    // Mastodon APIエンドポイントを試行
    const apiUrl = `${currentUrl}/api/v1/instance`;
    const response = await fetch(apiUrl);

    if (response.ok) {
      const instanceData = await response.json();
      return {
        url: currentUrl,
        name: instanceData.title || instanceData.short_description || new URL(currentUrl).hostname
      };
    }
  } catch (error) {
    console.log('インスタンス情報の取得に失敗:', error);
  }

  // フォールバック: ページタイトルやホスト名から推測
  try {
    const hostname = window.location.hostname;
    const pageTitle = document.title;

    // ページタイトルからインスタンス名を抽出を試行
    if (pageTitle && pageTitle.includes(' - ')) {
      const parts = pageTitle.split(' - ');
      const possibleInstanceName = parts[parts.length - 1];
      return {
        url: window.location.origin,
        name: possibleInstanceName
      };
    }

    // ホスト名をそのまま使用
    return {
      url: window.location.origin,
      name: hostname
    };
  } catch (error) {
    return {
      url: window.location.origin,
      name: 'Unknown Instance'
    };
  }
}

// インスタンス名を表示エリアに設定
async function updateInstanceNameDisplay() {
  const instanceNameSpan = document.getElementById('instanceName');
  if (!instanceNameSpan) return;

  try {
    const instanceInfo = await getCurrentPageInstanceInfo();
    instanceNameSpan.textContent = instanceInfo.name;
    instanceNameSpan.title = `URL: ${instanceInfo.url}`; // ツールチップでURLを表示
  } catch (error) {
    instanceNameSpan.textContent = 'インスタンス取得失敗';
    console.error('インスタンス名の更新に失敗:', error);
  }
}
