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
    inputField.value = '';
    if (type === 'id') {
      inputField.placeholder = '例: 114913703535102955';
    } else {
      inputField.placeholder = '例: 2025-07-10 10';
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
        // 時間範囲検索: 指定時刻の1時間
        // "YYYY-MM-DD HH" 形式のみ
        let mHour = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})$/);
        if (!mHour) throw new Error('日時形式は YYYY-MM-DD HH です');

        const [Y,Mo,D] = mHour[1].split('-').map(Number);
        const hh = Number(mHour[2]);

        // 範囲設定: 指定時間から1時間後まで
        const startJst = new Date(Y, Mo-1, D, hh, 0, 0, 0);
        const endJst = new Date(Y, Mo-1, D, hh + 1, 0, 0, 0);

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

  // 日時レンジ内の公開タイムラインを取得
  async function fetchPublicTimelineInRange(sinceId, maxId) {
    let all = [];
    let max = maxId;
    while (true) {
      const url = new URL('https://mastodon.compositecomputer.club/api/v1/timelines/public');
      url.searchParams.set('limit', '40');
      url.searchParams.set('max_id', max);
      url.searchParams.set('since_id', sinceId);
      const res = await fetch(url);
      if (!res.ok) throw new Error('タイムライン取得エラー');
      const batch = await res.json();
      if (!batch.length) break;
      all = all.concat(batch);
      max = (BigInt(batch[batch.length-1].id) - 1n).toString();
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
    resultDiv.innerHTML = posts.map(post => {
      const t = new Date(post.created_at).toLocaleString('ja-JP');
      const user = post.account.display_name || post.account.username;
      const h = `@${post.account.username}`;
      const txt = stripHtmlTags(post.content);
      return `<div class="post-item" data-url="${post.url}">
        <div><strong>${escapeHtml(user)}</strong> ${escapeHtml(h)}</div>
        <div>${t} ID:${post.id}</div>
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
