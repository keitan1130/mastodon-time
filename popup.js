// Mastodon Post Viewer Extension with Hour-based or Minute-based Time Range Search

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

  // ユーザーの投稿を取得
  async function fetchUserPosts(username, timeFilter = null) {
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

    // 2. そのユーザーの投稿を大量取得（ページング対応）
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

      // メディア添付の情報
      let mediaInfo = '';
      if (post.media_attachments && post.media_attachments.length > 0) {
        const mediaTypes = post.media_attachments.map(m => m.type).join(', ');
        mediaInfo = `<div class="mastodon-post-media">📎 添付: ${mediaTypes} (${post.media_attachments.length}件)</div>`;
      }

      return `<div class="mastodon-post-item" data-url="${post.url}" data-post-data='${JSON.stringify(post).replace(/'/g, "&apos;")}'>
        <div class="mastodon-post-header">
          <div class="mastodon-post-user-info">
            <strong>${escapeHtml(user)}</strong>
            <span class="mastodon-post-time-inline">${t}</span>
          </div>
        </div>
        <div class="mastodon-post-content">${escapeHtml(txt)}</div>
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
  }

  // --- 共通ユーティリティ ---
  function showError(msg) { resultDiv.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`; }
  function stripHtmlTags(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent||''; }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // プレビュー機能
  function showPostPreview(element, post) {
    // 既存のツールチップを削除
    hidePostPreview();

    const tooltip = document.createElement('div');
    tooltip.id = 'mastodon-post-tooltip';
    tooltip.className = 'mastodon-post-tooltip';

    const t = new Date(post.created_at).toLocaleString('ja-JP');
    const user = post.account.display_name || post.account.username;
    const username = `@${post.account.username}`;
    const statusesCount = post.account.statuses_count;
    const txt = stripHtmlTags(post.content) || '<em>テキストなし</em>';
    const reblogs = post.reblogs_count;
    const favourites = post.favourites_count;
    const replies = post.replies_count;

    // メディア添付の情報とプレビュー
    let mediaInfo = '';
    if (post.media_attachments && post.media_attachments.length > 0) {
      const mediaTypes = post.media_attachments.map(m => m.type).join(', ');
      mediaInfo = `<div class="mastodon-tooltip-media">📎 添付: ${mediaTypes} (${post.media_attachments.length}件)</div>`;

      // メディアプレビューを生成
      const mediaPreview = post.media_attachments.slice(0, 3).map(media => {
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

      if (post.media_attachments.length > 3) {
        mediaInfo += `<div class="mastodon-tooltip-media-more">他 ${post.media_attachments.length - 3} 件</div>`;
      }
    }

    // URLプレビューの情報
    let urlPreview = '';
    if (post.card && post.card.url && !post.media_attachments?.length) {
      const card = post.card;

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
    } else if (post.card && post.card.url) {
      // メディアがあってもURLカードがある場合は簡易表示
      urlPreview = `
        <div class="mastodon-tooltip-url-simple" data-url="${post.card.url}" style="cursor: pointer;">
          <div class="mastodon-tooltip-url-title">🔗 ${escapeHtml(post.card.title || 'リンク')}</div>
          <div class="mastodon-tooltip-url-link-only">${escapeHtml(post.card.url.length > 60 ? post.card.url.substring(0, 57) + '...' : post.card.url)}</div>
        </div>
      `;
    }

    // 投稿の詳細情報
    let visibility = '';
    switch(post.visibility) {
      case 'public': visibility = '🌐 公開'; break;
      case 'unlisted': visibility = '🔓 未収載'; break;
      case 'private': visibility = '🔒 フォロワー限定'; break;
      case 'direct': visibility = '✉️ ダイレクト'; break;
      default: visibility = post.visibility;
    }

    tooltip.innerHTML = `
      <div class="mastodon-tooltip-header">
        <div class="mastodon-tooltip-user-info">
          <img src="${post.account.avatar}" alt="アバター" class="mastodon-tooltip-avatar" loading="lazy">
          <div class="mastodon-tooltip-user-text">
            <div class="mastodon-tooltip-user">
              <strong class="mastodon-tooltip-username" style="cursor: pointer; text-decoration: underline; transition: color 0.2s ease;" data-profile-url="${post.account.url}">${escapeHtml(user)}</strong> ${escapeHtml(username)}
            </div>
            <div class="mastodon-tooltip-time">${t} | ID: ${post.id}</div>
          </div>
        </div>
      </div>
      <div class="mastodon-tooltip-content">
        ${escapeHtml(txt)}
      </div>
      ${mediaInfo}
      ${urlPreview}
      <div class="mastodon-tooltip-interactions">
        <span class="mastodon-tooltip-visibility">${visibility}</span>
        <span class="mastodon-tooltip-post-count">投稿数: ${statusesCount}</span>
        <button class="mastodon-tooltip-go-post" style="cursor: pointer; background: none; border: none; color: #fff; font-size: 13px; text-decoration: underline; padding: 0; margin-left: 5px; transition: color 0.2s ease;" data-post-url="${post.url}">移動</button>
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

    // ユーザー名のクリックイベントを追加
    const usernameElement = tooltip.querySelector('.mastodon-tooltip-username');
    if (usernameElement) {
      usernameElement.addEventListener('click', (e) => {
        e.stopPropagation();
        const profileUrl = usernameElement.getAttribute('data-profile-url');
        if (profileUrl) {
          chrome.tabs.create({ url: profileUrl });
        }
      });

      // ホバーエフェクトを追加
      usernameElement.addEventListener('mouseenter', () => {
        usernameElement.style.color = '#6364ff';
      });

      usernameElement.addEventListener('mouseleave', () => {
        usernameElement.style.color = '#fff';
      });
    }

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

console.log('Mastodon Post Viewer Extension loaded');
