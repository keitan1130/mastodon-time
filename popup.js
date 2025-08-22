// Mastodon Post Viewer Extension with Hour-based or Minute-based Time Range Search

// グローバルユーティリティ関数
function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div'); 
  d.textContent = s; 
  return d.innerHTML; 
}

// インスタンスベースURLを取得する関数
async function getCurrentInstanceUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['instanceUrl'], (result) => {
      resolve(result.instanceUrl || 'https://mastodon.compositecomputer.club');
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  const inputField = document.getElementById('postIdOrTime');
  const usernameField = document.getElementById('usernameField');
  const timeField = document.getElementById('timeField');
  const fetchButton = document.getElementById('fetchPost');
  const resultDiv = document.getElementById('result');
  const radioButtons = document.querySelectorAll('input[name="inputType"]');

  // インスタンス設定の初期化
  initializeInstanceSettings();

  // ラジオボタンの変更イベントで UI を更新
  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateInputUI);
    // ラジオボタンの変更時に選択状態を保存
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-inputType', this.value);
    });
  });

  // 検索方式の切り替えイベント
  const searchModeButtons = document.querySelectorAll('input[name="searchMode"]');
  searchModeButtons.forEach(radio => {
    radio.addEventListener('change', updateSearchModeUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-popup-searchMode', this.value);
    });
  });

  // 前回の検索方式を復元
  const savedSearchMode = localStorage.getItem('mastodon-popup-searchMode');
  if (savedSearchMode) {
    const targetSearchMode = document.querySelector(`input[name="searchMode"][value="${savedSearchMode}"]`);
    if (targetSearchMode) {
      targetSearchMode.checked = true;
    }
  }

  // 前回の選択状態を復元
  const savedInputType = localStorage.getItem('mastodon-inputType');
  if (savedInputType) {
    const targetRadio = document.querySelector(`input[name="inputType"][value="${savedInputType}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
    }
  }

  updateInputUI();

  // 履歴ボタンのイベントリスナー
  document.getElementById('historyBtn').addEventListener('click', togglePopupHistoryView);
  document.getElementById('history-close').addEventListener('click', hidePopupHistory);
  document.getElementById('history-clear').addEventListener('click', clearPopupHistory);

  // モーダルの背景クリックで閉じる
  document.getElementById('history-modal').addEventListener('click', (e) => {
    if (e.target.id === 'history-modal') {
      hidePopupHistory();
    }
  });

  // 入力値の変更を自動保存
  inputField.addEventListener('input', function() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    if (type === 'id') {
      localStorage.setItem('mastodon-postId', this.value);
    } else if (type === 'time') {
      localStorage.setItem('mastodon-timeRange', this.value);
      updateGeneratedTimeRange();
    }
  });

  if (usernameField) {
    usernameField.addEventListener('input', function() {
      localStorage.setItem('mastodon-username', this.value);
    });
  }

  if (timeField) {
    timeField.addEventListener('input', function() {
      localStorage.setItem('mastodon-userTime', this.value);
      updateGeneratedTimeRange();
    });
  }

  // 時間範囲セレクタの変更も保存
  const timeRangeSelect = document.getElementById('timeRange');
  if (timeRangeSelect) {
    timeRangeSelect.addEventListener('input', function() {
      localStorage.setItem('mastodon-timeRangeInput', this.value);
      updateGeneratedTimeRange();
    });
  }

  // 投稿件数フィールドの自動保存と検索時間フィールドの表示制御
  const postCountField = document.getElementById('postCount');
  if (postCountField) {
    postCountField.addEventListener('input', function() {
      localStorage.setItem('mastodon-popup-postCount', this.value);
      updateSearchTimeVisibility();
    });
  }

  // 検索時間フィールドの自動保存
  const searchTimeField = document.getElementById('searchTime');
  if (searchTimeField) {
    searchTimeField.addEventListener('input', function() {
      localStorage.setItem('mastodon-popup-searchTime', this.value);
    });
  }

  // 前回の検索時間を復元
  if (searchTimeField) {
    const savedSearchTime = localStorage.getItem('mastodon-popup-searchTime');
    if (savedSearchTime) {
      searchTimeField.value = savedSearchTime;
    }
  }

  // 前回の投稿件数を復元
  if (postCountField) {
    const savedPostCount = localStorage.getItem('mastodon-popup-postCount');
    if (savedPostCount) {
      postCountField.value = savedPostCount;
    }
  }

    // 終了時刻（生成された範囲）フィールドの変更で時間範囲を逆算
  const generatedTimeField = document.getElementById('generatedTime');
  if (generatedTimeField) {
    generatedTimeField.addEventListener('input', function() {
      updateTimeRangeFromEndTime();
    });
  }

  function updateGeneratedTimeRange() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    const generatedField = document.getElementById('generatedTime');

    if (type === 'user') {
      const dateTimeInput = document.getElementById('timeField').value.trim();
      const timeRangeInput = document.getElementById('timeRange').value.trim();

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
      const dateTimeInput = inputField.value.trim();
      const timeRangeInput = document.getElementById('timeRange').value.trim();

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
      const timeRangeField = document.getElementById('timeRange');
      if (timeRangeField) {
        const diffMs = adjustedEndTime.getTime() - adjustedStartTime.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const timeRangeStr = `${diffHours}:${String(diffMinutes).padStart(2, '0')}:${String(diffSeconds).padStart(2, '0')}`;
        timeRangeField.value = timeRangeStr;
        localStorage.setItem('mastodon-timeRangeInput', timeRangeStr);
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

  function updateSearchModeUI() {
    const searchMode = document.querySelector('input[name="searchMode"]:checked').value;
    const timeRangeSelector = document.getElementById('timeRangeSelector');
    const postCountSelector = document.getElementById('postCountSelector');
    const generatedTimeDisplay = document.getElementById('generatedTimeDisplay');

    if (searchMode === 'timeRange') {
      if (timeRangeSelector) timeRangeSelector.style.display = 'block';
      if (postCountSelector) postCountSelector.style.display = 'none';
      if (generatedTimeDisplay) generatedTimeDisplay.style.display = 'block';
      updateGeneratedTimeRange();
    } else {
      if (timeRangeSelector) timeRangeSelector.style.display = 'none';
      if (postCountSelector) postCountSelector.style.display = 'block';
      if (generatedTimeDisplay) generatedTimeDisplay.style.display = 'none';
      updateSearchTimeVisibility();
    }
  }

  function updateSearchTimeVisibility() {
    const postCountField = document.getElementById('postCount');
    const searchTimeSelector = document.getElementById('searchTimeSelector');

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

  function updateTimeRangeFromEndTime() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    const generatedField = document.getElementById('generatedTime');
    const timeRangeField = document.getElementById('timeRange');

    if (!generatedField.value.trim()) {
      // 終了時刻が空の場合は時間範囲もクリア
      timeRangeField.value = '';
      localStorage.removeItem('mastodon-timeRangeInput');
      return;
    }

    try {
      const endTime = parseDateTime(generatedField.value.trim());
      let startTime;

      if (type === 'user') {
        const dateTimeInput = document.getElementById('timeField').value.trim();
        if (dateTimeInput) {
          startTime = parseDateTime(dateTimeInput);
        }
      } else if (type === 'time') {
        const dateTimeInput = inputField.value.trim();
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
      localStorage.setItem('mastodon-timeRangeInput', timeRangeStr);
    } catch (e) {
      // 日時形式エラーの場合 - 何もしない
      console.warn('時間範囲の逆算でエラー:', e);
    }
  }

  // エラー表示用のヘルパー関数


  function updateInputUI() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    const timeRangeSelector = document.getElementById('timeRangeSelector');
    const userInput = document.getElementById('userInput');
    const timeInput = document.getElementById('timeInput');
    const generatedTimeDisplay = document.getElementById('generatedTimeDisplay');
    const searchModeSelector = document.getElementById('searchModeSelector');
    const postCountSelector = document.getElementById('postCountSelector');

    // すべての入力欄を非表示にする
    inputField.style.display = 'none';
    if (userInput) userInput.style.display = 'none';
    if (timeInput) timeInput.style.display = 'none';
    if (generatedTimeDisplay) generatedTimeDisplay.style.display = 'none';
    if (searchModeSelector) searchModeSelector.style.display = 'none';
    if (timeRangeSelector) timeRangeSelector.style.display = 'none';
    if (postCountSelector) postCountSelector.style.display = 'none';

    if (type === 'id') {
      inputField.style.display = 'block';
      // 前回の入力を復元、なければデフォルト値
      inputField.value = localStorage.getItem('mastodon-postId') || '114914719105992385';
      inputField.placeholder = '投稿ID';

      // ラベルを変更
      const inputLabel = document.querySelector('label[for="postIdOrTime"]');
      if (inputLabel) {
        inputLabel.textContent = '投稿ID:';
      }

      if (timeRangeSelector) timeRangeSelector.style.display = 'none';
      if (generatedTimeDisplay) generatedTimeDisplay.style.display = 'none';
    } else if (type === 'user') {
      if (userInput) userInput.style.display = 'block';
      if (timeInput) timeInput.style.display = 'block';
      if (searchModeSelector) searchModeSelector.style.display = 'block';

      // ユーザー名の前回値を復元、なければデフォルト値
      if (usernameField) {
        usernameField.value = localStorage.getItem('mastodon-username') || '@keitan';
      }

      // 時間の前回値を復元、なければ現在時刻
      if (timeField) {
        const savedTime = localStorage.getItem('mastodon-userTime');
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
      }

      // 時間範囲の値を設定
      const timeRangeSelect = document.getElementById('timeRange');
      if (timeRangeSelect) {
        const savedTimeRangeInput = localStorage.getItem('mastodon-timeRangeInput');
        if (savedTimeRangeInput) {
          timeRangeSelect.value = savedTimeRangeInput;
        } else {
          timeRangeSelect.value = '1:00:00'; // デフォルト値
        }
      }

      updateSearchModeUI();
      updateGeneratedTimeRange();
    } else {
      // パブリック（時間）検索
      inputField.style.display = 'block';
      if (searchModeSelector) searchModeSelector.style.display = 'block';

      // ラベルを変更
      const inputLabel = document.querySelector('label[for="postIdOrTime"]');
      if (inputLabel) {
        inputLabel.textContent = '開始時刻:';
      }

      // 前回の時間範囲検索の値を復元、なければ現在時刻
      const savedTimeRange = localStorage.getItem('mastodon-timeRange');
      if (savedTimeRange) {
        inputField.value = savedTimeRange;
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        inputField.value = `${year}-${month}-${day} ${hour}`;
      }
      inputField.placeholder = 'YYYY-MM-DD HH:MM:SS または YYYY/M/D H:MM:SS';

      // 時間範囲の値を設定
      const timeRangeSelect = document.getElementById('timeRange');
      if (timeRangeSelect) {
        const savedTimeRangeInput = localStorage.getItem('mastodon-timeRangeInput');
        if (savedTimeRangeInput) {
          timeRangeSelect.value = savedTimeRangeInput;
        } else {
          timeRangeSelect.value = '1:00:00'; // デフォルト値
        }
      }

      updateSearchModeUI();
      updateGeneratedTimeRange();
    }

    // 検索時間の表示制御を更新
    updateSearchTimeVisibility();

    resultDiv.innerHTML = '';
  }

  fetchButton.addEventListener('click', async function() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    resultDiv.innerHTML = '<div class="loading">取得中...</div>';

    try {
      if (type === 'id') {
        // 単一投稿取得
        const raw = inputField.value.trim();
        if (!raw) return showError('投稿IDを入力してください');
        if (!/^\d+$/.test(raw)) throw new Error('投稿IDは数字のみです');
        const post = await fetchMastodonPost(raw);
        displayPosts([post]);

        // 検索成功時に履歴を保存
        savePopupSearchHistory('id', { postId: raw }, [post]);
      } else if (type === 'user') {
        // ユーザー名検索（分離された入力欄使用）
        const username = usernameField.value.trim();
        const timeInput = timeField.value.trim();

        if (!username) return showError('ユーザー名を入力してください');

        // @ を除去
        const cleanUsername = username.replace(/^@/, '');

        // リモートアカウント形式かローカル形式かを判定
        if (cleanUsername.includes('@')) {
          // user@instance.com 形式の場合
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

        const searchMode = document.querySelector('input[name="searchMode"]:checked').value;

        if (searchMode === 'postCount') {
          // 投稿件数指定モード
          const postCountInput = parseInt(document.getElementById('postCount').value) || 200;
          if (Math.abs(postCountInput) < 1 || Math.abs(postCountInput) > 10000) {
            throw new Error('投稿件数は-10000から10000の範囲で入力してください（0以外）');
          }

          let fetchOptions = { searchMode };
          fetchOptions.postCount = postCountInput; // 正負の値をそのまま渡す

          if (timeInput) {
            // 時間が指定されている場合: 様々な形式をサポート
            const timeMatch = timeInput.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
            if (timeMatch) {
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
              fetchOptions.startTime = new Date(Y, Mo-1, D, hh, mm, ss, 0);
            }
          }

          const posts = await fetchUserPosts(cleanUsername, fetchOptions);
          displayPosts(posts);

          // 検索成功時に履歴を保存
          savePopupSearchHistory('user', {
            username: cleanUsername,
            timeInput,
            searchMode,
            postCount: searchMode === 'postCount' ? parseInt(document.getElementById('postCount').value) || 200 : null,
            timeRange: searchMode === 'timeRange' ? document.getElementById('timeRange').value.trim() : null
          }, posts);
        } else {
          // 時間範囲指定モード - 従来の処理
          let timeFilter = null;
          if (timeInput) {
            // 時間が指定されている場合: 様々な形式をサポート
            // YYYY-MM-DD, YYYY-MM-DD HH, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS
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
            const timeRangeSelect = document.getElementById('timeRange');
            const timeRangeInput = timeRangeSelect ? timeRangeSelect.value.trim() : '1:00:00';

            const startJst = new Date(Y, Mo-1, D, hh, mm, ss, 0);

            // 終了時刻フィールドから終了時刻を取得して検証・入れ替え
            const generatedField = document.getElementById('generatedTime');
            const startField = document.getElementById('timeField');
            let endJst;

            if (generatedField && generatedField.value.trim()) {
              try {
                const userEndTime = parseDateTime(generatedField.value.trim());
                const adjustedTimes = adjustTimeRange(startJst, userEndTime, startField, generatedField, 'mastodon-userTime');
                timeFilter = { start: adjustedTimes.start, end: adjustedTimes.end };
              } catch (e) {
                // パース失敗時はtimeRangeInputを使用
                endJst = parseAndAddTime(startJst, timeRangeInput);
                timeFilter = { start: startJst, end: endJst };
              }
            } else {
              endJst = parseAndAddTime(startJst, timeRangeInput);
              // マイナス値の場合の処理
              if (endJst <= startJst) {
                const adjustedTimes = adjustTimeRange(startJst, endJst, startField, generatedField, 'mastodon-userTime');
                timeFilter = { start: adjustedTimes.start, end: adjustedTimes.end };
              } else {
                timeFilter = { start: startJst, end: endJst };
              }
            }
          }

          const posts = await fetchUserPosts(cleanUsername, timeFilter);
          displayPosts(posts);
        }
      } else {
        // パブリック（時間）検索
        const raw = inputField.value.trim();
        const searchMode = document.querySelector('input[name="searchMode"]:checked').value;

        if (searchMode === 'postCount') {
          // 投稿件数指定モード
          const postCountInput = parseInt(document.getElementById('postCount').value) || 200;
          if (Math.abs(postCountInput) < 1 || Math.abs(postCountInput) > 10000) {
            throw new Error('投稿件数は-10000から10000の範囲で入力してください（0以外）');
          }

          let startTime = null;
          if (raw) {
            const timeMatch = raw.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
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
              startTime = new Date(Y, Mo-1, D, hh, mm, ss, 0);
            }
          }

          // 投稿件数による公開タイムライン検索
          const posts = await fetchPublicTimelineByCount(postCountInput, startTime);
          displayPosts(posts);

          // 検索成功時に履歴を保存
          savePopupSearchHistory('time', {
            timeInput: raw,
            searchMode: 'postCount',
            postCount: postCountInput
          }, posts);
        } else {
          // 時間範囲検索（従来の処理）
          if (!raw) return showError('時間を入力してください');

        // 時間範囲検索: 様々な形式をサポート
        // YYYY-MM-DD, YYYY-MM-DD HH, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS
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
        const timeRangeSelect = document.getElementById('timeRange');
        const timeRangeInput = timeRangeSelect ? timeRangeSelect.value.trim() : '1:00:00';

        // 範囲設定: 指定時間から時間範囲入力で指定した時間後まで
        const startJst = new Date(Y, Mo-1, D, hh, mm, ss, 0);

        // 終了時刻フィールドから終了時刻を取得して検証・入れ替え
        const generatedField = document.getElementById('generatedTime');
        let finalStartTime = startJst;
        let finalEndTime;

        if (generatedField && generatedField.value.trim()) {
          try {
            const userEndTime = parseDateTime(generatedField.value.trim());
            const adjustedTimes = adjustTimeRange(startJst, userEndTime, inputField, generatedField, 'mastodon-timeRange');
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
            const adjustedTimes = adjustTimeRange(startJst, finalEndTime, inputField, generatedField, 'mastodon-timeRange');
            finalStartTime = adjustedTimes.start;
            finalEndTime = adjustedTimes.end;
            // 生成された範囲フィールドも更新
            generatedField.value = formatDateTime(finalEndTime);
          }
        }

        const startId = generateSnowflakeIdFromJst(finalStartTime);
        const endId = generateSnowflakeIdFromJst(finalEndTime);
        const posts = await fetchPublicTimelineInRange(startId, endId);
        displayPosts(posts);

        // 検索成功時に履歴を保存
        savePopupSearchHistory('time', {
          timeInput: raw,
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
  });

  // --- Mastodon API 呼び出し ---
  async function fetchMastodonPost(id) {
    const instanceUrl = await getCurrentInstanceUrl();
    const res = await fetch(`${instanceUrl}/api/v1/statuses/${id}`);
    if (!res.ok) throw new Error(`投稿取得エラー: ${res.status}`);
    return res.json();
  }

  // 認証情報取得
  function getStorageAsync(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  // 日時レンジ内のローカルタイムラインを取得
  // ローカルタイムライン = そのサーバー（mastodon.compositecomputer.club）のユーザーの投稿のみ
  async function fetchPublicTimelineInRange(sinceId, maxId) {
    let all = [];
    let max = maxId;
    let requestCount = 0;
    const maxRequests = 275;

    const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
    const stored = await getStorageAsync(keys);
    const instanceUrl = await getCurrentInstanceUrl();

    while (requestCount < maxRequests) {
      const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
      url.searchParams.set('limit', '40');
      url.searchParams.set('max_id', max);
      url.searchParams.set('since_id', sinceId);
      url.searchParams.set('local', 'true'); // ローカルタイムラインのみ取得

      const res = await fetch(url, {
        headers: {
          "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
          "X-Csrf-Token": stored["x_csrf_token"],
          "Authorization": stored["authorization"]
        },
        credentials: "include" // 忘れずに（Cookieを送る場合）
      });

      if (!res.ok) throw new Error('タイムライン取得エラー');

      const batch = await res.json();
      if (!batch.length) break;  // もう取得する投稿がない

      all = all.concat(batch);   // 結果をまとめる
      requestCount++;

      // 進捗を表示（多くの投稿がある場合）
      if (all.length > 10) {
        document.getElementById('result').innerHTML =
          `<div class="loading">取得中... ${all.length}件取得済み</div>`;
      }

      // 次のページ取得用に max_id を更新（最後の投稿ID - 1）
      max = (BigInt(batch[batch.length-1].id) - 1n).toString();

      // 取得件数が40件未満なら最後のページ
      if (batch.length < 40) break;
    }

    return all;
  }

  // 投稿件数による公開タイムライン取得
  async function fetchPublicTimelineByCount(postCount, startTime = null) {
    let all = [];
    let maxId = null;
    let requestCount = 0;
    const maxRequests = 275;

    const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
    const stored = await getStorageAsync(keys);
    const instanceUrl = await getCurrentInstanceUrl();

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

          const res = await fetch(url, {
            headers: {
              "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
              "X-Csrf-Token": stored["x_csrf_token"],
              "Authorization": stored["authorization"]
            },
            credentials: "include"
          });

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
            document.getElementById('result').innerHTML =
              `<div class="loading">取得中... ${pastPosts.length}件取得済み</div>`;
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
        const searchTimeField = document.getElementById('searchTime');
        const searchTimeStr = searchTimeField ? searchTimeField.value : '24:00:00';
        const searchTimeMs = parseSearchTimeToMs(searchTimeStr);

        // 1. まず min_id で最小のIDを取得して開始点を決定
        let currentSinceId = null;

        // min_idで最初の投稿を1つ取得
        const minIdUrl = new URL(`${instanceUrl}/api/v1/timelines/public`);
        minIdUrl.searchParams.set('limit', '1');
        minIdUrl.searchParams.set('min_id', generateSnowflakeIdFromJst(startTime));
        minIdUrl.searchParams.set('local', 'true');

        const minIdRes = await fetch(minIdUrl, {
          headers: {
            "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
            "X-Csrf-Token": stored["x_csrf_token"],
            "Authorization": stored["authorization"]
          },
          credentials: "include"
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
          let maxId = currentMaxId;
          let batchRequestCount = 0;

          while (batchRequestCount < 50) { // 1つの時間範囲内での最大リクエスト数
            const url = new URL(`${instanceUrl}/api/v1/timelines/public`);
            url.searchParams.set('limit', '40');
            url.searchParams.set('since_id', currentSinceId);
            url.searchParams.set('max_id', maxId);
            url.searchParams.set('local', 'true');

            const res = await fetch(url, {
              headers: {
                "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
                "X-Csrf-Token": stored["x_csrf_token"],
                "Authorization": stored["authorization"]
              },
              credentials: "include"
            });

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
            document.getElementById('result').innerHTML =
              `<div class="loading">取得中... ${futurePosts.length}件取得済み (${Math.round(requestCount * searchTimeMs / 3600000)}時間分検索済み)</div>`;
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

            const nextMinIdRes = await fetch(nextMinIdUrl, {
              headers: {
                "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
                "X-Csrf-Token": stored["x_csrf_token"],
                "Authorization": stored["authorization"]
              },
              credentials: "include"
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
        }

        // 指定時間に近い順（古い順）で指定件数だけ取得
        const result = futurePosts.slice(0, postCount);

        // 最終的に新しいものから古いものの順で表示用にソート
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        all = result;
        return all;
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
        document.getElementById('result').innerHTML =
          `<div class="loading">取得中... ${all.length}件取得済み</div>`;
      }

      maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
      if (batch.length < 40) break;
    }

    // 指定件数にトリム
    all = all.slice(0, actualPostCount);
    return all;
  }

  // ユーザーの投稿を取得
  async function fetchUserPosts(username, options = {}) {
    const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
    const stored = await getStorageAsync(keys);

    // optionsから引数を取得
    // 後方互換性のため、旧引数のtimeFilterも受け取る
    let searchMode, timeFilter, postCount, initialStartTime;

    if (options && typeof options === 'object' && options.searchMode) {
      // 新しい形式
      searchMode = options.searchMode || 'timeRange';
      timeFilter = options.timeFilter || null;
      postCount = options.postCount || 200;
      initialStartTime = options.startTime || null;
    } else {
      // 旧形式（timeFilterが直接渡された場合）
      searchMode = 'timeRange';
      timeFilter = options;
      postCount = 200;
      initialStartTime = null;
    }

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
      // user 形式の場合は設定されたインスタンスを使用
      targetInstanceUrl = await getCurrentInstanceUrl();
      cleanUsername = username;
    }

    // 1. ユーザーアカウント情報を取得
    const lookupUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/lookup`);
    lookupUrl.searchParams.set('acct', cleanUsername);    const accountRes = await fetch(lookupUrl, {
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

        while (pastRequestCount < 275 && pastPosts.length < actualPostCount * 2) {
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
          }).catch(async () => {
            if (username.includes('@')) {
              return await fetch(statusesUrl);
            }
            throw new Error('認証エラー');
          });

          if (!statusesRes.ok) break;

          const batch = await statusesRes.json();
          if (!batch.length) break;

          // 指定時刻以前の投稿のみを追加
          const validPosts = batch.filter(post => new Date(post.created_at) <= startTime);
          pastPosts = pastPosts.concat(validPosts);

          // max_idを更新
          maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();
          pastRequestCount++;

          if (pastPosts.length > 10) {
            document.getElementById('result').innerHTML =
              `<div class="loading">取得中... ${pastPosts.length}件取得済み</div>`;
          }

          // 必要な件数が取得できたらループを終了
          if (pastPosts.length >= actualPostCount) break;
          if (batch.length < 40) break;
        }

        return pastPosts.slice(0, actualPostCount);
      } else {
        // 正の値指定：未来方向の取得（改良版 - min_id + 動的検索時間方式）
        let futurePosts = [];
        let requestCount = 0;

        // ユーザー指定の検索時間を取得（デフォルト24時間）
        const searchTimeField = document.getElementById('searchTime');
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
        }).catch(async () => {
          if (username.includes('@')) {
            return await fetch(minIdUrl);
          }
          throw new Error('認証エラー');
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

        while (requestCount < 275 && futurePosts.length < postCount) {
          // ユーザー指定の検索時間後をmax_idとして設定
          const nextPeriod = new Date(startTime.getTime() + requestCount * searchTimeMs + searchTimeMs);
          const currentMaxId = generateSnowflakeIdFromJst(nextPeriod);

          // ユーザー指定の検索時間分のデータを取得
          let batchPosts = [];
          let maxId = currentMaxId;
          let batchRequestCount = 0;

          while (batchRequestCount < 50) { // 1つの時間範囲内での最大リクエスト数
            const statusesUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
            statusesUrl.searchParams.set('limit', '40');
            statusesUrl.searchParams.set('since_id', currentSinceId);
            statusesUrl.searchParams.set('max_id', maxId);

            const statusesRes = await fetch(statusesUrl, {
              headers: {
                "Cookie": `_session_id=${stored["session_id"]}; _mastodon_session=${stored["mastodon_session"]};`,
                "X-Csrf-Token": stored["x_csrf_token"],
                "Authorization": stored["authorization"]
              },
              credentials: "include"
            }).catch(async () => {
              if (username.includes('@')) {
                return await fetch(statusesUrl);
              }
              throw new Error('認証エラー');
            });

            if (!statusesRes.ok) break;

            const batch = await statusesRes.json();
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
            document.getElementById('result').innerHTML =
              `<div class="loading">取得中... ${futurePosts.length}件取得済み (${Math.round(requestCount * searchTimeMs / 3600000)}時間分検索済み)</div>`;
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
            }).catch(async () => {
              if (username.includes('@')) {
                return await fetch(nextMinIdUrl);
              }
              throw new Error('認証エラー');
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
        }

        // 指定時間に近い順（古い順）で指定件数だけ取得
        const result = futurePosts.slice(0, postCount);

        // 最終的に新しいものから古いものの順で表示用にソート
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return result;
      }
    }

    // 従来の処理（時間範囲モードや投稿件数モードで時刻指定なし）
    let all = [];
    let maxId = null;
    let requestCount = 0;
    const maxRequests = 275; // 最大275回のリクエストで制限）

    while (requestCount < maxRequests) {
      const statusesUrl = new URL(`${targetInstanceUrl}/api/v1/accounts/${account.id}/statuses`);
      statusesUrl.searchParams.set('limit', '40');

      if (maxId) {
        statusesUrl.searchParams.set('max_id', maxId);
      }

      // 検索モードによる処理分岐
      if (searchMode === 'timeRange' && timeFilter) {
        // 時間フィルタがある場合、Snowflake IDで範囲指定
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
      if (!batch.length) break; // もう取得する投稿がない

      let filteredBatch = batch;

      // 検索モードによるフィルタリング
      if (searchMode === 'timeRange' && timeFilter) {
        // 時間範囲モード：厳密に時間でフィルタリング
        filteredBatch = batch.filter(post => {
          const postTime = new Date(post.created_at);
          return postTime >= timeFilter.start && postTime <= timeFilter.end;
        });

        // 時間範囲外の投稿が見つかったら、それ以降は不要なので終了
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

      // 進捗を表示（多くの投稿がある場合）
      if (all.length > 10) {
        document.getElementById('result').innerHTML =
          `<div class="loading">取得中... ${all.length}件取得済み</div>`;
      }

      // 投稿件数指定の場合は指定件数に達したら終了
      if (searchMode === 'postCount' && all.length >= Math.abs(postCount)) {
        all = all.slice(0, Math.abs(postCount)); // 指定件数にトリム
        break;
      }

      // 次のページ取得用に max_id を更新（最後の投稿ID - 1）
      maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();

      // 取得件数が40件未満なら最後のページ
      if (batch.length < 40) break;

      // 時間範囲モードで時間指定がない場合のみ200件制限
      if (searchMode === 'timeRange' && !timeFilter && all.length >= 200) break;
    }

    return all;
  }

  // --- ID <-> JST 変換 ---
  function generateSnowflakeIdFromJst(dtJst) {
    // JSTの時刻をそのままUTCミリ秒として扱う（時差補正なし）
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

  // --- 表示 ---
  function displayPosts(posts) {
    if (!posts.length) {
      resultDiv.innerHTML = '<div class="no-results">該当する投稿がありません</div>';
      return;
    }

    // 常に取得件数を表示（txtダウンロードリンク付き）
    const countText = `<div class="count">取得件数: ${posts.length}件 <a href="#" id="txtDownloadLink" style="margin-left: 10px; color: #6364ff; text-decoration: underline; font-size: 13px;">txtダウンロード</a></div>`;

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
      el.addEventListener('click', () => chrome.tabs.create({ url: el.dataset.url }));

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
    const txtDownloadLink = document.getElementById('txtDownloadLink');
    if (txtDownloadLink) {
      txtDownloadLink.addEventListener('click', (e) => {
        e.preventDefault();
        downloadPostsAsTxt(posts);
      });
    }
  }

  // --- 共通ユーティリティ ---
  function showError(msg) { resultDiv.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`; }

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

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // プレビュー機能
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
    const hasMedia = postInfo.mediaAttachments && postInfo.mediaAttachments.length > 0;
    const hasUrlPreview = postInfo.card && postInfo.card.url && !postInfo.mediaAttachments?.length;
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
          chrome.tabs.create({ url: url });
        }
      });
    }

    const urlSimpleElement = tooltip.querySelector('.mastodon-tooltip-url-simple');
    if (urlSimpleElement) {
      urlSimpleElement.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = urlSimpleElement.getAttribute('data-url');
        if (url) {
          chrome.tabs.create({ url: url });
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
          chrome.tabs.create({ url: profileUrl });
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
          chrome.tabs.create({ url: postUrl });
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

  // 時間文字列（HH:MM:SS）をミリ秒に変換する関数
  function parseSearchTimeToMs(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 86400000; // デフォルト24時間

    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseInt(parts[2]) || 0;

    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
  }

  // テキストファイルとして投稿データをダウンロードする関数
  function downloadPostsAsTxt(posts) {
    if (!posts || posts.length === 0) {
      return;
    }

    // テキスト内容を生成
    let txtContent = `Mastodon投稿データ\n`;
    txtContent += `エクスポート日時: ${new Date().toLocaleString('ja-JP')}\n`;
    txtContent += `投稿数: ${posts.length}件\n`;
    txtContent += `\n${'='.repeat(50)}\n\n`;

    posts.forEach((post, index) => {
      const postInfo = getPostDisplayInfo(post);

      txtContent += `【投稿 ${index + 1}】\n`;
      txtContent += `投稿ID: ${post.id}\n`;

      if (postInfo.isBoost) {
        // ブースト投稿の場合
        txtContent += `ブーストユーザー: ${postInfo.boosterUser} (${postInfo.boosterUsername})\n`;
        txtContent += `ブースト日時: ${new Date(postInfo.boostTime).toLocaleString('ja-JP')}\n`;
        txtContent += `元投稿ユーザー: ${postInfo.displayUser} (${postInfo.displayUsername})\n`;
        txtContent += `元投稿日時: ${new Date(postInfo.displayTime).toLocaleString('ja-JP')}\n`;
      } else {
        // 通常投稿の場合
        txtContent += `ユーザー: ${postInfo.displayUser} (${postInfo.displayUsername})\n`;
        txtContent += `投稿日時: ${new Date(postInfo.displayTime).toLocaleString('ja-JP')}\n`;
      }

      txtContent += `URL: ${postInfo.displayUrl}\n`;
      txtContent += `内容:\n${postInfo.displayContent}\n`;

      // メディア添付情報
      if (postInfo.mediaAttachments && postInfo.mediaAttachments.length > 0) {
        txtContent += `添付メディア: ${postInfo.mediaAttachments.length}件\n`;
        postInfo.mediaAttachments.forEach((media, mediaIndex) => {
          txtContent += `  ${mediaIndex + 1}. タイプ: ${media.type}, URL: ${media.url}\n`;
        });
      }

      // URLカード情報
      if (postInfo.card && postInfo.card.url) {
        txtContent += `リンクカード: ${postInfo.card.title || 'タイトルなし'}\n`;
        txtContent += `リンクURL: ${postInfo.card.url}\n`;
        if (postInfo.card.description) {
          txtContent += `説明: ${postInfo.card.description}\n`;
        }
      }

      txtContent += `\n${'-'.repeat(30)}\n\n`;
    });

    // ファイル名を生成（日時を含む）
    const now = new Date();
    const timestamp = now.getFullYear() +
                     String(now.getMonth() + 1).padStart(2, '0') +
                     String(now.getDate()).padStart(2, '0') + '_' +
                     String(now.getHours()).padStart(2, '0') +
                     String(now.getMinutes()).padStart(2, '0') +
                     String(now.getSeconds()).padStart(2, '0');
    const filename = `mastodon_posts_${timestamp}.txt`;

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
    const resultDiv = document.getElementById('result');
    const countDiv = resultDiv.querySelector('.count');
    if (countDiv) {
      const originalCountHTML = countDiv.innerHTML;
      countDiv.innerHTML = originalCountHTML + ' <span style="color: #4caf50;">ダウンロード完了!</span>';

      // 3秒後に元に戻す
      setTimeout(() => {
        countDiv.innerHTML = originalCountHTML;
      }, 3000);
    }
  }
});

// インスタンス設定の初期化関数
function initializeInstanceSettings() {
  const instanceUrlField = document.getElementById('instanceUrl');
  const saveInstanceButton = document.getElementById('saveInstance');
  const instanceStatus = document.getElementById('instanceStatus');

  if (!instanceUrlField || !saveInstanceButton || !instanceStatus) {
    return; // 要素が見つからない場合は終了
  }

  // 保存されたインスタンスURLを復元
  chrome.storage.local.get(['instanceUrl'], (result) => {
    if (result.instanceUrl) {
      instanceUrlField.value = result.instanceUrl;
    }
  });

  // 保存ボタンのクリックイベント
  saveInstanceButton.addEventListener('click', async () => {
    const url = instanceUrlField.value.trim();

    if (!url) {
      instanceStatus.textContent = '❌ URLを入力してください';
      instanceStatus.style.color = '#ff6b6b';
      return;
    }

    try {
      // URLの形式をチェック
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'https:') {
        throw new Error('HTTPSのURLを使用してください');
      }

      // Mastodonインスタンスかチェック
      const instanceInfo = await fetch(`${url}/api/v1/instance`);
      if (!instanceInfo.ok) {
        throw new Error('Mastodonインスタンスではないようです');
      }

      const info = await instanceInfo.json();

      // インスタンスURLを保存
      chrome.storage.local.set({ instanceUrl: url }, () => {
        instanceStatus.textContent = `✅ ${info.title || 'インスタンス'}に設定しました`;
        instanceStatus.style.color = '#4caf50';

        // 数秒後にメッセージを消す
        setTimeout(() => {
          instanceStatus.textContent = '';
        }, 3000);
      });

    } catch (error) {
      instanceStatus.textContent = `❌ ${error.message}`;
      instanceStatus.style.color = '#ff6b6b';
    }
  });
}

// 履歴管理機能
function savePopupSearchHistory(type, inputs, posts) {
  const history = getPopupSearchHistory();

  const historyItem = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type,
    inputs,
    resultCount: posts.length,
    posts: posts // 全件保存に変更
  };

  // 新しいアイテムを先頭に追加
  history.unshift(historyItem);

  // 10個を超えた場合は古いものを削除
  if (history.length > 10) {
    history.splice(10);
  }

  // ローカルストレージに保存
  localStorage.setItem('mastodon-popup-search-history', JSON.stringify(history));
}

function getPopupSearchHistory() {
  try {
    const history = localStorage.getItem('mastodon-popup-search-history');
    return history ? JSON.parse(history) : [];
  } catch (e) {
    console.error('履歴の読み込みに失敗:', e);
    return [];
  }
}

function showPopupHistory() {
  const modal = document.getElementById('history-modal');
  const historyList = document.getElementById('history-list');

  const history = getPopupSearchHistory();

  if (history.length === 0) {
    historyList.innerHTML = '<div class="no-history">履歴がありません</div>';
  } else {
    historyList.innerHTML = history.map(item => {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString('ja-JP');

      let typeLabel = '';
      let inputSummary = '';

      switch(item.type) {
        case 'id':
          typeLabel = '投稿ID';
          inputSummary = `ID: ${item.inputs.postId}`;
          break;
        case 'user':
          typeLabel = 'ユーザー';
          inputSummary = `${item.inputs.username}`;
          if (item.inputs.timeInput) {
            inputSummary += ` (${item.inputs.timeInput})`;
          }
          if (item.inputs.searchMode === 'postCount') {
            inputSummary += ` [件数: ${item.inputs.postCount}件]`;
          } else if (item.inputs.timeRange) {
            inputSummary += ` [範囲: ${item.inputs.timeRange}]`;
          }
          break;
        case 'time':
          typeLabel = 'パブリック';
          inputSummary = `${item.inputs.timeInput || '現在時刻'}`;
          if (item.inputs.searchMode === 'postCount') {
            inputSummary += ` [件数: ${item.inputs.postCount}件]`;
          } else if (item.inputs.timeRange) {
            inputSummary += ` [範囲: ${item.inputs.timeRange}]`;
          }
          break;
      }

      return `
        <div class="history-item" data-history-id="${item.id}">
          <div class="history-item-header">
            <span class="history-type">[${typeLabel}]</span>
            <span class="history-time">${timeStr}</span>
          </div>
          <div class="history-summary">${escapeHtml(inputSummary)}</div>
          <div class="history-result">結果: ${item.resultCount}件</div>
          <div class="history-actions">
            <button class="history-restore-btn" data-history-id="${item.id}">復元</button>
            <button class="history-view-btn" data-history-id="${item.id}">表示</button>
            <button class="history-save-btn" data-history-id="${item.id}">保存(.txt)</button>
            <button class="history-delete-btn" data-history-id="${item.id}">削除</button>
          </div>
        </div>
      `;
    }).join('');

    // 履歴アイテムのイベントリスナーを設定
    setupPopupHistoryItemListeners();
  }

  modal.style.display = 'flex';
}

function hidePopupHistory() {
  const modal = document.getElementById('history-modal');
  modal.style.display = 'none';
}

function clearPopupHistory() {
  if (confirm('すべての履歴を削除しますか？')) {
    localStorage.removeItem('mastodon-popup-search-history');
    showPopupHistory(); // 履歴表示を更新
  }
}

function setupPopupHistoryItemListeners() {
  // 復元ボタン
  document.querySelectorAll('.history-restore-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      restorePopupSearchFromHistory(historyId);
    });
  });

  // 表示ボタン
  document.querySelectorAll('.history-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      viewPopupHistoryResults(historyId);
    });
  });

  // 保存(.txt)ボタン
  document.querySelectorAll('.history-save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      savePopupHistoryAsTxt(historyId);
    });
  });

  // 削除ボタン
  document.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      deletePopupHistoryItem(historyId);
    });
  });
}

function restorePopupSearchFromHistory(historyId) {
  const history = getPopupSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item) return;

  // 入力タイプを設定
  const typeRadio = document.querySelector(`input[name="inputType"][value="${item.type}"]`);
  if (typeRadio) {
    typeRadio.checked = true;
  }

  // 各入力フィールドを復元
  switch(item.type) {
    case 'id':
      document.getElementById('postIdOrTime').value = item.inputs.postId;
      break;

    case 'user':
      const usernameField = document.getElementById('usernameField');
      const timeField = document.getElementById('timeField');
      if (usernameField) usernameField.value = item.inputs.username;
      if (item.inputs.timeInput && timeField) {
        timeField.value = item.inputs.timeInput;
      }

      // 検索モードを復元
      if (item.inputs.searchMode) {
        const modeRadio = document.querySelector(`input[name="searchMode"][value="${item.inputs.searchMode}"]`);
        if (modeRadio) {
          modeRadio.checked = true;
        }

        if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
          const postCountField = document.getElementById('postCount');
          if (postCountField) postCountField.value = item.inputs.postCount;
        } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
          const timeRangeSelect = document.getElementById('timeRange');
          if (timeRangeSelect) timeRangeSelect.value = item.inputs.timeRange;
        }
      }
      break;

    case 'time':
      document.getElementById('postIdOrTime').value = item.inputs.timeInput || '';

      // 検索モードを復元
      if (item.inputs.searchMode) {
        const modeRadio = document.querySelector(`input[name="searchMode"][value="${item.inputs.searchMode}"]`);
        if (modeRadio) {
          modeRadio.checked = true;
        }

        if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
          const postCountField = document.getElementById('postCount');
          if (postCountField) postCountField.value = item.inputs.postCount;
        } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
          const timeRangeSelect = document.getElementById('timeRange');
          if (timeRangeSelect) timeRangeSelect.value = item.inputs.timeRange;
        }
      }
      break;
  }

  // UIを更新
  updateInputUI();
  updateSearchModeUI();
  updateGeneratedTimeRange();

  // 履歴モーダルを閉じる
  hidePopupHistory();
}

function viewPopupHistoryResults(historyId) {
  const history = getPopupSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item || !item.posts) return;

  // 結果を表示
  displayPosts(item.posts);

  // 履歴モーダルを閉じる
  hidePopupHistory();
}

function deletePopupHistoryItem(historyId) {
  if (confirm('この履歴を削除しますか？')) {
    let history = getPopupSearchHistory();
    history = history.filter(h => h.id !== historyId);
    localStorage.setItem('mastodon-popup-search-history', JSON.stringify(history));
    showPopupHistory(); // 履歴表示を更新
  }
}

function savePopupHistoryAsTxt(historyId) {
  const history = getPopupSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item || !item.posts) {
    alert('保存する履歴データが見つかりません');
    return;
  }

  // ファイル名を生成（履歴の日時を使用）
  const timestamp = new Date(item.timestamp);
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getDate()).padStart(2, '0');
  const hour = String(timestamp.getHours()).padStart(2, '0');
  const minute = String(timestamp.getMinutes()).padStart(2, '0');
  const second = String(timestamp.getSeconds()).padStart(2, '0');

  // 検索タイプと内容を含むファイル名
  let typeLabel = '';
  let inputSummary = '';

  switch(item.type) {
    case 'id':
      typeLabel = 'ID';
      inputSummary = item.inputs.postId;
      break;
    case 'user':
      typeLabel = 'ユーザー';
      inputSummary = item.inputs.username;
      break;
    case 'time':
      typeLabel = 'パブリック';
      inputSummary = item.inputs.timeInput || '現在時刻';
      break;
  }

  const filename = `mastodon_履歴_${typeLabel}_${year}${month}${day}_${hour}${minute}${second}.txt`;

  // txtファイルのコンテンツを生成（既存のdownloadPostsAsTxt関数と同じ形式）
  let content = `Mastodon検索結果 (履歴)\n`;
  content += `検索タイプ: ${typeLabel}\n`;
  content += `検索内容: ${inputSummary}\n`;
  content += `検索日時: ${timestamp.toLocaleString('ja-JP')}\n`;
  content += `投稿件数: ${item.posts.length}件\n`;
  content += `===========================================\n\n`;

  item.posts.forEach((post, index) => {
    const postInfo = getPostDisplayInfo(post);

    content += `--- 投稿 ${index + 1} ---\n`;
    content += `ID: ${post.id}\n`;

    if (postInfo.isBoost) {
      content += `ブースト者: ${postInfo.boosterUser} (${postInfo.boosterUsername})\n`;
      content += `ブースト日時: ${new Date(postInfo.boostTime).toLocaleString('ja-JP')}\n`;
      content += `元投稿者: ${postInfo.displayUser} (${postInfo.displayUsername})\n`;
      content += `元投稿日時: ${new Date(postInfo.displayTime).toLocaleString('ja-JP')}\n`;
    } else {
      content += `投稿者: ${postInfo.displayUser} (${postInfo.displayUsername})\n`;
      content += `投稿日時: ${new Date(postInfo.displayTime).toLocaleString('ja-JP')}\n`;
    }

    content += `URL: ${postInfo.displayUrl}\n`;
    content += `内容:\n${postInfo.displayContent}\n`;

    if (postInfo.mediaAttachments && postInfo.mediaAttachments.length > 0) {
      content += `添付ファイル: ${postInfo.mediaAttachments.map(m => `${m.type}(${m.url})`).join(', ')}\n`;
    }

    content += `\n`;
  });

  // ダウンロード実行
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 履歴表示と検索フォーム表示を切り替える関数（popup版）
function togglePopupHistoryView() {
  const historyBtn = document.getElementById('historyBtn');
  const mainContent = document.getElementById('main-content');
  const isShowingHistory = historyBtn.textContent === '戻る';

  if (isShowingHistory) {
    // 履歴表示中 → 検索フォームに戻る
    showPopupSearchForm();
    historyBtn.textContent = '履歴';
  } else {
    // 検索フォーム表示中 → 履歴表示
    showPopupHistoryInline();
    historyBtn.textContent = '戻る';
  }
}

// インライン履歴表示関数（popup版）
function showPopupHistoryInline() {
  const mainContent = document.getElementById('main-content');
  const history = getPopupSearchHistory();

  let historyHtml = '';

  if (history.length === 0) {
    historyHtml = '<div class="no-history">履歴がありません</div>';
  } else {
    historyHtml = '<div class="mastodon-history-inline-title">検索履歴</div>';
    historyHtml += history.map(item => {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString('ja-JP');

      let typeLabel = '';
      let inputSummary = '';

      switch(item.type) {
        case 'id':
          typeLabel = '投稿ID';
          inputSummary = `ID: ${item.inputs?.postId || 'N/A'}`;
          break;
        case 'user':
          typeLabel = 'ユーザー';
          inputSummary = `${item.inputs?.username || 'N/A'}`;
          if (item.inputs?.timeInput) {
            inputSummary += ` (${item.inputs.timeInput})`;
          }
          if (item.inputs?.searchMode === 'postCount') {
            inputSummary += ` [件数: ${item.inputs.postCount || 0}件]`;
          } else if (item.inputs?.timeRange) {
            inputSummary += ` [範囲: ${item.inputs.timeRange}]`;
          }
          break;
        case 'time':
          typeLabel = 'パブリック';
          inputSummary = `${item.inputs?.timeInput || '現在時刻'}`;
          if (item.inputs?.searchMode === 'postCount') {
            inputSummary += ` [件数: ${item.inputs.postCount || 0}件]`;
          } else if (item.inputs?.timeRange) {
            inputSummary += ` [範囲: ${item.inputs.timeRange}]`;
          }
          break;
      }

      return `
        <div class="mastodon-history-inline-item" data-history-id="${item.id}">
          <div class="mastodon-history-inline-header">
            <span class="mastodon-history-inline-type">[${typeLabel}]</span>
            <span class="mastodon-history-inline-time">${timeStr}</span>
          </div>
          <div class="mastodon-history-inline-summary">${(inputSummary || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</div>
          <div class="mastodon-history-inline-result">結果: ${item.resultCount}件</div>
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

  mainContent.innerHTML = historyHtml;

  // インライン履歴のイベントリスナーを設定
  setupPopupInlineHistoryListeners();
}

// 検索フォームを表示する関数（popup版）
function showPopupSearchForm() {
  const mainContent = document.getElementById('main-content');

  // 元の検索フォームを再構築
  mainContent.innerHTML = `
      <div class="input-type-selector">
        <label>入力方式:</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" name="inputType" value="time" checked>
            <span>パブリック</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="inputType" value="user">
            <span>ユーザー名</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="inputType" value="id">
            <span>投稿ID</span>
          </label>
        </div>
      </div>

      <div id="main-input" class="input-group">
        <label for="postIdOrTime">開始時刻:</label>
        <input type="text" id="postIdOrTime" placeholder="入力してください">
      </div>

      <div id="userInput" class="input-group" style="display: none;">
        <label for="usernameField">ユーザー名:</label>
        <input type="text" id="usernameField" placeholder="@keitan または @keitan@mastodon.social">
      </div>

      <div id="timeInput" class="input-group" style="display: none;">
        <label for="timeField">開始時刻:</label>
        <input type="text" id="timeField" placeholder="YYYY-M-D HH:MM:SS">
      </div>

      <div id="searchModeSelector" class="input-group" style="display: none;">
        <label>検索方式:</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" name="searchMode" value="timeRange" checked>
            <span>時間範囲</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="searchMode" value="postCount">
            <span>投稿件数</span>
          </label>
        </div>
      </div>

      <div id="timeRangeSelector" class="input-group">
        <label for="timeRange">時間:</label>
        <input type="text" id="timeRange" placeholder="HH:MM:SS" style="width: 120px;">
        <span>（開始時刻に追加）</span>
      </div>

      <div id="postCountSelector" class="input-group" style="display: none;">
        <label for="postCount">取得件数:</label>
        <input type="number" id="postCount" placeholder="200" min="-10000" max="10000" value="200" style="width: 80px;">
        <span>件（+未来,-過去,最大10000件）</span>
        <div id="searchTimeSelector" style="display: none; margin-top: 8px;">
          <label for="searchTime">検索時間:</label>
          <input type="text" id="searchTime" placeholder="24:00:00" value="24:00:00" style="width: 80px;">
          <span>（HH:MM:SS形式、since_idとmax_idの間隔）</span>
        </div>
      </div>

      <div id="generatedTimeDisplay" class="input-group">
        <label for="generatedTime">終了時刻:</label>
        <input type="text" id="generatedTime" placeholder="YYYY-M-D HH:MM:SS" style="width: 100%;">
      </div>

      <button id="fetchPost" class="fetch-btn">取得</button>

      <div id="result" class="result"></div>
  `;

  // 検索フォームのイベントリスナーを再設定
  setupPopupSearchFormListeners();
}

// インライン履歴のイベントリスナー設定（popup版）
function setupPopupInlineHistoryListeners() {
  // 復元ボタン
  document.querySelectorAll('.mastodon-history-inline-restore-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      restorePopupSearchFromInlineHistory(historyId);
    });
  });

  // 表示ボタン
  document.querySelectorAll('.mastodon-history-inline-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      viewPopupHistoryResultsInline(historyId);
    });
  });

  // 保存(.txt)ボタン
  document.querySelectorAll('.mastodon-history-inline-save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      savePopupHistoryAsTxt(historyId);
    });
  });

  // 削除ボタン
  document.querySelectorAll('.mastodon-history-inline-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const historyId = parseInt(e.target.dataset.historyId);
      deletePopupInlineHistoryItem(historyId);
    });
  });

  // すべてクリアボタン
  const clearBtn = document.getElementById('mastodon-history-inline-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearPopupInlineHistory);
  }
}

