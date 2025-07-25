// Mastodon Post Viewer Extension with Hour-based or Minute-based Time Range Search

document.addEventListener('DOMContentLoaded', function() {
  const inputField = document.getElementById('postIdOrTime');
  const fetchButton = document.getElementById('fetchPost');
  const resultDiv = document.getElementById('result');
  const radioButtons = document.querySelectorAll('input[name="inputType"]');

  // ラジオボタンの変更イベントで UI を更新
  radioButtons.forEach(radio => radio.addEventListener('change', updateInputUI));
  updateInputUI();

  function updateInputUI() {
    const type = document.querySelector('input[name="inputType"]:checked').value;
    const timeRangeSelector = document.getElementById('timeRangeSelector');

    if (type === 'id') {
      inputField.value = '114914440521507516';
      inputField.placeholder = '';
      if (timeRangeSelector) timeRangeSelector.style.display = 'none';
    } else {
      // 時刻を取得して実際の値として設定
      const now = new Date();
      now.setHours(now.getHours());
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      inputField.value = `${year}-${month}-${day} ${hour}`;
      inputField.placeholder = '';
      if (timeRangeSelector) timeRangeSelector.style.display = 'block';
    }
    resultDiv.innerHTML = '';
  }

  fetchButton.addEventListener('click', async function() {
    const raw = inputField.value.trim();
    if (!raw) return showError('入力欄を埋めてください');

    const type = document.querySelector('input[name="inputType"]:checked').value;
    resultDiv.innerHTML = '<div class="loading">取得中...</div>';

    try {
      if (type === 'id') {
        // 単一投稿取得
        if (!/^\d+$/.test(raw)) throw new Error('投稿IDは数字のみです');
        const post = await fetchMastodonPost(raw);
        displayPosts([post]);
      } else {
        // 時間範囲検索: 指定時刻から選択した時間分
        // "YYYY-MM-DD HH" 形式のみ
        let mHour = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})$/);
        if (!mHour) throw new Error('日時形式は YYYY-MM-DD HH です');

        const [Y,Mo,D] = mHour[1].split('-').map(Number);
        const hh = Number(mHour[2]);
        const timeRangeSelect = document.getElementById('timeRange');
        const rangeHours = timeRangeSelect ? Number(timeRangeSelect.value) : 1; // デフォルト1時間

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
    const maxRequests = 30; // 最大30回のリクエストで制限（安全のため）

    const keys = ["session_id", "mastodon_session", "x_csrf_token", "authorization"];
    const stored = await getStorageAsync(keys);

    while (requestCount < maxRequests) {
      const url = new URL('https://mastodon.compositecomputer.club/api/v1/timelines/home');
      url.searchParams.set('limit', '40');
      url.searchParams.set('max_id', max);
      url.searchParams.set('since_id', sinceId);

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

  // --- ID <-> JST 変換 ---
  function generateSnowflakeIdFromJst(dtJst) {
    // JSTの時刻をそのままUTCミリ秒として扱う（時差補正なし）
    const utcMs = dtJst.getTime();
    return (BigInt(utcMs) << 16n).toString();
  }

  // --- 表示 ---
  function displayPosts(posts) {
    if (!posts.length) {
      resultDiv.innerHTML = '<div>該当する投稿がありません</div>';
      return;
    }

    // 投稿数が多い場合は件数を表示
    const countText = posts.length > 10 ? `<div style="margin-bottom: 10px; font-weight: bold; color: #666;">取得件数: ${posts.length}件</div>` : '';

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
