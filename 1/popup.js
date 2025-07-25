document.addEventListener('DOMContentLoaded', function() {
  const postIdInput = document.getElementById('postId');
  const fetchButton = document.getElementById('fetchPost');
  const resultDiv = document.getElementById('result');

  fetchButton.addEventListener('click', async function() {
    const postId = postIdInput.value.trim();

    if (!postId) {
      showError('投稿IDを入力してください');
      return;
    }

    // ボタンを無効化してローディング状態にする
    fetchButton.disabled = true;
    fetchButton.textContent = '取得中...';
    resultDiv.innerHTML = '<div class="loading">投稿を取得しています...</div>';

    try {
      const post = await fetchMastodonPost(postId);
      displayPost(post);
    } catch (error) {
      showError(`エラーが発生しました: ${error.message}`);
    } finally {
      // ボタンを再度有効化
      fetchButton.disabled = false;
      fetchButton.textContent = '投稿を取得';
    }
  });

  // Enterキーでも投稿を取得
  postIdInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      fetchButton.click();
    }
  });

  async function fetchMastodonPost(postId) {
    const apiUrl = `https://mastodon.compositecomputer.club/api/v1/statuses/${postId}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Charset': 'utf-8',
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('指定されたIDの投稿が見つかりません');
      } else if (response.status === 403) {
        throw new Error('この投稿にアクセスする権限がありません');
      } else {
        throw new Error(`HTTPエラー: ${response.status}`);
      }
    }

    return await response.json();
  }

  function displayPost(post) {
    const createdAt = new Date(post.created_at).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const accountName = post.account.display_name || post.account.username;
    const accountHandle = `@${post.account.username}`;

    // HTMLタグを除去してテキストのみ表示
    const content = stripHtmlTags(post.content);
    const postUrl = post.url || `https://mastodon.compositecomputer.club/@${post.account.username}/${post.id}`;

    resultDiv.innerHTML = `
      <div class="post-content clickable-post" data-url="${postUrl}">
        <div class="post-meta">
          <strong>${escapeHtml(accountName)}</strong> ${escapeHtml(accountHandle)}
          <br>
          投稿日時: ${createdAt}
          <br>
          投稿ID: ${post.id}
        </div>
        <div class="post-text">
          ${escapeHtml(content) || '<em>テキストコンテンツがありません</em>'}
        </div>
        ${post.media_attachments && post.media_attachments.length > 0 ?
          `<div style="margin-top: 10px; font-size: 12px; color: #666;">
            メディア添付: ${post.media_attachments.length}件
          </div>` : ''
        }
        ${post.reblog ? '<div style="margin-top: 10px; font-size: 12px; color: #666;">この投稿はブーストです</div>' : ''}
        <div class="click-hint">クリックして投稿を開く</div>
      </div>
    `;

    // クリックイベントを追加
    const postElement = resultDiv.querySelector('.clickable-post');
    if (postElement) {
      postElement.addEventListener('click', function() {
        const url = this.getAttribute('data-url');
        chrome.tabs.create({ url: url });
      });
    }
  }

  function showError(message) {
    resultDiv.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
  }

  function stripHtmlTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});

console.log('Mastodon Post Viewer Extension loaded');
