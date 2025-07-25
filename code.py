import datetime

def mastodon_timestamp_from_id(snowflake_id: int) -> datetime.datetime:
    """
    Mastodon の Snowflake ID から作成日時を取得する。

    :param snowflake_id: Mastodon ステータス等の ID
    :return: UTC の datetime オブジェクト
    """
    # 下位 16 ビットを切り落とし、上位 48 ビット（ミリ秒）だけを取得
    timestamp_ms = snowflake_id >> 16
    # Unix エポックからのミリ秒を秒に変換して日時に
    return datetime.datetime.utcfromtimestamp(timestamp_ms / 1000.0)

# 例：ID = 114913763253121684
example_id = 114749937388199284
created_at_utc = mastodon_timestamp_from_id(example_id)
print("UTC:", created_at_utc)            # -> UTC: 2025-07-25 12:01:13.857000
print("JST:", created_at_utc + datetime.timedelta(hours=9))
#      -> JST: 2025-07-25 21:01:13.857000