// 検索フォームのイベントリスナー再設定（popup版）
function setupPopupSearchFormListeners() {
  // ラジオボタンの変更イベント
  const radioButtons = document.querySelectorAll('input[name="inputType"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateInputUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-popup-inputType', this.value);
    });
  });

  // 検索方式の切り替えイベント
  const searchModeButtons = document.querySelectorAll('input[name="searchMode"]');
  searchModeButtons.forEach(radio => {
    radio.addEventListener('change', updateSearchModeUI);
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-popup-searchMode', this.value);
    });
  });

  // その他のイベントリスナーも再設定
  const mainInput = document.getElementById('postIdOrTime');
  const usernameField = document.getElementById('usernameField');
  const timeField = document.getElementById('timeField');
  const timeRange = document.getElementById('timeRange');

  if (mainInput) {
    mainInput.addEventListener('input', function() {
      const type = document.querySelector('input[name="inputType"]:checked').value;
      if (type === 'id') {
        localStorage.setItem('mastodon-postId', this.value);
      } else if (type === 'time') {
        localStorage.setItem('mastodon-timeRange', this.value);
        updateGeneratedTimeRange();
      }
    });
  }

  if (usernameField) {
    usernameField.addEventListener('input', function() {
      localStorage.setItem('mastodon-username', this.value);
    });
  }

  if (timeField) {
    timeField.addEventListener('input', function() {
      localStorage.setItem('mastodon-userTime', this.value);
      updateGeneratedTimeRange();
    });
  }

  if (timeRange) {
    timeRange.addEventListener('input', function() {
      localStorage.setItem('mastodon-timeRangeInput', this.value);
      updateGeneratedTimeRange();
    });
  }

  // 他のイベントリスナーも設定
  const postCountField = document.getElementById('postCount');
  const searchTimeField = document.getElementById('searchTime');
  const generatedTimeField = document.getElementById('generatedTime');
  const fetchBtn = document.getElementById('fetchPost');

  if (postCountField) {
    postCountField.addEventListener('input', function() {
      localStorage.setItem('mastodon-postCount', this.value);
      updateSearchTimeVisibility();
    });
  }

  if (searchTimeField) {
    searchTimeField.addEventListener('input', function() {
      localStorage.setItem('mastodon-searchTime', this.value);
    });
  }

  if (generatedTimeField) {
    generatedTimeField.addEventListener('input', updateTimeRangeFromEndTime);
  }

  if (fetchBtn) {
    fetchBtn.addEventListener('click', handleSearch);
  }

  // 設定を復元してUIを更新
  restorePopupFormSettings();
  updateInputUI();
  updateSearchModeUI();
}

