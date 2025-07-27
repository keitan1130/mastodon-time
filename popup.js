// Mastodon Post Viewer Extension with Hour-based or Minute-based Time Range Search

document.addEventListener('DOMContentLoaded', function() {
  const inputField = document.getElementById('postIdOrTime');
  const usernameField = document.getElementById('usernameField');
  const timeField = document.getElementById('timeField');
  const fetchButton = document.getElementById('fetchPost');
  const resultDiv = document.getElementById('result');
  const radioButtons = document.querySelectorAll('input[name="inputType"]');

  // ラジオボタンの変更イベントで UI を更新
  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateInputUI);
    // ラジオボタンの変更時に選択状態を保存
    radio.addEventListener('change', function() {
      localStorage.setItem('mastodon-inputType', this.value);
    });
  });

  // 前回の選択状態を復元
  const savedInputType = localStorage.getItem('mastodon-inputType');
  if (savedInputType) {
    const targetRadio = document.querySelector(`input[name="inputType"][value="${savedInputType}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
    }
  }

  updateInputUI();

  // 入力値の変更を自動保存
  inputField.addEventListener('input', function() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    if (type === 'id') {
      localStorage.setItem('mastodon-postId', this.value);
    } else if (type === 'time') {
      localStorage.setItem('mastodon-timeRange', this.value);
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
    });
  }

  // 時間範囲セレクタの変更も保存
  const timeRangeSelect = document.getElementById('timeRange');
  if (timeRangeSelect) {
    timeRangeSelect.addEventListener('change', function() {
      localStorage.setItem('mastodon-hourRange', this.value);
    });
  }

  function updateInputUI() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    const timeRangeSelector = document.getElementById('timeRangeSelector');
    const userInput = document.getElementById('userInput');
    const timeInput = document.getElementById('timeInput');

    // すべての入力欄を非表示にする
    inputField.style.display = 'none';
    if (userInput) userInput.style.display = 'none';
    if (timeInput) timeInput.style.display = 'none';

    if (type === 'id') {
      inputField.style.display = 'block';
      // 前回の入力を復元、なければデフォルト値
      inputField.value = localStorage.getItem('mastodon-postId') || '114914719105992385';
      inputField.placeholder = '投稿ID';
      if (timeRangeSelector) timeRangeSelector.style.display = 'none';
    } else if (type === 'user') {
      if (userInput) userInput.style.display = 'block';
      if (timeInput) timeInput.style.display = 'block';

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

      if (timeRangeSelector) timeRangeSelector.style.display = 'block';
    } else {
      // 時間範囲検索
      inputField.style.display = 'block';
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
      inputField.placeholder = 'YYYY-MM-DD HH';
      if (timeRangeSelector) timeRangeSelector.style.display = 'block';
    }

    // 時間範囲セレクタの値も復元
    const timeRangeSelect = document.getElementById('timeRange');
    if (timeRangeSelect) {
      const savedRange = localStorage.getItem('mastodon-hourRange');
      if (savedRange) {
        timeRangeSelect.value = savedRange;
      }
    }

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
      } else if (type === 'user') {
        // ユーザー名検索（分離された入力欄使用）
        const username = usernameField.value.trim();
        const timeInput = timeField.value.trim();

        if (!username) return showError('ユーザー名を入力してください');

        // ユーザー名の正規化（@マークを除去）
        const cleanUsername = username.replace(/^@/, '');
        if (!/^[\w\-\.]+$/.test(cleanUsername)) {
          throw new Error('ユーザー名は英数字、ハイフン、ドットのみ使用可能です');
        }

        let timeFilter = null;
        if (timeInput) {
          // 時間が指定されている場合
          const timeMatch = timeInput.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})$/);
          if (!timeMatch) throw new Error('時間は YYYY-MM-DD HH の形式で入力してください');

          const [Y, Mo, D] = timeMatch[1].split('-').map(Number);
          const hh = Number(timeMatch[2]);
          const timeRangeSelect = document.getElementById('timeRange');
          const rangeHours = timeRangeSelect ? Number(timeRangeSelect.value) : 1;

          const startJst = new Date(Y, Mo-1, D, hh, 0, 0, 0);
          const endJst = new Date(Y, Mo-1, D, hh + rangeHours, 0, 0, 0);
          timeFilter = { start: startJst, end: endJst };
        }

        const posts = await fetchUserPosts(cleanUsername, timeFilter);
        displayPosts(posts);
      } else {
        // 時間範囲検索
        const raw = inputField.value.trim();
        if (!raw) return showError('時間を入力してください');

        // "YYYY-MM-DD HH" 形式のみ
        const timeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})$/);
        if (!timeMatch) throw new Error('日時形式は YYYY-MM-DD HH です');

        const [Y, Mo, D] = timeMatch[1].split('-').map(Number);
        const hh = Number(timeMatch[2]);
        const timeRangeSelect = document.getElementById('timeRange');
        const rangeHours = timeRangeSelect ? Number(timeRangeSelect.value) : 1;

        // 範囲設定: 指定時間から選択した時間数後まで
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
  });

  // --- Mastodon API 呼び出し ---
  async function fetchMastodonPost(id) {
    const res = await fetch(`https://mastodon.compositecomputer.club/api/v1/statuses/${id}`);
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
    const maxRequests = 1000;

    const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
    const stored = await getStorageAsync(keys);

    while (requestCount < maxRequests) {
      const url = new URL('https://mastodon.compositecomputer.club/api/v1/timelines/public');
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

  // ユーザーの投稿を取得
  async function fetchUserPosts(username, timeFilter = null) {
    const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
    const stored = await getStorageAsync(keys);

    // 1. ユーザーアカウント情報を取得
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

    // 2. そのユーザーの投稿を大量取得（ページング対応）
    let all = [];
    let maxId = null;
    let requestCount = 0;
    const maxRequests = 1000; // 最大1000回のリクエストで制限）

    while (requestCount < maxRequests) {
      const statusesUrl = new URL(`https://mastodon.compositecomputer.club/api/v1/accounts/${account.id}/statuses`);
      statusesUrl.searchParams.set('limit', '40');

      if (maxId) {
        statusesUrl.searchParams.set('max_id', maxId);
      }

      if (timeFilter) {
        // 時間フィルタがある場合、Snowflake IDで範囲指定
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
      if (!batch.length) break; // もう取得する投稿がない

      // 時間フィルタがある場合、厳密に時間でフィルタリング
      let filteredBatch = batch;
      if (timeFilter) {
        filteredBatch = batch.filter(post => {
          const postTime = new Date(post.created_at);
          return postTime >= timeFilter.start && postTime <= timeFilter.end;
        });

        // 時間範囲外の投稿が見つかったら、それ以降は不要なので終了
        if (filteredBatch.length < batch.length) {
          all = all.concat(filteredBatch);
          break;
        }
      }

      all = all.concat(filteredBatch);
      requestCount++;

      // 進捗を表示（多くの投稿がある場合）
      if (all.length > 10) {
        document.getElementById('result').innerHTML =
          `<div class="loading">取得中... ${all.length}件取得済み</div>`;
      }

      // 次のページ取得用に max_id を更新（最後の投稿ID - 1）
      maxId = (BigInt(batch[batch.length-1].id) - 1n).toString();

      // 取得件数が40件未満なら最後のページ
      if (batch.length < 40) break;

      // 時間フィルタなしで十分な件数取得したら終了
      if (!timeFilter && all.length >= 200) break;
    }

    return all;
  }

  // --- ID <-> JST 変換 ---
  function generateSnowflakeIdFromJst(dtJst) {
    // JSTの時刻をそのままUTCミリ秒として扱う（時差補正なし）
    const utcMs = dtJst.getTime();
    return (BigInt(utcMs) << 16n).toString();
  }

  // --- 表示 ---
  function displayPosts(posts) {
    if (!posts.length) {
      resultDiv.innerHTML = '<div class="no-results">該当する投稿がありません</div>';
      return;
    }

    // 常に取得件数を表示
    const countText = `<div class="count">取得件数: ${posts.length}件</div>`;

    resultDiv.innerHTML = countText + posts.map(post => {
      const t = new Date(post.created_at).toLocaleString('ja-JP');
      const user = post.account.display_name || post.account.username;
      const h = `@${post.account.username}`;
      const txt = stripHtmlTags(post.content) || '<em>テキストなし</em>';

      return `<div class="post-item" data-url="${post.url}">
        <div><strong>${escapeHtml(user)}</strong> ${escapeHtml(h)}</div>
        <div style="font-size: 11px; color: #888;">${t} ID:${post.id}</div>
        <div>${escapeHtml(txt)}</div>
      </div>`;
    }).join('');

    document.querySelectorAll('.post-item').forEach(el => {
      el.addEventListener('click', () => chrome.tabs.create({ url: el.dataset.url }));
    });
  }

  // --- 共通ユーティリティ ---
  function showError(msg) { resultDiv.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`; }
  function stripHtmlTags(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent||''; }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
});

console.log('Mastodon Post Viewer Extension loaded');