// フォーム設定復元（popup版）
function restorePopupFormSettings() {
  // 前回の検索方式を復元
  const savedSearchMode = localStorage.getItem('mastodon-popup-searchMode');
  if (savedSearchMode) {
    const targetSearchMode = document.querySelector(`input[name="searchMode"][value="${savedSearchMode}"]`);
    if (targetSearchMode) {
      targetSearchMode.checked = true;
    }
  }

  // 前回の選択状態を復元
  const savedInputType = localStorage.getItem('mastodon-popup-inputType');
  if (savedInputType) {
    const targetRadio = document.querySelector(`input[name="inputType"][value="${savedInputType}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
    }
  }

  // 保存された値を復元
  const savedSearchTime = localStorage.getItem('mastodon-searchTime');
  if (savedSearchTime) {
    const searchTimeField = document.getElementById('searchTime');
    if (searchTimeField) searchTimeField.value = savedSearchTime;
  }

  const savedPostCount = localStorage.getItem('mastodon-postCount');
  if (savedPostCount) {
    const postCountField = document.getElementById('postCount');
    if (postCountField) postCountField.value = savedPostCount;
  }
}

// インライン履歴から復元（popup版）
function restorePopupSearchFromInlineHistory(historyId) {
  const history = getPopupSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item) return;

  // 検索フォームに戻る
  showPopupSearchForm();
  const historyBtn = document.getElementById('historyBtn');
  historyBtn.textContent = '履歴';

  // 復元処理を少し遅らせて、フォームが構築されてから実行
  setTimeout(() => {
    // 入力タイプを設定
    const typeRadio = document.querySelector(`input[name="inputType"][value="${item.type}"]`);
    if (typeRadio) {
      typeRadio.checked = true;
    }

    // 各入力フィールドを復元
    switch(item.type) {
      case 'id':
        const postIdField = document.getElementById('postIdOrTime');
        if (postIdField) postIdField.value = item.inputs?.postId || '';
        break;

      case 'user':
        const usernameField = document.getElementById('usernameField');
        const timeField = document.getElementById('timeField');
        if (usernameField) usernameField.value = item.inputs?.username || '';
        if (item.inputs?.timeInput && timeField) {
          timeField.value = item.inputs.timeInput;
        }

        // 検索モードを復元
        if (item.inputs?.searchMode) {
          const modeRadio = document.querySelector(`input[name="searchMode"][value="${item.inputs.searchMode}"]`);
          if (modeRadio) {
            modeRadio.checked = true;
          }

          if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
            const postCountField = document.getElementById('postCount');
            if (postCountField) postCountField.value = item.inputs.postCount;
          } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
            const timeRangeSelect = document.getElementById('timeRange');
            if (timeRangeSelect) timeRangeSelect.value = item.inputs.timeRange;
          }
        }
        break;

      case 'time':
        const timeInputField = document.getElementById('postIdOrTime');
        if (timeInputField) timeInputField.value = item.inputs?.timeInput || '';

        // 検索モードを復元
        if (item.inputs?.searchMode) {
          const modeRadio = document.querySelector(`input[name="searchMode"][value="${item.inputs.searchMode}"]`);
          if (modeRadio) {
            modeRadio.checked = true;
          }

          if (item.inputs.searchMode === 'postCount' && item.inputs.postCount) {
            const postCountField = document.getElementById('postCount');
            if (postCountField) postCountField.value = item.inputs.postCount;
          } else if (item.inputs.searchMode === 'timeRange' && item.inputs.timeRange) {
            const timeRangeSelect = document.getElementById('timeRange');
            if (timeRangeSelect) timeRangeSelect.value = item.inputs.timeRange;
          }
        }
        break;
    }

    // UIを更新
    updateInputUI();
    updateSearchModeUI();
    updateGeneratedTimeRange();
  }, 100);
}

// インライン履歴結果表示（popup版）
function viewPopupHistoryResultsInline(historyId) {
  const history = getPopupSearchHistory();
  const item = history.find(h => h.id === historyId);

  if (!item || !item.posts) return;

  // 検索フォームに戻る
  showPopupSearchForm();
  const historyBtn = document.getElementById('historyBtn');
  historyBtn.textContent = '履歴';

  // 少し遅らせて結果を表示
  setTimeout(() => {
    displayPosts(item.posts);
  }, 100);
}

// インライン履歴削除（popup版）
function deletePopupInlineHistoryItem(historyId) {
  if (confirm('この履歴を削除しますか？')) {
    let history = getPopupSearchHistory();
    history = history.filter(h => h.id !== historyId);
    localStorage.setItem('mastodon-popup-search-history', JSON.stringify(history));
    showPopupHistoryInline(); // 履歴表示を更新
  }
}

// インライン履歴すべてクリア（popup版）
function clearPopupInlineHistory() {
  if (confirm('すべての履歴を削除しますか？')) {
    localStorage.removeItem('mastodon-popup-search-history');
    showPopupHistoryInline(); // 履歴表示を更新
  }
}

console.log('Mastodon Post Viewer Extension loaded');
